/**
 * Web World Update Chat-Switch Replay Tests
 *
 * Purpose:
 * - Prevent chat-switch regressions that can drop replayed HITL prompts.
 *
 * Coverage:
 * - Verifies `load-chat-from-history` no longer calls `api.setChat` directly.
 * - Confirms route navigation still proceeds to the selected chat path.
 * - Confirms pending HITL queue state survives the loading phase so chat-scoped replay can restore it.
 */

import { app } from 'apprun';
import { afterEach, describe, expect, it, vi } from 'vitest';
import api from '../../web/src/api';
import { worldUpdateHandlers } from '../../web/src/pages/World.update';

describe('web/world-update chat switch replay behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes to selected chat without calling setChat in load-chat-from-history', async () => {
    const setChatSpy = vi.spyOn(api, 'setChat').mockResolvedValue({
      world: { id: 'world-1' },
      chatId: 'chat-2',
      success: true,
    } as any);
    const routeSpy = vi.spyOn(app, 'route').mockImplementation(() => { });

    const originalHistory = globalThis.history;
    const pushStateSpy = vi.fn();
    Object.defineProperty(globalThis, 'history', {
      configurable: true,
      value: {
        ...originalHistory,
        pushState: pushStateSpy,
      },
    });

    try {
      const state = {
        worldName: 'world-1',
        debounceFrameId: null,
        elapsedIntervalId: null,
        pendingStreamUpdates: new Map(),
        activeTools: [],
        isBusy: false,
        elapsedMs: 0,
        activityStartTime: null,
        hitlPromptQueue: [],
        submittingHitlRequestId: null,
      } as any;

      const updates = (worldUpdateHandlers['load-chat-from-history'] as any)(state, 'chat-2');
      await updates.next();
      await updates.next();

      expect(setChatSpy).not.toHaveBeenCalled();
      expect(routeSpy).toHaveBeenCalledWith('/World/world-1/chat-2');
      expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/World/world-1/chat-2');
    } finally {
      Object.defineProperty(globalThis, 'history', {
        configurable: true,
        value: originalHistory,
      });
    }
  });

  it('preserves pending HITL prompts while the chat-switch async generator enters loading state', async () => {
    const state = {
      worldName: 'world-1',
      debounceFrameId: null,
      elapsedIntervalId: null,
      pendingStreamUpdates: new Map(),
      activeTools: [],
      isBusy: false,
      elapsedMs: 0,
      activityStartTime: null,
      hitlPromptQueue: [
        {
          requestId: 'req-chat-b',
          chatId: 'chat-b',
          title: 'Approval required',
          message: 'Approve the request?',
          mode: 'option',
          defaultOptionId: 'approve',
          options: [{ id: 'approve', label: 'Approve' }],
        },
      ],
      submittingHitlRequestId: null,
    } as any;

    const updates = (worldUpdateHandlers['load-chat-from-history'] as any)(state, 'chat-a');
    const loading = await updates.next();

    expect(loading.value.hitlPromptQueue).toEqual(state.hitlPromptQueue);
    expect(loading.value.loading).toBe(true);
  });

  it('updates the chat-history search query from the input payload', () => {
    const state = {
      chatSearchQuery: '',
    } as any;

    const nextState = (worldUpdateHandlers['update-chat-search'] as any)(state, {
      target: { value: 'New Chat' },
    });

    expect(nextState.chatSearchQuery).toBe('New Chat');
  });

  it('backfills a missing HITL prompt chatId from the active chat on tool-progress events', () => {
    const state = {
      currentChat: { id: 'chat-switched' },
      debounceFrameId: null,
      elapsedIntervalId: null,
      isWaiting: true,
      isBusy: true,
      activeTools: [],
      pendingStreamUpdates: new Map(),
      hitlPromptQueue: [],
    } as any;

    const nextState = (worldUpdateHandlers['handleToolProgress'] as any)(state, {
      messageId: 'tool-1',
      toolExecution: {
        metadata: {
          hitlPrompt: {
            requestId: 'req-1',
            title: 'Approval required',
            message: 'Approve?',
            options: [{ id: 'approve', label: 'Approve' }],
          },
        },
      },
    });

    expect(nextState.hitlPromptQueue).toHaveLength(1);
    expect(nextState.hitlPromptQueue[0]?.chatId).toBe('chat-switched');
  });
});
