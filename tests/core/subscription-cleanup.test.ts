import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { startWorld } from '../../core/subscription.js';
import type { World } from '../../core/types.js';
import { LLMProvider } from '../../core/types.js';

describe('World Subscription Cleanup', () => {
  let testWorld: World;

  beforeEach(() => {
    testWorld = {
      id: 'test-world',
      name: 'Test World',
      eventEmitter: new EventEmitter(),
      agents: new Map(),
      chats: new Map(),
      currentChatId: 'chat-1',
      chatLLMProvider: LLMProvider.OPENAI,
      chatLLMModel: 'gpt-4',
    } as any;
  });

  it('should clean up direct listeners when using minimal client', async () => {
    // Start world with minimal client (like CLI)
    const subscription = await startWorld(testWorld, { isOpen: true });
    const world = subscription.world;

    // Attach direct listeners like CLI does
    let worldEventCount = 0;
    let messageEventCount = 0;

    const worldListener = () => { worldEventCount++; };
    const messageListener = () => { messageEventCount++; };

    world.eventEmitter.on('world', worldListener);
    world.eventEmitter.on('message', messageListener);

    // Emit events to verify listeners are working
    world.eventEmitter.emit('world', { test: true });
    world.eventEmitter.emit('message', { test: true });

    expect(worldEventCount).toBe(1);
    expect(messageEventCount).toBe(1);

    // Verify listeners exist
    expect(world.eventEmitter.listenerCount('world')).toBeGreaterThan(0);
    expect(world.eventEmitter.listenerCount('message')).toBeGreaterThan(0);

    // Unsubscribe should remove all listeners
    await subscription.unsubscribe();

    // Verify listeners are removed (this would fail in old implementation)
    expect(world.eventEmitter.listenerCount('world')).toBe(0);
    expect(world.eventEmitter.listenerCount('message')).toBe(0);

    // Events should not trigger anymore
    world.eventEmitter.emit('world', { test: true });
    world.eventEmitter.emit('message', { test: true });

    expect(worldEventCount).toBe(1); // Still 1, not incremented
    expect(messageEventCount).toBe(1); // Still 1, not incremented
  });

  it('should clean up forwarding listeners when using client with callbacks', async () => {
    let forwardedEvents = 0;

    const clientWithCallbacks = {
      isOpen: true,
      onWorldEvent: () => { forwardedEvents++; }
    };

    const subscription = await startWorld(testWorld, clientWithCallbacks);
    const world = subscription.world;

    // Emit event to verify forwarding works
    world.eventEmitter.emit('world', { test: true });
    expect(forwardedEvents).toBe(1);

    // Verify listeners exist
    expect(world.eventEmitter.listenerCount('world')).toBeGreaterThan(0);

    // Unsubscribe should remove all listeners
    await subscription.unsubscribe();

    // Verify listeners are removed
    expect(world.eventEmitter.listenerCount('world')).toBe(0);

    // Events should not trigger anymore
    world.eventEmitter.emit('world', { test: true });
    expect(forwardedEvents).toBe(1); // Still 1, not incremented
  });

  it('should not create forwarding listeners when client has no callbacks', async () => {
    const subscription = await startWorld(testWorld, { isOpen: true });
    const world = subscription.world;

    // There should be no forwarding listeners initially
    // (only system listeners from subscribeAgentToMessages/subscribeWorldToMessages)
    const initialWorldListeners = world.eventEmitter.listenerCount('world');
    const initialMessageListeners = world.eventEmitter.listenerCount('message');
    const initialSystemListeners = world.eventEmitter.listenerCount('system');
    const initialSseListeners = world.eventEmitter.listenerCount('sse');

    // Since we don't have callbacks, no forwarding listeners should be created
    // There may be 1 system listener on 'message' from subscribeWorldToMessages
    expect(initialWorldListeners).toBe(0);
    expect(initialMessageListeners).toBeLessThanOrEqual(1); // May have system listener
    expect(initialSystemListeners).toBe(0);
    expect(initialSseListeners).toBe(0);

    await subscription.unsubscribe();
  });
});
