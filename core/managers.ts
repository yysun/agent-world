/**
 * Unified Managers Module - World, Agent, and Chat Management
 *
 * Provides complete lifecycle management for worlds, agents, and chat sessions with:
 * - EventEmitter integration for runtime world instances
 * - Memory management with archiving and restoration capabilities
 * - Chat session management with auto-save and title generation
 * - Automatic ID normalization to kebab-case for consistency
 * - Environment-aware storage operations through storage-factory
 * - Agent message management with automatic agentId assignment
 * - Message ID migration for user message edit feature
 * - User message editing with removal and resubmission
 * - Error logging for message edit operations
 *
 * API: World (create/get/update/delete/list), Agent (create/get/update/delete/list/updateMemory/clearMemory),
 * Chat (newChat/listChats/deleteChat/restoreChat), Migration (migrateMessageIds), 
 * MessageEdit (removeMessagesFrom/editUserMessage/logEditError/getEditErrors)
 *
 * Implementation Details:
 * - Ensures all agent messages include agentId for proper export functionality
 * - Compatible with both SQLite and memory storage backends
 * - Automatic agent identification for message source tracking
 * - Idempotent message ID migration supporting both file and SQL storage
 * - Comprehensive error tracking for partial failures
 * - Error log persistence with 100-entry retention policy
 *
 * Recent Changes:
 * - 2026-02-14: Updated `editUserMessage` to be fully core-managed for clear+resend behavior without client-side subscription refresh logic.
 *   - Edit resubmission now prefers active subscribed world runtimes.
 *   - Removed current-session gating checks and always resubmits to the provided `chatId`.
 *   - Synchronizes runtime agent memory from storage after removal before resubmission.
 * - 2026-02-13: Added world-level `mainAgent` routing config and agent-level `autoReply` toggle support.
 * - 2026-02-13: Moved edit-resubmission title-regeneration reset into core `editUserMessage` so all clients share the same behavior.
 *   - Auto-generated chat titles are reset to `New Chat` before edit resubmission only when the latest persisted
 *     `chat-title-updated` payload title still matches the current chat name.
 * - 2026-02-13: Centralized default chat-title semantics via shared chat constants.
 *   - Uses a single `NEW_CHAT_TITLE` source for reusable chat detection and creation paths.
 * - 2026-02-12: Hardened `getMemory` to auto-migrate legacy messages missing `messageId` before returning memory payloads.
 *   - Detects missing IDs, runs idempotent `migrateMessageIds`, and re-reads memory.
 *   - Ensures message-list consumers receive canonical `messageId` values from core.
 * - 2026-02-11: Made `deleteWorld` side-effect-free by removing `getWorld` usage.
 *   - `deleteWorld` now avoids world runtime hydration/chat creation paths during deletion.
 *   - Cleanup hooks are invoked only if present on directly loaded world data.
 *
 * Changes:
 * - 2026-02-10: Added agent identifier resolution across manager APIs.
 *   - Agent operations now accept either stored agent ID or agent name.
 *   - Fallback lookup resolves renamed agents where `id` and `toKebabCase(name)` differ.
 * - 2026-02-10: Added world identifier resolution across manager APIs.
 *   - World operations now accept either stored world ID or world name.
 *   - Fallback lookup resolves renamed worlds where `id` and `toKebabCase(name)` differ.
 *   - List APIs return normalized world IDs for consistent client routing.
 * - 2025-10-26: Consolidated message publishing - removed resubmitMessageToWorld
 *   - Added chatId to WorldMessageEvent and publishMessage parameters
 *   - editUserMessage now calls publishMessage directly with validation
 *   - Simplified API by removing redundant resubmit wrapper function
 * - 2025-10-25: Fixed messageId bug in editUserMessage resubmission
 *   - Bug: Generated unused messageId instead of capturing actual from publishMessage
 *   - Fix: Use messageEvent.messageId from publishMessage return value
 *   - Impact: Prevents "undefined" string serialization in JSON responses
 * - 2025-10-21: Added message ID migration and user message edit feature (Phases 1 & 2)
 *   - migrateMessageIds: Auto-assign IDs to existing messages (idempotent)
 *   - removeMessagesFrom: Remove target + subsequent messages by timestamp
 *   - editUserMessage: Combined removal + resubmission operation
 *   - logEditError/getEditErrors: Error persistence in edit-errors.json
 *
 * Note: Export functionality has been moved to core/export.ts
 */// Core module imports
import { createCategoryLogger, initializeLogger } from './logger.js';
import { EventEmitter } from 'events';
import { type StorageAPI, createStorageWithWrappers } from './storage/storage-factory.js'
import * as utils from './utils.js';
import { nanoid } from 'nanoid';
import * as fs from 'fs';
import * as path from 'path';
import { getWorldDir } from './storage/world-storage.js';
import { getDefaultRootPath } from './storage/storage-factory.js';
import { publishCRUDEvent } from './events/index.js';
import { NEW_CHAT_TITLE, isDefaultChatTitle } from './chat-constants.js';
import { hasActiveChatMessageProcessing, stopMessageProcessing } from './message-processing-control.js';

// Type imports
import type {
  World, CreateWorldParams, UpdateWorldParams, Agent, CreateAgentParams, UpdateAgentParams,
  AgentMessage, Chat, CreateChatParams, UpdateChatParams, WorldChat, LLMProvider, RemovalResult, EditErrorLog
} from './types.js';

