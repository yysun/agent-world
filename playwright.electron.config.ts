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
 * - 2026-03-10: Added initial Playwright Electron harness config for real desktop E2E coverage.
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/electron-e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 5_000,
  expect: {
    timeout: 5_000,
  },
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
