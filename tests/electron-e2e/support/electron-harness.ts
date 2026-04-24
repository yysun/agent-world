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
 * - 2026-04-11: Route Playwright launches through a CommonJS shim so the Electron E2E
 *   harness can load the compiled ESM desktop main entry with top-level `await`.
 * - 2026-03-24: Added `waitForAssistantTokenOrHitlPrompt` so Electron E2E flows can
 *   wait for either a resumed assistant reply or a chained follow-up approval prompt.
 * - 2026-03-24: Made `waitForAssistantToken` require a persisted non-user message in the active chat so tests do not mistake the user's own text for an assistant reply.
 * - 2026-03-24: Added a bounded Electron close helper with process-kill fallback so E2E teardown cannot hang indefinitely after the app finishes a turn.
 * - 2026-03-24: Added `setSeededAgentSystemPrompt` so Electron permission-matrix tests can
 *   swap the seeded agent prompt per tool family without recreating the app.
 * - 2026-03-13: Prunes stale `run-*` workspace directories before bootstrapping new Electron
 *   E2E runs so late-suite launches do not degrade under temp-directory buildup.
 * - 2026-03-12: Hardened seeded-world selection against dropdown re-render detaches and made launch preparation wait for the seeded agent before continuing.
 * - 2026-03-10: Added initial helper set for the real Electron Playwright E2E harness.
 * - 2026-03-10: Switched workspace bootstrapping to per-run isolated directories to avoid SQLite/user-data lock collisions.
 * - 2026-03-12: Added `setDesktopToolPermission` helper to update tool_permission env key via the preload bridge.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { resolveCreatedSessionId } from './session-resolution.js';
import { pruneWorkspaceRuns } from './workspace-pruning.js';
import { isRetryableWorldSelectionError, isTargetWorldSelected } from './world-selection.js';
import {
  TEST_AGENT_NAME,
  createSeededAgentPayload,
} from './seeded-agent.js';

const execFileAsync = promisify(execFile);
const ELECTRON_E2E_QUEUE_NO_RESPONSE_FALLBACK_MS = process.env.AGENT_WORLD_QUEUE_NO_RESPONSE_FALLBACK_MS || '5000';
const WORLD_SELECTION_TIMEOUT_MS = 15_000;
const WORLD_SELECTION_MAX_ATTEMPTS = 4;
const ELECTRON_CLOSE_TIMEOUT_MS = 10_000;
export const TEST_WORLD_ID = 'e2e-test';
export const TEST_WORLD_NAME = 'e2e-test';
export const TEST_WORKSPACE_ROOT = path.resolve(process.cwd(), '.tmp', 'electron-playwright-workspace');
export const CHAT_NAMES = {
  current: 'Loaded Current Chat',
  switched: 'Switched Chat',
};

export function resolveElectronExecutablePath(
  electronPackageRoot: string = path.resolve(process.cwd(), 'electron/node_modules/electron'),
  options: {
    existsSync?: (targetPath: string) => boolean;
    readFileSync?: (targetPath: string, encoding: BufferEncoding) => string;
    overrideDistPath?: string | undefined;
  } = {},
): string {
  const existsSync = options.existsSync ?? fs.existsSync;
  const readFileSync = options.readFileSync ?? fs.readFileSync;
  const pathFile = path.join(electronPackageRoot, 'path.txt');
  const executableName = existsSync(pathFile)
    ? readFileSync(pathFile, 'utf8').trim()
    : '';

  if (!executableName) {
    throw new Error('Electron failed to install correctly for desktop E2E. Missing electron/path.txt executable entry.');
  }

  const overrideDistPath = String(
    options.overrideDistPath ?? process.env.ELECTRON_OVERRIDE_DIST_PATH ?? '',
  ).trim();
  if (overrideDistPath) {
    return path.join(overrideDistPath, executableName);
  }

  return path.join(electronPackageRoot, 'dist', executableName);
}

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
  agentNames: string[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildHitlButtonLabelCandidates(optionLabel: string): string[] {
  const trimmed = String(optionLabel || '').trim();
  if (!trimmed) {
    return [];
  }

  const lower = trimmed.toLowerCase();
  const candidates = new Set<string>([trimmed, lower]);

  if (lower === 'approve') {
    candidates.add('approve');
    candidates.add('yes');
  }

  if (lower === 'deny' || lower === 'decline' || lower === 'dismiss') {
    candidates.add('deny');
    candidates.add('decline');
    candidates.add('dismiss');
    candidates.add('no');
  }

  return [...candidates];
}

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

export function getActiveWorkspacePath(): string {
  return requireActiveWorkspacePath();
}

function isSqliteBusyBootstrapError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('SQLITE_BUSY');
}

