/**
 * Unit Tests for Agent Events Module
 *
 * Features:
 * - Tests for agent subscription management with mocked world events
 * - Tests for message filtering and response logic
 * - Tests for memory persistence with mocked file operations
 *
 * Implementation:
 * - Uses comprehensive mock infrastructure for isolation
 * - Tests all agent event functions with proper mocking
 * - Validates message filtering and response logic
 * - Tests error scenarios with mocked failures
 * - Verifies proper world event integration
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import './setup';
import { subscribeAgentToMessages, processAgentMessage, shouldAgentRespond, saveIncomingMessageToMemory } from '../../core/agent-events';
import { Agent, World, LLMProvider, WorldMessageEvent } from '../../core/types';
import { resetAllMocks, createMockAgent, setupMockEnvironment, cleanupMockEnvironment } from './mock-helpers';

// Mock core modules
jest.mock('../../core/world-events', () => ({
  subscribeToMessages: jest.fn(),
  publishMessage: jest.fn(),
  publishSSE: jest.fn()
}));

jest.mock('../../core/agent-storage', () => ({
  saveAgentToDisk: jest.fn(),
  loadAgentFromDisk: jest.fn(),
  saveAgentMemoryToDisk: jest.fn(),
  saveAgentConfigToDisk: jest.fn()
}));

jest.mock('../../core/llm-manager', () => ({
  streamAgentResponse: jest.fn()
}));

const mockWorldEvents = require('../../core/world-events');
const mockAgentStorage = require('../../core/agent-storage');
const mockLLMManager = require('../../core/llm-manager');

describe('Agent Events Module', () => {
  let mockAgent: Agent;
  let mockWorld: World;
  let mockMessageEvent: WorldMessageEvent;

  beforeEach(() => {
    setupMockEnvironment();
    resetAllMocks();

    // Create test fixtures
    mockAgent = createMockAgent({
      id: 'test-agent',
      name: 'test-agent', // Match the ID for mention testing
      llmCallCount: 2,
      memory: []
    });

    mockWorld = {
      id: 'test-world',
      name: 'Test World',
      turnLimit: 5,
      rootPath: 'test-data/worlds',
      eventEmitter: {
        on: jest.fn(),
        emit: jest.fn(),
        removeListener: jest.fn()
      } as any
    } as World;

    mockMessageEvent = {
      content: '@test-agent Hello', // Move mention to paragraph beginning to trigger response
      sender: 'user',
      timestamp: new Date(),
      messageId: 'msg-1'
    };

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanupMockEnvironment();
    resetAllMocks();
  });

  describe('subscribeAgentToMessages', () => {
    test('should subscribe agent to world messages', async () => {
      subscribeAgentToMessages(mockWorld, mockAgent);

      expect(mockWorldEvents.subscribeToMessages).toHaveBeenCalledWith(
        mockWorld,
        expect.any(Function)
      );
    });

    test('should handle subscription errors gracefully', async () => {
      mockWorldEvents.subscribeToMessages.mockImplementation(() => {
        throw new Error('Subscription failed');
      });

      expect(() => subscribeAgentToMessages(mockWorld, mockAgent))
        .toThrow('Subscription failed');
    });
  });

  describe('processAgentMessage', () => {
    beforeEach(() => {
      // Setup default mock responses
      mockLLMManager.streamAgentResponse.mockResolvedValue('Mock LLM response');
      mockAgentStorage.saveAgentToDisk.mockResolvedValue(undefined);
      mockAgentStorage.saveAgentMemoryToDisk.mockResolvedValue(undefined);
      mockAgentStorage.saveAgentConfigToDisk.mockResolvedValue(undefined);
    });

    test('should process agent message and generate response', async () => {
      // Ensure the mock message will trigger shouldAgentRespond to return true
      const testMessageEvent: WorldMessageEvent = {
        content: '@test-agent Hello', // Move mention to paragraph beginning
        sender: 'user', // Human sender, will trigger response
        timestamp: new Date(),
        messageId: 'msg-test'
      };

      await processAgentMessage(mockWorld, mockAgent, testMessageEvent);

      expect(mockLLMManager.streamAgentResponse).toHaveBeenCalled();
      expect(mockAgentStorage.saveAgentConfigToDisk).toHaveBeenCalled();
    });

    test('should handle LLM timeout gracefully', async () => {
      mockLLMManager.streamAgentResponse.mockRejectedValue(new Error('Request timeout'));

      // Spy on console.error to verify error is logged
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

      await processAgentMessage(mockWorld, mockAgent, mockMessageEvent);

      expect(consoleSpy).toHaveBeenCalledWith(
        `Agent ${mockAgent.id} failed to process message:`,
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    test('should increment LLM call count', async () => {
      const initialCallCount = mockAgent.llmCallCount;
      await processAgentMessage(mockWorld, mockAgent, mockMessageEvent);
      expect(mockAgent.llmCallCount).toBe(initialCallCount + 1);
    });
  });

  describe('saveIncomingMessageToMemory', () => {
    test('should save message to agent memory', async () => {
      await saveIncomingMessageToMemory(mockWorld, mockAgent, mockMessageEvent);

      expect(mockAgent.memory).toHaveLength(1);
      expect(mockAgent.memory[0]).toMatchObject({
        role: 'user',
        content: '@test-agent Hello',
        sender: 'user'
      });
    });

    test('should handle memory save failures', async () => {
      mockAgentStorage.saveAgentMemoryToDisk.mockRejectedValue(new Error('Memory save failed'));

      // Spy on console.warn to verify error is logged
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

      await saveIncomingMessageToMemory(mockWorld, mockAgent, mockMessageEvent);

      expect(consoleSpy).toHaveBeenCalledWith(
        `Failed to auto-save memory for agent ${mockAgent.id}:`,
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    test('should handle empty message content', async () => {
      const emptyMessageEvent: WorldMessageEvent = {
        content: '',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-empty'
      };

      await saveIncomingMessageToMemory(mockWorld, mockAgent, emptyMessageEvent);
      expect(mockAgent.memory[0].content).toBe('');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle world without turn limit', async () => {
      const worldWithoutLimit = {
        ...mockWorld,
        turnLimit: undefined
      } as any;

      // Use a message that will trigger response (paragraph beginning mention)
      const testMessage: WorldMessageEvent = {
        content: '@test-agent Hello',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-test'
      };

      const result = await shouldAgentRespond(worldWithoutLimit, mockAgent, testMessage);
      expect(result).toBe(true); // Should use default limit
    });

    test('should handle agent without memory array', async () => {
      const agentWithoutMemory = {
        ...mockAgent,
        memory: undefined as any
      };

      // Spy on console.warn to verify error is logged when memory is undefined
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

      await saveIncomingMessageToMemory(mockWorld, agentWithoutMemory, mockMessageEvent);

      expect(consoleSpy).toHaveBeenCalledWith(
        `Could not save incoming message to memory for ${agentWithoutMemory.id}:`,
        expect.any(TypeError)
      );

      // Memory should still be undefined because the function doesn't initialize it
      expect(agentWithoutMemory.memory).toBeUndefined();

      consoleSpy.mockRestore();
    });

    test('should handle very long message content', async () => {
      const longMessageEvent: WorldMessageEvent = {
        content: '@test-agent ' + 'A'.repeat(100000), // Move mention to paragraph beginning
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-long'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, longMessageEvent);
      expect(result).toBe(true);

      await saveIncomingMessageToMemory(mockWorld, mockAgent, longMessageEvent);
      expect(mockAgent.memory[0].content).toHaveLength(100000 + 12);
    });
  });
});