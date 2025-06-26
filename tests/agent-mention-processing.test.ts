/**
 * Unit tests for @mention-based message processing logic
 * Tests when agents should call LLM vs when they shouldn't, auto-mention behavior, etc.
 * Mocks only file I/O and LLM as per user instructions
 */

import { jest } from '@jest/globals';
import { shouldRespondToMessage, processAgentMessage } from '../src/agent';
import { AgentConfig, MessageData, LLMProvider, Agent } from '../src/types';
import * as llm from '../src/llm';
import * as world from '../src/world';
import * as agentManager from '../src/agent-manager';
import * as eventBus from '../src/event-bus';

// Mock only file I/O and LLM as requested
jest.mock('../src/llm');
jest.mock('../src/world', () => ({
  getAgentConversationHistory: jest.fn(),
  addToAgentMemory: jest.fn()
}));
jest.mock('../src/agent-manager');
jest.mock('../src/event-bus');

const mockLlm = llm as jest.Mocked<typeof llm>;
const mockWorld = world as jest.Mocked<typeof world>;
const mockAgentManager = agentManager as jest.Mocked<typeof agentManager>;
const mockEventBus = eventBus as jest.Mocked<typeof eventBus>;

describe('Agent @Mention-Based Message Processing', () => {
  let testAgent: AgentConfig;
  let mockLLMProvider: any;

  // Helper function to create properly structured MessageData
  const createMessage = (content: string, sender?: string): MessageData => ({
    id: `msg-${Date.now()}`,
    name: 'test-message',
    content,
    sender,
    payload: { content }
  });

  beforeEach(() => {
    jest.clearAllMocks();

    testAgent = {
      name: 'alice',
      type: 'ai',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'You are Alice, a helpful assistant.',
      temperature: 0.7,
      maxTokens: 1000
    };

    mockLLMProvider = {
      name: 'openai',
      chatCompletion: jest.fn()
    };

    // Setup default mocks
    mockLlm.loadLLMProvider.mockReturnValue(mockLLMProvider);
    mockLlm.streamChatWithLLM.mockResolvedValue('Mock LLM response');
    mockWorld.getAgentConversationHistory.mockResolvedValue([]);
    mockWorld.addToAgentMemory.mockResolvedValue(undefined);

    const mockAgent: Agent = {
      name: 'alice',
      type: 'ai',
      config: testAgent,
      llmCallCount: 0,
      lastLLMCall: new Date(),
      createdAt: new Date(),
      lastActive: new Date()
    };

    mockAgentManager.getAgent.mockReturnValue(mockAgent);
    mockAgentManager.updateAgent.mockResolvedValue(mockAgent);
    mockEventBus.publishMessageEvent.mockResolvedValue({} as any);
    mockEventBus.publishSSE.mockResolvedValue({} as any);
    mockEventBus.publishDebugEvent.mockResolvedValue({} as any);
  });

  describe('shouldRespondToMessage - @Mention Logic', () => {
    describe('Human Messages', () => {
      it('should respond to human messages without mentions (public messages)', async () => {
        const message = createMessage('Hello everyone, how are you?', 'human');

        const result = await shouldRespondToMessage(testAgent, message);
        expect(result).toBe(true);
      });

      it('should respond when agent is first mention in human message', async () => {
        const message = createMessage('Hey @alice, can you help me with this?', 'human');

        const result = await shouldRespondToMessage(testAgent, message);
        expect(result).toBe(true);
      });

      it('should NOT respond when agent is not first mention in human message', async () => {
        const message = createMessage('Hey @bob, can you ask @alice about this?', 'human');

        const result = await shouldRespondToMessage(testAgent, message);
        expect(result).toBe(false);
      });

      it('should respond when agent is first mention despite case differences', async () => {
        const message = createMessage('Hey @ALICE, can you help @bob?', 'human');

        const result = await shouldRespondToMessage(testAgent, message);
        expect(result).toBe(true);
      });
    });

    describe('Agent Messages', () => {
      it('should respond when mentioned first by another agent', async () => {
        const message = createMessage('Hey @alice, what do you think about this?', 'bob');

        const result = await shouldRespondToMessage(testAgent, message);
        expect(result).toBe(true);
      });

      it('should NOT respond when not mentioned by another agent', async () => {
        const message = createMessage('I think we should proceed with the plan', 'bob');

        const result = await shouldRespondToMessage(testAgent, message);
        expect(result).toBe(false);
      });

      it('should NOT respond when not first mention in agent message', async () => {
        const message = createMessage('Hey @bob, please ask @alice about this', 'charlie');

        const result = await shouldRespondToMessage(testAgent, message);
        expect(result).toBe(false);
      });

      it('should NOT respond to own messages', async () => {
        const message = createMessage('I think @bob should handle this', 'alice');

        const result = await shouldRespondToMessage(testAgent, message);
        expect(result).toBe(false);
      });
    });

    describe('System Messages', () => {
      it('should always respond to system messages', async () => {
        const message = createMessage('System notification: Please review the logs', 'system');

        const result = await shouldRespondToMessage(testAgent, message);
        expect(result).toBe(true);
      });

      it('should respond to messages with no sender (treated as system)', async () => {
        const message = createMessage('World event: New user joined');

        const result = await shouldRespondToMessage(testAgent, message);
        expect(result).toBe(true);
      });
    });

    describe('Turn Limit Logic', () => {
      it('should NOT respond when LLM call limit reached', async () => {
        const mockAgentAtLimit: Agent = {
          name: 'alice',
          type: 'ai',
          config: testAgent,
          llmCallCount: 5, // At limit
          lastLLMCall: new Date(),
          createdAt: new Date(),
          lastActive: new Date()
        };
        mockAgentManager.getAgent.mockReturnValue(mockAgentAtLimit);

        const message = createMessage('@alice please help', 'human');

        const result = await shouldRespondToMessage(testAgent, message, 'test-world');
        expect(result).toBe(false);

        // Should publish turn limit message
        expect(mockEventBus.publishMessageEvent).toHaveBeenCalledWith({
          content: '@human Turn limit reached (5 LLM calls). Please take control of the conversation.',
          sender: 'alice'
        });
      });

      it('should reset LLM call count when receiving human message', async () => {
        const mockAgentWithCalls: Agent = {
          name: 'alice',
          type: 'ai',
          config: testAgent,
          llmCallCount: 3,
          lastLLMCall: new Date(),
          createdAt: new Date(),
          lastActive: new Date()
        };
        mockAgentManager.getAgent.mockReturnValue(mockAgentWithCalls);

        const message = createMessage('Hello everyone', 'human');

        await shouldRespondToMessage(testAgent, message, 'test-world');

        // Should reset LLM call count
        expect(mockAgentManager.updateAgent).toHaveBeenCalledWith('test-world', 'alice', {
          llmCallCount: 0
        });
      });

      it('should NOT respond to turn limit messages to prevent loops', async () => {
        const message = createMessage('@human Turn limit reached (5 LLM calls). Please take control of the conversation.', 'bob');

        const result = await shouldRespondToMessage(testAgent, message);
        expect(result).toBe(false);
      });
    });
  });

  describe('processAgentMessage - LLM Integration', () => {
    describe('LLM Call Logic', () => {
      it('should call LLM when agent should respond to mention', async () => {
        const message = createMessage('@alice please help with this task', 'human');

        await processAgentMessage(testAgent, message, 'msg-1', 'test-world');

        expect(mockLlm.loadLLMProvider).toHaveBeenCalled();
        expect(mockLlm.streamChatWithLLM).toHaveBeenCalled();
        expect(mockAgentManager.updateAgent).toHaveBeenCalledWith('test-world', 'alice', {
          llmCallCount: 1,
          lastLLMCall: expect.any(Date)
        });
      });

      it('should NOT call LLM when agent should not respond', async () => {
        const message = createMessage('@bob please help with this task', 'human');

        const result = await processAgentMessage(testAgent, message, 'msg-1', 'test-world');

        expect(result).toBe('');
        expect(mockLlm.streamChatWithLLM).not.toHaveBeenCalled();
        expect(mockAgentManager.updateAgent).not.toHaveBeenCalled();
      });

      it('should save message to memory regardless of LLM processing', async () => {
        const message = createMessage('@bob please help with this task', 'human');

        await processAgentMessage(testAgent, message, 'msg-1', 'test-world');

        // Should save to memory even though LLM wasn't called
        expect(mockWorld.addToAgentMemory).toHaveBeenCalledWith(
          'test-world',
          'alice',
          expect.objectContaining({
            role: 'user',
            content: '@bob please help with this task',
            sender: 'human'
          })
        );
      });
    });

    describe('Auto-Mention Logic', () => {
      it('should auto-add mention when replying to another agent', async () => {
        const message = createMessage('@alice what do you think?', 'bob');

        mockLlm.streamChatWithLLM.mockResolvedValue('I think it looks good');

        await processAgentMessage(testAgent, message, 'msg-1', 'test-world');

        expect(mockEventBus.publishMessageEvent).toHaveBeenCalledWith({
          content: '@bob I think it looks good',
          sender: 'alice'
        });
      });

      it('should NOT auto-add mention when already present', async () => {
        const message = createMessage('@alice what do you think?', 'bob');

        mockLlm.streamChatWithLLM.mockResolvedValue('@bob I think it looks good');

        await processAgentMessage(testAgent, message, 'msg-1', 'test-world');

        expect(mockEventBus.publishMessageEvent).toHaveBeenCalledWith({
          content: '@bob I think it looks good',
          sender: 'alice'
        });
      });

      it('should NOT auto-add mention when replying to human', async () => {
        const message = createMessage('@alice please help', 'human');

        mockLlm.streamChatWithLLM.mockResolvedValue('Sure, I can help');

        await processAgentMessage(testAgent, message, 'msg-1', 'test-world');

        expect(mockEventBus.publishMessageEvent).toHaveBeenCalledWith({
          content: 'Sure, I can help',
          sender: 'alice'
        });
      });

      it('should NOT auto-add mention when replying to system', async () => {
        const message = createMessage('System notification', 'system');

        mockLlm.streamChatWithLLM.mockResolvedValue('Acknowledged');

        await processAgentMessage(testAgent, message, 'msg-1', 'test-world');

        expect(mockEventBus.publishMessageEvent).toHaveBeenCalledWith({
          content: 'Acknowledged',
          sender: 'alice'
        });
      });
    });

    describe('Pass Command Logic', () => {
      it('should handle pass command and redirect to human', async () => {
        const message = createMessage('@alice please handle this complex task', 'human');

        mockLlm.streamChatWithLLM.mockResolvedValue('I need help with this. <world>pass</world>');

        const result = await processAgentMessage(testAgent, message, 'msg-1', 'test-world');

        expect(result).toBe('@human alice is passing control to you');
        expect(mockEventBus.publishMessageEvent).toHaveBeenCalledWith({
          content: '@human alice is passing control to you',
          sender: 'system'
        });
      });

      it('should handle case-insensitive pass command', async () => {
        const message = createMessage('@alice please handle this', 'human');

        mockLlm.streamChatWithLLM.mockResolvedValue('I cannot handle this. <WORLD>PASS</WORLD>');

        const result = await processAgentMessage(testAgent, message, 'msg-1', 'test-world');

        expect(result).toBe('@human alice is passing control to you');
      });
    });

    describe('Memory Persistence', () => {
      it('should save incoming message to memory before processing', async () => {
        const message = createMessage('@alice please help', 'human');

        await processAgentMessage(testAgent, message, 'msg-1', 'test-world');

        expect(mockWorld.addToAgentMemory).toHaveBeenCalledWith(
          'test-world',
          'alice',
          expect.objectContaining({
            role: 'user',
            content: '@alice please help',
            sender: 'human'
          })
        );
      });

      it('should NOT save own messages to memory', async () => {
        const message = createMessage('I said something', 'alice');

        await processAgentMessage(testAgent, message, 'msg-1', 'test-world');

        expect(mockWorld.addToAgentMemory).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      it('should handle LLM timeout gracefully', async () => {
        const message = createMessage('@alice please help', 'human');

        mockLlm.streamChatWithLLM.mockRejectedValue(new Error('LLM streaming request timeout'));

        const result = await processAgentMessage(testAgent, message, 'msg-1', 'test-world');

        expect(result).toBe('');
        expect(mockEventBus.publishSSE).toHaveBeenCalledWith({
          agentName: 'alice',
          type: 'error',
          messageId: 'msg-1',
          error: 'Request timed out'
        });
      });

      it('should throw on other LLM errors', async () => {
        const message = createMessage('@alice please help', 'human');

        mockLlm.streamChatWithLLM.mockRejectedValue(new Error('API key invalid'));

        await expect(processAgentMessage(testAgent, message, 'msg-1', 'test-world'))
          .rejects.toThrow('API key invalid');
      });
    });
  });

  describe('Complex @Mention Scenarios', () => {
    it('should handle multiple agents mentioned but respond only when first', async () => {
      const messageForAlice = createMessage('@alice can you work with @bob on this?', 'human');
      const messageForBob = createMessage('@bob can you work with @alice on this?', 'human');

      // Alice should respond to first message
      expect(await shouldRespondToMessage(testAgent, messageForAlice)).toBe(true);

      // Alice should NOT respond to second message
      expect(await shouldRespondToMessage(testAgent, messageForBob)).toBe(false);
    });

    it('should handle mixed case mentions correctly', async () => {
      const message = createMessage('@ALICE @Bob @charlie', 'human');

      expect(await shouldRespondToMessage(testAgent, message)).toBe(true);
    });

    it('should handle mentions with special characters', async () => {
      const validMessage = createMessage('@alice_bot can you help?', 'human');

      const testAgentWithUnderscore = { ...testAgent, name: 'alice_bot' };
      expect(await shouldRespondToMessage(testAgentWithUnderscore, validMessage)).toBe(true);
    });

    it('should ignore invalid mention patterns', async () => {
      const message = createMessage('@123invalid @@double @_underscore @alice', 'human');

      expect(await shouldRespondToMessage(testAgent, message)).toBe(true);
    });
  });
});
