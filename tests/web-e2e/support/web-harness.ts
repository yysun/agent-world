/**
 * Shared Playwright helpers for the real web browser E2E suite.
 *
 * Purpose:
 * - Provide bootstrap, API reset, and browser helper utilities for real web E2E tests.
 *
 * Key Features:
 * - Resets a dedicated `e2e-test-web` world over the live HTTP API before each test.
 * - Seeds two chats for current/switch category coverage.
 * - Exposes browser helpers for world navigation, chat switching, message sends, edits, HITL, and error-path setup.
 *
 * Implementation Notes:
 * - The local server stays running across tests, so resets happen through the real API instead of separate SQLite writers.
 * - Home-page helpers now use the real search + centered-card flow so browser tests cover the primary world-entry affordance.
 * - The dev web server does not reliably deep-link arbitrary SPA paths during Playwright startup, so world entry can still fall back to direct URLs when needed.
 * - Assertions still target visible browser behavior in the actual web app.
 *
 * Recent Changes:
 * - 2026-03-11: Added home-page search/card helpers so smoke tests exercise the new search-driven world-entry flow.
 * - 2026-03-11: Added API-level world-idle polling so chat creation and agent teardown do not race
 *   the final backend persistence step after assistant text appears in the UI.
 * - 2026-03-11: Made createNewChat wait on the real chat-create API response and world refresh so tests follow the app's
 *   empty-chat reuse contract instead of assuming sidebar count growth.
 * - 2026-03-11: Stopped coupling assistant-token assertions to composer idle state so follow-up mutation tests do not fail while the Busy indicator is still draining.
 * - 2026-03-11: Tightened delete confirmation lookup to target the modal button only.
 * - 2026-03-10: Added initial helper set for Playwright web E2E coverage.
 * - 2026-03-10: Added deleteLatestMessage, deleteChatById, waitForTokenGone, and getConversationMessageCount helpers.
 * - 2026-03-10: Added optional timeoutMs parameter to waitForAssistantToken, waitForHitlPrompt, and respondToHitlPrompt
 *   to match the Electron harness HITL pattern and provide robust 60 s timeouts for real-LLM HITL flows.
 * - 2026-03-10: Fixed deleteLatestMessage to handle SSE race where handleStreamStart filters the user message before
 *   its messageId-confirmation event arrives. When no enabled delete button is found in the live DOM, the helper
 *   reloads the world page so messages are restored from the backend DB, then retries.
 * - 2026-03-12: Added a deterministic slow-shell prompt path and tool-summary wait helpers for live web shell status E2E coverage.
 * - 2026-03-12: Added `setWorldToolPermission` helper to update the world-level tool_permission env key via the REST API.
 */

import fs from 'node:fs';
import path from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';

export const TEST_WORLD_NAME = 'e2e-test-web';
export const TEST_AGENT_NAME = 'e2e-google';
export const TEST_WORKSPACE_PATH = path.resolve(process.cwd(), '.tmp', 'web-playwright-workspace');
export const HITL_DELETE_TARGET = '.e2e-hitl-delete-me.txt';
export const HITL_SHELL_SUCCESS_MARKER = 'E2E_SHELL_OK';
export const HITL_SHELL_SUCCESS_TOKEN = `E2E_SHELL_OK: ${HITL_DELETE_TARGET}`;
export const SLOW_SHELL_SCRIPT_NAME = 'slow-delete.mjs';

const API_BASE_URL = 'http://127.0.0.1:3000/api';

export type WebBootstrapState = {
  worldName: string;
  currentChatId: string;
  agentName: string;
};

type WorldSummary = {
  name?: string;
};

type AgentSummary = {
  name?: string;
};

type ChatSummary = {
  id?: string;
  name?: string;
};

type WorldStatus = {
  isProcessing?: boolean;
};

const COMPOSER_ACTION_RETRY_COUNT = 3;
const COMPOSER_ACTION_SETTLE_TIMEOUT_MS = 1_500;

function requireGoogleApiKey(): void {
  if (String(process.env.GOOGLE_API_KEY || '').trim()) {
    return;
  }
  throw new Error(
    'GOOGLE_API_KEY is required for web browser E2E. Set it in your environment or .env before running `npm run test:web:e2e`.',
  );
}

