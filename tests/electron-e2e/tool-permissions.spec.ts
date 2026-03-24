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
 * - 2026-03-24: Hardened permission-level switching to wait for bridge persistence and
 *   simplified real-model tool prompts to exact prefixes so Electron HITL flows stay deterministic.
 * - 2026-03-12: Updated web_fetch coverage to assert the documented allowed-at-all-levels
 *   matrix in one desktop session, fixed load_skill ask to handle per-skill
 *   HITL, fixed Electron tool summary locator.
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
  setSeededAgentSystemPrompt,
  waitForHitlPrompt,
  waitForAssistantToken,
  waitForAssistantTokenOrHitlPrompt,
} from './support/electron-harness.js';
import {
  buildCreateAgentPermissionPrompt,
  buildLoadSkillPermissionPrompt,
  buildShellPermissionPrompt,
  buildWebFetchPermissionPrompt,
  buildWriteFilePermissionPrompt,
} from './support/seeded-agent.js';
import { TOOL_PERMISSION_FETCH_URL } from '../support/tool-permission-fetch-target.js';

const HITL_DELETE_TARGET = '.e2e-hitl-delete-me.txt';
const WRITE_FILE_TARGET = '.e2e-write-output.txt';
const LOAD_SKILL_RUN_MARKER = '.e2e-load-skill-ran.txt';
const TOOL_PERMISSION_SKILL_ID = 'e2e-matrix-skill';
const CREATE_AGENT_ASK_NAME = 'E2E Ask Agent';
const CREATE_AGENT_AUTO_NAME = 'E2E Auto Agent';
const PERMISSION_FLOW_TIMEOUT_MS = 120_000;

