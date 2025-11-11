/**
 * LLM Provider Error Handling Tests
 * 
 * Tests comprehensive error handling across all LLM providers including:
 * - API failures (4xx, 5xx errors)
 * - Network timeouts
 * - Rate limiting (429 responses)
 * - Invalid API keys (401/403)
 * - Malformed responses
 * - Token limit exceeded
 * - Connection errors
 * 
 * ALWAYS use in-memory storage for unit tests - NEVER use file system or real database
 * ALWAYS mock LLM calls in tests - NEVER make real API calls to LLM
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateAnthropicResponse,
  streamAnthropicResponse
} from '../../../core/anthropic-direct.js';
import {
  generateOpenAIResponse,
  streamOpenAIResponse
} from '../../../core/openai-direct.js';
import {
  generateGoogleResponse,
  streamGoogleResponse
} from '../../../core/google-direct.js';
import type { Agent, World, ChatMessage } from '../../../core/types.js';

describe('LLM Provider Error Handling', () => {
  let mockAgent: Agent;
  let mockWorld: World;
  let mockMessages: ChatMessage[];

  beforeEach(() => {
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
  });

  describe('Authentication Errors', () => {
    it('should handle OpenAI invalid API key (401)', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(
              Object.assign(new Error('Invalid API key'), { status: 401 })
            )
          }
        }
      };

      await expect(
        generateOpenAIResponse(
          mockClient as any,
          'gpt-4',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('Invalid API key');
    });

    it('should handle Anthropic invalid API key (401)', async () => {
      const mockClient = {
        messages: {
          create: vi.fn().mockRejectedValue(
            Object.assign(new Error('Invalid API key'), { status: 401 })
          )
        }
      };

      await expect(
        generateAnthropicResponse(
          mockClient as any,
          'claude-3-haiku-20240307',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('Invalid API key');
    });

    it('should handle Google invalid API key (401)', async () => {
      const mockClient = {
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: vi.fn().mockRejectedValue(
            Object.assign(new Error('Invalid API key'), { status: 401 })
          )
        })
      };

      await expect(
        generateGoogleResponse(
          mockClient as any,
          'gemini-pro',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('Invalid API key');
    });

    it('should handle permission denied (403)', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(
              Object.assign(new Error('Permission denied'), { status: 403 })
            )
          }
        }
      };

      await expect(
        generateOpenAIResponse(
          mockClient as any,
          'gpt-4',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('Rate Limiting Errors', () => {
    it('should handle OpenAI rate limit (429)', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(
              Object.assign(new Error('Rate limit exceeded'), { status: 429 })
            )
          }
        }
      };

      await expect(
        generateOpenAIResponse(
          mockClient as any,
          'gpt-4',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle Anthropic rate limit (429)', async () => {
      const mockClient = {
        messages: {
          create: vi.fn().mockRejectedValue(
            Object.assign(new Error('Rate limit exceeded'), { status: 429 })
          )
        }
      };

      await expect(
        generateAnthropicResponse(
          mockClient as any,
          'claude-3-haiku-20240307',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle Google rate limit (429)', async () => {
      const mockClient = {
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: vi.fn().mockRejectedValue(
            Object.assign(new Error('Rate limit exceeded'), { status: 429 })
          )
        })
      };

      await expect(
        generateGoogleResponse(
          mockClient as any,
          'gemini-pro',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle rate limit in streaming', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(
              Object.assign(new Error('Rate limit exceeded'), { status: 429 })
            )
          }
        }
      };

      await expect(
        streamOpenAIResponse(
          mockClient as any,
          'gpt-4',
          mockMessages,
          mockAgent,
          {},
          mockWorld,
          vi.fn(),
          'msg-123'
        )
      ).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('Server Errors', () => {
    it('should handle 500 internal server error', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(
              Object.assign(new Error('Internal server error'), { status: 500 })
            )
          }
        }
      };

      await expect(
        generateOpenAIResponse(
          mockClient as any,
          'gpt-4',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('Internal server error');
    });

    it('should handle 502 bad gateway', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(
              Object.assign(new Error('Bad gateway'), { status: 502 })
            )
          }
        }
      };

      await expect(
        generateOpenAIResponse(
          mockClient as any,
          'gpt-4',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('Bad gateway');
    });

    it('should handle 503 service unavailable', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(
              Object.assign(new Error('Service unavailable'), { status: 503 })
            )
          }
        }
      };

      await expect(
        generateOpenAIResponse(
          mockClient as any,
          'gpt-4',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('Service unavailable');
    });

    it('should handle 504 gateway timeout', async () => {
      const mockClient = {
        messages: {
          create: vi.fn().mockRejectedValue(
            Object.assign(new Error('Gateway timeout'), { status: 504 })
          )
        }
      };

      await expect(
        generateAnthropicResponse(
          mockClient as any,
          'claude-3-haiku-20240307',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('Gateway timeout');
    });
  });

  describe('Client Errors', () => {
    it('should handle 400 bad request', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(
              Object.assign(new Error('Bad request'), { status: 400 })
            )
          }
        }
      };

      await expect(
        generateOpenAIResponse(
          mockClient as any,
          'gpt-4',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('Bad request');
    });

    it('should handle 404 not found (invalid model)', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(
              Object.assign(new Error('Model not found'), { status: 404 })
            )
          }
        }
      };

      await expect(
        generateOpenAIResponse(
          mockClient as any,
          'invalid-model',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('Model not found');
    });

    it('should handle 413 payload too large', async () => {
      const mockClient = {
        messages: {
          create: vi.fn().mockRejectedValue(
            Object.assign(new Error('Payload too large'), { status: 413 })
          )
        }
      };

      await expect(
        generateAnthropicResponse(
          mockClient as any,
          'claude-3-haiku-20240307',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('Payload too large');
    });
  });

  describe('Network Errors', () => {
    it('should handle network connection error', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('Network connection failed'))
          }
        }
      };

      await expect(
        generateOpenAIResponse(
          mockClient as any,
          'gpt-4',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('Network connection failed');
    });

    it('should handle timeout error', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('Request timeout'))
          }
        }
      };

      await expect(
        generateOpenAIResponse(
          mockClient as any,
          'gpt-4',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('Request timeout');
    });

    it('should handle DNS resolution error', async () => {
      const mockClient = {
        messages: {
          create: vi.fn().mockRejectedValue(new Error('DNS resolution failed'))
        }
      };

      await expect(
        generateAnthropicResponse(
          mockClient as any,
          'claude-3-haiku-20240307',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('DNS resolution failed');
    });

    it('should handle connection reset', async () => {
      const mockClient = {
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: vi.fn().mockRejectedValue(new Error('Connection reset by peer'))
        })
      };

      await expect(
        generateGoogleResponse(
          mockClient as any,
          'gemini-pro',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('Connection reset by peer');
    });
  });

  describe('Malformed Response Errors', () => {
    it('should handle missing response choices (OpenAI)', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: []
            })
          }
        }
      };

      await expect(
        generateOpenAIResponse(
          mockClient as any,
          'gpt-4',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('No response message received from OpenAI');
    });

    it('should handle missing content in response', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{
                message: {
                  role: 'assistant',
                  content: null
                }
              }]
            })
          }
        }
      };

      const result = await generateOpenAIResponse(
        mockClient as any,
        'gpt-4',
        mockMessages,
        mockAgent,
        {}
      );

      expect(result).toBeDefined();
    });

    it('should handle missing candidates (Google)', async () => {
      const mockClient = {
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: vi.fn().mockResolvedValue({
            response: {
              candidates: [],
              text: vi.fn().mockReturnValue('')
            }
          })
        })
      };

      const result = await generateGoogleResponse(
        mockClient as any,
        'gemini-pro',
        mockMessages,
        mockAgent,
        {}
      );

      expect(result).toBeDefined();
    });

    it('should handle streaming with empty chunks', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              [Symbol.asyncIterator]: async function* () {
                yield { choices: [{ delta: {}, index: 0, finish_reason: null }] };
                yield { choices: [{ delta: {}, index: 0, finish_reason: 'stop' }] };
              }
            })
          }
        }
      };

      const onChunk = vi.fn();
      const result = await streamOpenAIResponse(
        mockClient as any,
        'gpt-4',
        mockMessages,
        mockAgent,
        {},
        mockWorld,
        onChunk,
        'msg-123'
      );

      expect(result).toBeDefined();
      expect(result.type).toBe('text');
    });
  });

  describe('Token Limit Errors', () => {
    it('should handle context length exceeded error', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(
              Object.assign(
                new Error('Maximum context length exceeded'),
                { status: 400 }
              )
            )
          }
        }
      };

      await expect(
        generateOpenAIResponse(
          mockClient as any,
          'gpt-4',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow('Maximum context length exceeded');
    });

    it('should handle token limit in streaming', async () => {
      const mockClient = {
        messages: {
          create: vi.fn().mockRejectedValue(
            Object.assign(
              new Error('Maximum tokens exceeded'),
              { status: 400 }
            )
          )
        }
      };

      await expect(
        streamAnthropicResponse(
          mockClient as any,
          'claude-3-haiku-20240307',
          mockMessages,
          mockAgent,
          {},
          mockWorld,
          vi.fn(),
          'msg-123'
        )
      ).rejects.toThrow('Maximum tokens exceeded');
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined client', async () => {
      await expect(
        generateOpenAIResponse(
          undefined as any,
          'gpt-4',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow();
    });

    it('should handle null messages', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('Invalid messages'))
          }
        }
      };

      await expect(
        generateOpenAIResponse(
          mockClient as any,
          'gpt-4',
          null as any,
          mockAgent,
          {}
        )
      ).rejects.toThrow();
    });

    it('should handle empty messages array', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{
                message: {
                  role: 'assistant',
                  content: 'Hello'
                }
              }]
            })
          }
        }
      };

      const result = await generateOpenAIResponse(
        mockClient as any,
        'gpt-4',
        [],
        mockAgent,
        {}
      );

      expect(result).toBeDefined();
    });

    it('should handle very long error messages gracefully', async () => {
      const longError = 'Error: ' + 'x'.repeat(10000);
      const mockClient = {
        messages: {
          create: vi.fn().mockRejectedValue(new Error(longError))
        }
      };

      await expect(
        generateAnthropicResponse(
          mockClient as any,
          'claude-3-haiku-20240307',
          mockMessages,
          mockAgent,
          {}
        )
      ).rejects.toThrow();
    });
  });
});
