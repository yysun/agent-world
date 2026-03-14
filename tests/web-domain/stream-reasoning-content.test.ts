/**
 * Web SSE Reasoning Content Tests
 *
 * Purpose:
 * - Lock the web assistant streaming behavior for the separate reasoning channel.
 *
 * Key Features:
 * - Preserves answer text and reasoning text independently on live stream rows.
 * - Verifies reasoning-only chunks do not get dropped from web transcript state.
 *
 * Implementation Notes:
 * - Mocks AppRun and API modules so the pure SSE helpers can run in Node.
 * - Exercises exported SSE handlers directly with deterministic state objects.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('apprun', () => ({
  default: { run: vi.fn(), on: vi.fn() },
}));

vi.mock('../../web/src/api', () => ({
  apiRequest: vi.fn(),
}));

import { handleStreamChunk, handleStreamEnd, handleStreamStart } from '../../web/src/utils/sse-client';

function createBaseState() {
  return {
    messages: [],
    worldName: 'world-1',
    needScroll: false,
  } as any;
}

describe('web assistant reasoning streaming', () => {
  it('stores reasoning content separately from streamed answer text', () => {
    const startedState = handleStreamStart(createBaseState(), {
      messageId: 'assistant-stream-1',
      sender: 'assistant-1',
    } as any);

    const nextState = handleStreamChunk(startedState, {
      messageId: 'assistant-stream-1',
      sender: 'assistant-1',
      content: 'Final answer',
      reasoningContent: 'Reasoning step',
      isAccumulated: true,
    });

    expect(nextState.messages).toEqual([
      expect.objectContaining({
        messageId: 'assistant-stream-1',
        text: 'Final answer',
        reasoningContent: 'Reasoning step',
        isStreaming: true,
      }),
    ]);
  });

  it('keeps completed reasoning content and records finalized duration on stream end', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T12:00:00.000Z'));

    const startedState = handleStreamStart(createBaseState(), {
      messageId: 'assistant-stream-2',
      sender: 'assistant-1',
    } as any);

    const chunkedState = handleStreamChunk(startedState, {
      messageId: 'assistant-stream-2',
      sender: 'assistant-1',
      content: 'Final answer',
      reasoningContent: 'Reasoning step',
      isAccumulated: true,
    });

    vi.setSystemTime(new Date('2026-03-14T12:00:05.000Z'));

    const finalizedState = handleStreamEnd(chunkedState, {
      messageId: 'assistant-stream-2',
      sender: 'assistant-1',
      content: 'Final answer',
    } as any);

    expect(finalizedState.messages).toEqual([
      expect.objectContaining({
        messageId: 'assistant-stream-2',
        text: 'Final answer',
        reasoningContent: 'Reasoning step',
        reasoningDurationMs: 5000,
        isStreaming: false,
      }),
    ]);

    vi.useRealTimers();
  });
});