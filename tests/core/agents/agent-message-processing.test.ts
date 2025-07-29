/**
 * Unit Tests for Agent Message Processing
 * 
 * Features:
 * - Tests for processAgentMessage function - core message processing logic
 * - Tests LLM call count reset logic for human/system messages
 * - Tests auto-mention functionality with self-mention removal
 * - Tests pass command handling and redirection
 * - Tests memory persistence and agent state saving
 * - Tests error handling and recovery scenarios
 * 
 * Implementation:
 * - Mocks all external dependencies (agent-storage, llm-manager)
 * - Uses Jest spies to verify function calls and arguments
 * - Tests both successful and error scenarios
 * - Verifies agent state changes and memory updates
 * - Tests auto-mention logic with various sender types
 */

import { describe, test, expect, beforeEach, beforeAll, jest, afterEach } from '@jest/globals';
import { World, Agent, WorldMessageEvent, AgentMessage, LLMProvider } from '../../../core/types';
import { createMockAgent } from '../mock-helpers';

// Mock dependencies
const mockSaveAgentMemoryToDisk = jest.fn();
const mockSaveAgentConfigToDisk = jest.fn();
const mockStreamAgentResponse = jest.fn();
const mockPublishMessage = jest.fn();
const mockPublishSSE = jest.fn();

// Mock modules that will be dynamically imported
jest.mock('../../../core/agent-storage', () => ({
  saveAgentMemoryToDisk: mockSaveAgentMemoryToDisk,
  saveAgentConfigToDisk: mockSaveAgentConfigToDisk
}));

jest.mock('../../../core/llm-manager', () => ({
  streamAgentResponse: mockStreamAgentResponse
}));

// Mock the entire events module to capture internal calls
jest.mock('../../../core/events', () => {
  const originalModule = jest.requireActual('../../../core/events') as any;
  return {
    ...originalModule,
    publishMessage: (...args: any[]) => mockPublishMessage(...args),
    publishSSE: (...args: any[]) => mockPublishSSE(...args)
  };
});

// Import the new function to test
import { processAgentMessage, resetLLMCallCountIfNeeded } from '../../../core/events';

