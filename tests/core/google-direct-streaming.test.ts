/**
 * Google Direct Streaming Tests
 *
 * Purpose:
 * - Guard streaming regressions in the Google direct provider adapter.
 *
 * Key Features:
 * - Preserves plain text streaming when the SDK exposes chunk text without `content.parts`.
 * - Routes thought-marked Gemini parts into the separate reasoning channel.
 * - Confirms Google function declarations strip unsupported nested `additionalProperties` fields.
 *
 * Implementation Notes:
 * - Uses a fully mocked Google client and async iterable stream.
 * - Avoids real network, real filesystem, and real provider calls.
 */

import { describe, expect, it, vi } from 'vitest';

import { generateGoogleResponse, streamGoogleResponse } from '../../core/google-direct.js';
import type { Agent, ChatMessage, World } from '../../core/types.js';

function createAgent(): Agent {
  return {
    id: 'g1',
    name: 'g1',
    type: 'assistant',
    provider: 'google' as any,
    model: 'gemini-2.5-flash',
    llmCallCount: 0,
    memory: [],
    temperature: 0.2,
    maxTokens: 128,
  };
}

function createWorld(variables = 'reasoning_effort=medium'): World {
  return {
    id: 'world-1',
    name: 'world-1',
    turnLimit: 5,
    createdAt: new Date(),
    lastUpdated: new Date(),
    totalAgents: 0,
    totalMessages: 0,
    eventEmitter: {} as any,
    agents: new Map(),
    chats: new Map(),
    variables,
  } as World;
}

function createAsyncStream<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

