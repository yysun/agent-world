/**
 * Unit Tests for replyToMessageId Publishing Flow
 *
 * Tests the complete pipeline of replyToMessageId from agent processing
 * through message publishing to ensure threading information reaches the frontend.
 *
 * Bug Fix Verification (2025-10-30):
 * - replyToMessageId was missing in frontend because publishMessageWithId didn't pass it
 * - Fixed by adding replyToMessageId parameter to both publishMessage and publishMessageWithId
 * - These tests verify the fix and prevent regression
 *
 * Pipeline Flow:
 * 1. Agent processes incoming message with messageId
 * 2. Agent creates response with replyToMessageId pointing to incoming message
 * 3. Response is published via publishMessageWithId WITH replyToMessageId
 * 4. WorldMessageEvent includes replyToMessageId
 * 5. SSE forwards event to frontend with threading intact
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';

// Mock storage-factory early to prevent SQLite initialization
vi.mock('../../../core/storage/storage-factory.js', () => ({
  createStorageWithWrappers: vi.fn().mockResolvedValue({
    saveWorld: vi.fn(),
    loadWorld: vi.fn(),
    worldExists: vi.fn().mockResolvedValue(false),
    saveAgent: vi.fn().mockResolvedValue(undefined),
    getMemory: vi.fn().mockResolvedValue([])
  }),
  getDefaultRootPath: vi.fn().mockReturnValue('/test/data')
}));

import { publishMessage, publishMessageWithId } from '../../../core/events';
import type { World, WorldMessageEvent } from '../../../core/types';
import { EventEmitter } from 'events';

describe('replyToMessageId Publishing Flow', () => {
  let mockWorld: World;
  let capturedEvents: WorldMessageEvent[];

  beforeEach(() => {
    capturedEvents = [];

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
      currentChatId: 'test-chat-123'
    };

    // Capture all message events
    mockWorld.eventEmitter.on('message', (event: WorldMessageEvent) => {
      capturedEvents.push(event);
    });
  });

  describe('publishMessage with replyToMessageId', () => {
    test('should include replyToMessageId in published event', () => {
      const parentMessageId = 'parent-msg-123';
      const result = publishMessage(
        mockWorld,
        'Reply content',
        'agent-1',
        mockWorld.currentChatId,
        parentMessageId
      );

      expect(result.replyToMessageId).toBe(parentMessageId);
      expect(result.content).toBe('Reply content');
      expect(result.sender).toBe('agent-1');
      expect(result.chatId).toBe('test-chat-123');

      // Verify event was emitted with replyToMessageId
      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].replyToMessageId).toBe(parentMessageId);
    });

    test('should handle undefined replyToMessageId (root messages)', () => {
      const result = publishMessage(
        mockWorld,
        'Root message',
        'HUMAN',
        mockWorld.currentChatId,
        undefined
      );

      expect(result.replyToMessageId).toBeUndefined();
      expect(result.content).toBe('Root message');

      // Event should not have replyToMessageId
      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].replyToMessageId).toBeUndefined();
    });

    test('should handle null chatId with replyToMessageId', () => {
      const parentMessageId = 'parent-msg-456';
      const result = publishMessage(
        mockWorld,
        'Reply without chat',
        'agent-2',
        null,
        parentMessageId
      );

      expect(result.replyToMessageId).toBe(parentMessageId);
      expect(result.chatId).toBeNull();
      expect(capturedEvents[0].replyToMessageId).toBe(parentMessageId);
    });
  });

  describe('publishMessageWithId with replyToMessageId', () => {
    test('should include replyToMessageId in published event with pre-generated ID', () => {
      const messageId = 'pre-gen-msg-789';
      const parentMessageId = 'parent-msg-789';

      const result = publishMessageWithId(
        mockWorld,
        'Agent response',
        'agent-1',
        messageId,
        mockWorld.currentChatId,
        parentMessageId
      );

      expect(result.messageId).toBe(messageId);
      expect(result.replyToMessageId).toBe(parentMessageId);
      expect(result.content).toBe('Agent response');
      expect(result.sender).toBe('agent-1');
      expect(result.chatId).toBe('test-chat-123');

      // Verify event emission
      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].messageId).toBe(messageId);
      expect(capturedEvents[0].replyToMessageId).toBe(parentMessageId);
    });

    test('should handle undefined replyToMessageId with pre-generated ID', () => {
      const messageId = 'pre-gen-root-msg';

      const result = publishMessageWithId(
        mockWorld,
        'Root message with pre-gen ID',
        'agent-2',
        messageId,
        mockWorld.currentChatId,
        undefined
      );

      expect(result.messageId).toBe(messageId);
      expect(result.replyToMessageId).toBeUndefined();

      expect(capturedEvents[0].messageId).toBe(messageId);
      expect(capturedEvents[0].replyToMessageId).toBeUndefined();
    });

    test('should support backward compatibility with omitted parameters', () => {
      // Old code calling without chatId or replyToMessageId
      const messageId = 'backward-compat-msg';

      const result = publishMessageWithId(
        mockWorld,
        'Backward compatible call',
        'agent-3',
        messageId
      );

      expect(result.messageId).toBe(messageId);
      expect(result.chatId).toBe('test-chat-123'); // Uses world.currentChatId
      expect(result.replyToMessageId).toBeUndefined();
    });
  });

  describe('Threading Chain Scenario', () => {
    test('should support multi-level threading chain', () => {
      // Human message (root)
      const humanMsg = publishMessage(
        mockWorld,
        'Hello agents',
        'HUMAN',
        mockWorld.currentChatId
      );

      // Agent 1 replies to human
      const agent1Reply = publishMessageWithId(
        mockWorld,
        'Hi human!',
        'agent-1',
        'agent1-reply-id',
        mockWorld.currentChatId,
        humanMsg.messageId
      );

      // Agent 2 replies to agent 1
      const agent2Reply = publishMessageWithId(
        mockWorld,
        'I agree with agent-1',
        'agent-2',
        'agent2-reply-id',
        mockWorld.currentChatId,
        agent1Reply.messageId
      );

      // Verify threading chain
      expect(capturedEvents).toHaveLength(3);

      // Human message - no parent
      expect(capturedEvents[0].sender).toBe('HUMAN');
      expect(capturedEvents[0].replyToMessageId).toBeUndefined();

      // Agent 1 - replies to human
      expect(capturedEvents[1].sender).toBe('agent-1');
      expect(capturedEvents[1].replyToMessageId).toBe(humanMsg.messageId);

      // Agent 2 - replies to agent 1
      expect(capturedEvents[2].sender).toBe('agent-2');
      expect(capturedEvents[2].replyToMessageId).toBe(agent1Reply.messageId);
    });

    test('should handle parallel replies to same message', () => {
      // Human asks a question
      const humanMsg = publishMessage(
        mockWorld,
        'What is 2+2?',
        'HUMAN',
        mockWorld.currentChatId
      );

      // Multiple agents reply in parallel
      const agent1Reply = publishMessageWithId(
        mockWorld,
        'The answer is 4',
        'agent-1',
        'agent1-reply',
        mockWorld.currentChatId,
        humanMsg.messageId
      );

      const agent2Reply = publishMessageWithId(
        mockWorld,
        'It equals 4',
        'agent-2',
        'agent2-reply',
        mockWorld.currentChatId,
        humanMsg.messageId
      );

      const agent3Reply = publishMessageWithId(
        mockWorld,
        '4 is the answer',
        'agent-3',
        'agent3-reply',
        mockWorld.currentChatId,
        humanMsg.messageId
      );

      // All replies should reference the same parent
      expect(capturedEvents).toHaveLength(4);
      expect(capturedEvents[1].replyToMessageId).toBe(humanMsg.messageId);
      expect(capturedEvents[2].replyToMessageId).toBe(humanMsg.messageId);
      expect(capturedEvents[3].replyToMessageId).toBe(humanMsg.messageId);
    });
  });

  describe('Cross-Agent Reply Scenario', () => {
    test('should preserve replyToMessageId in cross-agent communication', () => {
      // Human mentions agent-1
      const humanMsg = publishMessage(
        mockWorld,
        '@agent-1 tell @agent-2 hello',
        'HUMAN',
        mockWorld.currentChatId
      );

      // Agent-1 processes and replies
      const agent1Reply = publishMessageWithId(
        mockWorld,
        '@agent-2 hello from agent-1',
        'agent-1',
        'agent1-cross-reply',
        mockWorld.currentChatId,
        humanMsg.messageId // Replies to human's message
      );

      // Agent-2 receives agent-1's message and replies
      const agent2Reply = publishMessageWithId(
        mockWorld,
        'Thanks agent-1!',
        'agent-2',
        'agent2-response',
        mockWorld.currentChatId,
        agent1Reply.messageId // Replies to agent-1's message
      );

      // Verify cross-agent threading
      expect(capturedEvents).toHaveLength(3);

      expect(capturedEvents[0].sender).toBe('HUMAN');
      expect(capturedEvents[0].replyToMessageId).toBeUndefined();

      expect(capturedEvents[1].sender).toBe('agent-1');
      expect(capturedEvents[1].replyToMessageId).toBe(humanMsg.messageId);

      expect(capturedEvents[2].sender).toBe('agent-2');
      expect(capturedEvents[2].replyToMessageId).toBe(agent1Reply.messageId);
    });
  });

  describe('SSE Event Structure Verification', () => {
    test('should produce events compatible with SSE forwarding', () => {
      const parentId = 'parent-sse-test';
      const messageId = 'child-sse-test';

      const result = publishMessageWithId(
        mockWorld,
        'SSE compatible message',
        'agent-1',
        messageId,
        mockWorld.currentChatId,
        parentId
      );

      // Verify event structure matches what SSE expects
      // WorldMessageEvent has these fields (type is added by SSE layer, not here)
      expect(result).toHaveProperty('sender');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('messageId');
      expect(result).toHaveProperty('replyToMessageId');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('chatId');

      // These are the critical fields for threading
      expect(result.messageId).toBe(messageId);
      expect(result.replyToMessageId).toBe(parentId);
    });

    test('should ensure all threading information is in single event', () => {
      const parentId = 'complete-threading-parent';
      const messageId = 'complete-threading-child';

      publishMessageWithId(
        mockWorld,
        'Complete threading test',
        'agent-test',
        messageId,
        'chat-test',
        parentId
      );

      const emittedEvent = capturedEvents[0];

      // All fields needed for frontend threading display
      expect(emittedEvent.messageId).toBeDefined();
      expect(emittedEvent.replyToMessageId).toBeDefined();
      expect(emittedEvent.sender).toBeDefined();
      expect(emittedEvent.content).toBeDefined();
      expect(emittedEvent.timestamp).toBeDefined();
      expect(emittedEvent.chatId).toBeDefined();

      // No secondary lookup needed - everything in one event
      expect(emittedEvent.messageId).toBe(messageId);
      expect(emittedEvent.replyToMessageId).toBe(parentId);
      expect(emittedEvent.chatId).toBe('chat-test');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty string as replyToMessageId', () => {
      const result = publishMessageWithId(
        mockWorld,
        'Empty parent ID test',
        'agent-1',
        'test-msg-id',
        mockWorld.currentChatId,
        '' // Empty string
      );

      // Empty string is falsy but should be preserved if explicitly passed
      expect(result.replyToMessageId).toBe('');
      expect(capturedEvents[0].replyToMessageId).toBe('');
    });

    test('should handle very long replyToMessageId values', () => {
      const longParentId = 'x'.repeat(500);
      const result = publishMessageWithId(
        mockWorld,
        'Long parent ID test',
        'agent-1',
        'test-msg-id',
        mockWorld.currentChatId,
        longParentId
      );

      expect(result.replyToMessageId).toBe(longParentId);
      expect(result.replyToMessageId?.length).toBe(500);
    });

    test('should maintain type safety with optional parameters', () => {
      // TypeScript should allow these calls
      publishMessage(mockWorld, 'msg1', 'sender1');
      publishMessage(mockWorld, 'msg2', 'sender2', null);
      publishMessage(mockWorld, 'msg3', 'sender3', 'chat-id');
      publishMessage(mockWorld, 'msg4', 'sender4', 'chat-id', 'parent-id');
      publishMessage(mockWorld, 'msg5', 'sender5', null, undefined);

      publishMessageWithId(mockWorld, 'msg6', 'sender6', 'msg-id');
      publishMessageWithId(mockWorld, 'msg7', 'sender7', 'msg-id', 'chat-id');
      publishMessageWithId(mockWorld, 'msg8', 'sender8', 'msg-id', 'chat-id', 'parent-id');

      // All calls should succeed
      expect(capturedEvents).toHaveLength(8);
    });
  });

  describe('Bug Regression Prevention', () => {
    test('REGRESSION: should not lose replyToMessageId like before fix', () => {
      // This test documents the exact bug that was fixed
      // Before: publishMessageWithId(world, content, sender, messageId) - no replyToMessageId param
      // After: publishMessageWithId(world, content, sender, messageId, chatId, replyToMessageId)

      const parentMessageId = 'original-trigger-msg';
      const agentResponseId = 'agent-response-msg';

      // Simulate agent response to a message (the fixed scenario)
      const agentResponse = publishMessageWithId(
        mockWorld,
        'Agent response content',
        'agent-1',
        agentResponseId,
        mockWorld.currentChatId,
        parentMessageId // THIS WAS MISSING BEFORE THE FIX
      );

      // Before fix: agentResponse.replyToMessageId would be undefined
      // After fix: agentResponse.replyToMessageId should be parentMessageId
      expect(agentResponse.replyToMessageId).toBe(parentMessageId);
      expect(agentResponse.replyToMessageId).not.toBeUndefined();

      // Verify the event sent to frontend has threading
      const frontendEvent = capturedEvents[0];
      expect(frontendEvent.replyToMessageId).toBe(parentMessageId);
      expect(frontendEvent.messageId).toBe(agentResponseId);
    });

    test('REGRESSION: should match agent memory threading with published event', () => {
      // Before fix: agent.memory had replyToMessageId, but published event didn't
      // This test ensures they stay in sync

      const triggerMsgId = 'trigger-123';
      const responseMsgId = 'response-456';

      // Agent's memory would have this structure
      const memoryMessage = {
        role: 'assistant',
        content: 'Agent response',
        messageId: responseMsgId,
        replyToMessageId: triggerMsgId,
        agentId: 'agent-1',
        createdAt: new Date()
      };

      // Published event MUST match
      const publishedEvent = publishMessageWithId(
        mockWorld,
        memoryMessage.content,
        'agent-1',
        memoryMessage.messageId,
        mockWorld.currentChatId,
        memoryMessage.replyToMessageId
      );

      // Threading should match between memory and published event
      expect(publishedEvent.messageId).toBe(memoryMessage.messageId);
      expect(publishedEvent.replyToMessageId).toBe(memoryMessage.replyToMessageId);
    });
  });
});
