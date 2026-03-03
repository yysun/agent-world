/**
 * SSE Log Event Handler Unit Tests
 *
 * Purpose:
 * - Validate that handleLogEvent no longer appends log messages to state.messages.
 * - Confirm console.log is called for valid log events (routing to browser console only).
 * - Confirm suppression and chat-filter guards still work.
 *
 * Key Features:
 * - REQ-4: Log events route to console.log only, not into chat transcript.
 *
 * Notes on Implementation:
 * - Mocks apprun so sse-client import does not throw in Node.
 * - Uses vi.spyOn to capture console.log calls.
 * - Does not import from the real DOM / fetch / EventSource.
 *
 * Recent Changes:
 * - 2026-03-01: Initial test file created.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock apprun before importing sse-client (sse-client does `import app from 'apprun'`)
vi.mock('apprun', () => ({
  default: { run: vi.fn(), on: vi.fn() },
}));

// Mock ../api used by sse-client
vi.mock('../../web/src/api', () => ({
  apiRequest: vi.fn(),
}));

import { handleLogEvent } from '../../web/src/utils/sse-client';
import type { SSEComponentState } from '../../web/src/types';

function baseState(overrides: Partial<SSEComponentState> = {}): SSEComponentState {
  return {
    messages: [],
    worldName: 'test-world',
    ...overrides,
  };
}

function makeLogData(overrides: Record<string, any> = {}) {
  return {
    logEvent: {
      level: 'info',
      category: 'llm',
      message: 'Token received',
      timestamp: Date.now(),
      data: null,
      messageId: 'log-msg-1',
      ...overrides.logEvent,
    },
    chatId: overrides.chatId,
    worldName: 'test-world',
    ...overrides,
  };
}

describe('handleLogEvent', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('does not append any message to state.messages', () => {
    const state = baseState({ messages: [] });
    const nextState = handleLogEvent(state, makeLogData());
    expect(nextState.messages).toHaveLength(0);
  });

  it('returns the identical state object reference', () => {
    const state = baseState();
    const nextState = handleLogEvent(state, makeLogData());
    expect(nextState).toBe(state);
  });

  it('calls console.log with the log event details', () => {
    const state = baseState();
    handleLogEvent(state, makeLogData());
    expect(consoleSpy).toHaveBeenCalledOnce();
    const [msg] = consoleSpy.mock.calls[0];
    expect(msg).toContain('[INFO]');
    expect(msg).toContain('Token received');
  });

  it('returns state unchanged if logEvent payload is missing', () => {
    const state = baseState();
    const nextState = handleLogEvent(state, { worldName: 'test-world' });
    expect(nextState).toBe(state);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('filters out log events for a different active chat', () => {
    const state = baseState() as any;
    state.currentChat = { id: 'chat-A' };
    const data = makeLogData({ chatId: 'chat-B' });
    const nextState = handleLogEvent(state, data);
    expect(nextState).toBe(state);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('allows log events that match the active chat', () => {
    const state = baseState() as any;
    state.currentChat = { id: 'chat-A' };
    const data = makeLogData({ chatId: 'chat-A' });
    handleLogEvent(state, data);
    expect(consoleSpy).toHaveBeenCalledOnce();
  });
});
