/**
 * OpenAI Streaming Tests
 * 
 * Tests streaming response handling for OpenAI provider including:
 * - SSE event parsing and chunk processing
 * - Tool call fragment reconstruction
 * - Stream error handling
 * - Multiple provider support (OpenAI, Azure, XAI, Ollama, OpenAI-compatible)
 * 
 * Note: Uses mocked OpenAI SDK for consistent test behavior
 * ALWAYS use in-memory storage for unit tests - NEVER use file system or real database
 * ALWAYS mock LLM calls in tests - NEVER make real API calls to LLM
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  streamOpenAIResponse,
  createOpenAIClient,
  createAzureOpenAIClient,
  createXAIClient,
  createOllamaClient,
  createOpenAICompatibleClient
} from '../../../core/openai-direct.js';
import type { Agent, World, ChatMessage } from '../../../core/types.js';

describe('OpenAI Streaming Response Handler', () => {
  let mockClient: any;
  let mockAgent: Agent;
  let mockWorld: World;
  let mockMessages: ChatMessage[];
  let onChunkCallback: any;

  beforeEach(() => {
    // Mock OpenAI client
    mockClient = {
      chat: {
        completions: {
          create: vi.fn()
        }
      }
    };

    mockAgent = {
      id: 'test-agent',
      name: 'Test Agent',
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 4096,
      systemPrompt: 'You are a helpful assistant',
      memory: []
    } as Agent;

    mockWorld = {
      id: 'test-world',
      name: 'Test World',
      agents: [],
      chats: []
    } as World;

    mockMessages = [
      {
        role: 'system',
        content: 'You are a helpful assistant'
      },
      {
        role: 'user',
        content: 'Hello!'
      }
    ] as ChatMessage[];

    onChunkCallback = vi.fn();
  });

  describe('Basic Streaming', () => {
    it('should handle simple text streaming response', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            choices: [{
              delta: { content: 'Hello' },
              index: 0,
              finish_reason: null
            }]
          };
          yield {
            choices: [{
              delta: { content: ' there!' },
              index: 0,
              finish_reason: null
            }]
          };
          yield {
            choices: [{
              delta: {},
              index: 0,
              finish_reason: 'stop'
            }]
          };
        }
      };

      mockClient.chat.completions.create.mockResolvedValue(mockStream);

      const result = await streamOpenAIResponse(
        mockClient,
        'gpt-4',
        mockMessages,
        mockAgent,
        {},
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      expect(onChunkCallback).toHaveBeenCalledWith('Hello');
      expect(onChunkCallback).toHaveBeenCalledWith(' there!');
      expect(result).toBeDefined();
      expect(result.type).toBe('text');
      expect(result.content).toContain('Hello there!');
    });

    it('should accumulate multiple small chunks correctly', async () => {
      const chunks = ['H', 'e', 'l', 'l', 'o'];
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield {
              choices: [{
                delta: { content: chunk },
                index: 0,
                finish_reason: null
              }]
            };
          }
          yield {
            choices: [{
              delta: {},
              index: 0,
              finish_reason: 'stop'
            }]
          };
        }
      };

      mockClient.chat.completions.create.mockResolvedValue(mockStream);

      const result = await streamOpenAIResponse(
        mockClient,
        'gpt-4',
        mockMessages,
        mockAgent,
        {},
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      expect(onChunkCallback).toHaveBeenCalledTimes(chunks.length);
      expect(result.content).toContain('Hello');
    });
  });

  describe('Tool Call Streaming', () => {
    it('should reconstruct fragmented tool call arguments', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: ''
                  }
                }]
              },
              index: 0,
              finish_reason: null
            }]
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  function: {
                    arguments: '{"location":'
                  }
                }]
              },
              index: 0,
              finish_reason: null
            }]
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  function: {
                    arguments: '"San Francisco"}'
                  }
                }]
              },
              index: 0,
              finish_reason: null
            }]
          };
          yield {
            choices: [{
              delta: {},
              index: 0,
              finish_reason: 'tool_calls'
            }]
          };
        }
      };

      mockClient.chat.completions.create.mockResolvedValue(mockStream);

      const mcpTools = {
        get_weather: {
          description: 'Get weather',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' }
            }
          }
        }
      };

      const result = await streamOpenAIResponse(
        mockClient,
        'gpt-4',
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
      expect(result.tool_calls?.[0].function.arguments).toContain('San Francisco');
    });

    it('should handle multiple tool calls in one stream', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          // First tool
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'tool_one',
                    arguments: '{"param":"value1"}'
                  }
                }]
              },
              index: 0,
              finish_reason: null
            }]
          };
          // Second tool
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 1,
                  id: 'call_2',
                  type: 'function',
                  function: {
                    name: 'tool_two',
                    arguments: '{"param":"value2"}'
                  }
                }]
              },
              index: 0,
              finish_reason: null
            }]
          };
          yield {
            choices: [{
              delta: {},
              index: 0,
              finish_reason: 'tool_calls'
            }]
          };
        }
      };

      mockClient.chat.completions.create.mockResolvedValue(mockStream);

      const result = await streamOpenAIResponse(
        mockClient,
        'gpt-4',
        mockMessages,
        mockAgent,
        { tool_one: {}, tool_two: {} },
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
          yield {
            choices: [{
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'valid_tool', arguments: '{}' }
                  },
                  {
                    index: 1,
                    id: 'call_2',
                    type: 'function',
                    function: { name: '', arguments: '{}' }
                  }
                ]
              },
              index: 0,
              finish_reason: null
            }]
          };
          yield {
            choices: [{
              delta: {},
              index: 0,
              finish_reason: 'tool_calls'
            }]
          };
        }
      };

      mockClient.chat.completions.create.mockResolvedValue(mockStream);

      const result = await streamOpenAIResponse(
        mockClient,
        'gpt-4',
        mockMessages,
        mockAgent,
        { valid_tool: {} },
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
            choices: [{
              delta: { content: 'Starting...' },
              index: 0,
              finish_reason: null
            }]
          };
          throw new Error('Stream connection lost');
        }
      };

      mockClient.chat.completions.create.mockResolvedValue(mockStream);

      await expect(
        streamOpenAIResponse(
          mockClient,
          'gpt-4',
          mockMessages,
          mockAgent,
          {},
          mockWorld,
          onChunkCallback,
          'msg-123'
        )
      ).rejects.toThrow('Stream connection lost');
    });

    it('should handle API rate limiting', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).status = 429;

      mockClient.chat.completions.create.mockRejectedValue(rateLimitError);

      await expect(
        streamOpenAIResponse(
          mockClient,
          'gpt-4',
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

      mockClient.chat.completions.create.mockRejectedValue(authError);

      await expect(
        streamOpenAIResponse(
          mockClient,
          'gpt-4',
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
          content: '{"temperature": 72}',
          tool_call_id: 'call_123'
        }
      ] as ChatMessage[];

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            choices: [{
              delta: { content: 'It is 72 degrees.' },
              index: 0,
              finish_reason: null
            }]
          };
          yield {
            choices: [{
              delta: {},
              index: 0,
              finish_reason: 'stop'
            }]
          };
        }
      };

      mockClient.chat.completions.create.mockResolvedValue(mockStream);

      const result = await streamOpenAIResponse(
        mockClient,
        'gpt-4',
        messagesWithToolResult,
        mockAgent,
        {},
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      expect(result).toBeDefined();
      expect(mockClient.chat.completions.create).toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
    it('should respect agent temperature setting', async () => {
      mockAgent.temperature = 0.3;

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            choices: [{
              delta: { content: 'Response' },
              index: 0,
              finish_reason: null
            }]
          };
          yield {
            choices: [{
              delta: {},
              index: 0,
              finish_reason: 'stop'
            }]
          };
        }
      };

      mockClient.chat.completions.create.mockResolvedValue(mockStream);

      await streamOpenAIResponse(
        mockClient,
        'gpt-4',
        mockMessages,
        mockAgent,
        {},
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      const callArgs = mockClient.chat.completions.create.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.3);
    });

    it('should respect agent max tokens setting', async () => {
      mockAgent.maxTokens = 2000;

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            choices: [{
              delta: { content: 'Response' },
              index: 0,
              finish_reason: null
            }]
          };
          yield {
            choices: [{
              delta: {},
              index: 0,
              finish_reason: 'stop'
            }]
          };
        }
      };

      mockClient.chat.completions.create.mockResolvedValue(mockStream);

      await streamOpenAIResponse(
        mockClient,
        'gpt-4',
        mockMessages,
        mockAgent,
        {},
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      const callArgs = mockClient.chat.completions.create.mock.calls[0][0];
      expect(callArgs.max_completion_tokens).toBe(2000);
    });

    it('should include tools in request when provided', async () => {
      const mcpTools = {
        calculator: {
          description: 'Perform calculations',
          parameters: {
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
            choices: [{
              delta: { content: 'Response' },
              index: 0,
              finish_reason: null
            }]
          };
          yield {
            choices: [{
              delta: {},
              index: 0,
              finish_reason: 'stop'
            }]
          };
        }
      };

      mockClient.chat.completions.create.mockResolvedValue(mockStream);

      await streamOpenAIResponse(
        mockClient,
        'gpt-4',
        mockMessages,
        mockAgent,
        mcpTools,
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      const callArgs = mockClient.chat.completions.create.mock.calls[0][0];
      expect(callArgs.tools).toBeDefined();
      expect(callArgs.tools.length).toBe(1);
      expect(callArgs.tools[0].function.name).toBe('calculator');
    });
  });
});

describe('OpenAI Client Factories', () => {
  it('should create standard OpenAI client with API key', () => {
    const config = {
      provider: 'openai' as const,
      apiKey: 'test-api-key-123'
    };

    const client = createOpenAIClient(config);
    expect(client).toBeDefined();
  });

  it('should create Azure OpenAI client with required config', () => {
    const config = {
      provider: 'azure' as const,
      apiKey: 'test-api-key',
      resourceName: 'test-resource',
      deployment: 'test-deployment',
      apiVersion: '2024-10-21-preview'
    };

    const client = createAzureOpenAIClient(config);
    expect(client).toBeDefined();
  });

  it('should create XAI client with API key', () => {
    const config = {
      provider: 'xai' as const,
      apiKey: 'test-api-key'
    };

    const client = createXAIClient(config);
    expect(client).toBeDefined();
  });

  it('should create Ollama client with base URL', () => {
    const config = {
      provider: 'ollama' as const,
      baseUrl: 'http://localhost:11434/v1'
    };

    const client = createOllamaClient(config);
    expect(client).toBeDefined();
  });

  it('should create OpenAI-compatible client with base URL', () => {
    const config = {
      provider: 'openai-compatible' as const,
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com/v1'
    };

    const client = createOpenAICompatibleClient(config);
    expect(client).toBeDefined();
  });
});
