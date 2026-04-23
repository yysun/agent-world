/**
 * Session System Status Helpers
 * Purpose:
 * - Normalize selected-chat realtime system events into status-bar display state.
 *
 * Key Features:
 * - Supports both structured object payloads and plain-text system content.
 * - Enforces explicit chat scoping for chat status-bar eligibility.
 * - Provides pure helpers for formatting, severity inference, and selection-aware clearing.
 *
 * Implementation Notes:
 * - Pure functions only; no React state or timers live here.
 * - Unknown structured payloads fall back to `message`/`title` extraction when possible.
 *
 * Recent Changes:
 * - 2026-04-23: Added pure timeout-status visibility gating so renderer callers
 *   can show timeout banners only while the selected chat is still actively
 *   working and hide them once the user resumes composing.
 * - 2026-04-23: Added timeout-status detection so the renderer can suppress or
 *   clear stale LLM timeout banners once a chat is idle or the user resumes typing.
 * - 2026-03-06: Preserved error-kind system statuses until superseded or context changes while keeping other statuses transient.
 * - 2026-03-06: Added selected-chat system-event normalization for Electron status-bar visibility.
 */

export type SessionSystemStatusKind = 'error' | 'success' | 'info';

export interface SessionSystemEventPayload {
  eventType: string;
  chatId: string | null;
  messageId: string | null;
  createdAt: string | null;
  content: unknown;
}

export interface SessionSystemStatusEntry {
  worldId: string;
  chatId: string;
  eventType: string;
  messageId: string | null;
  createdAt: string | null;
  text: string;
  kind: SessionSystemStatusKind;
  expiresAfterMs: number | null;
}

export function shouldDisplaySessionSystemStatus(params: {
  status: SessionSystemStatusEntry | null;
  chatStatus?: string | null;
  draftText?: string | null;
}): boolean {
  const { status } = params;
  if (!status) {
    return false;
  }

  if (!isTimeoutSystemStatusText(status.text)) {
    return true;
  }

  if (readTrimmedString(params.draftText)) {
    return false;
  }

  return readTrimmedString(params.chatStatus).toLowerCase() === 'working';
}

export function isTimeoutSystemStatusText(value: unknown): boolean {
  const normalized = readTrimmedString(value).toLowerCase();
  if (!normalized) {
    return false;
  }

  return normalized.includes('llm processing timed out')
    || normalized.includes('llm processing taking too long');
}

export const SESSION_SYSTEM_STATUS_TTL_MS = 5000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getStructuredText(eventType: string, contentRecord: Record<string, unknown>): string {
  const title = readTrimmedString(contentRecord.title);
  const message = readTrimmedString(contentRecord.message);

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

function inferStatusKind(eventType: string, content: unknown, text: string): SessionSystemStatusKind {
  const contentRecord = asRecord(content);
  const explicitType = readTrimmedString(contentRecord?.type).toLowerCase();
  if (explicitType === 'error') {
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

export function createSessionSystemStatus(
  worldId: string | null | undefined,
  event: SessionSystemEventPayload,
): SessionSystemStatusEntry | null {
  const normalizedWorldId = readTrimmedString(worldId);
  const normalizedChatId = readTrimmedString(event?.chatId);
  if (!normalizedWorldId || !normalizedChatId) {
    return null;
  }

  const normalizedEventType = readTrimmedString(event?.eventType);
  const content = event?.content;
  const contentText = readTrimmedString(content);
  const structuredText = contentText || getStructuredText(normalizedEventType, asRecord(content) || {});
  if (!structuredText) {
    return null;
  }

  const kind = inferStatusKind(normalizedEventType, content, structuredText);

  return {
    worldId: normalizedWorldId,
    chatId: normalizedChatId,
    eventType: normalizedEventType,
    messageId: event?.messageId || null,
    createdAt: event?.createdAt || null,
    text: structuredText,
    kind,
    expiresAfterMs: kind === 'error'
      ? null
      : SESSION_SYSTEM_STATUS_TTL_MS,
  };
}

export function retainSessionSystemStatusForContext(
  current: SessionSystemStatusEntry | null,
  worldId: string | null | undefined,
  chatId: string | null | undefined,
): SessionSystemStatusEntry | null {
  if (!current) {
    return null;
  }

  const normalizedWorldId = readTrimmedString(worldId);
  const normalizedChatId = readTrimmedString(chatId);
  if (!normalizedWorldId || !normalizedChatId) {
    return null;
  }

  if (current.worldId !== normalizedWorldId || current.chatId !== normalizedChatId) {
    return null;
  }

  return current;
}
