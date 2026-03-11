/**
 * Shared Playwright fixtures for the real web browser E2E suite.
 *
 * Purpose:
 * - Reset the `e2e-test-web` world over the live API and expose bootstrap state to tests.
 *
 * Key Features:
 * - Runs real world bootstrap before each browser test.
 * - Provides typed bootstrap metadata for current/switch chat assertions.
 * - Reuses Playwright's built-in browser page fixture.
 *
 * Implementation Notes:
 * - The server remains running across tests; only world state is reset per test.
 * - Tests stay serial to avoid state collisions on the shared local runtime.
 *
 * Recent Changes:
 * - 2026-03-10: Added initial fixture layer for Playwright web E2E coverage.
 */

import { test as base, expect } from '@playwright/test';
import { bootstrapWorldState, type WebBootstrapState } from './web-harness.js';

type WebFixtures = {
  bootstrapState: WebBootstrapState;
};

export const test = base.extend<WebFixtures>({
  bootstrapState: async ({}, use) => {
    const state = await bootstrapWorldState();
    await use(state);
  },
});

export { expect };
