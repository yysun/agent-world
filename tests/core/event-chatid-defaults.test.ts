/**
 * Event ChatId Requirements Test Suite
 *
 * Comprehensive tests verifying that chat-scoped world events require and preserve
 * explicit `chatId` values when persisted to storage.
 * 
 * Features tested:
 * - SSE events preserve explicit chatId
 * - Tool events preserve explicit chatId
 * - System events preserve explicit chatId
 * - Message events require explicit chatId
 * - Missing chatId is rejected instead of silently falling back
 * - Querying events by chatId returns all event types
 * 
 * Implementation: Tests both memory and SQLite storage backends
 * 
 * Changes:
 * - 2025-11-07: Refactored to use setupTestWorld helper (test deduplication initiative)
 */

import { describe, test, expect } from 'vitest';
import { newChat } from '../../core/managers.js';
import { publishMessage, publishSSE, publishToolEvent, publishEvent } from '../../core/events/index.js';
import type { World } from '../../core/types.js';
import type { StoredEvent } from '../../core/storage/eventStorage/types.js';
import { setupTestWorld } from '../helpers/world-test-setup.js';

describe('Event ChatId Requirements', () => {
  const { worldId, getWorld } = setupTestWorld({
    name: 'event-chatid-test',
    description: 'Testing event chatId defaults',
    turnLimit: 5
  });

  describe('SSE Events', () => {
    test('should preserve explicit chatId', async () => {
      const world = await getWorld();
      expect(world).toBeTruthy();
      expect(world!.currentChatId).toBeTruthy();
      const chatId = world!.currentChatId!;

      // Emit SSE event
      publishSSE(world!, {
        agentName: 'test-agent',
        type: 'start',
        messageId: 'sse-chatid-1',
        content: 'Starting generation',
        chatId,
      });

      // Allow persistence to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Query events by chatId
      const events = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        chatId,
        { types: ['sse'] }
      ) as StoredEvent[];

      expect(events.length).toBeGreaterThan(0);
      const sseEvent = events.find((e: StoredEvent) => e.id === 'sse-chatid-1-sse-start');
      expect(sseEvent).toBeDefined();
      expect(sseEvent!.chatId).toBe(chatId);
      expect(sseEvent!.type).toBe('sse');
    });

    test('should persist SSE events across multiple chats', async () => {
      let world = await getWorld();
      expect(world).toBeTruthy();
      const chat1Id = world!.currentChatId!;

      // Emit SSE event in first chat
      publishSSE(world!, {
        agentName: 'agent1',
        type: 'start',
        messageId: 'sse-chat1',
        content: 'Chat 1 content',
        chatId: chat1Id,
      });

      // Update chat name to prevent reuse by newChat
      const { updateChat } = await import('../../core/managers.js');
      await updateChat(worldId(), chat1Id, { name: 'Chat 1' });

      // Create new chat
      world = await newChat(worldId());
      const chat2Id = world!.currentChatId!;
      expect(chat2Id).not.toBe(chat1Id);

      // Emit SSE event in second chat
      publishSSE(world!, {
        agentName: 'agent2',
        type: 'end',
        messageId: 'sse-chat2',
        content: 'Chat 2 content',
        chatId: chat2Id,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Query events for each chat
      const chat1Events = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        chat1Id,
        { types: ['sse'] }
      );
      const chat2Events = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        chat2Id,
        { types: ['sse'] }
      );

      // Verify events are in correct chats
      const chat1Event = chat1Events.find((e: StoredEvent) => e.id === 'sse-chat1-sse-start');
      const chat2Event = chat2Events.find((e: StoredEvent) => e.id === 'sse-chat2-sse-end');

      expect(chat1Event).toBeDefined();
      expect(chat1Event!.chatId).toBe(chat1Id);
      expect(chat2Event).toBeDefined();
      expect(chat2Event!.chatId).toBe(chat2Id);

      // Verify events don't leak across chats
      expect(chat1Events.find((e: StoredEvent) => e.id === 'sse-chat2-sse-end')).toBeUndefined();
      expect(chat2Events.find((e: StoredEvent) => e.id === 'sse-chat1-sse-start')).toBeUndefined();
    });
  });

  describe('Tool Events', () => {
    test('should preserve explicit chatId', async () => {
      const world = await getWorld();
      expect(world).toBeTruthy();
      expect(world!.currentChatId).toBeTruthy();
      const chatId = world!.currentChatId!;

      // Emit tool event
      publishToolEvent(world!, {
        agentName: 'test-agent',
        type: 'tool-result',
        messageId: 'tool-chatid-1',
        chatId,
        toolExecution: {
          toolName: 'testTool',
          toolCallId: 'call-123',
          result: { data: 'test' }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Query events by chatId
      const events = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        chatId,
        { types: ['tool'] }
      );

      expect(events.length).toBeGreaterThan(0);
      const toolEvent = events.find((e: StoredEvent) => e.id === 'tool-chatid-1-tool-tool-result');
      expect(toolEvent).toBeDefined();
      expect(toolEvent!.chatId).toBe(chatId);
      expect(toolEvent!.type).toBe('tool');
    });

    test('should persist tool events in correct chat context', async () => {
      let world = await getWorld();
      expect(world).toBeTruthy();
      const chat1Id = world!.currentChatId!;

      // Emit tool event in first chat
      publishToolEvent(world!, {
        agentName: 'agent1',
        type: 'tool-start',
        messageId: 'tool-chat1',
        chatId: chat1Id,
        toolExecution: {
          toolName: 'searchTool',
          toolCallId: 'call-1'
        }
      });

      // Update chat name to prevent reuse by newChat
      const { updateChat } = await import('../../core/managers.js');
      await updateChat(worldId(), chat1Id, { name: 'Chat 1' });

      // Create new chat
      world = await newChat(worldId());
      const chat2Id = world!.currentChatId!;

      // Emit tool event in second chat
      publishToolEvent(world!, {
        agentName: 'agent2',
        type: 'tool-start',
        messageId: 'tool-chat2',
        chatId: chat2Id,
        toolExecution: {
          toolName: 'analyzeTool',
          toolCallId: 'call-2'
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify events are isolated by chat
      const chat1Events = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        chat1Id,
        { types: ['tool'] }
      );
      const chat2Events = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        chat2Id,
        { types: ['tool'] }
      );

      expect(chat1Events.find((e: StoredEvent) => e.id === 'tool-chat1-tool-tool-start')).toBeDefined();
      expect(chat1Events.find((e: StoredEvent) => e.id === 'tool-chat2-tool-tool-start')).toBeUndefined();
      expect(chat2Events.find((e: StoredEvent) => e.id === 'tool-chat2-tool-tool-start')).toBeDefined();
      expect(chat2Events.find((e: StoredEvent) => e.id === 'tool-chat1-tool-tool-start')).toBeUndefined();
    });
  });

  describe('System Events', () => {
    test('should preserve explicit chatId', async () => {
      const world = await getWorld();
      expect(world).toBeTruthy();
      expect(world!.currentChatId).toBeTruthy();
      const chatId = world!.currentChatId!;

      // Emit system event
      publishEvent(world!, 'system', { message: 'System notification', type: 'info' }, chatId);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Query events by chatId
      const events = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        chatId,
        { types: ['system'] }
      );

      expect(events.length).toBeGreaterThan(0);
      const systemEvent = events[0];
      expect(systemEvent.chatId).toBe(chatId);
      expect(systemEvent.type).toBe('system');
    });

    test('should persist system events across different chats', async () => {
      let world = await getWorld();
      expect(world).toBeTruthy();
      const chat1Id = world!.currentChatId!;

      // System event in first chat
      publishEvent(world!, 'system', 'Chat 1 initialized', chat1Id);

      world = await newChat(worldId());
      const chat2Id = world!.currentChatId!;

      // System event in second chat
      publishEvent(world!, 'system', 'Chat 2 initialized', chat2Id);

      await new Promise(resolve => setTimeout(resolve, 100));

      const chat1Events = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        chat1Id,
        { types: ['system'] }
      );
      const chat2Events = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        chat2Id,
        { types: ['system'] }
      );

      // Both chats should have system events
      expect(chat1Events.length).toBeGreaterThan(0);
      expect(chat2Events.length).toBeGreaterThan(0);

      // Verify chatId is correct
      expect(chat1Events.every((e: StoredEvent) => e.chatId === chat1Id)).toBe(true);
      expect(chat2Events.every((e: StoredEvent) => e.chatId === chat2Id)).toBe(true);
    });
  });

  describe('Message Events', () => {
    test('should use explicit chatId from publishMessage', async () => {
      const world = await getWorld();
      expect(world).toBeTruthy();
      const chatId = world!.currentChatId!;

      // Emit message event
      const messageEvent = publishMessage(world!, 'Test message', 'human', chatId);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Query events
      const events = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        chatId,
        { types: ['message'] }
      );

      const msgEvent = events.find((e: StoredEvent) => e.id === messageEvent.messageId);
      expect(msgEvent).toBeDefined();
      expect(msgEvent!.chatId).toBe(chatId);
    });

    test('should reject message events when chatId is not provided', async () => {
      const world = await getWorld();
      expect(world).toBeTruthy();
      expect(() => publishMessage(world!, 'Test message', 'human')).toThrow(
        'publishMessage: explicit chatId is required.'
      );
    });
  });

  describe('Mixed Event Types Query', () => {
    test('should retrieve all event types for a chat', async () => {
      const world = await getWorld();
      expect(world).toBeTruthy();
      const chatId = world!.currentChatId!;

      // Emit various event types
      publishMessage(world!, 'User message', 'human', chatId);
      publishSSE(world!, {
        agentName: 'agent',
        type: 'start',
        messageId: 'sse-mixed',
        chatId,
      });
      publishToolEvent(world!, {
        agentName: 'agent',
        type: 'tool-start',
        messageId: 'tool-mixed',
        chatId,
        toolExecution: { toolName: 'test', toolCallId: 'call-1' }
      });
      publishEvent(world!, 'system', 'System message', chatId);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Query all events for this chat
      const events = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        chatId
      );

      // Should have all event types
      const hasMessage = events.some((e: StoredEvent) => e.type === 'message');
      const hasSSE = events.some((e: StoredEvent) => e.type === 'sse');
      const hasTool = events.some((e: StoredEvent) => e.type === 'tool');
      const hasSystem = events.some((e: StoredEvent) => e.type === 'system');

      expect(hasMessage).toBe(true);
      expect(hasSSE).toBe(true);
      expect(hasTool).toBe(true);
      expect(hasSystem).toBe(true);

      // All events should have the correct chatId
      expect(events.every((e: StoredEvent) => e.chatId === chatId)).toBe(true);
    });

    test('should filter events by type and chatId', async () => {
      const world = await getWorld();
      expect(world).toBeTruthy();
      const chatId = world!.currentChatId!;

      // Emit multiple events
      publishMessage(world!, 'Message 1', 'human', chatId);
      publishMessage(world!, 'Message 2', 'human', chatId);
      publishSSE(world!, { agentName: 'agent', type: 'start', messageId: 'sse-1', chatId });
      publishSSE(world!, { agentName: 'agent', type: 'end', messageId: 'sse-2', chatId });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Query only messages
      const messageEvents = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        chatId,
        { types: ['message'] }
      );

      // Query only SSE
      const sseEvents = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        chatId,
        { types: ['sse'] }
      );

      expect(messageEvents.every((e: StoredEvent) => e.type === 'message')).toBe(true);
      expect(sseEvents.every((e: StoredEvent) => e.type === 'sse')).toBe(true);
      expect(messageEvents.length).toBeGreaterThanOrEqual(2);
      expect(sseEvents.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Edge Cases', () => {
    test('should reject chat-scoped events when explicit chatId is missing', async () => {
      const world = await getWorld();
      expect(world).toBeTruthy();

      world!.currentChatId = null;
      expect(() => publishSSE(world!, { agentName: 'agent', type: 'end', messageId: 'sse-no-chat' })).toThrow(
        'publishSSE: explicit chatId is required.'
      );
      expect(() => publishToolEvent(world!, {
        agentName: 'agent',
        type: 'tool-start',
        messageId: 'tool-no-chat',
        toolExecution: { toolName: 'test', toolCallId: 'call-1' }
      })).toThrow('publishToolEvent: explicit chatId is required.');
      expect(() => publishEvent(world!, 'system', 'No chat context')).toThrow(
        'publishEvent: explicit chatId is required.'
      );
    });

    test('should handle rapid chat switching', async () => {
      let world = await getWorld();
      expect(world).toBeTruthy();
      const chat1Id = world!.currentChatId!;

      publishMessage(world!, 'Message in chat 1', 'human', chat1Id);

      // Switch to new chat
      world = await newChat(worldId());
      const chat2Id = world!.currentChatId!;

      publishMessage(world!, 'Message in chat 2', 'human', chat2Id);

      // Switch back to chat 1
      world!.currentChatId = chat1Id;

      publishMessage(world!, 'Another message in chat 1', 'human', chat1Id);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify events are in correct chats
      const chat1Events = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        chat1Id,
        { types: ['message'] }
      );
      const chat2Events = await world!.eventStorage!.getEventsByWorldAndChat(
        worldId(),
        chat2Id,
        { types: ['message'] }
      );

      // Chat 1 should have 2 messages
      const chat1MessageCount = chat1Events.filter((e: StoredEvent) => e.type === 'message').length;
      expect(chat1MessageCount).toBeGreaterThanOrEqual(2);

      // Chat 2 should have 1 message
      const chat2MessageCount = chat2Events.filter((e: StoredEvent) => e.type === 'message').length;
      expect(chat2MessageCount).toBeGreaterThanOrEqual(1);
    });
  });
});
