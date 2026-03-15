/**
 * Electron desktop agent-list regression E2E coverage.
 *
 * Purpose:
 * - Confirm the loaded world's visible agent badges survive world-save and new-chat flows.
 *
 * Key Features:
 * - Covers `Edit world -> Save` without losing the header agent list.
 * - Covers `New chat` creation without losing the header agent list.
 *
 * Implementation Notes:
 * - Runs against the real compiled Electron app with the shared desktop harness.
 * - Uses the seeded E2E agent badge as the visible regression signal.
 *
 * Recent Changes:
 * - 2026-03-15: Added regression coverage for agent badge loss after world-save and new-chat flows.
 */

import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures.js';
import { createNewSession, expectNotificationText, launchAndPrepare } from './support/electron-harness.js';
import { TEST_AGENT_NAME } from './support/seeded-agent.js';

function getSeededAgentBadge(page: Page) {
  return page.getByRole('button', {
    name: new RegExp(`^Edit agent ${TEST_AGENT_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  });
}

test.describe('Agent list regressions', () => {
  test('edit world save keeps the seeded agent badge visible', async ({ page }) => {
    await launchAndPrepare(page);
    await expect(getSeededAgentBadge(page)).toBeVisible();

    await page.getByLabel('Edit world').click();
    await page.getByPlaceholder('Description (optional)').fill('Agent list regression save marker');
    await page.getByRole('button', { name: 'Save' }).click();

    await expectNotificationText(page, 'World updated');
    await expect(getSeededAgentBadge(page)).toBeVisible();
  });

  test('new chat keeps the seeded agent badge visible', async ({ page }) => {
    await launchAndPrepare(page);
    await expect(getSeededAgentBadge(page)).toBeVisible();

    await createNewSession(page);

    await expect(getSeededAgentBadge(page)).toBeVisible();
  });
});