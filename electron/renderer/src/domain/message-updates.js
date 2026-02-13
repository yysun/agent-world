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
 * - 2026-02-12: Extracted message upsert/log conversion helpers from App orchestration.
 */

export function getMessageTimestamp(message) {
  const value = message?.createdAt;
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function createLogMessage(logEvent) {
  return {
    id: `log-${logEvent?.messageId || Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    messageId: `log-${Date.now()}`,
    sender: 'system',
    content: logEvent?.message || '',
    text: logEvent?.message || '',
    role: 'system',
    type: 'log',
    createdAt: logEvent?.timestamp || new Date().toISOString(),
    logEvent
  };
}

export function upsertMessageList(existingMessages, incomingMessage) {
  const incomingId = String(incomingMessage?.messageId || '').trim();
  if (!incomingId) return existingMessages;

  const next = [...existingMessages];
  const existingIndex = next.findIndex((message) => String(message?.messageId || '').trim() === incomingId);

  if (existingIndex >= 0) {
    next[existingIndex] = {
      ...next[existingIndex],
      ...incomingMessage,
      id: incomingId,
      messageId: incomingId
    };
  } else {
    next.push({
      ...incomingMessage,
      id: incomingId,
      messageId: incomingId
    });
  }

  next.sort((left, right) => getMessageTimestamp(left) - getMessageTimestamp(right));
  return next;
}
