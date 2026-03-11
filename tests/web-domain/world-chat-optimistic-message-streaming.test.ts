/**
 * Web optimistic message streaming regression tests.
 *
 * Purpose:
 * - Lock the web chat behavior that keeps optimistic user turns stable while assistant streaming starts.
 *
 * Key Features:
 * - Verifies stream-start no longer removes the pending user message row.
 * - Verifies assistant finalization no longer strips the pending user row before the backend user echo lands.
 * - Verifies the later backend user echo can still finalize that same row with the real message ID.
 *
 * Implementation Notes:
 * - Exercises the exported web SSE stream handler and world message update handler directly.
 * - Uses chat-scoped state only; no browser, filesystem, or live network dependencies.
 *
 * Recent Changes:
 * - 2026-03-11: Added regression coverage for the web edit/delete race caused by optimistic user rows disappearing before confirmation.
 */

import { describe, expect, it } from 'vitest';

import * as InputDomain from '../../web/src/domain/input';
import { worldUpdateHandlers } from '../../web/src/pages/World.update';
import { handleStreamStart } from '../../web/src/utils/sse-client';

function createBaseState() {
  return {
    worldName: 'world-1',
    currentChat: { id: 'chat-1', name: 'Chat 1' },
    world: {
      id: 'world-1',
      currentChatId: 'chat-1',
      agents: []
    },
    messages: [],
    userInput: '',
    isSending: false,
    needScroll: false,
  } as any;
}

describe('web optimistic user message streaming', () => {
  it('keeps the optimistic user row when assistant streaming starts', () => {
    const sendingState = InputDomain.createSendingState(createBaseState(), {
      id: 'temp-user-1',
      sender: 'human',
      text: 'hello world',
      createdAt: new Date('2026-03-11T10:00:00.000Z'),
      type: 'user',
      userEntered: true,
      worldName: 'world-1',
    });

    const nextState = handleStreamStart(sendingState, {
      messageId: 'assistant-stream-1',
      sender: 'assistant-1',
    } as any);

    expect(nextState.messages).toHaveLength(2);
    expect(nextState.messages[0]).toMatchObject({
      id: 'temp-user-1',
      text: 'hello world',
      userEntered: true,
    });
    expect(nextState.messages[1]).toMatchObject({
      messageId: 'assistant-stream-1',
      sender: 'assistant-1',
      isStreaming: true,
    });
  });

  it('keeps the optimistic user row visible through assistant finalization and then reconciles it', () => {
    const sendingState = InputDomain.createSendingState(createBaseState(), {
      id: 'temp-user-1',
      sender: 'human',
      text: 'hello world',
      createdAt: new Date('2026-03-11T10:00:00.000Z'),
      type: 'user',
      userEntered: true,
      worldName: 'world-1',
    });

    const streamingState = handleStreamStart(sendingState, {
      messageId: 'assistant-stream-1',
      sender: 'assistant-1',
    } as any);

    const assistantFinalState = (worldUpdateHandlers['handleMessageEvent'] as any)(streamingState, {
      sender: 'assistant-1',
      content: 'E2E_OK: hello world',
      role: 'assistant',
      chatId: 'chat-1',
      messageId: 'assistant-stream-1',
      createdAt: '2026-03-11T10:00:00.500Z',
    });

    expect(assistantFinalState.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'temp-user-1',
          text: 'hello world',
          userEntered: true,
        }),
        expect.objectContaining({
          sender: 'assistant-1',
          text: 'E2E_OK: hello world',
          messageId: 'assistant-stream-1',
          isStreaming: false,
        }),
      ]),
    );

    const nextState = (worldUpdateHandlers['handleMessageEvent'] as any)(assistantFinalState, {
      sender: 'human',
      content: 'hello world',
      role: 'user',
      chatId: 'chat-1',
      messageId: 'user-message-1',
      createdAt: '2026-03-11T10:00:01.000Z',
    });

    const userMessages = nextState.messages.filter((message: any) => message.sender === 'human');

    expect(userMessages).toHaveLength(1);
    expect(userMessages[0]).toMatchObject({
      id: 'temp-user-1',
      text: 'hello world',
      chatId: 'chat-1',
      messageId: 'user-message-1',
      userEntered: false,
    });
  });
});