// Initialize logger and storage
const logger = createCategoryLogger('core.managers');
let storageWrappers: StorageAPI | null = null;
let moduleInitialization: Promise<void> | null = null;

async function initializeModules() {
  if (storageWrappers) {
    return; // Already initialized
  }
  try {
    initializeLogger();
    storageWrappers = await createStorageWithWrappers();
  } catch (error) {
    // Log error but don't throw - allows tests to proceed with mocked storage
    logger.error('Failed to initialize storage', { error: error instanceof Error ? error.message : error });
    throw error;
  }
}

function ensureInitialization(): Promise<void> {
  if (!moduleInitialization) {
    moduleInitialization = initializeModules();
  }
  return moduleInitialization;
}
const NEW_CHAT_CONFIG = { REUSABLE_CHAT_TITLE: NEW_CHAT_TITLE } as const;

function extractGeneratedChatTitleFromSystemPayload(payload: any): string | null {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.eventType !== 'chat-title-updated') return null;
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  return title || null;
}

async function resetAutoGeneratedChatTitleForEditResubmission(
  world: World,
  chatId: string
): Promise<void> {
  const chat = world.chats.get(chatId) ?? await storageWrappers!.loadChatData(world.id, chatId);
  if (!chat) return;

  const currentTitle = String(chat.name || '').trim();
  if (!currentTitle || isDefaultChatTitle(currentTitle)) {
    return;
  }

  const eventStorage = world.eventStorage;
  if (!eventStorage) {
    return;
  }

  let latestGeneratedTitle: string | null = null;
  try {
    const systemEvents = await eventStorage.getEventsByWorldAndChat(world.id, chatId, {
      types: ['system'],
      order: 'desc',
      limit: 25
    });

    for (const event of systemEvents) {
      const generatedTitle = extractGeneratedChatTitleFromSystemPayload(event?.payload);
      if (generatedTitle) {
        latestGeneratedTitle = generatedTitle;
        break;
      }
    }
  } catch (error) {
    logger.debug('Skipping auto-title reset because system events could not be queried', {
      worldId: world.id,
      chatId,
      error: error instanceof Error ? error.message : String(error)
    });
    return;
  }

  if (!latestGeneratedTitle || latestGeneratedTitle !== currentTitle) {
    return;
  }

  let resetSucceeded = false;
  if (typeof storageWrappers!.updateChatNameIfCurrent === 'function') {
    resetSucceeded = await storageWrappers!.updateChatNameIfCurrent(
      world.id,
      chatId,
      currentTitle,
      NEW_CHAT_TITLE
    );
  } else {
    const updated = await storageWrappers!.updateChatData(world.id, chatId, { name: NEW_CHAT_TITLE });
    resetSucceeded = !!updated;
  }

  if (!resetSucceeded) {
    return;
  }

  const runtimeChat = world.chats.get(chatId);
  if (runtimeChat) {
    runtimeChat.name = NEW_CHAT_TITLE;
  }
}

async function syncRuntimeAgentMemoryFromStorage(world: World, worldId: string): Promise<void> {
  if (!world?.agents || world.agents.size === 0) return;

  for (const runtimeAgent of world.agents.values()) {
    const persistedAgent = await storageWrappers!.loadAgent(worldId, runtimeAgent.id);
    runtimeAgent.memory = Array.isArray(persistedAgent?.memory)
      ? [...persistedAgent!.memory]
      : [];
  }
}

/**
 * Resolve a world identifier to the persisted world ID.
 * Accepts either world ID or world name and supports historical rename drift.
 */
async function resolveWorldIdentifier(worldIdOrName: string): Promise<string | null> {
  const normalizedInput = utils.toKebabCase(worldIdOrName);
  if (!normalizedInput) return null;

  // Fast path: direct normalized ID lookup
  const directWorld = await storageWrappers!.loadWorld(normalizedInput);
  if (directWorld?.id) {
    return directWorld.id;
  }

  // Fallback: scan worlds and match by normalized ID or normalized name
  const worlds = await storageWrappers!.listWorlds();
  const matched = worlds.find((world: World) => {
    const storedId = String(world.id || '');
    const storedName = String(world.name || '');

    return (
      storedId === worldIdOrName ||
      storedName === worldIdOrName ||
      utils.toKebabCase(storedId) === normalizedInput ||
      utils.toKebabCase(storedName) === normalizedInput
    );
  });

  return matched?.id || null;
}

async function getResolvedWorldId(worldIdOrName: string): Promise<string> {
  const resolved = await resolveWorldIdentifier(worldIdOrName);
  return resolved || utils.toKebabCase(worldIdOrName);
}

/**
 * Resolve an agent identifier to the persisted agent ID within a world.
 * Accepts either agent ID or agent name and supports historical rename drift.
 */
