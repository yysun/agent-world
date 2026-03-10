/**
 * Unit Tests for message-cutoff helpers
 *
 * Purpose:
 * - Verify reusable chat-tail cutoff semantics shared across apps.
 *
 * Key Features:
 * - Trims same-chat records from the target message onward.
 * - Preserves other-chat records.
 * - Supports index fallback when timestamps are missing/invalid.
 *
 * Implementation Notes:
 * - Pure deterministic data tests only.
 * - No filesystem, SQLite, or runtime world setup required.
 *
 * Recent Changes:
 * - 2026-03-10: Added initial regression coverage after extracting shared cutoff logic from the Electron renderer.
 */

import { describe, expect, it } from 'vitest';
import { getChatCutoffItemTimestamp, trimChatItemsFromCutoff } from '../../core/message-cutoff.js';

describe('message-cutoff helpers', () => {
  it('trims same-chat items from the target message onward by timestamp', () => {
    const items = [{
      messageId: 'user-1',
      chatId: 'chat-1',
      createdAt: '2026-03-10T03:18:00.000Z',
    }, {
      messageId: 'user-2',
      chatId: 'chat-1',
      createdAt: '2026-03-10T03:18:01.000Z',
    }, {
      messageId: 'sys-err-1',
      chatId: 'chat-1',
      createdAt: '2026-03-10T03:18:02.000Z',
    }, {
      messageId: 'other-chat-1',
      chatId: 'chat-2',
      createdAt: '2026-03-10T03:18:03.000Z',
    }];

    const next = trimChatItemsFromCutoff(items, 'user-2', 'chat-1');
    expect(next.map((item) => item.messageId)).toEqual(['user-1', 'other-chat-1']);
  });

  it('falls back to index-based trimming when timestamps are missing or invalid', () => {
    const items = [{
      messageId: 'user-1',
      chatId: 'chat-1',
      createdAt: 'not-a-date',
    }, {
      messageId: 'user-2',
      chatId: 'chat-1',
      createdAt: null,
    }, {
      messageId: 'sys-err-1',
      chatId: 'chat-1',
      createdAt: undefined,
    }];

    const next = trimChatItemsFromCutoff(items, 'user-2', 'chat-1');
    expect(next.map((item) => item.messageId)).toEqual(['user-1']);
  });

  it('returns zero for invalid timestamps and parses Date instances', () => {
    expect(getChatCutoffItemTimestamp({ createdAt: 'not-a-date' })).toBe(0);
    expect(getChatCutoffItemTimestamp({ createdAt: new Date('2026-03-10T03:18:00.000Z') })).toBe(
      new Date('2026-03-10T03:18:00.000Z').getTime()
    );
  });
});
