/**
 * Unit Tests for Main Realtime Events Runtime
 *
 * Features:
 * - Verifies race-safe chat subscription updates for identical subscription IDs.
 * - Verifies reset cleanup does not remove newly created subscriptions.
 * - Verifies renderer event forwarding remains scoped to the latest subscription state.
 *
 * Implementation Notes:
 * - Uses in-memory event emitters and dependency-injected runtime collaborators.
 * - Avoids Electron runtime and filesystem dependencies.
 *
 * Recent Changes:
 * - 2026-02-13: Updated system-event forwarding coverage to structured payload content.
 * - 2026-02-13: Added system-event forwarding coverage for chat title update notifications.
 * - 2026-02-13: Enforced strict non-reuse coverage across runtime resets.
 * - 2026-02-13: Added regression to ensure reused subscription IDs fail before world subscription side effects.
 * - 2026-02-13: Updated reuse behavior coverage to assert explicit errors for duplicate subscription IDs.
 * - 2026-02-13: Added reset metadata cleanup coverage for subscription-version tracking.
 * - 2026-02-13: Added coverage for non-reusable subscription IDs after explicit unsubscribe.
 * - 2026-02-13: Added regression coverage for stale subscribe races and in-flight reset isolation.
 */

import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createRealtimeEventsRuntime } from '../../../electron/main-process/realtime-events';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function createWorldSubscription(unsubscribePromise?: Promise<void>) {
  const eventEmitter = new EventEmitter();
  return {
    world: {
      eventEmitter
    },
    unsubscribe: vi.fn(async () => {
      if (unsubscribePromise) {
        await unsubscribePromise;
      }
    }),
    refresh: vi.fn(async () => {})
  };
}

