/**
 * Electron Main Process - Desktop Runtime and IPC Router
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

import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  createWorld,
  getMemory,
  getWorld,
  listChats,
  listWorlds,
  newChat,
  publishMessage,
  restoreChat,
  LLMProvider,
  configureLLMProvider
} from '../dist/core/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_PREFS_FILE = 'workspace-preferences.json';
const CHAT_EVENT_CHANNEL = 'chat:event';

let mainWindow = null;
let activeWorkspacePath = null;
let coreWorkspacePath = null;
const chatEventSubscriptions = new Map();
const canceledSubscriptionIds = new Set();

function getWorkspacePrefsPath() {
  return path.join(app.getPath('userData'), WORKSPACE_PREFS_FILE);
}

function readWorkspacePreference() {
  const prefsPath = getWorkspacePrefsPath();
  if (!fs.existsSync(prefsPath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
    return typeof parsed.workspacePath === 'string' && parsed.workspacePath.length > 0
      ? parsed.workspacePath
      : null;
  } catch {
    return null;
  }
}

function writeWorkspacePreference(workspacePath) {
  const prefsPath = getWorkspacePrefsPath();
  const content = JSON.stringify({ workspacePath }, null, 2);
  fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
  fs.writeFileSync(prefsPath, content, 'utf-8');
}

function workspaceFromCommandLine() {
  const arg = process.argv.find((item) => item.startsWith('--workspace='));
  if (!arg) return null;
  const value = arg.slice('--workspace='.length).trim();
  return value.length > 0 ? value : null;
}

function configureWorkspaceStorage(workspacePath) {
  // Use workspace path directly as AGENT_WORLD_DATA_PATH
  // Respect existing AGENT_WORLD_STORAGE_TYPE from .env if set
  // Otherwise default to SQLite storage (matches CLI behavior)
  fs.mkdirSync(workspacePath, { recursive: true });
  
  if (!process.env.AGENT_WORLD_STORAGE_TYPE) {
    process.env.AGENT_WORLD_STORAGE_TYPE = 'sqlite';
  }
  
  if (!process.env.AGENT_WORLD_DATA_PATH) {
    process.env.AGENT_WORLD_DATA_PATH = workspacePath;
  }
}

function configureProvidersFromEnv() {
  const configMap = [
    { env: 'OPENAI_API_KEY', provider: LLMProvider.OPENAI },
    { env: 'ANTHROPIC_API_KEY', provider: LLMProvider.ANTHROPIC },
    { env: 'GOOGLE_API_KEY', provider: LLMProvider.GOOGLE },
    { env: 'XAI_API_KEY', provider: LLMProvider.XAI }
  ];

  for (const entry of configMap) {
    const apiKey = process.env[entry.env];
    if (apiKey) {
      configureLLMProvider(entry.provider, { apiKey });
    }
  }

  if (process.env.OPENAI_COMPATIBLE_API_KEY && process.env.OPENAI_COMPATIBLE_BASE_URL) {
    configureLLMProvider(LLMProvider.OPENAI_COMPATIBLE, {
      apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
      baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL
    });
  }

  if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_RESOURCE_NAME && process.env.AZURE_DEPLOYMENT) {
    configureLLMProvider(LLMProvider.AZURE, {
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      resourceName: process.env.AZURE_RESOURCE_NAME,
      deployment: process.env.AZURE_DEPLOYMENT,
      apiVersion: process.env.AZURE_API_VERSION || '2024-10-21-preview'
    });
  }

  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
  configureLLMProvider(LLMProvider.OLLAMA, { baseUrl: ollamaUrl });
}

function ensureWorkspaceSelected() {
  if (!activeWorkspacePath) {
    throw new Error('No workspace selected. Click "Open Folder" first.');
  }
}

function resetCore() {
  // Clear all active chat subscriptions before resetting
  clearChatEventSubscriptions();

  // Reset core workspace path to allow reinitialization
  coreWorkspacePath = null;
}

function ensureCoreReady() {
  ensureWorkspaceSelected();
  if (!coreWorkspacePath) {
    configureWorkspaceStorage(activeWorkspacePath);
    configureProvidersFromEnv();
    coreWorkspacePath = activeWorkspacePath;
    return;
  }

  if (coreWorkspacePath !== activeWorkspacePath) {
    // Auto-reload core with new workspace instead of throwing error
    resetCore();
    configureWorkspaceStorage(activeWorkspacePath);
    configureProvidersFromEnv();
    coreWorkspacePath = activeWorkspacePath;
  }
}

function setWorkspace(workspacePath, persist) {
  activeWorkspacePath = workspacePath;
  if (persist) {
    writeWorkspacePreference(workspacePath);
  }
}

function getWorkspaceState() {
  return {
    workspacePath: activeWorkspacePath,
    storagePath: activeWorkspacePath,
    coreInitialized: !!coreWorkspacePath
  };
}

function serializeWorldInfo(world) {
  return {
    id: world.id,
    name: world.name,
    description: world.description || '',
    turnLimit: world.turnLimit,
    totalAgents: world.totalAgents,
    totalMessages: world.totalMessages
  };
}

function serializeChat(chat) {
  return {
    id: chat.id,
    worldId: chat.worldId,
    name: chat.name,
    description: chat.description || '',
    createdAt: chat.createdAt instanceof Date ? chat.createdAt.toISOString() : String(chat.createdAt),
    updatedAt: chat.updatedAt instanceof Date ? chat.updatedAt.toISOString() : String(chat.updatedAt),
    messageCount: chat.messageCount
  };
}

function serializeMessage(message, fallbackIndex) {
  const timestamp = message.createdAt instanceof Date
    ? message.createdAt.toISOString()
    : message.createdAt
      ? String(message.createdAt)
      : new Date().toISOString();

  return {
    id: message.messageId || `mem-${fallbackIndex}`,
    role: message.role,
    sender: message.sender || message.agentId || 'unknown',
    content: message.content || '',
    createdAt: timestamp,
    chatId: message.chatId || null,
    messageId: message.messageId || null
  };
}

function toIsoTimestamp(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.length > 0) return value;
  return new Date().toISOString();
}

function deriveEventRole(event) {
  if (typeof event?.role === 'string' && event.role.length > 0) {
    return event.role;
  }
  const sender = typeof event?.sender === 'string' ? event.sender.toLowerCase() : '';
  if (sender === 'human' || sender.startsWith('user')) return 'user';
  return 'assistant';
}

/**
 * Serialize realtime message event for IPC transmission
 * @param {string} worldId - World identifier
 * @param {object} event - Event object from world emitter
 * @returns {object} Serialized event payload
 */