export async function bootstrapWorkspace(): Promise<void> {
  requireGoogleApiKey();
  fs.mkdirSync(TEST_WORKSPACE_ROOT, { recursive: true });
  pruneWorkspaceRuns(TEST_WORKSPACE_ROOT);
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
            AGENT_WORLD_QUEUE_NO_RESPONSE_FALLBACK_MS: ELECTRON_E2E_QUEUE_NO_RESPONSE_FALLBACK_MS,
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
  const electronLauncherEntryPath = path.resolve(
    process.cwd(),
    'tests/electron-e2e/support/electron-main-launcher.cjs',
  );

  return {
    executablePath: resolveElectronExecutablePath(),
    args: [
      electronLauncherEntryPath,
      `--workspace=${workspacePath}`,
    ],
    env: {
      ...process.env,
      AGENT_WORLD_STORAGE_TYPE: 'sqlite',
      AGENT_WORLD_DATA_PATH: workspacePath,
      AGENT_WORLD_PROJECT_PATH: workspacePath,
      AGENT_WORLD_WORKSPACE_PATH: workspacePath,
      AGENT_WORLD_QUEUE_NO_RESPONSE_FALLBACK_MS: ELECTRON_E2E_QUEUE_NO_RESPONSE_FALLBACK_MS,
      AGENT_WORLD_E2E_DISABLE_SINGLE_INSTANCE: 'true',
      AGENT_WORLD_E2E_USER_DATA_PATH: electronUserDataPath,
    },
  };
}

export async function waitForAppShell(page: Page): Promise<void> {
  await page.getByTestId('world-selector').waitFor({ state: 'visible' });
}

async function listAvailableWorldIds(page: Page): Promise<string[]> {
  return await page.evaluate(async () => {
    const api = (window as any).agentWorldDesktop;
    const worlds = await api.listWorlds();
    return Array.isArray(worlds)
      ? worlds
        .map((world: any) => String(world?.id || '').trim())
        .filter(Boolean)
      : [];
  });
}

async function readWorldSelectorLabel(page: Page): Promise<string> {
  return await page.getByTestId('world-selector').innerText();
}

async function waitForSeededWorldList(page: Page): Promise<void> {
  await expect.poll(async () => {
    return await listAvailableWorldIds(page);
  }, {
    timeout: WORLD_SELECTION_TIMEOUT_MS,
    message: `Expected seeded world "${TEST_WORLD_ID}" to be available in the Electron world list.`,
  }).toContain(TEST_WORLD_ID);
}

async function waitForSeededAgent(page: Page): Promise<void> {
  await expect.poll(async () => {
    return await page.evaluate(async (worldId: string) => {
      const api = (window as any).agentWorldDesktop;
      const result = await api.loadWorld(worldId);
      return Array.isArray(result?.world?.agents)
        ? result.world.agents
          .map((agent: any) => String(agent?.name || '').trim())
          .filter(Boolean)
        : [];
    }, TEST_WORLD_ID);
  }, {
    timeout: WORLD_SELECTION_TIMEOUT_MS,
    message: `Expected seeded agent "${TEST_AGENT_NAME}" to exist before continuing with Electron E2E steps.`,
  }).toContain(TEST_AGENT_NAME);
}

