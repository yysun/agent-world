/**
 * Web World System Refresh Tests
 *
 * Purpose:
 * - Ensure system events that mutate visible world state trigger a world refresh.
 *
 * Coverage:
 * - Ignores unrelated system events.
 * - Refreshes world/currentChat on `agent-created` and `chat-title-updated` events.
 * - Surfaces refresh failures as UI errors.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import api from '../../web/src/api';
import { worldUpdateHandlers } from '../../web/src/pages/World.update';

function createBaseState() {
  return {
    worldName: 'world-1',
    world: {
      id: 'world-1',
      currentChatId: 'chat-1',
      chats: [{ id: 'chat-1', name: 'Chat 1' }],
      agents: []
    },
    currentChat: { id: 'chat-1', name: 'Chat 1' },
    messages: [],
    error: null
  } as any;
}

describe('web world update system refresh', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores unrelated system events', async () => {
    const state = createBaseState();
    const getWorldSpy = vi.spyOn(api, 'getWorld');

    const nextState = await (worldUpdateHandlers['handleSystemEvent'] as any)(state, {
      content: {
        eventType: 'noop-event'
      }
    });

    expect(nextState).not.toBe(state);
    expect(nextState.messages).toHaveLength(1);
    expect(nextState.messages[0]?.type).toBe('system');
    expect(getWorldSpy).not.toHaveBeenCalled();
  });

  it('refreshes world for agent-created system events', async () => {
    const state = createBaseState();
    vi.spyOn(api, 'getWorld').mockResolvedValue({
      id: 'world-1',
      name: 'world-1',
      currentChatId: 'chat-1',
      chats: [{ id: 'chat-1', name: 'Chat 1' }],
      agents: [{ id: 'new-agent', name: 'new-agent' }]
    } as any);

    const nextState = await (worldUpdateHandlers['handleSystemEvent'] as any)(state, {
      content: {
        eventType: 'agent-created'
      }
    });

    expect(api.getWorld).toHaveBeenCalledWith('world-1');
    expect(nextState.world?.agents).toHaveLength(1);
    expect(nextState.world?.agents[0]?.id).toBe('new-agent');
    expect(nextState.currentChat?.id).toBe('chat-1');
    expect(nextState.error).toBeNull();
  });

  it('refreshes world for chat-title-updated system events', async () => {
    const state = createBaseState();
    vi.spyOn(api, 'getWorld').mockResolvedValue({
      id: 'world-1',
      name: 'world-1',
      currentChatId: 'chat-1',
      chats: [{ id: 'chat-1', name: 'Renamed Chat' }],
      agents: []
    } as any);

    const nextState = await (worldUpdateHandlers['handleSystemEvent'] as any)(state, {
      content: {
        eventType: 'chat-title-updated'
      }
    });

    expect(api.getWorld).toHaveBeenCalledWith('world-1');
    expect(nextState.currentChat?.name).toBe('Renamed Chat');
    expect(nextState.error).toBeNull();
  });

  it('records an error when refresh fails', async () => {
    const state = createBaseState();
    vi.spyOn(api, 'getWorld').mockRejectedValue(new Error('refresh failed'));

    const nextState = await (worldUpdateHandlers['handleSystemEvent'] as any)(state, {
      content: {
        eventType: 'agent-created'
      }
    });

    expect(nextState.error).toContain('refresh failed');
  });
});
