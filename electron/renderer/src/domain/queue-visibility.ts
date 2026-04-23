/**
 * Queue Visibility Domain Helpers
 * Purpose:
 * - Decide when the floating message queue should be shown in the Electron renderer.
 *
 * Key Features:
 * - Hides the queue while an inline HITL prompt is active so approval UI remains unobstructed.
 * - Keeps the queue visible only when multiple queued messages remain and no HITL prompt is present.
 *
 * Implementation Notes:
 * - Pure helper used by App layout composition for deterministic renderer unit tests.
 *
 * Summary of Recent Changes:
 * - 2026-04-23: Hide the floating queue unless at least two queued messages remain.
 * - 2026-03-13: Require more than one queued message before showing the floating queue panel.
 * - 2026-03-12: Added HITL-aware queue visibility rule for the floating composer stack.
 */

export function shouldShowQueuePanel(queueCount: number, hasActiveHitlPrompt: boolean): boolean {
  return queueCount >= 2 && !hasActiveHitlPrompt;
}