async function ensureSeededAgent(page: Page): Promise<void> {
  const state = await getDesktopState(page);
  if (!state.worldId) {
    throw new Error('Unable to resolve the current world while ensuring the seeded test agent.');
  }

  await page.evaluate(
    async ({ worldId, existingAgentIds, payload }) => {
      const api = (window as any).agentWorldDesktop;
      for (const agentId of existingAgentIds) {
        await api.deleteAgent(worldId, agentId);
      }
      await api.createAgent(worldId, payload);
    },
    {
      worldId: state.worldId,
      existingAgentIds: state.agentIds,
      payload: createSeededAgentPayload(),
    },
  );

  await reloadSeededWorld(page);
  await expect.poll(async () => (await getDesktopState(page)).agentNames, {
    timeout: WORLD_SELECTION_TIMEOUT_MS,
    message: `Expected seeded agent "${TEST_AGENT_NAME}" to be visible in the loaded Electron world state.`,
  }).toContain(TEST_AGENT_NAME);
  await expect(
    page.getByRole('button', { name: `Edit agent ${TEST_AGENT_NAME}` }),
  ).toBeVisible({ timeout: WORLD_SELECTION_TIMEOUT_MS });
}

export async function selectSeededWorld(page: Page): Promise<void> {
  await waitForSeededWorldList(page);

  if (isTargetWorldSelected(await readWorldSelectorLabel(page), TEST_WORLD_NAME)) {
    return;
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < WORLD_SELECTION_MAX_ATTEMPTS; attempt += 1) {
    await page.getByTestId('world-selector').click();
    const worldItem = page.getByTestId(`world-item-${TEST_WORLD_ID}`);
    await worldItem.waitFor({ state: 'visible', timeout: WORLD_SELECTION_TIMEOUT_MS });

    try {
      await worldItem.click();
      await expect(page.getByTestId('world-selector')).toContainText(TEST_WORLD_NAME, {
        timeout: WORLD_SELECTION_TIMEOUT_MS,
      });
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableWorldSelectionError(error)) {
        throw error;
      }
      await page.keyboard.press('Escape').catch(() => { });
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to select seeded world "${TEST_WORLD_ID}" after ${WORLD_SELECTION_MAX_ATTEMPTS} attempts.`);
}

async function reloadSeededWorld(page: Page): Promise<void> {
  await waitForSeededWorldList(page);

  let lastError: unknown = null;
  for (let attempt = 0; attempt < WORLD_SELECTION_MAX_ATTEMPTS; attempt += 1) {
    await page.getByTestId('world-selector').click();
    const worldItem = page.getByTestId(`world-item-${TEST_WORLD_ID}`);
    await worldItem.waitFor({ state: 'visible', timeout: WORLD_SELECTION_TIMEOUT_MS });

    try {
      await worldItem.click();
      await expect(page.getByTestId('world-selector')).toContainText(TEST_WORLD_NAME, {
        timeout: WORLD_SELECTION_TIMEOUT_MS,
      });
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableWorldSelectionError(error)) {
        throw error;
      }
      await page.keyboard.press('Escape').catch(() => { });
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to reload seeded world "${TEST_WORLD_ID}" after ${WORLD_SELECTION_MAX_ATTEMPTS} attempts.`);
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
      agentNames: Array.isArray(result?.world?.agents)
        ? result.world.agents
          .map((agent: any) => String(agent?.name || '').trim())
          .filter(Boolean)
        : [],
    };
  });
}

