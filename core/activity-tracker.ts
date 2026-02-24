import { World } from './types.js';
import { createCategoryLogger } from './logger.js';
import { getLLMQueueStatus } from './llm-manager.js';
import { nanoid } from 'nanoid';

type ActivityState = {
  pendingOperations: number;
  lastActivityId: number;
  activeSources: Map<string, number>;
  activeChatOps: Map<string, number>; // chatId → active operation count
};

export type WorldActivityEventType = 'response-start' | 'response-end' | 'idle';

export interface WorldActivityEventPayload {
  type: WorldActivityEventType;
  pendingOperations: number;
  activityId: number;
  timestamp: string;
  source?: string;
  activeSources: string[];
  activeChatIds: string[]; // Chat IDs currently being processed
  queue: ReturnType<typeof getLLMQueueStatus>;
  messageId: string; // Added for event persistence
}

const logger = createCategoryLogger('world.activity');
const stateKey: unique symbol = Symbol('worldActivityState');

function getActivityState(world: World): ActivityState {
  const existing = (world as any)[stateKey] as ActivityState | undefined;
  if (existing) {
    return existing;
  }

  const initial: ActivityState = {
    pendingOperations: 0,
    lastActivityId: 0,
    activeSources: new Map<string, number>(),
    activeChatOps: new Map<string, number>()
  };
  (world as any)[stateKey] = initial;
  return initial;
}

function emitActivityEvent(
  world: World,
  type: WorldActivityEventType,
  pendingOperations: number,
  activityId: number,
  source?: string
): void {
  const activityState = getActivityState(world);
  const payload: WorldActivityEventPayload = {
    type,
    pendingOperations,
    activityId,
    timestamp: new Date().toISOString(),
    source,
    activeSources: Array.from(activityState.activeSources.keys()),
    activeChatIds: Array.from(activityState.activeChatOps.keys()),
    queue: getLLMQueueStatus(),
    messageId: nanoid(10) // Generate unique ID for event persistence
  };

  // Set isProcessing flag: true for response-start/response-end, false only on idle
  world.isProcessing = type !== 'idle';

  // Dual emission pattern: generic 'world' channel + type-specific channel
  world.eventEmitter.emit('world', payload);
  world.eventEmitter.emit(type, payload);
}

export function beginWorldActivity(world: World, source?: string, chatId?: string): () => void {
  const activityState = getActivityState(world);
  activityState.pendingOperations += 1;

  if (source) {
    activityState.activeSources.set(source, (activityState.activeSources.get(source) ?? 0) + 1);
  }

  // Track chat-level operation counts for parallel-chat visibility
  if (chatId) {
    activityState.activeChatOps.set(chatId, (activityState.activeChatOps.get(chatId) ?? 0) + 1);
  }

  // Increment activityId when starting first operation
  if (activityState.pendingOperations === 1) {
    activityState.lastActivityId += 1;
  }

  // Emit response-start for all operation starts
  emitActivityEvent(world, 'response-start', activityState.pendingOperations, activityState.lastActivityId, source);

  let finished = false;
  const currentActivityId = activityState.lastActivityId;

  return () => {
    if (finished) return;
    finished = true;

    const state = getActivityState(world);
    state.pendingOperations = Math.max(0, state.pendingOperations - 1);

    if (source) {
      const currentCount = state.activeSources.get(source) ?? 0;
      if (currentCount <= 1) {
        state.activeSources.delete(source);
      } else {
        state.activeSources.set(source, currentCount - 1);
      }
    }

    // Decrement chat-level operation count
    if (chatId) {
      const chatCount = state.activeChatOps.get(chatId) ?? 0;
      if (chatCount <= 1) {
        state.activeChatOps.delete(chatId);
      } else {
        state.activeChatOps.set(chatId, chatCount - 1);
      }
    }

    // Emit idle when all operations complete, otherwise response-end
    if (state.pendingOperations === 0) {
      emitActivityEvent(world, 'idle', 0, currentActivityId, source);
    } else {
      emitActivityEvent(world, 'response-end', state.pendingOperations, state.lastActivityId, source);
    }
  };
}

/**
 * Returns the set of chatIds currently being actively processed in this world.
 * Useful for parallel-chat monitoring and targeted mutation guards.
 */
export function getActiveProcessingChatIds(world: World): ReadonlySet<string> {
  const state = (world as any)[stateKey] as ActivityState | undefined;
  if (!state) return new Set<string>();
  return new Set(state.activeChatOps.keys());
}

/**
 * Returns true if the given chatId has at least one active processing operation.
 */
export function isChatProcessing(world: World, chatId: string): boolean {
  const state = (world as any)[stateKey] as ActivityState | undefined;
  if (!state) return false;
  return (state.activeChatOps.get(chatId) ?? 0) > 0;
}

export async function trackWorldActivity<T>(
  world: World,
  operation: () => Promise<T>,
  source?: string,
  chatId?: string
): Promise<T> {
  const end = beginWorldActivity(world, source, chatId);
  try {
    return await operation();
  } catch (error) {
    logger.error('World activity operation failed', {
      worldId: world.id,
      source,
      error: error instanceof Error ? error.message : error
    });
    throw error;
  } finally {
    end();
  }
}
