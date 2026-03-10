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
 * - 2026-03-10: Added regressions for failed-turn system-error coalescing and refresh protection against stale live streaming rows overriding canonical refreshed messages.
 * - 2026-02-26: Added coverage for redundant error-log suppression/removal and chat-scoped transient error clearing.
 * - 2026-02-20: Added optimistic user-message lifecycle coverage (create/reconcile/remove + identical-content reconciliation safety).
 * - 2026-02-12: Moved into layer-based tests/electron subfolder and updated module import paths.
 * - 2026-02-12: Added Phase 5 tests for extracted message update domain module.
*/

import { describe, expect, it } from 'vitest';
import {
  clearChatTransientErrors,
  createSystemErrorMessage,
  createOptimisticUserMessage,
  createLogMessage,
  getMessageTimestamp,
  mergeStoredSystemErrorEvents,
  reconcileRefreshedMessagesWithLiveState,
  preserveLiveSystemErrorMessages,
  reconcileOptimisticUserMessage,
  removeRedundantErrorLogMessages,
  removeOptimisticUserMessage,
  shouldSuppressLogForExistingStreamError,
  trimChatMessagesFromCutoff,
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

  it('suppresses error logs when equivalent stream error already exists', () => {
    const existing = [{
      messageId: 'm-1',
      hasError: true,
      errorMessage: "model 'qwen2.5:14b' not found"
    }];
    const shouldSuppress = shouldSuppressLogForExistingStreamError(existing, {
      message: 'LLM failure',
      level: 'error',
      data: {
        error: "404 model 'qwen2.5:14b' not found"
      }
    });
    expect(shouldSuppress).toBe(true);
  });

  it('removes redundant error log rows after stream error is marked inline', () => {
    const existing = [{
      messageId: 'log-1',
      logEvent: {
        level: 'error',
        message: 'LLM failure',
        data: { error: "404 model 'qwen2.5:14b' not found" }
      }
    }, {
      messageId: 'm-1',
      role: 'assistant',
      hasError: true,
      errorMessage: "model 'qwen2.5:14b' not found"
    }];
    const next = removeRedundantErrorLogMessages(existing, "model 'qwen2.5:14b' not found");
    expect(next).toHaveLength(1);
    expect(next[0].messageId).toBe('m-1');
  });

  it('clears chat-scoped transient error logs and inline error markers', () => {
    const existing = [{
      messageId: 'log-error',
      chatId: 'chat-1',
      type: 'log',
      logEvent: { level: 'error', message: 'failure' }
    }, {
      messageId: 'assistant-error',
      chatId: 'chat-1',
      role: 'assistant',
      hasError: true,
      errorMessage: 'failure'
    }, {
      messageId: 'assistant-ok',
      chatId: 'chat-1',
      role: 'assistant',
      content: 'ok'
    }];

    const next = clearChatTransientErrors(existing, 'chat-1');
    expect(next).toHaveLength(1);
    expect(next[0].messageId).toBe('assistant-ok');
  });

  it('creates a transcript message for structured system error events', () => {
    const message = createSystemErrorMessage({
      messageId: 'sys-1',
      createdAt: '2026-03-10T03:18:01.000Z',
      chatId: 'chat-1',
      eventType: 'error',
      content: {
        type: 'error',
        message: 'Agent failed to process the turn.',
        agentName: 'gpt5',
      },
    });

    expect(message).toMatchObject({
      messageId: 'sys-1',
      role: 'system',
      type: 'system',
      chatId: 'chat-1',
      content: 'Agent failed to process the turn.',
      systemEvent: {
        kind: 'error',
      },
    });
  });

  it('merges stored chat-scoped system error events back into restored messages', () => {
    const existing = [{
      messageId: 'user-1',
      role: 'user',
      sender: 'human',
      chatId: 'chat-1',
      content: 'hello',
      createdAt: '2026-03-10T03:18:00.000Z',
    }];

    const next = mergeStoredSystemErrorEvents(existing, [{
      id: 'sys-1',
      type: 'system',
      chatId: 'chat-1',
      createdAt: '2026-03-10T03:18:01.000Z',
      payload: {
        type: 'error',
        eventType: 'error',
        message: 'Agent failed to process the turn.',
        agentName: 'gpt5',
      },
    }], 'chat-1');

    expect(next.map((message) => message.messageId)).toEqual(['user-1', 'sys-1']);
    expect(next[1]).toMatchObject({
      role: 'system',
      type: 'system',
      chatId: 'chat-1',
    });
  });

  it('preserves persisted system error timestamps when storage returns Date objects', () => {
    const next = mergeStoredSystemErrorEvents([], [{
      id: 'sys-date-1',
      type: 'system',
      chatId: 'chat-1',
      createdAt: new Date('2026-03-10T03:18:01.000Z'),
      payload: {
        type: 'error',
        eventType: 'error',
        message: 'Agent failed to process the turn.',
      },
    }], 'chat-1');

    expect(next).toHaveLength(1);
    expect(next[0].createdAt).toBe('2026-03-10T03:18:01.000Z');
  });

  it('coalesces repeated persisted failed-turn system errors by triggering message id', () => {
    const next = mergeStoredSystemErrorEvents([], [{
      id: 'sys-first',
      type: 'system',
      chatId: 'chat-1',
      createdAt: '2026-03-10T03:18:01.000Z',
      payload: {
        type: 'error',
        eventType: 'error',
        message: 'Queue failed to dispatch user turn: no responder.',
        triggeringMessageId: 'user-turn-1',
      },
    }, {
      id: 'sys-second',
      type: 'system',
      chatId: 'chat-1',
      createdAt: '2026-03-10T03:18:02.000Z',
      payload: {
        type: 'error',
        eventType: 'error',
        message: 'Queue failed to dispatch user turn: no responder.',
        triggeringMessageId: 'user-turn-1',
      },
    }], 'chat-1');

    expect(next).toHaveLength(1);
    expect(next[0].messageId).toBe('system-error:user-turn-1');
    expect(next[0].createdAt).toBe('2026-03-10T03:18:02.000Z');
    expect(next[0].systemEvent).toMatchObject({
      sourceEventId: 'sys-second',
      triggeringMessageId: 'user-turn-1',
    });
  });

  it('ignores non-error system events when restoring transcript error rows', () => {
    const existing = [{
      messageId: 'user-1',
      role: 'user',
      sender: 'human',
      chatId: 'chat-1',
      content: 'hello',
      createdAt: '2026-03-10T03:18:00.000Z',
    }];

    const next = mergeStoredSystemErrorEvents(existing, [{
      id: 'sys-title',
      type: 'system',
      chatId: 'chat-1',
      createdAt: '2026-03-10T03:18:01.000Z',
      payload: {
        eventType: 'chat-title-updated',
        title: 'New title',
      },
    }], 'chat-1');

    expect(next).toEqual(existing);
  });

  it('preserves live system error messages across a stale refresh result', () => {
    const refreshed = [{
      messageId: 'user-1',
      role: 'user',
      sender: 'human',
      chatId: 'chat-1',
      content: 'hello',
      createdAt: '2026-03-10T03:18:00.000Z',
    }];

    const live = [{
      messageId: 'sys-live-1',
      role: 'system',
      sender: 'system',
      type: 'system',
      chatId: 'chat-1',
      content: 'Error processing agent message: provider missing.',
      createdAt: '2026-03-10T03:18:01.000Z',
      systemEvent: {
        kind: 'error',
        eventType: 'error',
      },
    }];

    const next = preserveLiveSystemErrorMessages(refreshed, live, 'chat-1');
    expect(next.map((message) => message.messageId)).toEqual(['user-1', 'sys-live-1']);
  });

  it('reconciles refresh results with optimistic and live streaming selected-chat state', () => {
    const refreshed = [{
      messageId: 'user-1',
      role: 'user',
      sender: 'human',
      chatId: 'chat-1',
      content: 'hello',
      createdAt: '2026-03-10T03:18:00.000Z',
    }];

    const optimistic = createOptimisticUserMessage({
      chatId: 'chat-1',
      content: 'follow up',
      sender: 'human',
      createdAt: '2026-03-10T03:18:01.000Z',
    });

    const next = reconcileRefreshedMessagesWithLiveState(refreshed, [
      optimistic,
      {
        messageId: 'stream-1',
        role: 'assistant',
        sender: 'gpt5',
        chatId: 'chat-1',
        content: 'partial',
        createdAt: '2026-03-10T03:18:02.000Z',
        isStreaming: true,
      },
      {
        messageId: 'tool-1',
        role: 'tool',
        sender: 'shell_cmd',
        chatId: 'chat-1',
        content: 'running',
        createdAt: '2026-03-10T03:18:03.000Z',
        isToolStreaming: true,
      },
    ], 'chat-1');

    expect(next.map((message) => message.messageId)).toEqual(['user-1', String(optimistic.messageId), 'stream-1', 'tool-1']);
    expect(next[1].optimisticUserPending).toBe(true);
    expect(next[2].isStreaming).toBe(true);
    expect(next[3].isToolStreaming).toBe(true);
  });

  it('does not overwrite refreshed finalized assistant messages with stale live streaming rows', () => {
    const refreshed = [{
      messageId: 'assistant-1',
      role: 'assistant',
      sender: 'gpt5',
      chatId: 'chat-1',
      content: 'final answer',
      createdAt: '2026-03-10T03:18:05.000Z',
      isStreaming: false,
    }];

    const next = reconcileRefreshedMessagesWithLiveState(refreshed, [{
      messageId: 'assistant-1',
      role: 'assistant',
      sender: 'gpt5',
      chatId: 'chat-1',
      content: 'partial',
      createdAt: '2026-03-10T03:18:04.000Z',
      isStreaming: true,
    }], 'chat-1');

    expect(next).toHaveLength(1);
    expect(next[0].content).toBe('final answer');
    expect(next[0].isStreaming).toBe(false);
  });

  it('trims the edited chat tail including structured system error rows', () => {
    const existing = [{
      messageId: 'user-1',
      role: 'user',
      sender: 'human',
      chatId: 'chat-1',
      content: 'first',
      createdAt: '2026-03-10T03:18:00.000Z',
    }, {
      messageId: 'user-2',
      role: 'user',
      sender: 'human',
      chatId: 'chat-1',
      content: 'edit me',
      createdAt: '2026-03-10T03:18:01.000Z',
    }, {
      messageId: 'sys-err-1',
      role: 'system',
      sender: 'system',
      type: 'system',
      chatId: 'chat-1',
      content: 'Provider missing.',
      createdAt: '2026-03-10T03:18:02.000Z',
      systemEvent: {
        kind: 'error',
        eventType: 'error',
      },
    }];

    const next = trimChatMessagesFromCutoff(existing, 'user-2', 'chat-1');
    expect(next.map((message) => message.messageId)).toEqual(['user-1']);
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
