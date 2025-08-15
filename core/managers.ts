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
 *
 * API: World (create/get/update/delete/list), Agent (create/get/update/delete/list/updateMemory/clearMemory),
 * Chat (newChat/listChats/deleteChat/restoreChat)
 *
 * Implementation Details:
 * - Ensures all agent messages include agentId for proper export functionality
 * - Compatible with both SQLite and memory storage backends
 * - Automatic agent identification for message source tracking
 *
 * Note: Export functionality has been moved to core/export.ts
 */// Core module imports
import { createCategoryLogger, initializeLogger } from './logger.js';
import { EventEmitter } from 'events';
import { type StorageAPI, createStorageWithWrappers } from './storage/storage-factory.js'
import * as utils from './utils.js';

// Type imports
import type {
  World, CreateWorldParams, UpdateWorldParams, Agent, CreateAgentParams, UpdateAgentParams,
  AgentMessage, Chat, CreateChatParams, UpdateChatParams, WorldChat, LLMProvider
} from './types.js';

// Initialize logger and storage
const logger = createCategoryLogger('core');
let storageWrappers: StorageAPI | null = null;

async function initializeModules() {
  initializeLogger();
  storageWrappers = await createStorageWithWrappers();
}

const moduleInitialization = initializeModules();
const NEW_CHAT_CONFIG = { REUSABLE_CHAT_TITLE: 'New Chat' } as const;

/**
 * Create new world with configuration and automatically create a new chat
 */
export async function createWorld(params: CreateWorldParams): Promise<World | null> {
  await moduleInitialization;

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
    chatLLMProvider: params.chatLLMProvider,
    chatLLMModel: params.chatLLMModel,
    mcpConfig: params.mcpConfig,
    createdAt: new Date(),
    lastUpdated: new Date(),
    totalAgents: 0,
    totalMessages: 0,
    eventEmitter: new EventEmitter(),
    agents: new Map<string, Agent>(),
    chats: new Map<string, Chat>(),
  };

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
  await moduleInitialization;

  const normalizedWorldId = utils.toKebabCase(worldId);
  const existingData = await storageWrappers!.loadWorld(normalizedWorldId);

  if (!existingData) {
    return null;
  }

  const updatedData: World = {
    ...existingData,
    ...updates,
    lastUpdated: new Date()
  };

  await storageWrappers!.saveWorld(updatedData);
  return getWorld(normalizedWorldId);
}

/**
 * Delete world and all associated data
 */
export async function deleteWorld(worldId: string): Promise<boolean> {
  await moduleInitialization;
  const normalizedWorldId = utils.toKebabCase(worldId);
  return await storageWrappers!.deleteWorld(normalizedWorldId);
}

/**
 * Get all world IDs and basic information
 */
export async function listWorlds(): Promise<World[]> {
  await moduleInitialization;

  const allWorldData = await storageWrappers!.listWorlds();

  const worldsWithAgentCount = await Promise.all(
    allWorldData.map(async (data: World) => {
      try {
        const agents = await storageWrappers!.listAgents(data.id);
        return { ...data, agentCount: agents.length };
      } catch (error) {
        return { ...data, agentCount: 0 };
      }
    })
  );

  return worldsWithAgentCount;
}

/**
 * Get world configuration and create runtime instance, creating a new chat if none exist
 */
export async function getWorld(worldId: string): Promise<World | null> {
  await moduleInitialization;

  const normalizedWorldId = utils.toKebabCase(worldId);

  logger.debug('getWorldConfig called', {
    originalWorldId: worldId,
    normalizedWorldId
  });

  const worldData = await storageWrappers!.loadWorld(normalizedWorldId);

  logger.debug('loadWorld result', {
    worldFound: !!worldData,
    worldId: worldData?.id,
    worldName: worldData?.name
  });

  if (!worldData) {
    logger.debug('World not found, returning null');
    return null;
  }

  let agents = await storageWrappers!.listAgents(normalizedWorldId);
  let chats = await storageWrappers!.listChats(normalizedWorldId);

  // If there are no chats, create a new one
  if (chats.length === 0) {
    logger.debug('No chats found for world, creating new chat');
    await newChat(normalizedWorldId);
    chats = await storageWrappers!.listChats(normalizedWorldId);
  }

  return {
    ...worldData,
    eventEmitter: new EventEmitter(),
    agents: new Map(agents.map((agent: Agent) => [agent.id, agent])),
    chats: new Map(chats.map((chat: Chat) => [chat.id, chat])),
  };
}

