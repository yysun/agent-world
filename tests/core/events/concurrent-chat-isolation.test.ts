/**
 * Unit Tests for Concurrent Chat Session Isolation
 *
 * Features:
 * - Tests that SSE events include chatId for proper routing
 * - Validates concurrent chat sessions don't interfere
 * - Ensures SSE events route to the correct chat session
 * - Tests per-chat context isolation during message processing
 *
 * Implementation:
 * - Tests publishSSE includes chatId in emitted events
 * - Validates chatId is preserved throughout processing
 * - Tests concurrent message sends to different chats
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';

// Mock storage-factory early to prevent SQLite initialization
vi.mock('../../../core/storage/storage-factory.js', () => ({
  createStorageWithWrappers: vi.fn().mockResolvedValue({
    saveWorld: vi.fn(),
    loadWorld: vi.fn(),
    worldExists: vi.fn().mockResolvedValue(false)
  }),
  getDefaultRootPath: vi.fn().mockReturnValue('/test/data')
}));

import { publishSSE, publishMessageWithId } from '../../../core/events';
import type { World, WorldSSEEvent } from '../../../core/types';
import { EventEmitter } from 'events';

describe('Concurrent Chat Session Isolation', () => {
  let mockWorld: World;

  beforeEach(() => {
    mockWorld = {
      id: 'test-world',
      name: 'Test World',
      turnLimit: 5,
      totalAgents: 0,
      totalMessages: 0,
      createdAt: new Date(),
      lastUpdated: new Date(),
      eventEmitter: new EventEmitter(),
      agents: new Map(),
      chats: new Map(),
      currentChatId: 'chat-A'
    };
  });

  describe('SSE Event chatId Routing', () => {
    test('publishSSE should include explicit chatId in event', () => {
      const events: WorldSSEEvent[] = [];
      mockWorld.eventEmitter.on('sse', (event: WorldSSEEvent) => {
        events.push(event);
      });

      // Publish SSE with explicit chatId different from world.currentChatId
      publishSSE(mockWorld, { agentName: 'agent-1', type: 'llm-chunk', content: 'Hello', chatId: 'chat-B' });

      expect(events).toHaveLength(1);
      expect(events[0].chatId).toBe('chat-B');
      expect(events[0].type).toBe('llm-chunk');
    });

    test('publishSSE should default to world.currentChatId when chatId not provided', () => {
      const events: WorldSSEEvent[] = [];
      mockWorld.eventEmitter.on('sse', (event: WorldSSEEvent) => {
        events.push(event);
      });

      publishSSE(mockWorld, { agentName: 'agent-1', type: 'llm-chunk', content: 'Hello' });

      expect(events).toHaveLength(1);
      expect(events[0].chatId).toBe('chat-A'); // world.currentChatId
    });

    test('multiple SSE events should route to their respective chatIds', () => {
      const eventsForChatA: WorldSSEEvent[] = [];
      const eventsForChatB: WorldSSEEvent[] = [];

      mockWorld.eventEmitter.on('sse', (event: WorldSSEEvent) => {
        if (event.chatId === 'chat-A') {
          eventsForChatA.push(event);
        } else if (event.chatId === 'chat-B') {
          eventsForChatB.push(event);
        }
      });

      // Simulate concurrent streaming to different chats
      publishSSE(mockWorld, { agentName: 'agent-1', type: 'llm-chunk', content: 'Chat A: Hello', chatId: 'chat-A' });
      publishSSE(mockWorld, { agentName: 'agent-1', type: 'llm-chunk', content: 'Chat B: Hi', chatId: 'chat-B' });
      publishSSE(mockWorld, { agentName: 'agent-1', type: 'llm-chunk', content: 'Chat A: World', chatId: 'chat-A' });
      publishSSE(mockWorld, { agentName: 'agent-1', type: 'llm-chunk', content: 'Chat B: there', chatId: 'chat-B' });

      expect(eventsForChatA).toHaveLength(2);
      expect(eventsForChatB).toHaveLength(2);

      expect(eventsForChatA[0].content).toBe('Chat A: Hello');
      expect(eventsForChatA[1].content).toBe('Chat A: World');
      expect(eventsForChatB[0].content).toBe('Chat B: Hi');
      expect(eventsForChatB[1].content).toBe('Chat B: there');
    });
  });

  describe('Chat Context Isolation', () => {
    test('changing world.currentChatId should not affect events with explicit chatId', () => {
      const events: WorldSSEEvent[] = [];
      mockWorld.eventEmitter.on('sse', (event: WorldSSEEvent) => {
        events.push(event);
      });

      // Start processing for chat-A
      const chatAId = 'chat-A';
      publishSSE(mockWorld, { agentName: 'agent-1', type: 'llm-start', chatId: chatAId });

      // User switches to chat-B (simulates UI interaction)
      mockWorld.currentChatId = 'chat-B';

      // Continue emitting for original chat-A (should still route correctly)
      publishSSE(mockWorld, { agentName: 'agent-1', type: 'llm-chunk', content: 'Still for chat A', chatId: chatAId });
      publishSSE(mockWorld, { agentName: 'agent-1', type: 'llm-complete', content: 'Done', chatId: chatAId });

      // All events should still be for chat-A
      expect(events).toHaveLength(3);
      expect(events.every(e => e.chatId === 'chat-A')).toBe(true);
    });

    test('interleaved events for different chats maintain correct routing', () => {
      const allEvents: WorldSSEEvent[] = [];
      mockWorld.eventEmitter.on('sse', (event: WorldSSEEvent) => {
        allEvents.push(event);
      });

      // Simulate two concurrent LLM responses streaming
      const chatA = 'chat-A';
      const chatB = 'chat-B';

      publishSSE(mockWorld, { agentName: 'agent-1', type: 'llm-start', chatId: chatA });
      publishSSE(mockWorld, { agentName: 'agent-2', type: 'llm-start', chatId: chatB });
      publishSSE(mockWorld, { agentName: 'agent-1', type: 'llm-chunk', content: 'A1', chatId: chatA });
      publishSSE(mockWorld, { agentName: 'agent-2', type: 'llm-chunk', content: 'B1', chatId: chatB });
      publishSSE(mockWorld, { agentName: 'agent-1', type: 'llm-chunk', content: 'A2', chatId: chatA });
      publishSSE(mockWorld, { agentName: 'agent-1', type: 'llm-complete', content: 'A Done', chatId: chatA });
      publishSSE(mockWorld, { agentName: 'agent-2', type: 'llm-chunk', content: 'B2', chatId: chatB });
      publishSSE(mockWorld, { agentName: 'agent-2', type: 'llm-complete', content: 'B Done', chatId: chatB });

      // Filter events by chat
      const chatAEvents = allEvents.filter(e => e.chatId === chatA);
      const chatBEvents = allEvents.filter(e => e.chatId === chatB);

      expect(chatAEvents).toHaveLength(4); // start, chunk, chunk, complete
      expect(chatBEvents).toHaveLength(4); // start, chunk, chunk, complete

      // Verify sequence for chat A
      expect(chatAEvents[0].type).toBe('llm-start');
      expect(chatAEvents[1].content).toBe('A1');
      expect(chatAEvents[2].content).toBe('A2');
      expect(chatAEvents[3].type).toBe('llm-complete');

      // Verify sequence for chat B
      expect(chatBEvents[0].type).toBe('llm-start');
      expect(chatBEvents[1].content).toBe('B1');
      expect(chatBEvents[2].content).toBe('B2');
      expect(chatBEvents[3].type).toBe('llm-complete');
    });
  });

  describe('Message Events with chatId', () => {
    test('publishMessageWithId should include chatId in emitted event when available', () => {
      const events: any[] = [];
      mockWorld.eventEmitter.on('message', (event) => {
        events.push(event);
      });

      // publishMessageWithId now has optional chatId parameter
      publishMessageWithId(mockWorld, 'Test message', 'agent-1', 'msg-1', 'chat-B');

      expect(events).toHaveLength(1);
      expect(events[0].chatId).toBe('chat-B');
      expect(events[0].messageId).toBe('msg-1');
    });

    test('message events should use world.currentChatId as default', () => {
      const events: any[] = [];
      mockWorld.eventEmitter.on('message', (event) => {
        events.push(event);
      });

      // Without explicit chatId, should use world.currentChatId
      publishMessageWithId(mockWorld, 'Test message', 'agent-1', 'msg-2');

      expect(events).toHaveLength(1);
      expect(events[0].chatId).toBe('chat-A'); // world.currentChatId
    });
  });

  describe('Error Handling for Concurrent Sessions', () => {
    test('null chatId in SSE should be preserved', () => {
      const events: WorldSSEEvent[] = [];
      mockWorld.eventEmitter.on('sse', (event: WorldSSEEvent) => {
        events.push(event);
      });

      // Some events may not be chat-specific
      publishSSE(mockWorld, { agentName: 'system', type: 'system', content: 'Global event', chatId: null });

      expect(events).toHaveLength(1);
      expect(events[0].chatId).toBeNull();
    });

    test('undefined chatId falls back to world.currentChatId', () => {
      const events: WorldSSEEvent[] = [];
      mockWorld.eventEmitter.on('sse', (event: WorldSSEEvent) => {
        events.push(event);
      });

      publishSSE(mockWorld, { agentName: 'agent-1', type: 'llm-chunk', content: 'test' });

      expect(events).toHaveLength(1);
      expect(events[0].chatId).toBe('chat-A'); // Defaults to world.currentChatId
    });
  });
});
