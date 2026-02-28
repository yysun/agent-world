/**
 * Unit Tests for Status Registry
 * Purpose:
 * - Verifies pure-function behavior of the status registry module.
 *
 * Coverage:
 * - Default status queries return idle.
 * - Chat/world rollup: any working → working; all complete → complete; else idle.
 * - clearChatAgents: scoped to one chat only.
 * - syncWorldRoster: adds new, removes stale, preserves working/complete agents.
 *
 * Recent Changes:
 * - 2026-02-22: Created as part of status-registry migration (Phase 4).
 */

import { describe, expect, it } from 'vitest';
import {
  clearChatAgents,
  createStatusRegistry,
  finalizeReplayedChat,
  getAgentStatus,
  getChatStatus,
  getWorldStatus,
  syncWorldRoster,
} from '../../../electron/renderer/src/domain/status-registry';
import { applyEventToRegistry } from '../../../electron/renderer/src/domain/status-updater';

describe('getAgentStatus', () => {
  it('returns idle for unknown world/chat/agent', () => {
    const r = createStatusRegistry();
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('idle');
  });

  it('returns the registered agent status', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('working');
  });
});

describe('getChatStatus rollup', () => {
  it('returns idle when no agents are registered', () => {
    const r = createStatusRegistry();
    expect(getChatStatus(r, 'w1', 'c1')).toBe('idle');
  });

  it('returns working when any agent is working', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a2', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a2', 'sse', 'end');
    // a1 = working, a2 = complete
    expect(getChatStatus(r, 'w1', 'c1')).toBe('working');
  });

  it('returns complete when all agents are complete', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'end');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a2', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a2', 'sse', 'end');
    expect(getChatStatus(r, 'w1', 'c1')).toBe('complete');
  });

  it('returns idle when all agents are idle', () => {
    let r = createStatusRegistry();
    r = syncWorldRoster(r, 'w1', ['c1'], ['a1', 'a2']);
    expect(getChatStatus(r, 'w1', 'c1')).toBe('idle');
  });
});

describe('getWorldStatus rollup', () => {
  it('returns idle for unknown world', () => {
    const r = createStatusRegistry();
    expect(getWorldStatus(r, 'w1')).toBe('idle');
  });

  it('returns working when any chat is working', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c2', 'a2', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c2', 'a2', 'sse', 'end');
    // c1 = working, c2 = complete
    expect(getWorldStatus(r, 'w1')).toBe('working');
  });

  it('returns complete when all chats are complete', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'end');
    r = applyEventToRegistry(r, 'w1', 'c2', 'a2', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c2', 'a2', 'sse', 'end');
    expect(getWorldStatus(r, 'w1')).toBe('complete');
  });
});

describe('clearChatAgents', () => {
  it('removes all agents for the specified chat', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a2', 'sse', 'start');
    r = clearChatAgents(r, 'w1', 'c1');
    expect(getChatStatus(r, 'w1', 'c1')).toBe('idle');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('idle');
    expect(getAgentStatus(r, 'w1', 'c1', 'a2')).toBe('idle');
  });

  it('does not affect sibling chats', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c2', 'a1', 'sse', 'start');
    r = clearChatAgents(r, 'w1', 'c1');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('idle');
    expect(getAgentStatus(r, 'w1', 'c2', 'a1')).toBe('working');
  });

  it('is a no-op for unknown world/chat', () => {
    const r = createStatusRegistry();
    const after = clearChatAgents(r, 'unknown', 'unknown');
    expect(after).toBe(r);
  });
});

