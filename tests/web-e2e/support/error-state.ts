/**
 * Web E2E error-state matching utilities.
 *
 * Purpose:
 * - Share pure matching logic between the Playwright browser harness and unit tests.
 *
 * Key Features:
 * - Recognizes durable inline system error messages rendered in the conversation pane.
 * - Keeps the matcher broad enough for queue and tool failure surfaces without treating routine notices as errors.
 *
 * Implementation Notes:
 * - This module stays Playwright-free so Vitest can import it without matcher-runtime conflicts.
 *
 * Recent Changes:
 * - 2026-03-12: Added queue and generic failure keyword matching for web E2E error waits.
 */

export const renderableSystemErrorTextPatterns = [
  'queue failed to dispatch user message',
  'failed to dispatch',
  'retry exhausted',
  'timed out',
  '[error]',
];

export function isRenderableSystemErrorText(text: string | null | undefined): boolean {
  const normalizedText = String(text || '').trim().toLowerCase();
  if (!normalizedText) {
    return false;
  }

  return renderableSystemErrorTextPatterns.some((pattern) => normalizedText.includes(pattern));
}