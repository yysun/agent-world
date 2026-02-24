/**
 * Unit Tests for Status Updater
 * Purpose:
 * - Verifies the pure reducer behavior of applyEventToRegistry.
 * - Verifies parseStoredEventReplayArgs filtering (human/user sender guard).
 *
 * Coverage:
 * - Each event type produces the correct agent status transition.
 * - HITL full cycle: working → complete (hitl-request) → working (sse:start) → complete (sse:end).
 * - Chat switch: clearChatAgents then replay produces correct final status.
 * - parseStoredEventReplayArgs: agent messages pass through; human/user messages are filtered.
 *
 * Recent Changes:
 * - 2026-02-24: Rewrote counter-based tests (counters removed); added message event type tests
 *   and parseStoredEventReplayArgs tests for the human/user sender filter.
 * - 2026-02-22: Created as part of status-registry migration (Phase 4).
 */

import { describe, expect, it } from 'vitest';
import { applyEventToRegistry, parseStoredEventReplayArgs } from '../../../electron/renderer/src/domain/status-updater';
import {
  clearChatAgents,
  createStatusRegistry,
  getAgentStatus,
} from '../../../electron/renderer/src/domain/status-registry';

describe('applyEventToRegistry — SSE events', () => {
  it('sse:start → working', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('working');
  });

  it('sse:end with matching start → complete', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'end');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
  });

  it('sse:error with matching start → complete', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'error');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
  });

  it('sse:end without prior start → complete (direct transition)', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'end');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
  });

  it('second sse:start after sse:end → working again', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'end');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('working');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'end');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
  });
});

describe('applyEventToRegistry — tool events', () => {
  it('tool-start → working', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'tool', 'tool-start');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('working');
  });

  it('tool-result with matching start → complete', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'tool', 'tool-start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'tool', 'tool-result');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
  });

  it('tool-error with matching start → complete', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'tool', 'tool-start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'tool', 'tool-error');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
  });
});

describe('applyEventToRegistry — message events', () => {
  it('message event → complete', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'message', 'received');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
  });

  it('message event after sse:start → complete (DB replay: completes a working agent)', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'message', 'received');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
  });
});

describe('applyEventToRegistry — system events', () => {
  it('hitl-option-request → complete', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'tool', 'tool-start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'system', 'hitl-option-request');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
  });
});

describe('applyEventToRegistry — HITL full cycle', () => {
  it('working → complete (hitl-request) → working (sse:start) → complete (sse:end)', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('working');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'system', 'hitl-option-request');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
    // Agent resumes after HITL response (new sse:start)
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('working');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'end');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
  });
});

describe('applyEventToRegistry — chat switch replay', () => {
  it('clearChatAgents then replay produces correct final status', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'end');
    r = clearChatAgents(r, 'w1', 'c1');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'end');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
  });
});

// ---------------------------------------------------------------------------
// parseStoredEventReplayArgs
// ---------------------------------------------------------------------------

describe('parseStoredEventReplayArgs — message events', () => {
  it('agent message → returns args with sender as agentName', () => {
    const result = parseStoredEventReplayArgs({
      type: 'message',
      payload: { sender: 'granite', content: 'hello' },
    });
    expect(result).toEqual({ agentName: 'granite', eventType: 'message', subtype: 'received' });
  });

  it('sender=human → returns null', () => {
    const result = parseStoredEventReplayArgs({
      type: 'message',
      payload: { sender: 'human', content: 'hi' },
    });
    expect(result).toBeNull();
  });

  it('sender=user → returns null', () => {
    const result = parseStoredEventReplayArgs({
      type: 'message',
      payload: { sender: 'user', content: 'hi' },
    });
    expect(result).toBeNull();
  });

  it('empty sender → returns null', () => {
    const result = parseStoredEventReplayArgs({
      type: 'message',
      payload: { sender: '', content: 'hi' },
    });
    expect(result).toBeNull();
  });

  it('missing sender field → returns null', () => {
    const result = parseStoredEventReplayArgs({
      type: 'message',
      payload: { content: 'hi' },
    });
    expect(result).toBeNull();
  });
});

describe('parseStoredEventReplayArgs — sse events', () => {
  it('sse/start with agentName → returns sse/start args', () => {
    const result = parseStoredEventReplayArgs({
      type: 'sse',
      payload: { agentName: 'granite', type: 'start' },
    });
    expect(result).toEqual({ agentName: 'granite', eventType: 'sse', subtype: 'start' });
  });

  it('sse/end with agentName → returns sse/end args', () => {
    const result = parseStoredEventReplayArgs({
      type: 'sse',
      payload: { agentName: 'granite', type: 'end' },
    });
    expect(result).toEqual({ agentName: 'granite', eventType: 'sse', subtype: 'end' });
  });

  it('sse missing agentName → returns null', () => {
    const result = parseStoredEventReplayArgs({
      type: 'sse',
      payload: { type: 'start' },
    });
    expect(result).toBeNull();
  });

  it('sse missing subtype → returns null', () => {
    const result = parseStoredEventReplayArgs({
      type: 'sse',
      payload: { agentName: 'granite' },
    });
    expect(result).toBeNull();
  });
});

describe('parseStoredEventReplayArgs — tool events', () => {
  it('tool/tool-start → returns tool/tool-start args', () => {
    const result = parseStoredEventReplayArgs({
      type: 'tool',
      payload: { agentName: 'granite', type: 'tool-start' },
    });
    expect(result).toEqual({ agentName: 'granite', eventType: 'tool', subtype: 'tool-start' });
  });

  it('tool/tool-result → returns tool/tool-result args', () => {
    const result = parseStoredEventReplayArgs({
      type: 'tool',
      payload: { agentName: 'granite', type: 'tool-result' },
    });
    expect(result).toEqual({ agentName: 'granite', eventType: 'tool', subtype: 'tool-result' });
  });
});

describe('parseStoredEventReplayArgs — skipped event types', () => {
  it('world event (activity) → returns null', () => {
    const result = parseStoredEventReplayArgs({
      type: 'world',
      payload: { activityType: 'response-end', pendingOperations: 0 },
    });
    expect(result).toBeNull();
  });

  it('system event → returns null', () => {
    const result = parseStoredEventReplayArgs({
      type: 'system',
      payload: { agentName: 'granite', type: 'hitl-option-request' },
    });
    expect(result).toBeNull();
  });

  it('null input → returns null', () => {
    expect(parseStoredEventReplayArgs(null)).toBeNull();
  });

  it('empty object → returns null', () => {
    expect(parseStoredEventReplayArgs({})).toBeNull();
  });
});