async function resolveAgentIdentifier(worldIdOrName: string, agentIdOrName: string): Promise<string | null> {
  const resolvedWorldId = await getResolvedWorldId(worldIdOrName);
  const normalizedInput = utils.toKebabCase(agentIdOrName);
  if (!normalizedInput) return null;

  // Fast path: direct normalized ID lookup
  const directAgent = await storageWrappers!.loadAgent(resolvedWorldId, normalizedInput);
  if (directAgent?.id) {
    return directAgent.id;
  }

  // Fallback: scan agents and match by normalized ID or normalized name
  const agents = await storageWrappers!.listAgents(resolvedWorldId);
  const matched = agents.find((agent: Agent) => {
    const storedId = String(agent.id || '');
    const storedName = String(agent.name || '');

    return (
      storedId === agentIdOrName ||
      storedName === agentIdOrName ||
      utils.toKebabCase(storedId) === normalizedInput ||
      utils.toKebabCase(storedName) === normalizedInput
    );
  });

  return matched?.id || null;
}

async function getResolvedAgentId(worldIdOrName: string, agentIdOrName: string): Promise<string> {
  const resolved = await resolveAgentIdentifier(worldIdOrName, agentIdOrName);
  return resolved || utils.toKebabCase(agentIdOrName);
}

/**
 * Create new world with configuration and automatically create a new chat
 */
export async function createWorld(params: CreateWorldParams): Promise<World | null> {
  await ensureInitialization();

  const worldId = utils.toKebabCase(params.name);

  const exists = await storageWrappers!.worldExists(worldId);
  if (exists) {
    throw new Error(`World with name '${params.name}' already exists`);
  }

  const worldData: World = {
    id: worldId,
    name: params.name,
    description: params.description,
    turnLimit: params.turnLimit || 5,
    mainAgent: params.mainAgent ? String(params.mainAgent).trim() : null,
    chatLLMProvider: params.chatLLMProvider,
    chatLLMModel: params.chatLLMModel,
    mcpConfig: params.mcpConfig,
    variables: params.variables,
    createdAt: new Date(),
    lastUpdated: new Date(),
    totalAgents: 0,
    totalMessages: 0,
    eventEmitter: new EventEmitter(),
    agents: new Map<string, Agent>(),
    chats: new Map<string, Chat>(),
    eventStorage: (storageWrappers as any)?.eventStorage,
  };

  // Setup event persistence
  if (worldData.eventStorage) {
    const { setupEventPersistence, setupWorldActivityListener } = await import('./events/index.js');
    worldData._eventPersistenceCleanup = setupEventPersistence(worldData);
    worldData._activityListenerCleanup = setupWorldActivityListener(worldData);
  }

  await storageWrappers!.saveWorld(worldData);

  // Automatically create a new chat for the world
  const world = await getWorld(worldId);
  if (world) {
    await newChat(worldId);
    return await getWorld(worldId);
  }

  return world;
}

/**
 * Update world configuration
 */
export async function updateWorld(worldId: string, updates: UpdateWorldParams): Promise<World | null> {
  await ensureInitialization();

  const resolvedWorldId = await getResolvedWorldId(worldId);
  const existingData = await storageWrappers!.loadWorld(resolvedWorldId);

  if (!existingData) {
    return null;
  }

  const normalizedUpdates: UpdateWorldParams = {
    ...updates,
    ...(updates.mainAgent !== undefined ? { mainAgent: updates.mainAgent ? String(updates.mainAgent).trim() : null } : {})
  };

  const updatedData: World = {
    ...existingData,
    ...normalizedUpdates,
    lastUpdated: new Date()
  };

  await storageWrappers!.saveWorld(updatedData);
  return getWorld(resolvedWorldId);
}

/**
 * Set the raw .env-style variables text for a world
 */
export async function setWorldVariablesText(worldId: string, variablesText: string): Promise<World | null> {
  await ensureInitialization();
  return updateWorld(worldId, { variables: variablesText });
}

/**
 * Get the raw .env-style variables text for a world
 */
export async function getWorldVariablesText(worldId: string): Promise<string> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const world = await storageWrappers!.loadWorld(resolvedWorldId);
  if (!world) {
    return '';
  }
  return typeof world.variables === 'string' ? world.variables : '';
}

/**
 * Get parsed environment map from world variables text
 */
export async function getWorldEnvMap(worldId: string): Promise<Record<string, string>> {
  await ensureInitialization();
  const variablesText = await getWorldVariablesText(worldId);
  return utils.parseEnvText(variablesText);
}

/**
 * Get a single env value from world variables text
 */
export async function getWorldEnvValue(worldId: string, key: string): Promise<string | undefined> {
  await ensureInitialization();
  if (!key) {
    return undefined;
  }
  const envMap = await getWorldEnvMap(worldId);
  return envMap[key];
}

/**
 * Delete world and all associated data
 */
export async function deleteWorld(worldId: string): Promise<boolean> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  // Side-effect-free cleanup path: avoid getWorld() because it can hydrate runtime state.
  const worldData = await storageWrappers!.loadWorld(resolvedWorldId);
  if (worldData?._eventPersistenceCleanup) {
    worldData._eventPersistenceCleanup();
  }
  if (worldData?._activityListenerCleanup) {
    worldData._activityListenerCleanup();
  }

  return await storageWrappers!.deleteWorld(resolvedWorldId);
}

/**
 * Get all world IDs and basic information
 */
