import { World } from './types.js';
import { createCategoryLogger } from './logger.js';
import { getLLMQueueStatus } from './llm-manager.js';
import { nanoid } from 'nanoid';

type ActivityState = {
  pendingOperations: number;
  lastActivityId: number;
  activeSources: Map<string, number>;
};

export type WorldActivityEventType = 'response-start' | 'response-end' | 'idle';

export interface WorldActivityEventPayload {
  type: WorldActivityEventType;
  pendingOperations: number;
  activityId: number;
  timestamp: string;
  source?: string;
  activeSources: string[];
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
    activeSources: new Map<string, number>()
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
  const payload: WorldActivityEventPayload = {
    type,
    pendingOperations,
    activityId,
    timestamp: new Date().toISOString(),
    source,
    activeSources: Array.from(getActivityState(world).activeSources.keys()),
    queue: getLLMQueueStatus(),
    messageId: nanoid(10) // Generate unique ID for event persistence
  };

  // Set isProcessing flag: true for response-start/response-end, false only on idle
  world.isProcessing = type !== 'idle';

  // Dual emission pattern: generic 'world' channel + type-specific channel
  world.eventEmitter.emit('world', payload);
  world.eventEmitter.emit(type, payload);
}

export function beginWorldActivity(world: World, source?: string): () => void {
  const activityState = getActivityState(world);
  activityState.pendingOperations += 1;

  if (source) {
    activityState.activeSources.set(source, (activityState.activeSources.get(source) ?? 0) + 1);
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

    // Emit idle when all operations complete, otherwise response-end
    if (state.pendingOperations === 0) {
      emitActivityEvent(world, 'idle', 0, currentActivityId, source);
    } else {
      emitActivityEvent(world, 'response-end', state.pendingOperations, state.lastActivityId, source);
    }
  };
}

export async function trackWorldActivity<T>(
  world: World,
  operation: () => Promise<T>,
  source?: string
): Promise<T> {
  const end = beginWorldActivity(world, source);
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
