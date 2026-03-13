/**
 * HITL option ID normalization helpers for web E2E.
 *
 * Purpose:
 * - Provide a pure mapping from user-facing HITL option wording to the web
 *   `data-testid` identifiers rendered by the chat UI.
 *
 * Key Features:
 * - Accepts canonical option IDs unchanged.
 * - Normalizes human-readable labels such as `yes once` to `yes_once`.
 * - Returns deterministic candidate order for resilient test helpers.
 *
 * Implementation Notes:
 * - This module stays Playwright-free so Vitest can exercise it without browser setup.
 *
 * Recent Changes:
 * - 2026-03-12: Added candidate normalization for label-like HITL option inputs.
 */

export function buildHitlOptionIdCandidates(optionId: string): string[] {
  const trimmed = String(optionId || '').trim();
  if (!trimmed) {
    return [];
  }

  const lower = trimmed.toLowerCase();
  const normalizedSpaces = lower.replace(/\s+/g, ' ');

  return [...new Set([
    trimmed,
    lower,
    normalizedSpaces.replace(/ /g, '_'),
    normalizedSpaces.replace(/ /g, '-'),
  ].filter(Boolean))];
}