export async function listWorlds(): Promise<World[]> {
  await ensureInitialization();

  const allWorldData = await storageWrappers!.listWorlds();

  const worldsWithAgentCount = await Promise.all(
    allWorldData.map(async (data: World) => {
      try {
        const normalizedId = utils.toKebabCase(data.id || data.name || '');
        const agents = await storageWrappers!.listAgents(data.id);
        return { ...data, id: normalizedId || data.id, agentCount: agents.length };
      } catch (error) {
        const normalizedId = utils.toKebabCase(data.id || data.name || '');
        return { ...data, id: normalizedId || data.id, agentCount: 0 };
      }
    })
  );

  return worldsWithAgentCount;
}

/**
 * Get world configuration and create runtime instance, creating a new chat if none exist
 */
export async function getWorld(worldId: string): Promise<World | null> {
  await ensureInitialization();

  const resolvedWorldId = await getResolvedWorldId(worldId);

  logger.debug('getWorldConfig called', {
    originalWorldId: worldId,
    resolvedWorldId
  });

  const worldData = await storageWrappers!.loadWorld(resolvedWorldId);

  logger.debug('loadWorld result', {
    worldFound: !!worldData,
    worldId: worldData?.id,
    worldName: worldData?.name
  });

  if (!worldData) {
    logger.debug('World not found, returning null');
    return null;
  }

  let agents = await storageWrappers!.listAgents(resolvedWorldId);
  let chats = await storageWrappers!.listChats(resolvedWorldId);

  // If there are no chats, create a new one
  if (chats.length === 0) {
    logger.debug('No chats found for world, creating new chat');
    await newChat(resolvedWorldId);
    chats = await storageWrappers!.listChats(resolvedWorldId);
  }

  const world: World = {
    ...worldData,
    eventEmitter: new EventEmitter(),
    agents: new Map(agents.map((agent: Agent) => [agent.id, agent])),
    chats: new Map(chats.map((chat: Chat) => [chat.id, chat])),
    eventStorage: (storageWrappers as any)?.eventStorage,
    _eventPersistenceCleanup: undefined, // Will be set by setupEventPersistence
    _activityListenerCleanup: undefined, // Will be set by setupWorldActivityListener
  };

  // Setup event persistence and activity listener
  if (world.eventStorage) {
    const { setupEventPersistence, setupWorldActivityListener } = await import('./events/index.js');
    world._eventPersistenceCleanup = setupEventPersistence(world);
    world._activityListenerCleanup = setupWorldActivityListener(world);
  }

  return world;
}

/**
 * Create new agent with configuration and system prompt
 */
export async function createAgent(worldId: string, params: CreateAgentParams): Promise<Agent> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  // Check if world is processing to prevent agent creation during concurrent chat sessions
  const { getActiveSubscribedWorld } = await import('./subscription.js');
  const activeSubscribedWorld = getActiveSubscribedWorld(resolvedWorldId);
  const world = activeSubscribedWorld || await getWorld(resolvedWorldId);
  if (world?.isProcessing) {
    throw new Error('Cannot create agent while world is processing');
  }

  const agentId = params.id || utils.toKebabCase(params.name);

  const exists = await storageWrappers!.agentExists(resolvedWorldId, agentId);
  if (exists) {
    throw new Error(`Agent with ID '${agentId}' already exists`);
  }

  const now = new Date();
  const agent: Agent = {
    id: agentId,
    name: params.name,
    type: params.type,
    autoReply: params.autoReply ?? true,
    status: 'inactive',
    provider: params.provider,
    model: params.model,
    systemPrompt: params.systemPrompt,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    createdAt: now,
    lastActive: now,
    llmCallCount: 0,
    memory: [],
  };

  await storageWrappers!.saveAgent(resolvedWorldId, agent);

  // Emit CRUD event for real-time updates
  if (world) {
    world.agents.set(agent.id, agent);
    publishCRUDEvent(world, 'create', 'agent', agent.id, agent);
  }

  return agent;
}

/**
 * Load agent by ID with full configuration and memory
 */
export async function getAgent(worldId: string, agentId: string): Promise<Agent | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const resolvedAgentId = await getResolvedAgentId(resolvedWorldId, agentId);

  const agentData = await storageWrappers!.loadAgent(resolvedWorldId, resolvedAgentId);
  if (!agentData) return null;

  return agentData;
}

/**
 * Update agent configuration and/or memory
 */
export async function updateAgent(worldId: string, agentId: string, updates: UpdateAgentParams): Promise<Agent | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const resolvedAgentId = await getResolvedAgentId(resolvedWorldId, agentId);

  // Check if world is processing to prevent agent modification during concurrent chat sessions
  const { getActiveSubscribedWorld } = await import('./subscription.js');
  const activeSubscribedWorld = getActiveSubscribedWorld(resolvedWorldId);
  const world = activeSubscribedWorld || await getWorld(resolvedWorldId);
  if (world?.isProcessing) {
    throw new Error('Cannot update agent while world is processing');
  }

  const existingAgentData = await storageWrappers!.loadAgent(resolvedWorldId, resolvedAgentId);

  if (!existingAgentData) {
    return null;
  }

  const updatedAgent: Agent = {
    ...existingAgentData,
    name: updates.name || existingAgentData.name,
    type: updates.type || existingAgentData.type,
    autoReply: updates.autoReply !== undefined ? updates.autoReply : (existingAgentData.autoReply ?? true),
    status: updates.status || existingAgentData.status,
    provider: updates.provider || existingAgentData.provider,
    model: updates.model || existingAgentData.model,
    systemPrompt: updates.systemPrompt !== undefined ? updates.systemPrompt : existingAgentData.systemPrompt,
    temperature: updates.temperature !== undefined ? updates.temperature : existingAgentData.temperature,
    maxTokens: updates.maxTokens !== undefined ? updates.maxTokens : existingAgentData.maxTokens,
    lastActive: new Date()
  };

  await storageWrappers!.saveAgent(resolvedWorldId, updatedAgent);

  // Emit CRUD event for real-time updates
  if (world) {
    const runtimeAgent = world.agents.get(resolvedAgentId);
    if (runtimeAgent) {
      Object.assign(runtimeAgent, updatedAgent);
      world.agents.set(resolvedAgentId, runtimeAgent);
      publishCRUDEvent(world, 'update', 'agent', resolvedAgentId, runtimeAgent);
    } else {
      world.agents.set(resolvedAgentId, updatedAgent);
      publishCRUDEvent(world, 'update', 'agent', resolvedAgentId, updatedAgent);
    }
  }

  return updatedAgent;
}

