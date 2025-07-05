/**
 * Unit Tests for Agent Events Module
 *
 * Features:
 * - Tests for agent subscription management with real event emitters
 * - Tests for message filtering and response logic as complete units
 * - Tests for memory persistence with mocked file I/O operations only
 *
 * Implementation:
 * - Uses real EventEmitter and world events for integration testing
 * - Mocks only file I/O (agent-storage) and LLM calls (llm-manager)
 * - Tests complete event flow including subscription and message processing
 * - Validates real event emitter behavior and agent response logic
 * - Uses spies for tracking calls without breaking functionality
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import './setup';
import { Agent, World, LLMProvider, WorldMessageEvent } from '../../core/types';
import { resetAllMocks, createMockAgent, setupMockEnvironment, cleanupMockEnvironment } from './mock-helpers';
import { EventEmitter } from 'events';

// Import the actual implementation for testing as a complete unit
import {
  subscribeAgentToMessages,
  processAgentMessage,
  shouldAgentRespond,
  saveIncomingMessageToMemory,
  publishMessage,
  subscribeToMessages,
  hasAnyMentionAtBeginning,
  addAutoMention,
  removeSelfMentions
} from '../../core/events';

// Mock only file I/O and LLM calls using unstable_mockModule for dynamic imports
beforeAll(async () => {
  await jest.unstable_mockModule('../../core/llm-manager', () => ({
    streamAgentResponse: jest.fn()
  }));

  await jest.unstable_mockModule('../../core/agent-storage', () => ({
    saveAgentToDisk: jest.fn(),
    loadAgentFromDisk: jest.fn(),
    saveAgentMemoryToDisk: jest.fn(),
    saveAgentConfigToDisk: jest.fn()
  }));
});

jest.doMock('../../core/llm-manager', () => ({
  streamAgentResponse: jest.fn()
}));

jest.doMock('../../core/agent-storage', () => ({
  saveAgentToDisk: jest.fn(),
  loadAgentFromDisk: jest.fn(),
  saveAgentMemoryToDisk: jest.fn(),
  saveAgentConfigToDisk: jest.fn()
}));

const mockAgentStorage = require('../../core/agent-storage');
const mockLLMManager = require('../../core/llm-manager');

describe('Agent Events Module', () => {
  let mockAgent: Agent;
  let mockWorld: World;
  let mockMessageEvent: WorldMessageEvent;
  let realEventEmitter: EventEmitter;

  beforeEach(() => {
    setupMockEnvironment();
    resetAllMocks();

    // Setup default mock responses for file I/O and LLM
    mockLLMManager.streamAgentResponse.mockResolvedValue('Mocked agent response');
    mockAgentStorage.saveAgentToDisk.mockResolvedValue(undefined);
    mockAgentStorage.saveAgentMemoryToDisk.mockResolvedValue(undefined);
    mockAgentStorage.saveAgentConfigToDisk.mockResolvedValue(undefined);

    // Create a real EventEmitter for testing
    realEventEmitter = new EventEmitter();

    // Create test fixtures with real event emitter
    mockAgent = createMockAgent({
      id: 'test-agent',
      name: 'test-agent',
      llmCallCount: 2,
      memory: []
    });

    mockWorld = {
      id: 'test-world',
      name: 'Test World',
      turnLimit: 5,
      rootPath: 'test-data/worlds',
      eventEmitter: realEventEmitter
    } as World;

    mockMessageEvent = {
      content: '@test-agent Hello',
      sender: 'user',
      timestamp: new Date(),
      messageId: 'msg-1'
    };

    // Reset all mocks but keep real functionality
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanupMockEnvironment();
    resetAllMocks();

    // Clean up event emitter
    if (realEventEmitter) {
      realEventEmitter.removeAllListeners();
    }
  });

  describe('subscribeAgentToMessages', () => {
    test('should subscribe agent to world messages and process them', async () => {
      // Subscribe the agent to messages
      const unsubscribe = subscribeAgentToMessages(mockWorld, mockAgent);

      // Get dynamic import mocks to track calls
      const { streamAgentResponse: dynamicLLMResponse } = await import('../../core/llm-manager');

      // Publish a message that should trigger response
      const testMessage = '@test-agent Hello from user!';
      publishMessage(mockWorld, testMessage, 'user');

      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify LLM was called (the agent should have processed the message)
      expect(dynamicLLMResponse).toHaveBeenCalled();

      // Clean up
      unsubscribe();
    });

    test('should not respond to own messages', async () => {
      const unsubscribe = subscribeAgentToMessages(mockWorld, mockAgent);

      // Agent sends a message
      publishMessage(mockWorld, 'I am speaking', mockAgent.id);

      // Wait a bit to ensure no processing happens
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify LLM was not called (agent doesn't respond to itself)
      expect(mockLLMManager.streamAgentResponse).not.toHaveBeenCalled();

      unsubscribe();
    });
  });

  describe('processAgentMessage', () => {
    test('should process agent message and generate response', async () => {
      const testMessageEvent: WorldMessageEvent = {
        content: '@test-agent Hello',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-test'
      };

      const initialMemoryLength = mockAgent.memory.length;

      // First verify shouldAgentRespond returns true for this message
      const shouldRespond = await shouldAgentRespond(mockWorld, mockAgent, testMessageEvent);
      expect(shouldRespond).toBe(true);

      // Get the dynamic import mocks to check their call counts
      const { streamAgentResponse: dynamicLLMResponse } = await import('../../core/llm-manager');
      const { saveAgentConfigToDisk: dynamicSaveConfig } = await import('../../core/agent-storage');

      await processAgentMessage(mockWorld, mockAgent, testMessageEvent);

      // Verify LLM was called and response was processed (check dynamic import mocks)
      expect(dynamicLLMResponse).toHaveBeenCalled();
      expect(dynamicSaveConfig).toHaveBeenCalled();

      // The processAgentMessage function resets llmCallCount to 0 for human messages,
      // then increments it by 1, so it should be 1
      expect(mockAgent.llmCallCount).toBe(1);

      // Verify message was added to memory
      expect(mockAgent.memory.length).toBeGreaterThan(initialMemoryLength);
    }); test('should handle LLM timeout gracefully', async () => {
      const testMessageEvent: WorldMessageEvent = {
        content: '@test-agent Hello',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-test'
      };

      // Start with a clean state
      mockAgent.llmCallCount = 0;

      // Get dynamic import and make it reject
      const { streamAgentResponse: dynamicLLMResponse } = await import('../../core/llm-manager');
      (dynamicLLMResponse as any).mockRejectedValue(new Error('Request timeout'));

      // Function should not throw despite LLM failure
      await expect(processAgentMessage(mockWorld, mockAgent, testMessageEvent))
        .resolves.not.toThrow();

      // LLM call count should still be incremented (showing the attempt was made)
      // It resets to 0 for human messages, then increments by 1
      expect(mockAgent.llmCallCount).toBe(1);

      // Memory should still contain the incoming message
      expect(mockAgent.memory.length).toBeGreaterThan(0);
      expect(mockAgent.memory[mockAgent.memory.length - 1]).toMatchObject({
        role: 'user',
        content: '@test-agent Hello'
      });
    });

    test('should increment LLM call count', async () => {
      // Start with llmCallCount at 0 to test the increment
      mockAgent.llmCallCount = 0;
      await processAgentMessage(mockWorld, mockAgent, mockMessageEvent);
      // Should increment to 1 (resets to 0 for human messages, then increments by 1)
      expect(mockAgent.llmCallCount).toBe(1);
    });
  });

  describe('Memory Management', () => {
    test('should save message to agent memory', async () => {
      const initialMemoryLength = mockAgent.memory.length;

      await saveIncomingMessageToMemory(mockWorld, mockAgent, mockMessageEvent);

      expect(mockAgent.memory).toHaveLength(initialMemoryLength + 1);
      expect(mockAgent.memory[mockAgent.memory.length - 1]).toMatchObject({
        role: 'user',
        content: '@test-agent Hello',
        sender: 'user'
      });
    });

    test('should handle memory save failures gracefully', async () => {
      // Get dynamic import and make it reject
      const { saveAgentMemoryToDisk } = await import('../../core/agent-storage');
      (saveAgentMemoryToDisk as any).mockRejectedValue(new Error('Memory save failed'));

      // Function should not throw despite save failure
      await expect(saveIncomingMessageToMemory(mockWorld, mockAgent, mockMessageEvent))
        .resolves.not.toThrow();

      // Message should still be added to memory despite save failure
      expect(mockAgent.memory.length).toBeGreaterThan(0);
      expect(mockAgent.memory[mockAgent.memory.length - 1]).toMatchObject({
        role: 'user',
        content: '@test-agent Hello',
        sender: 'user'
      });
    });

    test('should handle empty message content', async () => {
      const emptyMessageEvent: WorldMessageEvent = {
        content: '',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-empty'
      };

      await saveIncomingMessageToMemory(mockWorld, mockAgent, emptyMessageEvent);
      expect(mockAgent.memory[mockAgent.memory.length - 1].content).toBe('');
    });

    test('should handle agent without memory array gracefully', async () => {
      const agentWithoutMemory = {
        ...mockAgent,
        memory: undefined as any
      };

      // Function should not throw despite invalid memory
      await expect(saveIncomingMessageToMemory(mockWorld, agentWithoutMemory, mockMessageEvent))
        .resolves.not.toThrow();

      // Memory should still be undefined because the function doesn't initialize it
      expect(agentWithoutMemory.memory).toBeUndefined();
    });
  });

  describe('shouldAgentRespond Logic', () => {
    test('should respond to messages with agent mention at paragraph beginning', async () => {
      const mentionMessage: WorldMessageEvent = {
        content: '@test-agent Please help me',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-mention'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, mentionMessage);
      expect(result).toBe(true);
    });

    test('should respond to public messages without mentions', async () => {
      const noMentionMessage: WorldMessageEvent = {
        content: 'Hello everyone, how are you?',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-no-mention'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, noMentionMessage);
      expect(result).toBe(true); // Agents respond to public messages from humans
    });

    test('should not respond to mid-paragraph mentions', async () => {
      const midMentionMessage: WorldMessageEvent = {
        content: 'Hello everyone, I think @test-agent should help with this',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-mid-mention'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, midMentionMessage);
      expect(result).toBe(false); // Should not respond to mid-paragraph mentions
    });

    test('should handle world without turn limit', async () => {
      const worldWithoutLimit = {
        ...mockWorld,
        turnLimit: undefined
      } as any;

      const testMessage: WorldMessageEvent = {
        content: '@test-agent Hello',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-test'
      };

      const result = await shouldAgentRespond(worldWithoutLimit, mockAgent, testMessage);
      expect(result).toBe(true); // Should use default limit
    });
  });

  describe('Edge Cases', () => {
    test('should handle very long message content', async () => {
      const longContent = '@test-agent ' + 'A'.repeat(1000);
      const longMessageEvent: WorldMessageEvent = {
        content: longContent,
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-long'
      };

      const result = await shouldAgentRespond(mockWorld, mockAgent, longMessageEvent);
      expect(result).toBe(true);

      await saveIncomingMessageToMemory(mockWorld, mockAgent, longMessageEvent);
      expect(mockAgent.memory[mockAgent.memory.length - 1].content).toHaveLength(longContent.length);
    });
  });

  describe('Auto-Mention Utility Functions', () => {
    describe('hasAnyMentionAtBeginning', () => {
      test('should detect any mention at beginning', () => {
        expect(hasAnyMentionAtBeginning('@human hello')).toBe(true);
        expect(hasAnyMentionAtBeginning('@gm hello')).toBe(true);
        expect(hasAnyMentionAtBeginning('@pro hello')).toBe(true);
      });

      test('should not detect mentions in middle', () => {
        expect(hasAnyMentionAtBeginning('hello @human')).toBe(false);
        expect(hasAnyMentionAtBeginning('I think @gm should help')).toBe(false);
      });

      test('should handle empty strings', () => {
        expect(hasAnyMentionAtBeginning('')).toBe(false);
        expect(hasAnyMentionAtBeginning('   ')).toBe(false);
      });

      test('should handle mentions with newlines', () => {
        expect(hasAnyMentionAtBeginning('@human\n hello')).toBe(true);
        expect(hasAnyMentionAtBeginning('@gm\t hello')).toBe(true);
      });
    });

    describe('addAutoMention', () => {
      test('should add auto-mention when no mention exists', () => {
        expect(addAutoMention('Hello there!', 'human')).toBe('@human Hello there!');
        expect(addAutoMention('How can I help?', 'gm')).toBe('@gm How can I help?');
      });

      test('should NOT add auto-mention when ANY mention exists at beginning', () => {
        expect(addAutoMention('@gm Hello there!', 'human')).toBe('@gm Hello there!');
        expect(addAutoMention('@pro Please help', 'gm')).toBe('@pro Please help');
        expect(addAutoMention('@con Take this task', 'human')).toBe('@con Take this task');
      });

      test('should handle empty strings', () => {
        expect(addAutoMention('', 'human')).toBe('');
        expect(addAutoMention('   ', 'gm')).toBe('   ');
      });

      test('should trim response but preserve original structure', () => {
        expect(addAutoMention('  Hello there!  ', 'human')).toBe('@human Hello there!');
      });
    });

    describe('removeSelfMentions', () => {
      test('should remove self-mentions from beginning', () => {
        expect(removeSelfMentions('@alice I should handle this.', 'alice')).toBe('I should handle this.');
        expect(removeSelfMentions('@gm @gm I will help.', 'gm')).toBe('I will help.');
      });

      test('should be case-insensitive', () => {
        expect(removeSelfMentions('@Alice @ALICE @alice I can help.', 'alice')).toBe('I can help.');
      });

      test('should preserve mentions in middle', () => {
        expect(removeSelfMentions('@alice I think @alice should work with @bob.', 'alice')).toBe('I think @alice should work with @bob.');
      });

      test('should handle empty strings', () => {
        expect(removeSelfMentions('', 'alice')).toBe('');
        expect(removeSelfMentions('   ', 'gm')).toBe('   ');
      });
    });

    describe('Loop Prevention Integration', () => {
      test('should prevent @gm->@pro->@gm loops', () => {
        // Simulate @pro responding to @gm
        let response = '@gm I will work on this task.';
        
        // Step 1: Remove self-mentions (pro removes @pro mentions, but there are none)
        response = removeSelfMentions(response, 'pro');
        expect(response).toBe('@gm I will work on this task.');
        
        // Step 2: Add auto-mention (should NOT add @gm because @gm already exists)
        response = addAutoMention(response, 'gm');
        expect(response).toBe('@gm I will work on this task.');
      });

      test('should allow @gm->@con redirections', () => {
        // Simulate @gm redirecting to @con
        let response = '@con Please handle this request.';
        
        // Step 1: Remove self-mentions (gm removes @gm mentions, but there are none)
        response = removeSelfMentions(response, 'gm');
        expect(response).toBe('@con Please handle this request.');
        
        // Step 2: Add auto-mention (should NOT add auto-mention because @con already exists)
        response = addAutoMention(response, 'human');
        expect(response).toBe('@con Please handle this request.');
      });

      test('should add auto-mention when no mention exists', () => {
        // Normal response without any mentions
        let response = 'I understand your request.';
        
        // Step 1: Remove self-mentions
        response = removeSelfMentions(response, 'gm');
        expect(response).toBe('I understand your request.');
        
        // Step 2: Add auto-mention (should add because no mention exists)
        response = addAutoMention(response, 'human');
        expect(response).toBe('@human I understand your request.');
      });
    });
  });
});