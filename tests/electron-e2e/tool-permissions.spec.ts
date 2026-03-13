/**
 * Electron desktop tool-permission control E2E coverage.
 *
 * Purpose:
 * - Confirm that the world-level tool-permission dropdown renders correctly in the
 *   Electron ComposerBar, persists changes to the world via the preload bridge, and
 *   enforces the permission matrix across all tool types.
 *
 * Permission matrix:
 * | Level  | write_file | web_fetch | shell_cmd        | create_agent   | load_skill scripts |
 * |--------|------------|-----------|------------------|----------------|--------------------|
 * | read   | blocked    | allowed   | blocked          | blocked        | blocked            |
 * | ask    | HITL       | allowed   | HITL every call  | HITL (existing)| HITL (per-skill)   |
 * | auto   | auto       | allowed   | risk-tier logic  | HITL (existing)| auto               |
 *
 * Key Features:
 * - UI affordance tests (no LLM): dropdown presence, default value, all options, and
 *   persistence after selecting a new level via the ComposerBar select element.
 * - Enforcement tests (real LLM): each tool is exercised at each permission level.
 *
 * Implementation Notes:
 * - `setDesktopToolPermission` uses `page.evaluate` to call the preload bridge
 *   `updateWorld(worldId, { variables })` with the `tool_permission` env key set.
 * - The bridge-based world reload after `updateWorld` is not instant; the persistence
 *   test uses `page.evaluate` to poll `loadWorld` until the variable is reflected
 *   rather than relying on a fixed delay.
 *
 * Recent Changes:
 * - 2026-03-12: Fixed web_fetch to match auto matrix (no HITL at ask/auto), fixed
 *   load_skill ask to handle per-skill HITL, fixed Electron tool summary locator.
 * - 2026-03-12: Initial file — Electron e2e coverage for tool-permission UI and enforcement.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { test, expect } from './support/fixtures.js';
import {
  CHAT_NAMES,
  getActiveWorkspacePath,
  getDesktopState,
  respondToHitlPrompt,
  launchAndPrepare,
  selectSessionByName,
  sendComposerMessage,
  setDesktopToolPermission,
  waitForHitlPrompt,
  waitForAssistantToken,
} from './support/electron-harness.js';

const HITL_DELETE_TARGET = '.e2e-hitl-delete-me.txt';
const WRITE_FILE_TARGET = '.e2e-write-output.txt';
const LOAD_SKILL_RUN_MARKER = '.e2e-load-skill-ran.txt';
const CREATE_AGENT_ASK_NAME = 'E2E Ask Agent';
const CREATE_AGENT_AUTO_NAME = 'E2E Auto Agent';

async function setPermissionViaDropdown(
  page: Parameters<typeof launchAndPrepare>[0],
  level: 'read' | 'ask' | 'auto',
): Promise<void> {
  const select = page.getByLabel('Tool permission level');
  await select.selectOption(level);
  await expect(select).toHaveValue(level);
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
  const targetPath = path.join(getActiveWorkspacePath(), fileName);
  if (typeof content === 'string') {
    await fs.writeFile(targetPath, content, 'utf8');
  } else {
    await fs.rm(targetPath, { force: true });
  }
  return targetPath;
}

async function dismissHitlPromptIfPresent(page: Parameters<typeof launchAndPrepare>[0]): Promise<void> {
  try {
    await waitForHitlPrompt(page, 5_000);
    await respondToHitlPrompt(page, 'Dismiss', 5_000);
  } catch {
    // Some flows complete without rendering a follow-up informational prompt.
  }
}

async function waitForToolSummary(page: Parameters<typeof launchAndPrepare>[0], toolName: string): Promise<void> {
  // The Electron renderer does not use the `.tool-summary-line` CSS class from the web
  // app. Match by visible text content instead (format: "tool: <name> - <status>").
  await page
    .getByText(`tool: ${toolName} -`, { exact: false })
    .last()
    .waitFor({ state: 'visible' });
}

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
  test('write_file blocks at read', async ({ page }) => {
    const writeTargetPath = await resetWorkspaceFile(WRITE_FILE_TARGET);

    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);

    await setPermissionViaDropdown(page, 'read');
    await sendComposerMessage(page, 'WRITE_FILE_READ: exercise the read block path.');
    await waitForAssistantToken(page, 'E2E_WRITE_FILE_READ_BLOCKED');
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
    await expect(pathExists(writeTargetPath)).resolves.toBe(false);
  });

  test('write_file requires HITL at ask', async ({ page }) => {
    const writeTargetPath = await resetWorkspaceFile(WRITE_FILE_TARGET);

    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);

    await setPermissionViaDropdown(page, 'ask');
    await sendComposerMessage(page, 'WRITE_FILE_ASK: exercise the ask path.');
    await waitForHitlPrompt(page);
    await respondToHitlPrompt(page, 'Approve');
    await waitForAssistantToken(page, 'E2E_WRITE_FILE_ASK_OK');
    await expect(fs.readFile(writeTargetPath, 'utf8')).resolves.toContain('ASK_WRITE_OK');
  });

  test('write_file auto-approves at auto', async ({ page }) => {
    await resetWorkspaceFile(WRITE_FILE_TARGET);

    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);

    await setPermissionViaDropdown(page, 'auto');
    await sendComposerMessage(page, 'WRITE_FILE_AUTO: exercise the auto path.');
    await waitForAssistantToken(page, 'E2E_WRITE_FILE_AUTO_OK');
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
    await expect(fs.readFile(path.join(getActiveWorkspacePath(), WRITE_FILE_TARGET), 'utf8')).resolves.toContain('AUTO_WRITE_OK');
  });

  test('web_fetch allowed at read', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);

    await setPermissionViaDropdown(page, 'read');
    await sendComposerMessage(page, 'WEB_FETCH_READ: exercise the read block path.');
    await waitForAssistantToken(page, 'E2E_WEB_FETCH_READ_OK');
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
  });

  test('web_fetch auto-approves at ask', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);

    await setPermissionViaDropdown(page, 'ask');
    await sendComposerMessage(page, 'WEB_FETCH_ASK: exercise the ask path.');
    await waitForAssistantToken(page, 'E2E_WEB_FETCH_ASK_OK');
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
  });

  test('web_fetch auto-approves at auto', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);

    await setPermissionViaDropdown(page, 'auto');
    await sendComposerMessage(page, 'WEB_FETCH_AUTO: exercise the auto path.');
    await waitForAssistantToken(page, 'E2E_WEB_FETCH_AUTO_OK');
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
  });

  test('shell_cmd blocks at read', async ({ page }) => {
    const deleteTargetPath = await resetWorkspaceFile(
      HITL_DELETE_TARGET,
      'Disposable file for real Electron E2E shell_cmd HITL approval coverage.\n',
    );

    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);

    await setPermissionViaDropdown(page, 'read');
    await sendComposerMessage(page, 'SHELL_READ: exercise the read block path.');
    await waitForAssistantToken(page, 'E2E_SHELL_READ_BLOCKED');
    await expect(pathExists(deleteTargetPath)).resolves.toBe(true);
  });

  test('shell_cmd requires HITL at ask', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);

    await setPermissionViaDropdown(page, 'ask');
    await sendComposerMessage(page, 'SHELL_ASK: exercise the ask path.');
    await waitForHitlPrompt(page);
    await respondToHitlPrompt(page, 'Approve');
    await waitForAssistantToken(page, 'E2E_SHELL_ASK_OK');
  });

  test('shell_cmd auto-approves low-risk at auto', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);

    await setPermissionViaDropdown(page, 'auto');
    await sendComposerMessage(page, 'SHELL_AUTO: exercise the auto low-risk path.');
    await waitForAssistantToken(page, 'E2E_SHELL_AUTO_OK');
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
  });

  test('shell_cmd requires HITL for risky commands at auto', async ({ page }) => {
    const deleteTargetPath = await resetWorkspaceFile(
      HITL_DELETE_TARGET,
      'Disposable file for real Electron E2E shell_cmd HITL approval coverage.\n',
    );

    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);

    await setPermissionViaDropdown(page, 'auto');
    await sendComposerMessage(page, 'SHELL_RISKY_AUTO: exercise the auto risky path.');
    await waitForHitlPrompt(page);
    await respondToHitlPrompt(page, 'Approve');
    await waitForAssistantToken(page, 'E2E_SHELL_RISKY_AUTO_OK');
    await expect(pathExists(deleteTargetPath)).resolves.toBe(false);
  });

  test('create_agent blocks at read', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);

    await setPermissionViaDropdown(page, 'read');
    await sendComposerMessage(page, 'CREATE_AGENT_READ: exercise the read block path.');
    await waitForAssistantToken(page, 'E2E_CREATE_AGENT_READ_BLOCKED');
    await expect.poll(async () => (await getDesktopState(page)).agentNames).not.toContain(CREATE_AGENT_ASK_NAME);
  });

  test('create_agent asks for approval and creates the agent at ask', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);

    await setPermissionViaDropdown(page, 'ask');
    await sendComposerMessage(page, 'CREATE_AGENT_ASK: exercise the ask path.');
    await waitForHitlPrompt(page);
    await respondToHitlPrompt(page, 'Yes');
    await dismissHitlPromptIfPresent(page);
    await expect.poll(async () => (await getDesktopState(page)).agentNames).toContain(CREATE_AGENT_ASK_NAME);
  });

  test('create_agent keeps the approval flow at auto', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);

    await setPermissionViaDropdown(page, 'auto');
    await sendComposerMessage(page, 'CREATE_AGENT_AUTO: exercise the auto path.');
    await waitForHitlPrompt(page);
    await respondToHitlPrompt(page, 'Yes');
    await dismissHitlPromptIfPresent(page);
    await expect.poll(async () => (await getDesktopState(page)).agentNames).toContain(CREATE_AGENT_AUTO_NAME);
  });

  test('load_skill blocks script execution at read', async ({ page }) => {
    const markerPath = await resetWorkspaceFile(LOAD_SKILL_RUN_MARKER);

    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);

    await setPermissionViaDropdown(page, 'read');
    await sendComposerMessage(page, 'LOAD_SKILL_READ: exercise the read block path.');
    await waitForToolSummary(page, 'load_skill');
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
    await expect(pathExists(markerPath)).resolves.toBe(false);
  });

  test('load_skill asks for approval and runs scripts at ask', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);

    await setPermissionViaDropdown(page, 'ask');
    await sendComposerMessage(page, 'LOAD_SKILL_ASK: exercise the ask path.');
    await waitForHitlPrompt(page);
    await respondToHitlPrompt(page, 'Yes once');
    await waitForAssistantToken(page, 'E2E_LOAD_SKILL_ASK_OK');
  });

  test('load_skill runs scripts without approval at auto', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);

    await setPermissionViaDropdown(page, 'auto');
    await sendComposerMessage(page, 'LOAD_SKILL_AUTO: exercise the auto path.');
    await waitForToolSummary(page, 'load_skill');
    await waitForAssistantToken(page, 'E2E_LOAD_SKILL_AUTO_OK');
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
  });
});
