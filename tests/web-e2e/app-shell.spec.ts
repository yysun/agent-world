/**
 * Web browser app-shell E2E coverage.
 *
 * Purpose:
 * - Verify the real web app loads and a seeded world can be opened from the home page.
 *
 * Key Features:
 * - Covers home-page rendering through the real local server + Vite app.
 * - Validates entering the seeded `e2e-test-web` world from the real UI.
 *
 * Implementation Notes:
 * - Uses the live bootstrap fixture, not mocked browser data.
 *
 * Recent Changes:
 * - 2026-03-10: Added initial app-shell smoke coverage for Playwright web E2E.
 */

import { test, expect } from './support/fixtures.js';
import { gotoHome, gotoWorld } from './support/web-harness.js';

test('loads the home page and opens the seeded world', async ({ page, bootstrapState }) => {
  await gotoHome(page);
  await expect(page.getByTestId('world-carousel')).toBeVisible();
  await gotoWorld(page, bootstrapState);
  await expect(page.getByTestId('world-page')).toBeVisible();
  await expect(page.getByTestId('chat-history')).toBeVisible();
});
