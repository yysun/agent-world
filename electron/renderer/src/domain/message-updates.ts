/**
 * Renderer Message Update Helpers
 * Purpose:
 * - Centralize canonical chat/log message list update behavior.
 *
 * Features:
 * - Log-event to message conversion
 * - Stable message upsert by canonical `messageId`
 * - Deterministic chronological sorting
 *
 * Implementation Notes:
 * - Message lists are treated as immutable arrays.
 * - Messages without canonical `messageId` are ignored by upsert logic.
 *
 * Recent Changes:
 * - 2026-03-10: Delegated generic chat-tail trim semantics to core and kept the renderer wrapper for transcript-specific usage.
 * - 2026-03-10: Added persisted `system` error-event to transcript conversion/replay helpers so failed-turn diagnostics can survive restart without replaying raw logs.
 * - 2026-03-06: Restored selected-chat error log rows to the transcript while keeping non-error logs panel-only.
 * - 2026-02-26: Added reusable transient-error helpers for log suppression, redundant-error cleanup, and chat-scoped transient error clearing.
 * - 2026-02-26: Added structured error-detail extraction for error log messages to avoid raw object output and improve inline indicator parity.
 * - 2026-02-20: Added optimistic user-message create/reconcile/remove helpers and deterministic fallback merge in `upsertMessageList`.
 * - 2026-02-12: Extracted message upsert/log conversion helpers from App orchestration.
 * - 2026-02-17: Migrated module from JS to TS with explicit message shape contracts.
 */

import { trimChatItemsFromCutoff } from '../../../../core/message-cutoff.js';

export interface MessageLike {
  id?: string;
  messageId?: string;
  createdAt?: string;
  chatId?: string | null;
  role?: string;
  sender?: string;
  content?: string;
  optimisticUserPending?: boolean;
  [key: string]: unknown;
}

export interface LogEventLike {
  messageId?: string;
  message?: string;
  level?: string;
  data?: unknown;
  timestamp?: string;
  [key: string]: unknown;
}

export interface OptimisticUserMessageOptions {
  chatId: string;
  content: string;
  sender?: string;
  createdAt?: string;
}

export interface ConfirmOptimisticMessageOptions {
  tempMessageId: string;
  confirmedMessage: MessageLike;
}

export function getMessageTimestamp(message: MessageLike): number {
  const value = message?.createdAt;
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function normalizeErrorText(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function formatErrorDetail(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value instanceof Error) {
    const message = String(value.message || '').trim();
    return message.length > 0 ? message : value.name || 'Error';
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message.trim();
    }
    if (typeof record.error === 'string' && record.error.trim()) {
      return record.error.trim();
    }
    try {
      return JSON.stringify(record);
    } catch {
      return String(record);
    }
  }
  return String(value);
}

function extractErrorDetailFromLogEvent(logEvent: LogEventLike): string | null {
  const data = logEvent?.data && typeof logEvent.data === 'object'
    ? logEvent.data as Record<string, unknown>
    : null;
  if (!data) {
    return null;
  }
  const firstArg = Array.isArray(data.args) ? data.args[0] : null;
  const firstArgRecord = firstArg && typeof firstArg === 'object'
    ? firstArg as Record<string, unknown>
    : null;
  const candidate =
    data.error ||
    data.errorMessage ||
    (typeof data.message === 'string' && data.message !== logEvent.message ? data.message : null) ||
    firstArgRecord?.error ||
    firstArgRecord?.errorMessage ||
    firstArgRecord?.message ||
    null;
  return formatErrorDetail(candidate);
}

function isErrorLevelLogMessage(message: MessageLike): boolean {
  if (!message?.logEvent || typeof message.logEvent !== 'object') {
    return false;
  }
  const level = normalizeErrorText((message.logEvent as LogEventLike).level);
  return level === 'error';
}

