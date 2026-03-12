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

import fs from 'node:fs/promises';
import path from 'node:path';

import { test, expect } from './support/fixtures.js';
import {
  CREATE_AGENT_ASK_NAME,
  CREATE_AGENT_AUTO_NAME,
  HITL_DELETE_TARGET,
  LOAD_SKILL_RUN_MARKER,
  TEST_WORKSPACE_PATH,
  WRITE_FILE_TARGET,
  getWorldAgentNames,
  gotoWorld,
  respondToHitlPrompt,
  sendComposerMessage,
  setWorldToolPermission,
  waitForHitlPrompt,
  waitForAssistantToken,
} from './support/web-harness.js';

const PERMISSION_FLOW_TIMEOUT_MS = 60_000;

async function reloadWorldWithPermission(
  page: Parameters<typeof gotoWorld>[0],
  bootstrapState: Parameters<typeof gotoWorld>[1],
  level: 'read' | 'ask' | 'auto',
): Promise<void> {
  await setWorldToolPermission(bootstrapState, level);
  await gotoWorld(page, bootstrapState);
  await expect(page.getByLabel('Tool permission level')).toHaveValue(level);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resetWorkspaceFile(fileName: string, content?: string): Promise<string> {
  const targetPath = path.join(TEST_WORKSPACE_PATH, fileName);
  if (typeof content === 'string') {
    await fs.writeFile(targetPath, content, 'utf8');
  } else {
    await fs.rm(targetPath, { force: true });
  }
  return targetPath;
}

async function dismissHitlPromptIfPresent(page: Parameters<typeof gotoWorld>[0]): Promise<void> {
  try {
    await waitForHitlPrompt(page, 5_000);
    await respondToHitlPrompt(page, 'dismiss', 5_000);
  } catch {
    // Some flows complete without rendering a follow-up informational prompt.
  }
}

async function waitForToolSummary(page: Parameters<typeof gotoWorld>[0], toolName: string): Promise<void> {
  await page
    .getByTestId('conversation-area')
    .locator('.tool-summary-line', { hasText: `tool: ${toolName} -` })
    .last()
    .waitFor({ state: 'visible', timeout: PERMISSION_FLOW_TIMEOUT_MS });
}

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

  test('write_file follows the read/ask/auto matrix', async ({
    page,
    bootstrapState,
  }) => {
    const writeTargetPath = await resetWorkspaceFile(WRITE_FILE_TARGET);

    await reloadWorldWithPermission(page, bootstrapState, 'read');
    await sendComposerMessage(page, 'WRITE_FILE_READ: exercise the read block path.');
    await waitForAssistantToken(page, 'E2E_WRITE_FILE_READ_BLOCKED', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
    await expect(pathExists(writeTargetPath)).resolves.toBe(false);

    await reloadWorldWithPermission(page, bootstrapState, 'ask');
    await sendComposerMessage(page, 'WRITE_FILE_ASK: exercise the ask path.');
    await waitForAssistantToken(page, 'E2E_WRITE_FILE_ASK_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
    await expect(fs.readFile(writeTargetPath, 'utf8')).resolves.toContain('ASK_WRITE_OK');

    await reloadWorldWithPermission(page, bootstrapState, 'auto');
    await sendComposerMessage(page, 'WRITE_FILE_AUTO: exercise the auto path.');
    await waitForAssistantToken(page, 'E2E_WRITE_FILE_AUTO_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
    await expect(fs.readFile(writeTargetPath, 'utf8')).resolves.toContain('AUTO_WRITE_OK');
  });

  test('web_fetch follows the read/ask/auto matrix', async ({
    page,
    bootstrapState,
  }) => {
    await reloadWorldWithPermission(page, bootstrapState, 'read');
    await sendComposerMessage(page, 'WEB_FETCH_READ: exercise the read block path.');
    await waitForAssistantToken(page, 'E2E_WEB_FETCH_READ_BLOCKED', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();

    await reloadWorldWithPermission(page, bootstrapState, 'ask');
    await sendComposerMessage(page, 'WEB_FETCH_ASK: exercise the ask path.');
    await waitForHitlPrompt(page, PERMISSION_FLOW_TIMEOUT_MS);
    await respondToHitlPrompt(page, 'yes', PERMISSION_FLOW_TIMEOUT_MS);
    await waitForAssistantToken(page, 'E2E_WEB_FETCH_ASK_OK', PERMISSION_FLOW_TIMEOUT_MS);

    await reloadWorldWithPermission(page, bootstrapState, 'auto');
    await sendComposerMessage(page, 'WEB_FETCH_AUTO: exercise the auto path.');
    await waitForHitlPrompt(page, PERMISSION_FLOW_TIMEOUT_MS);
    await respondToHitlPrompt(page, 'yes', PERMISSION_FLOW_TIMEOUT_MS);
    await waitForAssistantToken(page, 'E2E_WEB_FETCH_AUTO_OK', PERMISSION_FLOW_TIMEOUT_MS);
  });

  test('shell_cmd follows the read/ask/auto matrix', async ({
    page,
    bootstrapState,
  }) => {
    const deleteTargetPath = await resetWorkspaceFile(
      HITL_DELETE_TARGET,
      'Disposable file for real web E2E shell_cmd HITL approval coverage.\n',
    );

    await reloadWorldWithPermission(page, bootstrapState, 'read');
    await sendComposerMessage(page, 'SHELL_READ: exercise the read block path.');
    await waitForAssistantToken(page, 'E2E_SHELL_READ_BLOCKED', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(pathExists(deleteTargetPath)).resolves.toBe(true);

    await reloadWorldWithPermission(page, bootstrapState, 'ask');
    await sendComposerMessage(page, 'SHELL_ASK: exercise the ask path.');
    await waitForHitlPrompt(page, PERMISSION_FLOW_TIMEOUT_MS);
    await respondToHitlPrompt(page, 'approve', PERMISSION_FLOW_TIMEOUT_MS);
    await waitForAssistantToken(page, 'E2E_SHELL_ASK_OK', PERMISSION_FLOW_TIMEOUT_MS);

    await reloadWorldWithPermission(page, bootstrapState, 'auto');
    await sendComposerMessage(page, 'SHELL_AUTO: exercise the auto low-risk path.');
    await waitForAssistantToken(page, 'E2E_SHELL_AUTO_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();

    await resetWorkspaceFile(
      HITL_DELETE_TARGET,
      'Disposable file for real web E2E shell_cmd HITL approval coverage.\n',
    );
    await reloadWorldWithPermission(page, bootstrapState, 'auto');
    await sendComposerMessage(page, 'SHELL_RISKY_AUTO: exercise the auto risky path.');
    await waitForHitlPrompt(page, PERMISSION_FLOW_TIMEOUT_MS);
    await respondToHitlPrompt(page, 'approve', PERMISSION_FLOW_TIMEOUT_MS);
    await waitForAssistantToken(page, 'E2E_SHELL_RISKY_AUTO_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(pathExists(deleteTargetPath)).resolves.toBe(false);
  });

  test('create_agent blocks at read', async ({
    page,
    bootstrapState,
  }) => {
    await reloadWorldWithPermission(page, bootstrapState, 'read');
    await sendComposerMessage(page, 'CREATE_AGENT_READ: exercise the read block path.');
    await waitForAssistantToken(page, 'E2E_CREATE_AGENT_READ_BLOCKED', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(getWorldAgentNames(bootstrapState)).resolves.not.toContain(CREATE_AGENT_ASK_NAME);
  });

  test('create_agent asks for approval and creates the agent at ask', async ({
    page,
    bootstrapState,
  }) => {
    await reloadWorldWithPermission(page, bootstrapState, 'ask');
    await sendComposerMessage(page, 'CREATE_AGENT_ASK: exercise the ask path.');
    await waitForHitlPrompt(page, PERMISSION_FLOW_TIMEOUT_MS);
    await respondToHitlPrompt(page, 'yes', PERMISSION_FLOW_TIMEOUT_MS);
    await dismissHitlPromptIfPresent(page);
    await expect(getWorldAgentNames(bootstrapState)).resolves.toContain(CREATE_AGENT_ASK_NAME);
  });

  test('create_agent keeps the approval flow at auto', async ({
    page,
    bootstrapState,
  }) => {
    await reloadWorldWithPermission(page, bootstrapState, 'auto');
    await sendComposerMessage(page, 'CREATE_AGENT_AUTO: exercise the auto path.');
    await waitForHitlPrompt(page, PERMISSION_FLOW_TIMEOUT_MS);
    await respondToHitlPrompt(page, 'yes', PERMISSION_FLOW_TIMEOUT_MS);
    await dismissHitlPromptIfPresent(page);
    await expect(getWorldAgentNames(bootstrapState)).resolves.toContain(CREATE_AGENT_AUTO_NAME);
  });

  test('load_skill blocks script execution at read', async ({
    page,
    bootstrapState,
  }) => {
    const markerPath = await resetWorkspaceFile(LOAD_SKILL_RUN_MARKER);

    await reloadWorldWithPermission(page, bootstrapState, 'read');
    await sendComposerMessage(page, 'LOAD_SKILL_READ: exercise the read block path.');
    await waitForToolSummary(page, 'load_skill');
    await page.waitForTimeout(2_000);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
    await expect(pathExists(markerPath)).resolves.toBe(false);
  });

  test('load_skill asks for approval and runs scripts at ask', async ({
    page,
    bootstrapState,
  }) => {
    await reloadWorldWithPermission(page, bootstrapState, 'ask');
    await sendComposerMessage(page, 'LOAD_SKILL_ASK: exercise the ask path.');
    await waitForToolSummary(page, 'load_skill');
    await waitForAssistantToken(page, 'E2E_LOAD_SKILL_ASK_OK', PERMISSION_FLOW_TIMEOUT_MS);
  });

  test('load_skill runs scripts without approval at auto', async ({
    page,
    bootstrapState,
  }) => {
    await reloadWorldWithPermission(page, bootstrapState, 'auto');
    await sendComposerMessage(page, 'LOAD_SKILL_AUTO: exercise the auto path.');
    await waitForToolSummary(page, 'load_skill');
    await waitForAssistantToken(page, 'E2E_LOAD_SKILL_AUTO_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
  });
});
