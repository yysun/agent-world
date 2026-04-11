/**
 * Electron Main IPC Handler Factory
 *
 * Features:
 * - Composes workspace/world/agent/session/chat/message IPC handlers from injected dependencies.
 * - Preserves existing validation and error semantics for handler payloads.
 * - Keeps the main entry focused on lifecycle and wiring responsibilities.
 *
 * Implementation Notes:
 * - Uses function-based dependency injection to keep runtime behavior deterministic.
 * - Delegates serialization to `message-serialization` helpers.
 * - Avoids direct coupling to app bootstrap internals.
 *
 * Recent Changes:
 * - 2026-04-11: Extracted skill markdown parsing, local discovery, and file traversal helpers into dedicated main-process modules.
 * - 2026-04-11: Added local skill-root discovery so the install browser can scan a chosen root for SKILL.md and nested skills directories.
 * - 2026-04-11: GitHub skill discovery now reads SKILL.md descriptions so the renderer can render found skills with the same card content as local skills.
 * - 2026-04-11: Project-scope skill installs now resolve against the selected
 *   project folder so Electron writes to `<project folder>/.agent-world/skills`
 *   instead of the workspace root when an explicit project path is available.
 * - 2026-04-11: Switched Electron canonical skill roots to
 *   `~/.agent-world/skills` and `./.agent-world/skills`, and removed legacy
 *   skill-root compatibility from desktop settings/runtime.
 * - 2026-04-11: Removed Electron-only legacy default skill-root discovery and
 *   GitHub probing for old skill-root layouts.
 * - 2026-04-11: Switched skill import/list defaults to the shared canonical
 *   skill-root contract while keeping legacy skill roots readable for
 *   compatibility.
 * - 2026-04-03: Repo-root GitHub skill discovery now reads the SKILL.md `name` front-matter field and uses it for both listing and import resolution.
 * - 2026-04-03: Skill GitHub install flows now surface repo-root SKILL.md files and fall back to them when the selected skill matches the repo name.
 * - 2026-03-22: Extended skill content read/save handling with optional relative paths so the editor can open files from the folder tree.
 * - 2026-03-22: Added `readSkillFolderStructure` IPC handling so the skill editor can show the current skill folder tree.
 * - 2026-03-22: Added `deleteSkill` IPC handling to remove a skill folder after renderer confirmation from the skill editor.
 * - 2026-03-19: Restored `openWorkspaceDialog(directoryPath)` immediate-path behavior and added optional `defaultPath` support to `pickDirectoryDialog`.
 * - 2026-03-19: Switched `listSkillRegistry` to world-scoped `world.variables` resolution so project-scope skills no longer depend on `AGENT_WORLD_WORKSPACE_PATH` or `AGENT_WORLD_DATA_PATH`.
 * - 2026-03-14: Heartbeat start now syncs persisted heartbeat config onto the active
 *   runtime world and rejects silent no-op starts when the job remains stopped.
 * - 2026-03-14: Stopped auto-restarting heartbeat jobs after world-settings saves so
 *   renderer edits require an explicit cron start action.
 * - 2026-03-13: Refreshed subscribed world runtimes after `agent:create` so
 *   Electron IPC-created E2E agents become live responders immediately.
 * - 2026-03-10: Rebound `sendChatMessage` queue dispatch to the post-restore subscribed runtime so user sends stream on the active world emitter after chat activation.
 * - 2026-03-10: Switched `sendChatMessage` to the queue-only `enqueueAndProcessUserTurn` core API.
 * - 2026-03-08: Added `readSkillContent` and `saveSkillContent` IPC handlers for reading/writing SKILL.md content from the renderer skill editor.
 * - 2026-03-06: Heartbeat job starts now require explicit `chatId`; workspace load no longer auto-starts heartbeat jobs from persisted world state.
 * - 2026-03-06: Removed runtime queue-resume fallback to persisted `currentChatId`; Electron now resumes chat queues only for explicitly selected sessions.
 * - 2026-03-04: Extended `sendChatMessage` IPC response with queue metadata (`queueStatus`, `queueRetryCount`) for queue-failure visibility.
 * - 2026-03-15: Normalized `world:import` folder selection to a guaranteed string and removed unsafe GitHub source metadata casts so TypeScript checks stay aligned with agent/skill imports.
 * - 2026-03-10: Suppressed restore-time auto-resume during edit/delete message mutations so failed user-last turns cannot replay before storage mutation.
 * - 2026-02-28: `message:edit` now resolves and passes the active subscribed world into core edit resubmission so edited turns publish on the same realtime emitter the renderer listens to.
 * - 2026-02-26: Added env-derived renderer logging config endpoint and replaced session/message console traces with categorized injected logger calls.
 * - 2026-02-25: Added optional `world:import` source support for GitHub shorthand (`@awesome-agent-world/<world-name>`) via secure temp staging.
 * - 2026-02-20: Enforced options-only `hitl:respond` handler payload validation.
 * - 2026-02-19: Simplified desktop world export to file-storage-only (removed SQLite export option).
 * - 2026-02-19: Added CLI-parity world import/export handlers for folder-validated imports, id/name conflict checks, and storage-target export flows.
 * - 2026-02-18: Updated `agent:create` fallback defaults to inherit provider/model from the world chat LLM settings.
 * - 2026-02-16: Added optional `projectPath` filter support for `listSkillRegistry` so project-scope skill discovery can follow the currently selected project folder.
 * - 2026-02-16: Added `session:branchFromMessage` IPC handler to create a branched chat and copy source-chat messages up to an assistant message.
 * - 2026-02-16: Updated `listSkillRegistry` to return scope-filtered skills (global/project) using the same env-driven rules as system-prompt skill injection.
 * - 2026-02-23: Removed redundant message-existence pre-check from `editMessageInChat` to fix "404 Message not found" false positives.
 *   - Pre-check used core `getMemory` (requires world in runtime store) which could fail when message exists in SQLite.
 *   - `editUserMessage` uses `getActiveSubscribedWorld` fallback making it resilient; pre-check was redundant.
 * - 2026-02-15: Aligned `message:edit` IPC preconditions with web/API semantics.
 *   - Validates chat existence before edit delegation.
 * - 2026-02-14: Added `hitl:respond` IPC handler to resolve core pending HITL option requests from renderer selections.
 * - 2026-02-14: Added `listSkillRegistry` IPC handler to sync/read core skill registry entries for empty-chat welcome rendering.
 * - 2026-02-14: Simplified edit-message IPC flow to delegate to core `editUserMessage` without runtime subscription refresh/rebind side effects.
 * - 2026-02-13: Added `message:edit` IPC handler that delegates user-message edit/resubmission to core so client flows stay thin.
 * - 2026-02-13: Refreshed world subscriptions after message-chain deletion so runtime agent memory stays aligned with persisted storage during edit resubmits.
 * - 2026-02-13: Added stop-message IPC handler to cancel active session processing by `worldId` and `chatId`.
 * - 2026-02-13: Tightened workspace-state dependency typing to avoid unsafe casts at composition boundaries.
 * - 2026-02-13: Awaited core-runtime readiness in all handlers to serialize workspace/runtime transitions before IPC work.
 * - 2026-02-12: Extracted IPC handler implementations from `electron/main.ts`.
 */

import * as fs from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import {
  normalizeSessionMessages,
  serializeAgentSummary,
  serializeChatsWithMessageCounts,
  serializeMessage,
  serializeWorldInfo,
  toIsoTimestamp
} from './message-serialization.js';
import { discoverLocalSkillFolders } from './local-skill-discovery.js';
import {
  getInitialSkillPreviewFilePath,
  getSkillRootPath,
  readSkillFolderEntries,
  readSkillFolderFiles,
  resolveSkillFilePath,
  writeSkillFilesToTarget,
} from './skill-file-helpers.js';
import { parseSkillDescriptionFromMarkdown, parseSkillNameFromMarkdown } from './skill-markdown.js';

interface BrowserWindowLike {
  isDestroyed?: () => boolean;
}

interface WorkspaceStateLike {
  workspacePath: string | null;
  storagePath: string | null;
  coreInitialized: boolean;
}

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

interface LoggerLike {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

const NOOP_LOGGER: LoggerLike = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

type ResolvedSkillImportSource = {
  resolvedSkillFolder: string;
  sourceMetadata: Record<string, unknown> | null;
  targetSkillName: string;
  cleanup: () => Promise<void>;
};

const VALID_LOG_LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];
const VALID_LOG_LEVEL_SET = new Set<LogLevel>(VALID_LOG_LEVELS);
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:', 'sms:', 'xmpp:', 'callto:']);

function normalizeCategoryKey(raw: string): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');
}

function toLogLevel(value: unknown): LogLevel | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase() as LogLevel;
  return VALID_LOG_LEVEL_SET.has(normalized) ? normalized : null;
}

function getRendererLoggingConfigFromEnv(): {
  globalLevel: LogLevel;
  categoryLevels: Record<string, LogLevel>;
  nodeEnv: string;
} {
  const globalLevel = toLogLevel(process.env.LOG_LEVEL) || 'error';
  const categoryLevels: Record<string, LogLevel> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('LOG_') || key === 'LOG_LEVEL') continue;
    const level = toLogLevel(value);
    if (!level) continue;
    const category = normalizeCategoryKey(key.slice(4).toLowerCase().replace(/_/g, '.'));
    if (!category) continue;
    categoryLevels[category] = level;
  }

  const nodeEnv = String(process.env.NODE_ENV || 'development').trim() || 'development';
  return { globalLevel, categoryLevels, nodeEnv };
}

function normalizeExternalUrl(rawUrl: unknown): string {
  const urlText = String(rawUrl ?? '').trim();
  if (!urlText) {
    throw new Error('External URL is required.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlText);
  } catch {
    throw new Error('External URL must be absolute.');
  }

  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new Error(`Unsupported external URL protocol: ${parsedUrl.protocol}`);
  }

  return parsedUrl.toString();
}

function getCanonicalGlobalSkillRoot(): string {
  return path.join(homedir(), '.agent-world', 'skills');
}

function getDefaultGlobalSkillRoots(): string[] {
  return [
    getCanonicalGlobalSkillRoot(),
  ];
}

function getCanonicalProjectSkillRoot(projectPath: string): string {
  return path.join(path.resolve(projectPath), '.agent-world', 'skills');
}

function getDefaultProjectSkillRoots(projectPath: string): string[] {
  return [
    getCanonicalProjectSkillRoot(projectPath),
  ];
}

async function defaultOpenExternalUrl(url: string) {
  const electronModule = await import('electron');
  const openExternal = electronModule.shell?.openExternal
    ?? electronModule.default?.shell?.openExternal;
  if (typeof openExternal !== 'function') {
    throw new Error('Electron shell.openExternal is unavailable.');
  }
  await openExternal(url);
}

async function getElectronDialogCompat() {
  const electronModule = await import('electron');
  const electronDialog = electronModule.dialog
    ?? electronModule.default?.dialog;
  if (!electronDialog) {
    throw new Error('Electron dialog is unavailable.');
  }

  return electronDialog;
}

