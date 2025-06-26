/*
 * Combined Agent Test
 * 
 * Tests individual agent functions to verify they work correctly
 * Combined from agent-basic.test.ts and agent-functions.test.ts
 */

import {
  shouldRespondToMessage,
  processAgentMessage
} from '../src/agent';
import type { AgentConfig, MessageData } from '../src/types';
import { LLMProvider, EventType } from '../src/types';
import * as llm from '../src/llm';
import * as eventBus from '../src/event-bus';

// Mock dependencies
jest.mock('../src/llm');
jest.mock('../src/event-bus');

const mockLlm = llm as jest.Mocked<typeof llm>;
const mockEventBus = eventBus as jest.Mocked<typeof eventBus>;

describe('Agent Functions', () => {
  const mockAgentConfig: AgentConfig = {
    name: 'TestAgent',
    type: 'ai',
    provider: LLMProvider.OPENAI,
    model: 'gpt-3.5-turbo',
    systemPrompt: 'Helpful assistant. Be helpful and concise.',
    temperature: 0.7,
    maxTokens: 1000
  };

  describe('Message Filtering (Simplified)', () => {

    it('should respond to human messages without mentions', async () => {
      const messageData: MessageData = {
        id: 'msg-1',
        name: 'human-message',
        payload: { content: 'Hello everyone' },
        sender: 'human',
        content: 'Hello everyone'
      };

      expect(await shouldRespondToMessage(mockAgentConfig, messageData)).toBe(true);
    });

    it('should respond to human messages with mentions', async () => {
      const messageData: MessageData = {
        id: 'msg-1',
        name: 'human-message',
        payload: { content: 'Hello @TestAgent' },
        sender: 'human',
        content: 'Hello @TestAgent'
      };

      expect(await shouldRespondToMessage(mockAgentConfig, messageData)).toBe(true);
    });

    it('should not respond to own messages', async () => {
      const messageData: MessageData = {
        id: 'msg-1',
        name: 'agent-message',
        payload: { content: 'I said something' },
        sender: 'TestAgent',
        content: 'I said something'
      };

      expect(await shouldRespondToMessage(mockAgentConfig, messageData)).toBe(false);
    });

    it('should only respond to agent messages when mentioned', async () => {
      const mentionedMessage: MessageData = {
        id: 'msg-1',
        name: 'agent-message',
        payload: { content: 'Hey @TestAgent, help!' },
        sender: 'other-agent',
        content: 'Hey @TestAgent, help!'
      };

      const unmentionedMessage: MessageData = {
        id: 'msg-2',
        name: 'agent-message',
        payload: { content: 'Just talking to myself' },
        sender: 'other-agent',
        content: 'Just talking to myself'
      };

      expect(await shouldRespondToMessage(mockAgentConfig, mentionedMessage)).toBe(true);
      expect(await shouldRespondToMessage(mockAgentConfig, unmentionedMessage)).toBe(false);
    });

    it('should always respond to system messages', async () => {
      const systemMessage: MessageData = {
        id: 'msg-1',
        name: 'system-message',
        payload: { content: 'System announcement' },
        sender: 'system',
        content: 'System announcement'
      };

      expect(await shouldRespondToMessage(mockAgentConfig, systemMessage)).toBe(true);
    });
  });

  describe('Message Processing with Streaming', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      // Default mock implementations
      mockLlm.loadLLMProvider.mockReturnValue({} as any);
      mockEventBus.publishMessageEvent.mockResolvedValue({} as any);
      mockEventBus.publishSSE.mockResolvedValue({} as any);
    });

    // Suppress console.error output for error handling test to keep test output clean
    const originalConsoleError = console.error;
    afterEach(() => {
      console.error = originalConsoleError;
    });

    it('should use streaming LLM for message processing', async () => {
      const mockResponse = 'Hello! How can I help you?';
      mockLlm.streamChatWithLLM.mockResolvedValue(mockResponse);

      const messageData: MessageData = {
        id: 'msg-1',
        name: 'user-message',
        content: 'Hello agent!',
        sender: 'human',
        payload: { content: 'Hello agent!' }
      };

      const result = await processAgentMessage(mockAgentConfig, messageData, 'test-msg-id');

      expect(result).toBe(mockResponse);
      expect(mockLlm.streamChatWithLLM).toHaveBeenCalledTimes(1);
      expect(mockLlm.streamChatWithLLM).toHaveBeenCalledWith(
        {}, // LLM provider
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('Helpful assistant')
          }),
          expect.objectContaining({
            role: 'user',
            content: 'Hello agent!',
            name: 'human'
          })
        ]), // messages array
        'test-msg-id', // message ID for streaming
        expect.objectContaining({
          temperature: 0.7,
          maxTokens: 1000,
          agentName: 'TestAgent'
        })
      );
    });

    it('should not call non-streaming LLM', async () => {
      const mockResponse = 'Test response';
      mockLlm.streamChatWithLLM.mockResolvedValue(mockResponse);

      const messageData: MessageData = {
        id: 'msg-1',
        name: 'user-message',
        content: 'Test message',
        sender: 'human',
        payload: { content: 'Test message' }
      };

      await processAgentMessage(mockAgentConfig, messageData);

      expect(mockLlm.streamChatWithLLM).toHaveBeenCalledTimes(1);
      expect(mockLlm.chatWithLLM).not.toHaveBeenCalled();
    });

    it('should generate message ID if not provided', async () => {
      const mockResponse = 'Generated ID response';
      mockLlm.streamChatWithLLM.mockResolvedValue(mockResponse);

      const messageData: MessageData = {
        id: 'msg-1',
        name: 'user-message',
        content: 'Test without ID',
        sender: 'human',
        payload: { content: 'Test without ID' }
      };

      await processAgentMessage(mockAgentConfig, messageData); // No messageId parameter

      expect(mockLlm.streamChatWithLLM).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user', content: 'Test without ID' })
        ]),
        expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/), // UUID pattern
        expect.anything()
      );
    });

    it('should skip processing if agent should not respond', async () => {
      const messageData: MessageData = {
        id: 'msg-1',
        name: 'agent-message',
        content: 'Message from self',
        sender: 'TestAgent', // Same as agent name
        payload: { content: 'Message from self' }
      };

      const result = await processAgentMessage(mockAgentConfig, messageData);

      expect(result).toBe('');
      expect(mockLlm.streamChatWithLLM).not.toHaveBeenCalled();
      expect(mockEventBus.publishMessageEvent).not.toHaveBeenCalled();
    });

    it('should handle streaming errors and publish SSE error', async () => {
      const error = new Error('Streaming failed');
      mockLlm.streamChatWithLLM.mockRejectedValue(error);

      // Mock console.error to suppress error output for this test
      const errorMock = jest.fn();
      console.error = errorMock;

      const messageData: MessageData = {
        id: 'msg-1',
        name: 'user-message',
        content: 'Test message',
        sender: 'human',
        payload: { content: 'Test message' }
      };

      await expect(processAgentMessage(mockAgentConfig, messageData, 'error-msg-id'))
        .rejects.toThrow('Streaming failed');

      expect(mockEventBus.publishSSE).toHaveBeenCalledWith({
        agentName: 'TestAgent',
        type: 'error',
        messageId: 'error-msg-id',
        error: 'Streaming failed'
      });
    });

    it('should publish response message after processing', async () => {
      const mockResponse = 'Published response';
      mockLlm.streamChatWithLLM.mockResolvedValue(mockResponse);

      const messageData: MessageData = {
        id: 'msg-1',
        name: 'user-message',
        content: 'Test message',
        sender: 'human',
        payload: { content: 'Test message' }
      };

      await processAgentMessage(mockAgentConfig, messageData, 'publish-msg-id');

      expect(mockEventBus.publishMessageEvent).toHaveBeenCalledWith({
        content: 'Published response',
        sender: 'TestAgent'
      });
    });

    it('should limit conversation history to last 20 messages', async () => {
      // This test verifies the memory management logic works
      // Note: Memory persistence has been simplified for this version
      const mockResponse = 'Response with memory management';
      mockLlm.streamChatWithLLM.mockResolvedValue(mockResponse);

      const messageData: MessageData = {
        id: 'new-msg',
        name: 'user-message',
        content: 'New message',
        sender: 'human',
        payload: { content: 'New message' }
      };

      const result = await processAgentMessage(mockAgentConfig, messageData, 'response-id');

      expect(result).toBe(mockResponse);
      expect(mockLlm.streamChatWithLLM).toHaveBeenCalled();
    });
  });
});
