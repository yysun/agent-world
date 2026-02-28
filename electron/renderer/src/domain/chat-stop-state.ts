/**
 * Chat Stop-State Helpers
 * Purpose:
 * - Provide a single eligibility rule for when the composer should switch to stop mode.
 *
 * Key Features:
 * - Merges legacy pending-response signal with registry-driven working status.
 * - Guards against invalid session/sending/stopping states.
 *
 * Implementation Notes:
 * - Pure helper module with no side effects.
 * - Shared by App orchestration and input handlers to keep click/Enter behavior aligned.
 *
 * Recent Changes:
 * - 2026-02-27: Added canonical stop-eligibility helper used by App/UI event handlers.
 */

export type StopEligibilityInput = {
  selectedSessionId: string | null | undefined;
  isCurrentSessionSending: boolean;
  isCurrentSessionStopping: boolean;
  isCurrentSessionPendingResponse: boolean;
  isCurrentSessionWorking: boolean;
};

export function computeCanStopCurrentSession(input: StopEligibilityInput): boolean {
  const hasSelectedSession = Boolean(String(input.selectedSessionId || '').trim());
  if (!hasSelectedSession) return false;
  if (input.isCurrentSessionSending || input.isCurrentSessionStopping) return false;
  return Boolean(input.isCurrentSessionPendingResponse || input.isCurrentSessionWorking);
}