async function showOpenDialogCompat(
  mainWindow: BrowserWindowLike,
  options: Record<string, unknown>
) {
  const electronDialog = await getElectronDialogCompat();
  const showOpenDialog = electronDialog.showOpenDialog;
  if (typeof showOpenDialog !== 'function') {
    throw new Error('Electron dialog.showOpenDialog is unavailable.');
  }

  return await showOpenDialog(mainWindow as any, options as any);
}

async function showMessageBoxCompat(
  mainWindow: BrowserWindowLike,
  options: Record<string, unknown>
) {
  const electronDialog = await getElectronDialogCompat();
  const showMessageBox = electronDialog.showMessageBox;
  if (typeof showMessageBox !== 'function') {
    throw new Error('Electron dialog.showMessageBox is unavailable.');
  }

  return await showMessageBox(mainWindow as any, options as any);
}

interface MainIpcHandlerFactoryDependencies {
  ensureCoreReady: () => Promise<void> | void;
  getWorkspaceState: () => WorkspaceStateLike;
  getMainWindow: () => BrowserWindowLike | null;
  removeWorldSubscriptions: (worldId: string) => Promise<void>;
  refreshWorldSubscription: (worldId: string) => Promise<string | null>;
  ensureWorldSubscribed: (worldId: string) => Promise<any>;
  createAgent: (worldId: string, params: Record<string, unknown>) => Promise<any>;
  createWorld: (params: Record<string, unknown>) => Promise<any>;
  deleteAgent: (worldId: string, agentId: string) => Promise<boolean>;
  deleteChat: (worldId: string, chatId: string) => Promise<boolean>;
  updateAgent: (worldId: string, agentId: string, updates: Record<string, unknown>) => Promise<any>;
  deleteWorld: (worldId: string) => Promise<boolean>;
  getMemory: (worldId: string, chatId: string | null) => Promise<any>;
  getWorld: (worldId: string) => Promise<any>;
  listChats: (worldId: string) => Promise<any[]>;
  listWorlds: () => Promise<any[]>;
  getSkillSourceScope: (skillId: string) => 'global' | 'project' | undefined;
  getSkillSourcePath: (skillId: string) => string | undefined;
  getSkillsForSystemPrompt: (options?: {
    includeGlobal?: boolean;
    includeProject?: boolean;
    userSkillRoots?: string[];
    projectSkillRoots?: string[];
    worldVariablesText?: string;
  }) => any[];
  syncSkills: (options?: {
    userSkillRoots?: string[];
    projectSkillRoots?: string[];
    worldVariablesText?: string;
  }) => Promise<any> | any;
  newChat: (worldId: string) => Promise<any>;
  branchChatFromMessage: (worldId: string, sourceChatId: string, messageId: string) => Promise<any>;
  enqueueAndProcessUserTurn: (worldId: string, chatId: string, content: string, sender: string, targetWorld?: any) => Promise<any>;
  submitWorldHitlResponse: (params: { worldId: string; requestId: string; optionId: string; chatId?: string | null }) => {
    accepted: boolean;
    reason?: string;
  };
  stopMessageProcessing: (worldId: string, chatId: string) => Promise<any> | any;
  activateChatWithSnapshot: (worldId: string, chatId: string) => Promise<{ world: any; chatId: string; hitlPrompts: any[] } | null>;
  restoreChat: (worldId: string, chatId: string, options?: { suppressAutoResume?: boolean }) => Promise<any>;
  updateWorld: (worldId: string, updates: Record<string, unknown>) => Promise<any>;
  editUserMessage: (worldId: string, messageId: string, newContent: string, chatId: string, targetWorld?: any) => Promise<any>;
  removeMessagesFrom: (worldId: string, messageId: string, chatId: string) => Promise<any>;
  addToQueue: (worldId: string, chatId: string, content: string, sender?: string) => Promise<any>;
  getQueueMessages: (worldId: string, chatId: string) => Promise<any[]>;
  removeFromQueue: (worldId: string, messageId: string) => Promise<any>;
  pauseChatQueue: (worldId: string, chatId: string) => Promise<any>;
  resumeChatQueue: (worldId: string, chatId: string) => Promise<any>;
  stopChatQueue: (worldId: string, chatId: string) => Promise<any>;
  clearChatQueue: (worldId: string, chatId: string) => Promise<any>;
  retryQueueMessage: (worldId: string, messageId: string, chatId: string) => Promise<any>;
  openExternalUrl?: (url: string) => Promise<void> | void;
  createStorage: (config: any) => Promise<any>;
  createStorageFromEnv: () => Promise<any>;
  loggerIpc?: LoggerLike;
  loggerIpcSession?: LoggerLike;
  loggerIpcMessages?: LoggerLike;
  GitHubWorldImportError: new (...args: any[]) => GitHubWorldImportErrorLike;
  stageGitHubWorldFromShorthand: (shorthand: string) => Promise<GitHubWorldImportStagedResult>;
  stageGitHubFolderFromRepo: (
    repoInput: string,
    folderPath: string,
    options?: { folderName?: string }
  ) => Promise<GitHubFolderImportStagedResult>;
  listGitHubDirectoryNames: (repoInput: string, directoryPath: string) => Promise<{ directoryNames: string[]; fileNames?: string[] }>;
  heartbeatManager: {
    startJob: (world: any, chatId: string) => { started: boolean; reason: string | null; job: { status: 'running' | 'paused' | 'stopped' } | null };
    restartJob: (world: any, chatId: string) => { started: boolean; reason: string | null; job: { status: 'running' | 'paused' | 'stopped' } | null };
    pauseJob: (worldId: string) => void;
    resumeJob: (worldId: string) => void;
    stopJob: (worldId: string) => void;
    stopAll: () => void;
    listJobs: () => Array<{ worldId: string; worldName: string; interval: string; status: 'running' | 'paused' | 'stopped'; runCount: number }>;
  };
}

function syncRuntimeWorldHeartbeatConfig(runtimeWorld: any, persistedWorld: any) {
  if (!runtimeWorld || !persistedWorld) {
    return runtimeWorld;
  }

  runtimeWorld.name = persistedWorld.name ?? runtimeWorld.name;
  runtimeWorld.heartbeatEnabled = persistedWorld.heartbeatEnabled === true;
  runtimeWorld.heartbeatInterval = persistedWorld.heartbeatInterval ?? null;
  runtimeWorld.heartbeatPrompt = persistedWorld.heartbeatPrompt ?? null;
  return runtimeWorld;
}

function sanitizeWorldForExport(world: any): any {
  if (!world || typeof world !== 'object') {
    return world;
  }

  const {
    variables,
    currentChatId,
    env,
    ...exportableWorld
  } = world;

  return exportableWorld;
}

interface GitHubWorldImportSource {
  shorthand: string;
  owner: string;
  repo: string;
  branch: string;
  worldPath: string;
  commitSha: string | null;
}

interface GitHubWorldImportStagedResult {
  stagingRootPath: string;
  worldFolderPath: string;
  source: GitHubWorldImportSource;
  cleanup: () => Promise<void>;
}

interface GitHubWorldImportErrorLike extends Error {
  code?: string;
  details?: Record<string, unknown>;
}

interface GitHubFolderImportSource {
  repoInput: string;
  owner: string;
  repo: string;
  branch: string;
  folderPath: string;
  commitSha: string | null;
}

interface GitHubFolderImportStagedResult {
  stagingRootPath: string;
  folderPath: string;
  source: GitHubFolderImportSource;
  cleanup: () => Promise<void>;
}

export function toImportSourceMetadata(source: GitHubWorldImportSource | GitHubFolderImportSource): Record<string, unknown> {
  return { ...source };
}

