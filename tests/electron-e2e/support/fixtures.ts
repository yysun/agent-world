/**
 * Shared Playwright fixtures for the real Electron desktop E2E suite.
 *
 * Purpose:
 * - Bootstrap a fresh workspace, launch Electron, and expose the first app window per test.
 *
 * Key Features:
 * - Runs the real bootstrap before each test.
 * - Launches the compiled Electron app with the dedicated E2E workspace.
 * - Provides a ready Playwright `page` fixture for desktop assertions.
 *
 * Implementation Notes:
 * - The suite is intentionally serial and local-real-runtime oriented.
 * - Each test starts from a fresh `e2e-test` world reset to avoid state bleed.
 *
 * Recent Changes:
 * - 2026-03-10: Added initial fixture layer for Electron Playwright E2E tests.
 */

import { test as base, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { bootstrapWorkspace, getElectronLaunchOptions, waitForAppShell } from './electron-harness.js';

type ElectronFixtures = {
  electronApp: ElectronApplication;
  page: Page;
};

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    await bootstrapWorkspace();
    const app = await electron.launch(getElectronLaunchOptions());
    try {
      await use(app);
    } finally {
      await app.close();
    }
  },
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await waitForAppShell(page);
    await use(page);
  },
});

export { expect };
