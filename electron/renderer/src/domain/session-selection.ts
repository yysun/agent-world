/**
 * Session Selection Domain Helper
 * Purpose:
 * - Resolve which chat session should remain selected after world/session refreshes.
 *
 * Features:
 * - Prioritizes currently selected session if still present.
 * - Falls back to backend `currentChatId` when available in refreshed sessions.
 * - Falls back to newest-first first session when needed.
 *
 * Implementation Notes:
 * - Pure function with no side effects.
 * - Keeps selection behavior deterministic across renderer refresh flows.
 *
 * Recent Changes:
 * - 2026-02-15: Added to prevent session reselection drift after agent edits.
 * - 2026-02-17: Migrated module from JS to TS with explicit session input typing.
 */

export interface SessionLike {
  id?: string;
  [key: string]: unknown;
}

export interface ResolveSelectedSessionIdInput {
  sessions: SessionLike[];
  backendCurrentChatId?: string | null;
  currentSelectedSessionId?: string | null;
}

export function resolveSelectedSessionId({
  sessions,
  backendCurrentChatId,
  currentSelectedSessionId,
}: ResolveSelectedSessionIdInput): string | null {
  const normalizedBackendCurrentChatId = String(backendCurrentChatId || '').trim();
  const normalizedCurrentSelectedSessionId = String(currentSelectedSessionId || '').trim();
  const safeSessions = Array.isArray(sessions) ? sessions : [];

  if (
    normalizedCurrentSelectedSessionId
    && safeSessions.some((session) => session?.id === normalizedCurrentSelectedSessionId)
  ) {
    return normalizedCurrentSelectedSessionId;
  }

  if (
    normalizedBackendCurrentChatId
    && safeSessions.some((session) => session?.id === normalizedBackendCurrentChatId)
  ) {
    return normalizedBackendCurrentChatId;
  }

  return safeSessions[0]?.id || null;
}
