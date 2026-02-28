/**
 * Subscription Refresh Title Listener Tests
 *
 * Features:
 * - Verifies world-level message subscription is restored after runtime refresh.
 * - Protects chat-title scheduling behavior that depends on `subscribeWorldToMessages`.
 *
 * Implementation Notes:
 * - Mocks `getWorld` to return a deterministic refreshed runtime instance.
 * - Uses in-memory EventEmitter worlds with zero agents for narrow listener assertions.
 *
 * Recent Changes:
 * - 2026-02-28: Added regression coverage for refresh-time rebind of world message subscriptions.
 */

import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { World } from '../../core/types.js';

const managerMocks = vi.hoisted(() => ({
  getWorld: vi.fn(),
}));

vi.mock('../../core/managers.js', () => ({
  getWorld: managerMocks.getWorld,
}));

import { startWorld } from '../../core/subscription.js';

function createRuntimeWorld(id: string): World {
  return {
    id,
    name: `World ${id}`,
    eventEmitter: new EventEmitter(),
    agents: new Map(),
    chats: new Map(),
    currentChatId: 'chat-1',
    turnLimit: 5,
    isProcessing: false,
    totalAgents: 0,
    totalMessages: 0,
    createdAt: new Date(),
    lastUpdated: new Date(),
  } as World;
}

describe('startWorld refresh world message subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-subscribes world message listener after refresh', async () => {
    const initialWorld = createRuntimeWorld('world-1');
    const refreshedWorld = createRuntimeWorld('world-1');
    managerMocks.getWorld.mockResolvedValueOnce(refreshedWorld);

    const subscription = await startWorld(initialWorld, { isOpen: true });

    expect(initialWorld.eventEmitter.listenerCount('message')).toBe(1);

    await subscription.refresh();

    expect(refreshedWorld.eventEmitter.listenerCount('message')).toBe(1);

    await subscription.unsubscribe();
  });
});
