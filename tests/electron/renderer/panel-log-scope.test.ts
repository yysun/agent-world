/**
 * Panel Log Scope Helper Tests
 * Purpose:
 * - Verify right-side logs panel normalization and strict world/chat scoping.
 *
 * Key Features:
 * - Covers scope extraction from explicit fields and nested log data.
 * - Covers visible-panel filtering for selected world/chat context.
 * - Covers scoped clear behavior that preserves logs for other contexts.
 *
 * Implementation Notes:
 * - Pure-function tests only; no React runtime required.
 * - Unscoped logs are intentionally hidden from the panel.
 *
 * Recent Changes:
 * - 2026-03-06: Added regression coverage for strict right-panel world/chat scoping.
 */

import { describe, expect, it } from 'vitest';
import {
  clearPanelLogsForScope,
  filterPanelLogsForScope,
  matchesPanelLogScope,
  normalizeUnifiedLogEntry,
} from '../../../electron/renderer/src/domain/panel-log-scope';

describe('panel-log-scope helpers', () => {
  it('normalizes world/chat scope from explicit fields and nested data', () => {
    const explicit = normalizeUnifiedLogEntry({
      process: 'main',
      level: 'error',
      category: 'agent',
      message: 'Continuation failed',
      timestamp: '2026-03-06T20:00:00.000Z',
      worldId: 'world-1',
      chatId: 'chat-1',
    });

    const nested = normalizeUnifiedLogEntry({
      process: 'renderer',
      level: 'warn',
      category: 'ui',
      message: 'Scoped renderer log',
      timestamp: '2026-03-06T20:00:01.000Z',
      data: {
        worldId: 'world-2',
        chatId: 'chat-2',
      }
    });

    expect(explicit).toMatchObject({ worldId: 'world-1', chatId: 'chat-1' });
    expect(nested).toMatchObject({ worldId: 'world-2', chatId: 'chat-2' });
  });

  it('shows only exact world/chat matches in chat view', () => {
    const matching = normalizeUnifiedLogEntry({
      process: 'main',
      level: 'error',
      category: 'agent',
      message: 'Matching log',
      timestamp: '2026-03-06T20:00:00.000Z',
      worldId: 'world-1',
      chatId: 'chat-1',
    });
    const otherChat = normalizeUnifiedLogEntry({
      process: 'main',
      level: 'error',
      category: 'agent',
      message: 'Other chat log',
      timestamp: '2026-03-06T20:00:01.000Z',
      worldId: 'world-1',
      chatId: 'chat-2',
    });
    const worldOnly = normalizeUnifiedLogEntry({
      process: 'main',
      level: 'error',
      category: 'agent',
      message: 'World only log',
      timestamp: '2026-03-06T20:00:02.000Z',
      worldId: 'world-1',
      chatId: null,
    });
    const unscoped = normalizeUnifiedLogEntry({
      process: 'renderer',
      level: 'info',
      category: 'ui',
      message: 'Unscoped renderer log',
      timestamp: '2026-03-06T20:00:03.000Z',
    });

    expect(matchesPanelLogScope(matching, 'world-1', 'chat-1')).toBe(true);
    expect(matchesPanelLogScope(otherChat, 'world-1', 'chat-1')).toBe(false);
    expect(matchesPanelLogScope(worldOnly, 'world-1', 'chat-1')).toBe(false);
    expect(matchesPanelLogScope(unscoped, 'world-1', 'chat-1')).toBe(false);

    expect(filterPanelLogsForScope([matching, otherChat, worldOnly, unscoped], 'world-1', 'chat-1'))
      .toEqual([matching]);
  });

  it('clears only logs in the active scope', () => {
    const logs = [
      normalizeUnifiedLogEntry({
        process: 'main',
        level: 'error',
        category: 'agent',
        message: 'Current chat',
        timestamp: '2026-03-06T20:00:00.000Z',
        worldId: 'world-1',
        chatId: 'chat-1',
      }),
      normalizeUnifiedLogEntry({
        process: 'main',
        level: 'error',
        category: 'agent',
        message: 'Other chat',
        timestamp: '2026-03-06T20:00:01.000Z',
        worldId: 'world-1',
        chatId: 'chat-2',
      }),
      normalizeUnifiedLogEntry({
        process: 'main',
        level: 'error',
        category: 'agent',
        message: 'Other world',
        timestamp: '2026-03-06T20:00:02.000Z',
        worldId: 'world-2',
        chatId: 'chat-1',
      }),
    ];

    const remaining = clearPanelLogsForScope(logs, 'world-1', 'chat-1');
    expect(remaining).toHaveLength(2);
    expect(remaining.map((entry) => entry.message)).toEqual(['Other chat', 'Other world']);
  });
});