describe('processAgentMessage', () => {
  let mockWorld: World;
  let mockAgent: Agent;
  let messageEvent: WorldMessageEvent;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup fresh mocks for each test

    // Inject a mock storage object that calls the expected mocks
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
      turnLimit: 5,
      storage: {
        saveAgent: async (worldId: string, agent: Agent) => {
          // Simulate both config and memory saves for test tracking
          await mockSaveAgentConfigToDisk('/test/path', worldId, agent);
          await mockSaveAgentMemoryToDisk('/test/path', worldId, agent.id, agent.memory);
        }
      }
    } as World;

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

    messageEvent = {
      content: 'Hello, please help me',
      sender: 'user',
      timestamp: new Date(),
      messageId: 'msg-1'
    };

    // Default mock responses
    (mockStreamAgentResponse as any).mockResolvedValue('Thank you for your message!');
    (mockSaveAgentMemoryToDisk as any).mockResolvedValue(undefined);
    (mockSaveAgentConfigToDisk as any).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('LLM Call Count Logic', () => {
    test('should increment LLM call count (reset happens elsewhere)', async () => {
      const agentWithLowCallCount = {
        ...mockAgent,
        llmCallCount: 2
      };

      const humanMessage: WorldMessageEvent = {
        content: 'Hello from human',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-human'
      };

      await processAgentMessage(mockWorld, agentWithLowCallCount, humanMessage);

      // Should only increment by 1 (reset happens in subscribeAgentToMessages, not here)
      expect(agentWithLowCallCount.llmCallCount).toBe(3);
      expect(mockSaveAgentConfigToDisk).toHaveBeenCalledWith('/test/path', 'test-world', agentWithLowCallCount);
    });

    test('should increment LLM call count for world messages', async () => {
      const agentWithLowCallCount = {
        ...mockAgent,
        llmCallCount: 1
      };

      const worldMessage: WorldMessageEvent = {
        content: 'World announcement',
        sender: 'world',
        timestamp: new Date(),
        messageId: 'msg-world'
      };

      await processAgentMessage(mockWorld, agentWithLowCallCount, worldMessage);

      // Should only increment by 1 (reset happens in subscribeAgentToMessages, not here)
      expect(agentWithLowCallCount.llmCallCount).toBe(2);
    });

    test('should increment LLM call count for agent messages', async () => {
      const agentWithLowCallCount = {
        ...mockAgent,
        llmCallCount: 2
      };

      const agentMessage: WorldMessageEvent = {
        content: '@test-agent hello from another agent',
        sender: 'other-agent',
        timestamp: new Date(),
        messageId: 'msg-agent'
      };

      await processAgentMessage(mockWorld, agentWithLowCallCount, agentMessage);

      // Should just increment: 2 -> 3
      expect(agentWithLowCallCount.llmCallCount).toBe(3);
    });

    test('should update lastLLMCall timestamp', async () => {
      const oldTimestamp = new Date('2023-01-01');
      const agentWithOldTimestamp = {
        ...mockAgent,
        lastLLMCall: oldTimestamp
      };

      await processAgentMessage(mockWorld, agentWithOldTimestamp, messageEvent);

      expect(agentWithOldTimestamp.lastLLMCall).not.toEqual(oldTimestamp);
      expect(agentWithOldTimestamp.lastLLMCall).toBeInstanceOf(Date);
    });
  });

  describe('Memory Management', () => {
    test('should save incoming message to memory', async () => {
      await processAgentMessage(mockWorld, mockAgent, messageEvent);

      // Should have saved incoming user message
      expect(mockAgent.memory).toHaveLength(2); // incoming + response
      expect(mockAgent.memory[0]).toEqual({
        role: 'user',
        content: 'Hello, please help me',
        sender: 'user',
        createdAt: messageEvent.timestamp
      });
    });

    test('should save LLM response to memory', async () => {
      const llmResponse = 'I am happy to help you!';
      (mockStreamAgentResponse as any).mockResolvedValue(llmResponse);

      await processAgentMessage(mockWorld, mockAgent, messageEvent);

      // Should have saved LLM response
      expect(mockAgent.memory).toHaveLength(2);
      expect(mockAgent.memory[1]).toEqual({
        role: 'assistant',
        content: llmResponse,
        createdAt: expect.any(Date)
      });
    });

    test('should auto-save memory to disk', async () => {
      await processAgentMessage(mockWorld, mockAgent, messageEvent);

      expect(mockSaveAgentMemoryToDisk).toHaveBeenCalledWith(
        '/test/path',
        'test-world',
        'test-agent',
        expect.any(Array)
      );
    });

    test('should not save own messages to memory', async () => {
      const ownMessage: WorldMessageEvent = {
        content: 'My own message',
        sender: 'test-agent',
        timestamp: new Date(),
        messageId: 'msg-own'
      };

      await processAgentMessage(mockWorld, mockAgent, ownMessage);

      // Should only have the LLM response, not the incoming message
      expect(mockAgent.memory).toHaveLength(1);
      expect(mockAgent.memory[0].role).toBe('assistant');
    });

    test('should save system messages to memory', async () => {
      const systemMessage: WorldMessageEvent = {
        content: 'System error message',
        sender: 'system',
        timestamp: new Date(),
        messageId: 'msg-system'
      };

      await processAgentMessage(mockWorld, mockAgent, systemMessage);

      // Should have saved both incoming system message and response
      expect(mockAgent.memory).toHaveLength(2);
      expect(mockAgent.memory[0]).toEqual({
        role: 'user',
        content: 'System error message',
        sender: 'system',
        createdAt: systemMessage.timestamp
      });
      expect(mockAgent.memory[1].role).toBe('assistant');
    });

    test('should save world messages to memory', async () => {
      const worldMessage: WorldMessageEvent = {
        content: 'World announcement',
        sender: 'world',
        timestamp: new Date(),
        messageId: 'msg-world'
      };

      await processAgentMessage(mockWorld, mockAgent, worldMessage);

      // Should have saved both incoming world message and response
      expect(mockAgent.memory).toHaveLength(2);
      expect(mockAgent.memory[0]).toEqual({
        role: 'user',
        content: 'World announcement',
        sender: 'world',
        createdAt: worldMessage.timestamp
      });
      expect(mockAgent.memory[1].role).toBe('assistant');
    });
  });

  describe('Auto-Mention Logic', () => {
    test('should process agent messages and update memory', async () => {
      const responseWithoutMention = 'Thank you for the message!';
      (mockStreamAgentResponse as any).mockResolvedValue(responseWithoutMention);

      const agentMessage: WorldMessageEvent = {
        content: '@test-agent hello',
        sender: 'other-agent',
        timestamp: new Date(),
        messageId: 'msg-agent'
      };

      await processAgentMessage(mockWorld, mockAgent, agentMessage);

      // Should have saved both incoming and outgoing messages to memory
      expect(mockAgent.memory).toHaveLength(2);
      expect(mockAgent.memory[0]).toEqual({
        role: 'user',
        content: '@test-agent hello',
        sender: 'other-agent',
        createdAt: agentMessage.timestamp
      });
      // The final response should have auto-mention added for agent sender
      expect(mockAgent.memory[1]).toEqual({
        role: 'assistant',
        content: '@other-agent Thank you for the message!',
        createdAt: expect.any(Date)
      });
    });

    test('should handle human messages without auto-mention', async () => {
      const responseWithoutMention = 'Thank you for the message!';
      (mockStreamAgentResponse as any).mockResolvedValue(responseWithoutMention);

      const humanMessage: WorldMessageEvent = {
        content: 'Hello from human',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-human'
      };

      await processAgentMessage(mockWorld, mockAgent, humanMessage);

      // Should have saved both messages to memory
      expect(mockAgent.memory).toHaveLength(2);
      expect(mockAgent.memory[1].content).toBe(responseWithoutMention);
    });

    test('should process responses and save to memory', async () => {
      const responseWithMention = '@someone Thank you for the message!';
      (mockStreamAgentResponse as any).mockResolvedValue(responseWithMention);

      const agentMessage: WorldMessageEvent = {
        content: '@test-agent hello',
        sender: 'other-agent',
        timestamp: new Date(),
        messageId: 'msg-agent'
      };

      await processAgentMessage(mockWorld, mockAgent, agentMessage);

      // Should save the response as-is to memory
      expect(mockAgent.memory[1].content).toBe(responseWithMention);
    });
  });

  describe('Response Processing - All Content Treated Normally', () => {
    test('should save response with pass-like content to memory', async () => {
      const responseWithPassLike = 'I need help with this <world>pass</world>';
      (mockStreamAgentResponse as any).mockResolvedValue(responseWithPassLike);

      await processAgentMessage(mockWorld, mockAgent, messageEvent);

      // Should treat as normal response, not special pass command
      expect(mockAgent.memory[1]).toEqual({
        role: 'assistant',
        content: responseWithPassLike,
        createdAt: expect.any(Date)
      });
    });

    test('should save case-insensitive pass-like content to memory', async () => {
      const passResponse = 'I need help <WORLD>PASS</WORLD>';
      (mockStreamAgentResponse as any).mockResolvedValue(passResponse);

      await processAgentMessage(mockWorld, mockAgent, messageEvent);

      // Should treat as normal response
      expect(mockAgent.memory[1].content).toBe(passResponse);
    });
  });

  describe('Error Handling', () => {
    test('should handle LLM errors gracefully', async () => {
      const llmError = new Error('LLM service unavailable');
      (mockStreamAgentResponse as any).mockRejectedValue(llmError);

      await processAgentMessage(mockWorld, mockAgent, messageEvent);

      // Should still have saved the incoming message to memory
      expect(mockAgent.memory).toHaveLength(1);
      expect(mockAgent.memory[0]).toEqual({
        role: 'user',
        content: 'Hello, please help me',
        sender: 'user',
        createdAt: messageEvent.timestamp
      });
    });

    test('should handle memory save errors gracefully', async () => {
      const saveError = new Error('Disk full');
      (mockSaveAgentMemoryToDisk as any).mockRejectedValue(saveError);

      // Should not throw, just log warning
      await expect(processAgentMessage(mockWorld, mockAgent, messageEvent)).resolves.not.toThrow();
    });

    test('should handle config save errors gracefully', async () => {
      const saveError = new Error('Permission denied');
      (mockSaveAgentConfigToDisk as any).mockRejectedValue(saveError);

      // Should not throw, just log warning
      await expect(processAgentMessage(mockWorld, mockAgent, messageEvent)).resolves.not.toThrow();
    });

    test('should still increment LLM call count on LLM errors', async () => {
      const llmError = new Error('LLM service unavailable');
      (mockStreamAgentResponse as any).mockRejectedValue(llmError);

      await processAgentMessage(mockWorld, mockAgent, messageEvent);

      // Should have incremented call count even on error
      expect(mockAgent.llmCallCount).toBe(1);
    });
  });

  describe('Agent State Management', () => {
    test('should save agent config after call count changes', async () => {
      await processAgentMessage(mockWorld, mockAgent, messageEvent);

      expect(mockSaveAgentConfigToDisk).toHaveBeenCalledWith(
        '/test/path',
        'test-world',
        mockAgent
      );
    });

    test('should group disk operations efficiently', async () => {
      await processAgentMessage(mockWorld, mockAgent, messageEvent);

      // Should save config three times (once per saveAgent call) and memory three times (once per saveAgent call)
      expect(mockSaveAgentConfigToDisk).toHaveBeenCalledTimes(3);
      expect(mockSaveAgentMemoryToDisk).toHaveBeenCalledTimes(3);
    });
  });

  describe('Conversation History', () => {
    test('should use last 10 messages for context', async () => {
      // Setup agent with 15 messages in memory
      const longMemory: AgentMessage[] = Array.from({ length: 15 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        createdAt: new Date()
      }));

      mockAgent.memory = longMemory;

      await processAgentMessage(mockWorld, mockAgent, messageEvent);

      // Should have called streamAgentResponse with prepared messages
      const callArgs = mockStreamAgentResponse.mock.calls[0];
      expect(callArgs[0]).toBe(mockWorld);
      expect(callArgs[1]).toBe(mockAgent);
      const messages = callArgs[2] as import('../../../core/types').AgentMessage[];
      // First message should be system prompt
      expect(messages[0]).toMatchObject({ role: 'system', content: mockAgent.systemPrompt });
      // Next 10 messages should be the last 10 from memory
  const last10 = longMemory.slice(6, 16);
      // LLM context: [system prompt, last 10 memory, new user message]
      for (let i = 0; i < 10; i++) {
        expect(messages[i + 1]).toMatchObject({ content: last10[i].content, role: last10[i].role });
      }
      // The last message should be the new user message
      expect(messages[11]).toMatchObject({ role: 'user', content: messageEvent.content });
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty LLM response', async () => {
      (mockStreamAgentResponse as any).mockResolvedValue('');

      await processAgentMessage(mockWorld, mockAgent, messageEvent);

      // Should not publish empty message
      expect(mockPublishMessage).not.toHaveBeenCalled();
    });

    test('should handle whitespace-only LLM response', async () => {
      (mockStreamAgentResponse as any).mockResolvedValue('   \n  \t  ');

      await processAgentMessage(mockWorld, mockAgent, messageEvent);

      // Should not publish whitespace-only message
      expect(mockPublishMessage).not.toHaveBeenCalled();
    });

    test('should handle undefined sender', async () => {
      const messageWithUndefinedSender: WorldMessageEvent = {
        content: 'Message with undefined sender',
        sender: undefined as any,
        timestamp: new Date(),
        messageId: 'msg-undefined'
      };

      await expect(processAgentMessage(mockWorld, mockAgent, messageWithUndefinedSender)).resolves.not.toThrow();
    });

    test('should handle very long messages', async () => {
      const longMessage: WorldMessageEvent = {
        content: 'A'.repeat(100000),
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-long'
      };

      await expect(processAgentMessage(mockWorld, mockAgent, longMessage)).resolves.not.toThrow();
    });
  });
});

