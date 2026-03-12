/**
 * Web browser tool-permission control E2E coverage.
 *
 * Purpose:
 * - Confirm that the world-level tool-permission dropdown renders correctly in the web
 *   composer, persists changes to the API, reflects the stored value on reload, and
 *   enforces the `read` permission level by preventing `shell_cmd` execution.
 *
 * Key Features:
 * - UI affordance tests (no LLM): dropdown presence, default value, all options, API
 *   persistence on change, and UI reflection of API-set level.
 * - Enforcement test (real LLM): `read` permission blocks `shell_cmd`; the agent relays
 *   the permission-level error phrase back via its text response.
 *
 * Implementation Notes:
 * - UI-only tests use Playwright's `waitForResponse` to assert the correct PATCH call
 *   is emitted when the select changes, then reload and verify the reflected value.
 * - The enforcement test uses `setWorldToolPermission` (API helper) to set `read` before
 *   navigating to the world, then sends a shell_cmd message and waits for the phrase
 *   "permission level" which the tool error always includes.
 * - `read` enforcement resets back to `auto` between tests via fixture bootstrap, which
 *   always tears down and recreates the world with no `tool_permission` key.
 *
 * Recent Changes:
 * - 2026-03-12: Initial file — web e2e coverage for tool-permission UI and enforcement.
 */

import { test, expect } from './support/fixtures.js';
import {
  gotoWorld,
  sendComposerMessage,
  setWorldToolPermission,
  waitForAssistantToken,
} from './support/web-harness.js';

const PERMISSION_FLOW_TIMEOUT_MS = 30_000;

test.describe('Tool permission dropdown — UI affordances', () => {
  test('select element is visible in the composer bar', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await expect(page.getByLabel('Tool permission level')).toBeVisible();
  });

  test('default value is auto when no tool_permission is set', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await expect(page.getByLabel('Tool permission level')).toHaveValue('auto');
  });

  test('all three permission options are present', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    const select = page.getByLabel('Tool permission level');
    await expect(select.locator('option[value="read"]')).toHaveCount(1);
    await expect(select.locator('option[value="ask"]')).toHaveCount(1);
    await expect(select.locator('option[value="auto"]')).toHaveCount(1);
  });

  test('changing dropdown to read fires PATCH and persists after reload', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);

    const patchResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.ok() &&
        response.url().includes(`/api/worlds/${encodeURIComponent(bootstrapState.worldName)}`),
    );

    await page.getByLabel('Tool permission level').selectOption('read');
    await patchResponsePromise;

    // Reload and verify the new value persisted in the UI.
    await gotoWorld(page, bootstrapState);
    await expect(page.getByLabel('Tool permission level')).toHaveValue('read');
  });

  test('select reflects ask level set via API before navigation', async ({ page, bootstrapState }) => {
    await setWorldToolPermission(bootstrapState, 'ask');
    await gotoWorld(page, bootstrapState);
    await expect(page.getByLabel('Tool permission level')).toHaveValue('ask');
  });

  test('select reflects read level set via API before navigation', async ({ page, bootstrapState }) => {
    await setWorldToolPermission(bootstrapState, 'read');
    await gotoWorld(page, bootstrapState);
    await expect(page.getByLabel('Tool permission level')).toHaveValue('read');
  });
});

test.describe('Tool permission enforcement', () => {
  test.describe.configure({ timeout: PERMISSION_FLOW_TIMEOUT_MS });

  test('read permission blocks shell_cmd and agent response includes permission error', async ({
    page,
    bootstrapState,
  }) => {
    await setWorldToolPermission(bootstrapState, 'read');
    await gotoWorld(page, bootstrapState);

    // Confirm the permission level is visible in the composer.
    await expect(page.getByLabel('Tool permission level')).toHaveValue('read');

    // Ask the agent to call shell_cmd. The tool handler returns a blocked error
    // containing "permission level (read)" which the agent relays in its text response.
    await sendComposerMessage(
      page,
      'Use shell_cmd to run "echo hello". Only call shell_cmd — do not use any other approach.',
    );

    await waitForAssistantToken(page, 'permission level', PERMISSION_FLOW_TIMEOUT_MS);
  });
});