/**
 * Create new agent with configuration and system prompt
 */
export async function createAgent(worldId: string, params: CreateAgentParams): Promise<Agent> {
  await moduleInitialization;

  const agentId = params.id || utils.toKebabCase(params.name);

  const exists = await storageWrappers!.agentExists(worldId, agentId);
  if (exists) {
    throw new Error(`Agent with ID '${agentId}' already exists`);
  }

  const now = new Date();
  const agent: Agent = {
    id: agentId,
    name: params.name,
    type: params.type,
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

  await storageWrappers!.saveAgent(worldId, agent);
  return agent;
}

/**
 * Load agent by ID with full configuration and memory
 */
export async function getAgent(worldId: string, agentId: string): Promise<Agent | null> {
  await moduleInitialization;

  const agentData = await storageWrappers!.loadAgent(worldId, agentId);
  if (!agentData) return null;

  return agentData;
}

/**
 * Update agent configuration and/or memory
 */
export async function updateAgent(worldId: string, agentId: string, updates: UpdateAgentParams): Promise<Agent | null> {
  await moduleInitialization;

  const existingAgentData = await storageWrappers!.loadAgent(worldId, agentId);

  if (!existingAgentData) {
    return null;
  }

  const updatedAgent: Agent = {
    ...existingAgentData,
    name: updates.name || existingAgentData.name,
    type: updates.type || existingAgentData.type,
    status: updates.status || existingAgentData.status,
    provider: updates.provider || existingAgentData.provider,
    model: updates.model || existingAgentData.model,
    systemPrompt: updates.systemPrompt !== undefined ? updates.systemPrompt : existingAgentData.systemPrompt,
    temperature: updates.temperature !== undefined ? updates.temperature : existingAgentData.temperature,
    maxTokens: updates.maxTokens !== undefined ? updates.maxTokens : existingAgentData.maxTokens,
    lastActive: new Date()
  };

  await storageWrappers!.saveAgent(worldId, updatedAgent);
  return updatedAgent;
}

/**
 * Delete agent and all associated data
 */
export async function deleteAgent(worldId: string, agentId: string): Promise<boolean> {
  await moduleInitialization;
  return await storageWrappers!.deleteAgent(worldId, agentId);
}

/**
 * Get all agent IDs and basic information
 */
export async function listAgents(worldId: string): Promise<Agent[]> {
  await moduleInitialization;
  return await storageWrappers!.listAgents(worldId);
}

/**
 * Add messages to agent memory
 */
export async function updateAgentMemory(worldId: string, agentId: string, messages: AgentMessage[]): Promise<Agent | null> {
  await moduleInitialization;

  const existingAgentData = await storageWrappers!.loadAgent(worldId, agentId);

  if (!existingAgentData) {
    return null;
  }

  // Ensure messages have the agentId set
  const messagesWithAgentId = messages.map(msg => ({
    ...msg,
    agentId: agentId
  }));

  const updatedAgent: Agent = {
    ...existingAgentData,
    memory: [...existingAgentData.memory, ...messagesWithAgentId],
    lastActive: new Date()
  };

  await storageWrappers!.saveAgentMemory(worldId, agentId, updatedAgent.memory);
  await storageWrappers!.saveAgent(worldId, updatedAgent);
  return updatedAgent;
}

/**
 * Clear agent memory and reset LLM call count
 */
export async function clearAgentMemory(worldId: string, agentId: string): Promise<Agent | null> {
  await moduleInitialization;

  logger.debug('Core clearAgentMemory called', { worldId, agentId });

  const existingAgentData = await storageWrappers!.loadAgent(worldId, agentId);

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
      await storageWrappers!.archiveMemory(worldId, agentId, existingAgentData.memory);
      logger.debug('Memory archived successfully');
    } catch (error) {
      logger.warn('Failed to archive memory', { agentId, error: error instanceof Error ? error.message : error });
    }
  }

  const updatedAgent: Agent = {
    ...existingAgentData,
    memory: [],
    llmCallCount: 0,
    lastActive: new Date()
  };

  logger.debug('Saving cleared memory to disk');

  await storageWrappers!.saveAgentMemory(worldId, agentId, []);
  await storageWrappers!.saveAgent(worldId, updatedAgent);

  logger.debug('Memory and LLM call count cleared and saved successfully', {
    agentId,
    newLLMCallCount: updatedAgent.llmCallCount
  });
  return updatedAgent;
}

