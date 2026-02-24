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
 * - 2026-02-20: Added optimistic user-message create/reconcile/remove helpers and deterministic fallback merge in `upsertMessageList`.
 * - 2026-02-12: Extracted message upsert/log conversion helpers from App orchestration.
 * - 2026-02-17: Migrated module from JS to TS with explicit message shape contracts.
 */

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
  return {
    id: `log-${logEvent?.messageId || Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    messageId: `log-${Date.now()}`,
    sender: 'system',
    content: logEvent?.message || '',
    text: logEvent?.message || '',
    role: 'system',
    type: 'log',
    createdAt: logEvent?.timestamp || new Date().toISOString(),
    logEvent,
    ...(chatId ? { chatId } : {}),
  };
}

export function upsertMessageList(existingMessages: MessageLike[], incomingMessage: MessageLike): MessageLike[] {
  const incomingId = String(incomingMessage?.messageId || '').trim();
  if (!incomingId) return existingMessages;

  const next = [...existingMessages];
  const existingIndex = next.findIndex((message) => String(message?.messageId || '').trim() === incomingId);

  if (existingIndex >= 0) {
    next[existingIndex] = {
      ...next[existingIndex],
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
