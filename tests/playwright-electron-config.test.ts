/**
 * Playwright Electron config regression tests.
 *
 * Purpose:
 * - Lock the desktop E2E Playwright timeout contract to the expected local values.
 *
 * Key Features:
 * - Verifies the Electron per-test timeout budget used for real-provider desktop flows.
 * - Verifies the Electron expect timeout remains aligned with the intended polling window.
 *
 * Implementation Notes:
 * - Imports the real Playwright Electron config module directly for a deterministic config assertion.
 * - Avoids running Electron itself so the regression coverage stays fast and local.
 *
 * Recent Changes:
 * - 2026-03-12: Updated regression coverage for the restored long Electron Playwright timeout budget.
 */

import { describe, expect, it } from 'vitest';

import playwrightElectronConfig, {
  ELECTRON_E2E_EXPECT_TIMEOUT_MS,
  ELECTRON_E2E_TIMEOUT_MS,
} from '../playwright.electron.config';

describe('playwright.electron.config', () => {
  it('sets the Electron E2E test timeout to 180 seconds', () => {
    expect(ELECTRON_E2E_TIMEOUT_MS).toBe(180_000);
    expect(playwrightElectronConfig.timeout).toBe(180_000);
  });

  it('sets the Electron expect timeout to 60 seconds', () => {
    expect(ELECTRON_E2E_EXPECT_TIMEOUT_MS).toBe(60_000);
    expect(playwrightElectronConfig.expect?.timeout).toBe(60_000);
  });
});
