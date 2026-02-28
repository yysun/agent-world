/**
 * Web World Update Chat-Switch Replay Tests
 *
 * Purpose:
 * - Prevent chat-switch regressions that can drop replayed HITL prompts.
 *
 * Coverage:
 * - Verifies `load-chat-from-history` no longer calls `api.setChat` directly.
 * - Confirms route navigation still proceeds to the selected chat path.
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
});