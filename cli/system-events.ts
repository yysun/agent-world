/**
 * CLI System Event Formatting Helpers
 *
 * Purpose:
 * - Convert runtime `system` event payloads into readable CLI output text.
 *
 * Key Features:
 * - Supports plain-string and structured-object system payloads.
 * - Preserves important status families such as title updates and queue failures.
 * - Keeps formatting pure so both interactive and pipeline paths share the same logic.
 *
 * Notes on Implementation:
 * - Leaf helper with no terminal side effects.
 * - Unknown payloads return `null` so callers can skip empty/noise events.
 *
 * Summary of Recent Changes:
 * - 2026-03-12: Created for cross-client system-status parity.
 */

export interface CliSystemEventPayload {
  message?: unknown;
  content?: unknown;
  eventType?: unknown;
  type?: unknown;
  title?: unknown;
  [key: string]: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getSystemEventDisplayText(eventData: CliSystemEventPayload | null | undefined): string | null {
  if (!eventData) {
    return null;
  }

  const rawContent = Object.prototype.hasOwnProperty.call(eventData, 'content')
    ? eventData.content
    : eventData;
  const content = rawContent ?? eventData;
  if (typeof content === 'string') {
    const normalized = content.trim();
    return normalized || null;
  }

  const contentRecord = asRecord(content);
  const eventType = readTrimmedString(
    contentRecord?.eventType
    ?? contentRecord?.type
    ?? eventData.eventType
    ?? eventData.type,
  );
  const title = readTrimmedString(contentRecord?.title ?? eventData.title);
  const message = readTrimmedString(contentRecord?.message ?? eventData.message);

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

  if (eventType && eventType !== 'system' && eventType !== 'world') {
    return eventType;
  }

  return null;
}
