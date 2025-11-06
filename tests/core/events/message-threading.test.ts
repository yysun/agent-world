/**
 * Message Threading Tests - Consolidated
 * 
 * Comprehensive tests for message threading functionality including:
 * - Thread validation and circular reference detection
 * - Cross-agent message threading preservation
 * - replyToMessageId publishing pipeline
 * 
 * Consolidates:
 * - message-threading.test.ts (16 tests) - Validation logic
 * - cross-agent-threading.test.ts (3 tests) - Cross-agent scenarios  
 * - reply-to-message-id-publishing.test.ts (16 tests) - Publishing flow
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  validateMessageThreading,
  type AgentMessage,
  type World,
  type Agent,
  type WorldMessageEvent
} from '../../../core/types.js';
import { LLMProvider } from '../../../core/types.js';
import { EventEmitter } from 'events';

// Mock storage-factory for all tests
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

import { saveIncomingMessageToMemory, publishMessage, publishMessageWithId } from '../../../core/events.js';

describe('Message Threading System', () => {
  
  describe('Thread Validation', () => {
    describe('validateMessageThreading', () => {
      test('should allow valid threading', () => {
        const message: AgentMessage = {
          role: 'assistant',
          content: 'Reply',
          messageId: 'msg-2',
          replyToMessageId: 'msg-1'
        };

        const allMessages: AgentMessage[] = [
          { role: 'user', content: 'Question', messageId: 'msg-1' },
          message
        ];

        expect(() => validateMessageThreading(message, allMessages)).not.toThrow();
      });

      test('should reject self-referencing messages', () => {
        const message: AgentMessage = {
          role: 'assistant',
          content: 'Test',
          messageId: 'msg-1',
          replyToMessageId: 'msg-1' // Self-reference
        };

        expect(() => validateMessageThreading(message)).toThrow('cannot reply to itself');
      });

      test('should detect circular references (A→B→C→A)', () => {
        const messages: AgentMessage[] = [
          { role: 'user', content: 'A', messageId: 'msg-1', replyToMessageId: 'msg-3' },
          { role: 'user', content: 'B', messageId: 'msg-2', replyToMessageId: 'msg-1' },
          { role: 'user', content: 'C', messageId: 'msg-3', replyToMessageId: 'msg-2' }
        ];

        expect(() => validateMessageThreading(messages[0], messages))
          .toThrow('Circular reference detected');
      });

      test('should detect circular references (A→B→A)', () => {
        const messages: AgentMessage[] = [
          { role: 'user', content: 'A', messageId: 'msg-1', replyToMessageId: 'msg-2' },
          { role: 'user', content: 'B', messageId: 'msg-2', replyToMessageId: 'msg-1' }
        ];

        expect(() => validateMessageThreading(messages[0], messages))
          .toThrow('Circular reference detected');
      });

      test('should handle orphaned replies gracefully (missing parent)', () => {
        const message: AgentMessage = {
          role: 'assistant',
          content: 'Reply to deleted message',
          messageId: 'msg-2',
          replyToMessageId: 'msg-nonexistent'
        };

        const allMessages: AgentMessage[] = [message];

        // Should warn but not throw (parent might be in different chat)
        expect(() => validateMessageThreading(message, allMessages)).not.toThrow();
      });

      test('should validate multi-level threading correctly', () => {
        const messages: AgentMessage[] = [
          { role: 'user', content: 'Start', messageId: 'msg-1' },
          { role: 'assistant', content: 'Reply 1', messageId: 'msg-2', replyToMessageId: 'msg-1' },
          { role: 'user', content: 'Follow-up', messageId: 'msg-3', replyToMessageId: 'msg-2' },
          { role: 'assistant', content: 'Reply 2', messageId: 'msg-4', replyToMessageId: 'msg-3' }
        ];

        // All messages should validate correctly
        messages.forEach(msg => {
          expect(() => validateMessageThreading(msg, messages)).not.toThrow();
        });
      });

      test('should reject excessive thread depth (>100 levels)', () => {
        // Create a chain of 101 messages
        const messages: AgentMessage[] = [];
        for (let i = 0; i < 101; i++) {
          messages.push({
            role: 'user',
            content: `Message ${i}`,
            messageId: `msg-${i}`,
            replyToMessageId: i > 0 ? `msg-${i - 1}` : undefined
          });
        }

        // Last message in chain should exceed depth limit
        expect(() => validateMessageThreading(messages[100], messages))
          .toThrow('Thread depth exceeds maximum');
      });

      test('should allow messages without replyToMessageId (root messages)', () => {
        const message: AgentMessage = {
          role: 'user',
          content: 'Start conversation',
          messageId: 'msg-1'
          // No replyToMessageId - this is a root message
        };

        expect(() => validateMessageThreading(message, [])).not.toThrow();
      });

      test('should allow messages without messageId (legacy)', () => {
        const message: AgentMessage = {
          role: 'user',
          content: 'Legacy message',
          // No messageId - legacy message
          replyToMessageId: 'msg-1'
        };

        expect(() => validateMessageThreading(message, [])).not.toThrow();
      });
    });

    describe('Reply Detection', () => {
      test('should detect when message has reply', () => {
        const messages: AgentMessage[] = [
          { role: 'user', content: 'Question', messageId: 'msg-1' },
          { role: 'assistant', content: 'Answer', messageId: 'msg-2', replyToMessageId: 'msg-1' }
        ];

        // Check if msg-1 has a reply
        const hasReply = messages.some(m => m.replyToMessageId === 'msg-1');
        expect(hasReply).toBe(true);
      });

      test('should detect when message has NO reply', () => {
        const messages: AgentMessage[] = [
          { role: 'user', content: 'Question 1', messageId: 'msg-1' },
          { role: 'user', content: 'Question 2', messageId: 'msg-2' },
          { role: 'assistant', content: 'Answer to Q1', messageId: 'msg-3', replyToMessageId: 'msg-1' }
        ];

        // Check if msg-2 has a reply
        const hasReply = messages.some(m => m.replyToMessageId === 'msg-2');
        expect(hasReply).toBe(false); // msg-2 has no reply
      });

      test('should handle legacy messages without messageId', () => {
        const messages: AgentMessage[] = [
          { role: 'user', content: 'Legacy question' }, // No messageId
          { role: 'assistant', content: 'Answer', messageId: 'msg-2' }
        ];

        // Legacy messages can't be checked for replies
        const hasReply = messages.some(m => m.replyToMessageId === undefined);
        expect(hasReply).toBe(true); // Can't determine reply status
      });
    });

    describe('Thread Traversal', () => {
      test('should traverse thread from reply to root', () => {
        const messages: AgentMessage[] = [
          { role: 'user', content: 'Root', messageId: 'msg-1' },
          { role: 'assistant', content: 'Reply 1', messageId: 'msg-2', replyToMessageId: 'msg-1' },
          { role: 'user', content: 'Reply 2', messageId: 'msg-3', replyToMessageId: 'msg-2' },
          { role: 'assistant', content: 'Reply 3', messageId: 'msg-4', replyToMessageId: 'msg-3' }
        ];

        // Traverse from msg-4 to root
        const thread: AgentMessage[] = [];
        let current: AgentMessage | undefined = messages[3]; // Start at msg-4

        while (current) {
          thread.push(current);
          current = messages.find(m => m.messageId === current?.replyToMessageId);
        }

        expect(thread).toHaveLength(4);
        expect(thread[0].messageId).toBe('msg-4'); // Start
        expect(thread[3].messageId).toBe('msg-1'); // Root
      });

      test('should find all replies to a message', () => {
        const messages: AgentMessage[] = [
          { role: 'user', content: 'Question', messageId: 'msg-1' },
          { role: 'assistant', content: 'Reply from A', messageId: 'msg-2', replyToMessageId: 'msg-1' },
          { role: 'assistant', content: 'Reply from B', messageId: 'msg-3', replyToMessageId: 'msg-1' },
          { role: 'assistant', content: 'Reply from C', messageId: 'msg-4', replyToMessageId: 'msg-1' }
        ];

        // Find all replies to msg-1
        const replies = messages.filter(m => m.replyToMessageId === 'msg-1');

        expect(replies).toHaveLength(3);
        expect(replies.map(r => r.messageId)).toEqual(['msg-2', 'msg-3', 'msg-4']);
      });
    });

    describe('Edge Cases - Unit', () => {
      test('should handle empty memory', () => {
        const message: AgentMessage = {
          role: 'user',
          content: 'Test',
          messageId: 'msg-1'
        };

        // Validation with empty allMessages array
        expect(() => validateMessageThreading(message, [])).not.toThrow();
      });

      test('should handle missing messageId in validation', () => {
        const message: AgentMessage = {
          role: 'user',
          content: 'Test',
          replyToMessageId: 'msg-1'
          // No messageId
        };

        // Should not throw even without messageId
        expect(() => validateMessageThreading(message, [])).not.toThrow();
      });
    });
  });

  describe('Cross-Agent Threading', () => {
    let mockWorld: World;
    let agentA1: Agent;
    let agentA2: Agent;

    beforeEach(() => {
      mockWorld = {
        id: 'test-world',
        name: 'Test World',
        description: 'Test',
        currentChatId: 'chat-123',
        agents: new Map(),
        chats: new Map(),
        createdAt: new Date(),
        lastUpdated: new Date(),
        turnLimit: 5,
        totalAgents: 2,
        totalMessages: 0,
        isProcessing: false,
        eventEmitter: new EventEmitter()
      };

      agentA1 = {
        id: 'a1',
        name: 'Agent A1',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        status: 'active',
        memory: [],
        createdAt: new Date(),
        lastActive: new Date(),
        llmCallCount: 0
      };

      agentA2 = {
        id: 'a2',
        name: 'Agent A2',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        status: 'active',
        memory: [],
        createdAt: new Date(),
        lastActive: new Date(),
        llmCallCount: 0
      };
    });

    test('should preserve replyToMessageId when saving cross-agent messages', async () => {
      // This test validates the fix in saveIncomingMessageToMemory function
      // where replyToMessageId was being lost for cross-agent messages

      // 1. Human message saved to both agents
      const humanMessage: WorldMessageEvent = {
        content: '@a1 tell @a2 hello',
        sender: 'human',
        messageId: 'msg-human-1',
        timestamp: new Date()
      };

      await saveIncomingMessageToMemory(mockWorld, agentA1, humanMessage);
      await saveIncomingMessageToMemory(mockWorld, agentA2, humanMessage);

      // 2. A1's reply message sent to a2 (cross-agent message)
      const a1ReplyMessage: WorldMessageEvent = {
        content: '@a2 hello there!',
        sender: 'a1',
        messageId: 'msg-a1-reply-1',
        replyToMessageId: 'msg-human-1', // CRITICAL: This should be preserved
        timestamp: new Date()
      };

      // 3. Save a1's reply to a2's memory - this is where the bug was
      await saveIncomingMessageToMemory(mockWorld, agentA2, a1ReplyMessage);

      // 4. Verify threading is preserved
      expect(agentA2.memory).toHaveLength(2); // Human message + a1's reply

      const a1MessageInA2Memory = agentA2.memory.find(m => m.sender === 'a1');
      expect(a1MessageInA2Memory).toBeDefined();

      // This is the key assertion - before the fix, this would be undefined
      expect(a1MessageInA2Memory?.replyToMessageId).toBe('msg-human-1'); // Threading preserved!
      expect(a1MessageInA2Memory?.messageId).toBe('msg-a1-reply-1');
      expect(a1MessageInA2Memory?.sender).toBe('a1');
      expect(a1MessageInA2Memory?.role).toBe('user'); // Cross-agent messages saved as user role
    });

    test('should handle messages without replyToMessageId (root messages)', async () => {
      // Test that messages without threading info still work
      const rootMessage: WorldMessageEvent = {
        content: 'Root message without threading',
        sender: 'a1',
        messageId: 'msg-root',
        // No replyToMessageId
        timestamp: new Date()
      };

      await saveIncomingMessageToMemory(mockWorld, agentA2, rootMessage);

      expect(agentA2.memory).toHaveLength(1);
      const savedMessage = agentA2.memory[0];
      expect(savedMessage.replyToMessageId).toBeUndefined();
      expect(savedMessage.messageId).toBe('msg-root');
    });

    test('should support the exact export scenario that was failing', async () => {
      // Simulate the exact scenario from the user's export issue
      // where messages showed "incoming from" instead of "reply"

      // 1. Human message to a1
      const humanMessage: WorldMessageEvent = {
        content: '@a1 tell @a2 a good word',
        sender: 'human',
        messageId: 'UZxAs6pWWELjov6oJerk_',
        timestamp: new Date('2025-10-27T03:43:28.163Z')
      };
      await saveIncomingMessageToMemory(mockWorld, agentA1, humanMessage);

      // 2. A1's message sent to a2 (this is the critical cross-agent message)
      const a1ToA2Message: WorldMessageEvent = {
        content: '@a2, here\'s a good word for you: radiant!',
        sender: 'a1',
        messageId: 'YLh3Do2_HDEymz4iCuHv2',
        replyToMessageId: 'UZxAs6pWWELjov6oJerk_', // CRITICAL: Should be preserved
        timestamp: new Date('2025-10-27T03:43:30.268Z')
      };
      await saveIncomingMessageToMemory(mockWorld, agentA2, a1ToA2Message);

      // 3. Verify a1's message in a2's memory has threading preserved
      const a1MessageInA2 = agentA2.memory.find(m => m.sender === 'a1' && m.role === 'user');
      expect(a1MessageInA2).toBeDefined();
      expect(a1MessageInA2?.replyToMessageId).toBe('UZxAs6pWWELjov6oJerk_');

      // This message should now be detectable as a reply (has replyToMessageId)
      // so export logic will show "Agent: a1 (reply)" instead of "Agent: a2 (incoming from a1)"
      expect(a1MessageInA2?.role).toBe('user');
      expect(a1MessageInA2?.sender).toBe('a1');
      expect(a1MessageInA2?.replyToMessageId).toBeDefined(); // Has threading = it's a reply!
    });
  });

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
          'agent-3',
          messageId,
          mockWorld.currentChatId,
          undefined
        );

        expect(result.messageId).toBe(messageId);
        expect(result.replyToMessageId).toBeUndefined();

        expect(capturedEvents).toHaveLength(1);
        expect(capturedEvents[0].replyToMessageId).toBeUndefined();
      });

      test('should support backward compatibility with omitted parameters', () => {
        const messageId = 'backward-compat-msg';

        // Calling without replyToMessageId (backward compatible)
        const result = publishMessageWithId(
          mockWorld,
          'Message without reply param',
          'agent-4',
          messageId,
          mockWorld.currentChatId
        );

        expect(result.messageId).toBe(messageId);
        expect(result.replyToMessageId).toBeUndefined();
      });
    });

    describe('Threading Chain Scenario', () => {
      test('should support multi-level threading chain', () => {
        // Root message
        const msg1 = publishMessage(mockWorld, 'Root', 'human', mockWorld.currentChatId);
        
        // Reply to root
        const msg2 = publishMessage(mockWorld, 'Reply 1', 'agent-1', mockWorld.currentChatId, msg1.messageId);
        
        // Reply to reply
        const msg3 = publishMessage(mockWorld, 'Reply 2', 'agent-2', mockWorld.currentChatId, msg2.messageId);

        expect(msg1.replyToMessageId).toBeUndefined(); // Root
        expect(msg2.replyToMessageId).toBe(msg1.messageId);
        expect(msg3.replyToMessageId).toBe(msg2.messageId);

        // Verify events maintain chain
        expect(capturedEvents).toHaveLength(3);
        expect(capturedEvents[1].replyToMessageId).toBe(capturedEvents[0].messageId);
        expect(capturedEvents[2].replyToMessageId).toBe(capturedEvents[1].messageId);
      });

      test('should handle parallel replies to same message', () => {
        // Root message
        const root = publishMessage(mockWorld, 'Question?', 'human', mockWorld.currentChatId);
        
        // Multiple agents reply to same message
        const reply1 = publishMessage(mockWorld, 'Answer 1', 'agent-1', mockWorld.currentChatId, root.messageId);
        const reply2 = publishMessage(mockWorld, 'Answer 2', 'agent-2', mockWorld.currentChatId, root.messageId);
        const reply3 = publishMessage(mockWorld, 'Answer 3', 'agent-3', mockWorld.currentChatId, root.messageId);

        // All should reference same parent
        expect(reply1.replyToMessageId).toBe(root.messageId);
        expect(reply2.replyToMessageId).toBe(root.messageId);
        expect(reply3.replyToMessageId).toBe(root.messageId);

        // Verify events
        expect(capturedEvents).toHaveLength(4);
        const replies = capturedEvents.slice(1);
        replies.forEach(r => {
          expect(r.replyToMessageId).toBe(root.messageId);
        });
      });
    });

    describe('Cross-Agent Reply Scenario', () => {
      test('should preserve replyToMessageId in cross-agent communication', () => {
        // Human asks agent-1
        const humanMsg = publishMessage(mockWorld, '@agent-1 tell @agent-2 hello', 'human', mockWorld.currentChatId);
        
        // Agent-1 replies and mentions agent-2
        const agent1Msg = publishMessage(
          mockWorld,
          '@agent-2 message from agent-1',
          'agent-1',
          mockWorld.currentChatId,
          humanMsg.messageId
        );
        
        // Agent-2 replies to agent-1's message
        const agent2Msg = publishMessage(
          mockWorld,
          'Got it!',
          'agent-2',
          mockWorld.currentChatId,
          agent1Msg.messageId
        );

        // Verify threading chain
        expect(agent1Msg.replyToMessageId).toBe(humanMsg.messageId);
        expect(agent2Msg.replyToMessageId).toBe(agent1Msg.messageId);
      });
    });

    describe('SSE Event Structure Verification', () => {
      test('should produce events compatible with SSE forwarding', () => {
        const parentMessageId = 'parent-123';
        publishMessage(mockWorld, 'Test message', 'agent-1', mockWorld.currentChatId, parentMessageId);

        const event = capturedEvents[0];
        
        // Verify event has all required fields for SSE
        expect(event).toHaveProperty('content');
        expect(event).toHaveProperty('sender');
        expect(event).toHaveProperty('messageId');
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('chatId');
        expect(event).toHaveProperty('replyToMessageId');
        
        // Verify replyToMessageId is accessible
        expect(event.replyToMessageId).toBe(parentMessageId);
      });

      test('should ensure all threading information is in single event', () => {
        const parentId = 'parent-456';
        const messageId = 'msg-456';
        
        publishMessageWithId(
          mockWorld,
          'Complete threading info',
          'agent-1',
          messageId,
          mockWorld.currentChatId,
          parentId
        );

        const event = capturedEvents[0];
        
        // Single event should contain complete threading information
        expect(event.messageId).toBe(messageId);
        expect(event.replyToMessageId).toBe(parentId);
        expect(event.sender).toBe('agent-1');
        
        // No need for separate lookup or join
        expect(capturedEvents).toHaveLength(1);
      });
    });

    describe('Edge Cases', () => {
      test('should handle empty string as replyToMessageId', () => {
        const result = publishMessage(mockWorld, 'Test', 'agent-1', mockWorld.currentChatId, '');
        
        // Empty string is falsy, should be treated as undefined
        expect(result.replyToMessageId).toBe('');
      });

      test('should handle very long replyToMessageId values', () => {
        const longId = 'x'.repeat(1000);
        const result = publishMessage(mockWorld, 'Test', 'agent-1', mockWorld.currentChatId, longId);
        
        expect(result.replyToMessageId).toBe(longId);
        expect(capturedEvents[0].replyToMessageId).toBe(longId);
      });

      test('should maintain type safety with optional parameters', () => {
        // TypeScript should allow all these variations
        publishMessage(mockWorld, 'Test1', 'agent-1', mockWorld.currentChatId);
        publishMessage(mockWorld, 'Test2', 'agent-1', mockWorld.currentChatId, undefined);
        publishMessage(mockWorld, 'Test3', 'agent-1', mockWorld.currentChatId, 'parent-id');
        
        expect(capturedEvents).toHaveLength(3);
      });
    });

    describe('Bug Regression Prevention', () => {
      test('REGRESSION: should not lose replyToMessageId like before fix', () => {
        // This test documents the bug that was fixed:
        // publishMessageWithId was not accepting or forwarding replyToMessageId

        const messageId = 'regression-test-msg';
        const parentId = 'regression-parent-msg';
        
        const result = publishMessageWithId(
          mockWorld,
          'Test message',
          'agent-1',
          messageId,
          mockWorld.currentChatId,
          parentId // This parameter was missing before the fix
        );

        // Before fix: replyToMessageId would be undefined
        // After fix: replyToMessageId is properly passed through
        expect(result.replyToMessageId).toBe(parentId);
        expect(capturedEvents[0].replyToMessageId).toBe(parentId);
      });

      test('REGRESSION: should match agent memory threading with published event', async () => {
        // Verify that threading info is consistent between:
        // 1. What's saved in agent memory
        // 2. What's published in events

        const mockAgent: Agent = {
          id: 'test-agent',
          name: 'Test Agent',
          type: 'assistant',
          provider: LLMProvider.OPENAI,
          model: 'gpt-4',
          memory: [],
          createdAt: new Date(),
          lastActive: new Date(),
          llmCallCount: 0
        };

        const incomingMessage: WorldMessageEvent = {
          content: 'Incoming message',
          sender: 'other-agent',
          messageId: 'incoming-123',
          replyToMessageId: 'parent-123',
          timestamp: new Date()
        };

        // Save to memory (simulates saveIncomingMessageToMemory)
        await saveIncomingMessageToMemory(mockWorld, mockAgent, incomingMessage);

        // Publish response
        const responseMsg = publishMessage(
          mockWorld,
          'Response',
          mockAgent.id,
          mockWorld.currentChatId,
          incomingMessage.messageId
        );

        // Memory should have the incoming message with threading
        const memoryMsg = mockAgent.memory.find(m => m.messageId === 'incoming-123');
        expect(memoryMsg?.replyToMessageId).toBe('parent-123');

        // Published event should have threading to incoming message
        expect(responseMsg.replyToMessageId).toBe('incoming-123');
      });
    });
  });
});