function serializeRealtimeMessageEvent(worldId, event) {
  const createdAt = toIsoTimestamp(event?.timestamp);
  return {
    type: 'message',
    worldId,
    chatId: event?.chatId || null,
    message: {
      id: event?.messageId || `event-${Date.now()}`,
      role: deriveEventRole(event),
      sender: event?.sender || 'unknown',
      content: event?.content || '',
      createdAt,
      chatId: event?.chatId || null,
      messageId: event?.messageId || null
    }
  };
}

/**
 * Load all worlds from current workspace
 * @returns {Promise<{success: boolean, worlds?: Array, error?: string, message?: string}>}
 */
async function loadWorldsFromWorkspace() {
  try {
    ensureCoreReady();

    const worlds = await listWorlds();
    if (!worlds || worlds.length === 0) {
      return {
        success: false,
        error: 'No worlds found in this folder',
        message: 'No worlds found in this folder. Please open a folder containing an Agent World.',
        worlds: []
      };
    }

    // Sort by name
    const sortedWorlds = [...worlds].sort((a, b) => a.name.localeCompare(b.name));

    return {
      success: true,
      worlds: sortedWorlds.map((w) => ({ id: w.id, name: w.name }))
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Unknown error',
      message: `Failed to load worlds: ${error.message || 'Unknown error'}`,
      worlds: []
    };
  }
}

/**
 * Load specific world by ID with sessions
 * @param {string} worldId - World identifier
 * @returns {Promise<{success: boolean, world?: object, sessions?: Array, error?: string, message?: string}>}
 */
