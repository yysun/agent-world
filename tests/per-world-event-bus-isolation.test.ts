/**
 * Tests for per-world event bus isolation
 * Verifies that events in one world do not affect agents in another world
 */

import {
  createWorld,
  deleteWorld,
  createAgent,
  broadcastMessage,
  sendMessage,
  subscribeToAgentMessages,
  _clearAllWorldsForTesting
} from '../src/world';
import { subscribeToMessages } from '../src/event-bus';
import { EventType, Event, LLMProvider } from '../src/types';

describe('Per-World Event Bus Isolation', () => {
  beforeEach(async () => {
    // Clean up any existing state
    _clearAllWorldsForTesting();
  });

  afterEach(async () => {
    // Clean up after each test
    _clearAllWorldsForTesting();
  });

  test('should isolate events between different worlds', async () => {
    // Create two separate worlds
    const world1Name = await createWorld({ name: 'Test World 1' });
    const world2Name = await createWorld({ name: 'Test World 2' });

    // Create agents in each world
    const agent1 = await createAgent(world1Name, {
      name: 'Agent1',
      type: 'test-agent',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'Test agent 1'
    });

    const agent2 = await createAgent(world2Name, {
      name: 'Agent2',
      type: 'test-agent',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'Test agent 2'
    });

    // Set up event listeners for each world
    const world1Events: Event[] = [];
    const world2Events: Event[] = [];

    const unsubscribe1 = subscribeToMessages((event: Event) => {
      if (event.type === EventType.MESSAGE) {
        world1Events.push(event);
      }
    }, undefined, world1Name);

    const unsubscribe2 = subscribeToMessages((event: Event) => {
      if (event.type === EventType.MESSAGE) {
        world2Events.push(event);
      }
    }, undefined, world2Name);

    // Broadcast message to world 1
    await broadcastMessage(world1Name, 'Hello World 1', 'HUMAN');

    // Wait a bit for events to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Broadcast message to world 2  
    await broadcastMessage(world2Name, 'Hello World 2', 'HUMAN');

    // Wait a bit for events to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify events are isolated
    expect(world1Events).toHaveLength(1);
    expect(world2Events).toHaveLength(1);

    expect(world1Events[0].payload.content).toBe('Hello World 1');
    expect(world2Events[0].payload.content).toBe('Hello World 2');

    // Clean up subscriptions
    unsubscribe1();
    unsubscribe2();
  });

  test('should not leak events between worlds', async () => {
    // Create two worlds
    const world1Name = await createWorld({ name: 'Isolated World 1' });
    const world2Name = await createWorld({ name: 'Isolated World 2' });

    // Track events for world 1 only
    const world1Events: Event[] = [];
    const unsubscribe1 = subscribeToMessages((event: Event) => {
      world1Events.push(event);
    }, undefined, world1Name);

    // Send messages to both worlds
    await broadcastMessage(world1Name, 'Message for World 1', 'HUMAN');
    await broadcastMessage(world2Name, 'Message for World 2', 'HUMAN');

    // Wait for events to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // World 1 listener should only receive world 1 events
    expect(world1Events).toHaveLength(1);
    expect(world1Events[0].payload.content).toBe('Message for World 1');

    // Clean up
    unsubscribe1();
  });

  test('should maintain separate event histories per world', async () => {
    // Create two worlds
    const world1Name = await createWorld({ name: 'History World 1' });
    const world2Name = await createWorld({ name: 'History World 2' });

    // Send different numbers of messages to each world
    await broadcastMessage(world1Name, 'World 1 Message 1', 'HUMAN');
    await broadcastMessage(world1Name, 'World 1 Message 2', 'HUMAN');

    await broadcastMessage(world2Name, 'World 2 Message 1', 'HUMAN');

    // Wait for events to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Check event histories are separate (this would require extending the API to get history per world)
    // For now, we verify isolation through subscription
    const world1Events: Event[] = [];
    const world2Events: Event[] = [];

    const unsubscribe1 = subscribeToMessages((event: Event) => {
      world1Events.push(event);
    }, undefined, world1Name);

    const unsubscribe2 = subscribeToMessages((event: Event) => {
      world2Events.push(event);
    }, undefined, world2Name);

    // Send one more message to each
    await broadcastMessage(world1Name, 'World 1 Final', 'HUMAN');
    await broadcastMessage(world2Name, 'World 2 Final', 'HUMAN');

    await new Promise(resolve => setTimeout(resolve, 50));

    // Each world should only see its own final message
    expect(world1Events).toHaveLength(1);
    expect(world2Events).toHaveLength(1);
    expect(world1Events[0].payload.content).toBe('World 1 Final');
    expect(world2Events[0].payload.content).toBe('World 2 Final');

    unsubscribe1();
    unsubscribe2();
  });

  test('should clean up event bus when world is deleted', async () => {
    // Create a world
    const worldName = await createWorld({ name: 'Temporary World' });

    // Set up event listener
    const events: Event[] = [];
    const unsubscribe = subscribeToMessages((event: Event) => {
      events.push(event);
    }, undefined, worldName);

    // Send a message
    await broadcastMessage(worldName, 'Test message', 'HUMAN');
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(events).toHaveLength(1);

    // Clean up subscription
    unsubscribe();

    // Delete the world
    await deleteWorld(worldName);

    // Try to send another message (should fail)
    await expect(
      broadcastMessage(worldName, 'This should fail', 'HUMAN')
    ).rejects.toThrow('World ' + worldName + ' not found');
  });

  test('should handle concurrent operations on different worlds', async () => {
    // Create multiple worlds concurrently
    const worldPromises = [
      createWorld({ name: 'Concurrent World 1' }),
      createWorld({ name: 'Concurrent World 2' }),
      createWorld({ name: 'Concurrent World 3' })
    ];

    const worldNames = await Promise.all(worldPromises);

    // Send messages to all worlds concurrently
    const messagePromises = worldNames.map((worldName, index) =>
      broadcastMessage(worldName, `Message ${index + 1}`, 'HUMAN')
    );

    await Promise.all(messagePromises);

    // Verify all worlds exist and can receive messages
    for (const worldName of worldNames) {
      const events: Event[] = [];
      const unsubscribe = subscribeToMessages((event: Event) => {
        events.push(event);
      }, undefined, worldName);

      await broadcastMessage(worldName, 'Verification message', 'HUMAN');
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events).toHaveLength(1);
      expect(events[0].payload.content).toBe('Verification message');

      unsubscribe();
    }
  });
});
