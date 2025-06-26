/**
 * Integration tests for message conversation management system with selective mocking
 * 
 * Features:
 * - Tests real message filtering and @mention extraction logic
 * - Tests real agent-to-agen  });routing and conversation flows
 * - Tests real turn counter functionality with world module
 * - Tests message broadcasting integration with controlled LLM responses
 * - Uses selective mocking: only file I/O and LLM operations are mocked
 * - Real world, event bus, and agent modules run for true integration testing
 * - Prevents infinite agent conversation loops through response limiting
 * 
 * Logic:
 * - File system operations are mocked (fs/promises, storage module)
 * - LLM processing is mocked to return controlled responses
 * - Logger output is suppressed during tests
 * - World, event bus, and agent modules run with real logic
 * - Uses fake timers to control async behavior and prevent test hangs
 * - Proper cleanup after each test to prevent async operation leaks
 * - Limits mock LLM responses to prevent infinite agent conversations
 * 
 * Changes:
 * - UPDATED: Reduced mocking scope to only file I/O and LLM operations
 * - KEPT: Mock implementations for storage and LLM modules
 * - REMOVED: World module mocking to test real conversation logic
 * - ADDED: Fake timer usage to control async operations
 * - ADDED: Response limiting to prevent infinite agent conversations
 * - ADDED: Proper test cleanup to prevent async leaks
 * - ENHANCED: True integration testing with real module interactions
 */

import { jest } from '@jest/globals';
import {
  createWorld,
  createAgent,
  broadcastMessage,
  _clearAllWorldsForTesting
} from '../src/world';
import { shouldRespondToMessage } from '../src/agent';
import { AgentConfig, MessageData, LLMProvider } from '../src/types';
import { initializeEventBus, clearEventHistory } from '../src/event-bus';

// Mock all file system operations
jest.mock('fs/promises');

// Mock storage module to prevent real file I/O
jest.mock('../src/storage');

// Mock LLM module to prevent actual API calls
jest.mock('../src/llm');

// Mock logger to suppress output during tests
jest.mock('../src/logger');

// Use fake timers to control async behavior
jest.useFakeTimers();

