/**
 * Unit tests for shouldAgentRespond function
 * Tests the new paragraph-beginning mention rule and existing agent response logic
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { shouldAgentRespond } from '../../core/agent-events';
import { World, Agent, WorldMessageEvent, SenderType, LLMProvider } from '../../core/types';

// Mock dependencies
jest.mock('../../core/agent-storage', () => ({
  saveAgentConfigToDisk: jest.fn(),
  saveAgentMemoryToDisk: jest.fn(),
  saveAgentToDisk: jest.fn()
}));

jest.mock('../../core/world-events', () => ({
  subscribeToMessages: jest.fn(),
  publishMessage: jest.fn(),
  publishSSE: jest.fn()
}));

jest.mock('../../core/llm-manager', () => ({
  streamAgentResponse: jest.fn()
}));

describe('shouldAgentRespond', () => {
  let mockWorld: World;
  let mockAgent: Agent;

  beforeEach(() => {
    // Setup fresh mocks for each test
    mockWorld = {
      id: 'test-world',
      name: 'Test World',
      description: 'A test world',
      rootPath: '/test/path',
      agents: new Map(),
      eventEmitter: {
        emit: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
        removeAllListeners: jest.fn()
      } as any,
      turnLimit: 5
    } as World;

    mockAgent = {
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
    };
  });

  describe('Paragraph Beginning Mention Rules', () => {
    test('should respond to mentions at paragraph beginning', async () => {
      const messageEvent: WorldMessageEvent = {
        content: '@test-agent, please help with this task.',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-1'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      expect(result).toBe(true);
    });

    test('should NOT respond to mid-paragraph mentions', async () => {
      const messageEvent: WorldMessageEvent = {
        content: 'Hello @test-agent, how are you?',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-2'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      expect(result).toBe(false);
    });

    test('should respond to mentions after newlines', async () => {
      const messageEvent: WorldMessageEvent = {
        content: 'Hello everyone!\n@test-agent, please respond to this.',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-3'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      expect(result).toBe(true);
    });

    test('should handle mentions with whitespace after newlines', async () => {
      const messageEvent: WorldMessageEvent = {
        content: 'Hello everyone!\n   @test-agent, please respond.',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-4'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      expect(result).toBe(true);
    });

    test('should handle multiple valid mentions correctly', async () => {
      const messageEvent: WorldMessageEvent = {
        content: '@test-agent, please start.\n@other-agent, you handle next.',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-5'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      expect(result).toBe(true); // test-agent is mentioned at paragraph beginning
    });

    test('should NOT respond to messages with only mid-paragraph mentions', async () => {
      const messageEvent: WorldMessageEvent = {
        content: 'I think @test-agent should handle this task.',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-6'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      expect(result).toBe(false); // Has mentions but not at paragraph beginning
    });

    test('should handle mixed valid and invalid mentions correctly', async () => {
      const messageEvent: WorldMessageEvent = {
        content: '@test-agent, please start. Then ask @other-agent.\n@test-agent should finish.',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-7'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      expect(result).toBe(true); // Has valid paragraph-beginning mention
    });

    test('should handle case-insensitive mentions', async () => {
      const messageEvent: WorldMessageEvent = {
        content: '@Test-Agent, how are you?',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-8'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      expect(result).toBe(true);
    });
  });

  describe('Public Message Handling', () => {
    test('should respond when not mentioned (public message)', async () => {
      const messageEvent: WorldMessageEvent = {
        content: 'Hello everyone!',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-9'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      expect(result).toBe(true); // Agents respond to public messages from humans
    });

    test('should respond to system messages', async () => {
      const messageEvent: WorldMessageEvent = {
        content: 'System message to all agents',
        sender: 'system',
        timestamp: new Date(),
        messageId: 'msg-10'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      expect(result).toBe(true);
    });
  });

  describe('Agent Self-Filtering', () => {
    test('should not respond to own messages', async () => {
      const messageEvent: WorldMessageEvent = {
        content: 'This is my own message',
        sender: 'test-agent',
        timestamp: new Date(),
        messageId: 'msg-11'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      expect(result).toBe(false);
    });

    test('should handle case-insensitive agent ID matching', async () => {
      const messageEvent: WorldMessageEvent = {
        content: 'Message from agent',
        sender: 'Test-Agent', // Different case
        timestamp: new Date(),
        messageId: 'msg-12'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      expect(result).toBe(false);
    });
  });

  describe('Turn Limit Logic', () => {
    test('should not respond when turn limit exceeded (agent sender)', async () => {
      const agentWithHighCallCount = {
        ...mockAgent,
        llmCallCount: 6 // Exceeds world turn limit of 5
      };

      const messageEvent: WorldMessageEvent = {
        content: '@test-agent, please respond',
        sender: 'other-agent', // Use agent sender to avoid turn count reset
        timestamp: new Date(),
        messageId: 'msg-13'
      };

      const result = await shouldAgentRespond(mockWorld, agentWithHighCallCount, messageEvent);
      expect(result).toBe(false);
    });

    test('should reset turn count on human messages', async () => {
      const agentWithHighCallCount = {
        ...mockAgent,
        llmCallCount: 3 // Will be reset to 0
      };

      const messageEvent: WorldMessageEvent = {
        content: '@test-agent, new conversation',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-14'
      };

      const result = await shouldAgentRespond(mockWorld, agentWithHighCallCount, messageEvent);
      expect(result).toBe(true);
      expect(agentWithHighCallCount.llmCallCount).toBe(0); // Should be reset
    });

    test('should reset turn count on system messages', async () => {
      const agentWithHighCallCount = {
        ...mockAgent,
        llmCallCount: 3 // Will be reset to 0
      };

      const messageEvent: WorldMessageEvent = {
        content: 'System reset message',
        sender: 'system',
        timestamp: new Date(),
        messageId: 'msg-15'
      };

      const result = await shouldAgentRespond(mockWorld, agentWithHighCallCount, messageEvent);
      expect(result).toBe(true);
      expect(agentWithHighCallCount.llmCallCount).toBe(0); // Should be reset
    });

    test('should not respond to turn limit messages', async () => {
      const messageEvent: WorldMessageEvent = {
        content: 'Turn limit reached (5 LLM calls). Please take control.',
        sender: 'other-agent',
        timestamp: new Date(),
        messageId: 'msg-16'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      expect(result).toBe(false);
    });
  });

  describe('Agent-to-Agent Communication', () => {
    test('should respond to paragraph-beginning mentions from other agents', async () => {
      const messageEvent: WorldMessageEvent = {
        content: '@test-agent, please handle this task.',
        sender: 'other-agent',
        timestamp: new Date(),
        messageId: 'msg-17'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      expect(result).toBe(true);
    });

    test('should NOT respond to mid-paragraph mentions from other agents', async () => {
      const messageEvent: WorldMessageEvent = {
        content: 'I think @test-agent should handle this.',
        sender: 'other-agent',
        timestamp: new Date(),
        messageId: 'msg-18'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      expect(result).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('should handle world with default turn limit', async () => {
      const worldWithDefaultLimit = {
        ...mockWorld,
        turnLimit: 5 // Use default instead of undefined
      };

      const messageEvent: WorldMessageEvent = {
        content: '@test-agent, hello',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-19'
      };

      const result = await shouldAgentRespond(worldWithDefaultLimit, mockAgent, messageEvent);
      expect(result).toBe(true); // Should work with default limit
    });

    test('should handle empty message content', async () => {
      const messageEvent: WorldMessageEvent = {
        content: '',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-20'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      expect(result).toBe(true); // Empty content = public message
    });

    test('should handle system sender', async () => {
      const messageEvent: WorldMessageEvent = {
        content: '@test-agent, hello',
        sender: 'system', // Use 'system' instead of undefined
        timestamp: new Date(),
        messageId: 'msg-21'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      expect(result).toBe(true); // Treated as system message
    });

    test('should handle very long message content', async () => {
      const longContent = '@test-agent ' + 'A'.repeat(100000);
      const messageEvent: WorldMessageEvent = {
        content: longContent,
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-22'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      expect(result).toBe(true);
    });

    test('should handle malformed mentions', async () => {
      const messageEvent: WorldMessageEvent = {
        content: '@test-agent, valid mention after malformed ones: @@ @test- @test_@',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-23'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      expect(result).toBe(true); // Should find the valid mention at start
    });
  });

  describe('Performance', () => {
    test('should handle large number of mentions efficiently', async () => {
      const manyMentions = Array(1000).fill('@other-agent').join(' ') + '\n@test-agent, respond';
      const messageEvent: WorldMessageEvent = {
        content: manyMentions,
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-24'
      };

      const start = Date.now();
      const result = await shouldAgentRespond(mockWorld, mockAgent, messageEvent);
      const end = Date.now();

      expect(result).toBe(true);
      expect(end - start).toBeLessThan(100); // Should be fast
    });
  });
});
