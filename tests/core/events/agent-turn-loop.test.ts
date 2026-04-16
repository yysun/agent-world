/**
 * Agent Turn Loop Tests
 *
 * Purpose:
 * - Verify `runAgentTurnLoop(...)` honors callback-driven continue/stop control flow.
 *
 * Key Features:
 * - Confirms `onTextResponse` can request one continuation and then finish without returning a control object.
 * - Confirms transient instructions are forwarded into the next `buildMessages(...)` call.
 *
 * Implementation Notes:
 * - Uses mocked in-memory model calls only.
 * - Avoids provider streaming and any filesystem-backed state.
 *
 * Recent Changes:
 * - 2026-04-12: Added regression coverage for text-response callbacks that continue once and then complete with `void`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { Agent, World } from '../../../core/types.js';

const mocks = vi.hoisted(() => ({
  generateAgentResponse: vi.fn(),
  streamAgentResponse: vi.fn(),
  publishSSE: vi.fn(),
  isStreamingEnabled: vi.fn(() => false),
}));

vi.mock('../../../core/llm-runtime.js', () => ({
  generateAgentResponse: mocks.generateAgentResponse,
  streamAgentResponse: mocks.streamAgentResponse,
}));

vi.mock('../../../core/events/publishers.js', () => ({
  publishSSE: mocks.publishSSE,
  isStreamingEnabled: mocks.isStreamingEnabled,
}));

function createWorld(): World {
  return {
    id: 'world-1',
    name: 'Test World',
    createdAt: new Date(),
    lastUpdated: new Date(),
    turnLimit: 10,
    totalAgents: 1,
    totalMessages: 0,
    currentChatId: 'chat-1',
    eventEmitter: new EventEmitter(),
    agents: new Map(),
    chats: new Map(),
  } as World;
}

function createAgent(): Agent {
  return {
    id: 'agent-a',
    name: 'Agent A',
    type: 'assistant',
    provider: 'openai' as any,
    model: 'gpt-4o-mini',
    llmCallCount: 0,
    memory: [],
  } as Agent;
}

describe('runAgentTurnLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isStreamingEnabled.mockReturnValue(false);
  });

  it('allows text-response callbacks to continue once and then finish with no control object', async () => {
    mocks.generateAgentResponse
      .mockResolvedValueOnce({
        response: {
          type: 'text',
          content: 'first pass',
        },
        messageId: 'assistant-1',
      })
      .mockResolvedValueOnce({
        response: {
          type: 'text',
          content: 'final answer',
        },
        messageId: 'assistant-2',
      });

    const { runAgentTurnLoop } = await import('../../../core/events/agent-turn-loop.js');

    const buildMessages = vi.fn(async ({ transientInstruction }: { emptyTextRetryCount: number; transientInstruction?: string }) => {
      if (!transientInstruction) {
        return [];
      }

      return [{
        role: 'system',
        content: transientInstruction,
      }] as any;
    });

    const onTextResponse = vi.fn(async ({ responseText }: { responseText: string; messageId: string }) => {
      if (responseText === 'first pass') {
        return {
          control: 'continue' as const,
          transientInstruction: 'retry with more detail',
        };
      }

      return undefined;
    });

    await runAgentTurnLoop({
      world: createWorld(),
      agent: createAgent(),
      chatId: 'chat-1',
      label: 'direct',
      emptyTextRetryLimit: 1,
      buildMessages,
      onTextResponse,
      onToolCallsResponse: vi.fn(async () => undefined),
    });

    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(2);
    expect(onTextResponse).toHaveBeenCalledTimes(2);
    expect(buildMessages).toHaveBeenNthCalledWith(1, {
      emptyTextRetryCount: 0,
      transientInstruction: undefined,
    });
    expect(buildMessages).toHaveBeenNthCalledWith(2, {
      emptyTextRetryCount: 0,
      transientInstruction: 'retry with more detail',
    });
  });
});