async function setPermissionViaDropdown(
  page: Parameters<typeof launchAndPrepare>[0],
  level: 'read' | 'ask' | 'auto',
): Promise<void> {
  const state = await getDesktopState(page);
  const select = page.getByLabel('Tool permission level');
  await select.selectOption(level);
  await expect(select).toHaveValue(level);
  await expect
    .poll(
      async () => {
        const variables = await page.evaluate(async (worldId: string) => {
          const api = (window as any).agentWorldDesktop;
          const loaded = await api.loadWorld(worldId);
          return String(loaded?.world?.variables ?? '');
        }, state.worldId);

        if (level === 'auto') {
          return !variables.includes('tool_permission=')
            || variables.includes('tool_permission=auto');
        }
        return variables.includes(`tool_permission=${level}`);
      },
      { timeout: 5_000 },
    )
    .toBe(true);
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
    .waitFor({ state: 'visible', timeout: PERMISSION_FLOW_TIMEOUT_MS });
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
  test.describe.configure({ timeout: PERMISSION_FLOW_TIMEOUT_MS });

  test('write_file blocks at read', async ({ page }) => {
    const writeTargetPath = await resetWorkspaceFile(WRITE_FILE_TARGET);

    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);
    await setSeededAgentSystemPrompt(page, buildWriteFilePermissionPrompt());

    await setPermissionViaDropdown(page, 'read');
    await sendComposerMessage(
      page,
      `WRITE_FILE_READ: use write_file right now with filePath "${WRITE_FILE_TARGET}" and content "read should be blocked".`,
    );
    await waitForAssistantToken(page, 'E2E_WRITE_FILE_READ_BLOCKED', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
    await expect(pathExists(writeTargetPath)).resolves.toBe(false);
  });

  test('write_file requires HITL at ask', async ({ page }) => {
    const writeTargetPath = await resetWorkspaceFile(WRITE_FILE_TARGET);

    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);
    await setSeededAgentSystemPrompt(page, buildWriteFilePermissionPrompt());

    await setPermissionViaDropdown(page, 'ask');
    await sendComposerMessage(
      page,
      `WRITE_FILE_ASK: use write_file right now with filePath "${WRITE_FILE_TARGET}" and content "ASK_WRITE_OK".`,
    );
    await waitForHitlPrompt(page, PERMISSION_FLOW_TIMEOUT_MS);
    await respondToHitlPrompt(page, 'Approve', PERMISSION_FLOW_TIMEOUT_MS);
    await waitForAssistantToken(page, 'E2E_WRITE_FILE_ASK_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(fs.readFile(writeTargetPath, 'utf8')).resolves.toContain('ASK_WRITE_OK');
  });

  test('write_file auto-approves at auto', async ({ page }) => {
    await resetWorkspaceFile(WRITE_FILE_TARGET);

    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);
    await setSeededAgentSystemPrompt(page, buildWriteFilePermissionPrompt());

    await setPermissionViaDropdown(page, 'auto');
    await sendComposerMessage(
      page,
      `WRITE_FILE_AUTO: use write_file right now with filePath "${WRITE_FILE_TARGET}" and content "AUTO_WRITE_OK".`,
    );
    await waitForAssistantToken(page, 'E2E_WRITE_FILE_AUTO_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
    await expect(fs.readFile(path.join(getActiveWorkspacePath(), WRITE_FILE_TARGET), 'utf8')).resolves.toContain('AUTO_WRITE_OK');
  });

  test('web_fetch follows the read/ask/auto matrix', async ({ page }) => {
    test.setTimeout(PERMISSION_FLOW_TIMEOUT_MS * 2);

    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);
    await setSeededAgentSystemPrompt(page, buildWebFetchPermissionPrompt());

    await setPermissionViaDropdown(page, 'read');
    await sendComposerMessage(page, `WEB_FETCH_READ: fetch url "${TOOL_PERMISSION_FETCH_URL}" right now.`);
    await waitForAssistantToken(page, 'E2E_WEB_FETCH_READ_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();

    await setPermissionViaDropdown(page, 'ask');
    await sendComposerMessage(page, `WEB_FETCH_ASK: fetch url "${TOOL_PERMISSION_FETCH_URL}" right now.`);
    await waitForAssistantToken(page, 'E2E_WEB_FETCH_ASK_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();

    await setPermissionViaDropdown(page, 'auto');
    await sendComposerMessage(page, `WEB_FETCH_AUTO: fetch url "${TOOL_PERMISSION_FETCH_URL}" right now.`);
    await waitForAssistantToken(page, 'E2E_WEB_FETCH_AUTO_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
  });

  test('shell_cmd blocks at read', async ({ page }) => {
    const deleteTargetPath = await resetWorkspaceFile(
      HITL_DELETE_TARGET,
      'Disposable file for real Electron E2E shell_cmd HITL approval coverage.\n',
    );

    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);
    await setSeededAgentSystemPrompt(page, buildShellPermissionPrompt());

    await setPermissionViaDropdown(page, 'read');
    await sendComposerMessage(page, 'SHELL_READ: run shell_cmd with command "pwd" and no parameters right now.');
    await waitForAssistantToken(page, 'E2E_SHELL_READ_BLOCKED', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(pathExists(deleteTargetPath)).resolves.toBe(true);
  });

  test('shell_cmd requires HITL at ask', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);
    await setSeededAgentSystemPrompt(page, buildShellPermissionPrompt());

    await setPermissionViaDropdown(page, 'ask');
    await sendComposerMessage(page, 'SHELL_ASK: run shell_cmd with command "pwd" and no parameters right now.');
    await waitForHitlPrompt(page, PERMISSION_FLOW_TIMEOUT_MS);
    await respondToHitlPrompt(page, 'Approve', PERMISSION_FLOW_TIMEOUT_MS);
    await waitForAssistantToken(page, 'E2E_SHELL_ASK_OK', PERMISSION_FLOW_TIMEOUT_MS);
  });

  test('shell_cmd auto-approves low-risk at auto', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);
    await setSeededAgentSystemPrompt(page, buildShellPermissionPrompt());

    await setPermissionViaDropdown(page, 'auto');
    await sendComposerMessage(page, 'SHELL_AUTO: run shell_cmd with command "pwd" and no parameters right now.');
    await waitForAssistantToken(page, 'E2E_SHELL_AUTO_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
  });

  test('shell_cmd requires HITL for risky commands at auto', async ({ page }) => {
    const deleteTargetPath = await resetWorkspaceFile(
      HITL_DELETE_TARGET,
      'Disposable file for real Electron E2E shell_cmd HITL approval coverage.\n',
    );

    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);
    await setSeededAgentSystemPrompt(page, buildShellPermissionPrompt());

    await setPermissionViaDropdown(page, 'auto');
    await sendComposerMessage(
      page,
      `SHELL_RISKY_AUTO: run shell_cmd with command "rm" and parameters ["${HITL_DELETE_TARGET}"] right now.`,
    );
    await waitForHitlPrompt(page, PERMISSION_FLOW_TIMEOUT_MS);
    await respondToHitlPrompt(page, 'Approve', PERMISSION_FLOW_TIMEOUT_MS);
    await waitForAssistantToken(page, 'E2E_SHELL_RISKY_AUTO_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(pathExists(deleteTargetPath)).resolves.toBe(false);
  });

  test('create_agent blocks at read', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);
    await setSeededAgentSystemPrompt(page, buildCreateAgentPermissionPrompt());

    await setPermissionViaDropdown(page, 'read');
    await sendComposerMessage(
      page,
      `CREATE_AGENT_READ: create the exact preconfigured agent right now with name "${CREATE_AGENT_ASK_NAME}", role "E2E coverage agent", and nextAgent "human".`,
    );
    await waitForAssistantToken(page, 'E2E_CREATE_AGENT_READ_BLOCKED', PERMISSION_FLOW_TIMEOUT_MS);
    await expect.poll(async () => (await getDesktopState(page)).agentNames).not.toContain(CREATE_AGENT_ASK_NAME);
  });

  test('create_agent asks for approval and creates the agent at ask', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);
    await setSeededAgentSystemPrompt(page, buildCreateAgentPermissionPrompt());

    await setPermissionViaDropdown(page, 'ask');
    await sendComposerMessage(
      page,
      `CREATE_AGENT_ASK: create the exact preconfigured agent right now with name "${CREATE_AGENT_ASK_NAME}", role "E2E coverage agent", and nextAgent "human".`,
    );
    await waitForHitlPrompt(page, PERMISSION_FLOW_TIMEOUT_MS);
    await respondToHitlPrompt(page, 'Yes', PERMISSION_FLOW_TIMEOUT_MS);
    await dismissHitlPromptIfPresent(page);
    await expect.poll(async () => (await getDesktopState(page)).agentNames).toContain(CREATE_AGENT_ASK_NAME);
  });

  test('create_agent keeps the approval flow at auto', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);
    await setSeededAgentSystemPrompt(page, buildCreateAgentPermissionPrompt());

    await setPermissionViaDropdown(page, 'auto');
    await sendComposerMessage(
      page,
      `CREATE_AGENT_AUTO: create the exact preconfigured agent right now with name "${CREATE_AGENT_AUTO_NAME}", role "E2E coverage agent", and nextAgent "human".`,
    );
    await waitForHitlPrompt(page, PERMISSION_FLOW_TIMEOUT_MS);
    await respondToHitlPrompt(page, 'Yes', PERMISSION_FLOW_TIMEOUT_MS);
    await dismissHitlPromptIfPresent(page);
    await expect.poll(async () => (await getDesktopState(page)).agentNames).toContain(CREATE_AGENT_AUTO_NAME);
  });

  test('load_skill blocks script execution at read', async ({ page }) => {
    const markerPath = await resetWorkspaceFile(LOAD_SKILL_RUN_MARKER);

    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);
    await setSeededAgentSystemPrompt(page, buildLoadSkillPermissionPrompt());

    await setPermissionViaDropdown(page, 'read');
    await sendComposerMessage(page, `LOAD_SKILL_READ: load skill_id "${TOOL_PERMISSION_SKILL_ID}" right now.`);
    await waitForToolSummary(page, 'load_skill');
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
    await expect(pathExists(markerPath)).resolves.toBe(false);
  });

  test('load_skill asks for approval and runs scripts at ask', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);
    await setSeededAgentSystemPrompt(page, buildLoadSkillPermissionPrompt());

    await setPermissionViaDropdown(page, 'ask');
    await sendComposerMessage(page, `LOAD_SKILL_ASK: load skill_id "${TOOL_PERMISSION_SKILL_ID}" right now.`);
    await waitForHitlPrompt(page, PERMISSION_FLOW_TIMEOUT_MS);
    await respondToHitlPrompt(page, 'Yes once', PERMISSION_FLOW_TIMEOUT_MS);
    if (await waitForAssistantTokenOrHitlPrompt(page, 'E2E_LOAD_SKILL_ASK_OK', PERMISSION_FLOW_TIMEOUT_MS) === 'hitl') {
      await respondToHitlPrompt(page, 'Approve', PERMISSION_FLOW_TIMEOUT_MS);
    }
    await waitForAssistantToken(page, 'E2E_LOAD_SKILL_ASK_OK', PERMISSION_FLOW_TIMEOUT_MS);
  });

  test('load_skill runs scripts without approval at auto', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);
    await setSeededAgentSystemPrompt(page, buildLoadSkillPermissionPrompt());

    await setPermissionViaDropdown(page, 'auto');
    await sendComposerMessage(page, `LOAD_SKILL_AUTO: load skill_id "${TOOL_PERMISSION_SKILL_ID}" right now.`);
    await waitForToolSummary(page, 'load_skill');
    await waitForAssistantToken(page, 'E2E_LOAD_SKILL_AUTO_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
  });
});
