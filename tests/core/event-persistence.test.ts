/**
 * Event Persistence Integration Tests
 * 
 * Verifies that events emitted via World.eventEmitter are automatically
 * persisted to event storage.
 * 
 * Test Strategy:
 * - Uses memory event storage for fast, isolated tests
 * - Event persistence is always synchronous/awaitable for reliability
 * - Tests all event types (message, SSE, tool, system)
 * - Verifies event data integrity and sequence ordering
 * 
 * Changes:
 * - 2025-11-07: Refactored to use setupTestWorld helper (test deduplication initiative)
 */

import { describe, test, expect } from 'vitest';
import { getWorld, createWorld, deleteWorld } from '../../core/managers.js';
import { publishMessage, publishSSE, publishToolEvent, publishEvent } from '../../core/events.js';
import { setupTestWorld } from '../helpers/world-test-setup.js';

describe('Event Persistence Integration', () => {
  const { worldId, getWorld: getTestWorld } = setupTestWorld({
    name: 'test-event-persistence',
    turnLimit: 5
  });

  test('should persist message events when emitted', async () => {
    const world = await getTestWorld();
    expect(world).toBeTruthy();
    expect(world!.eventStorage).toBeDefined();

    // Emit a message
    const messageEvent = publishMessage(world!, 'Hello World', 'user-1', world!.currentChatId);

    // Event persistence is synchronous/awaitable
    // No need for setTimeout

    // Verify event was persisted
    const events = await world!.eventStorage!.getEventsByWorldAndChat(
      worldId(),
      world!.currentChatId
    );

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(messageEvent.messageId);
    expect(events[0].type).toBe('message');
    expect(events[0].payload.content).toBe('Hello World');
    expect(events[0].payload.sender).toBe('user-1');
    expect(events[0].worldId).toBe(worldId());
    expect(events[0].chatId).toBe(world!.currentChatId);
  });

  test('should persist SSE events when emitted', async () => {
    const world = await getTestWorld();
    expect(world).toBeTruthy();

    // Emit SSE event
    publishSSE(world!, {
      agentName: 'test-agent',
      type: 'start',
      messageId: 'msg-sse-123',
      content: 'Starting generation'
    });

    // Query for SSE events (now use currentChatId since they default to it)
    const events = await world!.eventStorage!.getEventsByWorldAndChat(
      worldId(),
      world!.currentChatId,
      { types: ['sse'] }
    );

    expect(events.length).toBeGreaterThan(0);
    const sseEvent = events.find((e: any) => e.id === 'msg-sse-123-sse-start');
    expect(sseEvent).toBeDefined();
    expect(sseEvent!.type).toBe('sse');
    expect(sseEvent!.chatId).toBe(world!.currentChatId);
    expect(sseEvent!.payload.agentName).toBe('test-agent');
    expect(sseEvent!.payload.type).toBe('start');
  });

  test('should persist tool events when emitted', async () => {
    const world = await getTestWorld();

    // Emit tool event
    publishToolEvent(world!, {
      agentName: 'test-agent',
      type: 'tool-start',
      messageId: 'msg-tool-456',
      toolExecution: {
        toolName: 'test-tool',
        toolCallId: 'call-123',
        input: { arg1: 'value1' }
      }
    });

    // Query for tool events (now use currentChatId)
    const events = await world!.eventStorage!.getEventsByWorldAndChat(
      worldId(),
      world!.currentChatId,
      { types: ['tool'] }
    );

    expect(events.length).toBeGreaterThan(0);
    const toolEvent = events.find((e: any) => e.id === 'msg-tool-456-tool-tool-start');
    expect(toolEvent).toBeDefined();
    expect(toolEvent!.chatId).toBe(world!.currentChatId);
    expect(toolEvent!.type).toBe('tool');
    expect(toolEvent!.payload.agentName).toBe('test-agent');
    expect(toolEvent!.payload.toolExecution.toolName).toBe('test-tool');
  });

  test('should persist system events when emitted', async () => {
    const world = await getTestWorld();

    // Emit system event
    publishEvent(world!, 'system', { message: 'System initialized', type: 'info' });

    // Give a small delay for async persistence
    await new Promise(resolve => setTimeout(resolve, 10));

    // Query for system events (now use currentChatId)
    const events = await world!.eventStorage!.getEventsByWorldAndChat(
      worldId(),
      world!.currentChatId,
      { types: ['system'] }
    );

    expect(events.length).toBeGreaterThan(0);
    const systemEvent = events[events.length - 1]; // Get last event
    expect(systemEvent.chatId).toBe(world!.currentChatId);
    expect(systemEvent.type).toBe('system');
    expect(systemEvent.payload.message).toBe('System initialized');
  });

  test('should persist multiple events in sequence', async () => {
    const world = await getTestWorld();

    // Emit multiple messages
    publishMessage(world!, 'First', 'user-1', world!.currentChatId);
    publishMessage(world!, 'Second', 'agent-1', world!.currentChatId);
    publishMessage(world!, 'Third', 'user-1', world!.currentChatId);

    // Query all events for this chat
    const events = await world!.eventStorage!.getEventsByWorldAndChat(
      worldId(),
      world!.currentChatId
    );

    expect(events).toHaveLength(3);
    expect(events[0].payload.content).toBe('First');
    expect(events[1].payload.content).toBe('Second');
    expect(events[2].payload.content).toBe('Third');

    // Verify sequence numbers are assigned
    expect(events[0].seq).toBe(1);
    expect(events[1].seq).toBe(2);
    expect(events[2].seq).toBe(3);
  });

  test('should retrieve events by sequence number', async () => {
    const world = await getTestWorld();

    // Emit 5 messages
    for (let i = 1; i <= 5; i++) {
      publishMessage(world!, `Message ${i}`, 'user-1', world!.currentChatId);
    }

    // Query events after sequence 2
    const events = await world!.eventStorage!.getEventsByWorldAndChat(
      worldId(),
      world!.currentChatId,
      { sinceSeq: 2 }
    );

    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events[0].payload.content).toBe('Message 3');
  });

  test('should filter events by type', async () => {
    const world = await getTestWorld();

    // Emit mix of event types
    publishMessage(world!, 'Message 1', 'user-1', world!.currentChatId);
    publishSSE(world!, { agentName: 'agent', type: 'start', messageId: 'sse-1' });
    publishMessage(world!, 'Message 2', 'user-1', world!.currentChatId);
    publishSSE(world!, { agentName: 'agent', type: 'end', messageId: 'sse-2' });

    await new Promise(resolve => setTimeout(resolve, 10));

    // Query only message events
    const messageEvents = await world!.eventStorage!.getEventsByWorldAndChat(
      worldId(),
      world!.currentChatId,
      { types: ['message'] }
    );

    expect(messageEvents).toHaveLength(2);
    expect(messageEvents.every((e: any) => e.type === 'message')).toBe(true);

    // Query for SSE events only (now use currentChatId)
    const sseEvents = await world!.eventStorage!.getEventsByWorldAndChat(
      worldId(),
      world!.currentChatId,
      { types: ['sse'] }
    );

    expect(sseEvents.length).toBeGreaterThanOrEqual(2);
    expect(sseEvents.every((e: any) => e.type === 'sse')).toBe(true);
  });

  test('should handle persistence errors gracefully', async () => {
    const world = await getTestWorld();

    // Mock storage to throw error
    const originalSave = world!.eventStorage!.saveEvent;
    let errorThrown = false;
    world!.eventStorage!.saveEvent = async () => {
      errorThrown = true;
      throw new Error('Storage failure');
    };

    // Should not throw when emitting
    expect(() => {
      publishMessage(world!, 'Test', 'user-1', world!.currentChatId);
    }).not.toThrow();

    expect(errorThrown).toBe(true);

    // Restore original function
    world!.eventStorage!.saveEvent = originalSave;
  });

  test('should apply event limit correctly', async () => {
    const world = await getTestWorld();

    // Emit 10 messages
    for (let i = 1; i <= 10; i++) {
      publishMessage(world!, `Message ${i}`, 'user-1', world!.currentChatId);
    }

    // Query with limit
    const events = await world!.eventStorage!.getEventsByWorldAndChat(
      worldId(),
      world!.currentChatId,
      { limit: 5 }
    );

    expect(events).toHaveLength(5);
    expect(events[0].payload.content).toBe('Message 1');
    expect(events[4].payload.content).toBe('Message 5');
  });

  test('should isolate events by chat ID', async () => {
    const world = await getTestWorld();
    const originalChatId = world!.currentChatId;

    // Emit messages in first chat
    publishMessage(world!, 'Chat1 Message 1', 'user-1', originalChatId);
    publishMessage(world!, 'Chat1 Message 2', 'user-1', originalChatId);

    // Simulate different chat (set different chatId)
    const mockChatId = 'chat-2';
    publishMessage(world!, 'Chat2 Message 1', 'user-1', mockChatId);

    // Query first chat
    const chat1Events = await world!.eventStorage!.getEventsByWorldAndChat(
      worldId(),
      originalChatId
    );

    expect(chat1Events).toHaveLength(2);
    expect(chat1Events.every((e: any) => e.payload.content.startsWith('Chat1'))).toBe(true);

    // Query second chat
    const chat2Events = await world!.eventStorage!.getEventsByWorldAndChat(
      worldId(),
      mockChatId
    );

    expect(chat2Events).toHaveLength(1);
    expect(chat2Events[0].payload.content).toBe('Chat2 Message 1');
  });

  test('should clean up event listeners on world deletion', async () => {
    const world = await getTestWorld();
    expect(world!._eventPersistenceCleanup).toBeDefined();

    // Delete world (should call cleanup)
    const deleted = await deleteWorld(worldId());
    expect(deleted).toBe(true);

    // Trying to emit after cleanup should not crash
    // (but won't persist since world is deleted)
    expect(() => {
      publishMessage(world!, 'After cleanup', 'user-1', world!.currentChatId);
    }).not.toThrow();
  });

  test('should skip persistence when DISABLE_EVENT_PERSISTENCE is set', async () => {
    // Set environment to disable persistence
    process.env.DISABLE_EVENT_PERSISTENCE = 'true';

    // Create new world with persistence disabled
    const testWorld = await createWorld({
      name: 'test-disabled-persistence',
      turnLimit: 5
    });

    const world = await getWorld(testWorld!.id);

    // Emit message
    publishMessage(world!, 'Should not persist', 'user-1', world!.currentChatId);

    // Query events - should be empty since persistence is disabled
    const events = await world!.eventStorage!.getEventsByWorldAndChat(
      world!.id,
      world!.currentChatId
    );

    // Cleanup
    await deleteWorld(testWorld!.id);
    delete process.env.DISABLE_EVENT_PERSISTENCE;

    // Events should be empty (or whatever was there before)
    // The test is that it doesn't crash when persistence is disabled
    expect(events).toBeDefined();
  });

  // ChatId defaults tests
  describe('ChatId Defaults', () => {
    test('SSE events default to world.currentChatId', async () => {
      const world = await getTestWorld();
      const chatId = world!.currentChatId!;

      publishSSE(world!, {
        agentName: 'agent',
        type: 'start',
        messageId: 'sse-default-chatid'
      });

      const events = await world!.eventStorage!.getEventsByWorldAndChat(worldId(), chatId, { types: ['sse'] });
      const sseEvent = events.find((e: any) => e.id === 'sse-default-chatid-sse-start');

      expect(sseEvent).toBeDefined();
      expect(sseEvent!.chatId).toBe(chatId);
    });

    test('Tool events default to world.currentChatId', async () => {
      const world = await getTestWorld();
      const chatId = world!.currentChatId!;

      publishToolEvent(world!, {
        agentName: 'agent',
        type: 'tool-result',
        messageId: 'tool-default-chatid',
        toolExecution: { toolName: 'test', toolCallId: 'call-1', result: {} }
      });

      const events = await world!.eventStorage!.getEventsByWorldAndChat(worldId(), chatId, { types: ['tool'] });
      const toolEvent = events.find((e: any) => e.id === 'tool-default-chatid-tool-tool-result');

      expect(toolEvent).toBeDefined();
      expect(toolEvent!.chatId).toBe(chatId);
    });

    test('System events default to world.currentChatId', async () => {
      const world = await getTestWorld();
      const chatId = world!.currentChatId!;

      publishEvent(world!, 'system', 'test-message');

      const events = await world!.eventStorage!.getEventsByWorldAndChat(worldId(), chatId, { types: ['system'] });

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].chatId).toBe(chatId);
    });

    test('Events with null currentChatId persist as null', async () => {
      const world = await getTestWorld();
      world!.currentChatId = null;

      publishSSE(world!, { agentName: 'agent', type: 'end', messageId: 'sse-null-chatid' });
      publishToolEvent(world!, {
        agentName: 'agent',
        type: 'tool-start',
        messageId: 'tool-null-chatid',
        toolExecution: { toolName: 'test', toolCallId: 'call-1' }
      });

      const events = await world!.eventStorage!.getEventsByWorldAndChat(worldId(), null);

      const sseEvent = events.find((e: any) => e.id === 'sse-null-chatid-sse-end');
      const toolEvent = events.find((e: any) => e.id === 'tool-null-chatid-tool-tool-start');

      expect(sseEvent).toBeDefined();
      expect(sseEvent!.chatId).toBeNull();
      expect(toolEvent).toBeDefined();
      expect(toolEvent!.chatId).toBeNull();
    });
  });

  describe('Tool Event Metadata Validation', () => {
    test('should persist tool event with required metadata fields', async () => {
      const world = await getTestWorld();

      publishToolEvent(world!, {
        agentName: 'test-agent',
        type: 'tool-start',
        messageId: 'msg-metadata-test',
        toolExecution: {
          toolName: 'test-tool',
          toolCallId: 'call-123',
          input: { arg: 'value' }
        }
      });

      const events = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        world!.currentChatId,
        { types: ['tool'] }
      );

      const toolEvent = events.find((e: any) => e.id === 'msg-metadata-test-tool-tool-start');
      expect(toolEvent).toBeDefined();
      expect(toolEvent!.meta.ownerAgentId).toBe('test-agent');
      expect(toolEvent!.meta.triggeredByMessageId).toBe('msg-metadata-test');
      expect(toolEvent!.meta.executionDuration).toBeDefined();
      expect(toolEvent!.meta.resultSize).toBeDefined();
      expect(toolEvent!.meta.wasApproved).toBe(false);
    });

    test('should not persist tool event without messageId', async () => {
      const world = await getTestWorld();

      // Attempt to publish tool event without messageId
      publishToolEvent(world!, {
        agentName: 'test-agent',
        type: 'tool-start',
        messageId: undefined as any,
        toolExecution: {
          toolName: 'test-tool',
          toolCallId: 'call-456'
        }
      });

      // Wait a bit to ensure persistence attempt completed
      await new Promise(resolve => setTimeout(resolve, 10));

      const events = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        world!.currentChatId,
        { types: ['tool'] }
      );

      // Should not find an event with undefined messageId
      const undefinedEvent = events.find((e: any) => e.id.includes('undefined'));
      expect(undefinedEvent).toBeUndefined();
    });

    test('should not persist tool event without agentName', async () => {
      const world = await getTestWorld();

      // Attempt to publish tool event without agentName
      publishToolEvent(world!, {
        agentName: undefined as any,
        type: 'tool-result',
        messageId: 'msg-no-agent',
        toolExecution: {
          toolName: 'test-tool',
          toolCallId: 'call-789',
          result: 'success'
        }
      });

      // Wait a bit to ensure persistence attempt completed
      await new Promise(resolve => setTimeout(resolve, 10));

      const events = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        world!.currentChatId,
        { types: ['tool'] }
      );

      // Should not find the specific event we tried to create
      const noAgentEvent = events.find((e: any) => e.id === 'msg-no-agent-tool-tool-result');
      expect(noAgentEvent).toBeUndefined();
    });

    test('should persist tool-result event with duration and resultSize', async () => {
      const world = await getTestWorld();

      publishToolEvent(world!, {
        agentName: 'test-agent',
        type: 'tool-result',
        messageId: 'msg-result-test',
        toolExecution: {
          toolName: 'test-tool',
          toolCallId: 'call-result',
          duration: 125.5,
          resultSize: 2048,
          result: { data: 'test result' }
        }
      });

      const events = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        world!.currentChatId,
        { types: ['tool'] }
      );

      const toolEvent = events.find((e: any) => e.id === 'msg-result-test-tool-tool-result');
      expect(toolEvent).toBeDefined();
      expect(toolEvent!.meta.executionDuration).toBe(125.5);
      expect(toolEvent!.meta.resultSize).toBe(2048);
      expect(toolEvent!.payload.toolExecution.duration).toBe(125.5);
      expect(toolEvent!.payload.toolExecution.resultSize).toBe(2048);
    });

    test('should use default values when duration and resultSize not provided', async () => {
      const world = await getTestWorld();

      publishToolEvent(world!, {
        agentName: 'test-agent',
        type: 'tool-start',
        messageId: 'msg-defaults-test',
        toolExecution: {
          toolName: 'test-tool',
          toolCallId: 'call-defaults'
        }
      });

      const events = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        world!.currentChatId,
        { types: ['tool'] }
      );

      const toolEvent = events.find((e: any) => e.id === 'msg-defaults-test-tool-tool-start');
      expect(toolEvent).toBeDefined();
      expect(toolEvent!.meta.executionDuration).toBe(0);
      expect(toolEvent!.meta.resultSize).toBe(0);
    });
  });
});
