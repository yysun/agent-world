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
 * - Covers world management affordances (world selector, create button).
 * - Covers session management affordances (session list, create, delete, search).
 *
 * Implementation Notes:
 * - Runs against the compiled Electron app with the real preload bridge and IPC routes.
 * - Uses the shared real-world bootstrap fixture for deterministic local setup.
 *
 * Recent Changes:
 * - 2026-03-10: Added initial Electron shell smoke coverage for the Playwright harness.
 * - 2026-03-10: Added world management and session management smoke describe blocks to
 *   match parity with the web world-smoke.spec.ts coverage.
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

test.describe('World management affordances', () => {
  test('world selector shows the loaded world name', async ({ page }) => {
    await launchAndPrepare(page);
    await expect(page.getByTestId('world-selector')).toBeVisible();
    // The selector button should display the seeded world name after selection.
    await expect(page.getByTestId('world-selector')).toContainText('e2e-test');
  });

  test('world create button is reachable in the sidebar', async ({ page }) => {
    await launchAndPrepare(page);
    await expect(page.getByTitle('Create new world')).toBeVisible();
  });

  test('world import button is reachable in the sidebar', async ({ page }) => {
    await launchAndPrepare(page);
    await expect(page.getByTitle('Import')).toBeVisible();
  });
});

test.describe('Session management affordances', () => {
  test('session list shows both seeded sessions', async ({ page }) => {
    await launchAndPrepare(page);
    await expect(page.getByTestId('session-list').getByText(CHAT_NAMES.current, { exact: true })).toBeVisible();
    await expect(page.getByTestId('session-list').getByText(CHAT_NAMES.switched, { exact: true })).toBeVisible();
  });

  test('session create button is reachable when a world is loaded', async ({ page }) => {
    await launchAndPrepare(page);
    await expect(page.getByLabel('Create new session')).toBeVisible();
  });

  test('session delete button is reachable for each visible session', async ({ page }) => {
    await launchAndPrepare(page);
    await expect(page.getByLabel(`Delete session ${CHAT_NAMES.current}`)).toBeVisible();
    await expect(page.getByLabel(`Delete session ${CHAT_NAMES.switched}`)).toBeVisible();
  });

  test('session search input is reachable', async ({ page }) => {
    await launchAndPrepare(page);
    await expect(page.getByLabel('Search chat sessions')).toBeVisible();
  });

  test('session search filters the session list', async ({ page }) => {
    await launchAndPrepare(page);
    await page.getByLabel('Search chat sessions').fill('zzz-no-match-zzz');
    await expect(page.getByText('No matching sessions.', { exact: true })).toBeVisible();
    // Clear search — both seeded sessions must reappear.
    await page.getByLabel('Search chat sessions').fill('');
    await expect(page.getByTestId('session-list').getByText(CHAT_NAMES.current, { exact: true })).toBeVisible();
    await expect(page.getByTestId('session-list').getByText(CHAT_NAMES.switched, { exact: true })).toBeVisible();
  });
});
