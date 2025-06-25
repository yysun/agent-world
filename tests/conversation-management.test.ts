/**
 * Integration tests for message conversation management system
 */

import { jest } from '@jest/globals';
import {
  createWorld,
  createAgent,
  broadcastMessage,
  resetTurnCounter,
  _clearAllWorldsForTesting
} from '../src/world';
import { shouldRespondToMessage } from '../src/agent';
import { AgentConfig, MessageData, LLMProvider } from '../src/types';
import { initializeEventBus, clearEventHistory } from '../src/event-bus';

describe('Message Conversation Management', () => {
  let worldName: string;

  beforeEach(async () => {
    // Clear state
    _clearAllWorldsForTesting();
    initializeEventBus({ provider: 'local', enableLogging: false });
    clearEventHistory();

    // Create test world
    worldName = await createWorld({ name: 'conversation-test-world' });
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

    it('should extract @mentions correctly', () => {
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

      testCases.forEach(({ content, expected }, index) => {
        const messageData: MessageData = {
          id: `msg-${index}`,
          name: 'test_message',
          sender: 'HUMAN',
          content,
          payload: {}
        };

        const result = shouldRespondToMessage(agentConfig, messageData);
        expect(result).toBe(expected);
      });
    });

    it('should handle agent-to-agent messages correctly', () => {
      const testCases = [
        { content: 'Hello @testagent can you help?', sender: 'OtherAgent', expected: true },
        { content: 'Hello @someone-else can you help?', sender: 'OtherAgent', expected: false },
        { content: 'Hello everyone!', sender: 'OtherAgent', expected: false }, // agent broadcasts need mentions
      ];

      testCases.forEach(({ content, sender, expected }, index) => {
        const messageData: MessageData = {
          id: `msg-${index}`,
          name: 'agent_message',
          sender,
          content,
          payload: {}
        };

        const result = shouldRespondToMessage(agentConfig, messageData);
        expect(result).toBe(expected);
      });
    });

    it('should never respond to own messages', () => {
      const messageData: MessageData = {
        id: 'msg-self',
        name: 'agent_message',
        sender: 'TestAgent',
        content: 'This is my own message @testagent',
        payload: {}
      };

      const result = shouldRespondToMessage(agentConfig, messageData);
      expect(result).toBe(false);
    });
  });

  describe('Turn Counter Management', () => {
    it('should provide resetTurnCounter function', () => {
      expect(typeof resetTurnCounter).toBe('function');

      // Should not throw when called
      expect(() => resetTurnCounter(worldName)).not.toThrow();
    });
  });

  describe('Message Broadcasting Integration', () => {
    it('should broadcast messages without errors', async () => {
      // Create some test agents
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

      // Test agent-to-agent message
      await expect(broadcastMessage(worldName, '@Agent2 what do you think?', 'Agent1')).resolves.not.toThrow();
    });
  });
});
