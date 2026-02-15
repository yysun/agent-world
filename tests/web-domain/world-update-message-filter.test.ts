/**
 * Web Domain Tests for World Message Chat Filtering
 *
 * Purpose:
 * - Ensure web message handler ignores events outside the active chat session.
 *
 * Key features:
 * - Ignores mismatched chatId events when a chat is selected.
 * - Ignores unscoped (missing chatId) events when a chat is selected.
 * - Accepts matching chatId events and appends message.
 */

import { describe, expect, it } from 'vitest';
import { worldUpdateHandlers } from '../../web/src/pages/World.update';

function createBaseState() {
  return {
    worldName: 'world-1',
    currentChat: { id: 'chat-1', name: 'Chat 1' },
    world: {
      id: 'world-1',
      currentChatId: 'chat-1',
      agents: []
    },
    messages: []
  } as any;
}

describe('web world update message chat filtering', () => {
  it('ignores message events for a different chatId', () => {
    const state = createBaseState();
    const nextState = (worldUpdateHandlers['handleMessageEvent'] as any)(state, {
      messageId: 'msg-x',
      sender: 'assistant',
      content: 'other chat',
      chatId: 'chat-2'
    });

    expect(nextState).toBe(state);
    expect(nextState.messages).toHaveLength(0);
  });

  it('ignores unscoped message events when active chat is selected', () => {
    const state = createBaseState();
    const nextState = (worldUpdateHandlers['handleMessageEvent'] as any)(state, {
      messageId: 'msg-unscoped',
      sender: 'assistant',
      content: 'unscoped'
    });

    expect(nextState).toBe(state);
    expect(nextState.messages).toHaveLength(0);
  });

  it('accepts and appends message events for active chatId', () => {
    const state = createBaseState();
    const nextState = (worldUpdateHandlers['handleMessageEvent'] as any)(state, {
      messageId: 'msg-ok',
      sender: 'assistant',
      content: 'hello active chat',
      role: 'assistant',
      chatId: 'chat-1'
    });

    expect(nextState.messages).toHaveLength(1);
    expect(nextState.messages[0]).toMatchObject({
      messageId: 'msg-ok',
      chatId: 'chat-1',
      text: 'hello active chat'
    });
  });
});
