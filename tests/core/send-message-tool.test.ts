/**
 * send_message Tool Tests
 *
 * Purpose:
 * - Validate built-in `send_message` tool context injection and dispatch semantics.
 *
 * Key Features Tested:
 * - Missing trusted world/chat context hard-fails deterministically.
 * - Message arrays are dispatched in order through manager boundary.
 * - Model-provided routing fields are ignored in favor of trusted context.
 * - Supports string shorthand and object message entries.
 * - Uses queue-safe result semantics (`accepted`/`dispatched`).
 *
 * Implementation Notes:
 * - Uses mocked manager dispatch API; no real storage/LLM runtime access.
 *
 * Recent Changes:
 * - 2026-03-04: Added regression coverage ensuring runtime routing does not fall back to `world.currentChatId`.
 * - 2026-03-04: Initial unit coverage for built-in send_message tool.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSendMessageToolDefinition } from '../../core/send-message-tool.js';
import { enqueueAndProcessUserMessage } from '../../core/managers.js';
import { wrapToolWithValidation } from '../../core/tool-utils.js';

vi.mock('../../core/managers.js', () => ({
  enqueueAndProcessUserMessage: vi.fn(async (_worldId: string, _chatId: string, _content: string, sender: string) => {
    if (sender === 'human') {
      return {
        messageId: 'queued-msg-1',
        status: 'queued',
      };
    }
    return null;
  }),
}));

const mockedEnqueueAndProcessUserMessage = vi.mocked(enqueueAndProcessUserMessage);

function buildWrappedSendMessageTool() {
  const tool = createSendMessageToolDefinition();
  return wrapToolWithValidation(tool, 'send_message');
}

describe('core/send-message-tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns deterministic context error when trusted world context is missing', async () => {
    const tool = buildWrappedSendMessageTool();
    const result = await tool.execute({ messages: ['hello'] }, undefined, undefined, {
      chatId: 'chat-1',
    });

    const payload = JSON.parse(String(result));
    expect(payload).toMatchObject({
      ok: false,
      status: 'error',
      code: 'context_unavailable',
      requested: 0,
      accepted: 0,
      dispatched: 0,
      failed: 0,
    });
    expect(mockedEnqueueAndProcessUserMessage).not.toHaveBeenCalled();
  });

  it('returns chat context error when trusted runtime chatId is missing even if world has currentChatId', async () => {
    const tool = buildWrappedSendMessageTool();
    const result = await tool.execute(
      { messages: ['hello'] },
      undefined,
      undefined,
      {
        world: { id: 'world-1', currentChatId: 'chat-from-world-state' } as any,
      },
    );

    const payload = JSON.parse(String(result));
    expect(payload).toMatchObject({
      ok: false,
      status: 'error',
      code: 'chat_context_missing',
      message: 'send_message requires a chatId in trusted runtime context.',
      requested: 0,
      accepted: 0,
      dispatched: 0,
      failed: 0,
    });
    expect(mockedEnqueueAndProcessUserMessage).not.toHaveBeenCalled();
  });

  it('dispatches message array in order and supports shorthand/object entries', async () => {
    mockedEnqueueAndProcessUserMessage
      .mockResolvedValueOnce({ messageId: 'queued-1', status: 'queued' } as any)
      .mockResolvedValueOnce(null as any);

    const tool = buildWrappedSendMessageTool();
    const result = await tool.execute(
      {
        messages: [
          'First message',
          { content: 'Second message', sender: 'assistant' },
        ],
      },
      undefined,
      undefined,
      {
        world: { id: 'world-1', currentChatId: 'chat-1' } as any,
        chatId: 'chat-1',
      },
    );

    expect(mockedEnqueueAndProcessUserMessage).toHaveBeenNthCalledWith(
      1,
      'world-1',
      'chat-1',
      'First message',
      'human',
      expect.any(Object),
      { source: 'direct' },
    );
    expect(mockedEnqueueAndProcessUserMessage).toHaveBeenNthCalledWith(
      2,
      'world-1',
      'chat-1',
      'Second message',
      'assistant',
      expect.any(Object),
      { source: 'direct' },
    );

    const payload = JSON.parse(String(result));
    expect(payload).toMatchObject({
      ok: true,
      status: 'dispatched',
      worldId: 'world-1',
      chatId: 'chat-1',
      requested: 2,
      accepted: 2,
      dispatched: 2,
      failed: 0,
    });
    expect(payload.results[0]).toMatchObject({
      index: 0,
      status: 'dispatched',
      dispatchMode: 'queued',
      messageId: 'queued-1',
    });
    expect(payload.results[1]).toMatchObject({
      index: 1,
      status: 'dispatched',
      dispatchMode: 'immediate',
      messageId: null,
    });
    expect(payload).not.toHaveProperty('sent');
  });

  it('ignores model-provided routing fields and uses trusted context routing', async () => {
    const tool = buildWrappedSendMessageTool();
    const result = await tool.execute(
      {
        worldId: 'evil-world',
        chatId: 'evil-chat',
        messages: [
          {
            content: 'Route safely',
            sender: 'human',
            worldId: 'evil-world',
            chatId: 'evil-chat',
          } as any,
        ],
      },
      undefined,
      undefined,
      {
        world: { id: 'trusted-world', currentChatId: 'trusted-chat' } as any,
        chatId: 'trusted-chat',
      },
    );

    expect(mockedEnqueueAndProcessUserMessage).toHaveBeenCalledWith(
      'trusted-world',
      'trusted-chat',
      'Route safely',
      'human',
      expect.any(Object),
      { source: 'direct' },
    );

    const payload = JSON.parse(String(result));
    expect(payload.worldId).toBe('trusted-world');
    expect(payload.chatId).toBe('trusted-chat');
  });

  it('returns validation error for empty messages array', async () => {
    const tool = buildWrappedSendMessageTool();
    const result = await tool.execute(
      { messages: [] },
      undefined,
      undefined,
      {
        world: { id: 'world-1', currentChatId: 'chat-1' } as any,
        chatId: 'chat-1',
      },
    );

    const payload = JSON.parse(String(result));
    expect(payload).toMatchObject({
      ok: false,
      status: 'error',
      code: 'validation_error',
      requested: 0,
    });
    expect(mockedEnqueueAndProcessUserMessage).not.toHaveBeenCalled();
  });
});