describe('syncWorldRoster', () => {
  it('adds new agents and chats as idle', () => {
    const r = createStatusRegistry();
    const after = syncWorldRoster(r, 'w1', ['c1', 'c2'], ['a1', 'a2']);
    expect(getAgentStatus(after, 'w1', 'c1', 'a1')).toBe('idle');
    expect(getAgentStatus(after, 'w1', 'c2', 'a2')).toBe('idle');
  });

  it('removes stale agents no longer in the roster', () => {
    let r = createStatusRegistry();
    r = syncWorldRoster(r, 'w1', ['c1'], ['a1', 'a2']);
    r = syncWorldRoster(r, 'w1', ['c1'], ['a1']); // a2 removed
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('idle');
    // a2 is gone — status-registry doesn't track it anymore
    expect(r.worlds.get('w1')?.chats.get('c1')?.agents.has('a2')).toBe(false);
  });

  it('removes stale chats no longer in the roster', () => {
    let r = createStatusRegistry();
    r = syncWorldRoster(r, 'w1', ['c1', 'c2'], ['a1']);
    r = syncWorldRoster(r, 'w1', ['c1'], ['a1']); // c2 removed
    expect(r.worlds.get('w1')?.chats.has('c2')).toBe(false);
  });

  it('preserves working agents across syncs (non-destructive)', () => {
    let r = createStatusRegistry();
    r = syncWorldRoster(r, 'w1', ['c1'], ['a1']);
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('working');
    r = syncWorldRoster(r, 'w1', ['c1'], ['a1', 'a2']);
    // a1 should remain working
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('working');
    expect(getAgentStatus(r, 'w1', 'c1', 'a2')).toBe('idle');
  });

  it('preserves complete agents across syncs (non-destructive)', () => {
    let r = createStatusRegistry();
    r = syncWorldRoster(r, 'w1', ['c1'], ['a1']);
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'end');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
    r = syncWorldRoster(r, 'w1', ['c1'], ['a1']);
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
  });

  it('world rollup reflects synced roster', () => {
    let r = createStatusRegistry();
    r = syncWorldRoster(r, 'w1', ['c1'], ['a1']);
    expect(getWorldStatus(r, 'w1')).toBe('idle');
  });
});

describe('finalizeReplayedChat', () => {
  it('working agent → complete', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = finalizeReplayedChat(r, 'w1', 'c1');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
  });

  it('multiple working agents → all complete', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a2', 'tool', 'tool-start');
    r = finalizeReplayedChat(r, 'w1', 'c1');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
    expect(getAgentStatus(r, 'w1', 'c1', 'a2')).toBe('complete');
  });

  it('already complete agent → unchanged', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'end');
    const before = r;
    r = finalizeReplayedChat(r, 'w1', 'c1');
    expect(r).toBe(before); // same reference — no mutation
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
  });

  it('idle agent → unchanged (not promoted to complete)', () => {
    let r = createStatusRegistry();
    r = syncWorldRoster(r, 'w1', ['c1'], ['a1']);
    r = finalizeReplayedChat(r, 'w1', 'c1');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('idle');
  });

  it('mixed: working normalized, complete preserved, idle preserved', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start'); // working
    r = applyEventToRegistry(r, 'w1', 'c1', 'a2', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c1', 'a2', 'sse', 'end');   // complete
    r = syncWorldRoster(r, 'w1', ['c1'], ['a1', 'a2', 'a3']);       // a3 = idle
    r = finalizeReplayedChat(r, 'w1', 'c1');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
    expect(getAgentStatus(r, 'w1', 'c1', 'a2')).toBe('complete');
    expect(getAgentStatus(r, 'w1', 'c1', 'a3')).toBe('idle');
  });

  it('does not affect sibling chats', () => {
    let r = createStatusRegistry();
    r = applyEventToRegistry(r, 'w1', 'c1', 'a1', 'sse', 'start');
    r = applyEventToRegistry(r, 'w1', 'c2', 'a1', 'sse', 'start');
    r = finalizeReplayedChat(r, 'w1', 'c1');
    expect(getAgentStatus(r, 'w1', 'c1', 'a1')).toBe('complete');
    expect(getAgentStatus(r, 'w1', 'c2', 'a1')).toBe('working');
  });

  it('is a no-op for unknown world/chat', () => {
    const r = createStatusRegistry();
    expect(finalizeReplayedChat(r, 'unknown', 'unknown')).toBe(r);
  });
});