/**
 * Create new chat data entry with optional world snapshot
 */
async function createChat(worldId: string, params: CreateChatParams): Promise<Chat> {
  await moduleInitialization;

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
  return chatData;
}

/**
 * Create a new chat and optionally set it as current for a world
 */
export async function newChat(worldId: string): Promise<World | null> {
  await moduleInitialization;

  const chats = await listChats(worldId);
  const existingChat = chats.find(chat => chat.name === NEW_CHAT_CONFIG.REUSABLE_CHAT_TITLE);

  if (existingChat) {
    return await updateWorld(worldId, { currentChatId: existingChat.id });
  }

  const chatData = await createChat(worldId, {
    name: "New Chat",
    captureChat: false
  });
  return await updateWorld(worldId, { currentChatId: chatData.id });
}

export async function listChats(worldId: string): Promise<Chat[]> {
  await moduleInitialization;
  return await storageWrappers!.listChats(worldId);
}

export async function deleteChat(worldId: string, chatId: string): Promise<boolean> {
  await moduleInitialization;

  // First, delete all agent memory items associated with this chat
  const deletedMemoryCount = await storageWrappers!.deleteMemoryByChatId(worldId, chatId);
  logger.debug('Deleted memory items for chat', { worldId, chatId, deletedMemoryCount });

  // Get the world to check if this was the current chat
  const world = await getWorld(worldId);
  let shouldSetNewCurrentChat = false;

  if (world && world.currentChatId === chatId) {
    shouldSetNewCurrentChat = true;
  }

  // Then delete the chat itself
  const chatDeleted = await storageWrappers!.deleteChatData(worldId, chatId);

  // If this was the current chat, set a fallback current chat
  if (shouldSetNewCurrentChat && chatDeleted) {
    const remainingChats = await storageWrappers!.listChats(worldId);
    if (remainingChats.length > 0) {
      // Set the most recently updated chat as current
      const latestChat = remainingChats.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0];
      await updateWorld(worldId, { currentChatId: latestChat.id });
    } else {
      // No chats left, create a new one
      logger.debug('No chats remaining after deletion, creating new chat');
      await newChat(worldId);
    }
  }

  return chatDeleted;
}

export async function restoreChat(worldId: string, chatId: string): Promise<World | null> {
  await moduleInitialization;

  let world = await getWorld(worldId);
  if (!world) {
    return null;
  }

  if (world.currentChatId === chatId) {
    return world;
  }

  world = await updateWorld(worldId, {
    currentChatId: chatId
  });
  return world;
}

export async function getMemory(worldId: string, chatId?: string | null): Promise<AgentMessage[] | null> {
  await moduleInitialization;

  let world = await getWorld(worldId);
  if (!world) {
    return null;
  }

  return await storageWrappers!.getMemory(worldId, chatId || world.currentChatId);
}
