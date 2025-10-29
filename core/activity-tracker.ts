import { World } from './types.js';
import { createCategoryLogger } from './logger.js';
import { getLLMQueueStatus } from './llm-manager.js';

type ActivityState = {
  pendingOperations: number;
  lastActivityId: number;
  activeSources: Map<string, number>;
};

export type WorldActivityEventState = 'processing' | 'idle';

export interface WorldActivityEventPayload {
  state: WorldActivityEventState;
  pendingOperations: number;
  activityId: number;
  timestamp: string;
  source?: string;
  change?: 'start' | 'end';
  activeSources: string[];
  queue: ReturnType<typeof getLLMQueueStatus>;
}

const logger = createCategoryLogger('core.activity');
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
  state: WorldActivityEventState,
  pendingOperations: number,
  activityId: number,
  source?: string,
  change?: 'start' | 'end'
): void {
  const payload: WorldActivityEventPayload = {
    state,
    pendingOperations,
    activityId,
    timestamp: new Date().toISOString(),
    source,
    change,
    activeSources: Array.from(getActivityState(world).activeSources.keys()),
    queue: getLLMQueueStatus()
  };

  world.isProcessing = state === 'processing';
  world.eventEmitter.emit('world-activity', payload);
  world.eventEmitter.emit(state, payload);
}

export function beginWorldActivity(world: World, source?: string): () => void {
  const activityState = getActivityState(world);
  activityState.pendingOperations += 1;

  if (source) {
    activityState.activeSources.set(source, (activityState.activeSources.get(source) ?? 0) + 1);
  }

  if (activityState.pendingOperations === 1) {
    activityState.lastActivityId += 1;
    emitActivityEvent(world, 'processing', activityState.pendingOperations, activityState.lastActivityId, source, 'start');
  } else {
    emitActivityEvent(world, 'processing', activityState.pendingOperations, activityState.lastActivityId, source, 'start');
  }

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

    if (state.pendingOperations === 0) {
      emitActivityEvent(world, 'idle', 0, currentActivityId, source, 'end');
    } else {
      emitActivityEvent(world, 'processing', state.pendingOperations, state.lastActivityId, source, 'end');
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
