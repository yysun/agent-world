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
//@ts-check
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import dotenv from 'dotenv';
import {
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
  restoreChat,
  subscribeWorld,
  updateWorld,
  removeMessagesFrom,
  LLMProvider,
  configureLLMProvider,
  addLogStreamCallback
} from '../dist/core/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_PREFS_FILE = 'workspace-preferences.json';
const CHAT_EVENT_CHANNEL = 'chat:event';

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null;
/** @type {string | null} */
let activeWorkspacePath = null;
/** @type {string | null} */
let coreWorkspacePath = null;
/** @type {Map<string, {worldId: string, chatId: string | null, unsubscribe: () => void}>} */
const chatEventSubscriptions = new Map();
/** @type {Map<string, {world: any, unsubscribe: () => Promise<void>}>} */
const worldSubscriptions = new Map(); // Track world subscriptions for agent responses
/** @type {Set<string>} */
const canceledSubscriptionIds = new Set();
/** @type {(() => void) | null} */
let logStreamUnsubscribe = null; // Global log stream subscription cleanup

function loadEnvironmentVariables() {
  const candidates = [
    process.env.AGENT_WORLD_DOTENV_PATH,
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(__dirname, '../.env')
  ]
    .filter((candidate) => typeof candidate === 'string' && candidate.length > 0)
    .map((candidate) => path.resolve(candidate));

  const uniqueCandidates = [...new Set(candidates)];

  for (const envPath of uniqueCandidates) {
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath, quiet: true });
    break;
  }
}

loadEnvironmentVariables();

function getWorkspacePrefsPath() {
  return path.join(app.getPath('userData'), WORKSPACE_PREFS_FILE);
}

