/**
 * Anthropic Streaming Tests
 * 
 * Tests streaming response handling for Anthropic provider including:
 * - SSE event parsing and emission
 * - Chunk accumulation and reconstruction
 * - Stream error handling and recovery
 * - Tool call detection in streams
 * - Multi-chunk tool argument reconstruction
 * 
 * Note: Uses mocked Anthropic SDK for consistent test behavior
 * ALWAYS use in-memory storage for unit tests - NEVER use file system or real database
 * ALWAYS mock LLM calls in tests - NEVER make real API calls to LLM
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { streamAnthropicResponse, createAnthropicClient } from '../../../core/anthropic-direct.js';
import type { Agent, World, ChatMessage } from '../../../core/types.js';

describe('Anthropic Streaming Response Handler', () => {
  let mockClient: any;
  let mockAgent: Agent;
  let mockWorld: World;
  let mockMessages: ChatMessage[];
  let onChunkCallback: any;

  beforeEach(() => {
    // Mock Anthropic client
    mockClient = {
      messages: {
        create: vi.fn()
      }
    };

    // Mock agent
    mockAgent = {
      id: 'test-agent',
      name: 'Test Agent',
      provider: 'anthropic',
      model: 'claude-3-haiku-20240307',
      temperature: 0.7,
      maxTokens: 4096,
      systemPrompt: 'You are a helpful assistant',
      memory: []
    } as Agent;

    // Mock world
    mockWorld = {
      id: 'test-world',
      name: 'Test World',
      agents: [],
      chats: []
    } as World;

    // Mock messages
    mockMessages = [
      {
        role: 'system',
        content: 'You are a helpful assistant'
      },
      {
        role: 'user',
        content: 'Hello, how are you?'
      }
    ] as ChatMessage[];

    // Mock onChunk callback
    onChunkCallback = vi.fn();
  });

  describe('Basic Streaming', () => {
    it('should handle simple text streaming response', async () => {
      // Mock stream that yields text chunks
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' }
          };
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Hello' }
          };
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: ' there!' }
          };
          yield {
            type: 'content_block_stop',
            index: 0
          };
          yield {
            type: 'message_stop'
          };
        }
      };

      mockClient.messages.create.mockReturnValue(mockStream);

      const result = await streamAnthropicResponse(
        mockClient,
        'claude-3-haiku-20240307',
        mockMessages,
        mockAgent,
        {},
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      // Verify chunks were processed
      expect(onChunkCallback).toHaveBeenCalledWith('Hello');
      expect(onChunkCallback).toHaveBeenCalledWith(' there!');
      
      // Verify result structure
      expect(result).toBeDefined();
      expect(result.type).toBe('text');
      expect(result.content).toContain('Hello there!');
    });

    it('should handle empty streaming response', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'message_start',
            message: { role: 'assistant', content: [] }
          };
          yield {
            type: 'message_stop'
          };
        }
      };

      mockClient.messages.create.mockReturnValue(mockStream);

      const result = await streamAnthropicResponse(
        mockClient,
        'claude-3-haiku-20240307',
        mockMessages,
        mockAgent,
        {},
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      expect(result).toBeDefined();
      expect(result.type).toBe('text');
    });

    it('should accumulate multiple small chunks correctly', async () => {
      const chunks = ['H', 'e', 'l', 'l', 'o', ' ', 'w', 'o', 'r', 'l', 'd'];
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { type: 'content_block_start', index: 0, content_block: { type: 'text' } };
          for (const chunk of chunks) {
            yield {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: chunk }
            };
          }
          yield { type: 'content_block_stop', index: 0 };
          yield { type: 'message_stop' };
        }
      };

      mockClient.messages.create.mockReturnValue(mockStream);

      const result = await streamAnthropicResponse(
        mockClient,
        'claude-3-haiku-20240307',
        mockMessages,
        mockAgent,
        {},
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      expect(onChunkCallback).toHaveBeenCalledTimes(chunks.length);
      expect(result.content).toContain('Hello world');
    });
  });

  describe('Tool Call Streaming', () => {
    it('should detect and reconstruct tool calls from stream', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          // Text content
          yield {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' }
          };
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Let me help you with that.' }
          };
          yield { type: 'content_block_stop', index: 0 };
          
          // Tool use
          yield {
            type: 'content_block_start',
            index: 1,
            content_block: {
              type: 'tool_use',
              id: 'tool_123',
              name: 'get_weather',
              input: {}
            }
          };
          yield {
            type: 'content_block_delta',
            index: 1,
            delta: {
              type: 'input_json_delta',
              partial_json: '{"location":'
            }
          };
          yield {
            type: 'content_block_delta',
            index: 1,
            delta: {
              type: 'input_json_delta',
              partial_json: '"San Francisco"}'
            }
          };
          yield { type: 'content_block_stop', index: 1 };
          yield { type: 'message_stop' };
        }
      };

      mockClient.messages.create.mockReturnValue(mockStream);

      const mcpTools = {
        get_weather: {
          description: 'Get weather for a location',
          inputSchema: {
            type: 'object',
            properties: {
              location: { type: 'string' }
            }
          }
        }
      };

      const result = await streamAnthropicResponse(
        mockClient,
        'claude-3-haiku-20240307',
        mockMessages,
        mockAgent,
        mcpTools,
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      expect(result.type).toBe('tool_calls');
      expect(result.tool_calls).toBeDefined();
      expect(result.tool_calls?.length).toBeGreaterThan(0);
      expect(result.tool_calls?.[0].function.name).toBe('get_weather');
    });

    it('should handle multiple tool calls in one stream', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          // First tool
          yield {
            type: 'content_block_start',
            index: 0,
            content_block: {
              type: 'tool_use',
              id: 'tool_1',
              name: 'tool_one',
              input: { param: 'value1' }
            }
          };
          yield { type: 'content_block_stop', index: 0 };
          
          // Second tool
          yield {
            type: 'content_block_start',
            index: 1,
            content_block: {
              type: 'tool_use',
              id: 'tool_2',
              name: 'tool_two',
              input: { param: 'value2' }
            }
          };
          yield { type: 'content_block_stop', index: 1 };
          yield { type: 'message_stop' };
        }
      };

      mockClient.messages.create.mockReturnValue(mockStream);

      const mcpTools = {
        tool_one: { description: 'Tool one' },
        tool_two: { description: 'Tool two' }
      };

      const result = await streamAnthropicResponse(
        mockClient,
        'claude-3-haiku-20240307',
        mockMessages,
        mockAgent,
        mcpTools,
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      expect(result.type).toBe('tool_calls');
      expect(result.tool_calls?.length).toBe(2);
    });

    it('should filter out tool calls with empty names', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          // Valid tool
          yield {
            type: 'content_block_start',
            index: 0,
            content_block: {
              type: 'tool_use',
              id: 'tool_1',
              name: 'valid_tool',
              input: { param: 'value' }
            }
          };
          yield { type: 'content_block_stop', index: 0 };
          
          // Invalid tool with empty name
          yield {
            type: 'content_block_start',
            index: 1,
            content_block: {
              type: 'tool_use',
              id: 'tool_2',
              name: '',
              input: {}
            }
          };
          yield { type: 'content_block_stop', index: 1 };
          yield { type: 'message_stop' };
        }
      };

      mockClient.messages.create.mockReturnValue(mockStream);

      const mcpTools = {
        valid_tool: { description: 'A valid tool' }
      };

      const result = await streamAnthropicResponse(
        mockClient,
        'claude-3-haiku-20240307',
        mockMessages,
        mockAgent,
        mcpTools,
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      expect(result.type).toBe('tool_calls');
      expect(result.tool_calls?.length).toBe(1);
      expect(result.tool_calls?.[0].function.name).toBe('valid_tool');
    });
  });

  describe('Error Handling', () => {
    it('should handle stream errors gracefully', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Starting...' }
          };
          throw new Error('Stream connection lost');
        }
      };

      mockClient.messages.create.mockReturnValue(mockStream);

      await expect(
        streamAnthropicResponse(
          mockClient,
          'claude-3-haiku-20240307',
          mockMessages,
          mockAgent,
          {},
          mockWorld,
          onChunkCallback,
          'msg-123'
        )
      ).rejects.toThrow('Stream connection lost');
    });

    it('should handle malformed JSON in tool arguments', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'content_block_start',
            index: 0,
            content_block: {
              type: 'tool_use',
              id: 'tool_1',
              name: 'test_tool',
              input: {}
            }
          };
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'input_json_delta',
              partial_json: '{invalid json'
            }
          };
          yield { type: 'content_block_stop', index: 0 };
          yield { type: 'message_stop' };
        }
      };

      mockClient.messages.create.mockReturnValue(mockStream);

      const result = await streamAnthropicResponse(
        mockClient,
        'claude-3-haiku-20240307',
        mockMessages,
        mockAgent,
        { test_tool: { description: 'Test' } },
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      // Should still return a result, possibly with fallback handling
      expect(result).toBeDefined();
    });

    it('should handle API rate limiting', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).status = 429;
      
      mockClient.messages.create.mockRejectedValue(rateLimitError);

      await expect(
        streamAnthropicResponse(
          mockClient,
          'claude-3-haiku-20240307',
          mockMessages,
          mockAgent,
          {},
          mockWorld,
          onChunkCallback,
          'msg-123'
        )
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('Invalid API key');
      (authError as any).status = 401;
      
      mockClient.messages.create.mockRejectedValue(authError);

      await expect(
        streamAnthropicResponse(
          mockClient,
          'claude-3-haiku-20240307',
          mockMessages,
          mockAgent,
          {},
          mockWorld,
          onChunkCallback,
          'msg-123'
        )
      ).rejects.toThrow('Invalid API key');
    });
  });

  describe('Message Conversion', () => {
    it('should handle tool result messages correctly', async () => {
      const messagesWithToolResult: ChatMessage[] = [
        { role: 'user', content: 'What is the weather?' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call_123',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"location":"SF"}' }
          }]
        },
        {
          role: 'tool',
          content: '{"temperature": 72, "condition": "sunny"}',
          tool_call_id: 'call_123'
        }
      ] as ChatMessage[];

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'It is 72 degrees and sunny.' }
          };
          yield { type: 'message_stop' };
        }
      };

      mockClient.messages.create.mockReturnValue(mockStream);

      const result = await streamAnthropicResponse(
        mockClient,
        'claude-3-haiku-20240307',
        messagesWithToolResult,
        mockAgent,
        {},
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      expect(result).toBeDefined();
      expect(mockClient.messages.create).toHaveBeenCalled();
    });

    it('should extract system prompt from messages', async () => {
      const messagesWithSystem: ChatMessage[] = [
        { role: 'system', content: 'You are a weather expert.' },
        { role: 'user', content: 'Tell me about weather.' }
      ] as ChatMessage[];

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Weather information...' }
          };
          yield { type: 'message_stop' };
        }
      };

      mockClient.messages.create.mockReturnValue(mockStream);

      const result = await streamAnthropicResponse(
        mockClient,
        'claude-3-haiku-20240307',
        messagesWithSystem,
        mockAgent,
        {},
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      expect(result).toBeDefined();
      // System message should be extracted and passed separately
      const callArgs = mockClient.messages.create.mock.calls[0][0];
      expect(callArgs.system).toBeTruthy();
    });
  });

  describe('Configuration', () => {
    it('should respect agent temperature setting', async () => {
      mockAgent.temperature = 0.3;

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Response' }
          };
          yield { type: 'message_stop' };
        }
      };

      mockClient.messages.create.mockReturnValue(mockStream);

      await streamAnthropicResponse(
        mockClient,
        'claude-3-haiku-20240307',
        mockMessages,
        mockAgent,
        {},
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      const callArgs = mockClient.messages.create.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.3);
    });

    it('should respect agent max tokens setting', async () => {
      mockAgent.maxTokens = 2000;

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Response' }
          };
          yield { type: 'message_stop' };
        }
      };

      mockClient.messages.create.mockReturnValue(mockStream);

      await streamAnthropicResponse(
        mockClient,
        'claude-3-haiku-20240307',
        mockMessages,
        mockAgent,
        {},
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      const callArgs = mockClient.messages.create.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(2000);
    });

    it('should include tools in request when provided', async () => {
      const mcpTools = {
        calculator: {
          description: 'Perform calculations',
          inputSchema: {
            type: 'object',
            properties: {
              expression: { type: 'string' }
            }
          }
        }
      };

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Response' }
          };
          yield { type: 'message_stop' };
        }
      };

      mockClient.messages.create.mockReturnValue(mockStream);

      await streamAnthropicResponse(
        mockClient,
        'claude-3-haiku-20240307',
        mockMessages,
        mockAgent,
        mcpTools,
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      const callArgs = mockClient.messages.create.mock.calls[0][0];
      expect(callArgs.tools).toBeDefined();
      expect(callArgs.tools.length).toBe(1);
      expect(callArgs.tools[0].name).toBe('calculator');
    });
  });
});

describe('Anthropic Client Factory', () => {
  it('should create client with valid API key', () => {
    const config = {
      provider: 'anthropic' as const,
      apiKey: 'test-api-key-123'
    };

    const client = createAnthropicClient(config);
    expect(client).toBeDefined();
  });
});