export async function createNewSession(page: Page): Promise<string> {
  const previousState = await getDesktopState(page);
  const previousSessionIds = previousState.sessions.map((session) => String(session.id || '').trim()).filter(Boolean);

  await page.getByLabel('Create new session').click();
  await expectNotificationText(page, 'Chat session created');
  let currentChatId = '';
  await expect.poll(async () => {
    currentChatId = resolveCreatedSessionId(previousSessionIds, await getDesktopState(page));
    return currentChatId;
  }, {
    timeout: 15_000,
    message: 'Expected the newly created chat session to become available.',
  }).not.toBe('');

  if (!currentChatId) {
    throw new Error('Expected a selected current chat after creating a new session.');
  }

  await page.getByTestId(`session-item-${currentChatId}`).waitFor({ state: 'visible' });
  await expect.poll(async () => (await getDesktopState(page)).currentChatId, {
    timeout: 15_000,
    message: 'Expected the newly created session to become the active selected chat.',
  }).toBe(currentChatId);

  return currentChatId;
}

export async function selectSessionByName(page: Page, name: string): Promise<void> {
  const state = await getDesktopState(page);
  const chatId = state.sessionIdsByName[name];
  if (!chatId) {
    throw new Error(`Session "${name}" was not found in the current world.`);
  }
  await page.getByTestId(`session-item-${chatId}`).click();
  await expect.poll(async () => (await getDesktopState(page)).currentChatId, {
    timeout: 15_000,
    message: `Expected session "${name}" to become selected.`,
  }).toBe(chatId);
}

export async function sendComposerMessage(page: Page, content: string): Promise<void> {
  await page.getByLabel('Message input').fill(content);
  await page.getByLabel('Send message').click();
}

async function hasPersistedAssistantToken(page: Page, token: string): Promise<boolean> {
  const state = await getDesktopState(page);
  if (!state.worldId || !state.currentChatId) {
    return false;
  }

  return await page.evaluate(
    async ({ worldId, chatId, token }) => {
      const api = (window as any).agentWorldDesktop;
      const messages = await api.getMessages(worldId, chatId);
      if (!Array.isArray(messages)) {
        return false;
      }

      return messages.some((message: any) => {
        const content = String(message?.content || '');
        if (!content.includes(token)) {
          return false;
        }

        const role = String(message?.role || '').trim().toLowerCase();
        const sender = String(message?.sender || '').trim().toLowerCase();
        if (role === 'user') {
          return false;
        }
        if (!role && (sender === 'human' || sender === 'user')) {
          return false;
        }
        return true;
      });
    },
    { worldId: state.worldId, chatId: state.currentChatId, token },
  );
}

export async function waitForAssistantToken(page: Page, token: string, timeoutMs?: number): Promise<void> {
  const resolvedTimeoutMs = timeoutMs ?? 15_000;
  await expect.poll(
    async () => await hasPersistedAssistantToken(page, token),
    {
      timeout: resolvedTimeoutMs,
      message: `Expected a persisted non-user message containing "${token}" in the active Electron chat.`,
    },
  ).toBe(true);

  await page.getByLabel('Send message').waitFor({ state: 'visible', timeout: resolvedTimeoutMs });
}

export async function waitForPersistedAssistantToken(page: Page, token: string, timeoutMs?: number): Promise<void> {
  const resolvedTimeoutMs = timeoutMs ?? 15_000;
  await expect.poll(
    async () => await hasPersistedAssistantToken(page, token),
    {
      timeout: resolvedTimeoutMs,
      message: `Expected a persisted non-user message containing "${token}" in the active Electron chat.`,
    },
  ).toBe(true);
}

