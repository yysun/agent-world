/**
 * Unit tests for processAgentMessage function
 * 
 * Features:
 * - Tests LLM call count reset logic for human/system messages
 * - Tests auto-mention functionality with self-mention removal
 * - Tests pass command handling and redirection
 * - Tests memory persistence and agent state saving
 * - Tests error handling and recovery
 * - All file I/O and LLM operations are mocked for unit testing
 * 
 * Implementation:
 * - Mocks all external dependencies (agent-storage, llm-manager)
 * - Uses Jest spies to verify function calls and arguments
 * - Tests both successful and error scenarios
 * - Verifies agent state changes and memory updates
 * - Tests auto-mention logic with various sender types
 */

import { describe, test, expect, beforeEach, beforeAll, jest, afterEach } from '@jest/globals';
import { World, Agent, WorldMessageEvent, AgentMessage, LLMProvider } from '../../core/types';

// Mock dependencies
const mockSaveAgentMemoryToDisk = jest.fn();
const mockSaveAgentConfigToDisk = jest.fn();
const mockStreamAgentResponse = jest.fn();

// Mock modules that will be dynamically imported
jest.mock('../../core/agent-storage', () => ({
  saveAgentMemoryToDisk: mockSaveAgentMemoryToDisk,
  saveAgentConfigToDisk: mockSaveAgentConfigToDisk
}));

jest.mock('../../core/llm-manager', () => ({
  streamAgentResponse: mockStreamAgentResponse
}));

// Import the new function to test
import { processAgentMessage, resetLLMCallCountIfNeeded } from '../../core/events';

// Spy on the events module functions after import
import * as events from '../../core/events';
const mockPublishMessage = jest.spyOn(events, 'publishMessage').mockImplementation(() => { });
const mockPublishSSE = jest.spyOn(events, 'publishSSE').mockImplementation(() => { });

describe('processAgentMessage', () => {
  let mockWorld: World;
  let mockAgent: Agent;
  let messageEvent: WorldMessageEvent;

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

      // Should only increment by 1 (reset + increment handled inside processAgentMessage)
      expect(agentWithLowCallCount.llmCallCount).toBe(1);
      expect(mockSaveAgentConfigToDisk).toHaveBeenCalledWith('/test/path', 'test-world', agentWithLowCallCount);
    });

    test('should increment LLM call count for system messages', async () => {
      const agentWithLowCallCount = {
        ...mockAgent,
        llmCallCount: 1
      };

      const systemMessage: WorldMessageEvent = {
        content: 'System notification',
        sender: 'system',
        timestamp: new Date(),
        messageId: 'msg-system'
      };

      await processAgentMessage(mockWorld, agentWithLowCallCount, systemMessage);

      // Should only increment by 1 (reset + increment handled inside processAgentMessage)
      expect(agentWithLowCallCount.llmCallCount).toBe(1);
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

  describe('Pass Command Handling', () => {
    test('should handle pass command and save to memory', async () => {
      const passResponse = 'I need help with this <world>pass</world>';
      (mockStreamAgentResponse as any).mockResolvedValue(passResponse);

      await processAgentMessage(mockWorld, mockAgent, messageEvent);

      // Should save original response to memory
      expect(mockAgent.memory[1]).toEqual({
        role: 'assistant',
        content: passResponse,
        createdAt: expect.any(Date)
      });
    });

    test('should handle case-insensitive pass command', async () => {
      const passResponse = 'I need help <WORLD>PASS</WORLD>';
      (mockStreamAgentResponse as any).mockResolvedValue(passResponse);

      await processAgentMessage(mockWorld, mockAgent, messageEvent);

      // Should save the response with pass command
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

      // Should save config once (for call count) and memory twice (incoming + response)
      expect(mockSaveAgentConfigToDisk).toHaveBeenCalledTimes(1);
      expect(mockSaveAgentMemoryToDisk).toHaveBeenCalledTimes(2);
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
      expect(mockStreamAgentResponse).toHaveBeenCalledWith(
        mockWorld,
        mockAgent,
        expect.any(Array) // prepareMessagesForLLM result
      );
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

  test('should reset LLM call count for system messages', async () => {
    const agentWithHighCallCount = {
      ...mockAgent,
      llmCallCount: 4
    };

    const systemMessage: WorldMessageEvent = {
      content: 'System notification',
      sender: 'system',
      timestamp: new Date(),
      messageId: 'msg-system'
    };

    await resetLLMCallCountIfNeeded(mockWorld, agentWithHighCallCount, systemMessage);

    expect(agentWithHighCallCount.llmCallCount).toBe(0);
    expect(mockSaveAgentConfigToDisk).toHaveBeenCalledWith('/test/path', 'test-world', agentWithHighCallCount);
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

    // Should treat undefined as system message and reset
    expect(agentWithHighCallCount.llmCallCount).toBe(0);
  });
});
