/**
 * Subscription Active World Selection Tests
 *
 * Purpose:
 * - Verify active runtime-world selection prefers the runtime bound to a target chat.
 *
 * Key Features:
 * - Covers preferred chat matching via runtime chat-map membership only.
 * - Verifies no implicit selection by `currentChatId`.
 *
 * Implementation Notes:
 * - Uses `startWorld` to register multiple in-memory runtime worlds with the same world ID.
 * - Avoids storage/network dependencies; worlds are EventEmitter-backed in-memory objects.
 *
 * Recent Changes:
 * - 2026-03-04: Updated coverage to keep runtime selection independent of `currentChatId`.
 */

import { EventEmitter } from 'events';
import { afterEach, describe, expect, it } from 'vitest';
import type { World } from '../../core/types.js';
import { startWorld, getActiveSubscribedWorld } from '../../core/subscription.js';

function createWorldRuntime(
  id: string,
  currentChatId: string,
  chatIds: string[],
): World {
  return {
    id,
    name: `World ${id}`,
    eventEmitter: new EventEmitter(),
    agents: new Map(),
    chats: new Map(chatIds.map((chatId) => [chatId, { id: chatId, name: chatId, messageCount: 0 }])),
    currentChatId,
    turnLimit: 5,
    isProcessing: false,
    totalAgents: 0,
    totalMessages: 0,
    createdAt: new Date(),
    lastUpdated: new Date(),
  } as World;
}

describe('getActiveSubscribedWorld preferred chat selection', () => {
  const activeSubscriptions: Array<{ unsubscribe: () => Promise<void> }> = [];

  afterEach(async () => {
    while (activeSubscriptions.length > 0) {
      const subscription = activeSubscriptions.pop();
      if (subscription) {
        await subscription.unsubscribe();
      }
    }
  });

  it('returns the runtime whose chat map contains the preferred chat', async () => {
    const worldA = createWorldRuntime('world-shared', 'chat-a', ['chat-a']);
    const worldB = createWorldRuntime('world-shared', 'chat-z', ['chat-b']);

    const subscriptionA = await startWorld(worldA, { isOpen: true });
    const subscriptionB = await startWorld(worldB, { isOpen: true });
    activeSubscriptions.push(subscriptionA, subscriptionB);

    const selected = getActiveSubscribedWorld('world-shared', 'chat-b');
    expect(selected).toBe(worldB);
  });

  it('does not select by currentChatId when chat membership is absent', async () => {
    const worldA = createWorldRuntime('world-shared', 'chat-a', ['chat-a']);
    const worldB = createWorldRuntime('world-shared', 'chat-target', ['chat-b']);

    const subscriptionA = await startWorld(worldA, { isOpen: true });
    const subscriptionB = await startWorld(worldB, { isOpen: true });
    activeSubscriptions.push(subscriptionA, subscriptionB);

    const selected = getActiveSubscribedWorld('world-shared', 'chat-target');
    expect(selected).toBe(worldA);
    expect(worldB.currentChatId).toBe('chat-target');
    expect(worldB.chats.has('chat-target')).toBe(false);
  });
});
