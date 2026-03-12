/**
 * Purpose:
 * - Provide pure helpers for reading and updating world `.env`-style variables text.
 *
 * Key Features:
 * - Reads a single env value from multiline variables text.
 * - Upserts (insert/replace) an env variable while preserving unrelated lines/comments.
 *
 * Notes on Implementation:
 * - Functions are side-effect free and framework-agnostic.
 * - Output uses newline-joined text compatible with existing world variable persistence.
 *
 * Summary of Recent Changes:
 * - 2026-02-21: Added for web Project-button parity so `working_directory` can be updated like Electron.
 * - 2026-03-12: Added tool-permission event normalization for AppRun select handlers.
 */

export type ToolPermissionLevel = 'read' | 'ask' | 'auto';

const VALID_TOOL_PERMISSION_LEVELS = new Set<ToolPermissionLevel>(['read', 'ask', 'auto']);

export function getEnvValueFromText(
  variablesText: string | undefined,
  key: string
): string | null {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) {
    return null;
  }

  const sourceText = String(variablesText || '');
  const lines = sourceText ? sourceText.split(/\r?\n/) : [];
  for (const rawLine of lines) {
    const line = String(rawLine || '');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }

    const envKey = line.slice(0, eqIndex).trim();
    if (envKey !== normalizedKey) {
      continue;
    }

    return line.slice(eqIndex + 1).trim();
  }

  return null;
}

export function upsertEnvVariable(
  variablesText: string | undefined,
  key: string,
  value: string
): string {
  const normalizedKey = String(key || '').trim();
  const normalizedValue = String(value || '').trim();
  const sourceText = String(variablesText || '');
  const lines = sourceText ? sourceText.split(/\r?\n/) : [];

  if (!normalizedKey) {
    return lines.join('\n');
  }

  const updatedLines: string[] = [];
  let replaced = false;

  for (const rawLine of lines) {
    const line = String(rawLine || '');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      updatedLines.push(line);
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) {
      updatedLines.push(line);
      continue;
    }

    const envKey = line.slice(0, eqIndex).trim();
    if (envKey === normalizedKey) {
      if (!replaced) {
        updatedLines.push(`${normalizedKey}=${normalizedValue}`);
        replaced = true;
      }
      continue;
    }

    updatedLines.push(line);
  }

  if (!replaced) {
    if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1].trim() !== '') {
      updatedLines.push('');
    }
    updatedLines.push(`${normalizedKey}=${normalizedValue}`);
  }

  return updatedLines.join('\n');
}

export function getToolPermissionLevelFromInput(payload: unknown): ToolPermissionLevel | null {
  if (typeof payload === 'string') {
    const normalized = payload.trim().toLowerCase() as ToolPermissionLevel;
    return VALID_TOOL_PERMISSION_LEVELS.has(normalized) ? normalized : null;
  }

  const targetValue =
    payload && typeof payload === 'object' && 'target' in payload
      ? (payload as { target?: { value?: unknown } }).target?.value
      : undefined;

  if (typeof targetValue === 'string') {
    return getToolPermissionLevelFromInput(targetValue);
  }

  return null;
}
