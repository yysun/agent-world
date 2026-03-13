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
const CHAT_NAMES = {
  current: 'Loaded Current Chat',
  switched: 'Switched Chat',
};
import {
  HITL_DELETE_TARGET,
  LOAD_SKILL_RUN_MARKER,
  TOOL_PERMISSION_SKILL_ID,
  TOOL_PERMISSION_SKILL_SCRIPT_NAME,
  WRITE_FILE_TARGET,
  createSeededAgentPayload,
} from './seeded-agent.js';

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
  process.env.AGENT_WORLD_QUEUE_NO_RESPONSE_FALLBACK_MS = process.env.AGENT_WORLD_QUEUE_NO_RESPONSE_FALLBACK_MS || '5000';
}

function resetWorkspacePath(workspacePath: string): void {
  fs.rmSync(workspacePath, { recursive: true, force: true });
}

function seedHitlDeleteTarget(workspacePath: string): void {
  fs.rmSync(path.join(workspacePath, WRITE_FILE_TARGET), { force: true });
  fs.rmSync(path.join(workspacePath, LOAD_SKILL_RUN_MARKER), { force: true });
  fs.writeFileSync(
    path.join(workspacePath, HITL_DELETE_TARGET),
    'Disposable file for real Electron E2E shell_cmd HITL approval coverage.\n',
    'utf8',
  );

  const skillRoot = path.join(workspacePath, 'skills', TOOL_PERMISSION_SKILL_ID);
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

  await createAgent(world.id, createSeededAgentPayload() as any);

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
    await ((storage as unknown) as { close: () => Promise<void> }).close();
  }
}

await main();
