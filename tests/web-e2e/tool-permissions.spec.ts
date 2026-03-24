/**
 * Web browser tool-permission control E2E coverage.
 *
 * Purpose:
 * - Confirm that the world-level tool-permission dropdown renders correctly in the web
 *   composer, persists changes to the API, reflects the stored value on reload, and
 *   enforces the permission matrix across all supported tool types.
 *
 * Key Features:
 * - UI affordance tests (no LLM): dropdown presence, default value, all options, API
 *   persistence on change, and UI reflection of API-set level.
 * - Enforcement tests (real LLM): `write_file`, `web_fetch`, `shell_cmd`,
 *   `create_agent`, and `load_skill` are exercised against the documented
 *   `read` / `ask` / `auto` matrix.
 *
 * Implementation Notes:
 * - UI-only tests use Playwright's `waitForResponse` to assert the correct PATCH call
 *   is emitted when the select changes, then reload and verify the reflected value.
 * - Enforcement cases use `setWorldToolPermission` (API helper) to switch between
 *   `read`, `ask`, and `auto`, then navigate back to the world before sending
 *   tool-specific prompts through the real UI.
 * - Bootstrap resets the world between tests, so every test starts from a clean
 *   `auto` default when the `tool_permission` key is absent.
 *
 * Recent Changes:
 * - 2026-03-24: Isolated shell-cmd and create-agent permission branches in fresh chats with
 *   narrow seeded prompts so the remaining ask-mode approval paths stay stable in full-suite runs.
 * - 2026-03-24: Isolated permission-matrix branches in fresh chats and tightened prompt wording
 *   for write_file, web_fetch, and load_skill so long full-suite runs stay deterministic.
 * - 2026-03-24: Aligned load_skill web E2E expectations with the current load-only contract:
 *   ask-mode requires approval to apply a skill that references scripts, but loading the skill
 *   does not execute those scripts automatically.
 * - 2026-03-23: Hardened create-agent approval coverage to complete the required post-create dismiss prompt
 *   before asserting assistant completion or backend agent-list state.
 * - 2026-03-12: Updated header docs to match the full permission-matrix coverage already implemented in this spec.
 * - 2026-03-12: Initial file — web e2e coverage for tool-permission UI and enforcement.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { test, expect } from './support/fixtures.js';
import {
  buildCreateAgentPermissionPrompt,
  buildLoadSkillPermissionPrompt,
  buildShellPermissionPrompt,
  buildWebFetchPermissionPrompt,
  buildWriteFilePermissionPrompt,
  CREATE_AGENT_ASK_NAME,
  CREATE_AGENT_AUTO_NAME,
  HITL_DELETE_TARGET,
  LOAD_SKILL_RUN_MARKER,
  TEST_WORKSPACE_PATH,
  WRITE_FILE_TARGET,
  createNewChat,
  getWorldAgentNames,
  gotoWorld,
  respondToHitlPrompt,
  sendComposerMessage,
  setAgentSystemPrompt,
  setWorldToolPermission,
  waitForHitlPrompt,
  waitForAssistantToken,
  waitForWorldIdle,
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

async function preparePermissionScenario(
  page: Parameters<typeof gotoWorld>[0],
  bootstrapState: Parameters<typeof gotoWorld>[1],
  level: 'read' | 'ask' | 'auto',
): Promise<void> {
  await reloadWorldWithPermission(page, bootstrapState, level);
  await createNewChat(page);
}

function directToAgent(agentName: string, command: string): string {
  return `@${agentName} ${command}`;
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

async function completeCreateAgentFlow(
  page: Parameters<typeof gotoWorld>[0],
  bootstrapState: Parameters<typeof gotoWorld>[1],
  approveToken: string,
  agentName: string,
): Promise<void> {
  await waitForHitlPrompt(page, PERMISSION_FLOW_TIMEOUT_MS);
  await respondToHitlPrompt(page, 'yes', PERMISSION_FLOW_TIMEOUT_MS);
  await waitForHitlPrompt(page, PERMISSION_FLOW_TIMEOUT_MS);
  await respondToHitlPrompt(page, 'dismiss', PERMISSION_FLOW_TIMEOUT_MS);
  await waitForAssistantToken(page, approveToken, PERMISSION_FLOW_TIMEOUT_MS);
  await waitForWorldIdle(page, PERMISSION_FLOW_TIMEOUT_MS);
  await expect.poll(() => getWorldAgentNames(bootstrapState), {
    timeout: PERMISSION_FLOW_TIMEOUT_MS,
  }).toContain(agentName);
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
    await setAgentSystemPrompt(bootstrapState, buildWriteFilePermissionPrompt());

    await preparePermissionScenario(page, bootstrapState, 'read');
    await sendComposerMessage(page, directToAgent(bootstrapState.agentName, 'WRITE_FILE_READ:'));
    await waitForAssistantToken(page, 'E2E_WRITE_FILE_READ_BLOCKED', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
    await expect(pathExists(writeTargetPath)).resolves.toBe(false);

    await preparePermissionScenario(page, bootstrapState, 'ask');
    await sendComposerMessage(page, directToAgent(bootstrapState.agentName, 'WRITE_FILE_ASK:'));
    await waitForHitlPrompt(page, PERMISSION_FLOW_TIMEOUT_MS);
    await respondToHitlPrompt(page, 'approve', PERMISSION_FLOW_TIMEOUT_MS);
    await waitForAssistantToken(page, 'E2E_WRITE_FILE_ASK_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(fs.readFile(writeTargetPath, 'utf8')).resolves.toContain('ASK_WRITE_OK');

    await preparePermissionScenario(page, bootstrapState, 'auto');
    await sendComposerMessage(page, directToAgent(bootstrapState.agentName, 'WRITE_FILE_AUTO:'));
    await waitForAssistantToken(page, 'E2E_WRITE_FILE_AUTO_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
    await expect(fs.readFile(writeTargetPath, 'utf8')).resolves.toContain('AUTO_WRITE_OK');
  });

  test('web_fetch follows the read/ask/auto matrix', async ({
    page,
    bootstrapState,
  }) => {
    await setAgentSystemPrompt(bootstrapState, buildWebFetchPermissionPrompt());

    await preparePermissionScenario(page, bootstrapState, 'read');
    await sendComposerMessage(page, directToAgent(bootstrapState.agentName, 'WEB_FETCH_READ:'));
    await waitForAssistantToken(page, 'E2E_WEB_FETCH_READ_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await waitForWorldIdle(page, PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();

    await preparePermissionScenario(page, bootstrapState, 'ask');
    await sendComposerMessage(page, directToAgent(bootstrapState.agentName, 'WEB_FETCH_ASK:'));
    await waitForAssistantToken(page, 'E2E_WEB_FETCH_ASK_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await waitForWorldIdle(page, PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();

    await preparePermissionScenario(page, bootstrapState, 'auto');
    await sendComposerMessage(page, directToAgent(bootstrapState.agentName, 'WEB_FETCH_AUTO:'));
    await waitForAssistantToken(page, 'E2E_WEB_FETCH_AUTO_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await waitForWorldIdle(page, PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
  });

  test('shell_cmd follows the read/ask/auto matrix', async ({
    page,
    bootstrapState,
  }) => {
    const deleteTargetPath = await resetWorkspaceFile(
      HITL_DELETE_TARGET,
      'Disposable file for real web E2E shell_cmd HITL approval coverage.\n',
    );
    await setAgentSystemPrompt(bootstrapState, buildShellPermissionPrompt());

    await preparePermissionScenario(page, bootstrapState, 'read');
    await sendComposerMessage(page, directToAgent(bootstrapState.agentName, 'SHELL_READ:'));
    await waitForAssistantToken(page, 'E2E_SHELL_READ_BLOCKED', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(pathExists(deleteTargetPath)).resolves.toBe(true);

    await preparePermissionScenario(page, bootstrapState, 'ask');
    await sendComposerMessage(page, directToAgent(bootstrapState.agentName, 'SHELL_ASK:'));
    await waitForHitlPrompt(page, PERMISSION_FLOW_TIMEOUT_MS);
    await respondToHitlPrompt(page, 'approve', PERMISSION_FLOW_TIMEOUT_MS);
    await waitForAssistantToken(page, 'E2E_SHELL_ASK_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await waitForWorldIdle(page, PERMISSION_FLOW_TIMEOUT_MS);

    await preparePermissionScenario(page, bootstrapState, 'auto');
    await sendComposerMessage(page, directToAgent(bootstrapState.agentName, 'SHELL_AUTO:'));
    await waitForAssistantToken(page, 'E2E_SHELL_AUTO_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await waitForWorldIdle(page, PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();

    await resetWorkspaceFile(
      HITL_DELETE_TARGET,
      'Disposable file for real web E2E shell_cmd HITL approval coverage.\n',
    );
    await preparePermissionScenario(page, bootstrapState, 'auto');
    await sendComposerMessage(page, directToAgent(bootstrapState.agentName, 'SHELL_RISKY_AUTO:'));
    await waitForHitlPrompt(page, PERMISSION_FLOW_TIMEOUT_MS);
    await respondToHitlPrompt(page, 'approve', PERMISSION_FLOW_TIMEOUT_MS);
    await waitForAssistantToken(page, 'E2E_SHELL_RISKY_AUTO_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await waitForWorldIdle(page, PERMISSION_FLOW_TIMEOUT_MS);
    await expect(pathExists(deleteTargetPath)).resolves.toBe(false);
  });

  test('create_agent blocks at read', async ({
    page,
    bootstrapState,
  }) => {
    await setAgentSystemPrompt(bootstrapState, buildCreateAgentPermissionPrompt());
    await preparePermissionScenario(page, bootstrapState, 'read');
    await sendComposerMessage(page, directToAgent(bootstrapState.agentName, 'CREATE_AGENT_READ:'));
    await waitForAssistantToken(page, 'E2E_CREATE_AGENT_READ_BLOCKED', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(getWorldAgentNames(bootstrapState)).resolves.not.toContain(CREATE_AGENT_ASK_NAME);
  });

  test('create_agent asks for approval and creates the agent at ask', async ({
    page,
    bootstrapState,
  }) => {
    await setAgentSystemPrompt(bootstrapState, buildCreateAgentPermissionPrompt());
    await preparePermissionScenario(page, bootstrapState, 'ask');
    await sendComposerMessage(page, directToAgent(bootstrapState.agentName, 'CREATE_AGENT_APPROVAL:'));
    await completeCreateAgentFlow(
      page,
      bootstrapState,
      'E2E_CREATE_AGENT_ASK_OK',
      CREATE_AGENT_ASK_NAME,
    );
  });

  test('create_agent keeps the approval flow at auto', async ({
    page,
    bootstrapState,
  }) => {
    await setAgentSystemPrompt(bootstrapState, buildCreateAgentPermissionPrompt());
    await preparePermissionScenario(page, bootstrapState, 'auto');
    await sendComposerMessage(page, directToAgent(bootstrapState.agentName, 'CREATE_AGENT_AUTO:'));
    await completeCreateAgentFlow(
      page,
      bootstrapState,
      'E2E_CREATE_AGENT_AUTO_OK',
      CREATE_AGENT_AUTO_NAME,
    );
  });

  test('load_skill blocks script execution at read', async ({
    page,
    bootstrapState,
  }) => {
    const markerPath = await resetWorkspaceFile(LOAD_SKILL_RUN_MARKER);
    await setAgentSystemPrompt(bootstrapState, buildLoadSkillPermissionPrompt());

    await reloadWorldWithPermission(page, bootstrapState, 'read');
    await sendComposerMessage(page, directToAgent(bootstrapState.agentName, 'LOAD_SKILL_READ:'));
    await waitForToolSummary(page, 'load_skill');
    await waitForWorldIdle(page, PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
    await expect(pathExists(markerPath)).resolves.toBe(false);
  });

  test('load_skill asks for approval before applying script-referencing skills at ask', async ({
    page,
    bootstrapState,
  }) => {
    await resetWorkspaceFile(LOAD_SKILL_RUN_MARKER);
    await setAgentSystemPrompt(bootstrapState, buildLoadSkillPermissionPrompt());

    await preparePermissionScenario(page, bootstrapState, 'ask');
    await sendComposerMessage(page, directToAgent(bootstrapState.agentName, 'LOAD_SKILL_ASK:'));
    await waitForHitlPrompt(page, PERMISSION_FLOW_TIMEOUT_MS);
    await respondToHitlPrompt(page, 'yes once', PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
    await waitForToolSummary(page, 'load_skill');
  });

  test('load_skill applies script-referencing skills without approval at auto', async ({
    page,
    bootstrapState,
  }) => {
    await setAgentSystemPrompt(bootstrapState, buildLoadSkillPermissionPrompt());

    await reloadWorldWithPermission(page, bootstrapState, 'auto');
    await sendComposerMessage(page, directToAgent(bootstrapState.agentName, 'LOAD_SKILL_AUTO:'));
    await waitForToolSummary(page, 'load_skill');
    await waitForAssistantToken(page, 'E2E_LOAD_SKILL_AUTO_OK', PERMISSION_FLOW_TIMEOUT_MS);
    await waitForWorldIdle(page, PERMISSION_FLOW_TIMEOUT_MS);
    await expect(page.getByTestId('hitl-prompt')).toBeHidden();
  });
});
