/**
 * Web World System Refresh Tests
 *
 * Purpose:
 * - Ensure system events that mutate visible world state trigger a world refresh.
 *
 * Coverage:
 * - Ignores unrelated system events.
 * - Ignores unscoped system events while a chat session is active.
 * - Stores transient non-error statuses in selected-chat legend state.
 * - Renders error-like system events as transcript rows instead of page-level overlay state.
 * - Refreshes world/currentChat on `agent-created` and `chat-title-updated` events.
 * - Surfaces refresh failures as UI errors.
 *
 * Recent Changes:
 * - 2026-03-12: Replaced hidden system-message ingestion assertions with visible selected-chat status state coverage.
 * - 2026-03-12: Aligned queue-dispatch failure expectations with the world error overlay promotion contract.
 * - 2026-02-27: Added active-chat scope expectations for system events.
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
    systemStatus: null,
    systemStatusTimerId: null,
    error: null
  } as any;
}

async function collectGeneratedStates<T>(updates: AsyncGenerator<T>, fallbackState: T): Promise<{
  states: T[];
  finalState: T;
}> {
  const states: T[] = [];
  for await (const update of updates) {
    states.push(update);
  }

  return {
    states,
    finalState: states.at(-1) ?? fallbackState,
  };
}

describe('web world update system refresh', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores unscoped system events when active chat is selected', async () => {
    const state = createBaseState();
    const getWorldSpy = vi.spyOn(api, 'getWorld');

    const result = await collectGeneratedStates((worldUpdateHandlers['handleSystemEvent'] as any)(state, {
      content: {
        eventType: 'noop-event'
      }
    }), state);
    const nextState = result.finalState;

    expect(nextState).toBe(state);
    expect(result.states).toHaveLength(0);
    expect(nextState.messages).toHaveLength(0);
    expect(getWorldSpy).not.toHaveBeenCalled();
  });

  it('stores scoped unrelated system events as visible selected-chat status without refresh', async () => {
    const state = createBaseState();
    const getWorldSpy = vi.spyOn(api, 'getWorld');

    const result = await collectGeneratedStates((worldUpdateHandlers['handleSystemEvent'] as any)(state, {
      chatId: 'chat-1',
      content: {
        eventType: 'retry-wait',
        message: 'Retrying in 2s.'
      }
    }), state);
    const nextState = result.finalState;

    expect(nextState).not.toBe(state);
    expect(result.states).toHaveLength(1);
    expect(nextState.messages).toHaveLength(0);
    expect(nextState.systemStatus).toMatchObject({
      worldName: 'world-1',
      chatId: 'chat-1',
      eventType: 'retry-wait',
      text: 'Retrying in 2s.',
      kind: 'info',
    });
    expect(nextState.systemStatusTimerId).toBeTruthy();
    expect(getWorldSpy).not.toHaveBeenCalled();
  });

  it('renders queue-dispatch failures as transcript-visible system error rows', async () => {
    const state = createBaseState();

    const result = await collectGeneratedStates((worldUpdateHandlers['handleSystemEvent'] as any)(state, {
      chatId: 'chat-1',
      messageId: 'sys-error-1',
      content: {
        type: 'error',
        eventType: 'error',
        failureKind: 'queue-dispatch',
        triggeringMessageId: 'user-1',
        message: 'Queue failed to dispatch user turn: world is busy.',
      }
    }), state);
    const nextState = result.finalState;

    expect(result.states).toHaveLength(1);
    expect(nextState.error).toBe('Queue failed to dispatch user turn: world is busy.');
    expect(nextState.systemStatus).toBeNull();
    expect(nextState.messages).toHaveLength(1);
    expect(nextState.messages[0]).toMatchObject({
      id: 'system-error:user-1',
      messageId: 'system-error:user-1',
      sender: 'system',
      type: 'system',
      chatId: 'chat-1',
      text: 'Queue failed to dispatch user turn: world is busy.',
      systemEvent: {
        kind: 'error',
        eventType: 'error',
        triggeringMessageId: 'user-1',
      },
    });
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

    const result = await collectGeneratedStates((worldUpdateHandlers['handleSystemEvent'] as any)(state, {
      chatId: 'chat-1',
      content: {
        eventType: 'agent-created'
      }
    }), state);
    const nextState = result.finalState;

    expect(api.getWorld).toHaveBeenCalledWith('world-1');
    expect(result.states).toHaveLength(1);
    expect(nextState.world?.agents).toHaveLength(1);
    expect(nextState.world?.agents[0]?.id).toBe('new-agent');
    expect(nextState.currentChat?.id).toBe('chat-1');
    expect(nextState.error).toBeNull();
  });

  it('refreshes world for chat-title-updated system events', async () => {
    const state = createBaseState();
    const getWorldSpy = vi.spyOn(api, 'getWorld');

    const result = await collectGeneratedStates((worldUpdateHandlers['handleSystemEvent'] as any)(state, {
      chatId: 'chat-1',
      content: {
        eventType: 'chat-title-updated',
        title: 'Renamed Chat'
      }
    }), state);
    const nextState = result.finalState;

    // Lightweight in-place update: no API round-trip needed since title is in payload.
    expect(getWorldSpy).not.toHaveBeenCalled();
    expect(result.states).toHaveLength(1);
    expect(nextState.currentChat?.name).toBe('Renamed Chat');
    expect(nextState.world?.chats[0]?.name).toBe('Renamed Chat');
    expect(nextState.error).toBeNull();
  });

  it('records an error when refresh fails', async () => {
    const state = createBaseState();
    vi.spyOn(api, 'getWorld').mockRejectedValue(new Error('refresh failed'));

    const result = await collectGeneratedStates((worldUpdateHandlers['handleSystemEvent'] as any)(state, {
      chatId: 'chat-1',
      content: {
        eventType: 'agent-created'
      }
    }), state);
    const nextState = result.finalState;

    expect(nextState.error).toContain('refresh failed');
    expect(result.states).toHaveLength(1);
  });

  it('clears transient system status only when the matching timer payload arrives', () => {
    const state = {
      ...createBaseState(),
      systemStatus: {
        worldName: 'world-1',
        chatId: 'chat-1',
        eventType: 'retry-wait',
        messageId: 'sys-status-1',
        createdAt: null,
        text: 'Retrying in 2s.',
        kind: 'info',
      },
      systemStatusTimerId: 123,
    };
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => undefined as any);

    const unchanged = (worldUpdateHandlers['clear-system-status'] as any)(state, {
      messageId: 'sys-status-2',
      chatId: 'chat-1',
    });
    const cleared = (worldUpdateHandlers['clear-system-status'] as any)(state, {
      messageId: 'sys-status-1',
      chatId: 'chat-1',
    });

    expect(unchanged).toBe(state);
    expect(cleared.systemStatus).toBeNull();
    expect(cleared.systemStatusTimerId).toBeNull();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(123);
  });
});
