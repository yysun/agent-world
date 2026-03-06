/**
 * Panel Log Scope Helpers
 * Purpose:
 * - Normalize runtime log entries and enforce strict world/chat scoping for the Electron logs panel.
 *
 * Key Features:
 * - Extracts `worldId` / `chatId` from explicit fields or structured log `data`.
 * - Filters visible logs to the active world/chat context.
 * - Clears only the currently visible scoped logs while preserving buffered logs for other contexts.
 *
 * Implementation Notes:
 * - Unscoped logs are intentionally hidden from the right-side logs panel.
 * - When a chat is selected, only exact chat matches remain visible.
 *
 * Recent Changes:
 * - 2026-03-06: Added strict world/chat scoping for the right-side Electron logs panel.
 */

export type UnifiedLogProcess = 'main' | 'renderer';

export type UnifiedLogEntry = {
  id: string;
  process: UnifiedLogProcess;
  level: string;
  category: string;
  message: string;
  timestamp: string;
  data?: unknown;
  worldId?: string | null;
  chatId?: string | null;
};

type NormalizableLogEntry = {
  process?: unknown;
  level?: unknown;
  category?: unknown;
  message?: unknown;
  timestamp?: unknown;
  data?: unknown;
  worldId?: unknown;
  chatId?: unknown;
};

function createLogEntryId() {
  return `panel-log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeLogProcess(value: unknown): UnifiedLogProcess {
  return String(value || '').trim().toLowerCase() === 'renderer' ? 'renderer' : 'main';
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function resolveWorldId(entry: NormalizableLogEntry): string | null {
  const direct = readTrimmedString(entry?.worldId);
  if (direct) {
    return direct;
  }
  const data = readRecord(entry?.data);
  const nested = readTrimmedString(data?.worldId);
  return nested || null;
}

function resolveChatId(entry: NormalizableLogEntry): string | null {
  const direct = readTrimmedString(entry?.chatId);
  if (direct) {
    return direct;
  }
  if (entry?.chatId === null) {
    return null;
  }
  const data = readRecord(entry?.data);
  const nested = readTrimmedString(data?.chatId);
  if (nested) {
    return nested;
  }
  if (data?.chatId === null) {
    return null;
  }
  return null;
}

export function normalizeUnifiedLogEntry(entry: NormalizableLogEntry): UnifiedLogEntry {
  return {
    id: createLogEntryId(),
    process: normalizeLogProcess(entry?.process),
    level: String(entry?.level || '').trim().toLowerCase() || 'info',
    category: String(entry?.category || '').trim() || 'runtime',
    message: String(entry?.message || '').trim() || '(empty log message)',
    timestamp: String(entry?.timestamp || '').trim() || new Date().toISOString(),
    ...(entry?.data !== undefined ? { data: entry.data } : {}),
    worldId: resolveWorldId(entry),
    chatId: resolveChatId(entry),
  };
}

export function matchesPanelLogScope(
  entry: UnifiedLogEntry,
  worldId: string | null | undefined,
  chatId: string | null | undefined,
): boolean {
  const activeWorldId = readTrimmedString(worldId);
  if (!activeWorldId) {
    return false;
  }

  const entryWorldId = readTrimmedString(entry?.worldId);
  if (!entryWorldId || entryWorldId !== activeWorldId) {
    return false;
  }

  const activeChatId = readTrimmedString(chatId);
  const entryChatId = readTrimmedString(entry?.chatId);
  if (!activeChatId) {
    return entryChatId.length === 0;
  }

  return entryChatId === activeChatId;
}

export function filterPanelLogsForScope(
  entries: UnifiedLogEntry[],
  worldId: string | null | undefined,
  chatId: string | null | undefined,
): UnifiedLogEntry[] {
  return entries.filter((entry) => matchesPanelLogScope(entry, worldId, chatId));
}

export function clearPanelLogsForScope(
  entries: UnifiedLogEntry[],
  worldId: string | null | undefined,
  chatId: string | null | undefined,
): UnifiedLogEntry[] {
  return entries.filter((entry) => !matchesPanelLogScope(entry, worldId, chatId));
}
