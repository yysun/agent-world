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
import { resolvePreloadPath, resolveRendererIndexPath } from './main-process/window-paths.js';
import { setupMainLifecycle } from './main-process/lifecycle.js';
import { createRealtimeEventsRuntime } from './main-process/realtime-events.js';
import { createWorkspaceRuntime } from './main-process/workspace-runtime.js';
import { importCoreModule } from './main-process/core-module-loader.js';
import {
  configureProvidersFromEnv,
  configureWorkspaceStorage,
  loadEnvironmentVariables,
  workspaceFromCommandLine
} from './main-process/environment.js';
import {
  readWorldPreference,
  readWorkspacePreference,
  writeWorldPreference,
  writeWorkspacePreference,
} from './main-process/preferences.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
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
  newChat,
  publishMessage,
  stopMessageProcessing,
  restoreChat,
  subscribeWorld,
  updateWorld,
  removeMessagesFrom,
  LLMProvider,
  configureLLMProvider,
  addLogStreamCallback
} = await importCoreModule(__dirname);

const CHAT_EVENT_CHANNEL = 'chat:event';

let mainWindow: BrowserWindow | null = null;

loadEnvironmentVariables(__dirname);

let ensureCoreReady: () => Promise<void> = async () => {
  throw new Error('Workspace runtime not initialized');
};

const realtimeEventsRuntime = createRealtimeEventsRuntime({
  getMainWindow: () => mainWindow,
  chatEventChannel: CHAT_EVENT_CHANNEL,
  addLogStreamCallback,
  subscribeWorld,
  ensureCoreReady: () => ensureCoreReady()
});

const workspaceRuntime = createWorkspaceRuntime({
  configureWorkspaceStorage,
  configureProvidersFromEnv: () => configureProvidersFromEnv({ LLMProvider, configureLLMProvider }),
  workspaceFromCommandLine: () => workspaceFromCommandLine(process.argv),
  readWorkspacePreference: () => readWorkspacePreference(app),
  writeWorkspacePreference: (workspacePath) => writeWorkspacePreference(app, workspacePath),
  getDefaultWorkspacePath: () => path.join(os.homedir(), 'agent-world'),
  resetRuntimeSubscriptions: () => realtimeEventsRuntime.resetRuntimeSubscriptions()
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
  newChat,
  publishMessage,
  stopMessageProcessing,
  restoreChat,
  updateWorld,
  removeMessagesFrom
});

function registerIpcHandlers() {
  const routes = buildMainIpcRoutes({
    getWorkspaceState,
    openWorkspaceDialog: ipcHandlers.openWorkspaceDialog,
    loadWorldsFromWorkspace: ipcHandlers.loadWorldsFromWorkspace,
    loadSpecificWorld: (worldId) => ipcHandlers.loadSpecificWorld(String(worldId ?? '')),
    importWorld: ipcHandlers.importWorld,
    listWorkspaceWorlds: ipcHandlers.listWorkspaceWorlds,
    createWorkspaceWorld: ipcHandlers.createWorkspaceWorld,
    updateWorkspaceWorld: ipcHandlers.updateWorkspaceWorld,
    deleteWorkspaceWorld: ipcHandlers.deleteWorkspaceWorld,
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
    deleteWorldSession: ipcHandlers.deleteWorldSession,
    selectWorldSession: ipcHandlers.selectWorldSession,
    getSessionMessages: ipcHandlers.getSessionMessages,
    sendChatMessage: ipcHandlers.sendChatMessage,
    stopChatMessage: ipcHandlers.stopChatMessage,
    deleteMessageFromChat: ipcHandlers.deleteMessageFromChat,
    subscribeChatEvents,
    unsubscribeChatEvents
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

  loadRenderer(mainWindow).catch((error) => {
    console.error('Failed to load renderer:', error);
  });
}

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
  initializeWorkspace();
  subscribeToLogEvents();
  registerIpcHandlers();
  createMainWindow();
  setupAppLifecycle();
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap Electron app:', error);
  app.exit(1);
});
