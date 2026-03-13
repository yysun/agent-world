/**
 * Web harness HITL option selector regression tests.
 *
 * Purpose:
 * - Keep the Playwright HITL helper aligned with option IDs that use snake_case
 *   while tests still refer to the user-facing button wording.
 *
 * Key Features:
 * - Verifies label-like input is normalized to the underlying web test ID format.
 * - Preserves exact option IDs for callers that already provide canonical values.
 *
 * Implementation Notes:
 * - Exercises the pure candidate builder only; no browser or Playwright runtime is booted.
 *
 * Recent Changes:
 * - 2026-03-12: Added coverage for normalized HITL option ID candidates used by the web E2E harness.
 */

import { describe, expect, it } from 'vitest';

import { buildHitlOptionIdCandidates } from './web-e2e/support/hitl-option-id.js';

describe('buildHitlOptionIdCandidates', () => {
  it('normalizes human-readable labels to snake_case IDs', () => {
    expect(buildHitlOptionIdCandidates('yes once')).toContain('yes_once');
  });

  it('preserves canonical option IDs', () => {
    expect(buildHitlOptionIdCandidates('approve')).toContain('approve');
  });

  it('returns an empty list for blank input', () => {
    expect(buildHitlOptionIdCandidates('   ')).toEqual([]);
  });
});