describe('google direct streaming', () => {
  it('falls back to chunk.text() when streaming chunks have no content parts', async () => {
    const chunks = [
      {
        text: () => 'plain text chunk',
        candidates: [{}],
      },
    ];

    const generateContentStream = vi.fn().mockResolvedValue({
      stream: createAsyncStream(chunks),
    });
    const getGenerativeModel = vi.fn().mockReturnValue({ generateContentStream });
    const fakeClient = { getGenerativeModel } as any;
    const onChunk = vi.fn();

    const response = await streamGoogleResponse(
      fakeClient,
      'gemini-2.5-flash',
      [{ role: 'user', content: 'hello' } as ChatMessage],
      createAgent(),
      {},
      createWorld(),
      onChunk,
      'msg-1'
    );

    expect(onChunk).toHaveBeenCalledWith({ content: 'plain text chunk' });
    expect(response).toMatchObject({
      type: 'text',
      content: 'plain text chunk',
    });
  });

  it('separates thought-marked parts from answer text during streaming', async () => {
    const chunks = [
      {
        text: () => 'ignored aggregate text',
        candidates: [{
          content: {
            parts: [
              { text: 'reasoning step', thought: true },
              { text: 'final answer' },
            ],
          },
        }],
      },
    ];

    const generateContentStream = vi.fn().mockResolvedValue({
      stream: createAsyncStream(chunks),
    });
    const getGenerativeModel = vi.fn().mockReturnValue({ generateContentStream });
    const fakeClient = { getGenerativeModel } as any;
    const onChunk = vi.fn();

    const response = await streamGoogleResponse(
      fakeClient,
      'gemini-2.5-flash',
      [{ role: 'user', content: 'hello' } as ChatMessage],
      createAgent(),
      {},
      createWorld(),
      onChunk,
      'msg-1'
    );

    expect(onChunk).toHaveBeenNthCalledWith(1, { reasoningContent: 'reasoning step' });
    expect(onChunk).toHaveBeenNthCalledWith(2, { content: 'final answer' });
    expect(response).toMatchObject({
      type: 'text',
      content: 'final answer',
    });
  });

  it('adds thinkingConfig even for models previously treated as unsupported', async () => {
    const response = {
      response: {
        text: () => 'ok',
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
      },
    };
    const generateContent = vi.fn().mockResolvedValue(response);
    const getGenerativeModel = vi.fn().mockReturnValue({ generateContent });
    const fakeClient = { getGenerativeModel } as any;

    await generateGoogleResponse(
      fakeClient,
      'gemini-1.5-flash',
      [{ role: 'user', content: 'hello' } as ChatMessage],
      createAgent(),
      {},
      createWorld('reasoning_effort=high')
    );

    expect(getGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-1.5-flash',
      generationConfig: expect.objectContaining({
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: 2048,
        },
      }),
    }));
  });

  it('sends a zero-budget thinkingConfig when the world sets reasoning to none', async () => {
    const response = {
      response: {
        text: () => 'ok',
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
      },
    };
    const generateContent = vi.fn().mockResolvedValue(response);
    const getGenerativeModel = vi.fn().mockReturnValue({ generateContent });
    const fakeClient = { getGenerativeModel } as any;

    await generateGoogleResponse(
      fakeClient,
      'gemini-1.5-flash',
      [{ role: 'user', content: 'hello' } as ChatMessage],
      createAgent(),
      {},
      createWorld('reasoning_effort=none')
    );

    expect(getGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-1.5-flash',
      generationConfig: expect.objectContaining({
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: 0,
        },
      }),
    }));
  });

  it('omits thinkingConfig when the world uses default reasoning behavior', async () => {
    const response = {
      response: {
        text: () => 'ok',
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
      },
    };
    const generateContent = vi.fn().mockResolvedValue(response);
    const getGenerativeModel = vi.fn().mockReturnValue({ generateContent });
    const fakeClient = { getGenerativeModel } as any;

    await generateGoogleResponse(
      fakeClient,
      'gemini-1.5-flash',
      [{ role: 'user', content: 'hello' } as ChatMessage],
      createAgent(),
      {},
      createWorld('')
    );

    expect(getGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-1.5-flash',
      generationConfig: expect.not.objectContaining({
        thinkingConfig: expect.anything(),
      }),
    }));
  });

  it('uses tool.parameters when building Google function declarations', async () => {
    const response = {
      response: {
        text: () => 'ok',
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
      },
    };
    const generateContent = vi.fn().mockResolvedValue(response);
    const getGenerativeModel = vi.fn().mockReturnValue({ generateContent });
    const fakeClient = { getGenerativeModel } as any;

    await generateGoogleResponse(
      fakeClient,
      'gemini-2.5-flash',
      [{ role: 'user', content: 'load a skill' } as ChatMessage],
      createAgent(),
      {
        load_skill: {
          description: 'Load a skill',
          parameters: {
            type: 'object',
            properties: {
              skill_id: { type: 'string' },
            },
            required: ['skill_id'],
          },
        },
      },
      createWorld('')
    );

    expect(getGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({
      tools: [{
        functionDeclarations: [expect.objectContaining({
          name: 'load_skill',
          parameters: expect.objectContaining({
            properties: expect.objectContaining({
              skill_id: { type: 'string' },
            }),
            required: ['skill_id'],
          }),
        })],
      }],
    }));
  });

  it('strips nested additionalProperties from Google function declaration schemas', async () => {
    const response = {
      response: {
        text: () => 'ok',
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
      },
    };
    const generateContent = vi.fn().mockResolvedValue(response);
    const getGenerativeModel = vi.fn().mockReturnValue({ generateContent });
    const fakeClient = { getGenerativeModel } as any;

    await generateGoogleResponse(
      fakeClient,
      'gemini-2.5-flash',
      [{ role: 'user', content: 'run a tool' } as ChatMessage],
      createAgent(),
      {
        shell_cmd: {
          description: 'Run shell command',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              command: { type: 'string' },
              options: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  env: {
                    anyOf: [
                      {
                        type: 'array',
                        items: {
                          type: 'object',
                          additionalProperties: false,
                          properties: {
                            name: { type: 'string' },
                            value: {
                              type: 'object',
                              additionalProperties: false,
                              properties: {
                                nested: { type: 'string' },
                              },
                            },
                          },
                        },
                      },
                      { type: 'null' },
                    ],
                  },
                },
              },
            },
            required: ['command'],
          },
        },
      },
      createWorld('')
    );

    const modelConfig = getGenerativeModel.mock.calls[0]?.[0];
    const parameters = modelConfig?.tools?.[0]?.functionDeclarations?.[0]?.parameters;

    expect(parameters).toEqual({
      type: 'object',
      properties: {
        command: { type: 'string' },
        options: {
          type: 'object',
          properties: {
            env: {
              anyOf: [
                {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      value: {
                        type: 'object',
                        properties: {
                          nested: { type: 'string' },
                        },
                      },
                    },
                  },
                },
                { type: 'null' },
              ],
            },
          },
        },
      },
      required: ['command'],
    });
    expect(JSON.stringify(parameters)).not.toContain('additionalProperties');
  });
});