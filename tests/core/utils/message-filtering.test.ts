/**
 * Unit Tests for Message Filtering in LLM Context
 *
 * Features:
 * - Tests for wouldAgentHaveRespondedToHistoricalMessage function
 * - Tests for prepareMessagesForLLM filtering logic
 * - Validates filtering matches shouldAgentRespond behavior
 * - Tests edge cases and complex mention scenarios
 *
 * Implementation:
 * - Tests historical message filtering in isolation
 * - Tests LLM context preparation with filtered history
 * - Validates agent response decision logic consistency
 * - Tests edge cases for memory pollution prevention
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  wouldAgentHaveRespondedToHistoricalMessage,
  prepareMessagesForLLM,
  messageDataToAgentMessage
} from '../../../core/utils';
import { Agent, AgentMessage, MessageData, SenderType, LLMProvider } from '../../../core/types';
import { createMockAgent } from '../mock-helpers';

describe('Message Filtering for LLM Context', () => {
  let mockAgent: Agent;

  beforeEach(() => {
    mockAgent = createMockAgent({
      id: 'test-agent',
      name: 'Test Agent',
      type: 'assistant',
      status: 'active',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 1000,
      createdAt: new Date(),
      lastActive: new Date(),
      llmCallCount: 0,
      memory: []
    });
  });

  describe('wouldAgentHaveRespondedToHistoricalMessage', () => {
    test('should include own messages', () => {
      const message: AgentMessage = {
        role: 'assistant',
        content: 'This is my own message',
        sender: 'test-agent',
        agentId: 'test-agent',
        createdAt: new Date()
      };

      const result = wouldAgentHaveRespondedToHistoricalMessage(mockAgent, message);
      expect(result).toBe(true);
    });

    test('should exclude messages from this agent (by sender)', () => {
      const message: AgentMessage = {
        role: 'user',
        content: 'Message from this agent',
        sender: 'test-agent',
        agentId: 'other-agent',
        createdAt: new Date()
      };

      const result = wouldAgentHaveRespondedToHistoricalMessage(mockAgent, message);
      expect(result).toBe(true); // Changed: own messages should be included
    });

    test('should exclude turn limit messages', () => {
      const message: AgentMessage = {
        role: 'user',
        content: 'Turn limit reached (5 LLM calls). Please take control.',
        sender: 'other-agent',
        agentId: 'other-agent',
        createdAt: new Date()
      };

      const result = wouldAgentHaveRespondedToHistoricalMessage(mockAgent, message);
      expect(result).toBe(false);
    });

    test('should exclude system messages', () => {
      const message: AgentMessage = {
        role: 'user',
        content: 'System error message',
        sender: 'system',
        agentId: 'system',
        createdAt: new Date()
      };

      const result = wouldAgentHaveRespondedToHistoricalMessage(mockAgent, message);
      expect(result).toBe(false);
    });

    test('should include world messages', () => {
      const message: AgentMessage = {
        role: 'user',
        content: 'World message to all agents',
        sender: 'world',
        agentId: 'world',
        createdAt: new Date()
      };

      const result = wouldAgentHaveRespondedToHistoricalMessage(mockAgent, message);
      expect(result).toBe(true);
    });

    test('should include tool messages', () => {
      const message: AgentMessage = {
        role: 'tool',
        content: 'Tool execution result',
        sender: 'tool',
        agentId: 'tool',
        createdAt: new Date()
      };

      const result = wouldAgentHaveRespondedToHistoricalMessage(mockAgent, message);
      expect(result).toBe(true);
    });

    describe('Human message handling', () => {
      test('should include public messages (no mentions)', () => {
        const message: AgentMessage = {
          role: 'user',
          content: 'Hello everyone!',
          sender: 'user',
          agentId: 'user',
          createdAt: new Date()
        };

        const result = wouldAgentHaveRespondedToHistoricalMessage(mockAgent, message);
        expect(result).toBe(true);
      });

      test('should include messages with paragraph-beginning mentions', () => {
        const message: AgentMessage = {
          role: 'user',
          content: '@test-agent, please help with this task.',
          sender: 'user',
          agentId: 'user',
          createdAt: new Date()
        };

        const result = wouldAgentHaveRespondedToHistoricalMessage(mockAgent, message);
        expect(result).toBe(true);
      });

      test('should exclude messages with mid-paragraph mentions only', () => {
        const message: AgentMessage = {
          role: 'user',
          content: 'I think @test-agent should handle this.',
          sender: 'user',
          agentId: 'user',
          createdAt: new Date()
        };

        const result = wouldAgentHaveRespondedToHistoricalMessage(mockAgent, message);
        expect(result).toBe(false);
      });

      test('should include messages with mentions after newlines', () => {
        const message: AgentMessage = {
          role: 'user',
          content: 'Hello everyone!\n@test-agent, please respond.',
          sender: 'user',
          agentId: 'user',
          createdAt: new Date()
        };

        const result = wouldAgentHaveRespondedToHistoricalMessage(mockAgent, message);
        expect(result).toBe(true);
      });

      test('should exclude messages mentioning other agents only', () => {
        const message: AgentMessage = {
          role: 'user',
          content: '@other-agent, please help.',
          sender: 'user',
          agentId: 'user',
          createdAt: new Date()
        };

        const result = wouldAgentHaveRespondedToHistoricalMessage(mockAgent, message);
        expect(result).toBe(false);
      });
    });

    describe('Agent message handling', () => {
      test('should include agent messages with paragraph-beginning mentions', () => {
        const message: AgentMessage = {
          role: 'user',
          content: '@test-agent, please handle this task.',
          sender: 'other-agent',
          agentId: 'other-agent',
          createdAt: new Date()
        };

        const result = wouldAgentHaveRespondedToHistoricalMessage(mockAgent, message);
        expect(result).toBe(true);
      });

      test('should exclude agent messages with mid-paragraph mentions', () => {
        const message: AgentMessage = {
          role: 'user',
          content: 'I think @test-agent should handle this.',
          sender: 'other-agent',
          agentId: 'other-agent',
          createdAt: new Date()
        };

        const result = wouldAgentHaveRespondedToHistoricalMessage(mockAgent, message);
        expect(result).toBe(false);
      });

      test('should exclude agent messages without mentions', () => {
        const message: AgentMessage = {
          role: 'user',
          content: 'This is a general message from another agent.',
          sender: 'other-agent',
          agentId: 'other-agent',
          createdAt: new Date()
        };

        const result = wouldAgentHaveRespondedToHistoricalMessage(mockAgent, message);
        expect(result).toBe(false);
      });
    });

    describe('Case sensitivity', () => {
      test('should handle case-insensitive agent ID matching', () => {
        const message: AgentMessage = {
          role: 'user',
          content: '@Test-Agent, please help.',
          sender: 'user',
          agentId: 'user',
          createdAt: new Date()
        };

        const result = wouldAgentHaveRespondedToHistoricalMessage(mockAgent, message);
        expect(result).toBe(true);
      });

      test('should handle case-insensitive sender matching', () => {
        const message: AgentMessage = {
          role: 'user',
          content: 'Message from agent',
          sender: 'Test-Agent', // Different case
          agentId: 'other-agent',
          createdAt: new Date()
        };

        const result = wouldAgentHaveRespondedToHistoricalMessage(mockAgent, message);
        expect(result).toBe(true); // Changed: own messages should be included
      });
    });
  });

  describe('prepareMessagesForLLM with filtering', () => {
    test('should filter out irrelevant messages from conversation history', () => {
      const messageData: MessageData = {
        id: 'current-msg',
        name: 'message',
        sender: 'user',
        content: '@test-agent, help me now',
        payload: {}
      };

      const conversationHistory: AgentMessage[] = [
        {
          role: 'user',
          content: 'Hi everyone', // Would respond (public message)
          sender: 'user',
          agentId: 'user',
          createdAt: new Date(),
          chatId: 'chat-1'
        },
        {
          role: 'user',
          content: 'I think @test-agent should help', // Would NOT respond (mid-mention)
          sender: 'user',
          agentId: 'user',
          createdAt: new Date(),
          chatId: 'chat-1'
        },
        {
          role: 'user',
          content: '@test-agent help please', // Would respond (mentioned)
          sender: 'user',
          agentId: 'user',
          createdAt: new Date(),
          chatId: 'chat-1'
        },
        {
          role: 'user',
          content: 'Agent-to-agent message without mention', // Would NOT respond
          sender: 'other-agent',
          agentId: 'other-agent',
          createdAt: new Date(),
          chatId: 'chat-1'
        }
      ];

      const result = prepareMessagesForLLM(mockAgent, messageData, conversationHistory, 'chat-1');

      // Should include: system + 2 relevant messages + current message = 4 total
      expect(result).toHaveLength(4);

      // Check that irrelevant messages are filtered out
      const contentMessages = result.slice(1, -1); // Skip system and current message
      expect(contentMessages).toHaveLength(2);
      expect(contentMessages[0].content).toBe('Hi everyone');
      expect(contentMessages[1].content).toBe('@test-agent help please');
    });

    test('should include system prompt when available', () => {
      const agentWithPrompt = {
        ...mockAgent,
        systemPrompt: 'You are a helpful assistant.'
      };

      const messageData: MessageData = {
        id: 'current-msg',
        name: 'message',
        sender: 'user',
        content: 'Hello',
        payload: {}
      };

      const result = prepareMessagesForLLM(agentWithPrompt, messageData, []);

      expect(result).toHaveLength(2); // system + current message
      expect(result[0].role).toBe('system');
      expect(result[0].content).toBe('You are a helpful assistant.');
    });

    test('should filter by chatId and relevance', () => {
      const messageData: MessageData = {
        id: 'current-msg',
        name: 'message',
        sender: 'user',
        content: 'Current message',
        payload: {}
      };

      const conversationHistory: AgentMessage[] = [
        {
          role: 'user',
          content: '@test-agent in chat 1', // Relevant but wrong chat
          sender: 'user',
          agentId: 'user',
          createdAt: new Date(),
          chatId: 'chat-1'
        },
        {
          role: 'user',
          content: 'I think @test-agent should help', // Right chat but not relevant
          sender: 'user',
          agentId: 'user',
          createdAt: new Date(),
          chatId: 'chat-2'
        },
        {
          role: 'user',
          content: '@test-agent in chat 2', // Relevant and right chat
          sender: 'user',
          agentId: 'user',
          createdAt: new Date(),
          chatId: 'chat-2'
        }
      ];

      const result = prepareMessagesForLLM(mockAgent, messageData, conversationHistory, 'chat-2');

      // Should include: system + 1 relevant message from chat-2 + current = 3 total
      expect(result).toHaveLength(3);
      expect(result[1].content).toBe('@test-agent in chat 2');
    });

    test('should handle empty conversation history', () => {
      const messageData: MessageData = {
        id: 'current-msg',
        name: 'message',
        sender: 'user',
        content: 'Hello',
        payload: {}
      };

      const result = prepareMessagesForLLM(mockAgent, messageData, []);

      expect(result).toHaveLength(2); // system + current message
      expect(result[1].content).toBe('Hello');
    });

    test('should handle agent without system prompt', () => {
      const agentWithoutPrompt = {
        ...mockAgent,
        systemPrompt: undefined
      };

      const messageData: MessageData = {
        id: 'current-msg',
        name: 'message',
        sender: 'user',
        content: 'Hello',
        payload: {}
      };

      const result = prepareMessagesForLLM(agentWithoutPrompt, messageData, []);

      expect(result).toHaveLength(1); // Only current message
      expect(result[0].content).toBe('Hello');
    });
  });

  describe('Integration scenarios', () => {
    test('should prevent memory pollution in multi-agent conversation', () => {
      // Simulate the example scenario:
      // User says "hi" → agent A responds → agent B should not see "hi" in future context

      const messageData: MessageData = {
        id: 'current-msg',
        name: 'message',
        sender: 'user',
        content: '@test-agent, help with new task',
        payload: {}
      };

      const conversationHistory: AgentMessage[] = [
        {
          role: 'user',
          content: 'hi', // Public message that test-agent would respond to
          sender: 'user',
          agentId: 'user',
          createdAt: new Date(),
          chatId: 'chat-1'
        },
        {
          role: 'assistant',
          content: 'how can I help you?', // Response from agent-a
          sender: 'agent-a',
          agentId: 'agent-a',
          createdAt: new Date(),
          chatId: 'chat-1'
        }
      ];

      // For test-agent, it should see:
      // - "hi" (because it's a public message test-agent would respond to)
      // - NOT "how can I help you?" (because test-agent wouldn't respond to agent-a's message)
      const result = prepareMessagesForLLM(mockAgent, messageData, conversationHistory, 'chat-1');

      expect(result).toHaveLength(3); // system + "hi" + current message
      const historyContent = result.slice(1, -1).map(msg => msg.content);
      expect(historyContent).toEqual(['hi']);
    });

    test('should handle complex mention patterns correctly', () => {
      const messageData: MessageData = {
        id: 'current-msg',
        name: 'message',
        sender: 'user',
        content: 'Current message',
        payload: {}
      };

      const conversationHistory: AgentMessage[] = [
        {
          role: 'user',
          content: `@test-agent, please start. Then ask @other-agent.
@test-agent should finish.`,
          sender: 'user',
          agentId: 'user',
          createdAt: new Date(),
          chatId: 'chat-1'
        },
        {
          role: 'user',
          content: 'I think @test-agent should handle this task.',
          sender: 'user',
          agentId: 'user',
          createdAt: new Date(),
          chatId: 'chat-1'
        }
      ];

      const result = prepareMessagesForLLM(mockAgent, messageData, conversationHistory, 'chat-1');

      // Should include first message (has paragraph-beginning mention) but not second
      expect(result).toHaveLength(3); // system + 1 relevant + current
      expect(result[1].content).toBe(`@test-agent, please start. Then ask @other-agent.
@test-agent should finish.`);
    });

    test('should filter out gray border (memory-only) messages correctly', () => {
      // This test documents the gray border scenario from the frontend
      // Gray border = agent message saved to other agent memory without response
      const messageData: MessageData = {
        id: 'current-msg',
        name: 'message',
        sender: 'user',
        content: '@test-agent, help me now',
        payload: {}
      };

      const conversationHistory: AgentMessage[] = [
        {
          role: 'user',
          content: 'Hi everyone', // Public message - test-agent would respond
          sender: 'user',
          agentId: 'user',
          createdAt: new Date(),
          chatId: 'chat-1'
        },
        {
          role: 'assistant',
          content: 'Hello! How can I help?', // Agent A responds
          sender: 'agent-a',
          agentId: 'agent-a',
          createdAt: new Date(),
          chatId: 'chat-1'
        },
        {
          role: 'user',
          content: 'Please help with @agent-a this task', // Mid-paragraph mention, test-agent wouldn't respond
          sender: 'user',
          agentId: 'user',
          createdAt: new Date(),
          chatId: 'chat-1'
        }
      ];

      const result = prepareMessagesForLLM(mockAgent, messageData, conversationHistory, 'chat-1');

      // Should include:
      // - system prompt
      // - "Hi everyone" (public message test-agent would respond to)
      // - NOT "Hello! How can I help?" (agent-a message without mention of test-agent)
      // - NOT "Please help with @agent-a this task" (mid-paragraph mention only)
      // - current message
      expect(result).toHaveLength(3); // system + 1 relevant + current
      expect(result[1].content).toBe('Hi everyone');
      expect(result[2].content).toBe('@test-agent, help me now');
    });
  });
});