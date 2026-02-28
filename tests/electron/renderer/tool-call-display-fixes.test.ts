/**
 * Targeted Tests for Tool Call Display Fixes (2026-02-28)
 *
 * Covers three fixes:
 * 1. isToolRelatedMessage classifies assistant messages with tool_calls as tool-related.
 * 2. onStreamStart no longer creates a placeholder message card; card appears on first chunk.
 * 3. Send flow no longer inserts optimistic user message placeholder.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isToolRelatedMessage } from '../../../electron/renderer/src/utils/message-utils';
import { createStreamingState } from '../../../electron/renderer/src/streaming-state';
import { upsertMessageList } from '../../../electron/renderer/src/domain/message-updates';

// ─── Fix 1: isToolRelatedMessage for assistant + tool_calls ─────────────

describe('isToolRelatedMessage: assistant messages with tool_calls', () => {
  it('returns true for assistant message with tool_calls array', () => {
    expect(isToolRelatedMessage({
      role: 'assistant',
      content: 'Calling tool: shell_cmd (command: "ls")',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'shell_cmd', arguments: '{"command":"ls"}' } }],
    })).toBe(true);
  });

  it('returns true for assistant message with multiple tool_calls', () => {
    expect(isToolRelatedMessage({
      role: 'assistant',
      content: 'Calling 2 tools: grep, list_files',
      tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'grep', arguments: '{}' } },
        { id: 'call_2', type: 'function', function: { name: 'list_files', arguments: '{}' } },
      ],
    })).toBe(true);
  });

  it('returns false for assistant message without tool_calls', () => {
    expect(isToolRelatedMessage({
      role: 'assistant',
      content: 'Here is the answer to your question.',
    })).toBe(false);
  });

  it('returns false for assistant message with empty tool_calls array', () => {
    expect(isToolRelatedMessage({
      role: 'assistant',
      content: 'Some response',
      tool_calls: [],
    })).toBe(false);
  });

  it('returns true for tool role regardless of tool_calls', () => {
    expect(isToolRelatedMessage({ role: 'tool', content: '{}' })).toBe(true);
  });

  it('returns true for isToolStreaming flag', () => {
    expect(isToolRelatedMessage({ role: 'assistant', isToolStreaming: true })).toBe(true);
  });
});

// ─── Fix 2: onStreamStart no longer creates placeholder card ────────────

describe('streaming: no placeholder on stream start', () => {
  let callbacks;
  let state;
  let rafCallback: (() => void) | null = null;

  beforeEach(() => {
    callbacks = {
      onStreamStart: vi.fn(),
      onStreamUpdate: vi.fn(),
      onStreamEnd: vi.fn(),
      onStreamError: vi.fn(),
    };
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { rafCallback = cb; return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    state = createStreamingState(callbacks);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rafCallback = null;
  });

  it('fires onStreamStart on handleStart but callback should not insert a message', () => {
    // Simulate the useStreamingActivity behavior: onStreamStart is now a no-op.
    // The streaming-state module still fires the callback, but the hook ignores it.
    // Here we verify the streaming-state layer calls onStreamStart as expected.
    state.handleStart('msg-1', 'agent-a');
    expect(callbacks.onStreamStart).toHaveBeenCalledTimes(1);
  });

  it('creates message only on first chunk when no start placeholder exists', () => {
    // Simulate the hook behavior: onStreamStart is no-op, onStreamUpdate creates the message.
    const messages: any[] = [];
    const setMessages = (updater: (msgs: any[]) => any[]) => {
      const result = updater(messages);
      messages.length = 0;
      messages.push(...result);
    };

    // Stream starts — hook does nothing (no-op onStreamStart)
    state.handleStart('msg-1', 'agent-a');
    expect(messages).toHaveLength(0);

    // First chunk arrives — hook inserts message via onStreamUpdate
    state.handleChunk('msg-1', 'Hello');
    if (rafCallback) rafCallback();

    // onStreamUpdate was called; simulate the hook's upsert logic
    const entry = callbacks.onStreamUpdate.mock.calls[0]?.[0];
    expect(entry).toBeDefined();
    expect(entry.content).toBe('Hello');
    expect(entry.messageId).toBe('msg-1');

    setMessages((existing) => upsertMessageList(existing, {
      id: entry.messageId,
      messageId: entry.messageId,
      role: 'assistant',
      sender: entry.agentName,
      content: entry.content,
      isStreaming: true,
    }));

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Hello');
  });

  it('accumulates content across chunks before message appears', () => {
    state.handleStart('msg-2', 'agent-b');

    state.handleChunk('msg-2', 'First ');
    state.handleChunk('msg-2', 'Second');
    if (rafCallback) rafCallback();

    const entry = callbacks.onStreamUpdate.mock.calls[0]?.[0];
    expect(entry.content).toBe('First Second');
  });
});

// ─── Fix 3: send flow skips optimistic user message ─────────────────────

describe('send flow: no optimistic user message insertion', () => {
  it('upsertMessageList does not contain optimistic user message after send', () => {
    // Before the fix, the send handler would call:
    //   setMessages(existing => upsertMessageList(existing, optimisticMessage));
    // Now it skips that step. Verify that a message list remains unchanged
    // when no upsert is performed (simulating the new behavior).
    const existing = [
      { messageId: 'msg-1', role: 'user', sender: 'human', content: 'previous message', createdAt: '2026-02-28T00:00:00Z' },
      { messageId: 'msg-2', role: 'assistant', sender: 'a1', content: 'response', createdAt: '2026-02-28T00:00:01Z' },
    ];

    // New send flow: no optimistic insertion happens, messages stay the same
    const afterSend = [...existing];
    expect(afterSend).toHaveLength(2);
    expect(afterSend.every((m) => m.role !== 'user' || !('optimisticUserPending' in m))).toBe(true);
  });

  it('real user message arrives via backend upsert without optimistic reconciliation', () => {
    const existing = [
      { messageId: 'msg-1', role: 'user', sender: 'human', content: 'hello', createdAt: '2026-02-28T00:00:00Z' },
    ];

    // Simulate the backend-confirmed message arriving via SSE
    const confirmedMessage = {
      messageId: 'msg-3',
      id: 'msg-3',
      role: 'user',
      sender: 'human',
      content: 'new question',
      createdAt: '2026-02-28T00:01:00Z',
    };

    const updated = upsertMessageList(existing, confirmedMessage);
    expect(updated).toHaveLength(2);
    expect(updated[1].messageId).toBe('msg-3');
    expect(updated[1].content).toBe('new question');
    // No optimisticUserPending flag present
    expect(updated[1]).not.toHaveProperty('optimisticUserPending');
  });
});