function shouldRemoveRedundantErrorLogMessage(message: MessageLike, streamErrorText: string): boolean {
  if (!isErrorLevelLogMessage(message)) {
    return false;
  }

  const logEvent = message.logEvent as LogEventLike;
  const logDetail = normalizeErrorText(extractErrorDetailFromLogEvent(logEvent) || logEvent?.message);
  if (!logDetail || !streamErrorText) {
    return false;
  }

  return logDetail.includes(streamErrorText) || streamErrorText.includes(logDetail);
}

function createOptimisticMessageId() {
  return `optimistic-user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isIncomingUserMessage(message: MessageLike): boolean {
  const role = String(message?.role || '').trim().toLowerCase();
  if (role === 'user') {
    return true;
  }
  const sender = String(message?.sender || '').trim().toLowerCase();
  return sender === 'human' || sender === 'user';
}

function findPendingOptimisticUserIndex(
  messages: MessageLike[],
  chatId: string | null,
): number {
  if (!chatId) return -1;
  return messages.findIndex((message) => {
    if (message?.optimisticUserPending !== true) return false;
    if (!isIncomingUserMessage(message)) return false;
    return String(message?.chatId || '').trim() === chatId;
  });
}

export function createOptimisticUserMessage(options: OptimisticUserMessageOptions): MessageLike {
  const tempMessageId = createOptimisticMessageId();
  const createdAt = String(options?.createdAt || '').trim() || new Date().toISOString();

  return {
    id: tempMessageId,
    messageId: tempMessageId,
    role: 'user',
    sender: String(options?.sender || 'human'),
    content: String(options?.content || ''),
    createdAt,
    chatId: String(options?.chatId || '').trim() || null,
    optimisticUserPending: true,
  };
}

export function reconcileOptimisticUserMessage(
  existingMessages: MessageLike[],
  options: ConfirmOptimisticMessageOptions
): MessageLike[] {
  const tempMessageId = String(options?.tempMessageId || '').trim();
  const confirmedMessage = options?.confirmedMessage || {};
  const confirmedMessageId = String(confirmedMessage?.messageId || '').trim();

  if (!tempMessageId || !confirmedMessageId) {
    return existingMessages;
  }

  const canonicalIndex = existingMessages.findIndex(
    (message) => String(message?.messageId || '').trim() === confirmedMessageId
  );
  const tempIndex = existingMessages.findIndex(
    (message) => String(message?.messageId || '').trim() === tempMessageId
  );

  if (canonicalIndex >= 0 && tempIndex >= 0) {
    return existingMessages.filter((message, index) => index !== tempIndex);
  }

  if (canonicalIndex >= 0) {
    return existingMessages;
  }

  if (tempIndex < 0) {
    return upsertMessageList(existingMessages, {
      ...confirmedMessage,
      optimisticUserPending: false,
    });
  }

  const next = [...existingMessages];
  next[tempIndex] = {
    ...next[tempIndex],
    ...confirmedMessage,
    id: confirmedMessageId,
    messageId: confirmedMessageId,
    optimisticUserPending: false,
  };
  next.sort((left, right) => getMessageTimestamp(left) - getMessageTimestamp(right));
  return next;
}

export function removeOptimisticUserMessage(
  existingMessages: MessageLike[],
  tempMessageId: string
): MessageLike[] {
  const targetId = String(tempMessageId || '').trim();
  if (!targetId) return existingMessages;

  const next = existingMessages.filter(
    (message) => String(message?.messageId || '').trim() !== targetId
  );
  return next.length === existingMessages.length ? existingMessages : next;
}

export function createLogMessage(logEvent: LogEventLike, chatId?: string): MessageLike {
  const level = String(logEvent?.level || '').trim().toLowerCase();
  let displayText = String(logEvent?.message || '');
  if (level === 'error') {
    const errorDetail = extractErrorDetailFromLogEvent(logEvent);
    if (errorDetail) {
      displayText = `${displayText}: ${errorDetail}`;
    }
  }

  return {
    id: String(logEvent?.messageId || `log-${Date.now()}`),
    messageId: String(logEvent?.messageId || `log-${Date.now()}`),
    sender: 'system',
    content: displayText,
    text: displayText,
    role: 'system',
    type: 'log',
    createdAt: logEvent?.timestamp || new Date().toISOString(),
    logEvent,
    ...(chatId ? { chatId } : {}),
  };
}

export function shouldSuppressLogForExistingStreamError(
  existingMessages: MessageLike[],
  logEvent: LogEventLike
): boolean {
  if (normalizeErrorText(logEvent?.level) !== 'error') {
    return false;
  }

  const logDetail = normalizeErrorText(extractErrorDetailFromLogEvent(logEvent) || logEvent?.message);
  if (!logDetail) {
    return false;
  }

  return existingMessages.some((message) => {
    if (!message?.hasError) {
      return false;
    }
    const streamError = normalizeErrorText(message?.errorMessage || message?.content || message?.text);
    if (!streamError) {
      return false;
    }
    return logDetail.includes(streamError) || streamError.includes(logDetail);
  });
}

export function removeRedundantErrorLogMessages(
  existingMessages: MessageLike[],
  errorMessage: string
): MessageLike[] {
  const normalizedError = normalizeErrorText(errorMessage);
  if (!normalizedError) {
    return existingMessages;
  }

  const next = existingMessages.filter(
    (message) => !shouldRemoveRedundantErrorLogMessage(message, normalizedError)
  );
  return next.length === existingMessages.length ? existingMessages : next;
}

function matchesChat(message: MessageLike, chatId: string | null): boolean {
  if (!chatId) {
    return true;
  }
  const messageChatId = String(message?.chatId || '').trim();
  if (!messageChatId) {
    return true;
  }
  return messageChatId === chatId;
}

export function clearChatTransientErrors(
  existingMessages: MessageLike[],
  chatId: string | null
): MessageLike[] {
  const normalizedChatId = String(chatId || '').trim() || null;
  const next = existingMessages.filter((message) => {
    if (!matchesChat(message, normalizedChatId)) {
      return true;
    }

    const isTransientError = message?.hasError === true || normalizeErrorText(message?.type) === 'error';
    if (isTransientError) {
      return false;
    }

    if (isErrorLevelLogMessage(message)) {
      return false;
    }

    return true;
  });

  return next.length === existingMessages.length ? existingMessages : next;
}

function extractSystemEventText(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  const record = content && typeof content === 'object' ? content as Record<string, unknown> : null;
  if (!record) {
    return '';
  }

  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message.trim();
  }

  if (typeof record.title === 'string' && record.title.trim()) {
    return record.title.trim();
  }

  return '';
}

function isSystemErrorContent(eventType: unknown, content: unknown): boolean {
  const normalizedEventType = String(eventType || '').trim().toLowerCase();
  const record = content && typeof content === 'object' ? content as Record<string, unknown> : null;
  const explicitType = String(record?.type || '').trim().toLowerCase();
  const text = extractSystemEventText(content).toLowerCase();

  return explicitType === 'error'
    || normalizedEventType === 'error'
    || text.startsWith('[error]')
    || text.includes('timed out')
    || text.includes('retry exhausted');
}

export function createSystemErrorMessage(event: {
  messageId?: string | null;
  createdAt?: string | null;
  chatId?: string | null;
  eventType?: string | null;
  content?: unknown;
}): MessageLike | null {
  const messageId = String(event?.messageId || '').trim();
  const chatId = String(event?.chatId || '').trim();
  const text = extractSystemEventText(event?.content);
  if (!messageId || !chatId || !text || !isSystemErrorContent(event?.eventType, event?.content)) {
    return null;
  }

  return {
    id: messageId,
    messageId,
    sender: 'system',
    role: 'system',
    type: 'system',
    content: text,
    text,
    createdAt: event?.createdAt || new Date().toISOString(),
    chatId,
    systemEvent: {
      eventType: String(event?.eventType || '').trim() || 'error',
      kind: 'error',
      content: event?.content,
    },
  };
}

export function mergeStoredSystemErrorEvents(
  existingMessages: MessageLike[],
  storedEvents: Array<Record<string, unknown>>,
  chatId: string | null,
): MessageLike[] {
  const normalizedChatId = String(chatId || '').trim() || null;
  if (!normalizedChatId || !Array.isArray(storedEvents) || storedEvents.length === 0) {
    return existingMessages;
  }

  return storedEvents.reduce((messages, event) => {
    if (String(event?.type || '').trim().toLowerCase() !== 'system') {
      return messages;
    }

    const eventChatId = String(event?.chatId || '').trim() || null;
    if (eventChatId !== normalizedChatId) {
      return messages;
    }

    const systemMessage = createSystemErrorMessage({
      messageId: String(event?.id || '').trim() || String(event?.messageId || '').trim(),
      createdAt: typeof event?.createdAt === 'string' ? event.createdAt : null,
      chatId: eventChatId,
      eventType: String((event?.payload as Record<string, unknown> | null)?.eventType || (event?.payload as Record<string, unknown> | null)?.type || '').trim(),
      content: event?.payload,
    });
    if (!systemMessage) {
      return messages;
    }

    return upsertMessageList(messages, systemMessage);
  }, existingMessages);
}

export function preserveLiveSystemErrorMessages(
  refreshedMessages: MessageLike[],
  liveMessages: MessageLike[],
  chatId: string | null,
): MessageLike[] {
  const normalizedChatId = String(chatId || '').trim() || null;
  if (!normalizedChatId || !Array.isArray(liveMessages) || liveMessages.length === 0) {
    return refreshedMessages;
  }

  return liveMessages.reduce((messages, message) => {
    const messageChatId = String(message?.chatId || '').trim() || null;
    const messageKind = String(message?.systemEvent?.kind || '').trim().toLowerCase();
    if (messageChatId !== normalizedChatId || messageKind !== 'error') {
      return messages;
    }

    return upsertMessageList(messages, message);
  }, refreshedMessages);
}

export function trimChatMessagesFromCutoff(
  existingMessages: MessageLike[],
  messageId: string,
  chatId: string | null,
): MessageLike[] {
  return trimChatItemsFromCutoff(existingMessages, messageId, chatId);
}

export function upsertMessageList(existingMessages: MessageLike[], incomingMessage: MessageLike): MessageLike[] {
  const incomingId = String(incomingMessage?.messageId || '').trim();
  if (!incomingId) return existingMessages;

  const next = [...existingMessages];
  const existingIndex = next.findIndex((message) => String(message?.messageId || '').trim() === incomingId);

  if (existingIndex >= 0) {
    const existingMessage = next[existingIndex];
    next[existingIndex] = {
      ...existingMessage,
      ...incomingMessage,
      id: incomingId,
      messageId: incomingId,
    };
  } else {
    if (isIncomingUserMessage(incomingMessage)) {
      const incomingChatId = String(incomingMessage?.chatId || '').trim() || null;
      const optimisticIndex = findPendingOptimisticUserIndex(next, incomingChatId);
      if (optimisticIndex >= 0) {
        next[optimisticIndex] = {
          ...next[optimisticIndex],
          ...incomingMessage,
          id: incomingId,
          messageId: incomingId,
          optimisticUserPending: false,
        };
        next.sort((left, right) => getMessageTimestamp(left) - getMessageTimestamp(right));
        return next;
      }
    }

    next.push({
      ...incomingMessage,
      id: incomingId,
      messageId: incomingId,
    });
  }

  next.sort((left, right) => getMessageTimestamp(left) - getMessageTimestamp(right));
  return next;
}