describe('createRealtimeEventsRuntime', () => {
  it('keeps only the latest subscription when concurrent subscribe calls race', async () => {
    const send = vi.fn();
    const worldADeferred = createDeferred<ReturnType<typeof createWorldSubscription>>();
    const worldA = createWorldSubscription();
    const worldB = createWorldSubscription();

    const subscribeWorld = vi.fn(async (worldId: string) => {
      if (worldId === 'world-a') {
        return await worldADeferred.promise;
      }
      if (worldId === 'world-b') {
        return worldB;
      }
      return null;
    });

    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => {},
      subscribeWorld,
      ensureCoreReady: async () => {}
    });

    const firstSubscribe = runtime.subscribeChatEvents({
      subscriptionId: 'sub-1',
      worldId: 'world-a',
      chatId: 'chat-1'
    });

    await Promise.resolve();

    const secondResult = await runtime.subscribeChatEvents({
      subscriptionId: 'sub-1',
      worldId: 'world-b',
      chatId: 'chat-1'
    });

    worldADeferred.resolve(worldA);
    const firstResult = await firstSubscribe;

    worldA.world.eventEmitter.emit('message', {
      messageId: 'm-a',
      sender: 'assistant',
      content: 'from-a',
      chatId: 'chat-1',
      timestamp: new Date('2026-02-13T00:00:00.000Z')
    });
    worldB.world.eventEmitter.emit('message', {
      messageId: 'm-b',
      sender: 'assistant',
      content: 'from-b',
      chatId: 'chat-1',
      timestamp: new Date('2026-02-13T00:00:01.000Z')
    });

    expect(firstResult).toMatchObject({
      subscribed: false,
      stale: true,
      subscriptionId: 'sub-1',
      worldId: 'world-a'
    });
    expect(secondResult).toMatchObject({
      subscribed: true,
      subscriptionId: 'sub-1',
      worldId: 'world-b'
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      'chat:event',
      expect.objectContaining({
        type: 'message',
        subscriptionId: 'sub-1',
        worldId: 'world-b'
      })
    );
  });

  it('does not clear newly subscribed listeners while reset is still unsubscribing older worlds', async () => {
    const send = vi.fn();
    const unsubscribeOldDeferred = createDeferred<void>();
    const oldWorldSubscription = createWorldSubscription(unsubscribeOldDeferred.promise);
    const newWorldSubscription = createWorldSubscription();
    let subscribeCallCount = 0;

    const subscribeWorld = vi.fn(async () => {
      subscribeCallCount += 1;
      return subscribeCallCount === 1 ? oldWorldSubscription : newWorldSubscription;
    });

    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => {},
      subscribeWorld,
      ensureCoreReady: async () => {}
    });

    await runtime.subscribeChatEvents({
      subscriptionId: 'sub-old',
      worldId: 'world-1',
      chatId: 'chat-old'
    });

    const pendingReset = runtime.resetRuntimeSubscriptions();
    await Promise.resolve();

    await runtime.subscribeChatEvents({
      subscriptionId: 'sub-new',
      worldId: 'world-1',
      chatId: 'chat-new'
    });

    unsubscribeOldDeferred.resolve();
    await pendingReset;

    oldWorldSubscription.world.eventEmitter.emit('message', {
      messageId: 'm-old',
      sender: 'assistant',
      content: 'from-old',
      chatId: 'chat-new',
      timestamp: new Date('2026-02-13T00:00:02.000Z')
    });
    newWorldSubscription.world.eventEmitter.emit('message', {
      messageId: 'm-new',
      sender: 'assistant',
      content: 'from-new',
      chatId: 'chat-new',
      timestamp: new Date('2026-02-13T00:00:03.000Z')
    });

    expect(oldWorldSubscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscribeWorld).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      'chat:event',
      expect.objectContaining({
        type: 'message',
        subscriptionId: 'sub-new',
        worldId: 'world-1'
      })
    );
  });

  it('throws when reusing a subscriptionId after it has been unsubscribed', async () => {
    const subscribeWorld = vi.fn(async () => createWorldSubscription());
    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send: vi.fn() }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => {},
      subscribeWorld,
      ensureCoreReady: async () => {}
    });

    const firstResult = await runtime.subscribeChatEvents({
      subscriptionId: 'sub-reused',
      worldId: 'world-1',
      chatId: 'chat-1'
    });
    const unsubscribeResult = runtime.unsubscribeChatEvents({ subscriptionId: 'sub-reused' });
    const secondSubscribe = runtime.subscribeChatEvents({
      subscriptionId: 'sub-reused',
      worldId: 'world-1',
      chatId: 'chat-1'
    });

    expect(firstResult).toMatchObject({
      subscribed: true,
      subscriptionId: 'sub-reused'
    });
    expect(unsubscribeResult).toMatchObject({
      unsubscribed: true,
      subscriptionId: 'sub-reused'
    });
    await expect(secondSubscribe).rejects.toThrow(
      "Subscription ID 'sub-reused' cannot be reused after unsubscribe."
    );
    expect(subscribeWorld).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe to a new world when a reused subscriptionId is rejected', async () => {
    const subscribeWorld = vi.fn(async () => createWorldSubscription());
    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send: vi.fn() }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => {},
      subscribeWorld,
      ensureCoreReady: async () => {}
    });

    await runtime.subscribeChatEvents({
      subscriptionId: 'sub-reused-world',
      worldId: 'world-1',
      chatId: 'chat-1'
    });
    runtime.unsubscribeChatEvents({ subscriptionId: 'sub-reused-world' });

    await expect(
      runtime.subscribeChatEvents({
        subscriptionId: 'sub-reused-world',
        worldId: 'world-2',
        chatId: 'chat-2'
      })
    ).rejects.toThrow("Subscription ID 'sub-reused-world' cannot be reused after unsubscribe.");

    expect(subscribeWorld).toHaveBeenCalledTimes(1);
    expect(subscribeWorld).toHaveBeenCalledWith('world-1', { isOpen: true });
  });

  it('keeps reused subscriptionId rejected after runtime reset', async () => {
    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send: vi.fn() }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => {},
      subscribeWorld: async () => createWorldSubscription(),
      ensureCoreReady: async () => {}
    });

    await runtime.subscribeChatEvents({
      subscriptionId: 'sub-reset',
      worldId: 'world-1',
      chatId: 'chat-1'
    });
    runtime.unsubscribeChatEvents({ subscriptionId: 'sub-reset' });

    await runtime.resetRuntimeSubscriptions();

    await expect(
      runtime.subscribeChatEvents({
        subscriptionId: 'sub-reset',
        worldId: 'world-1',
        chatId: 'chat-1'
      })
    ).rejects.toThrow("Subscription ID 'sub-reset' cannot be reused after unsubscribe.");
  });

  it('forwards system events for subscribed chats', async () => {
    const send = vi.fn();
    const worldSubscription = createWorldSubscription();

    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => {},
      subscribeWorld: async () => worldSubscription,
      ensureCoreReady: async () => {}
    });

    await runtime.subscribeChatEvents({
      subscriptionId: 'sub-system',
      worldId: 'world-1',
      chatId: 'chat-1'
    });

    worldSubscription.world.eventEmitter.emit('system', {
      content: {
        eventType: 'chat-title-updated',
        title: 'Scoped Chat Title',
        source: 'idle'
      },
      messageId: 'sys-1',
      timestamp: new Date('2026-02-13T00:00:00.000Z'),
      chatId: 'chat-1'
    });

    expect(send).toHaveBeenCalledWith(
      'chat:event',
      expect.objectContaining({
        type: 'system',
        subscriptionId: 'sub-system',
        worldId: 'world-1',
        chatId: 'chat-1',
        system: expect.objectContaining({
          eventType: 'chat-title-updated',
          messageId: 'sys-1',
          content: expect.objectContaining({
            title: 'Scoped Chat Title',
            source: 'idle'
          })
        })
      })
    );
  });
});
