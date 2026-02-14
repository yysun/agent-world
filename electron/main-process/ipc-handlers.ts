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
  newChat: (worldId: string) => Promise<any>;
  publishMessage: (world: any, content: string, sender: string, chatId?: string) => any;
  stopMessageProcessing: (worldId: string, chatId: string) => Promise<any> | any;
  restoreChat: (worldId: string, chatId: string) => Promise<any>;
  updateWorld: (worldId: string, updates: Record<string, unknown>) => Promise<any>;
  editUserMessage: (worldId: string, messageId: string, newContent: string, chatId: string) => Promise<any>;
  removeMessagesFrom: (worldId: string, messageId: string, chatId: string) => Promise<any>;
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
    newChat,
    publishMessage,
    stopMessageProcessing,
    restoreChat,
    updateWorld,
    editUserMessage,
    removeMessagesFrom
  } = dependencies;

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

  async function openWorkspaceDialog() {
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error('Main window not initialized');
    const result = await dialog.showOpenDialog(mainWindow as any, {
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

    return {
      ...getWorkspaceState(),
      canceled: false,
      workspacePath: selectedPath
    };
  }

  async function listWorkspaceWorlds() {
    await ensureCoreReady();
    const worlds = await listWorlds();
    return worlds.map((world) => serializeWorldInfo(world));
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

  async function createWorldAgent(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '');
    if (!worldId) throw new Error('World ID is required.');

    const name = String(payload?.name || '').trim();
    if (!name) throw new Error('Agent name is required.');

    const type = String(payload?.type || 'assistant').trim() || 'assistant';
    const provider = String(payload?.provider || 'openai').trim() || 'openai';
    const model = String(payload?.model || 'gpt-4o-mini').trim() || 'gpt-4o-mini';

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

    return { success: true, worldId };
  }

  async function importWorld() {
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error('Main window not initialized');
    const result = await dialog.showOpenDialog(mainWindow as any, {
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
      await ensureCoreReady();

      const normalizedPath = path.normalize(folderPath);
      const absolutePath = path.resolve(normalizedPath);

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

      const worldConfigFile = path.join(absolutePath, '.world');
      const hasWorldConfig = fs.existsSync(worldConfigFile);

      if (!hasWorldConfig) {
        return {
          success: false,
          error: 'Invalid world folder',
          message: 'Selected folder does not contain a valid world (.world file not found)'
        };
      }

      const worldId = path.basename(absolutePath);

      const worlds = await listWorlds();
      if (worlds.some((w) => w.id === worldId)) {
        return {
          success: false,
          error: 'World already exists',
          message: `A world with ID '${worldId}' already exists in this workspace`
        };
      }

      const importedWorld = await getWorld(worldId);
      if (!importedWorld) {
        return {
          success: false,
          error: 'Failed to load world',
          message: 'Could not load world data from the selected folder'
        };
      }

      const chats = await listChats(worldId);
      const sessions = await serializeChatsWithMessageCounts(worldId, chats, getMemory);

      return {
        success: true,
        world: serializeWorldInfo(importedWorld),
        sessions
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message || 'Unknown error',
        message: `Failed to import world: ${err.message || 'Unknown error occurred'}`
      };
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

    const world = await restoreChat(id, sessionId);
    if (!world) throw new Error(`World or session not found: ${id}/${sessionId}`);
    const refreshWarning = await refreshWorldSubscription(id);

    return {
      worldId: id,
      chatId: world.currentChatId || sessionId,
      ...(refreshWarning ? { refreshWarning } : {})
    };
  }

  async function getSessionMessages(worldId: unknown, chatId: unknown) {
    await ensureCoreReady();
    const id = String(worldId || '');
    if (!id) throw new Error('World ID is required.');

    const requestedChatId = chatId ? String(chatId) : null;
    const memory = await getMemory(id, requestedChatId);
    if (!memory) return [];

    return normalizeSessionMessages(memory.map((message: any) => serializeMessage(message)));
  }

  async function sendChatMessage(payload: any) {
    await ensureCoreReady();
    const worldId = String(payload?.worldId || '');
    const chatId = payload?.chatId ? String(payload.chatId) : null;
    const content = String(payload?.content || '').trim();
    const sender = payload?.sender ? String(payload.sender).trim() : 'human';

    if (!worldId) throw new Error('World ID is required.');
    if (!content) throw new Error('Message content is required.');

    if (chatId) {
      await restoreChat(worldId, chatId);
    }

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

    return editUserMessage(worldId, messageId, newContent, chatId);
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

  return {
    loadWorldsFromWorkspace,
    loadSpecificWorld,
    openWorkspaceDialog,
    listWorkspaceWorlds,
    createWorkspaceWorld,
    updateWorkspaceWorld,
    createWorldAgent,
    updateWorldAgent,
    deleteWorldAgent,
    deleteWorkspaceWorld,
    importWorld,
    listWorldSessions,
    createWorldSession,
    deleteWorldSession,
    selectWorldSession,
    getSessionMessages,
    sendChatMessage,
    editMessageInChat,
    stopChatMessage,
    deleteMessageFromChat
  };
}
