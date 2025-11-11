/**
 * Google Streaming Tests
 * 
 * Tests streaming response handling for Google Generative AI provider including:
 * - Chunk processing for Gemini models
 * - Function call detection and reconstruction
 * - Stream error handling
 * 
 * Note: Uses mocked Google Generative AI SDK for consistent test behavior
 * ALWAYS use in-memory storage for unit tests - NEVER use file system or real database
 * ALWAYS mock LLM calls in tests - NEVER make real API calls to LLM
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  streamGoogleResponse,
  createGoogleClient,
  createGoogleModel
} from '../../../core/google-direct.js';
import type { Agent, World, ChatMessage } from '../../../core/types.js';

describe('Google Streaming Response Handler', () => {
  let mockClient: any;
  let mockAgent: Agent;
  let mockWorld: World;
  let mockMessages: ChatMessage[];
  let onChunkCallback: any;

  beforeEach(() => {
    // Mock Google client
    mockClient = {
      getGenerativeModel: vi.fn()
    };

    mockAgent = {
      id: 'test-agent',
      name: 'Test Agent',
      provider: 'google',
      model: 'gemini-pro',
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
      const mockModel = {
        generateContentStream: vi.fn().mockResolvedValue({
          stream: {
            [Symbol.asyncIterator]: async function* () {
              yield {
                text: () => 'Hello',
                candidates: [{
                  content: {
                    parts: [{ text: 'Hello' }],
                    role: 'model'
                  }
                }]
              };
              yield {
                text: () => ' there!',
                candidates: [{
                  content: {
                    parts: [{ text: ' there!' }],
                    role: 'model'
                  }
                }]
              };
            }
          }
        })
      };

      mockClient.getGenerativeModel.mockReturnValue(mockModel);

      const result = await streamGoogleResponse(
        mockClient,
        'gemini-pro',
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
      const mockModel = {
        generateContentStream: vi.fn().mockResolvedValue({
          stream: {
            [Symbol.asyncIterator]: async function* () {
              for (const chunk of chunks) {
                yield {
                  text: () => chunk,
                  candidates: [{
                    content: {
                      parts: [{ text: chunk }],
                      role: 'model'
                    }
                  }]
                };
              }
            }
          }
        })
      };

      mockClient.getGenerativeModel.mockReturnValue(mockModel);

      const result = await streamGoogleResponse(
        mockClient,
        'gemini-pro',
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

  describe('Function Call Streaming', () => {
    it('should detect and handle function calls from stream', async () => {
      const mockModel = {
        generateContentStream: vi.fn().mockResolvedValue({
          stream: {
            [Symbol.asyncIterator]: async function* () {
              yield {
                text: () => '',
                candidates: [{
                  content: {
                    parts: [{
                      functionCall: {
                        name: 'get_weather',
                        args: { location: 'San Francisco' }
                      }
                    }],
                    role: 'model'
                  }
                }]
              };
            }
          }
        })
      };

      mockClient.getGenerativeModel.mockReturnValue(mockModel);

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

      const result = await streamGoogleResponse(
        mockClient,
        'gemini-pro',
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

    it('should handle multiple function calls in one stream', async () => {
      const mockModel = {
        generateContentStream: vi.fn().mockResolvedValue({
          stream: {
            [Symbol.asyncIterator]: async function* () {
              yield {
                text: () => '',
                candidates: [{
                  content: {
                    parts: [
                      {
                        functionCall: {
                          name: 'tool_one',
                          args: { param: 'value1' }
                        }
                      },
                      {
                        functionCall: {
                          name: 'tool_two',
                          args: { param: 'value2' }
                        }
                      }
                    ],
                    role: 'model'
                  }
                }]
              };
            }
          }
        })
      };

      mockClient.getGenerativeModel.mockReturnValue(mockModel);

      const result = await streamGoogleResponse(
        mockClient,
        'gemini-pro',
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

    it('should filter out function calls with empty names', async () => {
      const mockModel = {
        generateContentStream: vi.fn().mockResolvedValue({
          stream: {
            [Symbol.asyncIterator]: async function* () {
              yield {
                text: () => '',
                candidates: [{
                  content: {
                    parts: [
                      {
                        functionCall: {
                          name: 'valid_tool',
                          args: { param: 'value' }
                        }
                      },
                      {
                        functionCall: {
                          name: '',
                          args: {}
                        }
                      }
                    ],
                    role: 'model'
                  }
                }]
              };
            }
          }
        })
      };

      mockClient.getGenerativeModel.mockReturnValue(mockModel);

      const result = await streamGoogleResponse(
        mockClient,
        'gemini-pro',
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
      const mockModel = {
        generateContentStream: vi.fn().mockResolvedValue({
          stream: {
            [Symbol.asyncIterator]: async function* () {
              yield {
                text: () => '',
                candidates: [{
                  content: {
                    parts: [{ text: 'Starting...' }],
                    role: 'model'
                  }
                }]
              };
              throw new Error('Stream connection lost');
            }
          }
        })
      };

      mockClient.getGenerativeModel.mockReturnValue(mockModel);

      await expect(
        streamGoogleResponse(
          mockClient,
          'gemini-pro',
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

      const mockModel = {
        generateContentStream: vi.fn().mockRejectedValue(rateLimitError)
      };

      mockClient.getGenerativeModel.mockReturnValue(mockModel);

      await expect(
        streamGoogleResponse(
          mockClient,
          'gemini-pro',
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

      const mockModel = {
        generateContentStream: vi.fn().mockRejectedValue(authError)
      };

      mockClient.getGenerativeModel.mockReturnValue(mockModel);

      await expect(
        streamGoogleResponse(
          mockClient,
          'gemini-pro',
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
    it('should handle function response messages correctly', async () => {
      const messagesWithFunctionResult: ChatMessage[] = [
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

      const mockModel = {
        generateContentStream: vi.fn().mockResolvedValue({
          stream: {
            [Symbol.asyncIterator]: async function* () {
              yield {
                text: () => '',
                candidates: [{
                  content: {
                    parts: [{ text: 'It is 72 degrees.' }],
                    role: 'model'
                  }
                }]
              };
            }
          }
        })
      };

      mockClient.getGenerativeModel.mockReturnValue(mockModel);

      const result = await streamGoogleResponse(
        mockClient,
        'gemini-pro',
        messagesWithFunctionResult,
        mockAgent,
        {},
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      expect(result).toBeDefined();
      expect(mockClient.getGenerativeModel).toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
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

      const mockModel = {
        generateContentStream: vi.fn().mockResolvedValue({
          stream: {
            [Symbol.asyncIterator]: async function* () {
              yield {
                text: () => '',
                candidates: [{
                  content: {
                    parts: [{ text: 'Response' }],
                    role: 'model'
                  }
                }]
              };
            }
          }
        })
      };

      mockClient.getGenerativeModel.mockReturnValue(mockModel);

      await streamGoogleResponse(
        mockClient,
        'gemini-pro',
        mockMessages,
        mockAgent,
        mcpTools,
        mockWorld,
        onChunkCallback,
        'msg-123'
      );

      const callArgs = mockClient.getGenerativeModel.mock.calls[0][0];
      expect(callArgs.tools).toBeDefined();
    });
  });
});

describe('Google Client Factories', () => {
  it('should create client with valid API key', () => {
    const config = {
      provider: 'google' as const,
      apiKey: 'test-api-key-123'
    };

    const client = createGoogleClient(config);
    expect(client).toBeDefined();
  });

  it('should create model instance', () => {
    const mockClient = {
      getGenerativeModel: vi.fn().mockReturnValue({})
    };

    const model = createGoogleModel(mockClient as any, 'gemini-pro');
    expect(mockClient.getGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-pro' })
    );
  });

  it('should create model instance with tools', () => {
    const mockClient = {
      getGenerativeModel: vi.fn().mockReturnValue({})
    };

    const tools = [{
      name: 'test_tool',
      description: 'A test tool',
      parameters: {}
    }];

    const model = createGoogleModel(mockClient as any, 'gemini-pro', tools);
    expect(mockClient.getGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-pro',
        tools: [{ functionDeclarations: tools }]
      })
    );
  });
});