export function createMainIpcHandlers(dependencies: MainIpcHandlerFactoryDependencies) {
  const {
    ensureCoreReady,
    getWorkspaceState,
    getMainWindow,
    removeWorldSubscriptions,
    refreshWorldSubscription,
    ensureWorldSubscribed,
    createAgent,
    createWorld,
    deleteAgent,
    deleteChat,
    updateAgent,
    deleteWorld,
    getMemory,
    getWorld,
    listChats,
    listWorlds,
    getSkillSourceScope,
    getSkillSourcePath,
    getSkillsForSystemPrompt,
    syncSkills,
    newChat,
    branchChatFromMessage,
    enqueueAndProcessUserTurn,
    submitWorldHitlResponse,
    stopMessageProcessing,
    activateChatWithSnapshot,
    restoreChat,
    updateWorld,
    editUserMessage,
    removeMessagesFrom,
    addToQueue,
    getQueueMessages,
    removeFromQueue,
    pauseChatQueue,
    resumeChatQueue,
    stopChatQueue,
    clearChatQueue,
    retryQueueMessage,
    openExternalUrl = defaultOpenExternalUrl,
    createStorage,
    createStorageFromEnv,
    loggerIpc = NOOP_LOGGER,
    loggerIpcSession = NOOP_LOGGER,
    loggerIpcMessages = NOOP_LOGGER,
    GitHubWorldImportError,
    stageGitHubWorldFromShorthand,
    stageGitHubFolderFromRepo,
    listGitHubDirectoryNames,
    heartbeatManager
  } = dependencies;

  interface StorageLike {
    saveWorld: (worldData: any) => Promise<void>;
    loadWorld: (worldId: string) => Promise<any>;
    deleteWorld: (worldId: string) => Promise<boolean>;
    listWorlds: () => Promise<any[]>;
    saveAgent: (worldId: string, agent: any) => Promise<void>;
    listAgents: (worldId: string) => Promise<any[]>;
    saveChatData: (worldId: string, chat: any) => Promise<void>;
    listChats: (worldId: string) => Promise<any[]>;
    eventStorage?: {
      getEventsByWorldAndChat: (worldId: string, chatId: string | null) => Promise<any[]>;
      saveEvents: (events: any[]) => Promise<void>;
    };
  }

  function isDirectoryOnDisk(folderPath: string): boolean {
    if (!fs.existsSync(folderPath)) {
      return false;
    }
    try {
      return fs.statSync(folderPath).isDirectory();
    } catch {
      return false;
    }
  }

  function resolveUserPath(rawPath: string): string {
    const normalizedPath = String(rawPath || '').trim();
    if (!normalizedPath) {
      return '';
    }

    const expandedPath = normalizedPath === '~'
      ? homedir()
      : (normalizedPath.startsWith('~/') || normalizedPath.startsWith('~\\'))
        ? path.join(homedir(), normalizedPath.slice(2))
        : normalizedPath;

    return path.resolve(path.normalize(expandedPath));
  }

  function getWorldFolderValidationError(worldFolderPath: string): string | null {
    if (!isDirectoryOnDisk(worldFolderPath)) {
      return 'Selected path is not a folder';
    }
    const configPath = path.join(worldFolderPath, 'config.json');
    if (!fs.existsSync(configPath)) {
      return 'Selected folder does not contain a valid world (missing config.json)';
    }
    return null;
  }

  function getAgentFolderValidationError(agentFolderPath: string): string | null {
    if (!isDirectoryOnDisk(agentFolderPath)) {
      return 'Selected path is not a folder';
    }
    const configPath = path.join(agentFolderPath, 'config.json');
    if (!fs.existsSync(configPath)) {
      return 'Selected folder does not contain a valid agent (missing config.json)';
    }
    return null;
  }

  function getSkillFolderValidationError(skillFolderPath: string): string | null {
    if (!isDirectoryOnDisk(skillFolderPath)) {
      return 'Selected path is not a folder';
    }
    const skillPath = path.join(skillFolderPath, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      return 'Selected folder does not contain a valid skill (missing SKILL.md)';
    }
    return null;
  }

  function normalizeImportItemName(value: unknown, label: string): string {
    const normalized = String(value || '').trim().replace(/^\/+|\/+$/g, '');
    if (!normalized) {
      throw new Error(`${label} is required.`);
    }
    if (normalized === '.' || normalized === '..' || normalized.includes('/') || normalized.includes('\\')) {
      throw new Error(`${label} must be a single folder name.`);
    }
    return normalized;
  }

  function getGitHubRepoName(repoInput: unknown): string {
    const trimmedRepo = String(repoInput || '').trim().replace(/^https?:\/\/github\.com\//i, '');
    const [repoPart] = trimmedRepo.split('#', 2);
    const normalizedRepoPart = String(repoPart || '').trim().replace(/^\/+|\/+$/g, '');
    const segments = normalizedRepoPart
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);

    return segments.length >= 2 ? segments[1] || '' : '';
  }

  function buildGitHubFolderCandidates(kind: 'world' | 'agent' | 'skill', itemName: string, repoInput = ''): string[] {
    if (kind === 'world') {
      return [`data/worlds/${itemName}`, `worlds/${itemName}`, itemName];
    }
    if (kind === 'agent') {
      return [`agents/${itemName}`, `data/agents/${itemName}`, itemName];
    }

    return [
      `.agent-world/skills/${itemName}`,
      `skills/${itemName}`,
      itemName,
    ];
  }

  async function stageGitHubRootSkill(repoInput: string, folderName: string): Promise<GitHubFolderImportStagedResult | null> {
    try {
      return await stageGitHubFolderFromRepo(repoInput, 'SKILL.md', { folderName });
    } catch (error) {
      if (error instanceof GitHubWorldImportError && error.message && (error as GitHubWorldImportErrorLike).details) {
        const typedError = error as GitHubWorldImportErrorLike;
        if ((typedError as any).code === 'source-not-found') {
          return null;
        }
      }
      throw error;
    }
  }

  async function readGitHubRootSkillMetadata(repoInput: string, folderName?: string): Promise<{
    skillName: string;
    description: string;
    repoName: string;
    stagedSkill: GitHubFolderImportStagedResult;
  } | null> {
    const fallbackFolderName = String(folderName || getGitHubRepoName(repoInput) || 'skill').trim() || 'skill';
    const stagedSkill = await stageGitHubRootSkill(repoInput, fallbackFolderName);
    if (!stagedSkill) {
      return null;
    }

    try {
      const skillFilePath = path.join(stagedSkill.folderPath, 'SKILL.md');
      const markdown = await fs.promises.readFile(skillFilePath, 'utf8');
      const skillName = parseSkillNameFromMarkdown(markdown) || getGitHubRepoName(repoInput);
      const description = parseSkillDescriptionFromMarkdown(markdown);

      return {
        skillName: String(skillName || '').trim(),
        description: String(description || '').trim(),
        repoName: String(getGitHubRepoName(repoInput) || '').trim(),
        stagedSkill,
      };
    } catch (error) {
      await stagedSkill.cleanup();
      throw error;
    }
  }

  async function listGitHubSkillDirectoryNamesIfPresent(repo: string, directoryPath: string): Promise<string[]> {
    try {
      const result = await listGitHubDirectoryNames(repo, directoryPath);
      return Array.isArray(result.directoryNames)
        ? result.directoryNames.map((value) => String(value || '').trim()).filter(Boolean)
        : [];
    } catch (error) {
      if (error instanceof GitHubWorldImportError && (error as GitHubWorldImportErrorLike).code === 'source-not-found') {
        return [];
      }
      throw error;
    }
  }

  async function readGitHubSkillDescription(repoInput: string, folderPath: string, folderName: string): Promise<string> {
    const stagedSkill = await stageGitHubFolderFromRepo(repoInput, folderPath, { folderName });

    try {
      const skillFilePath = path.join(stagedSkill.folderPath, 'SKILL.md');
      const markdown = await fs.promises.readFile(skillFilePath, 'utf8');
      return String(parseSkillDescriptionFromMarkdown(markdown) || '').trim();
    } catch {
      return '';
    } finally {
      await stagedSkill.cleanup();
    }
  }

  function toDateOrUndefined(value: unknown): Date | undefined {
    if (value instanceof Date) return value;
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  async function readOptionalTextFile(filePath: string): Promise<string | undefined> {
    try {
      return await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }

  async function readOptionalJsonFile<T>(filePath: string): Promise<T | undefined> {
    const content = await readOptionalTextFile(filePath);
    if (content == null) {
      return undefined;
    }
    return JSON.parse(content) as T;
  }

  async function loadStandaloneAgentFromFolder(agentFolderPath: string): Promise<any> {
    const configPath = path.join(agentFolderPath, 'config.json');
    const config = JSON.parse(await fs.promises.readFile(configPath, 'utf8')) as Record<string, unknown>;
    const memory = await readOptionalJsonFile<any[]>(path.join(agentFolderPath, 'memory.json'));
    const systemPrompt = await readOptionalTextFile(path.join(agentFolderPath, 'system-prompt.md'));
    const fallbackId = path.basename(agentFolderPath);
    const agentId = String(config.id || fallbackId).trim();
    const agentName = String(config.name || agentId).trim();

    if (!agentId) {
      throw new Error('Agent config is missing id.');
    }
    if (!agentName) {
      throw new Error('Agent config is missing name.');
    }

    return {
      ...config,
      id: agentId,
      name: agentName,
      type: String(config.type || 'assistant').trim() || 'assistant',
      provider: String(config.provider || '').trim(),
      model: String(config.model || '').trim(),
      systemPrompt: systemPrompt ?? (typeof config.systemPrompt === 'string' ? config.systemPrompt : undefined),
      temperature: typeof config.temperature === 'number' ? config.temperature : undefined,
      maxTokens: typeof config.maxTokens === 'number' ? config.maxTokens : undefined,
      autoReply: typeof config.autoReply === 'boolean' ? config.autoReply : undefined,
      status: typeof config.status === 'string' ? config.status : undefined,
      createdAt: toDateOrUndefined(config.createdAt),
      lastActive: toDateOrUndefined(config.lastActive),
      lastLLMCall: toDateOrUndefined(config.lastLLMCall),
      llmCallCount: Number.isFinite(Number(config.llmCallCount)) ? Number(config.llmCallCount) : 0,
      memory: Array.isArray(memory) ? memory : [],
    };
  }

  async function stageGitHubImportFolder(
    kind: 'world' | 'agent' | 'skill',
    payload?: { source?: unknown; repo?: unknown; itemName?: unknown }
  ): Promise<GitHubFolderImportStagedResult | GitHubWorldImportStagedResult | null> {
    const source = String(payload?.source || '').trim();
    const repo = String(payload?.repo || '').trim();
    const itemName = String(payload?.itemName || '').trim();

    if (kind === 'world' && source.startsWith('@') && !repo && !itemName) {
      return stageGitHubWorldFromShorthand(source);
    }

    if (!repo) {
      return null;
    }

    const normalizedRepo = repo;
    const normalizedItemName = normalizeImportItemName(itemName, `${kind[0].toUpperCase()}${kind.slice(1)} name`);
    const candidates = buildGitHubFolderCandidates(kind, normalizedItemName, normalizedRepo);
    let lastNotFoundError: GitHubWorldImportErrorLike | null = null;

    for (const folderPath of candidates) {
      try {
        return await stageGitHubFolderFromRepo(normalizedRepo, folderPath, { folderName: normalizedItemName });
      } catch (error) {
        if (error instanceof GitHubWorldImportError && error.message && (error as GitHubWorldImportErrorLike).details) {
          const typedError = error as GitHubWorldImportErrorLike;
          if ((typedError as any).code === 'source-not-found') {
            lastNotFoundError = typedError;
            continue;
          }
        }
        throw error;
      }
    }

    if (kind === 'skill') {
      const rootSkillMetadata = await readGitHubRootSkillMetadata(normalizedRepo, normalizedItemName);
      if (rootSkillMetadata) {
        const normalizedRootSkillName = normalizeImportItemName(rootSkillMetadata.skillName, 'Skill name');
        const normalizedRepoName = rootSkillMetadata.repoName
          ? normalizeImportItemName(rootSkillMetadata.repoName, 'Skill name')
          : '';
        if (normalizedRootSkillName === normalizedItemName || normalizedRepoName === normalizedItemName) {
          return rootSkillMetadata.stagedSkill;
        }

        await rootSkillMetadata.stagedSkill.cleanup();
      }
    }

    if (lastNotFoundError) {
      throw lastNotFoundError;
    }

    return null;
  }

  function resolveRequestedSkillName(payload?: { source?: unknown; repo?: unknown; itemName?: unknown }): string {
    const requestedItemName = String(payload?.itemName || '').trim();
    if (requestedItemName) {
      return normalizeImportItemName(requestedItemName, 'Skill name');
    }

    const requestedSource = String(payload?.source || '').trim();
    if (requestedSource) {
      return normalizeImportItemName(path.basename(requestedSource), 'Skill name');
    }

    throw new Error('Skill name is required.');
  }

  async function resolveSkillImportSource(
    mainWindow: BrowserWindowLike,
    payload?: { source?: unknown; repo?: unknown; itemName?: unknown }
  ): Promise<ResolvedSkillImportSource | null> {
    const requestedSource = String(payload?.source || '').trim();
    const requestedRepo = String(payload?.repo || '').trim();
    const requestedItemName = String(payload?.itemName || '').trim();
    const selectedSkillFolder = requestedSource || requestedRepo || requestedItemName
      ? requestedSource
      : await pickTargetDirectory(mainWindow, 'Import Skill Folder', 'Import');

    if (!selectedSkillFolder && !requestedRepo && !requestedItemName) {
      return null;
    }

    let stagedGitHubFolder: GitHubFolderImportStagedResult | null = null;

    try {
      let resolvedSkillFolder = selectedSkillFolder
        ? resolveUserPath(selectedSkillFolder)
        : '';
      let sourceMetadata: Record<string, unknown> | null = null;

      const stagedGitHubImport = await stageGitHubImportFolder('skill', payload);
      if (stagedGitHubImport) {
        if ('folderPath' in stagedGitHubImport) {
          stagedGitHubFolder = stagedGitHubImport;
          resolvedSkillFolder = path.resolve(path.normalize(stagedGitHubImport.folderPath));
          sourceMetadata = {
            ...stagedGitHubImport.source,
            itemName: requestedItemName || path.basename(stagedGitHubImport.folderPath),
          };
        } else {
          throw new Error('Skill GitHub import requires an explicit repo and skill name.');
        }
      }

      const validationError = getSkillFolderValidationError(resolvedSkillFolder);
      if (validationError) {
        throw new Error(validationError);
      }

      const targetSkillName = requestedItemName
        ? normalizeImportItemName(requestedItemName, 'Skill name')
        : normalizeImportItemName(path.basename(resolvedSkillFolder), 'Skill name');

      return {
        resolvedSkillFolder,
        sourceMetadata,
        targetSkillName,
        cleanup: async () => {
          if (stagedGitHubFolder) {
            await stagedGitHubFolder.cleanup();
          }
        },
      };
    } catch (error) {
      if (stagedGitHubFolder) {
        await stagedGitHubFolder.cleanup();
      }
      throw error;
    }
  }

  async function promptForOverwrite(
    mainWindow: BrowserWindowLike,
    title: string,
    message: string,
    detail?: string
  ): Promise<boolean> {
    const confirmation = await showMessageBoxCompat(mainWindow, {
      type: 'warning',
      title,
      message,
      detail,
      buttons: ['Overwrite', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    });
    return confirmation.response === 0;
  }

  async function pickTargetDirectory(mainWindow: BrowserWindowLike, title: string, buttonLabel: string): Promise<string | null> {
    const result = await showOpenDialogCompat(mainWindow, {
      title,
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0] || null;
  }

  async function ensureDeleteExistingTarget(targetPath: string, worldId: string): Promise<void> {
    const worldPath = path.join(targetPath, worldId);
    if (fs.existsSync(worldPath)) {
      fs.rmSync(worldPath, { recursive: true, force: true });
    }
  }

  async function startHeartbeatJobsForWorkspace(worlds: any[]): Promise<void> {
    const worldList = Array.isArray(worlds) ? worlds : [];
    for (const world of worldList) {
      const worldId = String(world?.id || '').trim();
      if (!worldId) continue;
      heartbeatManager.stopJob(worldId);
    }
  }

  async function loadWorldsFromWorkspace() {
    try {
      await ensureCoreReady();

      const worlds = await listWorlds();
      if (!worlds || worlds.length === 0) {
        return {
          success: false,
          error: 'No worlds found in this folder',
          message: 'No worlds found in this folder. Please open a folder containing an Agent World.',
          worlds: []
        };
      }

      const sortedWorlds = [...worlds].sort((a, b) => a.name.localeCompare(b.name));
      await startHeartbeatJobsForWorkspace(sortedWorlds);

      return {
        success: true,
        worlds: sortedWorlds.map((w) => ({ id: w.id, name: w.name }))
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message || 'Unknown error',
        message: `Failed to load worlds: ${err.message || 'Unknown error'}`,
        worlds: []
      };
    }
  }

  async function loadSpecificWorld(worldId: string) {
    try {
      await ensureCoreReady();

      const world = await getWorld(worldId);
      if (!world) {
        return {
          success: false,
          error: 'Failed to load world',
          message: `Failed to load world '${worldId}'. The world data may be corrupted.`
        };
      }

      // Ensure runtime is subscribed, but leave queue resumption to explicit session selection.
      await ensureWorldSubscribed(world.id);

      const chats = await listChats(world.id);
      const sessions = await serializeChatsWithMessageCounts(world.id, chats, getMemory);

      return {
        success: true,
        world: serializeWorldInfo(world),
        sessions
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message || 'Unknown error',
        message: `Failed to load world: ${err.message || 'Unknown error'}`
      };
    }
  }

  function normalizeOptionalPath(rawPath: unknown): string {
    return rawPath == null ? '' : String(rawPath).trim();
  }

  function getPickDirectoryDefaultPath(payload?: unknown): string {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return '';
    }

    return normalizeOptionalPath((payload as { defaultPath?: unknown }).defaultPath);
  }

  async function pickDirectoryDialog(payload?: unknown) {
    const defaultPath = getPickDirectoryDefaultPath(payload);
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error('Main window not initialized');
    const result = await showOpenDialogCompat(mainWindow, {
      title: 'Open Folder',
      properties: ['openDirectory', 'createDirectory'],
      ...(defaultPath ? { defaultPath } : {}),
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, directoryPath: null };
    }

    const selectedPath = result.filePaths[0];
    if (!selectedPath) {
      return { canceled: true, directoryPath: null };
    }

    return {
      canceled: false,
      directoryPath: selectedPath
    };
  }

  async function openWorkspaceDialog(payload?: unknown) {
    const providedDirectoryPath = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? normalizeOptionalPath((payload as { directoryPath?: unknown }).directoryPath)
      : '';

    if (providedDirectoryPath) {
      return {
        ...getWorkspaceState(),
        canceled: false,
        workspacePath: providedDirectoryPath
      };
    }

    const picked = await pickDirectoryDialog();

    if (picked.canceled || !picked.directoryPath) {
      return { ...getWorkspaceState(), canceled: true };
    }

    return {
      ...getWorkspaceState(),
      canceled: false,
      workspacePath: picked.directoryPath
    };
  }

  async function listWorkspaceWorlds() {
    await ensureCoreReady();
    const worlds = await listWorlds();
    await startHeartbeatJobsForWorkspace(worlds);
    return worlds.map((world) => serializeWorldInfo(world));
  }

  async function listSkillRegistry(payload?: unknown) {
    await ensureCoreReady();
    const normalizedPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as { includeGlobalSkills?: unknown; includeProjectSkills?: unknown; worldId?: unknown }
      : null;

    const includeGlobalSkills = typeof normalizedPayload?.includeGlobalSkills === 'boolean'
      ? normalizedPayload.includeGlobalSkills
      : String(process.env.AGENT_WORLD_ENABLE_GLOBAL_SKILLS ?? 'true').toLowerCase() !== 'false';
    const includeProjectSkills = typeof normalizedPayload?.includeProjectSkills === 'boolean'
      ? normalizedPayload.includeProjectSkills
      : String(process.env.AGENT_WORLD_ENABLE_PROJECT_SKILLS ?? 'true').toLowerCase() !== 'false';

    const requestedWorldId = typeof normalizedPayload?.worldId === 'string'
      ? normalizedPayload.worldId.trim()
      : '';
    let worldVariablesText = '';
    if (requestedWorldId.length > 0) {
      try {
        const scopedWorld = await getWorld(requestedWorldId);
        worldVariablesText = typeof scopedWorld?.variables === 'string' ? scopedWorld.variables : '';
      } catch {
        worldVariablesText = '';
      }
    }

    await syncSkills({ worldVariablesText });

    const scopedSkills = getSkillsForSystemPrompt({
      includeGlobal: includeGlobalSkills,
      includeProject: includeProjectSkills,
      worldVariablesText,
    });
    const skills = Array.isArray(scopedSkills) ? scopedSkills : [];
    return skills
      .map((skill) => ({
        skill_id: String(skill?.skill_id || '').trim(),
        description: String(skill?.description || '').trim(),
        hash: String(skill?.hash || '').trim(),
        lastUpdated: String(skill?.lastUpdated || '').trim(),
        sourceScope: getSkillSourceScope(String(skill?.skill_id || '').trim()) || 'global'
      }))
      .filter((skill) => skill.skill_id.length > 0);
  }

  async function createWorkspaceWorld(payload: any) {
    await ensureCoreReady();
    const name = String(payload?.name || '').trim();
    if (!name) {
      throw new Error('World name is required.');
    }

    const turnLimitRaw = Number(payload?.turnLimit ?? 5);
    const turnLimit = Number.isFinite(turnLimitRaw) && turnLimitRaw > 0
      ? Math.floor(turnLimitRaw)
      : 5;
    const chatLLMProvider = payload?.chatLLMProvider == null
      ? undefined
      : String(payload.chatLLMProvider || '').trim() || undefined;
    const chatLLMModel = payload?.chatLLMModel == null
      ? undefined
      : String(payload.chatLLMModel || '').trim() || undefined;
    const mainAgent = payload?.mainAgent == null
      ? null
      : String(payload.mainAgent || '').trim() || null;
    const mcpConfig = payload?.mcpConfig == null
      ? undefined
      : String(payload.mcpConfig);
    const variables = payload?.variables == null
      ? undefined
      : String(payload.variables);

    const created = await createWorld({
      name,
      description: payload?.description ? String(payload.description) : undefined,
      turnLimit,
      mainAgent,
      chatLLMProvider,
      chatLLMModel,
      mcpConfig,
      variables
    });

    if (!created) {
      throw new Error('Failed to create world.');
    }

    return serializeWorldInfo(created);
  }

  async function updateWorkspaceWorld(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '');
    if (!worldId) {
      throw new Error('World ID is required.');
    }

    const updates: Record<string, unknown> = {};

    if (payload?.name !== undefined) {
      const name = String(payload.name || '').trim();
      if (!name) {
        throw new Error('World name is required.');
      }
      updates.name = name;
    }

    if (payload?.description !== undefined) {
      updates.description = String(payload.description || '').trim();
    }

    if (payload?.turnLimit !== undefined) {
      const turnLimitRaw = Number(payload.turnLimit);
      const turnLimit = Number.isFinite(turnLimitRaw) && turnLimitRaw > 0
        ? Math.floor(turnLimitRaw)
        : 5;
      updates.turnLimit = turnLimit;
    }

    if (payload?.mainAgent !== undefined) {
      const mainAgent = payload.mainAgent == null
        ? null
        : String(payload.mainAgent || '').trim() || null;
      updates.mainAgent = mainAgent;
    }

    if (payload?.chatLLMProvider !== undefined) {
      const provider = payload.chatLLMProvider == null
        ? undefined
        : String(payload.chatLLMProvider || '').trim() || undefined;
      updates.chatLLMProvider = provider;
    }

    if (payload?.chatLLMModel !== undefined) {
      const model = payload.chatLLMModel == null
        ? undefined
        : String(payload.chatLLMModel || '').trim() || undefined;
      updates.chatLLMModel = model;
    }

    if (payload?.mcpConfig !== undefined) {
      updates.mcpConfig = payload.mcpConfig == null ? null : String(payload.mcpConfig);
    }

    if (payload?.variables !== undefined) {
      updates.variables = payload.variables == null ? '' : String(payload.variables);
    }

    if (payload?.heartbeatEnabled !== undefined) {
      updates.heartbeatEnabled = Boolean(payload.heartbeatEnabled);
    }

    if (payload?.heartbeatInterval !== undefined) {
      updates.heartbeatInterval = String(payload.heartbeatInterval || '').trim() || null;
    }

    if (payload?.heartbeatPrompt !== undefined) {
      updates.heartbeatPrompt = String(payload.heartbeatPrompt || '').trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      throw new Error('No world updates were provided.');
    }

    const updated = await updateWorld(worldId, updates);
    if (!updated) {
      throw new Error(`World not found: ${worldId}`);
    }

    const refreshWarning = await refreshWorldSubscription(worldId);
    heartbeatManager.stopJob(worldId);
    const hydratedWorld = await getWorld(worldId);
    const serialized = serializeWorldInfo(hydratedWorld || updated);
    if (refreshWarning) {
      return {
        ...serialized,
        refreshWarning
      };
    }
    return serialized;
  }

  async function createWorldAgent(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '');
    if (!worldId) throw new Error('World ID is required.');

    const name = String(payload?.name || '').trim();
    if (!name) throw new Error('Agent name is required.');

    const world = await getWorld(worldId);
    if (!world) throw new Error(`World not found: ${worldId}`);

    const type = String(payload?.type || 'assistant').trim() || 'assistant';
    const worldProvider = String(world?.chatLLMProvider || '').trim() || 'ollama';
    const worldModel = String(world?.chatLLMModel || '').trim() || 'llama3.2:3b';
    const provider = String(payload?.provider || worldProvider).trim() || worldProvider;
    const model = String(payload?.model || worldModel).trim() || worldModel;

    const params: Record<string, unknown> = {
      name,
      type,
      provider,
      model
    };

    if (payload?.systemPrompt !== undefined) {
      params.systemPrompt = String(payload.systemPrompt || '');
    }

    if (payload?.autoReply !== undefined) {
      params.autoReply = Boolean(payload.autoReply);
    }

    if (payload?.temperature !== undefined) {
      const temperature = Number(payload.temperature);
      if (Number.isFinite(temperature)) params.temperature = temperature;
    }

    if (payload?.maxTokens !== undefined) {
      const maxTokens = Number(payload.maxTokens);
      if (Number.isFinite(maxTokens)) params.maxTokens = Math.max(1, Math.floor(maxTokens));
    }

    const created = await createAgent(worldId, params);
    const refreshWarning = await refreshWorldSubscription(worldId);
    const serialized = serializeAgentSummary(created);
    if (refreshWarning) {
      return {
        ...serialized,
        refreshWarning,
      };
    }
    return serialized;
  }

  async function updateWorldAgent(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '');
    const agentId = String(payload?.agentId || '');
    if (!worldId) throw new Error('World ID is required.');
    if (!agentId) throw new Error('Agent ID is required.');

    const updates: Record<string, unknown> = {};

    if (payload?.name !== undefined) {
      const name = String(payload.name || '').trim();
      if (!name) throw new Error('Agent name is required.');
      updates.name = name;
    }
    if (payload?.type !== undefined) {
      const type = String(payload.type || '').trim();
      if (!type) throw new Error('Agent type is required.');
      updates.type = type;
    }
    if (payload?.provider !== undefined) {
      const provider = String(payload.provider || '').trim();
      if (!provider) throw new Error('Agent provider is required.');
      updates.provider = provider;
    }
    if (payload?.model !== undefined) {
      const model = String(payload.model || '').trim();
      if (!model) throw new Error('Agent model is required.');
      updates.model = model;
    }
    if (payload?.systemPrompt !== undefined) {
      updates.systemPrompt = String(payload.systemPrompt || '');
    }
    if (payload?.autoReply !== undefined) {
      updates.autoReply = Boolean(payload.autoReply);
    }
    if (payload?.temperature !== undefined) {
      const temperature = Number(payload.temperature);
      if (!Number.isFinite(temperature)) {
        throw new Error('Agent temperature must be a number.');
      }
      updates.temperature = temperature;
    }
    if (payload?.maxTokens !== undefined) {
      const maxTokens = Number(payload.maxTokens);
      if (!Number.isFinite(maxTokens)) {
        throw new Error('Agent max tokens must be a number.');
      }
      updates.maxTokens = Math.max(1, Math.floor(maxTokens));
    }

    if (Object.keys(updates).length === 0) {
      throw new Error('No agent updates were provided.');
    }

    const updated = await updateAgent(worldId, agentId, updates);
    if (!updated) throw new Error(`Agent not found: ${agentId}`);

    return serializeAgentSummary(updated);
  }

  async function deleteWorldAgent(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '');
    const agentId = String(payload?.agentId || '');
    if (!worldId) throw new Error('World ID is required.');
    if (!agentId) throw new Error('Agent ID is required.');

    const success = await deleteAgent(worldId, agentId);
    if (!success) throw new Error(`Failed to delete agent '${agentId}' — agent may not exist or could not be removed.`);
    return { success };
  }

  async function deleteWorkspaceWorld(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '');
    if (!worldId) {
      throw new Error('World ID is required.');
    }

    const deleted = await deleteWorld(worldId);
    if (!deleted) {
      throw new Error(`Failed to delete world: ${worldId}`);
    }

    await removeWorldSubscriptions(worldId);
    heartbeatManager.stopJob(worldId);

    return { success: true, worldId };
  }

  async function listHeartbeatJobs() {
    await ensureCoreReady();
    return heartbeatManager.listJobs();
  }

  async function runHeartbeatJob(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '').trim();
    const chatId = String(payload?.chatId || '').trim();
    if (!worldId) {
      throw new Error('World ID is required.');
    }
    if (!chatId) {
      throw new Error('Chat ID is required.');
    }
    const persistedWorld = await getWorld(worldId);
    if (!persistedWorld) {
      throw new Error(`World not found: ${worldId}`);
    }
    const runtimeWorld = await ensureWorldSubscribed(worldId);
    const syncedRuntimeWorld = syncRuntimeWorldHeartbeatConfig(runtimeWorld, persistedWorld);
    const startResult = heartbeatManager.restartJob(syncedRuntimeWorld as any, chatId);
    if (!startResult?.started) {
      throw new Error(startResult?.reason || 'Failed to start cron.');
    }
    return {
      ok: true,
      worldId,
      chatId,
      status: startResult.job?.status ?? 'running',
    };
  }

  async function pauseHeartbeatJob(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '').trim();
    if (!worldId) {
      throw new Error('World ID is required.');
    }
    heartbeatManager.pauseJob(worldId);
    return { ok: true };
  }

  async function stopHeartbeatJob(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '').trim();
    if (!worldId) {
      throw new Error('World ID is required.');
    }
    heartbeatManager.stopJob(worldId);
    return { ok: true };
  }

  async function importWorld(payload?: any) {
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error('Main window not initialized');
    const requestedSource = String(payload?.source || '').trim();
    const requestedRepo = String(payload?.repo || '').trim();
    const requestedItemName = String(payload?.itemName || '').trim();
    const selectedWorldFolder = requestedSource || requestedRepo || requestedItemName
      ? String(requestedSource || '')
      : (await pickTargetDirectory(mainWindow, 'Import World Folder', 'Import')) || '';
    let stagedGitHubWorld: GitHubWorldImportStagedResult | null = null;
    let stagedGitHubFolder: GitHubFolderImportStagedResult | null = null;

    if (!selectedWorldFolder && !requestedRepo && !requestedItemName) {
      return {
        success: false,
        error: 'Import canceled',
        message: 'World import was canceled'
      };
    }

    try {
      await ensureCoreReady();

      let resolvedWorldFolder = resolveUserPath(selectedWorldFolder);
      let sourceMetadata: Record<string, unknown> | null = null;

      const stagedGitHubImport = await stageGitHubImportFolder('world', payload);
      if (stagedGitHubImport) {
        if ('worldFolderPath' in stagedGitHubImport) {
          stagedGitHubWorld = stagedGitHubImport;
          resolvedWorldFolder = path.resolve(path.normalize(stagedGitHubImport.worldFolderPath));
          sourceMetadata = toImportSourceMetadata(stagedGitHubImport.source);
        } else {
          stagedGitHubFolder = stagedGitHubImport;
          resolvedWorldFolder = path.resolve(path.normalize(stagedGitHubImport.folderPath));
          sourceMetadata = {
            ...toImportSourceMetadata(stagedGitHubImport.source),
            itemName: requestedItemName || path.basename(stagedGitHubImport.folderPath),
          };
        }
      } else if (selectedWorldFolder.startsWith('@')) {
        stagedGitHubWorld = await stageGitHubWorldFromShorthand(selectedWorldFolder);
        resolvedWorldFolder = path.resolve(path.normalize(stagedGitHubWorld.worldFolderPath));
        sourceMetadata = toImportSourceMetadata(stagedGitHubWorld.source);
      }

      const validationError = getWorldFolderValidationError(resolvedWorldFolder);
      if (validationError) {
        return {
          success: false,
          error: 'Invalid world folder',
          message: validationError
        };
      }

      const sourceWorldId = path.basename(resolvedWorldFolder);
      const sourceRootPath = path.dirname(resolvedWorldFolder);
      const sourceStorage = await createStorage({
        type: 'file',
        rootPath: sourceRootPath
      }) as StorageLike;

      const worldData = await sourceStorage.loadWorld(sourceWorldId);
      if (!worldData) {
        return {
          success: false,
          error: 'Failed to load source world',
          message: `Could not load world '${sourceWorldId}' from the selected folder`
        };
      }

      const existingWorlds = await listWorlds();
      const idConflict = existingWorlds.find((world) => String(world?.id || '') === String(worldData?.id || ''));
      const nameConflict = existingWorlds.find((world) => String(world?.name || '').trim().toLowerCase() === String(worldData?.name || '').trim().toLowerCase());

      if (idConflict && nameConflict && String(idConflict.id) !== String(nameConflict.id)) {
        return {
          success: false,
          error: 'Multiple conflicts detected',
          message: `Cannot import because ID conflict ('${idConflict.id}') and name conflict ('${nameConflict.name}') refer to different worlds. Resolve conflicts manually and retry.`
        };
      }

      const conflictWorld = idConflict || nameConflict;
      if (conflictWorld) {
        const conflictType = idConflict && nameConflict ? 'id and name' : (idConflict ? 'id' : 'name');
        const shouldOverwrite = await promptForOverwrite(
          mainWindow,
          'Overwrite Existing World?',
          `A world with the same ${conflictType} already exists.`,
          `Existing world: ${conflictWorld.name} (${conflictWorld.id})\nIncoming world: ${worldData.name} (${worldData.id})`
        );
        if (!shouldOverwrite) {
          return {
            success: false,
            error: 'Import canceled',
            message: 'Import canceled. Existing world was not modified.'
          };
        }

        await removeWorldSubscriptions(String(conflictWorld.id));
        const deleted = await deleteWorld(String(conflictWorld.id));
        if (!deleted) {
          return {
            success: false,
            error: 'Overwrite failed',
            message: `Could not remove existing world '${conflictWorld.id}' before import`
          };
        }
      }

      const targetStorage = await createStorageFromEnv() as StorageLike;
      const sourceAgents = await sourceStorage.listAgents(sourceWorldId);
      const sourceChats = await sourceStorage.listChats(sourceWorldId);

      await targetStorage.saveWorld(worldData);

      for (const agent of sourceAgents) {
        await targetStorage.saveAgent(worldData.id, agent);
      }

      for (const chat of sourceChats) {
        await targetStorage.saveChatData(worldData.id, chat);
      }

      let eventCount = 0;
      if (sourceStorage.eventStorage && targetStorage.eventStorage) {
        try {
          const worldEvents = await sourceStorage.eventStorage.getEventsByWorldAndChat(worldData.id, null);
          if (Array.isArray(worldEvents) && worldEvents.length > 0) {
            await targetStorage.eventStorage.saveEvents(worldEvents);
            eventCount += worldEvents.length;
          }
          for (const chat of sourceChats) {
            const chatEvents = await sourceStorage.eventStorage.getEventsByWorldAndChat(worldData.id, chat.id);
            if (Array.isArray(chatEvents) && chatEvents.length > 0) {
              await targetStorage.eventStorage.saveEvents(chatEvents);
              eventCount += chatEvents.length;
            }
          }
        } catch {
          // Keep import successful even if event copy fails.
        }
      }

      const importedWorld = await getWorld(worldData.id);
      if (!importedWorld) {
        return {
          success: false,
          error: 'Post-import load failed',
          message: `World '${worldData.id}' was imported but could not be loaded`
        };
      }

      const chats = await listChats(worldData.id);
      const sessions = await serializeChatsWithMessageCounts(worldData.id, chats, getMemory);

      return {
        success: true,
        world: serializeWorldInfo(importedWorld),
        sessions,
        importSummary: {
          agents: sourceAgents.length,
          chats: sourceChats.length,
          events: eventCount
        },
        source: sourceMetadata || undefined
      };
    } catch (error) {
      if (error instanceof GitHubWorldImportError) {
        const details = error.details || {};
        const owner = String(details.owner || '');
        const repo = String(details.repo || '');
        const branch = String(details.branch || '');
        const folderPath = String(details.worldPath || details.folderPath || '');
        const resolvedSource = owner && repo && branch && folderPath
          ? `${owner}/${repo}@${branch}:${folderPath}`
          : undefined;
        return {
          success: false,
          error: error.message,
          message: `Failed to import world: ${error.message}`,
          source: resolvedSource,
        };
      }
      const err = error as Error;
      return {
        success: false,
        error: err.message || 'Unknown error',
        message: `Failed to import world: ${err.message || 'Unknown error occurred'}`
      };
    } finally {
      if (stagedGitHubWorld) {
        await stagedGitHubWorld.cleanup();
      }
      if (stagedGitHubFolder) {
        await stagedGitHubFolder.cleanup();
      }
    }
  }

  async function exportWorld(payload: any) {
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error('Main window not initialized');

    await ensureCoreReady();
    const worldId = String(payload?.worldId || '').trim();
    if (!worldId) {
      throw new Error('World ID is required.');
    }

    const world = await getWorld(worldId);
    if (!world) {
      throw new Error(`World not found: ${worldId}`);
    }

    const targetPath = String(payload?.targetPath || '').trim()
      || await pickTargetDirectory(mainWindow, 'Choose Export Folder', 'Export')
      || '';
    if (!targetPath) {
      return {
        success: false,
        error: 'Export canceled',
        message: 'World export was canceled'
      };
    }

    const normalizedTargetPath = path.resolve(path.normalize(targetPath));
    if (!fs.existsSync(normalizedTargetPath)) {
      fs.mkdirSync(normalizedTargetPath, { recursive: true });
    }
    const activeStoragePath = String(getWorkspaceState()?.storagePath || '').trim();
    if (activeStoragePath && path.resolve(activeStoragePath) === normalizedTargetPath) {
      return {
        success: false,
        error: 'Invalid export target',
        message: 'Choose a different folder than the active workspace storage path.'
      };
    }

    const existingTarget = fs.existsSync(path.join(normalizedTargetPath, world.id));

    if (existingTarget) {
      const detail = `Existing target world folder: ${path.join(normalizedTargetPath, world.id)}`;
      const shouldOverwrite = await promptForOverwrite(
        mainWindow,
        'Overwrite Existing Export Target?',
        'Export target already contains data that will be replaced.',
        detail
      );
      if (!shouldOverwrite) {
        return {
          success: false,
          error: 'Export canceled',
          message: 'Export canceled. Existing target data was not modified.'
        };
      }
      await ensureDeleteExistingTarget(normalizedTargetPath, world.id);
    }

    const targetStorage = await createStorage({
      type: 'file',
      rootPath: normalizedTargetPath
    }) as StorageLike;

    await targetStorage.saveWorld(sanitizeWorldForExport(world));

    const worldAgents = world?.agents && typeof world.agents.values === 'function'
      ? Array.from(world.agents.values())
      : [];
    for (const agent of worldAgents) {
      await targetStorage.saveAgent(world.id, agent);
    }

    const chats = await listChats(world.id);
    for (const chat of chats) {
      await targetStorage.saveChatData(world.id, chat);
    }

    let eventCount = 0;
    if (world.eventStorage && targetStorage.eventStorage) {
      try {
        const worldEvents = await world.eventStorage.getEventsByWorldAndChat(world.id, null);
        if (Array.isArray(worldEvents) && worldEvents.length > 0) {
          await targetStorage.eventStorage.saveEvents(worldEvents);
          eventCount += worldEvents.length;
        }
        for (const chat of chats) {
          const chatEvents = await world.eventStorage.getEventsByWorldAndChat(world.id, chat.id);
          if (Array.isArray(chatEvents) && chatEvents.length > 0) {
            await targetStorage.eventStorage.saveEvents(chatEvents);
            eventCount += chatEvents.length;
          }
        }
      } catch {
        // Keep export successful even when event copy fails.
      }
    }

    return {
      success: true,
      message: `World '${world.name}' exported successfully.`,
      data: {
        worldId: world.id,
        worldName: world.name,
        storageType: 'file',
        path: normalizedTargetPath,
        agentCount: worldAgents.length,
        chatCount: chats.length,
        eventCount
      }
    };
  }

  async function importAgent(payload?: any) {
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error('Main window not initialized');

    const worldId = String(payload?.worldId || '').trim();
    if (!worldId) {
      throw new Error('World ID is required.');
    }

    const requestedSource = String(payload?.source || '').trim();
    const requestedRepo = String(payload?.repo || '').trim();
    const requestedItemName = String(payload?.itemName || '').trim();
    const selectedAgentFolder = requestedSource || requestedRepo || requestedItemName
      ? String(requestedSource || '')
      : await pickTargetDirectory(mainWindow, 'Import Agent Folder', 'Import');
    let stagedGitHubFolder: GitHubFolderImportStagedResult | null = null;

    if (!selectedAgentFolder && !requestedRepo && !requestedItemName) {
      return {
        success: false,
        error: 'Import canceled',
        message: 'Agent import was canceled'
      };
    }

    try {
      await ensureCoreReady();

      const targetWorld = await getWorld(worldId);
      if (!targetWorld) {
        return {
          success: false,
          error: 'World not found',
          message: `Could not find destination world '${worldId}'`,
        };
      }

      let resolvedAgentFolder = resolveUserPath(selectedAgentFolder || '');
      let sourceMetadata: Record<string, unknown> | null = null;

      const stagedGitHubImport = await stageGitHubImportFolder('agent', payload);
      if (stagedGitHubImport) {
        if ('folderPath' in stagedGitHubImport) {
          stagedGitHubFolder = stagedGitHubImport;
          resolvedAgentFolder = path.resolve(path.normalize(stagedGitHubImport.folderPath));
          sourceMetadata = {
            ...stagedGitHubImport.source,
            itemName: requestedItemName || path.basename(stagedGitHubImport.folderPath),
          };
        } else {
          throw new Error('Agent GitHub import requires an explicit repo and agent name.');
        }
      }

      const validationError = getAgentFolderValidationError(resolvedAgentFolder);
      if (validationError) {
        return {
          success: false,
          error: 'Invalid agent folder',
          message: validationError,
        };
      }

      const importedAgent = await loadStandaloneAgentFromFolder(resolvedAgentFolder);
      if (!importedAgent.provider || !importedAgent.model) {
        return {
          success: false,
          error: 'Invalid agent config',
          message: 'Imported agent config must include provider and model.',
        };
      }

      const targetStorage = await createStorageFromEnv() as StorageLike;
      const existingAgents = await targetStorage.listAgents(worldId);
      const idConflict = existingAgents.find((agent) => String(agent?.id || '') === String(importedAgent.id || ''));
      const nameConflict = existingAgents.find((agent) => String(agent?.name || '').trim().toLowerCase() === String(importedAgent.name || '').trim().toLowerCase());

      if (idConflict && nameConflict && String(idConflict.id) !== String(nameConflict.id)) {
        return {
          success: false,
          error: 'Multiple conflicts detected',
          message: `Cannot import because ID conflict ('${idConflict.id}') and name conflict ('${nameConflict.name}') refer to different agents. Resolve conflicts manually and retry.`,
        };
      }

      const conflictAgent = idConflict || nameConflict;
      if (conflictAgent) {
        const conflictType = idConflict && nameConflict ? 'id and name' : (idConflict ? 'id' : 'name');
        const shouldOverwrite = await promptForOverwrite(
          mainWindow,
          'Overwrite Existing Agent?',
          `An agent with the same ${conflictType} already exists in this world.`,
          `Existing agent: ${conflictAgent.name} (${conflictAgent.id})\nIncoming agent: ${importedAgent.name} (${importedAgent.id})`
        );
        if (!shouldOverwrite) {
          return {
            success: false,
            error: 'Import canceled',
            message: 'Import canceled. Existing agent was not modified.',
          };
        }

        await deleteAgent(worldId, String(conflictAgent.id));
      }

      await targetStorage.saveAgent(worldId, importedAgent);
      const refreshWarning = await refreshWorldSubscription(worldId);
      const refreshedWorld = await getWorld(worldId);

      return {
        success: true,
        world: refreshedWorld ? serializeWorldInfo(refreshedWorld) : null,
        agent: serializeAgentSummary(importedAgent),
        source: sourceMetadata || undefined,
        ...(refreshWarning ? { refreshWarning } : {}),
      };
    } catch (error) {
      if (error instanceof GitHubWorldImportError) {
        return {
          success: false,
          error: error.message,
          message: `Failed to import agent: ${error.message}`,
        };
      }
      const err = error as Error;
      return {
        success: false,
        error: err.message || 'Unknown error',
        message: `Failed to import agent: ${err.message || 'Unknown error occurred'}`,
      };
    } finally {
      if (stagedGitHubFolder) {
        await stagedGitHubFolder.cleanup();
      }
    }
  }

  async function previewSkillImport(payload?: any) {
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error('Main window not initialized');

    let resolvedSource: ResolvedSkillImportSource | null = null;

    try {
      await ensureCoreReady();
      resolvedSource = await resolveSkillImportSource(mainWindow, payload);

      if (!resolvedSource) {
        return null;
      }

      const entries = await readSkillFolderEntries(resolvedSource.resolvedSkillFolder);
      const files = await readSkillFolderFiles(resolvedSource.resolvedSkillFolder);

      return {
        success: true,
        rootName: resolvedSource.targetSkillName,
        entries,
        files,
        initialFilePath: getInitialSkillPreviewFilePath(entries),
        source: resolvedSource.sourceMetadata || undefined,
      };
    } catch (error) {
      if (error instanceof GitHubWorldImportError) {
        throw new Error(`Failed to preview skill import: ${error.message}`);
      }
      const err = error as Error;
      throw new Error(`Failed to preview skill import: ${err.message || 'Unknown error occurred'}`);
    } finally {
      if (resolvedSource) {
        await resolvedSource.cleanup();
      }
    }
  }

  async function listGitHubSkills(payload?: any) {
    try {
      await ensureCoreReady();
      const repo = String(payload?.repo || '').trim();
      if (!repo) {
        throw new Error('GitHub repo is required.');
      }

      const rootEntries = await listGitHubDirectoryNames(repo, '.');
      const canonicalSkillDirectoryNames = rootEntries.directoryNames.includes('.agent-world')
        ? await listGitHubSkillDirectoryNamesIfPresent(repo, '.agent-world/skills')
        : [];
      const topLevelSkillDirectoryNames = rootEntries.directoryNames.includes('skills')
        ? await listGitHubSkillDirectoryNamesIfPresent(repo, 'skills')
        : [];
      const hasRootSkillFile = Array.isArray(rootEntries.fileNames)
        && rootEntries.fileNames.some((fileName) => String(fileName || '').trim().toLowerCase() === 'skill.md');
      const discoveredSkills = new Map<string, { skillId: string; description: string }>();

      for (const directoryName of canonicalSkillDirectoryNames.map((value) => String(value || '').trim()).filter(Boolean)) {
        if (discoveredSkills.has(directoryName)) {
          continue;
        }

        const description = await readGitHubSkillDescription(repo, `.agent-world/skills/${directoryName}`, directoryName);
        discoveredSkills.set(directoryName, {
          skillId: directoryName,
          description,
        });
      }

      for (const directoryName of topLevelSkillDirectoryNames.map((value) => String(value || '').trim()).filter(Boolean)) {
        if (discoveredSkills.has(directoryName)) {
          continue;
        }

        const description = await readGitHubSkillDescription(repo, `skills/${directoryName}`, directoryName);
        discoveredSkills.set(directoryName, {
          skillId: directoryName,
          description,
        });
      }

      if (hasRootSkillFile) {
        const rootSkillMetadata = await readGitHubRootSkillMetadata(repo);
        if (rootSkillMetadata) {
          discoveredSkills.set(rootSkillMetadata.skillName, {
            skillId: rootSkillMetadata.skillName,
            description: rootSkillMetadata.description,
          });
          if (rootSkillMetadata.repoName) {
            discoveredSkills.set(rootSkillMetadata.repoName, {
              skillId: rootSkillMetadata.repoName,
              description: rootSkillMetadata.description,
            });
          }
          await rootSkillMetadata.stagedSkill.cleanup();
        }
      }

      return Array.from(discoveredSkills.values())
        .sort((left, right) => left.skillId.localeCompare(right.skillId));
    } catch (error) {
      if (error instanceof GitHubWorldImportError) {
        throw new Error(`Failed to list GitHub skills: ${error.message}`);
      }
      const err = error as Error;
      throw new Error(`Failed to list GitHub skills: ${err.message || 'Unknown error occurred'}`);
    }
  }

  async function listLocalSkills(payload?: any) {
    try {
      await ensureCoreReady();
      const source = String(payload?.source || '').trim();
      if (!source) {
        throw new Error('Local skill root is required.');
      }

      const resolvedRootPath = resolveUserPath(source);
      if (!isDirectoryOnDisk(resolvedRootPath)) {
        throw new Error('Selected path is not a folder');
      }

      return await discoverLocalSkillFolders(resolvedRootPath);
    } catch (error) {
      const err = error as Error;
      throw new Error(`Failed to list local skills: ${err.message || 'Unknown error occurred'}`);
    }
  }

  async function importSkill(payload?: any) {
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error('Main window not initialized');

    let resolvedSource: ResolvedSkillImportSource | null = null;

    try {
      await ensureCoreReady();

      const targetScope = String(payload?.targetScope || 'project').trim().toLowerCase() === 'global'
        ? 'global'
        : 'project';
      const draftFiles = payload?.files && typeof payload.files === 'object'
        ? payload.files as Record<string, string>
        : null;
      const workspacePath = String(getWorkspaceState()?.workspacePath || '').trim();
      const projectPath = String(payload?.projectPath || '').trim() || workspacePath;
      const targetSkillsRoot = targetScope === 'global'
        ? getCanonicalGlobalSkillRoot()
        : getCanonicalProjectSkillRoot(projectPath);

      if (targetScope === 'project' && !projectPath) {
        return {
          success: false,
          error: 'Workspace unavailable',
          message: 'Workspace path is not available for project skill import.',
        };
      }

      let sourceMetadata: Record<string, unknown> | null = null;
      let targetSkillName = resolveRequestedSkillName(payload);
      const shouldResolveSource = draftFiles == null
        || Boolean(String(payload?.source || '').trim())
        || Boolean(String(payload?.repo || '').trim());

      if (shouldResolveSource) {
        resolvedSource = await resolveSkillImportSource(mainWindow, payload);
        if (!resolvedSource) {
          return {
            success: false,
            error: 'Import canceled',
            message: 'Skill import was canceled'
          };
        }
        sourceMetadata = resolvedSource.sourceMetadata;
        targetSkillName = resolvedSource.targetSkillName;
      }

      const targetSkillPath = path.join(targetSkillsRoot, targetSkillName);

      if (fs.existsSync(targetSkillPath)) {
        const shouldOverwrite = await promptForOverwrite(
          mainWindow,
          'Overwrite Existing Skill?',
          `A skill folder named '${targetSkillName}' already exists in this ${targetScope} scope.`,
          targetSkillPath
        );
        if (!shouldOverwrite) {
          return {
            success: false,
            error: 'Import canceled',
            message: 'Import canceled. Existing skill was not modified.',
          };
        }

        await fs.promises.rm(targetSkillPath, { recursive: true, force: true });
      }

      await fs.promises.mkdir(targetSkillsRoot, { recursive: true });
      if (resolvedSource) {
        await fs.promises.cp(resolvedSource.resolvedSkillFolder, targetSkillPath, { recursive: true, force: true });
      } else if (draftFiles) {
        await fs.promises.mkdir(targetSkillPath, { recursive: true });
      }

      if (draftFiles) {
        await writeSkillFilesToTarget(targetSkillPath, draftFiles);
      }

      if (targetScope === 'global') {
        await syncSkills({ userSkillRoots: getDefaultGlobalSkillRoots() });
      } else {
        await syncSkills({
          projectSkillRoots: getDefaultProjectSkillRoots(projectPath),
        });
      }

      return {
        success: true,
        skillId: targetSkillName,
        path: targetSkillPath,
        targetScope,
        source: sourceMetadata || undefined,
      };
    } catch (error) {
      if (error instanceof GitHubWorldImportError) {
        return {
          success: false,
          error: error.message,
          message: `Failed to import skill: ${error.message}`,
        };
      }
      const err = error as Error;
      return {
        success: false,
        error: err.message || 'Unknown error',
        message: `Failed to import skill: ${err.message || 'Unknown error occurred'}`,
      };
    } finally {
      if (resolvedSource) {
        await resolvedSource.cleanup();
      }
    }
  }

  async function listWorldSessions(worldId: unknown) {
    await ensureCoreReady();
    const id = String(worldId || '');
    if (!id) throw new Error('World ID is required.');
    const world = await getWorld(id);
    if (!world) throw new Error(`World not found: ${id}`);

    const chats = await listChats(id);
    return await serializeChatsWithMessageCounts(id, chats, getMemory);
  }

  async function createWorldSession(worldId: unknown) {
    await ensureCoreReady();
    const id = String(worldId || '');
    if (!id) throw new Error('World ID is required.');

    const updatedWorld = await newChat(id);
    if (!updatedWorld) throw new Error(`World not found: ${id}`);
    const refreshWarning = await refreshWorldSubscription(id);

    const chats = await listChats(id);
    const sessions = await serializeChatsWithMessageCounts(id, chats, getMemory);
    return {
      currentChatId: updatedWorld.currentChatId || null,
      sessions,
      ...(refreshWarning ? { refreshWarning } : {})
    };
  }

  async function branchWorldSessionFromMessage(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '').trim();
    const chatId = String(payload?.chatId || '').trim();
    const messageId = String(payload?.messageId || '').trim();

    if (!worldId) throw new Error('World ID is required.');
    if (!chatId) throw new Error('Source chat ID is required.');
    if (!messageId) throw new Error('Message ID is required.');

    const branchResult = await branchChatFromMessage(worldId, chatId, messageId);
    const refreshWarning = await refreshWorldSubscription(worldId);

    const chats = await listChats(worldId);
    const sessions = await serializeChatsWithMessageCounts(worldId, chats, getMemory);

    return {
      currentChatId: branchResult?.newChatId || null,
      copiedMessageCount: Number(branchResult?.copiedMessageCount || 0),
      sessions,
      ...(refreshWarning ? { refreshWarning } : {})
    };
  }

  async function deleteWorldSession(worldId: unknown, chatId: unknown) {
    await ensureCoreReady();
    const id = String(worldId || '');
    const sessionId = String(chatId || '');
    if (!id) throw new Error('World ID is required.');
    if (!sessionId) throw new Error('Session ID is required.');

    const deleted = await deleteChat(id, sessionId);
    if (!deleted) throw new Error(`Session not found: ${sessionId}`);
    const refreshWarning = await refreshWorldSubscription(id);

    const world = await getWorld(id);
    if (!world) throw new Error(`World not found: ${id}`);

    const chats = await listChats(id);
    const sessions = await serializeChatsWithMessageCounts(id, chats, getMemory);
    return {
      currentChatId: world.currentChatId || null,
      sessions,
      ...(refreshWarning ? { refreshWarning } : {})
    };
  }

  async function selectWorldSession(worldId: unknown, chatId: unknown) {
    await ensureCoreReady();
    const id = String(worldId || '');
    const sessionId = String(chatId || '');
    if (!id) throw new Error('World ID is required.');
    if (!sessionId) throw new Error('Session ID is required.');

    const selectStartedAt = Date.now();
    loggerIpcSession.debug('Session selection started', {
      worldId: id,
      requestedChatId: sessionId
    });

    await ensureWorldSubscribed(id);
    const activated = await activateChatWithSnapshot(id, sessionId);
    if (!activated) throw new Error(`World or session not found: ${id}/${sessionId}`);

    loggerIpcSession.debug('Session selection completed', {
      worldId: id,
      requestedChatId: sessionId,
      resolvedChatId: activated.chatId || sessionId,
      elapsedMs: Date.now() - selectStartedAt
    });

    return {
      worldId: id,
      chatId: activated.chatId || sessionId,
      hitlPrompts: Array.isArray(activated.hitlPrompts) ? activated.hitlPrompts : [],
    };
  }

  async function getSessionMessages(worldId: unknown, chatId: unknown) {
    await ensureCoreReady();
    const id = String(worldId || '');
    if (!id) throw new Error('World ID is required.');

    const requestedChatId = chatId ? String(chatId) : null;
    loggerIpcMessages.debug('Session messages load started', {
      worldId: id,
      chatId: requestedChatId
    });
    const memory = await getMemory(id, requestedChatId);
    if (!memory) return [];

    loggerIpcMessages.debug('Session messages loaded', {
      worldId: id,
      chatId: requestedChatId,
      messageCount: memory.length
    });

    return normalizeSessionMessages(memory.map((message: any) => serializeMessage(message)));
  }

  async function getChatEvents(worldId: unknown, chatId: unknown) {
    await ensureCoreReady();
    const id = String(worldId || '');
    if (!id) throw new Error('World ID is required.');

    const requestedChatId = chatId ? String(chatId) : null;
    const world = await getWorld(id);
    if (!world?.eventStorage) return [];

    const events = await world.eventStorage.getEventsByWorldAndChat(id, requestedChatId);
    return Array.isArray(events) ? events : [];
  }

  async function sendChatMessage(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '');
    const chatId = payload?.chatId ? String(payload.chatId) : null;
    const content = String(payload?.content || '').trim();
    const sender = payload?.sender ? String(payload.sender).trim() : 'human';
    const systemSettingsPayload = payload?.systemSettings && typeof payload.systemSettings === 'object'
      ? payload.systemSettings as {
        enableGlobalSkills?: unknown;
        enableProjectSkills?: unknown;
        disabledGlobalSkillIds?: unknown;
        disabledProjectSkillIds?: unknown;
      }
      : null;

    if (systemSettingsPayload) {
      if (typeof systemSettingsPayload.enableGlobalSkills === 'boolean') {
        process.env.AGENT_WORLD_ENABLE_GLOBAL_SKILLS = String(systemSettingsPayload.enableGlobalSkills);
      }
      if (typeof systemSettingsPayload.enableProjectSkills === 'boolean') {
        process.env.AGENT_WORLD_ENABLE_PROJECT_SKILLS = String(systemSettingsPayload.enableProjectSkills);
      }

      if (Array.isArray(systemSettingsPayload.disabledGlobalSkillIds)) {
        process.env.AGENT_WORLD_DISABLED_GLOBAL_SKILLS = systemSettingsPayload.disabledGlobalSkillIds
          .map((value) => String(value || '').trim())
          .filter((value) => value.length > 0)
          .join(',');
      }

      if (Array.isArray(systemSettingsPayload.disabledProjectSkillIds)) {
        process.env.AGENT_WORLD_DISABLED_PROJECT_SKILLS = systemSettingsPayload.disabledProjectSkillIds
          .map((value) => String(value || '').trim())
          .filter((value) => value.length > 0)
          .join(',');
      }
    }

    if (!worldId) throw new Error('World ID is required.');
    if (!chatId) throw new Error('Chat ID is required.');
    if (!content) throw new Error('Message content is required.');

    await ensureWorldSubscribed(worldId);

    {
      const restoredWorld = await restoreChat(worldId, chatId);
      if (!restoredWorld || !restoredWorld.chats?.has?.(chatId)) {
        throw new Error(`Chat not found: ${chatId}`);
      }
    }

    const world = await ensureWorldSubscribed(worldId);
    if (!world) throw new Error(`World not found: ${worldId}`);

    const queued = await enqueueAndProcessUserTurn(worldId, chatId, content, sender, world);
    return {
      messageId: queued?.messageId || null,
      sender,
      content,
      createdAt: toIsoTimestamp(queued?.createdAt),
      queueStatus: queued?.status || null,
      queueRetryCount: typeof queued?.retryCount === 'number' ? queued.retryCount : null
    };
  }

  async function editMessageInChat(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '');
    const messageId = String(payload?.messageId || '');
    const chatId = String(payload?.chatId || '');
    const newContent = String(payload?.newContent || '').trim();

    if (!worldId) throw new Error('World ID is required.');
    if (!messageId) throw new Error('Message ID is required.');
    if (!chatId) throw new Error('Chat ID is required.');
    if (!newContent) throw new Error('New content is required.');

    const restoredWorld = await restoreChat(worldId, chatId, { suppressAutoResume: true });
    if (!restoredWorld || !restoredWorld.chats?.has?.(chatId)) {
      throw new Error(`404 Chat not found: ${chatId}`);
    }

    const world = await ensureWorldSubscribed(worldId);
    return editUserMessage(worldId, messageId, newContent, chatId, world as any);
  }

  async function deleteMessageFromChat(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '');
    const messageId = String(payload?.messageId || '');
    const chatId = String(payload?.chatId || '');

    if (!worldId) throw new Error('World ID is required.');
    if (!messageId) throw new Error('Message ID is required.');
    if (!chatId) throw new Error('Chat ID is required.');

    const restoredWorld = await restoreChat(worldId, chatId, { suppressAutoResume: true });
    if (!restoredWorld || !restoredWorld.chats?.has?.(chatId)) {
      throw new Error(`404 Chat not found: ${chatId}`);
    }

    const result = await removeMessagesFrom(worldId, messageId, chatId);
    const refreshWarning = await refreshWorldSubscription(worldId);

    if (refreshWarning && result && typeof result === 'object' && !Array.isArray(result)) {
      return {
        ...result,
        refreshWarning
      };
    }

    return result;
  }

  async function stopChatMessage(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '');
    const chatId = String(payload?.chatId || '');

    if (!worldId) throw new Error('World ID is required.');
    if (!chatId) throw new Error('Chat ID is required.');

    return stopMessageProcessing(worldId, chatId);
  }

  async function respondHitlOption(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '').trim();
    const requestId = String(payload?.requestId || '').trim();
    const optionId = String(payload?.optionId || '').trim();
    const chatId = payload?.chatId !== undefined ? String(payload.chatId || '').trim() || null : undefined;
    if (!worldId) throw new Error('World ID is required.');
    if (!requestId) throw new Error('requestId is required.');
    if (!optionId) throw new Error('optionId is required.');
    return submitWorldHitlResponse({
      worldId,
      requestId,
      optionId,
      ...(chatId !== undefined ? { chatId } : {}),
    });
  }

  function getLoggingConfig() {
    const config = getRendererLoggingConfigFromEnv();
    loggerIpc.debug('Resolved renderer logging config', {
      globalLevel: config.globalLevel,
      categoryCount: Object.keys(config.categoryLevels).length,
      nodeEnv: config.nodeEnv
    });
    return config;
  }

  async function openExternalLink(payload: unknown) {
    const url = normalizeExternalUrl((payload as { url?: unknown } | undefined)?.url);
    await openExternalUrl(url);
    return { opened: true, url };
  }

  async function openFileDialog() {
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error('Main window not initialized');
    const result = await showOpenDialogCompat(mainWindow, {
      title: 'Select File',
      properties: ['openFile', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, filePath: null };
    }
    return { canceled: false, filePath: result.filePaths[0] || null };
  }

  async function addToQueueHandler(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '');
    const chatId = String(payload?.chatId || '');
    const content = String(payload?.content || '');
    const sender = payload?.sender ? String(payload.sender) : undefined;
    if (!worldId) throw new Error('World ID is required.');
    if (!chatId) throw new Error('Chat ID is required.');
    if (!content) throw new Error('Content is required.');
    return addToQueue(worldId, chatId, content, sender);
  }

  async function getQueuedMessagesHandler(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '');
    const chatId = String(payload?.chatId || '');
    if (!worldId) throw new Error('World ID is required.');
    if (!chatId) throw new Error('Chat ID is required.');
    return getQueueMessages(worldId, chatId);
  }

  async function removeFromQueueHandler(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '');
    const messageId = String(payload?.messageId || '');
    if (!worldId) throw new Error('World ID is required.');
    if (!messageId) throw new Error('Message ID is required.');
    return removeFromQueue(worldId, messageId);
  }

  async function pauseChatQueueHandler(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '');
    const chatId = String(payload?.chatId || '');
    if (!worldId) throw new Error('World ID is required.');
    if (!chatId) throw new Error('Chat ID is required.');
    return pauseChatQueue(worldId, chatId);
  }

  async function resumeChatQueueHandler(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '');
    const chatId = String(payload?.chatId || '');
    if (!worldId) throw new Error('World ID is required.');
    if (!chatId) throw new Error('Chat ID is required.');
    return resumeChatQueue(worldId, chatId);
  }

  async function stopChatQueueHandler(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '');
    const chatId = String(payload?.chatId || '');
    if (!worldId) throw new Error('World ID is required.');
    if (!chatId) throw new Error('Chat ID is required.');
    return stopChatQueue(worldId, chatId);
  }

  async function clearChatQueueHandler(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '');
    const chatId = String(payload?.chatId || '');
    if (!worldId) throw new Error('World ID is required.');
    if (!chatId) throw new Error('Chat ID is required.');
    return clearChatQueue(worldId, chatId);
  }

  async function retryQueueMessageHandler(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '');
    const messageId = String(payload?.messageId || '');
    const chatId = String(payload?.chatId || '');
    if (!worldId) throw new Error('World ID is required.');
    if (!messageId) throw new Error('Message ID is required.');
    if (!chatId) throw new Error('Chat ID is required.');
    return retryQueueMessage(worldId, messageId, chatId);
  }

  async function readSkillContent(payload: unknown) {
    await ensureCoreReady();
    const skillId = String((payload as any)?.skillId || '').trim();
    const relativePath = (payload as any)?.relativePath;
    if (!skillId) throw new Error('Skill ID is required.');
    const skillPath = getSkillSourcePath(skillId);
    if (!skillPath) throw new Error(`Skill not found in registry: ${skillId}`);
    return fs.promises.readFile(resolveSkillFilePath(skillPath, relativePath), 'utf8');
  }

  async function readSkillFolderStructure(payload: unknown) {
    await ensureCoreReady();
    const skillId = String((payload as any)?.skillId || '').trim();
    if (!skillId) throw new Error('Skill ID is required.');
    const skillPath = getSkillSourcePath(skillId);
    if (!skillPath) throw new Error(`Skill not found in registry: ${skillId}`);

    return readSkillFolderEntries(getSkillRootPath(skillPath));
  }

  async function saveSkillContent(payload: unknown) {
    await ensureCoreReady();
    const skillId = String((payload as any)?.skillId || '').trim();
    const content = String((payload as any)?.content ?? '');
    const relativePath = (payload as any)?.relativePath;
    if (!skillId) throw new Error('Skill ID is required.');
    const skillPath = getSkillSourcePath(skillId);
    if (!skillPath) throw new Error(`Skill not found in registry: ${skillId}`);
    await fs.promises.writeFile(resolveSkillFilePath(skillPath, relativePath), content, 'utf8');
  }

  async function deleteSkill(payload: unknown) {
    await ensureCoreReady();
    const skillId = String((payload as any)?.skillId || '').trim();
    if (!skillId) throw new Error('Skill ID is required.');

    const skillPath = getSkillSourcePath(skillId);
    if (!skillPath) throw new Error(`Skill not found in registry: ${skillId}`);

    await fs.promises.rm(getSkillRootPath(skillPath), { recursive: true, force: true });
  }

  return {
    loadWorldsFromWorkspace,
    loadSpecificWorld,
    pickDirectoryDialog,
    openWorkspaceDialog,
    openFileDialog,
    openExternalLink,
    listWorkspaceWorlds,
    listSkillRegistry,
    createWorkspaceWorld,
    updateWorkspaceWorld,
    listHeartbeatJobs,
    runHeartbeatJob,
    pauseHeartbeatJob,
    stopHeartbeatJob,
    createWorldAgent,
    updateWorldAgent,
    deleteWorldAgent,
    deleteWorkspaceWorld,
    importWorld,
    importAgent,
    previewSkillImport,
    listGitHubSkills,
    listLocalSkills,
    importSkill,
    exportWorld,
    listWorldSessions,
    createWorldSession,
    branchWorldSessionFromMessage,
    deleteWorldSession,
    selectWorldSession,
    getSessionMessages,
    sendChatMessage,
    editMessageInChat,
    respondHitlOption,
    getLoggingConfig,
    stopChatMessage,
    deleteMessageFromChat,
    getChatEvents,
    addToQueue: addToQueueHandler,
    getQueuedMessages: getQueuedMessagesHandler,
    removeFromQueue: removeFromQueueHandler,
    pauseChatQueue: pauseChatQueueHandler,
    resumeChatQueue: resumeChatQueueHandler,
    stopChatQueue: stopChatQueueHandler,
    clearChatQueue: clearChatQueueHandler,
    retryQueueMessage: retryQueueMessageHandler,
    readSkillContent,
    readSkillFolderStructure,
    saveSkillContent,
    deleteSkill
  };
}