function ensureWorkspaceArtifacts(): void {
  fs.mkdirSync(TEST_WORKSPACE_PATH, { recursive: true });
  fs.writeFileSync(
    path.join(TEST_WORKSPACE_PATH, HITL_DELETE_TARGET),
    'Disposable file for real web E2E shell_cmd HITL approval coverage.\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(TEST_WORKSPACE_PATH, SLOW_SHELL_SCRIPT_NAME),
    [
      "import { promises as fs } from 'node:fs';",
      '',
      'const target = process.argv[2];',
      'if (!target) {',
      "  throw new Error('Missing target path');",
      '}',
      '',
      'await new Promise((resolve) => setTimeout(resolve, 2000));',
      'await fs.unlink(target);',
    ].join('\n'),
    'utf8',
  );
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getEncodedWorldNameFromUrl(url: string): string | null {
  const match = url.match(/\/World\/([^/?#]+)/);
  return match ? match[1] : null;
}

async function waitForWorldApiIdle(worldName: string, timeoutMs: number = 15_000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await apiRequest<WorldStatus>(`/worlds/${encodeURIComponent(worldName)}/status`);
    if (!status?.isProcessing) {
      return;
    }
    await wait(250);
  }

  throw new Error(`Timed out waiting for world '${worldName}' API status to become idle.`);
}

async function fetchWithTimeout(input: string, init?: RequestInit, timeoutMs: number = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function waitForApiReady(retries: number = 20): Promise<void> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout('http://127.0.0.1:3000/health', undefined, 2_000);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Health check returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await wait(500);
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function apiRequest<T>(requestPath: string, init?: RequestInit, retries: number = 3): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}${requestPath}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API ${init?.method || 'GET'} ${requestPath} failed with ${response.status}: ${text}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await response.json() as T;
      }

      return await response.text() as T;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('SQLITE_BUSY') && !message.includes('fetch')) {
        throw error;
      }
      await wait(250 * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function buildWorldVariables(): string {
  return `working_directory=${TEST_WORKSPACE_PATH}`;
}

function buildAgentSystemPrompt(): string {
  return [
    'You are the Agent World web E2E assistant.',
    'Rules:',
    '- For normal user messages, reply with one short sentence that starts with "E2E_OK:" and includes the full user message text.',
    `- If a user message includes the exact filename "${HITL_DELETE_TARGET}" and asks to use shell_cmd, do not call human_intervention_request. Call only shell_cmd with command "rm" and parameters ["${HITL_DELETE_TARGET}"].`,
    `- If a user message starts with "SLOW_SHELL:" and includes the exact filename "${HITL_DELETE_TARGET}", do not ask for approval. Call only shell_cmd with command "node" and parameters ["./${SLOW_SHELL_SCRIPT_NAME}", "${HITL_DELETE_TARGET}"].`,
    `- After that shell_cmd completes successfully, reply with exactly "${HITL_SHELL_SUCCESS_TOKEN}".`,
    '- If a user message starts with "HITL:", call the tool "human_intervention_request" with question "Approve the E2E request?" and options ["Approve","Decline"]. Do not answer with plain text first.',
    '- After a generic HITL option is submitted, reply with one short sentence that starts with "E2E_RESUMED:" and includes the chosen option label.',
    '- Keep responses concise.',
  ].join('\n');
}

function requireChatId(chatId: unknown, label: string): string {
  const normalized = String(chatId || '').trim();
  if (!normalized) {
    throw new Error(`Missing ${label} chat ID during web E2E bootstrap.`);
  }
  return normalized;
}

async function waitForChats(worldName: string, minimumCount: number): Promise<ChatSummary[]> {
  let lastChats: ChatSummary[] = [];

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const chats = await apiRequest<ChatSummary[]>(`/worlds/${encodeURIComponent(worldName)}/chats`);
    lastChats = Array.isArray(chats) ? chats : [];
    if (lastChats.length >= minimumCount) {
      return lastChats;
    }
    await wait(250);
  }

  throw new Error(`Expected at least ${minimumCount} chat(s) for world '${worldName}', found ${lastChats.length}.`);
}

export async function bootstrapWorldState(): Promise<WebBootstrapState> {
  requireGoogleApiKey();
  await waitForApiReady();
  ensureWorkspaceArtifacts();

  const worlds = await apiRequest<WorldSummary[]>('/worlds');
  if (Array.isArray(worlds) && worlds.some((world) => String(world?.name || '').trim() === TEST_WORLD_NAME)) {
    await apiRequest(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}`, { method: 'DELETE' });
  }

  await apiRequest('/worlds', {
    method: 'POST',
    body: JSON.stringify({
      name: TEST_WORLD_NAME,
      description: 'Real web E2E test world',
      turnLimit: 5,
      variables: buildWorldVariables(),
    }),
  });

  const initialChats = await waitForChats(TEST_WORLD_NAME, 1);
  const initialChatId = requireChatId(initialChats[0]?.id, 'initial');

  await apiRequest(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}/agents`, {
    method: 'POST',
    body: JSON.stringify({
      name: TEST_AGENT_NAME,
      provider: 'google',
      model: 'gemini-2.5-flash',
      autoReply: true,
      systemPrompt: buildAgentSystemPrompt(),
    }),
  });

  return {
    worldName: TEST_WORLD_NAME,
    currentChatId: initialChatId,
    agentName: TEST_AGENT_NAME,
  };
}

export async function deleteAllAgents(state: WebBootstrapState): Promise<void> {
  await waitForWorldApiIdle(state.worldName, 20_000);
  const world = await apiRequest<{ agents?: AgentSummary[] }>(`/worlds/${encodeURIComponent(state.worldName)}`);
  const agents = Array.isArray(world?.agents) ? world.agents : [];
  for (const agent of agents) {
    const agentName = String(agent?.name || '').trim();
    if (!agentName) continue;
    let deleted = false;

    for (let attempt = 0; attempt < 5 && !deleted; attempt += 1) {
      try {
        await waitForWorldApiIdle(state.worldName, 20_000);
        await apiRequest(
          `/worlds/${encodeURIComponent(state.worldName)}/agents/${encodeURIComponent(agentName)}`,
          { method: 'DELETE' },
        );
        deleted = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('AGENT_DELETE_ERROR') || attempt === 4) {
          throw error;
        }
        await wait(500 * (attempt + 1));
      }
    }
  }
}

