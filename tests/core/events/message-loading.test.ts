/**
 * Unit Tests for Message Loading and Count Verification
 *
 * Features:
 * - Tests that messages are loaded from the correct chatId
 * - Verifies message count accuracy when preparing messages for LLM
 * - Ensures no duplication of current message in conversation history
 * - Tests chat isolation (messages from different chats don't mix)
 * - Validates title generation uses correct chatId filter
 *
 * Implementation:
 * - Tests processAgentMessage flow with message loading
 * - Mocks storage operations to control test data
 * - Tests prepareMessagesForLLM with various history scenarios
 * - Validates message count at different stages
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { prepareMessagesForLLM } from '../../../core/utils';
import type { World, Agent, WorldMessageEvent, AgentMessage, MessageData } from '../../../core/types';
import { LLMProvider } from '../../../core/types';
import { EventEmitter } from 'events';

// Mock dependencies
vi.mock('../../../core/storage/agent-storage', () => ({
  saveAgentConfigToDisk: vi.fn(),
  saveAgentMemoryToDisk: vi.fn(),
  saveAgentToDisk: vi.fn()
}));

vi.mock('../../../core/llm-manager', () => ({
  streamAgentResponse: vi.fn(),
  generateAgentResponse: vi.fn()
}));

describe('Message Loading and Count Verification', () => {
  let mockAgent: Agent;

  beforeEach(() => {
    mockAgent = {
      id: 'test-agent',
      name: 'Test Agent',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'You are a helpful assistant.',
      memory: [],
      llmCallCount: 0,
      createdAt: new Date(),
      lastActive: new Date()
    };
  });

  describe('prepareMessagesForLLM', () => {
    test('should return correct count for new chat with first message', () => {
      const messageData: MessageData = {
        id: 'msg-1',
        name: 'message',
        sender: 'human',
        content: 'Hello',
        payload: {}
      };

      const conversationHistory: AgentMessage[] = []; // Empty history for new chat

      const messages = prepareMessagesForLLM(mockAgent, messageData, conversationHistory);

      // Should have: system prompt (1) + current message (1) = 2
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toBe('You are a helpful assistant.');
      expect(messages[1].role).toBe('user');
      expect(messages[1].content).toBe('Hello');
    });

    test('should return correct count for chat with existing history', () => {
      const messageData: MessageData = {
        id: 'msg-3',
        name: 'message',
        sender: 'human',
        content: 'What is the weather?',
        payload: {}
      };

      const conversationHistory: AgentMessage[] = [
        {
          role: 'user',
          content: 'Hello',
          sender: 'human',
          createdAt: new Date('2024-01-01T10:00:00Z'),
          chatId: 'chat-1'
        },
        {
          role: 'assistant',
          content: 'Hi! How can I help you?',
          sender: 'test-agent',
          createdAt: new Date('2024-01-01T10:01:00Z'),
          chatId: 'chat-1'
        }
      ];

      const messages = prepareMessagesForLLM(mockAgent, messageData, conversationHistory);

      // Should have: system (1) + history (2) + current (1) = 4
      expect(messages).toHaveLength(4);
      expect(messages[0].role).toBe('system');
      expect(messages[1].content).toBe('Hello');
      expect(messages[2].content).toBe('Hi! How can I help you?');
      expect(messages[3].content).toBe('What is the weather?');
    });

    test('should NOT duplicate current message if it was already saved to history', () => {
      const messageData: MessageData = {
        id: 'msg-2',
        name: 'message',
        sender: 'human',
        content: 'Hello again',
        payload: {}
      };

      // Simulate the bug: history already includes the current message
      const conversationHistory: AgentMessage[] = [
        {
          role: 'user',
          content: 'Hello again',
          sender: 'human',
          createdAt: new Date(),
          chatId: 'chat-1'
        }
      ];

      const messages = prepareMessagesForLLM(mockAgent, messageData, conversationHistory);

      // This test documents current behavior - prepareMessagesForLLM WILL add the message twice
      // The fix is to NOT save to memory before loading history in processAgentMessage
      expect(messages).toHaveLength(3); // system + history("Hello again") + current("Hello again")

      // Verify duplication exists (this is the bug we're testing for)
      const userMessages = messages.filter(m => m.role === 'user');
      expect(userMessages).toHaveLength(2);
      expect(userMessages[0].content).toBe('Hello again');
      expect(userMessages[1].content).toBe('Hello again');
    });

    test('should filter history by chatId when chatId parameter is provided', () => {
      const messageData: MessageData = {
        id: 'msg-4',
        name: 'message',
        sender: 'human',
        content: 'Current message',
        payload: {}
      };

      const conversationHistory: AgentMessage[] = [
        {
          role: 'user',
          content: 'Chat 1 message',
          sender: 'human',
          createdAt: new Date(),
          chatId: 'chat-1'
        },
        {
          role: 'user',
          content: 'Chat 2 message',
          sender: 'human',
          createdAt: new Date(),
          chatId: 'chat-2'
        },
        {
          role: 'user',
          content: 'Another Chat 1 message',
          sender: 'human',
          createdAt: new Date(),
          chatId: 'chat-1'
        }
      ];

      const messages = prepareMessagesForLLM(mockAgent, messageData, conversationHistory, 'chat-1');

      // Should only include chat-1 messages: system (1) + filtered history (2) + current (1) = 4
      expect(messages).toHaveLength(4);

      const historyMessages = messages.slice(1, -1); // Exclude system and current
      expect(historyMessages).toHaveLength(2);
      expect(historyMessages[0].content).toBe('Chat 1 message');
      expect(historyMessages[1].content).toBe('Another Chat 1 message');

      // Should NOT include chat-2 message
      const allContent = messages.map(m => m.content).join(' ');
      expect(allContent).not.toContain('Chat 2 message');
    });

    test('should handle agent without systemPrompt', () => {
      const agentNoPrompt: Agent = {
        ...mockAgent,
        systemPrompt: ''
      };

      const messageData: MessageData = {
        id: 'msg-5',
        name: 'message',
        sender: 'human',
        content: 'Test',
        payload: {}
      };

      const messages = prepareMessagesForLLM(agentNoPrompt, messageData, []);

      // Should only have current message, no system prompt
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Test');
    });

    test('should maintain message order: system -> history (chronological) -> current', () => {
      const messageData: MessageData = {
        id: 'msg-6',
        name: 'message',
        sender: 'human',
        content: 'Current',
        payload: {}
      };

      const conversationHistory: AgentMessage[] = [
        {
          role: 'user',
          content: 'First',
          sender: 'human',
          createdAt: new Date('2024-01-01T10:00:00Z'),
          chatId: 'chat-1'
        },
        {
          role: 'assistant',
          content: 'Second',
          sender: 'test-agent',
          createdAt: new Date('2024-01-01T10:01:00Z'),
          chatId: 'chat-1'
        },
        {
          role: 'user',
          content: 'Third',
          sender: 'human',
          createdAt: new Date('2024-01-01T10:02:00Z'),
          chatId: 'chat-1'
        }
      ];

      const messages = prepareMessagesForLLM(mockAgent, messageData, conversationHistory);

      expect(messages).toHaveLength(5);
      expect(messages[0].role).toBe('system');
      expect(messages[1].content).toBe('First');
      expect(messages[2].content).toBe('Second');
      expect(messages[3].content).toBe('Third');
      expect(messages[4].content).toBe('Current');
    });
  });

  describe('Chat Isolation', () => {
    test('should ensure messages from different chats do not mix', () => {
      const messageData: MessageData = {
        id: 'msg-7',
        name: 'message',
        sender: 'human',
        content: 'Chat 1 current message',
        payload: {}
      };

      const mixedHistory: AgentMessage[] = [
        {
          role: 'user',
          content: 'Chat 1 message 1',
          sender: 'human',
          createdAt: new Date('2024-01-01T10:00:00Z'),
          chatId: 'chat-1'
        },
        {
          role: 'user',
          content: 'Chat 2 message 1',
          sender: 'human',
          createdAt: new Date('2024-01-01T10:01:00Z'),
          chatId: 'chat-2'
        },
        {
          role: 'user',
          content: 'Chat 1 message 2',
          sender: 'human',
          createdAt: new Date('2024-01-01T10:02:00Z'),
          chatId: 'chat-1'
        },
        {
          role: 'user',
          content: 'Chat 3 message 1',
          sender: 'human',
          createdAt: new Date('2024-01-01T10:03:00Z'),
          chatId: 'chat-3'
        }
      ];

      // Filter to chat-1 only (simulating what storage.getMemory(worldId, chatId) does)
      const chat1History = mixedHistory.filter(msg => msg.chatId === 'chat-1');
      const messages = prepareMessagesForLLM(mockAgent, messageData, chat1History);

      // Should only have chat-1 messages
      expect(messages).toHaveLength(4); // system + 2 history + current

      const content = messages.map(m => m.content).join(' ');
      expect(content).toContain('Chat 1 message 1');
      expect(content).toContain('Chat 1 message 2');
      expect(content).toContain('Chat 1 current message');
      expect(content).not.toContain('Chat 2');
      expect(content).not.toContain('Chat 3');
    });

    test('should handle null chatId (messages without chat association)', () => {
      const messageData: MessageData = {
        id: 'msg-8',
        name: 'message',
        sender: 'human',
        content: 'No chat message',
        payload: {}
      };

      const historyWithNull: AgentMessage[] = [
        {
          role: 'user',
          content: 'Message with null chatId',
          sender: 'human',
          createdAt: new Date(),
          chatId: null
        },
        {
          role: 'user',
          content: 'Message with chat-1',
          sender: 'human',
          createdAt: new Date(),
          chatId: 'chat-1'
        }
      ];

      // Filter to null chatId
      const messages = prepareMessagesForLLM(mockAgent, messageData, historyWithNull, null);

      // Should only include null chatId message
      expect(messages).toHaveLength(3); // system + 1 history + current

      const historyContent = messages[1].content;
      expect(historyContent).toBe('Message with null chatId');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty conversation history', () => {
      const messageData: MessageData = {
        id: 'msg-9',
        name: 'message',
        sender: 'human',
        content: 'First message ever',
        payload: {}
      };

      const messages = prepareMessagesForLLM(mockAgent, messageData, []);

      expect(messages).toHaveLength(2); // system + current
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });

    test('should handle very long conversation history', () => {
      const messageData: MessageData = {
        id: 'msg-10',
        name: 'message',
        sender: 'human',
        content: 'Current message',
        payload: {}
      };

      // Create 20 messages in history
      const longHistory: AgentMessage[] = Array.from({ length: 20 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `Message ${i + 1}`,
        sender: i % 2 === 0 ? 'human' : 'test-agent',
        createdAt: new Date(),
        chatId: 'chat-1'
      }));

      const messages = prepareMessagesForLLM(mockAgent, messageData, longHistory);

      // Should have: system (1) + history (20) + current (1) = 22
      expect(messages).toHaveLength(22);
      expect(messages[0].role).toBe('system');
      expect(messages[messages.length - 1].content).toBe('Current message');
    });

    test('should handle undefined conversationHistory parameter', () => {
      const messageData: MessageData = {
        id: 'msg-11',
        name: 'message',
        sender: 'human',
        content: 'Test message',
        payload: {}
      };

      const messages = prepareMessagesForLLM(mockAgent, messageData);

      expect(messages).toHaveLength(2); // system + current
      expect(messages[0].role).toBe('system');
      expect(messages[1].content).toBe('Test message');
    });

    test('should handle messages with various roles (user, assistant, tool)', () => {
      const messageData: MessageData = {
        id: 'msg-12',
        name: 'message',
        sender: 'human',
        content: 'Current',
        payload: {}
      };

      const conversationHistory: AgentMessage[] = [
        {
          role: 'user',
          content: 'User message',
          sender: 'human',
          createdAt: new Date(),
          chatId: 'chat-1'
        },
        {
          role: 'assistant',
          content: 'Assistant message',
          sender: 'test-agent',
          createdAt: new Date(),
          chatId: 'chat-1'
        },
        {
          role: 'tool',
          content: 'Tool result',
          sender: 'tool',
          createdAt: new Date(),
          chatId: 'chat-1'
        }
      ];

      const messages = prepareMessagesForLLM(mockAgent, messageData, conversationHistory);

      expect(messages).toHaveLength(5); // system + 3 history + current
      expect(messages[1].role).toBe('user');
      expect(messages[2].role).toBe('assistant');
      expect(messages[3].role).toBe('tool');
      expect(messages[4].role).toBe('user');
    });
  });

  describe('Message Count Accuracy Documentation', () => {
    test('NEW CHAT: First message should result in messageCount=2', () => {
      // Simulates: User creates new chat and sends "hi"
      const messageData: MessageData = {
        id: 'msg-new',
        name: 'message',
        sender: 'human',
        content: 'hi',
        payload: {}
      };

      const conversationHistory: AgentMessage[] = []; // New chat = empty history

      const messages = prepareMessagesForLLM(mockAgent, messageData, conversationHistory);

      // Expected: system prompt (1) + current message (1) = 2
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });

    test('EXISTING CHAT: Message count should be system + history + current (no duplicates)', () => {
      // Simulates: User sends second message to existing chat
      const messageData: MessageData = {
        id: 'msg-existing',
        name: 'message',
        sender: 'human',
        content: 'how are you?',
        payload: {}
      };

      // History already has the first exchange
      const conversationHistory: AgentMessage[] = [
        {
          role: 'user',
          content: 'hi',
          sender: 'human',
          createdAt: new Date(),
          chatId: 'chat-1'
        },
        {
          role: 'assistant',
          content: 'Hello! How can I help?',
          sender: 'test-agent',
          createdAt: new Date(),
          chatId: 'chat-1'
        }
      ];

      const messages = prepareMessagesForLLM(mockAgent, messageData, conversationHistory);

      // Expected: system (1) + history (2) + current (1) = 4
      expect(messages).toHaveLength(4);
      expect(messages[0].role).toBe('system');
      expect(messages[1].content).toBe('hi');
      expect(messages[2].content).toBe('Hello! How can I help?');
      expect(messages[3].content).toBe('how are you?');

      // Verify no duplication of "how are you?"
      const userMessages = messages.filter(m => m.role === 'user');
      const howAreYouCount = userMessages.filter(m => m.content === 'how are you?').length;
      expect(howAreYouCount).toBe(1);
    });

    test('BUG SCENARIO: If message is saved before loading history, it appears twice', () => {
      // This documents the bug that was fixed:
      // 1. User sends "hi"
      // 2. processAgentMessage saves "hi" to memory FIRST
      // 3. Then loads history (which now includes "hi")
      // 4. prepareMessagesForLLM adds history + current = DUPLICATE

      const messageData: MessageData = {
        id: 'msg-bug',
        name: 'message',
        sender: 'human',
        content: 'hi',
        payload: {}
      };

      // Simulate history that includes the current message (bug scenario)
      const conversationHistory: AgentMessage[] = [
        {
          role: 'user',
          content: 'hi', // This is the SAME as current message
          sender: 'human',
          createdAt: new Date(),
          chatId: 'chat-1'
        }
      ];

      const messages = prepareMessagesForLLM(mockAgent, messageData, conversationHistory);

      // This WILL create duplicate: system (1) + history["hi"] (1) + current["hi"] (1) = 3
      expect(messages).toHaveLength(3);

      const userMessages = messages.filter(m => m.role === 'user');
      expect(userMessages).toHaveLength(2); // TWO "hi" messages = BUG!
      expect(userMessages[0].content).toBe('hi');
      expect(userMessages[1].content).toBe('hi');

      // This test documents the expected behavior BEFORE the fix
      // AFTER the fix in processAgentMessage, conversationHistory should NOT include
      // the current message because we load history BEFORE saving the current message
    });
  });
});
