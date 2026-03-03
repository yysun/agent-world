/**
 * Web World Update Edit/HITL Regression Tests
 *
 * Purpose:
 * - Prevent stale HITL inline prompts from persisting after a user edits a message.
 *
 * Coverage:
 * - Verifies optimistic `save-edit-message` state clears HITL queue/submission state.
 * - Verifies the post-request state keeps HITL UI dismissed.
 */

import { describe, expect, it, vi } from 'vitest';
import { worldUpdateHandlers } from '../../web/src/pages/World.update';
import * as SseClient from '../../web/src/utils/sse-client';

describe('web/world-update save-edit-message HITL behavior', () => {
  it('clears pending HITL UI when applying an edited user message', async () => {
    vi.spyOn(SseClient, 'editChatMessage').mockResolvedValue(undefined as any);
    const setItem = vi.fn();
    const removeItem = vi.fn();
    vi.stubGlobal('localStorage', {
      setItem,
      removeItem,
    });

    const state = {
      worldName: 'demo-world',
      editingText: 'edited user text',
      editingMessageId: 'msg-front-1',
      currentChat: { id: 'chat-1' },
      hitlPromptQueue: [
        {
          requestId: 'req-1',
          chatId: 'chat-1',
          title: 'Approval needed',
          message: 'Choose an option',
          mode: 'option',
          defaultOptionId: 'no',
          options: [{ id: 'no', label: 'No' }],
        },
      ],
      submittingHitlRequestId: 'req-1',
      messages: [
        {
          id: 'msg-front-1',
          messageId: 'msg-back-1',
          chatId: 'chat-1',
          text: 'original user text',
          type: 'user',
          sender: 'user',
        },
      ],
    } as any;

    const saveEditHandler = (worldUpdateHandlers as any)['save-edit-message'];
    const updates = saveEditHandler(state, 'msg-front-1');

    const optimistic = await updates.next();
    expect(optimistic.value.hitlPromptQueue).toEqual([]);
    expect(optimistic.value.submittingHitlRequestId).toBeNull();

    const completed = await updates.next();
    expect(completed.value.hitlPromptQueue).toEqual([]);
    expect(completed.value.submittingHitlRequestId).toBeNull();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(removeItem).toHaveBeenCalledTimes(1);
  });
});
