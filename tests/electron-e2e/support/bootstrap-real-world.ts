/**
 * Real desktop E2E bootstrap for the Electron Playwright suite.
 *
 * Purpose:
 * - Reset and seed a real workspace with the `e2e-test` world before Electron launches.
 *
 * Key Features:
 * - Deletes `e2e-test` if it already exists in the target workspace.
 * - Resets the dedicated E2E workspace directory before reseeding.
 * - Creates a fresh Google-backed world using `gemini-2.5-flash`.
 * - Seeds named chats with stable history for current/switch/branch/edit flows.
 *
 * Implementation Notes:
 * - Runs in a separate Node process so SQLite/file handles are released before Electron starts.
 * - Uses real core APIs only; no mocked storage or mocked providers.
 *
 * Recent Changes:
 * - 2026-03-10: Added initial bootstrap for real Electron Playwright E2E flows.
 * - 2026-03-10: Seeded a disposable shell-command target and working directory for deterministic HITL approval tests.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  createAgent,
  createWorld,
  deleteWorld,
  listChats,
  listWorlds,
  newChat,
} from '../../../core/index.js';
import { createStorageFromEnv } from '../../../core/storage/storage-factory.js';

const TEST_WORLD_ID = 'e2e-test';
const TEST_AGENT_ID = 'e2e-google';
const TEST_AGENT_NAME = 'E2E Google';
const TEST_AGENT_MODEL = 'gemini-2.5-flash';
const HITL_DELETE_TARGET = '.e2e-hitl-delete-me.txt';
const HITL_SHELL_SUCCESS_TOKEN = `E2E_SHELL_OK: ${HITL_DELETE_TARGET}`;
const CHAT_NAMES = {
  current: 'Loaded Current Chat',
  switched: 'Switched Chat',
};

function requireWorkspacePath(): string {
  const workspacePath = String(process.argv[2] || '').trim();
  if (!workspacePath) {
    throw new Error('Bootstrap workspace path is required.');
  }
  return path.resolve(workspacePath);
}

function requireGoogleApiKey(): void {
  if (String(process.env.GOOGLE_API_KEY || '').trim()) {
    return;
  }
  throw new Error(
    'GOOGLE_API_KEY is required for Electron desktop E2E. Set it in your environment or .env before running `npm run test:electron:e2e`.'
  );
}

function configureWorkspaceEnv(workspacePath: string): void {
  fs.mkdirSync(workspacePath, { recursive: true });
  process.env.AGENT_WORLD_STORAGE_TYPE = 'sqlite';
  process.env.AGENT_WORLD_DATA_PATH = workspacePath;
  process.env.AGENT_WORLD_PROJECT_PATH = workspacePath;
  process.env.AGENT_WORLD_WORKSPACE_PATH = workspacePath;
  process.env.AGENT_WORLD_QUEUE_NO_RESPONSE_FALLBACK_MS = process.env.AGENT_WORLD_QUEUE_NO_RESPONSE_FALLBACK_MS || '250';
}

function resetWorkspacePath(workspacePath: string): void {
  fs.rmSync(workspacePath, { recursive: true, force: true });
}

function seedHitlDeleteTarget(workspacePath: string): void {
  fs.writeFileSync(
    path.join(workspacePath, HITL_DELETE_TARGET),
    'Disposable file for real Electron E2E shell_cmd HITL approval coverage.\n',
    'utf8',
  );
}

function requireChatId(world: { currentChatId?: unknown } | null | undefined, label: string): string {
  const chatId = String(world?.currentChatId || '').trim();
  if (!chatId) {
    throw new Error(`Missing current chat ID after creating ${label}.`);
  }
  return chatId;
}

async function resetExistingWorld(): Promise<void> {
  const worlds = await listWorlds();
  const existingWorld = worlds.find((world) => String(world?.id || '').trim() === TEST_WORLD_ID);
  if (!existingWorld) {
    return;
  }
  await deleteWorld(TEST_WORLD_ID);
}

async function createSeededChat(
  worldId: string,
  name: string,
): Promise<string> {
  const updatedWorld = await newChat(worldId);
  const chatId = requireChatId(updatedWorld, name);
  const storage = await createStorageFromEnv();
  const chats = await storage.listChats(worldId);
  const chat = chats.find((entry) => String(entry?.id || '').trim() === chatId);
  if (!chat) {
    throw new Error(`Failed to resolve persisted chat ${chatId} while seeding ${name}.`);
  }

  await storage.saveChatData(worldId, { ...chat, name });
  return chatId;
}

async function main(): Promise<void> {
  const workspacePath = requireWorkspacePath();
  requireGoogleApiKey();
  resetWorkspacePath(workspacePath);
  configureWorkspaceEnv(workspacePath);
  seedHitlDeleteTarget(workspacePath);

  await resetExistingWorld();

  const world = await createWorld({
    name: TEST_WORLD_ID,
    turnLimit: 5,
    variables: `working_directory=${workspacePath}`,
  });
  if (!world) {
    throw new Error('Failed to create the e2e-test world.');
  }

  await createAgent(world.id, {
    id: TEST_AGENT_ID,
    name: TEST_AGENT_NAME,
    type: 'assistant',
    provider: 'google' as any,
    model: TEST_AGENT_MODEL,
    autoReply: true,
    systemPrompt: [
      'You are the Agent World desktop E2E assistant.',
      'Rules:',
      '- For normal user messages, reply with one short sentence that starts with "E2E_OK:" and includes the full user message text.',
      '- If a user message starts with "HITL:", call the tool "human_intervention_request" with question "Approve the E2E request?" and options ["Approve","Decline"]. Do not answer with plain text first.',
      `- If a user message includes the exact filename "${HITL_DELETE_TARGET}" and asks to use shell_cmd, do not call human_intervention_request. Call only shell_cmd with command "rm" and parameters ["${HITL_DELETE_TARGET}"].`,
      `- After that shell_cmd completes successfully, reply with exactly "${HITL_SHELL_SUCCESS_TOKEN}".`,
      '- After a HITL option is submitted, reply with one short sentence that starts with "E2E_RESUMED:" and includes the chosen option label.',
      '- Keep responses concise.',
    ].join('\n'),
  });

  await createSeededChat(
    world.id,
    CHAT_NAMES.switched,
  );

  await createSeededChat(
    world.id,
    CHAT_NAMES.current,
  );

  const chats = await listChats(world.id);
  if (chats.length < 2) {
    throw new Error('Desktop E2E bootstrap expected at least two seeded chats.');
  }
  const storage = await createStorageFromEnv();
  if (typeof (storage as { close?: () => Promise<void> }).close === 'function') {
    await (storage as { close: () => Promise<void> }).close();
  }
}

await main();
