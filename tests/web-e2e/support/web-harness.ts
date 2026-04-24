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
 * - 2026-03-24: Added narrow shell-cmd and create-agent prompt builders so the remaining
 *   permission-matrix branches can run in fresh chats without drifting across tool families.
 * - 2026-03-24: Hardened write-file, web-fetch, and load-skill ASK/AUTO branches to call the tool
 *   immediately without plain-text hesitation, matching the create-agent stabilization.
 * - 2026-03-24: Made create-agent ASK/AUTO branches explicitly call the tool immediately and avoid
 *   plain-text approval hesitation so the real-model E2E path stays deterministic.
 * - 2026-03-23: Tightened create-agent branch instructions so the live E2E model keeps the ASK/AUTO
 *   scenarios distinct instead of drifting to the wrong agent name after approval.
 * - 2026-03-12: Made HITL option clicks accept normalized label-like IDs (for example `yes once` -> `yes_once`)
 *   so web E2E specs can target approval buttons using the same human-readable wording shown in the UI.
 * - 2026-03-12: Hardened API idle polling to require a short stable idle window so follow-up browser actions
 *   do not race post-idle queue cleanup after shell/HITL turns.
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
 * - 2026-04-24: Hardened sendComposerMessage so delayed error overlays after a successful click do not trigger a false retry into a composer-less error page.
 * - 2026-04-24: Treat composer send error states as explicit failures instead of successful sends so web E2E cannot silently pass on unsent messages.
 * - 2026-04-24: Added an explicit timeout parameter for error-state waits so async queue-failure browser flows can use a larger budget than the suite default.
 * - 2026-03-12: Updated error waiting helpers to accept inline system error messages in addition to the legacy page-level error panel.
 */

import fs from 'node:fs';
import path from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';

import { waitForApiReady } from './api-ready.js';
import { renderableSystemErrorTextPatterns } from './error-state.js';
import { buildHitlOptionIdCandidates } from './hitl-option-id.js';
import { TOOL_PERMISSION_FETCH_URL } from '../../support/tool-permission-fetch-target.js';

export const TEST_WORLD_NAME = 'e2e-test-web';
export const TEST_AGENT_NAME = 'e2e-google';
export const TEST_WORKSPACE_PATH = path.resolve(process.cwd(), '.tmp', 'web-playwright-workspace');
export const HITL_DELETE_TARGET = '.e2e-hitl-delete-me.txt';
export const HITL_SHELL_SUCCESS_MARKER = 'E2E_SHELL_OK';
export const HITL_SHELL_SUCCESS_TOKEN = `E2E_SHELL_OK: ${HITL_DELETE_TARGET}`;
export const SLOW_SHELL_SCRIPT_NAME = 'slow-delete.mjs';
export const WRITE_FILE_TARGET = '.e2e-write-output.txt';
export const LOAD_SKILL_RUN_MARKER = '.e2e-load-skill-ran.txt';
export const TOOL_PERMISSION_SKILL_ID = 'e2e-matrix-skill';
export const TOOL_PERMISSION_SKILL_SCRIPT_NAME = 'mark-load-skill.js';
export const CREATE_AGENT_ASK_NAME = 'E2E Ask Agent';
export const CREATE_AGENT_AUTO_NAME = 'E2E Auto Agent';

const API_BASE_URL = 'http://127.0.0.1:3000/api';
const WORLD_IDLE_STABILITY_MS = 500;

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
  activeChatIds?: string[];
  queuedChatIds?: string[];
};

const COMPOSER_ACTION_RETRY_COUNT = 3;
const COMPOSER_ACTION_SETTLE_TIMEOUT_MS = 5_000;

type ComposerSendSettleSnapshot = {
  messageCount: number;
  hasWorldErrorState: boolean;
  hasConversationErrorIndicator: boolean;
  hasRenderableSystemError: boolean;
};

