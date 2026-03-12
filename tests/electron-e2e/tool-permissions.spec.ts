/**
 * Electron desktop tool-permission control E2E coverage.
 *
 * Purpose:
 * - Confirm that the world-level tool-permission dropdown renders correctly in the
 *   Electron ComposerBar, persists changes to the world via the preload bridge, and
 *   enforces the `read` permission level by preventing `shell_cmd` execution.
 *
 * Key Features:
 * - UI affordance tests (no LLM): dropdown presence, default value, all options, and
 *   persistence after selecting a new level via the ComposerBar select element.
 * - Enforcement test (real LLM): `read` permission blocks `shell_cmd`; the agent relays
 *   the permission-level error phrase back in its text response.
 *
 * Implementation Notes:
 * - `setDesktopToolPermission` uses `page.evaluate` to call the preload bridge
 *   `updateWorld(worldId, { variables })` with the `tool_permission` env key set.
 * - The bridge-based world reload after `updateWorld` is not instant; the persistence
 *   test uses `page.evaluate` to poll `loadWorld` until the variable is reflected
 *   rather than relying on a fixed delay.
 * - The enforcement test checks for "permission level" in the agent's text response,
 *   which the shell_cmd tool always includes in its blocked-result error message.
 *
 * Recent Changes:
 * - 2026-03-12: Initial file — Electron e2e coverage for tool-permission UI and enforcement.
 */

import { test, expect } from './support/fixtures.js';
import {
  CHAT_NAMES,
  getDesktopState,
  launchAndPrepare,
  selectSessionByName,
  sendComposerMessage,
  setDesktopToolPermission,
  waitForAssistantToken,
} from './support/electron-harness.js';

const HITL_DELETE_TARGET = '.e2e-hitl-delete-me.txt';
const PERMISSION_FLOW_TIMEOUT_MS = 30_000;

test.describe('Tool permission dropdown — UI affordances', () => {
  test('select element is visible in the ComposerBar', async ({ page }) => {
    await launchAndPrepare(page);
    await expect(page.getByLabel('Tool permission level')).toBeVisible();
  });

  test('default value is auto when no tool_permission is set', async ({ page }) => {
    await launchAndPrepare(page);
    await expect(page.getByLabel('Tool permission level')).toHaveValue('auto');
  });

  test('all three permission options are present', async ({ page }) => {
    await launchAndPrepare(page);
    const select = page.getByLabel('Tool permission level');
    await expect(select.locator('option[value="read"]')).toHaveCount(1);
    await expect(select.locator('option[value="ask"]')).toHaveCount(1);
    await expect(select.locator('option[value="auto"]')).toHaveCount(1);
  });

  test('changing dropdown to read updates world variables via bridge', async ({ page }) => {
    await launchAndPrepare(page);
    const state = await getDesktopState(page);

    await page.getByLabel('Tool permission level').selectOption('read');

    // Poll via bridge until the variable is persisted.
    await expect
      .poll(
        async () => {
          const result = await page.evaluate(async (worldId: string) => {
            const api = (window as any).agentWorldDesktop;
            const loaded = await api.loadWorld(worldId);
            return String(loaded?.world?.variables ?? '');
          }, state.worldId);
          return result;
        },
        { timeout: 5_000 },
      )
      .toContain('tool_permission=read');
  });

  test('select reflects read level set via bridge before assertion', async ({ page }) => {
    await launchAndPrepare(page);
    await setDesktopToolPermission(page, 'read');

    // The App re-derives toolPermission from the updated world variables on the next
    // render cycle. Reselect the world to trigger a world reload so the composer
    // re-renders with the new value.
    await launchAndPrepare(page);
    await expect(page.getByLabel('Tool permission level')).toHaveValue('read');
  });
});

test.describe('Tool permission enforcement', () => {
  test.describe.configure({ timeout: PERMISSION_FLOW_TIMEOUT_MS });

  test('read permission blocks shell_cmd and agent response includes permission error', async ({
    page,
  }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);

    await setDesktopToolPermission(page, 'read');

    // Re-select the seeded world to force a world reload so the composer shows 'read'.
    await launchAndPrepare(page);
    await expect(page.getByLabel('Tool permission level')).toHaveValue('read');

    // Ask the agent to call shell_cmd. The tool returns a blocked error containing
    // "permission level (read)" which the LLM relays in its text response.
    await sendComposerMessage(
      page,
      `Use shell_cmd to remove ${HITL_DELETE_TARGET}. Only call shell_cmd — do not use any other approach.`,
    );

    await waitForAssistantToken(page, 'permission level', PERMISSION_FLOW_TIMEOUT_MS);
  });
});
