/**
 * Web World CRUD Refresh Tests
 *
 * Purpose:
 * - Ensure agent CRUD SSE events trigger a world refresh so new agents appear in the UI.
 *
 * Coverage:
 * - Ignores unrelated CRUD events.
 * - Refreshes world/currentChat on agent/chat CRUD events.
 * - Surfaces refresh failures as UI errors.
 *
 * Recent Changes:
 * - 2026-02-19: Added coverage for `handleCrudEvent` in World.update handlers.
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

describe('web world update CRUD refresh', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores unrelated CRUD events', async () => {
    const state = createBaseState();
    const getWorldSpy = vi.spyOn(api, 'getWorld');

    const nextState = await (worldUpdateHandlers['handleCrudEvent'] as any)(state, {
      operation: 'create',
      entityType: 'world',
      entityId: 'world-1'
    });

    expect(nextState).toBe(state);
    expect(getWorldSpy).not.toHaveBeenCalled();
  });

  it('refreshes world for agent CRUD events', async () => {
    const state = createBaseState();
    vi.spyOn(api, 'getWorld').mockResolvedValue({
      id: 'world-1',
      name: 'world-1',
      currentChatId: 'chat-1',
      chats: [{ id: 'chat-1', name: 'Chat 1' }],
      agents: [{ id: 'new-agent', name: 'new-agent' }]
    } as any);

    const nextState = await (worldUpdateHandlers['handleCrudEvent'] as any)(state, {
      operation: 'create',
      entityType: 'agent',
      entityId: 'new-agent'
    });

    expect(api.getWorld).toHaveBeenCalledWith('world-1');
    expect(nextState.world?.agents).toHaveLength(1);
    expect(nextState.world?.agents[0]?.id).toBe('new-agent');
    expect(nextState.currentChat?.id).toBe('chat-1');
    expect(nextState.error).toBeNull();
  });

  it('refreshes world for chat CRUD events', async () => {
    const state = createBaseState();
    vi.spyOn(api, 'getWorld').mockResolvedValue({
      id: 'world-1',
      name: 'world-1',
      currentChatId: 'chat-1',
      chats: [{ id: 'chat-1', name: 'Renamed Chat' }],
      agents: []
    } as any);

    const nextState = await (worldUpdateHandlers['handleCrudEvent'] as any)(state, {
      operation: 'update',
      entityType: 'chat',
      entityId: 'chat-1'
    });

    expect(api.getWorld).toHaveBeenCalledWith('world-1');
    expect(nextState.currentChat?.name).toBe('Renamed Chat');
    expect(nextState.error).toBeNull();
  });

  it('records an error when refresh fails', async () => {
    const state = createBaseState();
    vi.spyOn(api, 'getWorld').mockRejectedValue(new Error('refresh failed'));

    const nextState = await (worldUpdateHandlers['handleCrudEvent'] as any)(state, {
      operation: 'create',
      entityType: 'agent',
      entityId: 'new-agent'
    });

    expect(nextState.error).toContain('refresh failed');
  });
});