export function classifyComposerSendSettleState(
  snapshot: ComposerSendSettleSnapshot,
  expectedCount: number,
): 'sent' | 'error' | null {
  if (snapshot.messageCount > expectedCount) {
    return 'sent';
  }

  if (
    snapshot.hasWorldErrorState
    || snapshot.hasConversationErrorIndicator
    || snapshot.hasRenderableSystemError
  ) {
    return 'error';
  }

  return null;
}

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
  fs.rmSync(path.join(TEST_WORKSPACE_PATH, WRITE_FILE_TARGET), { force: true });
  fs.rmSync(path.join(TEST_WORKSPACE_PATH, LOAD_SKILL_RUN_MARKER), { force: true });
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

  const skillRoot = path.join(TEST_WORKSPACE_PATH, '.agent-world', 'skills', TOOL_PERMISSION_SKILL_ID);
  fs.mkdirSync(path.join(skillRoot, 'scripts'), { recursive: true });
  fs.writeFileSync(
    path.join(skillRoot, 'SKILL.md'),
    [
      '---',
      `name: ${TOOL_PERMISSION_SKILL_ID}`,
      'description: E2E permission-matrix skill',
      '---',
      '',
      '# E2E Matrix Skill',
      '',
      'Run `scripts/mark-load-skill.js` before continuing.',
      'After the script succeeds, continue with the request.',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(skillRoot, 'scripts', TOOL_PERMISSION_SKILL_SCRIPT_NAME),
    [
      "import { promises as fs } from 'node:fs';",
      '',
      `await fs.writeFile('${LOAD_SKILL_RUN_MARKER}', 'load skill executed\\n', 'utf8');`,
      "console.log('E2E_LOAD_SKILL_SCRIPT_OK');",
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
  let idleObservedAt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    const status = await apiRequest<WorldStatus>(`/worlds/${encodeURIComponent(worldName)}/status`);
    const isIdle = !status?.isProcessing
      && (!Array.isArray(status?.activeChatIds) || status.activeChatIds.length === 0)
      && (!Array.isArray(status?.queuedChatIds) || status.queuedChatIds.length === 0);
    if (isIdle) {
      if (idleObservedAt === 0) {
        idleObservedAt = Date.now();
      }
      if (Date.now() - idleObservedAt >= WORLD_IDLE_STABILITY_MS) {
        return;
      }
    } else {
      idleObservedAt = 0;
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

function buildAgentPromptFromRules(rules: string[]): string {
  return [
    'You are the Agent World web E2E assistant.',
    'Rules:',
    `- A user message may optionally begin with "@${TEST_AGENT_NAME} ". Remove that leading mention before matching any branch prefix.`,
    '- Match tool-permission branches using only the exact prefix before the first colon in the user message. Ignore the rest of the message when choosing the branch.',
    '- For normal user messages, reply with one short sentence that starts with "E2E_OK:" and includes the full user message text.',
    ...rules,
    '- Keep responses concise.',
  ].join('\n');
}

export function buildAgentSystemPrompt(): string {
  return buildAgentPromptFromRules([
    '- Treat every WRITE_FILE_*, WEB_FETCH_*, SHELL_*, CREATE_AGENT_*, and LOAD_SKILL_* prefix as a separate exact branch. Never call a tool from a different branch.',
    `- If a user message starts with "WRITE_FILE_READ:", immediately call exactly one tool: write_file with filePath "${WRITE_FILE_TARGET}" and content "read should be blocked". Do not answer with plain text before the tool call. If the tool result mentions "permission level (read)", reply exactly "E2E_WRITE_FILE_READ_BLOCKED". Otherwise reply exactly "E2E_WRITE_FILE_READ_UNEXPECTED".`,
    `- If a user message starts with "WRITE_FILE_ASK:", immediately call exactly one tool: write_file with filePath "${WRITE_FILE_TARGET}" and content "ASK_WRITE_OK". Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_WRITE_FILE_ASK_OK".`,
    `- If a user message starts with "WRITE_FILE_AUTO:", immediately call exactly one tool: write_file with filePath "${WRITE_FILE_TARGET}" and content "AUTO_WRITE_OK". Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_WRITE_FILE_AUTO_OK".`,
    `- If a user message starts with "WEB_FETCH_READ:", immediately call exactly one tool: web_fetch with url "${TOOL_PERMISSION_FETCH_URL}". Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_WEB_FETCH_READ_OK".`,
    `- If a user message starts with "WEB_FETCH_ASK:", immediately call exactly one tool: web_fetch with url "${TOOL_PERMISSION_FETCH_URL}". Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_WEB_FETCH_ASK_OK".`,
    `- If a user message starts with "WEB_FETCH_AUTO:", immediately call exactly one tool: web_fetch with url "${TOOL_PERMISSION_FETCH_URL}". Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_WEB_FETCH_AUTO_OK".`,
    '- If a user message starts with "SHELL_READ:", call only shell_cmd with command "pwd" and no parameters. If the tool result mentions "permission level (read)", reply exactly "E2E_SHELL_READ_BLOCKED".',
    '- If a user message starts with "SHELL_ASK:", call only shell_cmd with command "pwd" and no parameters. After the tool returns, reply exactly "E2E_SHELL_ASK_OK".',
    '- If a user message starts with "SHELL_AUTO:", call only shell_cmd with command "pwd" and no parameters. After the tool returns, reply exactly "E2E_SHELL_AUTO_OK".',
    `- If a user message starts with "SHELL_RISKY_AUTO:", call only shell_cmd with command "rm" and parameters ["${HITL_DELETE_TARGET}"]. After the tool returns, reply exactly "E2E_SHELL_RISKY_AUTO_OK".`,
    `- Treat "CREATE_AGENT_READ:", "CREATE_AGENT_APPROVAL:", and "CREATE_AGENT_AUTO:" as three separate exact branches. Never reuse the agent name or reply token from a different branch.`,
    `- If a user message starts with "CREATE_AGENT_READ:", immediately call only create_agent with name "${CREATE_AGENT_ASK_NAME}", role "E2E coverage agent", and nextAgent "human". Do not ask for permission in plain text. If the tool result mentions "permission level (read)", reply exactly "E2E_CREATE_AGENT_READ_BLOCKED".`,
    `- If a user message starts with "CREATE_AGENT_APPROVAL:", immediately call only create_agent with name "${CREATE_AGENT_ASK_NAME}", role "E2E coverage agent", and nextAgent "human". Do not create "${CREATE_AGENT_AUTO_NAME}" in this branch. Do not ask for permission in plain text and do not wait for the user manually; the app will surface the approval prompt. After the tool returns, reply exactly "E2E_CREATE_AGENT_ASK_OK".`,
    `- If a user message starts with "CREATE_AGENT_AUTO:", immediately call only create_agent with name "${CREATE_AGENT_AUTO_NAME}", role "E2E coverage agent", and nextAgent "human". Do not create "${CREATE_AGENT_ASK_NAME}" in this branch. Do not ask for permission in plain text and do not wait for the user manually; the app will surface any required approval prompt. After the tool returns, reply exactly "E2E_CREATE_AGENT_AUTO_OK".`,
    '- Treat "LOAD_SKILL_READ:", "LOAD_SKILL_ASK:", and "LOAD_SKILL_AUTO:" as three separate exact branches. Never reuse the reply token from a different load-skill branch.',
    `- If a user message starts with "LOAD_SKILL_READ:", immediately call exactly one tool: load_skill with skill_id "${TOOL_PERMISSION_SKILL_ID}". Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_LOAD_SKILL_READ_BLOCKED".`,
    `- If a user message starts with "LOAD_SKILL_ASK:", immediately call exactly one tool: load_skill with skill_id "${TOOL_PERMISSION_SKILL_ID}". Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. Do not reply with "E2E_LOAD_SKILL_AUTO_OK" in this branch. After the tool returns, reply exactly "E2E_LOAD_SKILL_ASK_OK".`,
    `- If a user message starts with "LOAD_SKILL_AUTO:", immediately call exactly one tool: load_skill with skill_id "${TOOL_PERMISSION_SKILL_ID}". Do not answer with plain text before the tool call. Do not reply with "E2E_LOAD_SKILL_ASK_OK" in this branch. After the tool returns, reply exactly "E2E_LOAD_SKILL_AUTO_OK".`,
    `- If a user message includes the exact filename "${HITL_DELETE_TARGET}" and asks to use shell_cmd, do not call ask_user_input. Call only shell_cmd with command "rm" and parameters ["${HITL_DELETE_TARGET}"].`,
    `- If a user message starts with "SLOW_SHELL:" and includes the exact filename "${HITL_DELETE_TARGET}", do not ask for approval. Call only shell_cmd with command "node" and parameters ["./${SLOW_SHELL_SCRIPT_NAME}", "${HITL_DELETE_TARGET}"].`,
    `- After that shell_cmd completes successfully, reply with exactly "${HITL_SHELL_SUCCESS_TOKEN}".`,
    '- If a user message starts with "HITL:", call the tool "ask_user_input" with type "single-select" and questions [{"id":"question-1","header":"Approve the E2E request?","question":"Approve the E2E request?","options":[{"id":"approve","label":"Approve"},{"id":"decline","label":"Decline"}]}]. Do not answer with plain text first.',
    '- After a generic HITL option is submitted, reply with one short sentence that starts with "E2E_RESUMED:" and includes the chosen option label.',
  ]);
}

export function buildWriteFilePermissionPrompt(): string {
  return buildAgentPromptFromRules([
    '- Treat every WRITE_FILE_* prefix as a separate exact branch. Never call web_fetch, shell_cmd, create_agent, load_skill, or ask_user_input in a WRITE_FILE_* branch.',
    `- If a user message starts with "WRITE_FILE_READ:", immediately call exactly one tool: write_file with filePath "${WRITE_FILE_TARGET}" and content "read should be blocked". Do not answer with plain text before the tool call. If the tool result mentions "permission level (read)", reply exactly "E2E_WRITE_FILE_READ_BLOCKED". Otherwise reply exactly "E2E_WRITE_FILE_READ_UNEXPECTED".`,
    `- If a user message starts with "WRITE_FILE_ASK:", immediately call exactly one tool: write_file with filePath "${WRITE_FILE_TARGET}" and content "ASK_WRITE_OK". Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_WRITE_FILE_ASK_OK".`,
    `- If a user message starts with "WRITE_FILE_AUTO:", immediately call exactly one tool: write_file with filePath "${WRITE_FILE_TARGET}" and content "AUTO_WRITE_OK". Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_WRITE_FILE_AUTO_OK".`,
  ]);
}

export function buildWebFetchPermissionPrompt(): string {
  return buildAgentPromptFromRules([
    '- Treat every WEB_FETCH_* prefix as a separate exact branch. Never call write_file, shell_cmd, create_agent, load_skill, or ask_user_input in a WEB_FETCH_* branch.',
    `- If a user message starts with "WEB_FETCH_READ:", immediately call exactly one tool: web_fetch with url "${TOOL_PERMISSION_FETCH_URL}". Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_WEB_FETCH_READ_OK".`,
    `- If a user message starts with "WEB_FETCH_ASK:", immediately call exactly one tool: web_fetch with url "${TOOL_PERMISSION_FETCH_URL}". Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_WEB_FETCH_ASK_OK".`,
    `- If a user message starts with "WEB_FETCH_AUTO:", immediately call exactly one tool: web_fetch with url "${TOOL_PERMISSION_FETCH_URL}". Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_WEB_FETCH_AUTO_OK".`,
  ]);
}

export function buildLoadSkillPermissionPrompt(): string {
  return buildAgentPromptFromRules([
    '- Treat "LOAD_SKILL_READ:", "LOAD_SKILL_ASK:", and "LOAD_SKILL_AUTO:" as three separate exact branches. Never call write_file, web_fetch, shell_cmd, create_agent, or ask_user_input before load_skill in a LOAD_SKILL_* branch, and never reuse a reply token from a different load-skill branch.',
    `- If a user message starts with "LOAD_SKILL_READ:", immediately call exactly one tool: load_skill with skill_id "${TOOL_PERMISSION_SKILL_ID}". Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_LOAD_SKILL_READ_BLOCKED".`,
    `- If a user message starts with "LOAD_SKILL_ASK:", immediately call exactly one tool: load_skill with skill_id "${TOOL_PERMISSION_SKILL_ID}". Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. Do not reply with "E2E_LOAD_SKILL_AUTO_OK" in this branch. After the tool returns, reply exactly "E2E_LOAD_SKILL_ASK_OK".`,
    `- If a user message starts with "LOAD_SKILL_AUTO:", immediately call exactly one tool: load_skill with skill_id "${TOOL_PERMISSION_SKILL_ID}". Do not answer with plain text before the tool call. Do not reply with "E2E_LOAD_SKILL_ASK_OK" in this branch. After the tool returns, reply exactly "E2E_LOAD_SKILL_AUTO_OK".`,
  ]);
}

export function buildShellPermissionPrompt(): string {
  return buildAgentPromptFromRules([
    '- Treat "SHELL_READ:", "SHELL_ASK:", "SHELL_AUTO:", and "SHELL_RISKY_AUTO:" as four separate exact branches. Never call write_file, web_fetch, create_agent, load_skill, or ask_user_input before shell_cmd in a SHELL_* branch, and never reuse a reply token from a different shell branch.',
    '- If a user message starts with "SHELL_READ:", immediately call exactly one tool: shell_cmd with command "pwd" and no parameters. Do not answer with plain text before the tool call. If the tool result mentions "permission level (read)", reply exactly "E2E_SHELL_READ_BLOCKED". Otherwise reply exactly "E2E_SHELL_READ_UNEXPECTED".',
    '- If a user message starts with "SHELL_ASK:", immediately call exactly one tool: shell_cmd with command "pwd" and no parameters. Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_SHELL_ASK_OK".',
    '- If a user message starts with "SHELL_AUTO:", immediately call exactly one tool: shell_cmd with command "pwd" and no parameters. Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_SHELL_AUTO_OK".',
    `- If a user message starts with "SHELL_RISKY_AUTO:", immediately call exactly one tool: shell_cmd with command "rm" and parameters ["${HITL_DELETE_TARGET}"]. Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_SHELL_RISKY_AUTO_OK".`,
  ]);
}

export function buildCreateAgentPermissionPrompt(): string {
  return buildAgentPromptFromRules([
    `- Treat "CREATE_AGENT_READ:", "CREATE_AGENT_APPROVAL:", and "CREATE_AGENT_AUTO:" as three separate exact branches. Never call write_file, web_fetch, shell_cmd, load_skill, or ask_user_input before create_agent in a CREATE_AGENT_* branch, and never reuse the agent name or reply token from a different create-agent branch.`,
    `- If a user message starts with "CREATE_AGENT_READ:", immediately call exactly one tool: create_agent with name "${CREATE_AGENT_ASK_NAME}", role "E2E coverage agent", and nextAgent "human". Do not answer with plain text before the tool call. If the tool result mentions "permission level (read)", reply exactly "E2E_CREATE_AGENT_READ_BLOCKED". Otherwise reply exactly "E2E_CREATE_AGENT_READ_UNEXPECTED".`,
    `- If a user message starts with "CREATE_AGENT_APPROVAL:", immediately call exactly one tool: create_agent with name "${CREATE_AGENT_ASK_NAME}", role "E2E coverage agent", and nextAgent "human". Do not create "${CREATE_AGENT_AUTO_NAME}" in this branch. Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_CREATE_AGENT_ASK_OK".`,
    `- If a user message starts with "CREATE_AGENT_AUTO:", immediately call exactly one tool: create_agent with name "${CREATE_AGENT_AUTO_NAME}", role "E2E coverage agent", and nextAgent "human". Do not create "${CREATE_AGENT_ASK_NAME}" in this branch. Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_CREATE_AGENT_AUTO_OK".`,
  ]);
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

export async function setAgentSystemPrompt(state: WebBootstrapState, systemPrompt: string): Promise<void> {
  await apiRequest(`/worlds/${encodeURIComponent(state.worldName)}/agents/${encodeURIComponent(state.agentName)}`, {
    method: 'PATCH',
    body: JSON.stringify({ systemPrompt }),
  });
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
  await expect(page.getByTestId(`world-card-${worldName}`)).toBeVisible();
}

export async function openWorldFromHome(page: Page, worldName: string): Promise<void> {
  await gotoHome(page);
  await searchHomeWorld(page, worldName);
  await page.getByTestId(`world-card-${worldName}`).click();
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
      const settleStateHandle = await page.waitForFunction(
        ({ expectedCount, patterns }) => {
          const messageCount = document.querySelectorAll('[data-testid^="message-row-"]').length;

          const hasWorldErrorState = Boolean(document.querySelector('[data-testid="world-error-state"]'));
          const hasConversationErrorIndicator = Boolean(
            document.querySelector('[data-testid="conversation-area"] .error-indicator'),
          );
          const systemRows = Array.from(
            document.querySelectorAll('[data-testid="conversation-area"] [data-message-role="system"]'),
          );
          const hasRenderableSystemError = systemRows.some((row) => {
            const text = (row.textContent || '').trim().toLowerCase();
            return patterns.some((pattern: string) => text.includes(pattern));
          });

          if (messageCount > expectedCount || hasWorldErrorState || hasConversationErrorIndicator || hasRenderableSystemError) {
            return {
              messageCount,
              hasWorldErrorState,
              hasConversationErrorIndicator,
              hasRenderableSystemError,
            };
          }

          return false;
        },
        { expectedCount: initialMessageCount, patterns: renderableSystemErrorTextPatterns },
        { timeout: COMPOSER_ACTION_SETTLE_TIMEOUT_MS },
      );

      const settleState = classifyComposerSendSettleState(
        await settleStateHandle.jsonValue() as ComposerSendSettleSnapshot,
        initialMessageCount,
      );

      if (settleState === 'sent') {
        return;
      }

      throw new Error('Composer send entered an error state before a message row appeared.');
    } catch (error) {
      if (error instanceof Error && error.message.includes('entered an error state')) {
        throw error;
      }

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

export async function respondToHitlPrompt(page: Page, optionId: string = 'approve', timeoutMs?: number): Promise<void> {
  const prompt = await waitForHitlPrompt(page, timeoutMs);
  for (const candidate of buildHitlOptionIdCandidates(optionId)) {
    const option = prompt.getByTestId(`hitl-option-${candidate}`);
    if (await option.count()) {
      await option.click();
      return;
    }
  }

  throw new Error(`Expected HITL option "${optionId}" to exist in the current prompt.`);
}

export async function waitForShellHitlCompletion(page: Page, timeoutMs: number = 60_000): Promise<void> {
  await waitForToolSummaryStatus(page, 'done', timeoutMs);
  await waitForWorldIdle(page, timeoutMs);
  await expect(page.getByTestId('hitl-prompt')).toHaveCount(0);
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

export async function waitForErrorState(page: Page, timeoutMs: number = 15_000): Promise<void> {
  await page.waitForFunction(
    ({ patterns }) => {
      if (document.querySelector('[data-testid="world-error-state"]')) {
        return true;
      }

      if (document.querySelector('[data-testid="conversation-area"] .error-indicator')) {
        return true;
      }

      const systemRows = Array.from(
        document.querySelectorAll('[data-testid="conversation-area"] [data-message-role="system"]'),
      );

      return systemRows.some((row) => {
        const text = (row.textContent || '').trim().toLowerCase();
        return patterns.some((pattern: string) => text.includes(pattern));
      });
    },
    { patterns: renderableSystemErrorTextPatterns },
    { timeout: timeoutMs },
  );
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

export async function getWorldAgentNames(state: WebBootstrapState): Promise<string[]> {
  const world = await apiRequest<{ agents?: Array<{ name?: string }> }>(
    `/worlds/${encodeURIComponent(state.worldName)}`,
  );
  return Array.isArray(world?.agents)
    ? world.agents.map((agent) => String(agent?.name || '').trim()).filter(Boolean)
    : [];
}
