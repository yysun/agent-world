/**
 * Unit Tests for Status Updater
 * Purpose:
 * - Verifies the pure reducer behavior of applyEventToRegistry.
 *
 * Coverage:
 * - Each event type produces the correct agent status transition.
 * - Multi-hop in-flight counter sequences stay working until counters drain.
 * - HITL full cycle: working → complete (hitl-request) → working (sse:start) → complete (sse:end).
 * - Counter guard: double sse:end without matching sse:start doesn't go below 0.
 * - Chat switch: clearChatAgents then replay produces correct final status.
 *
 * Recent Changes:
 * - 2026-02-22: Created as part of status-registry migration (Phase 4).
 */

import { describe, expect, it } from 'vitest';
import { applyEventToRegistry } from '../../../electron/renderer/src/domain/status-updater';
import {
  clearChatAgents,
  createStatusRegistry,
  getAgentStatus,
} from '../../../electron/renderer/src/domain/status-registry';

describe('applyEventToRegistry — SSE events', () => {
  it('sse:start → working, inFlightSse++', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('working');
    expect(r.worlds.get('w1')?.chats.get('c1')?.agents.get('a1')?.inFlightSse).toBe(1);
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

  it('multiple sse:start → stays working until all end', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'end');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('working'); // still 1 in-flight
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'end');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
  });
});

describe('applyEventToRegistry — tool events', () => {
  it('tool:start → working, inFlightTools++', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'tool', 'tool-start');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('working');
    expect(r.worlds.get('w1')?.chats.get('c1')?.agents.get('a1')?.inFlightTools).toBe(1);
  });

  it('tool:result with matching start → complete', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'tool', 'tool-start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'tool', 'tool-result');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
  });

  it('tool:error with matching start → complete', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'tool', 'tool-start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'tool', 'tool-error');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
  });
});

describe('applyEventToRegistry — system events', () => {
  it('hitl-option-request → complete, resets counters', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'tool', 'tool-start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'system', 'hitl-option-request');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
    const agent = r.worlds.get('w1')?.chats.get('c1')?.agents.get('a1');
    expect(agent?.inFlightSse).toBe(0);
    expect(agent?.inFlightTools).toBe(0);
  });
});

describe('applyEventToRegistry — reset events', () => {
  it('reset → idle, clears counters', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'reset', 'any');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('idle');
    const agent = r.worlds.get('w1')?.chats.get('c1')?.agents.get('a1');
    expect(agent?.inFlightSse).toBe(0);
    expect(agent?.inFlightTools).toBe(0);
  });
});

describe('applyEventToRegistry — multi-hop sequences', () => {
  it('sse:start → tool-start → sse:end → stays working (tool still in-flight)', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'tool', 'tool-start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'end');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('working');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'tool', 'tool-result');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
  });

  it('interleaved sse sessions: new sse:start after sse:end → working again', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'end');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('working');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'end');
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

describe('applyEventToRegistry — counter guard', () => {
  it('double sse:end without matching start does not go below 0', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'end');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'end'); // extra end
    const agent = r.worlds.get('w1')?.chats.get('c1')?.agents.get('a1');
    expect(agent?.inFlightSse).toBe(0);
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
  });

  it('double tool-result without matching start does not go below 0', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'tool', 'tool-start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'tool', 'tool-result');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'tool', 'tool-result'); // extra result
    const agent = r.worlds.get('w1')?.chats.get('c1')?.agents.get('a1');
    expect(agent?.inFlightTools).toBe(0);
  });
});

describe('applyEventToRegistry — chat switch replay', () => {
  it('clearChatAgents then replay produces same result as live processing', () => {
    // Simulate live: a1 is complete after sse start/end
    let live = createStatusRegistry();
    live = applyEventToRegistry(live, 'w1', 'c1', 'a1', 'sse', 'start');
    live = applyEventToRegistry(live, 'w1', 'c1', 'a1', 'sse', 'end');

    // Simulate chat switch: clear then replay same events
    let replayed = createStatusRegistry();
    replayed = applyEventToRegistry(replayed, 'w1', 'c1', 'a1', 'sse', 'start');
    replayed = applyEventToRegistry(replayed, 'w1', 'c1', 'a1', 'sse', 'end');
    replayed = clearChatAgents(replayed, 'w1', 'c1');
    replayed = applyEventToRegistry(replayed, 'w1', 'c1', 'a1', 'sse', 'start');
    replayed = applyEventToRegistry(replayed, 'w1', 'c1', 'a1', 'sse', 'end');

    expect(getAgentStatus(live, 'w1', 'c1', 'a1')).toBe('complete');
    expect(getAgentStatus(replayed, 'w1', 'c1', 'a1')).toBe('complete');
  });
});
