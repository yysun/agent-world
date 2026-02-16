/**
 * Skill Settings Utilities
 *
 * Purpose:
 * - Provide shared parsing helpers for skill-related environment settings.
 *
 * Key Features:
 * - Parses disabled skill ID lists from either JSON array or CSV strings.
 * - Normalizes values by trimming and removing empty entries.
 * - Returns de-duplicated sets for O(1) membership checks.
 *
 * Implementation Notes:
 * - JSON parsing is attempted first to support persisted array payloads.
 * - Falls back to CSV for backward compatibility with env-style values.
 *
 * Recent Changes:
 * - 2026-02-16: Added shared parser to avoid duplication between prompt and load-skill flows.
 */

export function parseSkillIdListFromEnv(value: string | undefined): Set<string> {
  const raw = String(value || '').trim();
  if (!raw) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(
        parsed
          .map((entry) => String(entry || '').trim())
          .filter((entry) => entry.length > 0),
      );
    }
  } catch {
    // Fall back to CSV parsing.
  }

  return new Set(
    raw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}