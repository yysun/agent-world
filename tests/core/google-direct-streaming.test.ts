/**
 * Google Direct Streaming Tests
 *
 * Purpose:
 * - Guard streaming regressions in the Google direct provider adapter.
 *
 * Key Features:
 * - Preserves plain text streaming when the SDK exposes chunk text without `content.parts`.
 * - Routes thought-marked Gemini parts into the separate reasoning channel.
 *
 * Implementation Notes:
 * - Uses a fully mocked Google client and async iterable stream.
 * - Avoids real network, real filesystem, and real provider calls.
 */

import { describe, expect, it, vi } from 'vitest';

import { streamGoogleResponse } from '../../core/google-direct.js';
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

function createWorld(): World {
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
    variables: 'reasoning_effort=medium',
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
});