async function loadSpecificWorld(worldId) {
  try {
    ensureCoreReady();

    // Load world details
    const world = await getWorld(worldId);
    if (!world) {
      return {
        success: false,
        error: 'Failed to load world',
        message: `Failed to load world '${worldId}'. The world data may be corrupted.`
      };
    }

    // Load sessions
    const sessions = await listChats(world.id);

    return {
      success: true,
      world: serializeWorldInfo(world),
      sessions: sessions.map((chat) => serializeChat(chat))
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Unknown error',
      message: `Failed to load world: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Send realtime event to renderer process
 * @param {object} payload - Event payload to send
 */
function sendRealtimeEventToRenderer(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(CHAT_EVENT_CHANNEL, payload);
}

function toSubscriptionId(payload) {
  const raw = payload?.subscriptionId;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim();
  }
  return 'default';
}

function removeChatEventSubscription(subscriptionId) {
  const existing = chatEventSubscriptions.get(subscriptionId);
  if (existing?.unsubscribe) {
    existing.unsubscribe();
  }
  chatEventSubscriptions.delete(subscriptionId);
}

/**
 * Clear all active chat event subscriptions
 */
function clearChatEventSubscriptions() {
  for (const subscriptionId of chatEventSubscriptions.keys()) {
    removeChatEventSubscription(subscriptionId);
  }
  canceledSubscriptionIds.clear();
}

/**
 * Open folder picker dialog for project/workspace selection
 * Note: Returns selected path without switching workspace or loading worlds
 * @returns {Promise<{workspacePath?: string, canceled: boolean}>}
 */
async function openWorkspaceDialog() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Folder',
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { ...getWorkspaceState(), canceled: true };
  }

  const selectedPath = result.filePaths[0];
  if (!selectedPath) {
    return { ...getWorkspaceState(), canceled: true };
  }

  // Return selected path for project context (informational only)
  return {
    ...getWorkspaceState(),
    canceled: false,
    workspacePath: selectedPath
  };
}

/**
 * List all worlds in current workspace
 * @returns {Promise<Array>} Array of serialized world info
 */
async function listWorkspaceWorlds() {
  ensureCoreReady();
  const worlds = await listWorlds();
  return worlds.map((world) => serializeWorldInfo(world));
}

/**
 * Create a new world in current workspace
 * @param {object} payload - World creation payload {name, description?, turnLimit?}
 * @returns {Promise<object>} Serialized created world info
 */
async function createWorkspaceWorld(payload) {
  ensureCoreReady();
  const name = String(payload?.name || '').trim();
  if (!name) {
    throw new Error('World name is required.');
  }

  const turnLimitRaw = Number(payload?.turnLimit ?? 5);
  const turnLimit = Number.isFinite(turnLimitRaw) && turnLimitRaw > 0
    ? Math.floor(turnLimitRaw)
    : 5;

  const created = await createWorld({
    name,
    description: payload?.description ? String(payload.description) : undefined,
    turnLimit
  });

  if (!created) {
    throw new Error('Failed to create world.');
  }

  return serializeWorldInfo(created);
}

/**
 * Import world from external folder with validation
 * @returns {Promise<{success: boolean, world?: object, sessions?: Array, error?: string, message?: string}>}
 */
async function importWorld() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import World from Folder',
    properties: ['openDirectory'],
    buttonLabel: 'Import'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return {
      success: false,
      error: 'Import canceled',
      message: 'World import was canceled'
    };
  }

  const folderPath = result.filePaths[0];

  try {
    ensureCoreReady();

    // Task 2.4d: Path safety validation
    const normalizedPath = path.normalize(folderPath);
    const absolutePath = path.resolve(normalizedPath);

    // Task 2.4b: Validate world folder structure
    if (!fs.existsSync(absolutePath)) {
      return {
        success: false,
        error: 'Folder not found',
        message: 'The selected folder does not exist'
      };
    }

    const stats = fs.statSync(absolutePath);
    if (!stats.isDirectory()) {
      return {
        success: false,
        error: 'Not a directory',
        message: 'Selected path is not a folder'
      };
    }

    // Check for valid world structure (look for .world file or world data)
    const worldConfigFile = path.join(absolutePath, '.world');
    const hasWorldConfig = fs.existsSync(worldConfigFile);

    if (!hasWorldConfig) {
      return {
        success: false,
        error: 'Invalid world folder',
        message: 'Selected folder does not contain a valid world (.world file not found)'
      };
    }

    // Get the world ID from the folder name
    const worldId = path.basename(absolutePath);

    // Task 2.4c: Check for duplicate world IDs (check BEFORE trying to load)
    const worlds = await listWorlds();
    if (worlds.some(w => w.id === worldId)) {
      return {
        success: false,
        error: 'World already exists',
        message: `A world with ID '${worldId}' already exists in this workspace`
      };
    }

    // Try to load the world details (should exist if .world file is valid)
    const importedWorld = await getWorld(worldId);
    if (!importedWorld) {
      return {
        success: false,
        error: 'Failed to load world',
        message: 'Could not load world data from the selected folder'
      };
    }

    // Load sessions for the imported world
    const sessions = await listChats(worldId);

    return {
      success: true,
      world: serializeWorldInfo(importedWorld),
      sessions: sessions.map(chat => serializeChat(chat))
    };
  } catch (error) {
    // Task 2.4e: Error handling with specific error messages
    return {
      success: false,
      error: error.message || 'Unknown error',
      message: `Failed to import world: ${error.message || 'Unknown error occurred'}`
    };
  }
}

async function listWorldSessions(worldId) {
  ensureCoreReady();
  const id = String(worldId || '').trim();
  if (!id) throw new Error('World ID is required.');
  const world = await getWorld(id);
  if (!world) throw new Error(`World not found: ${id}`);

  const chats = await listChats(id);
  return chats.map((chat) => serializeChat(chat));
}

async function createWorldSession(worldId) {
  ensureCoreReady();
  const id = String(worldId || '').trim();
  if (!id) throw new Error('World ID is required.');

  const updatedWorld = await newChat(id);
  if (!updatedWorld) throw new Error(`World not found: ${id}`);

  const chats = await listChats(id);
  return {
    currentChatId: updatedWorld.currentChatId || null,
    sessions: chats.map((chat) => serializeChat(chat))
  };
}

async function selectWorldSession(worldId, chatId) {
  ensureCoreReady();
  const id = String(worldId || '').trim();
  const sessionId = String(chatId || '').trim();
  if (!id) throw new Error('World ID is required.');
  if (!sessionId) throw new Error('Session ID is required.');

  const world = await restoreChat(id, sessionId);
  if (!world) throw new Error(`World or session not found: ${id}/${sessionId}`);

  return { worldId: id, chatId: world.currentChatId || sessionId };
}

async function getSessionMessages(worldId, chatId) {
  ensureCoreReady();
  const id = String(worldId || '').trim();
  if (!id) throw new Error('World ID is required.');

  const normalizedChatId = chatId ? String(chatId).trim() : null;
  const memory = await getMemory(id, normalizedChatId);
  if (!memory) return [];

  return memory.map((message, index) => serializeMessage(message, index));
}

async function subscribeChatEvents(payload) {
  ensureCoreReady();
  const subscriptionId = toSubscriptionId(payload);
  const worldId = String(payload?.worldId || '').trim();
  const chatId = payload?.chatId ? String(payload.chatId).trim() : null;
  if (!worldId) throw new Error('World ID is required.');

  const existing = chatEventSubscriptions.get(subscriptionId);
  if (existing && existing.worldId === worldId && existing.chatId === chatId) {
    return { subscribed: true, subscriptionId, worldId, chatId };
  }

  removeChatEventSubscription(subscriptionId);
  canceledSubscriptionIds.delete(subscriptionId);

  const world = await getWorld(worldId);
  if (!world) throw new Error(`World not found: ${worldId}`);
  if (canceledSubscriptionIds.has(subscriptionId)) {
    canceledSubscriptionIds.delete(subscriptionId);
    return { subscribed: false, canceled: true, subscriptionId, worldId, chatId };
  }

  const handler = (event) => {
    const eventChatId = event?.chatId ? String(event.chatId) : null;
    if (chatId && eventChatId !== chatId) return;
    sendRealtimeEventToRenderer({
      ...serializeRealtimeMessageEvent(worldId, event),
      subscriptionId
    });
  };

  world.eventEmitter.on('message', handler);
  chatEventSubscriptions.set(subscriptionId, {
    worldId,
    chatId,
    unsubscribe: () => world.eventEmitter.off('message', handler)
  });

  if (canceledSubscriptionIds.has(subscriptionId)) {
    canceledSubscriptionIds.delete(subscriptionId);
    removeChatEventSubscription(subscriptionId);
    return { subscribed: false, canceled: true, subscriptionId, worldId, chatId };
  }

  return { subscribed: true, subscriptionId, worldId, chatId };
}

async function unsubscribeChatEvents(payload) {
  const subscriptionId = toSubscriptionId(payload);
  canceledSubscriptionIds.add(subscriptionId);
  removeChatEventSubscription(subscriptionId);
  return { subscribed: false, subscriptionId };
}

async function sendChatMessage(payload) {
  ensureCoreReady();
  const worldId = String(payload?.worldId || '').trim();
  const chatId = payload?.chatId ? String(payload.chatId).trim() : null;
  const content = String(payload?.content || '').trim();
  const sender = payload?.sender ? String(payload.sender).trim() : 'human';

  if (!worldId) throw new Error('World ID is required.');
  if (!content) throw new Error('Message content is required.');

  if (chatId) {
    await restoreChat(worldId, chatId);
  }

  const world = await getWorld(worldId);
  if (!world) throw new Error(`World not found: ${worldId}`);

  const event = publishMessage(world, content, sender, chatId || undefined);
  return {
    messageId: event.messageId,
    sender: event.sender,
    content: event.content,
    createdAt: toIsoTimestamp(event.timestamp)
  };
}

function registerIpcHandlers() {
  ipcMain.handle('workspace:get', async () => getWorkspaceState());
  ipcMain.handle('workspace:open', async () => openWorkspaceDialog());
  ipcMain.handle('world:loadFromFolder', async () => loadWorldsFromWorkspace());
  ipcMain.handle('world:load', async (_event, worldId) => loadSpecificWorld(worldId));
  ipcMain.handle('world:import', async () => importWorld());
  ipcMain.handle('world:list', async () => listWorkspaceWorlds());
  ipcMain.handle('world:create', async (_, payload) => createWorkspaceWorld(payload));
  ipcMain.handle('session:list', async (_, payload) => listWorldSessions(payload?.worldId));
  ipcMain.handle('session:create', async (_, payload) => createWorldSession(payload?.worldId));
  ipcMain.handle('session:select', async (_, payload) => selectWorldSession(payload?.worldId, payload?.chatId));
  ipcMain.handle('chat:getMessages', async (_, payload) => getSessionMessages(payload?.worldId, payload?.chatId));
  ipcMain.handle('chat:sendMessage', async (_, payload) => sendChatMessage(payload));
  ipcMain.handle('chat:subscribeEvents', async (_, payload) => subscribeChatEvents(payload));
  ipcMain.handle('chat:unsubscribeEvents', async (_, payload) => unsubscribeChatEvents(payload));
}

async function loadRenderer(win) {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    await win.loadURL(rendererUrl);
    return;
  }
  await win.loadFile(path.join(__dirname, 'renderer', 'dist', 'index.html'));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0b1018',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  loadRenderer(mainWindow).catch((error) => {
    console.error('Failed to load renderer:', error);
  });
}

function initializeWorkspace() {
  const startupWorkspace = workspaceFromCommandLine() || readWorkspacePreference();
  if (startupWorkspace) {
    setWorkspace(startupWorkspace, false);
  } else {
    // Default to ~/agent-world if no workspace specified (matches CLI behavior)
    const homeDir = os.homedir();
    const defaultWorkspace = path.join(homeDir, 'agent-world');
    setWorkspace(defaultWorkspace, false);
  }
}

function setupAppLifecycle() {
  app.on('window-all-closed', () => {
    clearChatEventSubscriptions();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}

async function bootstrap() {
  await app.whenReady();
  initializeWorkspace();
  registerIpcHandlers();
  createMainWindow();
  setupAppLifecycle();
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap Electron app:', error);
  app.exit(1);
});
