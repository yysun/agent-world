/**
 * Web World Update Branch Chat Tests
 *
 * Purpose:
 * - Verify branch-from-message update handler behavior in web world updates.
 *
 * Coverage:
 * - Reports validation error when payload is incomplete.
 * - Calls branch API and routes to branched chat on success.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import app from 'apprun';
import api from '../../web/src/api';
import { worldUpdateHandlers } from '../../web/src/pages/World.update';

function createBaseState() {
  return {
    worldName: 'world-1',
    world: { currentChatId: 'chat-1' },
    currentChat: { id: 'chat-1', name: 'Chat 1' },
    messagesLoading: false,
    error: null,
  } as any;
}

describe('web/world-update branch-chat-from-message', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns an error state when payload is missing identifiers', async () => {
    const state = createBaseState();
    const handler = worldUpdateHandlers['branch-chat-from-message'] as any;

    const gen = handler(state, { messageId: '', chatId: '' });
    const first = await gen.next();

    expect(first.value.error).toContain('missing source chat or message ID');
  });

  it('calls API and routes to branched chat on success', async () => {
    const state = createBaseState();
    vi.spyOn(api, 'branchChatFromMessage').mockResolvedValue({
      success: true,
      chatId: 'chat-2',
      world: { currentChatId: 'chat-2' }
    } as any);

    const routeSpy = vi.spyOn(app, 'route').mockImplementation(() => undefined as any);
    const pushStateSpy = vi.fn();
    vi.stubGlobal('history', { pushState: pushStateSpy });

    const handler = worldUpdateHandlers['branch-chat-from-message'] as any;
    const gen = handler(state, { messageId: 'msg-1', chatId: 'chat-1' });
    const first = await gen.next();
    const second = await gen.next();

    expect(first.value.messagesLoading).toBe(true);
    expect(api.branchChatFromMessage).toHaveBeenCalledWith('world-1', 'chat-1', 'msg-1');
    expect(routeSpy).toHaveBeenCalledWith('/World/world-1/chat-2');
    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/World/world-1/chat-2');
    expect(second.done).toBe(true);
  });
});
