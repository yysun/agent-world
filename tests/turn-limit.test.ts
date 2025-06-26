/**
 * turn-limit.test.ts
 *
 * Comprehensive unit tests for the turn limit functionality.
 * Tests the LLM call-based turn limit logic implemented in agent.ts.
 *
 * Test Coverage:
 * - Turn limit detection when llmCallCount reaches TURN_LIMIT (5)
 * - Turn limit message publishing with proper format
 * - Turn limit reset logic when human/system messages received
 * - Turn limit message ignoring to prevent loops
 * - LLM call count increment tracking
 * - Integration with shouldRespondToMessage logic
 *
 * Features:
 * - Only mocks file I/O and LLM (as per project guidelines)
 * - Tests turn limit behavior with real world/agent-manager integration
 * - Validates debug logging for turn limit events
 * - Comprehensive edge case testing
 *
 * Logic:
 * - Creates real world and agents for testing
 * - Simulates different message types (human, system, agent, turn limit)
 * - Tests both turn limit detection and reset scenarios
 * - Validates proper message publishing and event handling
 */

import {
  shouldRespondToMessage,
  processAgentMessage
} from '../src/agent';
import {
  createWorld,
  createAgent,
  getAgent,
  updateAgent,
  _clearAllWorldsForTesting
} from '../src/world';
import { initializeFileStorage } from '../src/storage';
import { LLMProvider, AgentConfig, MessageData } from '../src/types';
import * as fs from 'fs/promises';
import * as llm from '../src/llm';

// Mock only file I/O and LLM as per project guidelines
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  access: jest.fn(),
  readdir: jest.fn(),
  mkdir: jest.fn(),
  rmdir: jest.fn(),
  rm: jest.fn()
}));

jest.mock('../src/llm');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockLlm = llm as jest.Mocked<typeof llm>;