/**
 * Delete agent and all associated data
 */
export async function deleteAgent(worldId: string, agentId: string): Promise<boolean> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const resolvedAgentId = await getResolvedAgentId(resolvedWorldId, agentId);

  // Check if world is processing to prevent agent deletion during concurrent chat sessions
  const { getActiveSubscribedWorld } = await import('./subscription.js');
  const activeSubscribedWorld = getActiveSubscribedWorld(resolvedWorldId);
  const world = activeSubscribedWorld || await getWorld(resolvedWorldId);
  if (world?.isProcessing) {
    throw new Error('Cannot delete agent while world is processing');
  }

  const success = await storageWrappers!.deleteAgent(resolvedWorldId, resolvedAgentId);

  // Emit CRUD event for real-time updates
  if (success && world) {
    world.agents.delete(resolvedAgentId);
    publishCRUDEvent(world, 'delete', 'agent', resolvedAgentId);
  }

  return success;
}

/**
 * Get all agent IDs and basic information
 */
export async function listAgents(worldId: string): Promise<Agent[]> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  return await storageWrappers!.listAgents(resolvedWorldId);
}

/**
 * Add messages to agent memory
 */
export async function updateAgentMemory(worldId: string, agentId: string, messages: AgentMessage[]): Promise<Agent | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const resolvedAgentId = await getResolvedAgentId(resolvedWorldId, agentId);

  // Check if world is processing to prevent memory modification during concurrent chat sessions
  const world = await getWorld(resolvedWorldId);
  if (world?.isProcessing) {
    throw new Error('Cannot update agent memory while world is processing');
  }

  const existingAgentData = await storageWrappers!.loadAgent(resolvedWorldId, resolvedAgentId);

  if (!existingAgentData) {
    return null;
  }

  // Ensure messages have the agentId set
  const messagesWithAgentId = messages.map(msg => ({
    ...msg,
    agentId: resolvedAgentId
  }));

  const updatedAgent: Agent = {
    ...existingAgentData,
    memory: [...existingAgentData.memory, ...messagesWithAgentId],
    lastActive: new Date()
  };

  await storageWrappers!.saveAgentMemory(resolvedWorldId, resolvedAgentId, updatedAgent.memory);
  await storageWrappers!.saveAgent(resolvedWorldId, updatedAgent);
  return updatedAgent;
}

/**
 * Clear agent memory and reset LLM call count
 */
export async function clearAgentMemory(worldId: string, agentId: string): Promise<Agent | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const resolvedAgentId = await getResolvedAgentId(resolvedWorldId, agentId);

  // Check if world is processing to prevent memory clearing during concurrent chat sessions
  const world = await getWorld(resolvedWorldId);
  if (world?.isProcessing) {
    throw new Error('Cannot clear agent memory while world is processing');
  }

  logger.debug('Core clearAgentMemory called', {
    worldId,
    resolvedWorldId,
    originalAgentId: agentId,
    resolvedAgentId
  });

  const existingAgentData = await storageWrappers!.loadAgent(resolvedWorldId, resolvedAgentId);

  logger.debug('loadAgent result', {
    agentFound: !!existingAgentData,
    agentName: existingAgentData?.name,
    memoryLength: existingAgentData?.memory?.length || 0,
    currentLLMCallCount: existingAgentData?.llmCallCount || 0
  });

  if (!existingAgentData) {
    logger.debug('Agent not found on disk, returning null');
    return null;
  }

  if (existingAgentData.memory && existingAgentData.memory.length > 0) {
    try {
      logger.debug('Archiving existing memory');
      await storageWrappers!.archiveMemory(resolvedWorldId, resolvedAgentId, existingAgentData.memory);
      logger.debug('Memory archived successfully');
    } catch (error) {
      logger.error('Failed to archive memory', { resolvedAgentId, error: error instanceof Error ? error.message : error });
    }
  }

  const updatedAgent: Agent = {
    ...existingAgentData,
    memory: [],
    llmCallCount: 0,
    lastActive: new Date()
  };

  logger.debug('Saving cleared memory to disk');

  await storageWrappers!.saveAgentMemory(resolvedWorldId, resolvedAgentId, []);
  await storageWrappers!.saveAgent(resolvedWorldId, updatedAgent);

  logger.debug('Memory and LLM call count cleared and saved successfully', {
    resolvedAgentId,
    newLLMCallCount: updatedAgent.llmCallCount
  });
  return updatedAgent;
}