function readPreferences() {
  const prefsPath = getWorkspacePrefsPath();
  if (!fs.existsSync(prefsPath)) return {};

  try {
    return JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, any>} prefs
 */
function writePreferences(prefs) {
  const prefsPath = getWorkspacePrefsPath();
  const content = JSON.stringify(prefs, null, 2);
  fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
  fs.writeFileSync(prefsPath, content, 'utf-8');
}

function readWorkspacePreference() {
  const prefs = readPreferences();
  return typeof prefs.workspacePath === 'string' && prefs.workspacePath.length > 0
    ? prefs.workspacePath
    : null;
}

/**
 * @param {string} workspacePath
 */
function writeWorkspacePreference(workspacePath) {
  const prefs = readPreferences();
  prefs.workspacePath = workspacePath;
  writePreferences(prefs);
}

function readWorldPreference() {
  const prefs = readPreferences();
  return typeof prefs.lastWorldId === 'string' && prefs.lastWorldId.length > 0
    ? prefs.lastWorldId
    : null;
}

/**
 * @param {string} worldId
 */
function writeWorldPreference(worldId) {
  const prefs = readPreferences();
  prefs.lastWorldId = worldId;
  writePreferences(prefs);
}

function workspaceFromCommandLine() {
  const arg = process.argv.find((item) => item.startsWith('--workspace='));
  if (!arg) return null;
  const value = arg.slice('--workspace='.length).trim();
  return value.length > 0 ? value : null;
}

/**
 * @param {string} workspacePath
 */
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

async function resetCore() {
  // Clear all active chat subscriptions before resetting
  clearChatEventSubscriptions();

  // Clean up all world subscriptions
  for (const [worldId, subscription] of worldSubscriptions.entries()) {
    try {
      await subscription.unsubscribe();
    } catch (error) {
      console.error(`Failed to unsubscribe world ${worldId}:`, error);
    }
  }
  worldSubscriptions.clear();
  // Clear all active chat subscriptions before resetting
  clearChatEventSubscriptions();

  // Reset core workspace path to allow reinitialization
  coreWorkspacePath = null;
}

function ensureCoreReady() {
  ensureWorkspaceSelected();
  if (!coreWorkspacePath) {
    if (!activeWorkspacePath) throw new Error('No workspace path available');
    configureWorkspaceStorage(activeWorkspacePath);
    configureProvidersFromEnv();
    coreWorkspacePath = activeWorkspacePath;
    return;
  }

  if (coreWorkspacePath !== activeWorkspacePath) {
    // Auto-reload core with new workspace instead of throwing error
    resetCore();
    if (!activeWorkspacePath) throw new Error('No workspace path available');
    configureWorkspaceStorage(activeWorkspacePath);
    configureProvidersFromEnv();
    coreWorkspacePath = activeWorkspacePath;
  }
}

/**
 * @param {string} workspacePath
 * @param {boolean} persist
 */
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

/**
 * @param {any} agent
 * @param {number} fallbackIndex
 */
function serializeAgentSummary(agent, fallbackIndex = 0) {
  const rawId = typeof agent?.id === 'string' ? agent.id.trim() : '';
  const rawName = typeof agent?.name === 'string' ? agent.name.trim() : '';
  const id = rawId || `agent-${fallbackIndex + 1}`;
  const rawMessageCount = Array.isArray(agent?.memory) ? agent.memory.length : 0;
  return {
    id,
    name: rawName || id,
    type: typeof agent?.type === 'string' ? agent.type : 'assistant',
    status: typeof agent?.status === 'string' ? agent.status : 'inactive',
    provider: typeof agent?.provider === 'string' ? agent.provider : 'openai',
    model: typeof agent?.model === 'string' ? agent.model : 'gpt-4o-mini',
    systemPrompt: typeof agent?.systemPrompt === 'string' ? agent.systemPrompt : '',
    temperature: Number.isFinite(Number(agent?.temperature)) ? Number(agent.temperature) : null,
    maxTokens: Number.isFinite(Number(agent?.maxTokens)) ? Number(agent.maxTokens) : null,
    llmCallCount: Number.isFinite(Number(agent?.llmCallCount)) ? Number(agent.llmCallCount) : 0,
    messageCount: Number.isFinite(Number(rawMessageCount)) ? Number(rawMessageCount) : 0
  };
}

/**
 * @param {any} world
 */
function serializeWorldAgents(world) {
  const worldAgents = world?.agents instanceof Map
    ? Array.from(world.agents.values())
    : Array.isArray(world?.agents)
      ? world.agents
      : [];

  return worldAgents.map((agent, index) => serializeAgentSummary(agent, index));
}

/**
 * @param {any} world
 */
function serializeWorldInfo(world) {
  return {
    id: world.id,
    name: world.name,
    description: world.description || '',
    turnLimit: world.turnLimit,
    chatLLMProvider: world.chatLLMProvider || null,
    chatLLMModel: world.chatLLMModel || null,
    mcpConfig: world.mcpConfig || null,
    totalAgents: world.totalAgents,
    totalMessages: world.totalMessages,
    agents: serializeWorldAgents(world)
  };
}

/**
 * @param {any} chat
 */
function serializeChat(chat) {
  const rawMessageCount = Number(chat?.messageCount);
  return {
    id: chat.id,
    worldId: chat.worldId,
    name: chat.name,
    description: chat.description || '',
    createdAt: chat.createdAt instanceof Date ? chat.createdAt.toISOString() : String(chat.createdAt),
    updatedAt: chat.updatedAt instanceof Date ? chat.updatedAt.toISOString() : String(chat.updatedAt),
    messageCount: Number.isFinite(rawMessageCount) ? Math.max(0, Math.floor(rawMessageCount)) : 0
  };
}

/**
 * Build serialized chat sessions with message counts derived from persisted memory.
 * Chat metadata `messageCount` is not always current across all storage flows.
 * @param {string} worldId
 * @param {any[]} chats
 */
async function serializeChatsWithMessageCounts(worldId, chats) {
  const worldKey = String(worldId || '');
  if (!worldKey) {
    return [];
  }

  const chatList = Array.isArray(chats) ? chats : [];
  const messageCounts = new Map();

  await Promise.all(chatList.map(async (chat) => {
    const chatId = String(chat?.id || '');
    if (!chatId) return;

    try {
      const messages = await getMemory(worldKey, chatId);
      const count = Array.isArray(messages) ? messages.length : 0;
      messageCounts.set(chatId, count);
    } catch {
      const fallbackCount = Number(chat?.messageCount);
      messageCounts.set(chatId, Number.isFinite(fallbackCount) ? fallbackCount : 0);
    }
  }));

  return chatList.map((chat) => {
    const chatId = String(chat?.id || '');
    const derivedCount = messageCounts.get(chatId);
    return serializeChat({
      ...chat,
      messageCount: Number.isFinite(Number(derivedCount)) ? Number(derivedCount) : chat?.messageCount
    });
  });
}

/**
 * @param {any} message
 */
function serializeMessage(message) {
  const messageId = String(message?.messageId || '').trim();
  if (!messageId) {
    return null;
  }

  const timestamp = message.createdAt instanceof Date
    ? message.createdAt.toISOString()
    : message.createdAt
      ? String(message.createdAt)
      : new Date().toISOString();

  return {
    id: messageId,
    role: message.role,
    sender: message.sender || message.agentId || 'unknown',
    content: message.content || '',
    createdAt: timestamp,
    chatId: message.chatId || null,
    messageId,
    replyToMessageId: message.replyToMessageId || null,
    fromAgentId: message.agentId || null
  };
}

/**
 * @param {string | null | undefined} sender
 */
function isHumanSender(sender) {
  const normalized = String(sender || '').trim().toLowerCase();
  return normalized === 'human' || normalized === 'user';
}

/**
 * Deduplicate loaded session messages so user turns appear once even when mirrored
 * across multiple agent memories.
 * @param {any[]} messages
 */
function normalizeSessionMessages(messages) {
  const source = Array.isArray(messages) ? messages : [];
  const seenMessageIds = new Set();
  const deduplicated = [];

  for (const rawMessage of source) {
    if (!rawMessage) continue;

    const messageId = String(rawMessage?.messageId || '').trim();
    if (!messageId) continue;

    const message = {
      ...rawMessage,
      id: messageId,
      messageId
    };

    const role = String(message.role || '').trim().toLowerCase();
    const isUserMessage = role === 'user' || isHumanSender(message?.sender);

    if (isUserMessage && seenMessageIds.has(messageId)) {
      continue;
    }
    if (seenMessageIds.has(messageId)) continue;
    seenMessageIds.add(messageId);

    deduplicated.push(message);
  }

  return deduplicated;
}

/**
 * @param {Date | string | any} value
 */
function toIsoTimestamp(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.length > 0) return value;
  return new Date().toISOString();
}

