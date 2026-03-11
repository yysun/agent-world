/**
 * Playwright web config regression tests.
 *
 * Purpose:
 * - Lock the web E2E Playwright timeout contract to the expected local value.
 *
 * Key Features:
 * - Verifies the per-test timeout exposed by the web Playwright config.
 * - Verifies the Playwright expect timeout stays aligned with the per-test timeout.
 *
 * Implementation Notes:
 * - Imports the real Playwright config module directly for a deterministic config-level assertion.
 * - Avoids running browser tests to keep coverage fast and local.
 *
 * Recent Changes:
 * - 2026-03-11: Added regression coverage for the 5 second web Playwright timeout budget.
 */

import { describe, expect, it } from 'vitest';

import playwrightWebConfig, { WEB_E2E_TIMEOUT_MS } from '../playwright.web.config';

describe('playwright.web.config', () => {
  it('sets the web E2E test timeout to 5 seconds', () => {
    expect(WEB_E2E_TIMEOUT_MS).toBe(5_000);
    expect(playwrightWebConfig.timeout).toBe(5_000);
  });

  it('keeps the expect timeout aligned with the test timeout', () => {
    expect(playwrightWebConfig.expect?.timeout).toBe(WEB_E2E_TIMEOUT_MS);
  });
});
