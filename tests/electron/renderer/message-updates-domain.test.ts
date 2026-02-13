/**
 * Unit Tests for Message Update Domain Helpers
 *
 * Features:
 * - Verifies canonical message upsert by `messageId`.
 * - Verifies chronological sorting after updates.
 * - Verifies log-event conversion utility fields.
 *
 * Implementation Notes:
 * - Uses deterministic timestamps for ordering assertions.
 * - Avoids runtime dependencies beyond pure helper functions.
 *
 * Recent Changes:
 * - 2026-02-12: Moved into layer-based tests/electron subfolder and updated module import paths.
 * - 2026-02-12: Added Phase 5 tests for extracted message update domain module.
 */

import { describe, expect, it } from 'vitest';
import {
  createLogMessage,
  getMessageTimestamp,
  upsertMessageList
} from '../../../electron/renderer/src/domain/message-updates.js';

describe('message-updates domain helpers', () => {
  it('returns zero timestamp for invalid values', () => {
    expect(getMessageTimestamp({})).toBe(0);
    expect(getMessageTimestamp({ createdAt: 'not-a-date' })).toBe(0);
  });

  it('upserts messages by canonical messageId', () => {
    const initial = [{
      id: 'm-1',
      messageId: 'm-1',
      content: 'old',
      createdAt: '2026-02-12T10:00:00.000Z'
    }];

    const next = upsertMessageList(initial, {
      messageId: 'm-1',
      content: 'new',
      createdAt: '2026-02-12T10:00:00.000Z'
    });

    expect(next).toHaveLength(1);
    expect(next[0].content).toBe('new');
    expect(next[0].id).toBe('m-1');
  });

  it('appends and sorts messages chronologically', () => {
    const initial = [{
      id: 'm-2',
      messageId: 'm-2',
      content: 'later',
      createdAt: '2026-02-12T10:05:00.000Z'
    }];

    const next = upsertMessageList(initial, {
      messageId: 'm-1',
      content: 'earlier',
      createdAt: '2026-02-12T10:00:00.000Z'
    });

    expect(next.map((item) => item.messageId)).toEqual(['m-1', 'm-2']);
  });

  it('ignores incoming messages without canonical messageId', () => {
    const initial = [{
      id: 'm-1',
      messageId: 'm-1',
      content: 'value',
      createdAt: '2026-02-12T10:00:00.000Z'
    }];

    const next = upsertMessageList(initial, { content: 'missing id' });
    expect(next).toBe(initial);
  });

  it('creates system log messages', () => {
    const createdAt = '2026-02-12T12:00:00.000Z';
    const message = createLogMessage({
      message: 'log text',
      category: 'runtime',
      level: 'info',
      timestamp: createdAt
    });

    expect(message.role).toBe('system');
    expect(message.type).toBe('log');
    expect(message.createdAt).toBe(createdAt);
    expect(message.logEvent.category).toBe('runtime');
  });
});