/**
 * Create new chat data entry with optional world snapshot
 */
async function createChat(worldId: string, params: CreateChatParams): Promise<Chat> {
  await ensureInitialization();

  const chatId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();

  const chatData: Chat = {
    id: chatId,
    worldId,
    name: NEW_CHAT_CONFIG.REUSABLE_CHAT_TITLE,
    description: params.description,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  };

  await storageWrappers!.saveChatData(worldId, chatData);

  // Emit CRUD event for real-time updates
  const world = await getWorld(worldId);
  if (world) {
    world.chats.set(chatData.id, chatData);
    publishCRUDEvent(world, 'create', 'chat', chatData.id, chatData);
  }

  return chatData;
}

/**
 * Create a new chat and optionally set it as current for a world
 */
export async function newChat(worldId: string): Promise<World | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  const chats = await listChats(resolvedWorldId);
  const existingChat = chats.find(chat => isDefaultChatTitle(chat.name));

  // Only reuse existing "New Chat" if it's empty (has no messages)
  if (existingChat) {
    const messages = await storageWrappers!.getMemory(resolvedWorldId, existingChat.id);
    if (messages.length === 0) {
      return await updateWorld(resolvedWorldId, { currentChatId: existingChat.id });
    }
    // If chat has messages, fall through to create a new one
  }

  const chatData = await createChat(resolvedWorldId, {
    name: NEW_CHAT_TITLE,
    captureChat: false
  });
  return await updateWorld(resolvedWorldId, { currentChatId: chatData.id });
}

export async function listChats(worldId: string): Promise<Chat[]> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  return await storageWrappers!.listChats(resolvedWorldId);
}

export async function updateChat(worldId: string, chatId: string, updates: UpdateChatParams): Promise<Chat | null> {
  await ensureInitialization();

  const resolvedWorldId = await getResolvedWorldId(worldId);
  const chat = await storageWrappers!.updateChatData(resolvedWorldId, chatId, updates);

  if (!chat) {
    return null;
  }

  // When a chat is updated we refresh the cached world representation
  const world = await getWorld(resolvedWorldId);
  if (world && world.chats.has(chatId)) {
    world.chats.set(chatId, {
      ...world.chats.get(chatId)!,
      ...chat
    });
  }

  return chat;
}

export async function deleteChat(worldId: string, chatId: string): Promise<boolean> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  // First, delete all agent memory items associated with this chat
  const deletedMemoryCount = await storageWrappers!.deleteMemoryByChatId(resolvedWorldId, chatId);
  logger.debug('Deleted memory items for chat', { worldId, resolvedWorldId, chatId, deletedMemoryCount });

  // Get the world to check if this was the current chat
  const world = await getWorld(resolvedWorldId);
  let shouldSetNewCurrentChat = false;

  if (world && world.currentChatId === chatId) {
    shouldSetNewCurrentChat = true;
  }

  // Emit CRUD event BEFORE deletion (while chat_id still exists in DB)
  if (world) {
    publishCRUDEvent(world, 'delete', 'chat', chatId);
  }

  // Then delete the chat itself
  const chatDeleted = await storageWrappers!.deleteChatData(resolvedWorldId, chatId);

  // Remove from world's in-memory chat map
  if (chatDeleted && world) {
    world.chats.delete(chatId);
  }

  // If this was the current chat, set a fallback current chat
  if (shouldSetNewCurrentChat && chatDeleted) {
    const remainingChats = await storageWrappers!.listChats(resolvedWorldId);
    if (remainingChats.length > 0) {
      // Set the most recently updated chat as current
      const latestChat = remainingChats.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0];
      await updateWorld(resolvedWorldId, { currentChatId: latestChat.id });
    } else {
      // No chats left, create a new one
      logger.debug('No chats remaining after deletion, creating new chat');
      await newChat(resolvedWorldId);
    }
  }

  return chatDeleted;
}

export async function restoreChat(worldId: string, chatId: string): Promise<World | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  let world = await getWorld(resolvedWorldId);
  if (!world) {
    return null;
  }

  if (world.currentChatId === chatId) {
    return world;
  }

  const runtimeChatExists = world.chats.has(chatId);
  const persistedChatExists = runtimeChatExists
    ? true
    : !!(await storageWrappers!.loadChatData(resolvedWorldId, chatId));

  if (!persistedChatExists) {
    return null;
  }

  world = await updateWorld(resolvedWorldId, {
    currentChatId: chatId
  });
  return world;
}

export async function getMemory(worldId: string, chatId?: string | null): Promise<AgentMessage[] | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  let world = await getWorld(resolvedWorldId);
  if (!world) {
    return null;
  }

  const resolvedChatId = chatId || world.currentChatId;
  const memory = await storageWrappers!.getMemory(resolvedWorldId, resolvedChatId);

  // Auto-repair legacy memories so downstream clients can rely on messageId without UI fallbacks.
  if (memory.some(message => !message.messageId)) {
    logger.warn('Detected messages without messageId in getMemory; running migration', {
      worldId: resolvedWorldId,
      chatId: resolvedChatId
    });

    await migrateMessageIds(resolvedWorldId);
    return await storageWrappers!.getMemory(resolvedWorldId, resolvedChatId);
  }

  return memory;
}

