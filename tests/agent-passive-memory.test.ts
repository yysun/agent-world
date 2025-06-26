/**
 * agent-passive-memory.test.ts
 *
 * Unit tests for agent passive memory functionality.
 *
 * Features tested:
 * - All agents save all messages to memory regardless of mention status
 * - Only mentioned agents process messages with LLM
 * - Conversation context is preserved for all agents
 * - Memory saving is independent of LLM processing
 */

import { jest } from '@jest/globals';
import { processAgentMessage, shouldRespondToMessage } from '../src/agent';
import { addToAgentMemory } from '../src/world';
import { AgentConfig, MessageData } from '../src/types';

// Mock dependencies
jest.mock('../src/world');
jest.mock('../src/llm');
jest.mock('../src/event-bus');
jest.mock('../src/agent-manager');

describe('Agent Passive Memory', () => {
  let mockAgentConfig1: AgentConfig;
  let mockAgentConfig2: AgentConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAgentConfig1 = {
      name: 'Agent1',
      type: 'ai',
      provider: 'openai' as any,
      model: 'gpt-4'
    };

    mockAgentConfig2 = {
      name: 'Agent2',
      type: 'ai',
      provider: 'openai' as any,
      model: 'gpt-4'
    };

    // Mock addToAgentMemory
    (addToAgentMemory as jest.MockedFunction<typeof addToAgentMemory>).mockResolvedValue();
  });

  describe('Memory Saving Behavior', () => {
    it('should save message to memory for both mentioned and non-mentioned agents', async () => {
      const messageData: MessageData = {
        id: 'msg-1',
        name: 'user_message',
        sender: 'human',
        content: '@Agent1, you and Agent2 are both agents',
        payload: {}
      };

      // Process message for Agent1 (mentioned)
      await processAgentMessage(mockAgentConfig1, messageData, undefined, 'test-world');

      // Process message for Agent2 (not mentioned)
      await processAgentMessage(mockAgentConfig2, messageData, undefined, 'test-world');

      // Both agents should save the message to memory
      expect(addToAgentMemory).toHaveBeenCalledWith(
        'test-world',
        'Agent1',
        expect.objectContaining({
          role: 'user',
          content: '@Agent1, you and Agent2 are both agents',
          sender: 'human'
        })
      );

      expect(addToAgentMemory).toHaveBeenCalledWith(
        'test-world',
        'Agent2',
        expect.objectContaining({
          role: 'user',
          content: '@Agent1, you and Agent2 are both agents',
          sender: 'human'
        })
      );
    });

    it('should save messages from other agents to memory', async () => {
      const messageData: MessageData = {
        id: 'msg-2',
        name: 'agent_message',
        sender: 'Agent3',
        content: 'Hello everyone!',
        payload: {}
      };

      // Process message for Agent1
      await processAgentMessage(mockAgentConfig1, messageData, undefined, 'test-world');

      // Agent1 should save Agent3's message to memory
      expect(addToAgentMemory).toHaveBeenCalledWith(
        'test-world',
        'Agent1',
        expect.objectContaining({
          role: 'user',
          content: 'Hello everyone!',
          sender: 'Agent3'
        })
      );
    });

    it('should not save own messages to memory', async () => {
      const messageData: MessageData = {
        id: 'msg-3',
        name: 'agent_message',
        sender: 'Agent1', // Same as agent name
        content: 'My own message',
        payload: {}
      };

      // Process message for Agent1 (own message)
      await processAgentMessage(mockAgentConfig1, messageData, undefined, 'test-world');

      // Agent1 should not save its own message to memory
      expect(addToAgentMemory).not.toHaveBeenCalled();
    });
  });

  describe('LLM Processing vs Memory Saving Separation', () => {
    it('should process with LLM only when mentioned', async () => {
      const messageData: MessageData = {
        id: 'msg-4',
        name: 'user_message',
        sender: 'human',
        content: '@Agent1, you and Agent2 are both agents',
        payload: {}
      };

      // Check who should respond with LLM
      const agent1ShouldRespond = await shouldRespondToMessage(mockAgentConfig1, messageData, 'test-world');
      const agent2ShouldRespond = await shouldRespondToMessage(mockAgentConfig2, messageData, 'test-world');

      // Only Agent1 (first mention) should process with LLM
      expect(agent1ShouldRespond).toBe(true);
      expect(agent2ShouldRespond).toBe(false);
    });

    it('should save all public messages to memory for all agents', async () => {
      const messageData: MessageData = {
        id: 'msg-5',
        name: 'user_message',
        sender: 'human',
        content: 'Hello everyone, how are you all doing?',
        payload: {}
      };

      // Process message for both agents
      await processAgentMessage(mockAgentConfig1, messageData, undefined, 'test-world');
      await processAgentMessage(mockAgentConfig2, messageData, undefined, 'test-world');

      // Both agents should save the public message to memory
      expect(addToAgentMemory).toHaveBeenCalledWith(
        'test-world',
        'Agent1',
        expect.objectContaining({
          role: 'user',
          content: 'Hello everyone, how are you all doing?',
          sender: 'human'
        })
      );

      expect(addToAgentMemory).toHaveBeenCalledWith(
        'test-world',
        'Agent2',
        expect.objectContaining({
          role: 'user',
          content: 'Hello everyone, how are you all doing?',
          sender: 'human'
        })
      );
    });

    it('should check response logic independently of memory saving', async () => {
      // Clear any previous mock calls
      jest.clearAllMocks();

      const messageData: MessageData = {
        id: 'msg-6',
        name: 'user_message',
        sender: 'human',
        content: '@Agent2, can you help with this?',
        payload: {}
      };

      // Check who should respond with LLM (independently)
      const agent1ShouldRespond = await shouldRespondToMessage(mockAgentConfig1, messageData, 'test-world');
      const agent2ShouldRespond = await shouldRespondToMessage(mockAgentConfig2, messageData, 'test-world');

      // Only Agent2 should process with LLM
      expect(agent1ShouldRespond).toBe(false);
      expect(agent2ShouldRespond).toBe(true);

      // Both agents save incoming message to memory, but only Agent2 processes with LLM
      await processAgentMessage(mockAgentConfig1, messageData, undefined, 'test-world');
      await processAgentMessage(mockAgentConfig2, messageData, undefined, 'test-world');

      // Verify memory saves:
      // - Agent1: 1 call (incoming message only)
      // - Agent2: 2 calls (incoming message + assistant response from LLM processing)
      // Total: 3 calls
      expect(addToAgentMemory).toHaveBeenCalledTimes(3);

      // Verify Agent1 saved only the incoming message
      expect(addToAgentMemory).toHaveBeenCalledWith(
        'test-world',
        'Agent1',
        expect.objectContaining({
          role: 'user',
          content: '@Agent2, can you help with this?',
          sender: 'human'
        })
      );

      // Verify Agent2 saved both incoming message and response
      expect(addToAgentMemory).toHaveBeenCalledWith(
        'test-world',
        'Agent2',
        expect.objectContaining({
          role: 'user',
          content: '@Agent2, can you help with this?',
          sender: 'human'
        })
      );
    });
  });

  describe('Message Format and Timestamps', () => {
    it('should save messages with proper format and timestamps', async () => {
      const messageData: MessageData = {
        id: 'msg-7',
        name: 'user_message',
        sender: 'human',
        content: 'Test message format',
        payload: {}
      };

      await processAgentMessage(mockAgentConfig1, messageData, undefined, 'test-world');

      expect(addToAgentMemory).toHaveBeenCalledWith(
        'test-world',
        'Agent1',
        expect.objectContaining({
          role: 'user',
          content: 'Test message format',
          sender: 'human',
          createdAt: expect.any(Date)
        })
      );
    });

    it('should handle messages with payload content', async () => {
      const messageData: MessageData = {
        id: 'msg-8',
        name: 'user_message',
        sender: 'human',
        content: '',
        payload: { content: 'Message in payload' }
      };

      await processAgentMessage(mockAgentConfig1, messageData, undefined, 'test-world');

      expect(addToAgentMemory).toHaveBeenCalledWith(
        'test-world',
        'Agent1',
        expect.objectContaining({
          role: 'user',
          content: 'Message in payload',
          sender: 'human'
        })
      );
    });
  });
});