/**
 * @param {any} event
 */
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
 * @param {any} event - Event object from world emitter
 * @returns {any} Serialized event payload
 */
function serializeRealtimeMessageEvent(worldId, event) {
  const messageId = String(event?.messageId || '').trim();
  if (!messageId) {
    return null;
  }

  const createdAt = toIsoTimestamp(event?.timestamp);
  return {
    type: 'message',
    worldId,
    chatId: event?.chatId || null,
    message: {
      id: messageId,
      role: deriveEventRole(event),
      sender: event?.sender || 'unknown',
      content: event?.content || '',
      createdAt,
      chatId: event?.chatId || null,
      messageId,
      replyToMessageId: event?.replyToMessageId || null
    }
  };
}

/**
 * Serialize realtime SSE event for IPC transmission
 * @param {string} worldId - World identifier
 * @param {string | null} chatId - Subscription chat id
 * @param {any} event - SSE event object from world emitter
 * @returns {any} Serialized event payload
 */
function serializeRealtimeSSEEvent(worldId, chatId, event) {
  const messageId = typeof event?.messageId === 'string' ? event.messageId : null;
  return {
    type: 'sse',
    worldId,
    chatId: chatId || null,
    sse: {
      eventType: event?.type || 'chunk',
      messageId,
      agentName: event?.agentName || 'assistant',
      content: event?.content || '',
      error: event?.error || null,
      createdAt: new Date().toISOString(),
      chatId: chatId || null
    }
  };
}

/**
 * Serialize realtime tool event for IPC transmission
 * @param {string} worldId - World identifier
 * @param {string | null} chatId - Subscription chat id
 * @param {any} event - Tool event object from world emitter
 * @returns {any} Serialized event payload
 */
function serializeRealtimeToolEvent(worldId, chatId, event) {
  const eventType = event?.type || 'tool-progress';
  const toolExecution = event?.toolExecution || null;
  const toolUseId = String(
    event?.toolUseId ||
    toolExecution?.toolCallId ||
    `tool-${Date.now()}`
  );

  return {
    type: 'tool',
    worldId,
    chatId: chatId || null,
    tool: {
      eventType,
      toolUseId,
      toolName: event?.toolName || toolExecution?.toolName || 'unknown',
      toolInput: event?.toolInput || toolExecution?.input || null,
      result: event?.result || toolExecution?.result || null,
      error: event?.error || toolExecution?.error || null,
      progress: event?.progress || null,
      agentId: event?.agentId || null,
      createdAt: new Date().toISOString()
    }
  };
}