/**
 * Migrate messages to include messageId for user message edit feature
 * Automatically detects storage type and handles both file and SQL storage
 * Idempotent - safe to run multiple times
 * 
 * @param worldId - World ID to migrate messages for
 * @returns Number of messages migrated
 */
export async function migrateMessageIds(worldId: string): Promise<number> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  let totalMigrated = 0;
  const world = await getWorld(resolvedWorldId);

  if (!world) {
    throw new Error(`World '${worldId}' not found`);
  }

  // Get all agents in the world
  const agents = await listAgents(resolvedWorldId);

  // Get all chats for the world
  const chats = await storageWrappers!.listChats(resolvedWorldId);

  // Migrate messages for each chat
  for (const chat of chats) {
    const chatId = chat.id;

    // Get all memory for this chat
    const memory = await storageWrappers!.getMemory(resolvedWorldId, chatId);

    if (!memory || memory.length === 0) {
      continue;
    }

    // Check which messages need messageId
    let needsMigration = false;
    const updatedMemory: AgentMessage[] = [];

    for (const message of memory) {
      if (!message.messageId) {
        needsMigration = true;
        updatedMemory.push({
          ...message,
          messageId: nanoid(10)
        });
        totalMigrated++;
      } else {
        updatedMemory.push(message);
      }
    }

    // If any messages were updated, save the entire memory back
    if (needsMigration) {
      // For each agent, update their memory with the migrated messages
      for (const agent of agents) {
        const agentMessages = updatedMemory.filter(m => m.agentId === agent.id);
        if (agentMessages.length > 0) {
          await storageWrappers!.saveAgentMemory(resolvedWorldId, agent.id, agentMessages);
        }
      }
    }
  }

  logger.info(`Migrated ${totalMigrated} messages with messageId for world '${resolvedWorldId}'`);
  return totalMigrated;
}

/**
 * Remove a message and all subsequent messages from all agents in a world
 * Used for user message editing feature
 * 
 * @param worldId - World ID
 * @param messageId - ID of the message to remove (and all after it)
 * @param chatId - Chat ID to filter messages
 * @returns RemovalResult with per-agent removal details
 */
