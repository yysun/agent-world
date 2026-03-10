/**
 * Session Management Selection Tests
 * Purpose:
 * - Verify session selection keeps the current transcript visible during normal chat switches.
 *
 * Key Features:
 * - Confirms `onSelectSession` does not clear messages while activation is in flight.
 * - Confirms failed session selection restores the previous selected chat without wiping transcript state.
 * - Confirms no-world refresh remains the only path that clears messages immediately.
 *
 * Implementation Notes:
 * - Uses a mocked `react` module so the hook can be exercised as a plain function.
 * - Captures state setter calls directly instead of rendering components.
 *
 * Recent Changes:
 * - 2026-03-10: Added regression coverage for AGENTS.md Rule 8.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const stateSetters = vi.hoisted(() => ({
  sessions: vi.fn(),
  sessionSearch: vi.fn(),
  selectedSessionId: vi.fn(),
  deletingSessionId: vi.fn(),
}));

const useStateMock = vi.hoisted(() => vi.fn((initialValue: unknown, callIndex: number) => {
  switch (callIndex) {
    case 0:
      return [[{ id: 'chat-1', name: 'Chat 1' }, { id: 'chat-2', name: 'Chat 2' }], stateSetters.sessions];
    case 1:
      return ['', stateSetters.sessionSearch];
    case 2:
      return ['chat-1', stateSetters.selectedSessionId];
    case 3:
      return [null, stateSetters.deletingSessionId];
    default:
      return [initialValue, vi.fn()];
  }
}));

vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
  useState: (initialValue: unknown) => {
    const callIndex = vi.mocked(useStateMock).mock.calls.length;
    return useStateMock(initialValue, callIndex);
  },
}), { virtual: true });

import { useSessionManagement } from '../../../electron/renderer/src/hooks/useSessionManagement';

describe('useSessionManagement session selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not clear messages while selecting another session', async () => {
    const setMessages = vi.fn();
    const messageRefreshCounter = { current: 0 };
    const api = {
      selectSession: vi.fn(async () => ({ chatId: 'chat-2' })),
      listSessions: vi.fn(async () => []),
      createSession: vi.fn(async () => ({})),
      deleteChat: vi.fn(async () => ({})),
    };

    const hook = useSessionManagement({
      api: api as any,
      loadedWorldId: 'world-1',
      setStatusText: vi.fn(),
      setMessages,
      setLoading: vi.fn(),
      messageRefreshCounter,
    });

    await hook.onSelectSession('chat-2');

    expect(messageRefreshCounter.current).toBe(1);
    expect(api.selectSession).toHaveBeenCalledWith('world-1', 'chat-2');
    expect(stateSetters.selectedSessionId).toHaveBeenCalledWith('chat-2');
    expect(setMessages).not.toHaveBeenCalled();
  });

  it('restores the previous selected session on selection failure without clearing messages', async () => {
    const setMessages = vi.fn();
    const setStatusText = vi.fn();
    const api = {
      selectSession: vi.fn(async () => {
        throw new Error('select failed');
      }),
      listSessions: vi.fn(async () => []),
      createSession: vi.fn(async () => ({})),
      deleteChat: vi.fn(async () => ({})),
    };

    const hook = useSessionManagement({
      api: api as any,
      loadedWorldId: 'world-1',
      setStatusText,
      setMessages,
      setLoading: vi.fn(),
      messageRefreshCounter: { current: 0 },
    });

    await hook.onSelectSession('chat-2');

    expect(stateSetters.selectedSessionId).toHaveBeenNthCalledWith(1, 'chat-2');
    expect(stateSetters.selectedSessionId).toHaveBeenNthCalledWith(2, 'chat-1');
    expect(setMessages).not.toHaveBeenCalled();
    expect(setStatusText).toHaveBeenCalledWith('select failed', 'error');
  });

  it('clears messages only when refreshing sessions with no loaded world', async () => {
    const setMessages = vi.fn();
    const setLoading = vi.fn();

    const hook = useSessionManagement({
      api: {
        listSessions: vi.fn(async () => []),
        createSession: vi.fn(async () => ({})),
        selectSession: vi.fn(async () => ({})),
        deleteChat: vi.fn(async () => ({})),
      } as any,
      loadedWorldId: null,
      setStatusText: vi.fn(),
      setMessages,
      setLoading,
      messageRefreshCounter: { current: 0 },
    });

    await hook.refreshSessions(null);

    expect(stateSetters.sessions).toHaveBeenCalledWith([]);
    expect(stateSetters.selectedSessionId).toHaveBeenCalledWith(null);
    expect(setMessages).toHaveBeenCalledWith([]);
    expect(setLoading).not.toHaveBeenCalled();
  });
});
