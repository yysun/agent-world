/**
 * Subscription + World Registry Integration Tests
 *
 * Ensures subscribeWorld reuses the same runtime and only tears down the base
 * runtime after the final subscriber releases it.
 */

import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { World } from '../../core/types.js';
import { stopAllWorldRuntimes } from '../../core/world-registry.js';

const managerMocks = vi.hoisted(() => ({
  getWorld: vi.fn(),
  recoverQueueSendingMessages: vi.fn(async () => 0),
  resumeChatQueue: vi.fn(async () => undefined),
}));

vi.mock('../../core/managers.js', () => ({
  getWorld: managerMocks.getWorld,
  recoverQueueSendingMessages: managerMocks.recoverQueueSendingMessages,
  resumeChatQueue: managerMocks.resumeChatQueue,
}));

import { subscribeWorld } from '../../core/subscription.js';

function makeWorld(id = 'test-world'): World {
  return {
    id,
    name: id,
    eventEmitter: new EventEmitter(),
    agents: new Map(),
    chats: new Map(),
    currentChatId: 'chat-1',
  } as unknown as World;
}

describe('subscribeWorld runtime reuse via registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await stopAllWorldRuntimes();
  });

  it('reuses one base runtime across two subscribers and stops on last unsubscribe', async () => {
    const world = makeWorld('shared-world');
    managerMocks.getWorld.mockResolvedValue(world);

    const first = await subscribeWorld('shared-world', { isOpen: true });
    const second = await subscribeWorld('shared-world', { isOpen: true });

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(managerMocks.getWorld).toHaveBeenCalledTimes(1);
    expect(managerMocks.recoverQueueSendingMessages).toHaveBeenCalledTimes(1);
    expect(managerMocks.resumeChatQueue).toHaveBeenCalledTimes(1);
    expect(world.eventEmitter.listenerCount('message')).toBe(1);

    await first!.unsubscribe();
    expect(world.eventEmitter.listenerCount('message')).toBe(1);

    await second!.unsubscribe();
    expect(world.eventEmitter.listenerCount('message')).toBe(0);
  });
});
