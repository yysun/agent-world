/**
 * Playwright Electron E2E configuration.
 *
 * Purpose:
 * - Configure the real Electron desktop E2E suite for the repo.
 *
 * Key Features:
 * - Runs only the Electron desktop specs under `tests/electron-e2e/`.
 * - Keeps execution serial and high-timeout for real-provider desktop flows.
 * - Retains traces/screenshots on failure for desktop debugging.
 *
 * Implementation Notes:
 * - The suite launches the compiled Electron app, not a mocked renderer shell.
 * - Tests provision their own workspace/world state before each launch.
 *
 * Recent Changes:
 * - 2026-03-12: Restored a long global Electron E2E timeout budget for real-provider desktop flows and exported the timeout constants for regression coverage.
 * - 2026-03-10: Added initial Playwright Electron harness config for real desktop E2E coverage.
 */

import { defineConfig } from '@playwright/test';

export const ELECTRON_E2E_TIMEOUT_MS = 180_000;
export const ELECTRON_E2E_EXPECT_TIMEOUT_MS = 60_000;

export default defineConfig({
  testDir: './tests/electron-e2e',
  fullyParallel: false,
  maxFailures: 1,
  workers: 1,
  timeout: ELECTRON_E2E_TIMEOUT_MS,
  expect: {
    timeout: ELECTRON_E2E_EXPECT_TIMEOUT_MS,
  },
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