describe('resetLLMCallCountIfNeeded', () => {
  let mockWorld: World;
  let mockAgent: Agent;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

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
      turnLimit: 5,
      storage: {
        saveAgent: async (worldId: string, agent: Agent) => {
          await mockSaveAgentConfigToDisk('/test/path', worldId, agent);
        }
      }
    } as World;

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

    // Default mock responses
    (mockSaveAgentConfigToDisk as any).mockResolvedValue(undefined);
  });

  test('should reset LLM call count for human messages', async () => {
    const agentWithHighCallCount = {
      ...mockAgent,
      llmCallCount: 3
    };

    const humanMessage: WorldMessageEvent = {
      content: 'Hello from human',
      sender: 'user',
      timestamp: new Date(),
      messageId: 'msg-human'
    };

    await resetLLMCallCountIfNeeded(mockWorld, agentWithHighCallCount, humanMessage);

    expect(agentWithHighCallCount.llmCallCount).toBe(0);
    expect(mockSaveAgentConfigToDisk).toHaveBeenCalledWith('/test/path', 'test-world', agentWithHighCallCount);
  });

  test('should reset LLM call count for world messages', async () => {
    const agentWithHighCallCount = {
      ...mockAgent,
      llmCallCount: 4
    };

    const worldMessage: WorldMessageEvent = {
      content: 'World notification',
      sender: 'world',
      timestamp: new Date(),
      messageId: 'msg-world'
    };

    await resetLLMCallCountIfNeeded(mockWorld, agentWithHighCallCount, worldMessage);

    expect(agentWithHighCallCount.llmCallCount).toBe(0);
    expect(mockSaveAgentConfigToDisk).toHaveBeenCalledWith('/test/path', 'test-world', agentWithHighCallCount);
  });

  test('should NOT reset LLM call count for system messages', async () => {
    const agentWithHighCallCount = {
      ...mockAgent,
      llmCallCount: 4
    };

    const systemMessage: WorldMessageEvent = {
      content: 'System error notification',
      sender: 'system',
      timestamp: new Date(),
      messageId: 'msg-system'
    };

    await resetLLMCallCountIfNeeded(mockWorld, agentWithHighCallCount, systemMessage);

    expect(agentWithHighCallCount.llmCallCount).toBe(4); // Should NOT reset for system messages
    expect(mockSaveAgentConfigToDisk).not.toHaveBeenCalled();
  });

  test('should NOT reset LLM call count for agent messages', async () => {
    const agentWithHighCallCount = {
      ...mockAgent,
      llmCallCount: 2
    };

    const agentMessage: WorldMessageEvent = {
      content: '@test-agent hello from another agent',
      sender: 'other-agent',
      timestamp: new Date(),
      messageId: 'msg-agent'
    };

    await resetLLMCallCountIfNeeded(mockWorld, agentWithHighCallCount, agentMessage);

    // Should NOT reset for agent messages
    expect(agentWithHighCallCount.llmCallCount).toBe(2);
    expect(mockSaveAgentConfigToDisk).not.toHaveBeenCalled();
  });

  test('should not reset when call count is already 0', async () => {
    const agentWithZeroCallCount = {
      ...mockAgent,
      llmCallCount: 0
    };

    const humanMessage: WorldMessageEvent = {
      content: 'Hello from human',
      sender: 'user',
      timestamp: new Date(),
      messageId: 'msg-human'
    };

    await resetLLMCallCountIfNeeded(mockWorld, agentWithZeroCallCount, humanMessage);

    // Should not save to disk when no reset needed
    expect(agentWithZeroCallCount.llmCallCount).toBe(0);
    expect(mockSaveAgentConfigToDisk).not.toHaveBeenCalled();
  });

  test('should handle save errors gracefully', async () => {
    const agentWithHighCallCount = {
      ...mockAgent,
      llmCallCount: 3
    };

    const saveError = new Error('Disk full');
    (mockSaveAgentConfigToDisk as any).mockRejectedValue(saveError);

    const humanMessage: WorldMessageEvent = {
      content: 'Hello from human',
      sender: 'user',
      timestamp: new Date(),
      messageId: 'msg-human'
    };

    // Should not throw, just log warning
    await expect(resetLLMCallCountIfNeeded(mockWorld, agentWithHighCallCount, humanMessage)).resolves.not.toThrow();

    // Count should still be reset even if save fails
    expect(agentWithHighCallCount.llmCallCount).toBe(0);
  });

  test('should handle undefined sender gracefully', async () => {
    const agentWithHighCallCount = {
      ...mockAgent,
      llmCallCount: 2
    };

    const messageWithUndefinedSender: WorldMessageEvent = {
      content: 'Message with undefined sender',
      sender: undefined as any,
      timestamp: new Date(),
      messageId: 'msg-undefined'
    };

    await expect(resetLLMCallCountIfNeeded(mockWorld, agentWithHighCallCount, messageWithUndefinedSender)).resolves.not.toThrow();

    // Should treat undefined as system message and NOT reset (system messages don't reset count anymore)
    expect(agentWithHighCallCount.llmCallCount).toBe(2);
  });
});
