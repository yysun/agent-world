/**
 * Shared Electron Playwright helpers for the real desktop E2E suite.
 *
 * Purpose:
 * - Provide bootstrap, launch, and real-bridge helper utilities for Electron Playwright tests.
 *
 * Key Features:
 * - Bootstraps a dedicated workspace in a child process before each test.
 * - Launches the compiled Electron app against that workspace.
 * - Exposes high-level helpers for session selection, composer sends, edits, queue setup, and HITL handling.
 *
 * Implementation Notes:
 * - Helpers may use the real preload bridge for test setup when the UI has no direct control.
 * - Assertions still target visible desktop behavior in the actual Electron window.
 *
 * Recent Changes:
 * - 2026-03-10: Added initial helper set for the real Electron Playwright E2E harness.
 * - 2026-03-10: Switched workspace bootstrapping to per-run isolated directories to avoid SQLite/user-data lock collisions.
 * - 2026-03-12: Added `setDesktopToolPermission` helper to update tool_permission env key via the preload bridge.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import type { ElectronApplication, Locator, Page } from '@playwright/test';

const execFileAsync = promisify(execFile);
const electronWorkspaceRequire = createRequire(path.resolve(process.cwd(), 'electron/package.json'));

export const TEST_WORLD_ID = 'e2e-test';
export const TEST_WORLD_NAME = 'e2e-test';
export const TEST_WORKSPACE_ROOT = path.resolve(process.cwd(), '.tmp', 'electron-playwright-workspace');
export const CHAT_NAMES = {
  current: 'Loaded Current Chat',
  switched: 'Switched Chat',
};

let activeWorkspacePath = '';

type SessionSummary = {
  id: string;
  name: string;
};

type DesktopState = {
  worldId: string;
  currentChatId: string;
  sessionIdsByName: Record<string, string>;
  sessions: SessionSummary[];
  agentIds: string[];
};

function requireGoogleApiKey(): void {
  if (String(process.env.GOOGLE_API_KEY || '').trim()) {
    return;
  }
  throw new Error(
    'GOOGLE_API_KEY is required for Electron desktop E2E. Set it in your environment or .env before running `npm run test:electron:e2e`.'
  );
}

function createWorkspaceRunPath(): string {
  return path.join(TEST_WORKSPACE_ROOT, `run-${Date.now()}-${randomUUID()}`);
}

function requireActiveWorkspacePath(): string {
  if (!activeWorkspacePath) {
    throw new Error('Electron E2E workspace has not been bootstrapped for this test run.');
  }
  return activeWorkspacePath;
}

function isSqliteBusyBootstrapError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('SQLITE_BUSY');
}

export async function bootstrapWorkspace(): Promise<void> {
  requireGoogleApiKey();
  fs.mkdirSync(TEST_WORKSPACE_ROOT, { recursive: true });
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    activeWorkspacePath = createWorkspaceRunPath();
    fs.mkdirSync(activeWorkspacePath, { recursive: true });

    try {
      await execFileAsync(
        process.execPath,
        ['--import', 'tsx', 'tests/electron-e2e/support/bootstrap-real-world.ts', activeWorkspacePath],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            AGENT_WORLD_STORAGE_TYPE: 'sqlite',
            AGENT_WORLD_DATA_PATH: activeWorkspacePath,
            AGENT_WORLD_PROJECT_PATH: activeWorkspacePath,
            AGENT_WORLD_WORKSPACE_PATH: activeWorkspacePath,
            AGENT_WORLD_QUEUE_NO_RESPONSE_FALLBACK_MS: process.env.AGENT_WORLD_QUEUE_NO_RESPONSE_FALLBACK_MS || '250',
          },
        },
      );
      return;
    } catch (error) {
      lastError = error;
      if (!isSqliteBusyBootstrapError(error) || attempt === 2) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function getElectronLaunchOptions(): {
  args: string[];
  executablePath: string;
  env: NodeJS.ProcessEnv;
} {
  requireGoogleApiKey();
  const workspacePath = requireActiveWorkspacePath();
  const electronUserDataPath = path.join(workspacePath, '.electron-user-data');

  return {
    executablePath: electronWorkspaceRequire('electron'),
    args: [
      path.resolve(process.cwd(), 'electron'),
      `--workspace=${workspacePath}`,
    ],
    env: {
      ...process.env,
      AGENT_WORLD_STORAGE_TYPE: 'sqlite',
      AGENT_WORLD_DATA_PATH: workspacePath,
      AGENT_WORLD_PROJECT_PATH: workspacePath,
      AGENT_WORLD_WORKSPACE_PATH: workspacePath,
      AGENT_WORLD_QUEUE_NO_RESPONSE_FALLBACK_MS: process.env.AGENT_WORLD_QUEUE_NO_RESPONSE_FALLBACK_MS || '250',
      AGENT_WORLD_E2E_DISABLE_SINGLE_INSTANCE: 'true',
      AGENT_WORLD_E2E_USER_DATA_PATH: electronUserDataPath,
    },
  };
}

export async function waitForAppShell(page: Page): Promise<void> {
  await page.getByTestId('world-selector').waitFor({ state: 'visible' });
}

export async function selectSeededWorld(page: Page): Promise<void> {
  await page.getByTestId('world-selector').click();
  await page.getByTestId(`world-item-${TEST_WORLD_ID}`).click();
  await page.getByText(TEST_WORLD_NAME, { exact: true }).first().waitFor({ state: 'visible' });
}

export async function getDesktopState(page: Page): Promise<DesktopState> {
  return await page.evaluate(async () => {
    const api = (window as any).agentWorldDesktop;
    const worlds = await api.listWorlds();
    const targetWorld = Array.isArray(worlds)
      ? worlds.find((entry: any) => String(entry?.id || '').trim() === 'e2e-test') || worlds[0]
      : null;
    if (!targetWorld?.id) {
      throw new Error('e2e-test world is not available in the desktop app.');
    }

    const result = await api.loadWorld(targetWorld.id);
    const sessions = Array.isArray(result?.sessions) ? result.sessions : [];
    const sessionIdsByName = sessions.reduce((acc: Record<string, string>, session: any) => {
      const name = String(session?.name || '').trim();
      const id = String(session?.id || '').trim();
      if (name && id) {
        acc[name] = id;
      }
      return acc;
    }, {});

    // Read current chat ID from the visible chat header title attribute
    // (format: "Click to copy chat ID: <chatId>") since serializeWorldInfo
    // does not include currentChatId.
    let currentChatId = '';
    const chatHeaderEl = document.querySelector('[title*="Click to copy chat ID:"]');
    if (chatHeaderEl) {
      const titleAttr = chatHeaderEl.getAttribute('title') || '';
      const match = titleAttr.match(/chat ID:\s*(\S+)/);
      if (match) {
        currentChatId = match[1];
      }
    }

    return {
      worldId: String(result?.world?.id || targetWorld.id || '').trim(),
      currentChatId,
      sessionIdsByName,
      sessions: sessions.map((session: any) => ({
        id: String(session?.id || '').trim(),
        name: String(session?.name || '').trim(),
      })),
      agentIds: Array.isArray(result?.world?.agents)
        ? result.world.agents
          .map((agent: any) => String(agent?.id || '').trim())
          .filter(Boolean)
        : [],
    };
  });
}

export async function createNewSession(page: Page): Promise<string> {
  await page.getByLabel('Create new session').click();
  await expectNotificationText(page, 'Chat session created');
  await page.getByText('New Chat', { exact: true }).first().waitFor({ state: 'visible' });
  const state = await getDesktopState(page);
  const currentChatId = String(state.currentChatId || '').trim()
    || String(state.sessionIdsByName['New Chat'] || '').trim();
  if (!currentChatId) {
    throw new Error('Expected a selected current chat after creating a new session.');
  }
  return currentChatId;
}

export async function selectSessionByName(page: Page, name: string): Promise<void> {
  const state = await getDesktopState(page);
  const chatId = state.sessionIdsByName[name];
  if (!chatId) {
    throw new Error(`Session "${name}" was not found in the current world.`);
  }
  await page.getByTestId(`session-item-${chatId}`).click();
}

export async function sendComposerMessage(page: Page, content: string): Promise<void> {
  await page.getByLabel('Message input').fill(content);
  await page.getByLabel('Send message').click();
}

export async function waitForAssistantToken(page: Page, token: string, timeoutMs?: number): Promise<void> {
  const opts: { state: 'visible'; timeout?: number } = { state: 'visible' };
  if (timeoutMs) opts.timeout = timeoutMs;
  await page.getByText(token, { exact: false }).last().waitFor(opts);
  await page.getByLabel('Send message').waitFor(opts);
}

export async function expectNotificationText(page: Page, text: string): Promise<void> {
  await page.getByTestId('working-status-notification').getByText(text, { exact: false }).waitFor({ state: 'visible' });
}

export async function expectSystemStatusText(page: Page, text: string): Promise<void> {
  await page.getByTestId('working-status-system').getByText(text, { exact: false }).waitFor({ state: 'visible' });
}

export async function clickLatestUserEditButton(page: Page): Promise<void> {
  const button = page.getByLabel('Edit message').last();
  await button.click({ force: true });
}

export async function editLatestUserMessage(page: Page, nextText: string): Promise<void> {
  await clickLatestUserEditButton(page);
  const editor = page.getByPlaceholder('Edit your message...');
  await editor.fill(nextText);
  await page.getByRole('button', { name: 'Save' }).click();
}

export async function deleteLatestUserMessage(page: Page): Promise<void> {
  // Override window.confirm to auto-accept before clicking; Electron's native confirm
  // dialog does not reliably fire Playwright's 'dialog' event in all configurations.
  await page.evaluate(() => { (window as any).confirm = () => true; });
  const button = page.getByLabel('Delete message').last();
  await button.click({ force: true });
}

export async function saveEmptyEditForError(page: Page): Promise<void> {
  await clickLatestUserEditButton(page);
  const editor = page.getByPlaceholder('Edit your message...');
  await editor.fill('   ');
  await page.getByRole('button', { name: 'Save' }).click();
}

export async function waitForHitlPrompt(page: Page, timeoutMs?: number): Promise<Locator> {
  const prompt = page.getByTestId('hitl-prompt');
  await prompt.waitFor({ state: 'visible', ...(timeoutMs ? { timeout: timeoutMs } : {}) });
  return prompt;
}

export async function respondToHitlPrompt(page: Page, optionLabel: 'Approve' | 'Decline' = 'Approve', timeoutMs?: number): Promise<void> {
  const prompt = await waitForHitlPrompt(page, timeoutMs);
  await prompt.getByRole('button', { name: optionLabel }).click();
}

export async function addQueueMessageToCurrentChat(page: Page, content: string): Promise<void> {
  const state = await getDesktopState(page);
  if (!state.worldId || !state.currentChatId) {
    throw new Error('Unable to resolve the current world/chat for queue setup.');
  }

  await page.evaluate(async ({ worldId, chatId, content }) => {
    const api = (window as any).agentWorldDesktop;
    await api.addToQueue(worldId, chatId, content, 'human');
  }, { worldId: state.worldId, chatId: state.currentChatId, content });
}

export async function pauseCurrentChatQueue(page: Page): Promise<void> {
  const state = await getDesktopState(page);
  if (!state.worldId || !state.currentChatId) {
    throw new Error('Unable to resolve the current world/chat for queue pause.');
  }

  await page.evaluate(async ({ worldId, chatId }) => {
    const api = (window as any).agentWorldDesktop;
    await api.pauseChatQueue(worldId, chatId);
  }, { worldId: state.worldId, chatId: state.currentChatId });
}

export async function deleteAllAgents(page: Page): Promise<void> {
  // Wait for any active processing to complete before deleting agents
  await page.getByLabel('Send message').waitFor({ state: 'visible', timeout: 30_000 });
  const state = await getDesktopState(page);
  await page.evaluate(async ({ worldId, agentIds }) => {
    const api = (window as any).agentWorldDesktop;
    for (const agentId of agentIds) {
      await api.deleteAgent(worldId, agentId);
    }
  }, { worldId: state.worldId, agentIds: state.agentIds });
}

export async function waitForQueuePanel(page: Page): Promise<Locator> {
  const panel = page.getByTestId('message-queue-panel');
  await panel.waitFor({ state: 'visible' });
  return panel;
}

export async function waitForQueueStatus(page: Page, statusLabel: 'Queued' | 'Processing' | 'Error'): Promise<void> {
  await page.getByLabel(`Status: ${statusLabel}`).waitFor({ state: 'visible' });
}

export async function launchAndPrepare(page: Page): Promise<void> {
  await waitForAppShell(page);
  await selectSeededWorld(page);
}

export async function closeElectronApp(app: ElectronApplication): Promise<void> {
  await app.close();
}

export async function setDesktopToolPermission(
  page: Page,
  level: 'read' | 'ask' | 'auto',
): Promise<void> {
  const state = await getDesktopState(page);
  if (!state.worldId) {
    throw new Error('Unable to resolve the current world ID for tool permission update.');
  }

  await page.evaluate(
    async ({ worldId, permissionLevel }) => {
      const api = (window as any).agentWorldDesktop;
      const result = await api.loadWorld(worldId);
      const currentVariables = String(result?.world?.variables ?? '');
      const filtered = currentVariables
        .split('\n')
        .filter((line: string) => !line.trim().startsWith('tool_permission='));
      const nextVariables = permissionLevel === 'auto'
        ? filtered.join('\n').trim()
        : [...filtered, `tool_permission=${permissionLevel}`].join('\n').trim();
      await api.updateWorld(worldId, { variables: nextVariables });
    },
    { worldId: state.worldId, permissionLevel: level },
  );
}
