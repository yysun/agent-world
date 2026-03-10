/**
 * HITL Session Scope Utilities
 * Purpose:
 * - Derive session-scoped HITL prompt visibility for the Electron renderer.
 *
 * Key Features:
 * - Selects the active HITL prompt for the current session.
 * - Determines whether the current session has any visible HITL prompt.
 * - Supports null-chatId prompts as global prompts across sessions.
 *
 * Implementation Notes:
 * - Pure helpers keep App render-state derivation deterministic and easy to test.
 * - Prompts with `chatId === null` remain globally visible for backward compatibility.
 *
 * Recent Changes:
 * - 2026-03-10: Added combined display-state derivation helper for App render logic.
 */

type HitlEntry = { chatId: string | null; requestId: string };

/**
 * Returns the first HITL prompt in the queue that belongs to the given session,
 * or the first prompt with no chatId (global/unscoped). Returns null if none match.
 */
export function selectHitlPromptForSession<T extends HitlEntry>(
  queue: T[],
  sessionId: string | null,
): T | null {
  return queue.find((p) => !p.chatId || p.chatId === sessionId) ?? null;
}

/**
 * Returns true if the queue contains at least one prompt for the given session
 * or any global (null-chatId) prompt.
 */
export function hasHitlPromptForSession(
  queue: Array<HitlEntry>,
  sessionId: string | null,
): boolean {
  return queue.some((p) => !p.chatId || p.chatId === sessionId);
}

export function deriveHitlPromptDisplayState<T extends HitlEntry>(
  queue: T[],
  sessionId: string | null,
): { activeHitlPrompt: T | null; hasActiveHitlPrompt: boolean } {
  const activeHitlPrompt = selectHitlPromptForSession(queue, sessionId);
  return {
    activeHitlPrompt,
    hasActiveHitlPrompt: activeHitlPrompt !== null,
  };
}
