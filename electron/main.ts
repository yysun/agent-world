/**
 * Electron Main Process - Desktop Runtime and IPC Router
 * Purpose:
 * - Host desktop runtime IPC handlers that bridge renderer actions to core world/chat APIs.
 *
 * Features:
 * - Workspace selection and persistence
 * - Load all worlds from workspace folders
 * - World/session/chat IPC handlers
 * - Renderer startup for dev and packaged modes
 *
 * Implementation Notes:
 * - Core logic runs in main; renderer uses preload IPC bridge
 * - Loads all worlds from workspace folder, user selects which to use
 * - Workspace switching requires app restart with --workspace=<path> arg
 * - openWorkspace() returns folder path without switching workspace or loading worlds
 * - Defaults to ~/agent-world workspace if no preference or --workspace arg (matches CLI)
 * - Respects AGENT_WORLD_STORAGE_TYPE and AGENT_WORLD_DATA_PATH from .env if set
 * - Defaults to SQLite storage and workspace path if env vars not set
 *
 * Recent Changes:
 * - 2026-03-10: Added an E2E-only user-data override and optional single-instance-lock bypass so the real Playwright Electron harness can launch without colliding with another generic Electron process.
 * - 2026-02-28: Added resilient realtime runtime module export resolution (named/default interop) to prevent startup failure from compiled export-shape drift.
 * - 2026-02-26: Added categorized Electron main loggers and renderer logging-config IPC bridge wiring for env-controlled main/renderer log behavior.
 * - 2026-02-26: Moved `.env` loading ahead of core module import so startup logger category levels honor `LOG_*` env values.
 * - 2026-02-21: Added single-instance guard with `app.requestSingleInstanceLock()` and second-instance focus/restore handling.
 * - 2026-02-19: Added `world:export` IPC wiring and storage-factory dependency injection for CLI-parity desktop world import/export flows.
 * - 2026-02-16: Wired `session:branchFromMessage` IPC to core `branchChatFromMessage` for branch-chat creation from assistant messages.
 * - 2026-02-14: Added `hitl:respond` IPC wiring so renderer approvals can resolve core HITL option requests.
 * - 2026-02-14: Added `skill:list` IPC wiring backed by core `syncSkills/getSkills` for empty-session welcome skill cards in renderer.
 * - 2026-02-14: Set `AGENT_WORLD_DEFAULT_WORKING_DIRECTORY` from `app.getPath('home')` at startup so core cwd fallback is stable in packaged Electron runs.
 * - 2026-02-14: Routed Electron edit-message path back to core-managed `editUserMessage` flow (no main-process subscription refresh logic).
 * - 2026-02-13: Routed message edit/resubmission through core `editUserMessage` via new IPC `message:edit` handler.
 * - 2026-02-13: Wired `chat:stopMessage` IPC to core stop-processing runtime controls.
 * - 2026-02-13: Removed `@ts-nocheck` and tightened local typings for main-window/runtime wiring.
 * - 2026-02-12: Moved workspace/world/agent/session/chat IPC handler implementations into `main-process/ipc-handlers.ts`; `main.ts` now focuses on runtime composition and lifecycle bootstrap.
 * - 2026-02-12: Extracted workspace-core state and realtime subscription orchestration into dedicated modules (`workspace-runtime`, `realtime-events`).
 * - 2026-02-12: Broke down main runtime concerns into dedicated modules (`core-module-loader`, `environment`, `preferences`, `message-serialization`).
 * - 2026-02-12: Removed transitional entry-wrapper preload override and switched to direct compiled main/preload runtime wiring.
 * - 2026-02-12: Added runtime core-module path resolution to support both source and compiled main layouts.
 * - 2026-02-12: Converted main entry source from JavaScript to TypeScript (`main.ts`) for Phase 3 migration.
 * - 2026-02-12: Extracted lifecycle/window/IPC wiring into `electron/main-process/*` modules.
 * - 2026-02-12: Added renderer index-path resolution that supports both source-runtime (`electron/main.ts`) and compiled-runtime (`electron/dist/main.js`) layouts.
 * - 2026-02-12: Canonicalized chat message serialization to use core-provided `messageId` for both `id` and `messageId`.
 *   - Removed synthetic message-list fallback IDs (`mem-*`, `event-*`) from chat payloads.
 *   - Session message normalization now drops entries without messageId and de-duplicates by canonical ID.
 * - 2026-02-11: Added IPC-level refresh warning payloads so renderer can show subscription refresh/rebind issues in the UI while keeping CLI-style best-effort mutation behavior.
 * - 2026-02-11: Changed world subscription refresh/rebind to CLI-style best-effort behavior (warn on refresh/rebind issues without failing world/chat mutations).
 * - 2026-02-11: Removed Electron-side world/chat ID canonicalization guards and added world subscription refresh + chat listener rebind after world/chat mutations (CLI/API parity).
 * - 2026-02-11: Fixed chat-session message rendering by deduplicating user messages on load and enforcing unique message IDs for renderer keys.
 * - 2026-02-10: Fixed tool realtime event serialization to preserve stable tool IDs (`toolExecution.toolCallId`) across start/result/error
 * - 2026-02-10: Added explicit .env loading from project-root/cwd candidates so provider keys are available when Electron starts from `electron/`
 * - 2026-02-10: Added global log event streaming to forward logger.error/warn/info/debug/trace to renderer
 * - 2026-02-10: Added agent delete IPC handler for agent deletion from edit panel
 * - 2026-02-10: Fixed session message counts by deriving counts from persisted chat messages instead of stale chat metadata
 * - 2026-02-10: Added world form parity fields (`chatLLMProvider`, `chatLLMModel`, `mcpConfig`) to world create/update IPC and serialized world payloads
 * - 2026-02-10: Added agent create/update IPC handlers and expanded world agent summaries for header avatars and edit panel
 * - 2026-02-10: Added world agent summaries (`id`, `name`) to serialized world payloads for renderer header avatars
 * - 2026-02-10: Added `chat:delete` IPC handler for deleting chat sessions
 * - 2026-02-10: Added session delete IPC handler for chat-session list actions
 * - 2026-02-10: Added world update/delete IPC handlers for sidebar world info actions
 * - 2026-02-10: Forwarded SSE start/chunk/end events to renderer for live streaming UI updates
 * - 2026-02-10: Added reply threading metadata to serialized chat messages/events
 * - 2026-02-10: Fixed to respect AGENT_WORLD_STORAGE_TYPE from .env (not hardcode sqlite)
 * - 2026-02-10: Respect AGENT_WORLD_DATA_PATH from .env if set, default to workspace path
 * - 2026-02-10: Fixed to use SQLite storage instead of file storage (matches CLI default)
 * - 2026-02-10: Removed .agent-world folder concept, use workspace path directly via env
 * - 2026-02-10: Added default workspace path ~/agent-world to match CLI behavior
 * - 2026-02-10: Removed recent workspace functionality (worlds load from environment only)
 * - 2026-02-25: Guarded `second-instance` window focus path against destroyed BrowserWindow references.
 * - 2026-02-09: Simplified workspace dialog to only return path (no auto-switching)
 * - 2026-02-09: Removed automatic core reload from workspace functions
 * - 2026-02-09: Changed to load all worlds instead of auto-selecting first
 * - 2026-02-09: Added automatic world loading from folders with error handling
 * - 2026-02-08: Added real-time chat event streaming with multi-subscription support
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { buildMainIpcRoutes } from './main-process/ipc-routes.js';
import { registerIpcRoutes } from './main-process/ipc-registration.js';
import { createMainIpcHandlers } from './main-process/ipc-handlers.js';
import { createHeartbeatManager } from './main-process/heartbeat-manager.js';
import { resolvePreloadPath, resolveRendererIndexPath } from './main-process/window-paths.js';
import { setupMainLifecycle } from './main-process/lifecycle.js';
import type { RealtimeEventsRuntime } from './main-process/realtime-events.js';
import { resolveRealtimeEventsRuntimeFactory } from './main-process/module-interop.js';
import { createWorkspaceRuntime } from './main-process/workspace-runtime.js';
import {
  importCoreGitHubWorldImportModule,
  importCoreModule,
  importCoreStorageFactoryModule
} from './main-process/core-module-loader.js';
import {
  applySystemSettings,
  configureProvidersFromEnv,
  configureWorkspaceStorage,
  loadEnvironmentVariables,
  workspaceFromCommandLine
} from './main-process/environment.js';
import {
  readWorldPreference,
  readWorkspacePreference,
  readSystemSettings,
  writeWorldPreference,
  writeWorkspacePreference,
  writeSystemSettings,
} from './main-process/preferences.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const e2eUserDataPath = String(process.env.AGENT_WORLD_E2E_USER_DATA_PATH || '').trim();
if (e2eUserDataPath) {
  fs.mkdirSync(e2eUserDataPath, { recursive: true });
  app.setPath('userData', e2eUserDataPath);
}

const bypassSingleInstanceLock = String(process.env.AGENT_WORLD_E2E_DISABLE_SINGLE_INSTANCE || '').trim().toLowerCase() === 'true';
const hasSingleInstanceLock = bypassSingleInstanceLock ? true : app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

// Load env before importing core so logger/category levels honor LOG_* from .env.
loadEnvironmentVariables(__dirname);
applySystemSettings(readSystemSettings(app));

const {
  createAgent,
  createWorld,
  deleteAgent,
  deleteChat,
  updateAgent,
  deleteWorld,
  getMemory,
  getWorld,
  getSkillSourceScope,
  getSkillSourcePath,
  getSkillsForSystemPrompt,
  listChats,
  listWorlds,
  newChat,
  branchChatFromMessage,
  enqueueAndProcessUserTurn,
  listPendingHitlPromptEvents,
  listPendingHitlPromptEventsFromMessages,
  submitWorldHitlResponse,
  stopMessageProcessing,
  isValidCronExpression,
  startHeartbeat,
  stopHeartbeat,
  activateChatWithSnapshot,
  restoreChat,
  syncSkills,
  editUserMessage,
  subscribeWorld,
  updateWorld,
  removeMessagesFrom,
  addToQueue,
  getQueueMessages,
  removeFromQueue,
  pauseChatQueue,
  resumeChatQueue,
  stopChatQueue,
  clearChatQueue,
  retryQueueMessage,
  LLMProvider,
  configureLLMProvider,
  createCategoryLogger,
  addLogStreamCallback,
} = await importCoreModule(__dirname);
const { createStorage, createStorageFromEnv } = await importCoreStorageFactoryModule(__dirname);
const { GitHubWorldImportError, stageGitHubWorldFromShorthand, stageGitHubFolderFromRepo } = await importCoreGitHubWorldImportModule(__dirname);
const realtimeEventsRuntimeModule = await import('./main-process/realtime-events.js');
const createRealtimeEventsRuntime = resolveRealtimeEventsRuntimeFactory(realtimeEventsRuntimeModule) as
  ((dependencies: unknown) => RealtimeEventsRuntime) | null;
if (!createRealtimeEventsRuntime) {
  throw new Error('Failed to load realtime events runtime factory from ./main-process/realtime-events.js');
}

const CHAT_EVENT_CHANNEL = 'chat:event';
const mainLifecycleLogger = createCategoryLogger('electron.main.lifecycle');
const mainIpcLogger = createCategoryLogger('electron.main.ipc');
const mainIpcSessionLogger = createCategoryLogger('electron.main.ipc.session');
const mainIpcMessagesLogger = createCategoryLogger('electron.main.ipc.messages');
const mainRealtimeLogger = createCategoryLogger('electron.main.realtime');
const mainWorkspaceLogger = createCategoryLogger('electron.main.workspace');

let mainWindow: BrowserWindow | null = null;

let ensureCoreReady: () => Promise<void> = async () => {
  throw new Error('Workspace runtime not initialized');
};

const heartbeatManager = createHeartbeatManager({
  isValidCronExpression,
  startHeartbeat,
  stopHeartbeat,
});

const realtimeEventsRuntime = createRealtimeEventsRuntime({
  getMainWindow: () => mainWindow,
  chatEventChannel: CHAT_EVENT_CHANNEL,
  addLogStreamCallback,
  subscribeWorld,
  ensureCoreReady: () => ensureCoreReady(),
  getMemory,
  listPendingHitlPromptEvents,
  listPendingHitlPromptEventsFromMessages,
  stopAllHeartbeatJobs: () => heartbeatManager.stopAll(),
  loggerRealtime: mainRealtimeLogger,
});

const workspaceRuntime = createWorkspaceRuntime({
  configureWorkspaceStorage,
  configureProvidersFromEnv: () => configureProvidersFromEnv({ LLMProvider, configureLLMProvider }),
  workspaceFromCommandLine: () => workspaceFromCommandLine(process.argv),
  readWorkspacePreference: () => readWorkspacePreference(app),
  writeWorkspacePreference: (workspacePath) => writeWorkspacePreference(app, workspacePath),
  getDefaultWorkspacePath: () => path.join(os.homedir(), 'agent-world'),
  resetRuntimeSubscriptions: () => realtimeEventsRuntime.resetRuntimeSubscriptions(),
  loggerWorkspace: mainWorkspaceLogger
});

ensureCoreReady = workspaceRuntime.ensureCoreReady;

const {
  getWorkspaceState,
  initializeWorkspace
} = workspaceRuntime;

const {
  clearChatEventSubscriptions,
  ensureWorldSubscribed,
  refreshWorldSubscription,
  removeWorldSubscriptions,
  subscribeChatEvents,
  subscribeToLogEvents,
  unsubscribeChatEvents,
  unsubscribeFromLogEvents
} = realtimeEventsRuntime;

const ipcHandlers = createMainIpcHandlers({
  ensureCoreReady,
  getWorkspaceState,
  getMainWindow: () => mainWindow,
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
  createStorage,
  createStorageFromEnv,
  GitHubWorldImportError,
  stageGitHubWorldFromShorthand,
  stageGitHubFolderFromRepo,
  heartbeatManager,
  loggerIpc: mainIpcLogger,
  loggerIpcSession: mainIpcSessionLogger,
  loggerIpcMessages: mainIpcMessagesLogger
});

function registerIpcHandlers() {
  const routes = buildMainIpcRoutes({
    getWorkspaceState,
    openWorkspaceDialog: ipcHandlers.openWorkspaceDialog,
    pickDirectoryDialog: ipcHandlers.pickDirectoryDialog,
    loadWorldsFromWorkspace: ipcHandlers.loadWorldsFromWorkspace,
    loadSpecificWorld: (worldId) => ipcHandlers.loadSpecificWorld(String(worldId ?? '')),
    importWorld: ipcHandlers.importWorld,
    importAgent: ipcHandlers.importAgent,
    importSkill: ipcHandlers.importSkill,
    exportWorld: ipcHandlers.exportWorld,
    listWorkspaceWorlds: ipcHandlers.listWorkspaceWorlds,
    listSkillRegistry: ipcHandlers.listSkillRegistry,
    createWorkspaceWorld: ipcHandlers.createWorkspaceWorld,
    updateWorkspaceWorld: ipcHandlers.updateWorkspaceWorld,
    deleteWorkspaceWorld: ipcHandlers.deleteWorkspaceWorld,
    listHeartbeatJobs: ipcHandlers.listHeartbeatJobs,
    runHeartbeatJob: ipcHandlers.runHeartbeatJob,
    pauseHeartbeatJob: ipcHandlers.pauseHeartbeatJob,
    stopHeartbeatJob: ipcHandlers.stopHeartbeatJob,
    createWorldAgent: ipcHandlers.createWorldAgent,
    updateWorldAgent: ipcHandlers.updateWorldAgent,
    deleteWorldAgent: ipcHandlers.deleteWorldAgent,
    readWorldPreference: () => readWorldPreference(app),
    writeWorldPreference: (worldId) => {
      writeWorldPreference(app, String(worldId ?? ''));
      return true;
    },
    listWorldSessions: ipcHandlers.listWorldSessions,
    createWorldSession: ipcHandlers.createWorldSession,
    branchWorldSessionFromMessage: ipcHandlers.branchWorldSessionFromMessage,
    deleteWorldSession: ipcHandlers.deleteWorldSession,
    selectWorldSession: ipcHandlers.selectWorldSession,
    getSessionMessages: ipcHandlers.getSessionMessages,
    getChatEvents: ipcHandlers.getChatEvents,
    sendChatMessage: ipcHandlers.sendChatMessage,
    editMessageInChat: ipcHandlers.editMessageInChat,
    respondHitlOption: ipcHandlers.respondHitlOption,
    stopChatMessage: ipcHandlers.stopChatMessage,
    deleteMessageFromChat: ipcHandlers.deleteMessageFromChat,
    subscribeChatEvents,
    unsubscribeChatEvents,
    getLoggingConfig: ipcHandlers.getLoggingConfig,
    getSystemSettings: () => readSystemSettings(app),
    saveSystemSettings: (payload) => {
      const p = (payload ?? {}) as Record<string, unknown>;
      const restart = !!p.restart;
      delete p.restart;
      writeSystemSettings(app, p);
      applySystemSettings(p);
      if (restart) {
        app.relaunch();
        app.exit(0);
      }
      return true;
    },
    openFileDialog: ipcHandlers.openFileDialog,
    addToQueue: ipcHandlers.addToQueue,
    getQueuedMessages: ipcHandlers.getQueuedMessages,
    removeFromQueue: ipcHandlers.removeFromQueue,
    clearChatQueue: ipcHandlers.clearChatQueue,
    pauseChatQueue: ipcHandlers.pauseChatQueue,
    resumeChatQueue: ipcHandlers.resumeChatQueue,
    stopChatQueue: ipcHandlers.stopChatQueue,
    retryQueueMessage: ipcHandlers.retryQueueMessage,
    readSkillContent: ipcHandlers.readSkillContent,
    saveSkillContent: ipcHandlers.saveSkillContent
  });
  registerIpcRoutes(ipcMain, routes);
}

async function loadRenderer(win: BrowserWindow) {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    await win.loadURL(rendererUrl);
    return;
  }
  const rendererIndexPath = resolveRendererIndexPath(__dirname, fs.existsSync);
  await win.loadFile(rendererIndexPath);
}

function createMainWindow() {
  const preloadPath = resolvePreloadPath(__dirname, fs.existsSync);

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0b1018',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Keep the global window reference in sync with Electron lifecycle.
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  loadRenderer(mainWindow).catch((error) => {
    mainLifecycleLogger.error('Failed to load renderer window', {
      error: error instanceof Error ? error.message : String(error)
    });
  });
}

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    return;
  }

  if (app.isReady()) {
    createMainWindow();
  }
});

function setupAppLifecycle() {
  setupMainLifecycle({
    app: app as unknown as Parameters<typeof setupMainLifecycle>[0]['app'],
    platform: process.platform,
    getWindowCount: () => BrowserWindow.getAllWindows().length,
    clearChatEventSubscriptions,
    unsubscribeFromLogEvents,
    createMainWindow,
    quit: () => app.quit()
  });
}

async function bootstrap() {
  await app.whenReady();

  // Re-apply persisted settings after Electron is ready to ensure userData-backed
  // preferences are resolved consistently across startup environments.
  applySystemSettings(readSystemSettings(app));

  if (!process.env.AGENT_WORLD_DEFAULT_WORKING_DIRECTORY) {
    const homePath = app.getPath('home');
    const trimmedHomePath = typeof homePath === 'string' ? homePath.trim() : '';
    if (trimmedHomePath) {
      process.env.AGENT_WORLD_DEFAULT_WORKING_DIRECTORY = trimmedHomePath;
    }
  }
  initializeWorkspace();
  subscribeToLogEvents();
  registerIpcHandlers();
  createMainWindow();
  setupAppLifecycle();
}

bootstrap().catch((error) => {
  mainLifecycleLogger.error('Failed to bootstrap Electron app', {
    error: error instanceof Error ? error.message : String(error)
  });
  app.exit(1);
});
