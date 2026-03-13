/**
 * Electron E2E World Selection Helpers
 *
 * Purpose:
 * - Provide pure helper logic for robust seeded-world selection in the desktop E2E harness.
 *
 * Key Features:
 * - Detects when the seeded world is already selected from the selector label.
 * - Classifies retryable Playwright click failures caused by dropdown re-renders.
 *
 * Implementation Notes:
 * - This file stays dependency-light so it can be imported from unit tests.
 * - The Playwright harness uses these helpers to retry unstable world-selector clicks safely.
 *
 * Recent Changes:
 * - 2026-03-12: Added to harden desktop E2E world selection against dropdown re-render races.
 */

export function isTargetWorldSelected(selectorLabel: string, worldName: string): boolean {
  return String(selectorLabel || '').trim() === String(worldName || '').trim();
}

export function isRetryableWorldSelectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return (
    message.includes('detached from the DOM')
    || message.includes('element was detached from the DOM')
  );
}