export async function waitForAssistantTokenOrHitlPrompt(
  page: Page,
  token: string,
  timeoutMs?: number,
): Promise<'assistant' | 'hitl'> {
  const resolvedTimeoutMs = timeoutMs ?? 15_000;
  let observedState: 'waiting' | 'assistant' | 'hitl' = 'waiting';

  await expect.poll(
    async () => {
      if (await hasPersistedAssistantToken(page, token)) {
        observedState = 'assistant';
        return observedState;
      }

      const promptVisible = await page.getByTestId('hitl-prompt').isVisible().catch(() => false);
      if (promptVisible) {
        observedState = 'hitl';
        return observedState;
      }

      observedState = 'waiting';
      return observedState;
    },
    {
      timeout: resolvedTimeoutMs,
      message: `Expected either a persisted assistant message containing "${token}" or a HITL prompt in the active Electron chat.`,
    },
  ).not.toBe('waiting');

  return observedState === 'assistant' ? 'assistant' : 'hitl';
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

export async function respondToHitlPrompt(page: Page, optionLabel: string = 'Approve', timeoutMs?: number): Promise<void> {
  const prompt = await waitForHitlPrompt(page, timeoutMs);
  for (const candidate of buildHitlButtonLabelCandidates(optionLabel)) {
    const button = prompt.getByRole('button', { name: new RegExp(`^${escapeRegExp(candidate)}$`, 'i') }).first();
    if (await button.count()) {
      await button.click();
      return;
    }
  }

  throw new Error(`Unable to find HITL option button for "${optionLabel}".`);
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

export async function waitForQueueToDrain(page: Page, timeoutMs: number = 15_000): Promise<void> {
  await expect.poll(async () => {
    const state = await getDesktopState(page);
    if (!state.worldId || !state.currentChatId) {
      return 'missing-chat';
    }

    return await page.evaluate(async ({ worldId, chatId }) => {
      const api = (window as any).agentWorldDesktop;
      const queuedMessages = await api.getQueuedMessages(worldId, chatId);
      return Array.isArray(queuedMessages)
        ? queuedMessages.filter((entry: any) => {
          const status = String(entry?.status || '').trim().toLowerCase();
          return status === 'queued' || status === 'sending';
        }).length
        : 0;
    }, { worldId: state.worldId, chatId: state.currentChatId });
  }, {
    timeout: timeoutMs,
    message: 'Expected the Electron message queue to drain before continuing.',
  }).toBe(0);
}

export async function clearCurrentChatQueue(page: Page): Promise<void> {
  const state = await getDesktopState(page);
  if (!state.worldId || !state.currentChatId) {
    throw new Error('Unable to resolve the current world/chat for queue cleanup.');
  }

  await page.evaluate(async ({ worldId, chatId }) => {
    const api = (window as any).agentWorldDesktop;
    await api.clearQueue(worldId, chatId);
  }, { worldId: state.worldId, chatId: state.currentChatId });
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
  await ensureSeededAgent(page);
  await waitForSeededAgent(page);
}

export async function closeElectronApp(app: ElectronApplication): Promise<void> {
  let closeError: unknown = null;
  const closeResult = await Promise.race([
    app.close()
      .then(() => 'closed' as const)
      .catch((error) => {
        closeError = error;
        return 'error' as const;
      }),
    new Promise<'timeout'>((resolve) => {
      setTimeout(() => resolve('timeout'), ELECTRON_CLOSE_TIMEOUT_MS);
    }),
  ]);

  if (closeResult === 'closed') {
    return;
  }

  if (closeResult === 'error') {
    throw closeError instanceof Error ? closeError : new Error(String(closeError));
  }

  const childProcess = app.process();
  if (typeof childProcess?.kill === 'function' && !childProcess.killed) {
    try {
      childProcess.kill('SIGKILL');
    } catch {
      // Fall through and rely on Playwright close-event wait below.
    }
  }

  await app.waitForEvent('close', { timeout: 5_000 }).catch(() => undefined);
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

export async function setSeededAgentSystemPrompt(page: Page, systemPrompt: string): Promise<void> {
  const state = await getDesktopState(page);
  const agentId = String(state.agentIds[0] || '').trim();
  if (!state.worldId || !agentId) {
    throw new Error('Unable to resolve the seeded agent for system prompt update.');
  }

  await page.evaluate(
    async ({ worldId, agentId, systemPrompt }) => {
      const api = (window as any).agentWorldDesktop;
      await api.updateAgent(worldId, agentId, { systemPrompt });
    },
    { worldId: state.worldId, agentId, systemPrompt },
  );
}