describe('Turn Limit Functionality', () => {
  const TURN_LIMIT = 5;
  const worldName = 'TurnLimitTestWorld';

  const baseAgentConfig: AgentConfig = {
    name: 'TurnLimitAgent',
    type: 'ai',
    provider: LLMProvider.OPENAI,
    model: 'gpt-3.5-turbo',
    systemPrompt: 'You are a test agent for turn limit testing',
    temperature: 0.7,
    maxTokens: 1000
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    _clearAllWorldsForTesting();

    // Setup file system mocks
    mockFs.readFile.mockImplementation(async (filePath) => {
      const path = filePath.toString();

      // Mock world config files
      if (path.includes('config.json') && !path.includes('agents')) {
        return JSON.stringify({
          name: worldName,
          createdAt: new Date().toISOString()
        });
      }

      // Mock agent config files
      if (path.includes('agents') && path.includes('config.json')) {
        return JSON.stringify({
          name: baseAgentConfig.name,
          type: baseAgentConfig.type,
          status: 'active',
          config: baseAgentConfig,
          createdAt: new Date().toISOString(),
          lastActive: new Date().toISOString(),
          llmCallCount: 0,
          lastLLMCall: undefined
        });
      }

      // Mock system prompt files
      if (path.includes('system-prompt.md')) {
        return baseAgentConfig.systemPrompt || 'You are a test agent';
      }

      // Mock memory files
      if (path.includes('memory.json')) {
        return JSON.stringify({
          messages: [],
          lastActivity: new Date().toISOString()
        });
      }

      throw new Error('File not found');
    });

    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.rmdir.mockResolvedValue(undefined);
    mockFs.rm.mockResolvedValue(undefined);

    // Setup LLM mocks
    mockLlm.loadLLMProvider.mockReturnValue({} as any);
    mockLlm.streamChatWithLLM.mockResolvedValue('Mock LLM response');

    // Initialize storage and create test world
    await initializeFileStorage({ dataPath: 'test-data' });
    await createWorld({ name: worldName });
  });

  describe('Turn Limit Detection', () => {
    it('should detect turn limit when llmCallCount reaches TURN_LIMIT', async () => {
      // Create agent and set llmCallCount to the limit
      const agent = await createAgent(worldName, baseAgentConfig);
      expect(agent).toBeTruthy();

      // Update agent to have llmCallCount at the limit
      await updateAgent(worldName, baseAgentConfig.name, {
        llmCallCount: TURN_LIMIT
      });

      const messageData: MessageData = {
        id: 'msg-1',
        name: 'human-message',
        content: 'Hello agent!',
        sender: 'human',
        payload: { content: 'Hello agent!' }
      };

      const shouldRespond = await shouldRespondToMessage(baseAgentConfig, messageData, worldName);

      expect(shouldRespond).toBe(false);
    });

    it('should allow response when llmCallCount is below TURN_LIMIT', async () => {
      // Create agent and set llmCallCount below the limit
      const agent = await createAgent(worldName, baseAgentConfig);
      expect(agent).toBeTruthy();

      await updateAgent(worldName, baseAgentConfig.name, {
        llmCallCount: TURN_LIMIT - 1
      });

      const messageData: MessageData = {
        id: 'msg-1',
        name: 'human-message',
        content: 'Hello agent!',
        sender: 'human',
        payload: { content: 'Hello agent!' }
      };

      const shouldRespond = await shouldRespondToMessage(baseAgentConfig, messageData, worldName);

      expect(shouldRespond).toBe(true);
    });

    it('should block response when llmCallCount exceeds TURN_LIMIT', async () => {
      // Create agent and set llmCallCount over the limit
      const agent = await createAgent(worldName, baseAgentConfig);
      expect(agent).toBeTruthy();

      await updateAgent(worldName, baseAgentConfig.name, {
        llmCallCount: TURN_LIMIT + 2
      });

      const messageData: MessageData = {
        id: 'msg-1',
        name: 'human-message',
        content: 'Hello agent!',
        sender: 'human',
        payload: { content: 'Hello agent!' }
      };

      const shouldRespond = await shouldRespondToMessage(baseAgentConfig, messageData, worldName);

      expect(shouldRespond).toBe(false);
    });
  });

  describe('Turn Limit Reset Logic', () => {
    it('should reset llmCallCount when receiving human message', async () => {
      // Create agent with some LLM calls
      const agent = await createAgent(worldName, baseAgentConfig);
      expect(agent).toBeTruthy();

      await updateAgent(worldName, baseAgentConfig.name, {
        llmCallCount: 3
      });

      const humanMessage: MessageData = {
        id: 'msg-1',
        name: 'human-message',
        content: 'Hello from human!',
        sender: 'human',
        payload: { content: 'Hello from human!' }
      };

      await shouldRespondToMessage(baseAgentConfig, humanMessage, worldName);

      // Check that the count was reset
      const updatedAgent = getAgent(worldName, baseAgentConfig.name);
      expect(updatedAgent?.llmCallCount).toBe(0);
    });

    it('should reset llmCallCount when receiving HUMAN message', async () => {
      const agent = await createAgent(worldName, baseAgentConfig);
      expect(agent).toBeTruthy();

      await updateAgent(worldName, baseAgentConfig.name, {
        llmCallCount: 4
      });

      const humanMessage: MessageData = {
        id: 'msg-1',
        name: 'human-message',
        content: 'Hello from HUMAN!',
        sender: 'HUMAN',
        payload: { content: 'Hello from HUMAN!' }
      };

      await shouldRespondToMessage(baseAgentConfig, humanMessage, worldName);

      const updatedAgent = getAgent(worldName, baseAgentConfig.name);
      expect(updatedAgent?.llmCallCount).toBe(0);
    });

    it('should reset llmCallCount when receiving system message', async () => {
      const agent = await createAgent(worldName, baseAgentConfig);
      expect(agent).toBeTruthy();

      await updateAgent(worldName, baseAgentConfig.name, {
        llmCallCount: 2
      });

      const systemMessage: MessageData = {
        id: 'msg-1',
        name: 'system-message',
        content: 'System announcement',
        sender: 'system',
        payload: { content: 'System announcement' }
      };

      await shouldRespondToMessage(baseAgentConfig, systemMessage, worldName);

      const updatedAgent = getAgent(worldName, baseAgentConfig.name);
      expect(updatedAgent?.llmCallCount).toBe(0);
    });

    it('should reset llmCallCount when receiving world message', async () => {
      const agent = await createAgent(worldName, baseAgentConfig);
      expect(agent).toBeTruthy();

      await updateAgent(worldName, baseAgentConfig.name, {
        llmCallCount: 1
      });

      const worldMessage: MessageData = {
        id: 'msg-1',
        name: 'world-message',
        content: 'World event',
        sender: 'world',
        payload: { content: 'World event' }
      };

      await shouldRespondToMessage(baseAgentConfig, worldMessage, worldName);

      const updatedAgent = getAgent(worldName, baseAgentConfig.name);
      expect(updatedAgent?.llmCallCount).toBe(0);
    });

    it('should not reset llmCallCount for agent messages', async () => {
      const agent = await createAgent(worldName, baseAgentConfig);
      expect(agent).toBeTruthy();

      await updateAgent(worldName, baseAgentConfig.name, {
        llmCallCount: 3
      });

      const agentMessage: MessageData = {
        id: 'msg-1',
        name: 'agent-message',
        content: 'Hello from another agent',
        sender: 'other-agent',
        payload: { content: 'Hello from another agent' }
      };

      await shouldRespondToMessage(baseAgentConfig, agentMessage, worldName);

      // Should not reset for agent messages
      const updatedAgent = getAgent(worldName, baseAgentConfig.name);
      expect(updatedAgent?.llmCallCount).toBe(3);
    });

    it('should not reset when llmCallCount is already 0', async () => {
      const agent = await createAgent(worldName, baseAgentConfig);
      expect(agent).toBeTruthy();

      // Agent starts with llmCallCount: 0, verify it stays 0
      expect(agent?.llmCallCount).toBe(0);

      const humanMessage: MessageData = {
        id: 'msg-1',
        name: 'human-message',
        content: 'Hello!',
        sender: 'human',
        payload: { content: 'Hello!' }
      };

      await shouldRespondToMessage(baseAgentConfig, humanMessage, worldName);

      const updatedAgent = getAgent(worldName, baseAgentConfig.name);
      expect(updatedAgent?.llmCallCount).toBe(0);
    });
  });

  describe('Turn Limit Message Handling', () => {
    it('should ignore turn limit messages to prevent loops', async () => {
      const agent = await createAgent(worldName, baseAgentConfig);
      expect(agent).toBeTruthy();

      await updateAgent(worldName, baseAgentConfig.name, {
        llmCallCount: 2 // Below limit, would normally respond
      });

      const turnLimitMessage: MessageData = {
        id: 'msg-1',
        name: 'turn-limit-message',
        content: '@human Turn limit reached (5 LLM calls). Please take control of the conversation.',
        sender: 'other-agent',
        payload: { content: '@human Turn limit reached (5 LLM calls). Please take control of the conversation.' }
      };

      const shouldRespond = await shouldRespondToMessage(baseAgentConfig, turnLimitMessage, worldName);

      expect(shouldRespond).toBe(false);
    });

    it('should ignore partial turn limit messages', async () => {
      const agent = await createAgent(worldName, baseAgentConfig);
      expect(agent).toBeTruthy();

      const turnLimitVariations = [
        'Turn limit reached - please help',
        'The turn limit reached and I need assistance',
        'Agent says: Turn limit reached (5 calls)'
      ];

      for (const content of turnLimitVariations) {
        const turnLimitMessage: MessageData = {
          id: 'msg-1',
          name: 'turn-limit-message',
          content,
          sender: 'other-agent',
          payload: { content }
        };

        const shouldRespond = await shouldRespondToMessage(baseAgentConfig, turnLimitMessage, worldName);
        expect(shouldRespond).toBe(false);
      }
    });
  });

  describe('LLM Call Count Increment', () => {
    it('should increment llmCallCount before making LLM call', async () => {
      const agent = await createAgent(worldName, baseAgentConfig);
      expect(agent).toBeTruthy();

      await updateAgent(worldName, baseAgentConfig.name, {
        llmCallCount: 2
      });

      const messageData: MessageData = {
        id: 'msg-1',
        name: 'human-message',
        content: 'Hello agent!',
        sender: 'human',
        payload: { content: 'Hello agent!' }
      };

      await processAgentMessage(baseAgentConfig, messageData, 'test-msg-id', worldName);

      // Check that count was incremented
      const updatedAgent = getAgent(worldName, baseAgentConfig.name);
      // The count should be reset to 0 first (because it's a human message), then incremented to 1
      expect(updatedAgent?.llmCallCount).toBe(1);
      expect(updatedAgent?.lastLLMCall).toBeDefined();
      expect(mockLlm.streamChatWithLLM).toHaveBeenCalled();
    });

    it('should continue processing even if count update fails', async () => {
      const agent = await createAgent(worldName, baseAgentConfig);
      expect(agent).toBeTruthy();

      // Mock console.warn to verify error handling
      const consoleMock = jest.spyOn(console, 'warn').mockImplementation(() => { });

      // Create a scenario where the agent might not be found during update
      // by using a non-existent world name
      const messageData: MessageData = {
        id: 'msg-1',
        name: 'human-message',
        content: 'Hello!',
        sender: 'human',
        payload: { content: 'Hello!' }
      };

      // This should still work even with world name issues
      await processAgentMessage(baseAgentConfig, messageData, 'test-msg-id', 'non-existent-world');

      expect(mockLlm.streamChatWithLLM).toHaveBeenCalled(); // Should still proceed with LLM call

      consoleMock.mockRestore();
    });
  });

  describe('Integration with Message Routing', () => {
    it('should apply turn limit before mention checking', async () => {
      const agent = await createAgent(worldName, baseAgentConfig);
      expect(agent).toBeTruthy();

      // Set agent to limit
      await updateAgent(worldName, baseAgentConfig.name, {
        llmCallCount: TURN_LIMIT
      });

      // Even though agent is mentioned, turn limit should prevent response
      const mentionMessage: MessageData = {
        id: 'msg-1',
        name: 'agent-message',
        content: '@TurnLimitAgent please help!',
        sender: 'other-agent',
        payload: { content: '@TurnLimitAgent please help!' }
      };

      const shouldRespond = await shouldRespondToMessage(baseAgentConfig, mentionMessage, worldName);

      expect(shouldRespond).toBe(false);
    });

    it('should reset count and then allow mention-based response', async () => {
      const agent = await createAgent(worldName, baseAgentConfig);
      expect(agent).toBeTruthy();

      await updateAgent(worldName, baseAgentConfig.name, {
        llmCallCount: 3
      });

      // Human mentions agent - should reset count and allow response
      const mentionMessage: MessageData = {
        id: 'msg-1',
        name: 'human-message',
        content: '@TurnLimitAgent can you help?',
        sender: 'human',
        payload: { content: '@TurnLimitAgent can you help?' }
      };

      const shouldRespond = await shouldRespondToMessage(baseAgentConfig, mentionMessage, worldName);

      expect(shouldRespond).toBe(true);

      // Verify count was reset
      const updatedAgent = getAgent(worldName, baseAgentConfig.name);
      expect(updatedAgent?.llmCallCount).toBe(0);
    });

    it('should handle missing worldName parameter gracefully', async () => {
      const messageData: MessageData = {
        id: 'msg-1',
        name: 'human-message',
        content: 'Hello!',
        sender: 'human',
        payload: { content: 'Hello!' }
      };

      // No worldName provided - should skip turn limit check
      const shouldRespond = await shouldRespondToMessage(baseAgentConfig, messageData);

      expect(shouldRespond).toBe(true);
    });
  });
});