describe('Message Conversation Management', () => {
  let worldName: string;

  beforeAll(() => {
    // Mock fs/promises operations to prevent real file I/O
    const mockFs = require('fs/promises');
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue('{}');
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.rm.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true
    });
    mockFs.access.mockResolvedValue(undefined);

    // Set up mock implementations for file I/O operations only
    const mockStorage = require('../src/storage');
    mockStorage.initializeFileStorage.mockResolvedValue(undefined);
    mockStorage.getStorageOptions.mockReturnValue({
      dataDirectory: './data',
      enableLogging: false
    });
    mockStorage.getStoragePaths.mockReturnValue({
      dataDir: './data',
      worldsDir: './data/worlds',
      eventsDir: './data/events',
      messagesDir: './data/messages'
    });
    mockStorage.ensureDirectory.mockResolvedValue(undefined);
    mockStorage.saveEventData.mockResolvedValue(undefined);
    mockStorage.loadEventData.mockResolvedValue([]);
    mockStorage.saveEvent.mockResolvedValue(undefined);
    mockStorage.loadEvents.mockResolvedValue([]);
    mockStorage.loadMessages.mockResolvedValue([]);
    mockStorage.loadRecentMessages.mockResolvedValue([]);

    // Mock LLM to prevent network calls and control responses
    const mockLLM = require('../src/llm');
    mockLLM.loadLLMProvider.mockReturnValue({
      // Mock provider object
      name: 'mock-provider'
    });
    mockLLM.streamChatWithLLM.mockResolvedValue('Mock agent response');
  });

  beforeEach(async () => {
    // Clear state
    _clearAllWorldsForTesting();
    initializeEventBus({ provider: 'local', enableLogging: false });
    clearEventHistory();

    // Create test world
    worldName = await createWorld({ name: 'conversation-test-world' });
  });

  afterEach(async () => {
    // Cleanup to prevent async leaks
    _clearAllWorldsForTesting();
    clearEventHistory();

    // Clear all timers and intervals
    jest.clearAllTimers();
    jest.runOnlyPendingTimers();
  });

  afterAll(() => {
    // Restore real timers
    jest.useRealTimers();
  });

  describe('Enhanced Message Filtering', () => {
    let agentConfig: AgentConfig;

    beforeEach(() => {
      agentConfig = {
        name: 'TestAgent',
        type: 'ai',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4'
      };
    });

    it('should extract @mentions correctly', async () => {
      const testCases = [
        { content: 'Hello @testagent how are you?', expected: true },
        { content: 'Hey @TestAgent can you help?', expected: true }, // case insensitive
        { content: 'Hello @testagent can you assist?', expected: true },
        { content: 'Hello @TestAgent can you assist?', expected: true },
        { content: 'Hello @other-agent can you help?', expected: false },
        { content: 'Hello everyone!', expected: true }, // no mentions = public
        { content: 'Hello @@malformed', expected: true }, // malformed mention ignored = public
        { content: 'Hello @', expected: true }, // empty mention ignored = public
      ];

      for (const { content, expected } of testCases) {
        const messageData: MessageData = {
          id: `msg-${testCases.indexOf({ content, expected })}`,
          name: 'test_message',
          sender: 'HUMAN',
          content,
          payload: {}
        };

        const result = await shouldRespondToMessage(agentConfig, messageData);
        expect(result).toBe(expected);
      }
    });

    it('should handle agent-to-agent messages correctly', async () => {
      const testCases = [
        { content: 'Hello @testagent can you help?', sender: 'OtherAgent', expected: true },
        { content: 'Hello @someone-else can you help?', sender: 'OtherAgent', expected: false },
        { content: 'Hello everyone!', sender: 'OtherAgent', expected: false }, // agent broadcasts need mentions
      ];

      for (const { content, sender, expected } of testCases) {
        const messageData: MessageData = {
          id: `msg-${testCases.indexOf({ content, sender, expected })}`,
          name: 'agent_message',
          sender,
          content,
          payload: {}
        };

        const result = await shouldRespondToMessage(agentConfig, messageData);
        expect(result).toBe(expected);
      }
    });

    it('should never respond to own messages', async () => {
      const messageData: MessageData = {
        id: 'msg-self',
        name: 'agent_message',
        sender: 'TestAgent',
        content: 'This is my own message @testagent',
        payload: {}
      };

      const result = await shouldRespondToMessage(agentConfig, messageData);
      expect(result).toBe(false);
    });
  });

  describe('Message Broadcasting Integration', () => {
    it('should broadcast messages without errors', async () => {
      // Create some test agents with mocked streamChatWithLLM to prevent infinite conversations
      const mockLLM = require('../src/llm');
      let messageCount = 0;
      mockLLM.streamChatWithLLM.mockImplementation(() => {
        messageCount++;
        // Prevent infinite conversation by returning non-mentioning responses after first few
        if (messageCount > 2) {
          return Promise.resolve('I understand.');
        }
        return Promise.resolve('Mock response from agent.');
      });

      const agent1Config: AgentConfig = {
        name: 'Agent1',
        type: 'ai',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4'
      };

      const agent2Config: AgentConfig = {
        name: 'Agent2',
        type: 'ai',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4'
      };

      await createAgent(worldName, agent1Config);
      await createAgent(worldName, agent2Config);

      // Test public message
      await expect(broadcastMessage(worldName, 'Hello everyone!', 'HUMAN')).resolves.not.toThrow();

      // Test private message with mentions
      await expect(broadcastMessage(worldName, 'Hello @Agent1, can you help?', 'HUMAN')).resolves.not.toThrow();

      // Test agent-to-agent message (but limit responses to prevent loops)
      await expect(broadcastMessage(worldName, '@Agent2 what do you think?', 'Agent1')).resolves.not.toThrow();

      // Fast-forward any pending timers
      jest.runAllTimers();
    });
  });
});
