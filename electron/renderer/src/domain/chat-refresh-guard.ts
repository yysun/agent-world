/**
 * Chat Refresh Guard Helpers
 * Purpose:
 * - Pure helpers that determine whether an async transcript-apply result
 *   should be applied to the visible message list.
 *
 * Key Features:
 * - Both async transcript-apply entry points (onSelectSession prefetch and
 *   refreshMessages) use these helpers so the same isolation rule applies
 *   everywhere (AD-6).
 * - React-independent pure functions for direct unit-test coverage.
 *
 * Implementation Notes:
 * - shouldApplyChatRefresh is the canonical gate for any path that calls
 *   setMessages() after an async boundary.
 * - shouldActivateSessionForRefresh is the canonical gate for any path that
 *   calls api.selectSession() as a side-effect of a message refresh.
 */

/**
 * Returns true if an in-flight refresh result should be applied to the
 * visible transcript. A result must be discarded if a later refresh has
 * started (counter moved) or if the target chat is no longer selected.
 */
export function shouldApplyChatRefresh(options: {
  refreshId: number;
  currentCounter: number;
  targetChatId: string;
  selectedChatId: string | null;
}): boolean {
  const { refreshId, currentCounter, targetChatId, selectedChatId } = options;
  if (refreshId !== currentCounter) return false;
  if (targetChatId !== selectedChatId) return false;
  return true;
}

/**
 * Returns true if the backend session should be activated as part of a
 * message refresh. Activation must be skipped when the target chat is not
 * the currently selected chat to prevent backend/frontend session drift (AD-7).
 */
export function shouldActivateSessionForRefresh(
  targetChatId: string,
  selectedChatId: string | null
): boolean {
  return targetChatId === selectedChatId;
}