export function buildShellHitlPrompt(label: string): string {
  return [
    `Use shell_cmd to remove ${HITL_DELETE_TARGET} from the current working directory.`,
    'Do not ask me for confirmation in plain text.',
    `After approval, confirm completion for ${label}.`,
  ].join(' ');
}

export function buildSlowShellPrompt(label: string): string {
  return [
    `SLOW_SHELL: Use shell_cmd to remove ${HITL_DELETE_TARGET} from the current working directory.`,
    'Wait briefly before removing it so the running tool state is visible.',
    'Do not ask me for approval.',
    `After completion, confirm completion for ${label}.`,
  ].join(' ');
}

export async function gotoHome(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('home-page').waitFor({ state: 'visible' });
}

export async function searchHomeWorld(page: Page, worldName: string): Promise<void> {
  await page.getByTestId('world-search').fill(worldName);
  await expect(page.locator('.world-card-btn.center').filter({ hasText: worldName })).toBeVisible();
}

export async function openWorldFromHome(page: Page, worldName: string): Promise<void> {
  await gotoHome(page);
  await searchHomeWorld(page, worldName);
  await page.locator('.world-card-btn.center').filter({ hasText: worldName }).click();
  await page.getByTestId('world-page').waitFor({ state: 'visible' });
}

export async function gotoWorld(page: Page, state: WebBootstrapState, chatId?: string): Promise<void> {
  // Navigate directly to the world URL to avoid carousel selection issues
  // when a test does not need to exercise the home-page world-entry flow.
  await page.goto(`/World/${encodeURIComponent(state.worldName)}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('world-page').waitFor({ state: 'visible' });
  await page.getByTestId('chat-history').waitFor({ state: 'visible' });
  if (chatId) {
    await selectChatById(page, chatId);
  }
}

export async function getCurrentChatId(page: Page): Promise<string> {
  const currentChat = page.locator('[data-chat-current="true"]').first();
  await currentChat.waitFor({ state: 'visible' });
  const chatId = await currentChat.getAttribute('data-chat-id');
  if (!chatId) {
    throw new Error('Expected current chat item to expose a chat ID.');
  }
  return chatId;
}

export async function createNewChat(page: Page): Promise<string> {
  const encodedWorldName = getEncodedWorldNameFromUrl(page.url());
  if (!encodedWorldName) {
    throw new Error('Expected to be on a world page before creating a chat.');
  }

  await waitForWorldIdle(page, 20_000);

  const createChatResponsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' &&
    response.ok() &&
    response.url().includes(`/api/worlds/${encodedWorldName}/chats`)
  );
  const refreshWorldResponsePromise = page.waitForResponse((response) =>
    response.request().method() === 'GET' &&
    response.ok() &&
    response.url().includes(`/api/worlds/${encodedWorldName}`)
  );

  await page.getByTestId('chat-create').click();

  const createChatResponse = await createChatResponsePromise;
  await refreshWorldResponsePromise;

  const createChatPayload = await createChatResponse.json() as { chatId?: string };
  const chatId = String(createChatPayload?.chatId || '').trim();
  if (!chatId) {
    throw new Error('Expected chat creation response to include a chatId.');
  }

  await page.getByTestId('world-page').waitFor({ state: 'visible' });
  await page.getByTestId('chat-history').waitFor({ state: 'visible' });
  await page.getByTestId(`chat-item-${chatId}`).waitFor({ state: 'visible' });
  await expect.poll(() => getCurrentChatId(page)).toBe(chatId);

  return chatId;
}

export async function selectChatById(page: Page, chatId: string): Promise<void> {
  const worldMatch = page.url().match(/\/World\/([^/?#]+)/);
  await page.getByTestId(`chat-item-${chatId}`).click();
  if (worldMatch) {
    await page.waitForURL(new RegExp(`/World/${worldMatch[1]}/${encodeURIComponent(chatId)}(?:$|[?#/])`));
  }
  await page.getByTestId('world-page').waitFor({ state: 'visible' });
  await page.getByTestId('chat-history').waitFor({ state: 'visible' });
  await expect.poll(() => getCurrentChatId(page)).toBe(chatId);
}

export async function waitForComposerSendReady(page: Page, timeoutMs: number = 15_000): Promise<void> {
  await page.locator('[data-testid="composer-action"][aria-label="Send message"]:not([disabled])').waitFor({
    state: 'visible',
    timeout: timeoutMs,
  });
}

export async function waitForWorldIdle(page: Page, timeoutMs: number = 15_000): Promise<void> {
  await page.locator('[data-testid="composer-action"][aria-label="Stop message processing"]').waitFor({
    state: 'hidden',
    timeout: timeoutMs,
  });
  await page.getByTestId('composer-action').waitFor({ state: 'visible', timeout: timeoutMs });

  const encodedWorldName = getEncodedWorldNameFromUrl(page.url());
  if (encodedWorldName) {
    await waitForWorldApiIdle(decodeURIComponent(encodedWorldName), timeoutMs);
  }
}

export async function sendComposerMessage(page: Page, content: string): Promise<void> {
  const composerInput = page.getByTestId('composer-input');
  const initialMessageCount = await getConversationMessageCount(page);

  await composerInput.waitFor({ state: 'visible' });
  await composerInput.fill(content);

  for (let attempt = 0; attempt < COMPOSER_ACTION_RETRY_COUNT; attempt += 1) {
    await waitForComposerSendReady(page);
    await page.getByTestId('composer-action').click();

    try {
      await page.waitForFunction(
        ({ expectedCount }) => {
          const messageCount = document.querySelectorAll('[data-testid^="message-row-"]').length;
          if (messageCount > expectedCount) {
            return true;
          }
          return Boolean(document.querySelector('[data-testid="world-error-state"]'));
        },
        { expectedCount: initialMessageCount },
        { timeout: COMPOSER_ACTION_SETTLE_TIMEOUT_MS },
      );
      return;
    } catch (error) {
      if (attempt === COMPOSER_ACTION_RETRY_COUNT - 1) {
        throw error;
      }
    }
  }
}

export async function waitForAssistantToken(page: Page, token: string, timeoutMs?: number): Promise<void> {
  const opts: { state: 'visible'; timeout?: number } = { state: 'visible' };
  if (timeoutMs) opts.timeout = timeoutMs;
  await page.getByText(token, { exact: false }).last().waitFor(opts);
}

export async function waitForToolSummaryStatus(
  page: Page,
  status: 'running' | 'done' | 'failed',
  timeoutMs: number = 15_000,
): Promise<Locator> {
  const locator = page
    .getByTestId('conversation-area')
    .locator('.tool-summary-line', { hasText: `tool: shell_cmd - ${status}` })
    .last();
  await locator.waitFor({ state: 'visible', timeout: timeoutMs });
  return locator;
}

export async function waitForToolSummaryStatusGone(
  page: Page,
  status: 'running' | 'done' | 'failed',
  timeoutMs: number = 15_000,
): Promise<void> {
  await expect(
    page
      .getByTestId('conversation-area')
      .locator('.tool-summary-line', { hasText: `tool: shell_cmd - ${status}` }),
  ).toHaveCount(0, { timeout: timeoutMs });
}

export async function waitForHitlPrompt(page: Page, timeoutMs?: number): Promise<Locator> {
  const prompt = page.getByTestId('hitl-prompt');
  await prompt.waitFor({ state: 'visible', ...(timeoutMs ? { timeout: timeoutMs } : {}) });
  return prompt;
}

export async function respondToHitlPrompt(page: Page, optionId: 'approve' | 'deny' = 'approve', timeoutMs?: number): Promise<void> {
  const prompt = await waitForHitlPrompt(page, timeoutMs);
  await prompt.getByTestId(`hitl-option-${optionId}`).click();
}

export async function clickLatestEditButton(page: Page): Promise<void> {
  const enabledEditButton = page.locator('[data-testid^="message-edit-"]:not([disabled])').last();
  await enabledEditButton.waitFor({ state: 'attached' });
  await enabledEditButton.click({ force: true });
}

export async function editLatestUserMessage(page: Page, nextText: string): Promise<void> {
  await clickLatestEditButton(page);
  await page.getByTestId('message-edit-input').fill(nextText);
  await page.getByTestId('message-edit-save').click();
}

export async function waitForErrorState(page: Page): Promise<void> {
  await page.getByTestId('world-error-state').waitFor({ state: 'visible' });
}

export async function getConversationMessageCount(page: Page): Promise<number> {
  return page.locator('[data-testid^="message-row-"]').count();
}

export async function deleteLatestMessage(page: Page): Promise<void> {
  // Only non-disabled delete buttons are interactable: the button is disabled until
  // the backend assigns a messageId (userEntered: false). After prepareEditableTurn
  // the live SSE state may have been cleared by handleStreamStart before the confirmation
  // event arrived, leaving the user message absent from the DOM. In that case, reload
  // the world page so messages are re-populated from the backend DB.
  const enabledDeleteBtn = page.locator('[data-testid^="message-delete-"]:not([disabled])');
  if ((await enabledDeleteBtn.count()) === 0) {
    const currentUrl = page.url();
    const worldMatch = currentUrl.match(/\/World\/([^/?#]+)/);
    if (worldMatch) {
      // Capture the active chat ID before navigating away.
      const chatId = await page
        .locator('[data-chat-current="true"]')
        .first()
        .getAttribute('data-chat-id')
        .catch(() => null);
      await page.goto(`/World/${worldMatch[1]}`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('world-page').waitFor({ state: 'visible' });
      await page.getByTestId('chat-history').waitFor({ state: 'visible' });
      if (chatId) {
        await selectChatById(page, chatId);
      }
    }
  }

  // The message-actions wrapper has opacity:0 until hover; force:true bypasses
  // Playwright's visibility check so the click still reaches the underlying button.
  await enabledDeleteBtn.last().waitFor({ state: 'attached' });
  await enabledDeleteBtn.last().click({ force: true });
  await page.getByRole('button', { name: 'Delete Message', exact: true }).click();
  // Wait for modal to close after the delete API call + world reload inside the handler.
  await page.getByRole('button', { name: 'Delete Message', exact: true }).waitFor({ state: 'hidden' });
}

export async function deleteChatById(page: Page, chatId: string): Promise<void> {
  await page.getByTestId(`chat-delete-${chatId}`).click();
  await page.getByRole('button', { name: 'Delete Chat' }).click();
  // Wait for modal to close
  await page.getByRole('button', { name: 'Delete Chat' }).waitFor({ state: 'hidden' });
}

export async function waitForTokenGone(page: Page, token: string): Promise<void> {
  await page.waitForFunction(
    (t) => !document.body.innerText.includes(t),
    token,
    { timeout: 15_000 },
  );
}

export async function setWorldToolPermission(
  state: WebBootstrapState,
  level: 'read' | 'ask' | 'auto',
): Promise<void> {
  const world = await apiRequest<{ variables?: string }>(
    `/worlds/${encodeURIComponent(state.worldName)}`,
  );
  const currentVariables = String(world?.variables ?? '');
  const filtered = currentVariables
    .split('\n')
    .filter((line) => !line.trim().startsWith('tool_permission='));
  const nextVariables = level === 'auto'
    ? filtered.join('\n').trim()
    : [...filtered, `tool_permission=${level}`].join('\n').trim();
  await apiRequest(`/worlds/${encodeURIComponent(state.worldName)}`, {
    method: 'PATCH',
    body: JSON.stringify({ variables: nextVariables }),
  });
}
