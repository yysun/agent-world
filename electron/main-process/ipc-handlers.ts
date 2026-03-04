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
 * - 2026-03-04: Extended `sendChatMessage` IPC response with queue metadata (`queueStatus`, `queueRetryCount`) for queue-failure visibility.
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
import * as path from 'node:path';
import { dialog } from 'electron';
import {
  normalizeSessionMessages,
  serializeAgentSummary,
  serializeChatsWithMessageCounts,
  serializeMessage,
  serializeWorldInfo,
  toIsoTimestamp
} from './message-serialization.js';

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

const VALID_LOG_LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];
const VALID_LOG_LEVEL_SET = new Set<LogLevel>(VALID_LOG_LEVELS);

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
  getSkillsForSystemPrompt: (options?: {
    includeGlobal?: boolean;
    includeProject?: boolean;
    userSkillRoots?: string[];
    projectSkillRoots?: string[];
  }) => any[];
  syncSkills: (options?: {
    userSkillRoots?: string[];
    projectSkillRoots?: string[];
  }) => Promise<any> | any;
  newChat: (worldId: string) => Promise<any>;
  branchChatFromMessage: (worldId: string, sourceChatId: string, messageId: string) => Promise<any>;
  enqueueAndProcessUserMessage: (worldId: string, chatId: string, content: string, sender: string, targetWorld?: any) => Promise<any>;
  submitWorldHitlResponse: (params: { worldId: string; requestId: string; optionId: string; chatId?: string | null }) => {
    accepted: boolean;
    reason?: string;
  };
  stopMessageProcessing: (worldId: string, chatId: string) => Promise<any> | any;
  activateChatWithSnapshot: (worldId: string, chatId: string) => Promise<{ world: any; chatId: string; hitlPrompts: any[] } | null>;
  restoreChat: (worldId: string, chatId: string) => Promise<any>;
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
  createStorage: (config: any) => Promise<any>;
  createStorageFromEnv: () => Promise<any>;
  loggerIpc?: LoggerLike;
  loggerIpcSession?: LoggerLike;
  loggerIpcMessages?: LoggerLike;
  GitHubWorldImportError: new (...args: any[]) => GitHubWorldImportErrorLike;
  stageGitHubWorldFromShorthand: (shorthand: string) => Promise<GitHubWorldImportStagedResult>;
  heartbeatManager: {
    startJob: (world: any) => void;
    restartJob: (world: any) => void;
    pauseJob: (worldId: string) => void;
    resumeJob: (worldId: string) => void;
    stopJob: (worldId: string) => void;
    stopAll: () => void;
    listJobs: () => Array<{ worldId: string; worldName: string; interval: string; status: 'running' | 'paused' | 'stopped' }>;
  };
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
  details?: Record<string, unknown>;
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
    getSkillsForSystemPrompt,
    syncSkills,
    newChat,
    branchChatFromMessage,
    enqueueAndProcessUserMessage,
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
    createStorage,
    createStorageFromEnv,
    loggerIpc = NOOP_LOGGER,
    loggerIpcSession = NOOP_LOGGER,
    loggerIpcMessages = NOOP_LOGGER,
    GitHubWorldImportError,
    stageGitHubWorldFromShorthand,
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

  async function promptForOverwrite(
    mainWindow: BrowserWindowLike,
    title: string,
    message: string,
    detail?: string
  ): Promise<boolean> {
    const confirmation = await dialog.showMessageBox(mainWindow as any, {
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
    const result = await dialog.showOpenDialog(mainWindow as any, {
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
      if (world?.heartbeatEnabled !== true) {
        heartbeatManager.stopJob(String(world?.id || ''));
        continue;
      }

      const worldId = String(world?.id || '').trim();
      if (!worldId) continue;

      try {
        const runtimeWorld = await ensureWorldSubscribed(worldId);
        heartbeatManager.restartJob(runtimeWorld as any);
      } catch {
        // Keep workspace loading resilient even if one world cannot subscribe.
      }
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

      // Ensure runtime is subscribed and active chat queue processing is resumed
      // when loading a world that already contains queued messages.
      const subscribedWorld = await ensureWorldSubscribed(world.id) as { currentChatId?: string } | null;
      const activeChatId = String(subscribedWorld?.currentChatId || world.currentChatId || '').trim();
      if (activeChatId) {
        await resumeChatQueue(world.id, activeChatId);
      }

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

  async function pickDirectoryDialog() {
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error('Main window not initialized');
    const result = await dialog.showOpenDialog(mainWindow as any, {
      title: 'Open Folder',
      properties: ['openDirectory', 'createDirectory']
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

  async function openWorkspaceDialog(payload?: any) {
    const providedDirectoryPath = payload?.directoryPath == null
      ? ''
      : String(payload.directoryPath || '').trim();
    const picked = providedDirectoryPath
      ? { canceled: false, directoryPath: providedDirectoryPath }
      : await pickDirectoryDialog();

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
      ? payload as { includeGlobalSkills?: unknown; includeProjectSkills?: unknown; projectPath?: unknown }
      : null;

    const includeGlobalSkills = typeof normalizedPayload?.includeGlobalSkills === 'boolean'
      ? normalizedPayload.includeGlobalSkills
      : String(process.env.AGENT_WORLD_ENABLE_GLOBAL_SKILLS ?? 'true').toLowerCase() !== 'false';
    const includeProjectSkills = typeof normalizedPayload?.includeProjectSkills === 'boolean'
      ? normalizedPayload.includeProjectSkills
      : String(process.env.AGENT_WORLD_ENABLE_PROJECT_SKILLS ?? 'true').toLowerCase() !== 'false';

    const projectPath = typeof normalizedPayload?.projectPath === 'string'
      ? normalizedPayload.projectPath.trim()
      : '';
    const projectSkillRoots = projectPath.length > 0
      ? [path.join(projectPath, '.agents', 'skills'), path.join(projectPath, 'skills')]
      : undefined;

    await syncSkills({ projectSkillRoots });

    const scopedSkills = getSkillsForSystemPrompt({
      includeGlobal: includeGlobalSkills,
      includeProject: includeProjectSkills,
      projectSkillRoots,
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
    try {
      const runtimeWorld = await ensureWorldSubscribed(worldId);
      heartbeatManager.restartJob(runtimeWorld as any);
    } catch {
      // If subscription cannot be resolved, heartbeat runtime state will be reconciled on next workspace load.
    }
    const serialized = serializeWorldInfo(updated);
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
    return serializeAgentSummary(created);
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
    if (!worldId) {
      throw new Error('World ID is required.');
    }
    const runtimeWorld = await ensureWorldSubscribed(worldId);
    heartbeatManager.restartJob(runtimeWorld as any);
    return { ok: true };
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
    const selectedWorldFolder = requestedSource
      || await pickTargetDirectory(mainWindow, 'Import World Folder', 'Import');
    let stagedGitHubWorld: GitHubWorldImportStagedResult | null = null;

    if (!selectedWorldFolder) {
      return {
        success: false,
        error: 'Import canceled',
        message: 'World import was canceled'
      };
    }

    try {
      await ensureCoreReady();

      let resolvedWorldFolder = path.resolve(path.normalize(selectedWorldFolder));
      let sourceMetadata: {
        shorthand: string;
        owner: string;
        repo: string;
        branch: string;
        worldPath: string;
        commitSha: string | null;
      } | null = null;

      if (selectedWorldFolder.startsWith('@')) {
        stagedGitHubWorld = await stageGitHubWorldFromShorthand(selectedWorldFolder);
        resolvedWorldFolder = path.resolve(path.normalize(stagedGitHubWorld.worldFolderPath));
        sourceMetadata = stagedGitHubWorld.source;
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
        const worldPath = String(details.worldPath || '');
        const resolvedSource = owner && repo && branch && worldPath
          ? `${owner}/${repo}@${branch}:${worldPath}`
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

    await targetStorage.saveWorld(world);

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
    const refreshWarning = await refreshWorldSubscription(id);

    loggerIpcSession.debug('Session selection completed', {
      worldId: id,
      requestedChatId: sessionId,
      resolvedChatId: activated.chatId || sessionId,
      refreshWarning: refreshWarning || null,
      elapsedMs: Date.now() - selectStartedAt
    });

    return {
      worldId: id,
      chatId: activated.chatId || sessionId,
      hitlPrompts: Array.isArray(activated.hitlPrompts) ? activated.hitlPrompts : [],
      ...(refreshWarning ? { refreshWarning } : {})
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

    const world = await ensureWorldSubscribed(worldId);

    {
      const restoredWorld = await restoreChat(worldId, chatId);
      if (!restoredWorld || restoredWorld.currentChatId !== chatId) {
        throw new Error(`Chat not found: ${chatId}`);
      }
    }

    if (!world) throw new Error(`World not found: ${worldId}`);

    const queued = await enqueueAndProcessUserMessage(worldId, chatId, content, sender, world);
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

    const restoredWorld = await restoreChat(worldId, chatId);
    if (!restoredWorld || restoredWorld.currentChatId !== chatId) {
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

  async function openFileDialog() {
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error('Main window not initialized');
    const result = await dialog.showOpenDialog(mainWindow as any, {
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

  return {
    loadWorldsFromWorkspace,
    loadSpecificWorld,
    pickDirectoryDialog,
    openWorkspaceDialog,
    openFileDialog,
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
    retryQueueMessage: retryQueueMessageHandler
  };
}