export async function removeMessagesFrom(
  worldId: string,
  messageId: string,
  chatId: string
): Promise<RemovalResult> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  const world = await getWorld(resolvedWorldId);
  if (!world) {
    throw new Error(`World '${worldId}' not found`);
  }

  // Get all agents
  const agents = await listAgents(resolvedWorldId);

  // Track results per agent
  const processedAgents: string[] = [];
  const failedAgents: Array<{ agentId: string; error: string }> = [];
  let messagesRemovedTotal = 0;
  let foundTargetInAnyAgent = false;
  let targetTimestampValue: number | null = null;
  const loadedAgentsById = new Map<string, Agent>();

  const toTimestamp = (value: unknown): number => {
    if (value instanceof Date) {
      return value.getTime();
    }

    if (value) {
      const parsed = new Date(value as string).getTime();
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return Date.now();
  };

  // First pass: load each agent and discover the deletion cutoff timestamp
  for (const agent of agents) {
    try {
      const fullAgent = await storageWrappers!.loadAgent(resolvedWorldId, agent.id);
      if (!fullAgent || !fullAgent.memory || fullAgent.memory.length === 0) {
        continue;
      }

      loadedAgentsById.set(agent.id, fullAgent);

      // Find the target message in this chat for global cutoff derivation
      const targetMsg = fullAgent.memory.find(m => m.messageId === messageId && m.chatId === chatId);

      if (targetMsg) {
        foundTargetInAnyAgent = true;
        const candidateTimestamp = toTimestamp(targetMsg.createdAt);
        if (targetTimestampValue === null || candidateTimestamp < targetTimestampValue) {
          targetTimestampValue = candidateTimestamp;
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      failedAgents.push({
        agentId: agent.id,
        error: errorMsg
      });
    }
  }

  if (!foundTargetInAnyAgent || targetTimestampValue === null) {
    const notFoundFailures = agents.length > 0
      ? [
        ...failedAgents,
        { agentId: 'all', error: `Message with ID '${messageId}' not found in chat '${chatId}'` }
      ]
      : failedAgents;

    return {
      success: false,
      messageId,
      totalAgents: agents.length,
      processedAgents,
      failedAgents: notFoundFailures,
      messagesRemovedTotal,
      requiresRetry: false,
      resubmissionStatus: 'skipped',
      newMessageId: undefined
    };
  }

  // Second pass: apply cutoff to all agents in the target chat
  for (const agent of agents) {
    if (failedAgents.some(entry => entry.agentId === agent.id)) {
      continue;
    }

    const fullAgent = loadedAgentsById.get(agent.id);
    if (!fullAgent || !Array.isArray(fullAgent.memory) || fullAgent.memory.length === 0) {
      processedAgents.push(agent.id);
      continue;
    }

    try {
      const messagesToKeep = fullAgent.memory.filter(m => {
        if (m.chatId !== chatId) {
          return true;
        }

        const msgTimestamp = toTimestamp(m.createdAt);
        return msgTimestamp < targetTimestampValue;
      });

      const removedCount = fullAgent.memory.length - messagesToKeep.length;

      if (removedCount === 0) {
        processedAgents.push(agent.id);
        continue;
      }

      await storageWrappers!.saveAgentMemory(resolvedWorldId, agent.id, messagesToKeep);

      messagesRemovedTotal += removedCount;
      processedAgents.push(agent.id);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      failedAgents.push({
        agentId: agent.id,
        error: errorMsg
      });
    }
  }

  logger.info('Message removal completed', {
    messageId,
    success: failedAgents.length === 0,
    totalAgents: agents.length,
    processedAgents: processedAgents.length,
    failedAgents: failedAgents.length,
    messagesRemovedTotal
  });

  return {
    success: failedAgents.length === 0,
    messageId,
    totalAgents: agents.length,
    processedAgents,
    failedAgents,
    messagesRemovedTotal,
    requiresRetry: failedAgents.length > 0,
    resubmissionStatus: 'skipped', // Will be updated by editUserMessage
    newMessageId: undefined
  };
}

/**
 * Edit a user message by removing it and all subsequent messages, then resubmitting with new content
 * Combines removal and resubmission in a single operation with comprehensive error tracking
 * 
 * @param worldId - World ID
 * @param messageId - ID of the message to edit
 * @param newContent - New message content
 * @param chatId - Chat ID for the message
 * @returns RemovalResult with removal and resubmission details
 */
export async function editUserMessage(
  worldId: string,
  messageId: string,
  newContent: string,
  chatId: string,
  targetWorld?: World
): Promise<RemovalResult> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  const { getActiveSubscribedWorld } = await import('./subscription.js');
  const activeSubscribedWorld = targetWorld || getActiveSubscribedWorld(resolvedWorldId);
  const world = activeSubscribedWorld || await getWorld(resolvedWorldId);
  if (!world) {
    throw new Error(`World '${worldId}' not found`);
  }

  if (hasActiveChatMessageProcessing(resolvedWorldId, chatId)) {
    stopMessageProcessing(resolvedWorldId, chatId);
  }

  // Step 1: Remove the message and all subsequent messages
  const removalResult = await removeMessagesFrom(resolvedWorldId, messageId, chatId);

  if (!removalResult.success) {
    return removalResult;
  }

  await syncRuntimeAgentMemoryFromStorage(activeSubscribedWorld || world, resolvedWorldId);

  // Step 2: Reset auto-generated chat title so post-resubmission title generation can run again.
  await resetAutoGeneratedChatTitleForEditResubmission(world, chatId);

  const worldForResubmission = activeSubscribedWorld || world;

  if (!activeSubscribedWorld) {
    const { subscribeAgentToMessages, subscribeWorldToMessages } = await import('./events/index.js');
    for (const agent of worldForResubmission.agents.values()) {
      subscribeAgentToMessages(worldForResubmission, agent);
    }
    subscribeWorldToMessages(worldForResubmission);
  }

  // Step 3: Attempt resubmission using publishMessage directly
  try {
    const { publishMessage } = await import('./events/index.js');
    const messageEvent = publishMessage(worldForResubmission, newContent, 'human', chatId);

    logger.info(`Resubmitted edited message to world '${resolvedWorldId}' with new messageId '${messageEvent.messageId}'`);

    return {
      ...removalResult,
      resubmissionStatus: 'success',
      newMessageId: messageEvent.messageId
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to resubmit message to world '${resolvedWorldId}': ${errorMsg}`);
    return {
      ...removalResult,
      resubmissionStatus: 'failed',
      resubmissionError: errorMsg
    };
  }
}

/**
 * Log an error from a message edit operation for troubleshooting and retry
 * Stores errors in data/worlds/{worldName}/edit-errors.json
 * Keeps only the last 100 errors
 * 
 * @param worldId - World ID
 * @param errorLog - EditErrorLog to persist
 */
export async function logEditError(worldId: string, errorLog: EditErrorLog): Promise<void> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  const rootPath = getDefaultRootPath();
  const worldDir = getWorldDir(rootPath, resolvedWorldId);
  const errorsFile = path.join(worldDir, 'edit-errors.json');

  try {
    // Read existing errors
    let errors: EditErrorLog[] = [];
    if (fs.existsSync(errorsFile)) {
      const data = fs.readFileSync(errorsFile, 'utf-8');
      errors = JSON.parse(data);
    }

    // Add new error
    errors.push(errorLog);

    // Keep only last 100 errors
    if (errors.length > 100) {
      errors = errors.slice(-100);
    }

    // Write back to file
    fs.writeFileSync(errorsFile, JSON.stringify(errors, null, 2), 'utf-8');
    logger.debug(`Logged edit error for world '${resolvedWorldId}'`);
  } catch (error) {
    logger.error(`Failed to log edit error for world '${resolvedWorldId}': ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Get edit error logs for a world
 * 
 * @param worldId - World ID
 * @returns Array of EditErrorLog entries
 */
export async function getEditErrors(worldId: string): Promise<EditErrorLog[]> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  const rootPath = getDefaultRootPath();
  const worldDir = getWorldDir(rootPath, resolvedWorldId);
  const errorsFile = path.join(worldDir, 'edit-errors.json');

  try {
    if (!fs.existsSync(errorsFile)) {
      return [];
    }

    const data = fs.readFileSync(errorsFile, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    logger.error(`Failed to read edit errors for world '${resolvedWorldId}': ${error instanceof Error ? error.message : error}`);
    return [];
  }
}