/**
 * Serialize log event for IPC transmission
 * @param {any} logEvent - Log event from logger callback
 * @returns {any} Serialized event payload
 */
function serializeRealtimeLogEvent(logEvent) {
  return {
    type: 'log',
    logEvent: {
      level: logEvent?.level || 'info',
      category: logEvent?.category || 'unknown',
      message: logEvent?.message || '',
      timestamp: logEvent?.timestamp || new Date().toISOString(),
      data: logEvent?.data || null,
      messageId: logEvent?.messageId || `log-${Date.now()}`
    }
  };
}

/**
 * Load all worlds from current workspace
 * @returns {Promise<{success: boolean, worlds?: any[], error?: string, message?: string}>}
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
    const err = /** @type {Error} */ (error);
    return {
      success: false,
      error: err.message || 'Unknown error',
      message: `Failed to load worlds: ${err.message || 'Unknown error'}`,
      worlds: []
    };
  }
}

/**
 * Load specific world by ID with sessions
 * @param {string} worldId - World identifier
 * @returns {Promise<{success: boolean, world?: any, sessions?: any[], error?: string, message?: string}>}
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
    const chats = await listChats(world.id);
    const sessions = await serializeChatsWithMessageCounts(world.id, chats);

    return {
      success: true,
      world: serializeWorldInfo(world),
      sessions
    };
  } catch (error) {
    const err = /** @type {Error} */ (error);
    return {
      success: false,
      error: err.message || 'Unknown error',
      message: `Failed to load world: ${err.message || 'Unknown error'}`
    };
  }
}

/**
 * Send realtime event to renderer process
 * @param {any} payload - Event payload to send
 */
function sendRealtimeEventToRenderer(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(CHAT_EVENT_CHANNEL, payload);
}

/**
 * Subscribe to global log stream events and forward to renderer
 */
function subscribeToLogEvents() {
  // Unsubscribe from any existing log stream
  if (logStreamUnsubscribe) {
    logStreamUnsubscribe();
    logStreamUnsubscribe = null;
  }

  // Subscribe to log events from core logger
  logStreamUnsubscribe = addLogStreamCallback((logEvent) => {
    // Forward log event to renderer
    sendRealtimeEventToRenderer(serializeRealtimeLogEvent(logEvent));
  });
}

/**
 * Unsubscribe from global log stream events
 */
function unsubscribeFromLogEvents() {
  if (logStreamUnsubscribe) {
    logStreamUnsubscribe();
    logStreamUnsubscribe = null;
  }
}

/**
 * @param {any} payload
 */
function toSubscriptionId(payload) {
  const raw = payload?.subscriptionId;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim();
  }
  return 'default';
}

/**
 * @param {string} subscriptionId
 */
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
 * @returns {Promise<{workspacePath?: string | null, storagePath?: string | null, coreInitialized?: boolean, canceled: boolean}>}
 */
