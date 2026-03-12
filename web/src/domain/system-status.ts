/**
 * World System Status Helpers
 *
 * Purpose:
 * - Normalize selected-chat web system events into visible status-banner state.
 *
 * Key Features:
 * - Supports both plain-text and structured system payloads.
 * - Infers readable text and severity for user-visible runtime status updates.
 * - Retains status only when the active world/chat context still matches.
 *
 * Notes on Implementation:
 * - Pure functions only; AppRun state transitions stay in `World.update.ts`.
 * - Mirrors Electron status semantics locally without introducing a shared module.
 *
 * Summary of Recent Changes:
 * - 2026-03-12: Created for cross-client selected-chat system-status parity.
 */

export type WorldSystemStatusKind = 'error' | 'success' | 'info';

export interface WorldSystemStatusEntry {
  worldName: string;
  chatId: string;
  eventType: string;
  messageId: string | null;
  createdAt: string | null;
  text: string;
  kind: WorldSystemStatusKind;
}

export const WORLD_SYSTEM_STATUS_TTL_MS = 5000;

type WorldSystemEventEnvelope = {
  chatId?: unknown;
  messageId?: unknown;
  timestamp?: unknown;
  createdAt?: unknown;
  content?: unknown;
  eventType?: unknown;
  message?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeChatId(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || null;
  }
  return value === null ? null : null;
}

function normalizeMessageId(value: unknown): string | null {
  const normalized = readTrimmedString(value);
  return normalized || null;
}

function toCreatedAtString(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || null;
  }
  return null;
}

function getStructuredText(
  eventType: string,
  contentRecord: Record<string, unknown>,
  envelopeRecord: Record<string, unknown> | null,
): string {
  const title = readTrimmedString(contentRecord.title);
  const message = readTrimmedString(contentRecord.message) || readTrimmedString(envelopeRecord?.message);

  if (eventType === 'chat-title-updated') {
    if (title) {
      return `Chat title updated: ${title}`;
    }
    if (message) {
      return message;
    }
    return 'Chat title updated.';
  }

  if (message) {
    return message;
  }

  if (title) {
    return title;
  }

  return '';
}

function inferStatusKind(
  eventType: string,
  content: unknown,
  text: string,
): WorldSystemStatusKind {
  const contentRecord = asRecord(content);
  const explicitType = readTrimmedString(contentRecord?.type).toLowerCase();
  const failureKind = readTrimmedString(contentRecord?.failureKind).toLowerCase();
  if (explicitType === 'error' || eventType === 'error' || failureKind === 'queue-dispatch') {
    return 'error';
  }
  if (eventType === 'chat-title-updated') {
    return 'success';
  }

  const haystack = `${eventType} ${text}`.trim().toLowerCase();
  if (
    haystack.includes('timed out')
    || haystack.includes('[error]')
    || haystack.includes('retry exhausted')
    || haystack.includes('failed to dispatch')
  ) {
    return 'error';
  }

  return 'info';
}

export function createWorldSystemStatus(
  worldName: string | null | undefined,
  event: WorldSystemEventEnvelope | null | undefined,
  activeChatId?: string | null,
): WorldSystemStatusEntry | null {
  const normalizedWorldName = readTrimmedString(worldName);
  if (!normalizedWorldName || !event) {
    return null;
  }

  const envelopeRecord = asRecord(event);
  const rawContent = envelopeRecord && 'content' in envelopeRecord
    ? envelopeRecord.content
    : event;
  const content = rawContent ?? envelopeRecord;
  const contentRecord = asRecord(content);
  const normalizedChatId = normalizeChatId(contentRecord?.chatId ?? envelopeRecord?.chatId);
  if (!normalizedChatId) {
    return null;
  }

  const normalizedActiveChatId = readTrimmedString(activeChatId);
  if (normalizedActiveChatId && normalizedChatId !== normalizedActiveChatId) {
    return null;
  }

  const normalizedEventType = readTrimmedString(
    contentRecord?.eventType
    ?? contentRecord?.type
    ?? envelopeRecord?.eventType,
  ) || 'system';

  const text = typeof content === 'string'
    ? content.trim()
    : getStructuredText(normalizedEventType, contentRecord || {}, envelopeRecord);
  if (!text) {
    return null;
  }

  return {
    worldName: normalizedWorldName,
    chatId: normalizedChatId,
    eventType: normalizedEventType,
    messageId: readTrimmedString(envelopeRecord?.messageId) || null,
    createdAt: toCreatedAtString(envelopeRecord?.timestamp ?? envelopeRecord?.createdAt),
    text,
    kind: inferStatusKind(normalizedEventType, content, text),
  };
}

export function retainWorldSystemStatusForContext(
  current: WorldSystemStatusEntry | null,
  worldName: string | null | undefined,
  chatId: string | null | undefined,
): WorldSystemStatusEntry | null {
  if (!current) {
    return null;
  }

  const normalizedWorldName = readTrimmedString(worldName);
  const normalizedChatId = readTrimmedString(chatId);
  if (!normalizedWorldName || !normalizedChatId) {
    return null;
  }

  if (current.worldName !== normalizedWorldName || current.chatId !== normalizedChatId) {
    return null;
  }

  return current;
}

function getTriggeringMessageId(content: unknown): string | null {
  const contentRecord = asRecord(content);
  return normalizeMessageId(contentRecord?.triggeringMessageId);
}

function getCanonicalSystemErrorMessageId(event: WorldSystemEventEnvelope | null | undefined): string | null {
  const content = event && typeof event === 'object' && 'content' in event ? event.content : event;
  const triggeringMessageId = getTriggeringMessageId(content);
  if (triggeringMessageId) {
    return `system-error:${triggeringMessageId}`;
  }

  return normalizeMessageId(event?.messageId);
}

export function isWorldSystemErrorStatus(status: WorldSystemStatusEntry | null | undefined): boolean {
  return Boolean(status && status.kind === 'error');
}

export function createWorldSystemErrorMessage(
  event: WorldSystemEventEnvelope | null | undefined,
  worldName: string | null | undefined,
  activeChatId?: string | null,
): Record<string, unknown> | null {
  const status = createWorldSystemStatus(worldName, event, activeChatId);
  if (!isWorldSystemErrorStatus(status)) {
    return null;
  }

  const content = event && typeof event === 'object' && 'content' in event ? event.content : event;
  const messageId = getCanonicalSystemErrorMessageId(event);
  if (!messageId) {
    return null;
  }

  return {
    id: messageId,
    messageId,
    sender: 'system',
    role: 'system',
    type: 'system',
    text: status.text,
    createdAt: status.createdAt ? new Date(status.createdAt) : new Date(),
    worldName: status.worldName,
    chatId: status.chatId,
    systemEvent: {
      eventType: status.eventType,
      kind: 'error',
      content,
      sourceEventId: normalizeMessageId(event?.messageId),
      triggeringMessageId: getTriggeringMessageId(content),
    },
  };
}
