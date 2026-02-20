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
 * - 2026-02-20: Added optimistic user-message lifecycle coverage (create/reconcile/remove + identical-content reconciliation safety).
 * - 2026-02-12: Moved into layer-based tests/electron subfolder and updated module import paths.
 * - 2026-02-12: Added Phase 5 tests for extracted message update domain module.
 */

import { describe, expect, it } from 'vitest';
import {
  createOptimisticUserMessage,
  createLogMessage,
  getMessageTimestamp,
  reconcileOptimisticUserMessage,
  removeOptimisticUserMessage,
  upsertMessageList
} from '../../../electron/renderer/src/domain/message-updates';

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

  it('creates optimistic user messages with pending metadata', () => {
    const optimistic = createOptimisticUserMessage({
      chatId: 'chat-1',
      content: 'hello world',
      sender: 'human',
    });

    expect(optimistic.messageId).toContain('optimistic-user-');
    expect(optimistic.role).toBe('user');
    expect(optimistic.sender).toBe('human');
    expect(optimistic.chatId).toBe('chat-1');
    expect(optimistic.optimisticUserPending).toBe(true);
  });

  it('reconciles optimistic message to canonical message id', () => {
    const optimistic = createOptimisticUserMessage({
      chatId: 'chat-1',
      content: 'hello world',
      sender: 'human',
      createdAt: '2026-02-20T10:00:00.000Z'
    });

    const reconciled = reconcileOptimisticUserMessage([optimistic], {
      tempMessageId: String(optimistic.messageId),
      confirmedMessage: {
        messageId: 'server-1',
        role: 'user',
        sender: 'human',
        chatId: 'chat-1',
        content: 'hello world',
        createdAt: '2026-02-20T10:00:00.000Z'
      }
    });

    expect(reconciled).toHaveLength(1);
    expect(reconciled[0].messageId).toBe('server-1');
    expect(reconciled[0].optimisticUserPending).toBe(false);
  });

  it('removes optimistic message when send fails', () => {
    const optimistic = createOptimisticUserMessage({
      chatId: 'chat-1',
      content: 'will fail',
    });

    const next = removeOptimisticUserMessage([optimistic], String(optimistic.messageId));
    expect(next).toHaveLength(0);
  });

  it('maps user message events to pending optimistic entries by chat id', () => {
    const optimistic = createOptimisticUserMessage({
      chatId: 'chat-1',
      content: 'same text',
      createdAt: '2026-02-20T10:00:00.000Z'
    });

    const next = upsertMessageList([optimistic], {
      messageId: 'server-user-1',
      role: 'user',
      sender: 'human',
      chatId: 'chat-1',
      content: 'same text',
      createdAt: '2026-02-20T10:00:01.000Z'
    });

    expect(next).toHaveLength(1);
    expect(next[0].messageId).toBe('server-user-1');
    expect(next[0].optimisticUserPending).toBe(false);
  });

  it('keeps identical consecutive user sends distinct during reconciliation', () => {
    const optimisticOne = createOptimisticUserMessage({
      chatId: 'chat-1',
      content: 'repeat',
      createdAt: '2026-02-20T10:00:00.000Z'
    });
    const optimisticTwo = createOptimisticUserMessage({
      chatId: 'chat-1',
      content: 'repeat',
      createdAt: '2026-02-20T10:00:01.000Z'
    });

    const afterFirstEcho = upsertMessageList([optimisticOne, optimisticTwo], {
      messageId: 'server-user-1',
      role: 'user',
      sender: 'human',
      chatId: 'chat-1',
      content: 'repeat',
      createdAt: '2026-02-20T10:00:02.000Z'
    });
    const afterSecondEcho = upsertMessageList(afterFirstEcho, {
      messageId: 'server-user-2',
      role: 'user',
      sender: 'human',
      chatId: 'chat-1',
      content: 'repeat',
      createdAt: '2026-02-20T10:00:03.000Z'
    });

    expect(afterSecondEcho).toHaveLength(2);
    expect(afterSecondEcho.map((item) => item.messageId)).toEqual(['server-user-1', 'server-user-2']);
    expect(afterSecondEcho.every((item) => item.optimisticUserPending !== true)).toBe(true);
  });
});
