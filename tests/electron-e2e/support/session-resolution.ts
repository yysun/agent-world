/**
 * Electron E2E Session Resolution Helpers
 *
 * Purpose:
 * - Provide pure helper logic for identifying the newly created desktop chat session.
 *
 * Key Features:
 * - Detects a newly created selected session when selection has finished.
 * - Falls back to any newly added session while selection is still catching up.
 * - Avoids false positives when no new session exists yet.
 *
 * Implementation Notes:
 * - This file stays dependency-light so it can be imported from unit tests.
 * - The Playwright harness uses this helper to wait for real session creation to settle.
 *
 * Recent Changes:
 * - 2026-03-12: Added to harden desktop E2E new-chat helpers against async selection races.
 */

type SessionSummary = {
  id: string;
  name: string;
};

export function resolveCreatedSessionId(
  previousSessionIds: string[],
  nextState: { currentChatId?: string | null; sessions?: SessionSummary[] | null },
): string {
  const knownSessionIds = new Set(
    Array.isArray(previousSessionIds)
      ? previousSessionIds.map((sessionId) => String(sessionId || '').trim()).filter(Boolean)
      : [],
  );
  const nextSessions = Array.isArray(nextState.sessions) ? nextState.sessions : [];
  const normalizedCurrentChatId = String(nextState.currentChatId || '').trim();

  if (
    normalizedCurrentChatId
    && nextSessions.some((session) => session?.id === normalizedCurrentChatId)
    && !knownSessionIds.has(normalizedCurrentChatId)
  ) {
    return normalizedCurrentChatId;
  }

  const createdSession = nextSessions.find((session) => {
    const sessionId = String(session?.id || '').trim();
    return sessionId && !knownSessionIds.has(sessionId);
  });

  return String(createdSession?.id || '').trim();
}