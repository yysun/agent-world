/**
 * Electron desktop shell E2E smoke coverage.
 *
 * Purpose:
 * - Validate the real Electron app launches and the shell controls remain reachable.
 *
 * Key Features:
 * - Selects the seeded `e2e-test` world from the real desktop UI.
 * - Verifies seeded chat sessions are visible.
 * - Covers logs/settings panel toggles and non-chat view selector smoke paths.
 *
 * Implementation Notes:
 * - Runs against the compiled Electron app with the real preload bridge and IPC routes.
 * - Uses the shared real-world bootstrap fixture for deterministic local setup.
 *
 * Recent Changes:
 * - 2026-03-10: Added initial Electron shell smoke coverage for the Playwright harness.
 */

import { test, expect } from './support/fixtures.js';
import { CHAT_NAMES, launchAndPrepare } from './support/electron-harness.js';

test('launches the real Electron app and exposes the desktop shell controls', async ({ page }) => {
  await launchAndPrepare(page);

  await expect(page.getByTestId('session-list').getByText(CHAT_NAMES.current, { exact: true })).toBeVisible();
  await expect(page.getByTestId('session-list').getByText(CHAT_NAMES.switched, { exact: true })).toBeVisible();

  await page.getByLabel('Board View').click();
  await expect(page.getByLabel('Board View')).toHaveAttribute('aria-pressed', 'true');

  await page.getByLabel('Grid View').click();
  await expect(page.getByRole('menu', { name: 'Grid layout options' })).toBeVisible();
  await page.locator('#grid-layout-option-2-2').click();

  await page.getByLabel('Canvas View').click();
  await expect(page.getByLabel('Canvas View')).toHaveAttribute('aria-pressed', 'true');

  await page.getByLabel('Chat View').click();
  await expect(page.getByLabel('Chat View')).toHaveAttribute('aria-pressed', 'true');

  await page.getByLabel('Logs').click();
  await expect(page.getByLabel('Close panel')).toBeVisible();
  await page.getByLabel('Close panel').click();

  await page.getByLabel('Settings').click();
  await expect(page.getByLabel('Close panel')).toBeVisible();
  await page.getByLabel('Close panel').click();
});