async function openWorkspaceDialog() {
  if (!mainWindow) throw new Error('Main window not initialized');
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
 * @returns {Promise<any[]>} Array of serialized world info
 */
async function listWorkspaceWorlds() {
  ensureCoreReady();
  const worlds = await listWorlds();
  return worlds.map((world) => serializeWorldInfo(world));
}

/**
 * Create a new world in current workspace
 * @param {any} payload - World creation payload {name, description?, turnLimit?, chatLLMProvider?, chatLLMModel?, mcpConfig?}
 * @returns {Promise<any>} Serialized created world info
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
  const chatLLMProvider = payload?.chatLLMProvider == null
    ? undefined
    : String(payload.chatLLMProvider || '').trim() || undefined;
  const chatLLMModel = payload?.chatLLMModel == null
    ? undefined
    : String(payload.chatLLMModel || '').trim() || undefined;
  const mcpConfig = payload?.mcpConfig == null
    ? undefined
    : String(payload.mcpConfig);

  const created = await createWorld({
    name,
    description: payload?.description ? String(payload.description) : undefined,
    turnLimit,
    chatLLMProvider,
    chatLLMModel,
    mcpConfig
  });

  if (!created) {
    throw new Error('Failed to create world.');
  }

  return serializeWorldInfo(created);
}

/**
 * Update an existing world in current workspace
 * @param {any} payload - Update payload {worldId, name?, description?, turnLimit?, chatLLMProvider?, chatLLMModel?, mcpConfig?}
 * @returns {Promise<any>} Serialized updated world info
 */
async function updateWorkspaceWorld(payload) {
  ensureCoreReady();
  const worldId = String(payload?.worldId || '');
  if (!worldId) {
    throw new Error('World ID is required.');
  }

  const updates = {};

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

  if (Object.keys(updates).length === 0) {
    throw new Error('No world updates were provided.');
  }

  const updated = await updateWorld(worldId, updates);
  if (!updated) {
    throw new Error(`World not found: ${worldId}`);
  }

  const refreshWarning = await refreshWorldSubscription(worldId);
  const serialized = serializeWorldInfo(updated);
  if (refreshWarning) {
    return {
      ...serialized,
      refreshWarning
    };
  }
  return serialized;
}

/**
 * Create an agent in a world
 * @param {any} payload - Agent payload {worldId, name, type, provider, model, systemPrompt?, temperature?, maxTokens?}
 * @returns {Promise<any>} Serialized agent summary
 */
async function createWorldAgent(payload) {
  ensureCoreReady();
  const worldId = String(payload?.worldId || '');
  if (!worldId) throw new Error('World ID is required.');

  const name = String(payload?.name || '').trim();
  if (!name) throw new Error('Agent name is required.');

  const type = String(payload?.type || 'assistant').trim() || 'assistant';
  const provider = String(payload?.provider || 'openai').trim() || 'openai';
  const model = String(payload?.model || 'gpt-4o-mini').trim() || 'gpt-4o-mini';

  /** @type {Record<string, any>} */
  const params = {
    name,
    type,
    provider,
    model
  };

  if (payload?.systemPrompt !== undefined) {
    params.systemPrompt = String(payload.systemPrompt || '');
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

/**
 * Update an existing agent in a world
 * @param {any} payload - Agent payload {worldId, agentId, ...updates}
 * @returns {Promise<any>} Serialized updated agent summary
 */
async function updateWorldAgent(payload) {
  ensureCoreReady();
  const worldId = String(payload?.worldId || '');
  const agentId = String(payload?.agentId || '');
  if (!worldId) throw new Error('World ID is required.');
  if (!agentId) throw new Error('Agent ID is required.');

  /** @type {Record<string, any>} */
  const updates = {};

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

/**
 * Delete an agent from a world
 * @param {any} payload - Agent payload {worldId, agentId}
 * @returns {Promise<{success: boolean}>}
 */
async function deleteWorldAgent(payload) {
  ensureCoreReady();
  const worldId = String(payload?.worldId || '');
  const agentId = String(payload?.agentId || '');
  if (!worldId) throw new Error('World ID is required.');
  if (!agentId) throw new Error('Agent ID is required.');

  const success = await deleteAgent(worldId, agentId);
  return { success };
}

/**
 * Delete an existing world in current workspace
 * @param {any} payload - Delete payload {worldId}
 * @returns {Promise<{success: boolean, worldId: string}>}
 */
async function deleteWorkspaceWorld(payload) {
  ensureCoreReady();
  const worldId = String(payload?.worldId || '');
  if (!worldId) {
    throw new Error('World ID is required.');
  }

  const deleted = await deleteWorld(worldId);
  if (!deleted) {
    throw new Error(`Failed to delete world: ${worldId}`);
  }

  for (const [subscriptionId, subscription] of chatEventSubscriptions.entries()) {
    if (subscription.worldId === worldId) {
      removeChatEventSubscription(subscriptionId);
    }
  }

  const worldSubscription = worldSubscriptions.get(worldId);
  if (worldSubscription) {
    try {
      await worldSubscription.unsubscribe();
    } finally {
      worldSubscriptions.delete(worldId);
    }
  }

  return { success: true, worldId };
}

/**
 * Import world from external folder with validation
 * @returns {Promise<{success: boolean, world?: any, sessions?: any[], error?: string, message?: string}>}
 */
async function importWorld() {
  if (!mainWindow) throw new Error('Main window not initialized');
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
    const chats = await listChats(worldId);
    const sessions = await serializeChatsWithMessageCounts(worldId, chats);

    return {
      success: true,
      world: serializeWorldInfo(importedWorld),
      sessions
    };
  } catch (error) {
    // Task 2.4e: Error handling with specific error messages
    const err = /** @type {Error} */ (error);
    return {
      success: false,
      error: err.message || 'Unknown error',
      message: `Failed to import world: ${err.message || 'Unknown error occurred'}`
    };
  }
}

/**
 * @param {any} worldId
 */
async function listWorldSessions(worldId) {
  ensureCoreReady();
  const id = String(worldId || '');
  if (!id) throw new Error('World ID is required.');
  const world = await getWorld(id);
  if (!world) throw new Error(`World not found: ${id}`);

  const chats = await listChats(id);
  return await serializeChatsWithMessageCounts(id, chats);
}

/**
 * @param {any} worldId
 */
async function createWorldSession(worldId) {
  ensureCoreReady();
  const id = String(worldId || '');
  if (!id) throw new Error('World ID is required.');

  const updatedWorld = await newChat(id);
  if (!updatedWorld) throw new Error(`World not found: ${id}`);
  const refreshWarning = await refreshWorldSubscription(id);

  const chats = await listChats(id);
  const sessions = await serializeChatsWithMessageCounts(id, chats);
  return {
    currentChatId: updatedWorld.currentChatId || null,
    sessions,
    ...(refreshWarning ? { refreshWarning } : {})
  };
}

/**
 * @param {any} worldId
 * @param {any} chatId
 */
async function deleteWorldSession(worldId, chatId) {
  ensureCoreReady();
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
  const sessions = await serializeChatsWithMessageCounts(id, chats);
  return {
    currentChatId: world.currentChatId || null,
    sessions,
    ...(refreshWarning ? { refreshWarning } : {})
  };
}

/**
 * @param {any} worldId
 * @param {any} chatId
 */
async function selectWorldSession(worldId, chatId) {
  ensureCoreReady();
  const id = String(worldId || '');
  const sessionId = String(chatId || '');
  if (!id) throw new Error('World ID is required.');
  if (!sessionId) throw new Error('Session ID is required.');

  const world = await restoreChat(id, sessionId);
  if (!world) throw new Error(`World or session not found: ${id}/${sessionId}`);
  const refreshWarning = await refreshWorldSubscription(id);

  return {
    worldId: id,
    chatId: world.currentChatId || sessionId,
    ...(refreshWarning ? { refreshWarning } : {})
  };
}

/**
 * @param {any} worldId
 * @param {any} chatId
 */
async function getSessionMessages(worldId, chatId) {
  ensureCoreReady();
  const id = String(worldId || '');
  if (!id) throw new Error('World ID is required.');

  const requestedChatId = chatId ? String(chatId) : null;
  const memory = await getMemory(id, requestedChatId);
  if (!memory) return [];

  return normalizeSessionMessages(memory.map((message) => serializeMessage(message)));
}

/**
 * @param {any} payload
 */
async function subscribeChatEvents(payload) {
  ensureCoreReady();
  const subscriptionId = toSubscriptionId(payload);
  const worldId = String(payload?.worldId || '');
  const chatId = payload?.chatId ? String(payload.chatId) : null;

  // Ensure world is subscribed so agents can respond
  const world = await ensureWorldSubscribed(worldId);

  const existing = chatEventSubscriptions.get(subscriptionId);
  if (existing && existing.worldId === worldId && existing.chatId === chatId) {
    return { subscribed: true, subscriptionId, worldId, chatId };
  }

  removeChatEventSubscription(subscriptionId);
  canceledSubscriptionIds.delete(subscriptionId);

  if (canceledSubscriptionIds.has(subscriptionId)) {
    canceledSubscriptionIds.delete(subscriptionId);
    return { subscribed: false, canceled: true, subscriptionId, worldId, chatId };
  }

  const messageHandler = (/** @type {any} */ event) => {
    const eventChatId = event?.chatId ? String(event.chatId) : null;
    if (chatId && eventChatId !== chatId) return;
    const serializedEvent = serializeRealtimeMessageEvent(worldId, event);
    if (!serializedEvent) return;
    sendRealtimeEventToRenderer({
      ...serializedEvent,
      subscriptionId
    });
  };

  const sseHandler = (/** @type {any} */ event) => {
    // Route SSE events based on the event's chatId, not world.currentChatId
    // This ensures concurrent sessions receive their events even when user switches selection
    const eventChatId = event?.chatId ? String(event.chatId) : null;
    // Only filter if subscription has chatId AND event has chatId AND they don't match
    if (chatId && eventChatId && eventChatId !== chatId) return;
    sendRealtimeEventToRenderer({
      ...serializeRealtimeSSEEvent(worldId, eventChatId || chatId, event),
      subscriptionId
    });
  };

  const toolHandler = (/** @type {any} */ event) => {
    // Forward tool events (tool-start, tool-result, tool-error, tool-progress)
    const eventType = event?.type || '';
    if (!eventType.startsWith('tool-')) return;
    // Route tool events based on the event's chatId for concurrency-safe routing
    const eventChatId = event?.chatId ? String(event.chatId) : null;
    // Only filter if subscription has chatId AND event has chatId AND they don't match
    if (chatId && eventChatId && eventChatId !== chatId) return;
    sendRealtimeEventToRenderer({
      ...serializeRealtimeToolEvent(worldId, eventChatId || chatId, event),
      subscriptionId
    });
  };

  world.eventEmitter.on('message', messageHandler);
  world.eventEmitter.on('sse', sseHandler);
  world.eventEmitter.on('world', toolHandler);
  chatEventSubscriptions.set(subscriptionId, {
    worldId,
    chatId,
    unsubscribe: () => {
      world.eventEmitter.off('message', messageHandler);
      world.eventEmitter.off('sse', sseHandler);
      world.eventEmitter.off('world', toolHandler);
    }
  });

  if (canceledSubscriptionIds.has(subscriptionId)) {
    canceledSubscriptionIds.delete(subscriptionId);
    removeChatEventSubscription(subscriptionId);
    return { subscribed: false, canceled: true, subscriptionId, worldId, chatId };
  }

  return { subscribed: true, subscriptionId, worldId, chatId };
}

/**
 * @param {string} worldId
 */
async function ensureWorldSubscribed(worldId) {
  // Check if world is already subscribed
  if (worldSubscriptions.has(worldId)) {
    const subscription = worldSubscriptions.get(worldId);
    if (!subscription) throw new Error('Subscription not found');
    return subscription.world;
  }

  // Subscribe to world to enable agent responses
  const subscription = await subscribeWorld(worldId, { isOpen: true });
  if (!subscription) {
    throw new Error(`Failed to subscribe to world: ${worldId}`);
  }

  worldSubscriptions.set(worldId, subscription);
  return subscription.world;
}

/**
 * Refresh cached world subscription after world/chat mutations.
 * Rebinds active chat event listeners to the refreshed world instance.
 * @param {string} worldId
 */
async function refreshWorldSubscription(worldId) {
  const subscription = worldSubscriptions.get(worldId);
  if (!subscription) return null;

  const subscriptionsToRestore = Array.from(chatEventSubscriptions.entries())
    .filter(([, value]) => value.worldId === worldId)
    .map(([subscriptionId, value]) => ({
      subscriptionId,
      chatId: value.chatId
    }));

  for (const { subscriptionId } of subscriptionsToRestore) {
    removeChatEventSubscription(subscriptionId);
  }

  try {
    await subscription.refresh();
  } catch (error) {
    const warningMessage = `Failed to refresh world subscription for '${worldId}': ${error instanceof Error ? error.message : String(error)}`;
    console.warn(warningMessage);
    return warningMessage;
  }

  const restoreFailures = [];
  for (const { subscriptionId, chatId } of subscriptionsToRestore) {
    if (canceledSubscriptionIds.has(subscriptionId)) continue;
    try {
      await subscribeChatEvents({ subscriptionId, worldId, chatId });
    } catch (error) {
      restoreFailures.push({
        subscriptionId,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (restoreFailures.length > 0) {
    const failedSubscriptionIds = restoreFailures.map((item) => item.subscriptionId).join(', ');
    const details = restoreFailures.map((item) => `${item.subscriptionId}: ${item.message}`).join('; ');
    const warningMessage = `Failed to restore chat subscriptions for world '${worldId}' [${failedSubscriptionIds}]. Details: ${details}`;
    console.warn(warningMessage);
    return warningMessage;
  }

  return null;
}

/**
 * @param {any} payload
 */
async function sendChatMessage(payload) {
  ensureCoreReady();
  const worldId = String(payload?.worldId || '');
  const chatId = payload?.chatId ? String(payload.chatId) : null;
  const content = String(payload?.content || '').trim();
  const sender = payload?.sender ? String(payload.sender).trim() : 'human';

  if (!worldId) throw new Error('World ID is required.');
  if (!content) throw new Error('Message content is required.');

  if (chatId) {
    await restoreChat(worldId, chatId);
  }

  // Ensure world is subscribed so agents can respond
  const world = await ensureWorldSubscribed(worldId);
  if (!world) throw new Error(`World not found: ${worldId}`);

  const event = publishMessage(world, content, sender, chatId || undefined);
  return {
    messageId: event.messageId,
    sender: event.sender,
    content: event.content,
    createdAt: toIsoTimestamp(event.timestamp)
  };
}

/**
 * Delete message and all subsequent messages in a chat
 * @param {any} payload - {worldId, messageId, chatId}
 * @returns {Promise<any>} Deletion result with success status and details
 */
async function deleteMessageFromChat(payload) {
  ensureCoreReady();
  const worldId = String(payload?.worldId || '');
  const messageId = String(payload?.messageId || '');
  const chatId = String(payload?.chatId || '');

  if (!worldId) throw new Error('World ID is required.');
  if (!messageId) throw new Error('Message ID is required.');
  if (!chatId) throw new Error('Chat ID is required.');

  const result = await removeMessagesFrom(worldId, messageId, chatId);
  return result;
}

/**
 * @param {any} payload
 */
function unsubscribeChatEvents(payload) {
  const subscriptionId = toSubscriptionId(payload);
  canceledSubscriptionIds.add(subscriptionId);
  removeChatEventSubscription(subscriptionId);
  return { unsubscribed: true, subscriptionId };
}

function registerIpcHandlers() {
  ipcMain.handle('workspace:get', async () => getWorkspaceState());
  ipcMain.handle('workspace:open', async () => openWorkspaceDialog());
  ipcMain.handle('world:loadFromFolder', async () => loadWorldsFromWorkspace());
  ipcMain.handle('world:load', async (_event, worldId) => loadSpecificWorld(worldId));
  ipcMain.handle('world:import', async () => importWorld());
  ipcMain.handle('world:list', async () => listWorkspaceWorlds());
  ipcMain.handle('world:create', async (_, payload) => createWorkspaceWorld(payload));
  ipcMain.handle('world:update', async (_, payload) => updateWorkspaceWorld(payload));
  ipcMain.handle('world:delete', async (_, payload) => deleteWorkspaceWorld(payload));
  ipcMain.handle('agent:create', async (_, payload) => createWorldAgent(payload));
  ipcMain.handle('agent:update', async (_, payload) => updateWorldAgent(payload));
  ipcMain.handle('agent:delete', async (_, payload) => deleteWorldAgent(payload));
  ipcMain.handle('world:getLastSelected', async () => readWorldPreference());
  ipcMain.handle('world:saveLastSelected', async (_, worldId) => { writeWorldPreference(worldId); return true; });
  ipcMain.handle('session:list', async (_, payload) => listWorldSessions(payload?.worldId));
  ipcMain.handle('session:create', async (_, payload) => createWorldSession(payload?.worldId));
  ipcMain.handle('chat:delete', async (_, payload) => deleteWorldSession(payload?.worldId, payload?.chatId));
  ipcMain.handle('session:delete', async (_, payload) => deleteWorldSession(payload?.worldId, payload?.chatId));
  ipcMain.handle('session:select', async (_, payload) => selectWorldSession(payload?.worldId, payload?.chatId));
  ipcMain.handle('chat:getMessages', async (_, payload) => getSessionMessages(payload?.worldId, payload?.chatId));
  ipcMain.handle('chat:sendMessage', async (_, payload) => sendChatMessage(payload));
  ipcMain.handle('message:delete', async (_, payload) => deleteMessageFromChat(payload));
  ipcMain.handle('chat:subscribeEvents', async (_, payload) => subscribeChatEvents(payload));
  ipcMain.handle('chat:unsubscribeEvents', async (_, payload) => unsubscribeChatEvents(payload));
}

/**
 * @param {import('electron').BrowserWindow} win
 */
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
    unsubscribeFromLogEvents();
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
  subscribeToLogEvents();
  registerIpcHandlers();
  createMainWindow();
  setupAppLifecycle();
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap Electron app:', error);
  app.exit(1);
});
