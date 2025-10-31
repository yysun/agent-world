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
 * - Session mode validation for message resubmission
 * - Comprehensive error tracking for partial failures
 * - Error log persistence with 100-entry retention policy
 *
 * Changes:
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
const NEW_CHAT_CONFIG = { REUSABLE_CHAT_TITLE: 'New Chat' } as const;

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
    eventStorage: (storageWrappers as any)?.eventStorage,
  };

  // Setup event persistence
  if (worldData.eventStorage) {
    const { setupEventPersistence } = await import('./events.js');
    worldData._eventPersistenceCleanup = setupEventPersistence(worldData);
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
  await ensureInitialization();
  const normalizedWorldId = utils.toKebabCase(worldId);

  // Clean up event persistence listeners if world is currently loaded
  const world = await getWorld(normalizedWorldId);
  if (world?._eventPersistenceCleanup) {
    world._eventPersistenceCleanup();
  }

  return await storageWrappers!.deleteWorld(normalizedWorldId);
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
  await ensureInitialization();

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

  const world: World = {
    ...worldData,
    eventEmitter: new EventEmitter(),
    agents: new Map(agents.map((agent: Agent) => [agent.id, agent])),
    chats: new Map(chats.map((chat: Chat) => [chat.id, chat])),
    eventStorage: (storageWrappers as any)?.eventStorage,
    _eventPersistenceCleanup: undefined, // Will be set by setupEventPersistence
  };

  // Setup event persistence
  if (world.eventStorage) {
    const { setupEventPersistence } = await import('./events.js');
    world._eventPersistenceCleanup = setupEventPersistence(world);
  }

  return world;
}

/**
 * Create new agent with configuration and system prompt
 */
export async function createAgent(worldId: string, params: CreateAgentParams): Promise<Agent> {
  await ensureInitialization();

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
  await ensureInitialization();

  const agentData = await storageWrappers!.loadAgent(worldId, agentId);
  if (!agentData) return null;

  return agentData;
}

/**
 * Update agent configuration and/or memory
 */
export async function updateAgent(worldId: string, agentId: string, updates: UpdateAgentParams): Promise<Agent | null> {
  await ensureInitialization();

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
  await ensureInitialization();
  return await storageWrappers!.deleteAgent(worldId, agentId);
}

/**
 * Get all agent IDs and basic information
 */
export async function listAgents(worldId: string): Promise<Agent[]> {
  await ensureInitialization();
  return await storageWrappers!.listAgents(worldId);
}

/**
 * Add messages to agent memory
 */
export async function updateAgentMemory(worldId: string, agentId: string, messages: AgentMessage[]): Promise<Agent | null> {
  await ensureInitialization();

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
  await ensureInitialization();

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
  return chatData;
}

/**
 * Create a new chat and optionally set it as current for a world
 */
export async function newChat(worldId: string): Promise<World | null> {
  await ensureInitialization();

  const chats = await listChats(worldId);
  const existingChat = chats.find(chat => chat.name === NEW_CHAT_CONFIG.REUSABLE_CHAT_TITLE);

  // Only reuse existing "New Chat" if it's empty (has no messages)
  if (existingChat) {
    const messages = await storageWrappers!.getMemory(worldId, existingChat.id);
    if (messages.length === 0) {
      return await updateWorld(worldId, { currentChatId: existingChat.id });
    }
    // If chat has messages, fall through to create a new one
  }

  const chatData = await createChat(worldId, {
    name: "New Chat",
    captureChat: false
  });
  return await updateWorld(worldId, { currentChatId: chatData.id });
}

export async function listChats(worldId: string): Promise<Chat[]> {
  await ensureInitialization();
  return await storageWrappers!.listChats(worldId);
}

export async function updateChat(worldId: string, chatId: string, updates: UpdateChatParams): Promise<Chat | null> {
  await ensureInitialization();

  const normalizedWorldId = utils.toKebabCase(worldId);
  const chat = await storageWrappers!.updateChatData(normalizedWorldId, chatId, updates);

  if (!chat) {
    return null;
  }

  // When a chat is updated we refresh the cached world representation
  const world = await getWorld(normalizedWorldId);
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
  await ensureInitialization();

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
  await ensureInitialization();

  let world = await getWorld(worldId);
  if (!world) {
    return null;
  }

  return await storageWrappers!.getMemory(worldId, chatId || world.currentChatId);
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

  let totalMigrated = 0;
  const world = await getWorld(worldId);

  if (!world) {
    throw new Error(`World '${worldId}' not found`);
  }

  // Get all agents in the world
  const agents = await listAgents(worldId);

  // Get all chats for the world
  const chats = await storageWrappers!.listChats(worldId);

  // Migrate messages for each chat
  for (const chat of chats) {
    const chatId = chat.id;

    // Get all memory for this chat
    const memory = await storageWrappers!.getMemory(worldId, chatId);

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
          await storageWrappers!.saveAgentMemory(worldId, agent.id, agentMessages);
        }
      }
    }
  }

  logger.info(`Migrated ${totalMigrated} messages with messageId for world '${worldId}'`);
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

  const world = await getWorld(worldId);
  if (!world) {
    throw new Error(`World '${worldId}' not found`);
  }

  // Get all agents
  const agents = await listAgents(worldId);

  // Get all memory for this chat to find the target message and its timestamp
  const memory = await storageWrappers!.getMemory(worldId, chatId);

  if (!memory || memory.length === 0) {
    return {
      success: false,
      messageId,
      totalAgents: agents.length,
      processedAgents: [],
      failedAgents: agents.map(a => ({ agentId: a.id, error: 'No messages found in chat' })),
      messagesRemovedTotal: 0,
      requiresRetry: false,
      resubmissionStatus: 'skipped',
      newMessageId: undefined
    };
  }

  // Find the target message to get its timestamp
  const targetMessage = memory.find(m => m.messageId === messageId);
  if (!targetMessage) {
    logger.error('Target message not found', { messageId, chatId, availableMessageIds: memory.map(m => m.messageId) });
    return {
      success: false,
      messageId,
      totalAgents: agents.length,
      processedAgents: [],
      failedAgents: agents.map(a => ({ agentId: a.id, error: `Message with ID '${messageId}' not found` })),
      messagesRemovedTotal: 0,
      requiresRetry: false,
      resubmissionStatus: 'skipped',
      newMessageId: undefined
    };
  }

  // Handle optional createdAt field with fallback to current time
  const targetTimestamp = targetMessage.createdAt
    ? new Date(targetMessage.createdAt).getTime()
    : Date.now();

  // Track results per agent
  const processedAgents: string[] = [];
  const failedAgents: Array<{ agentId: string; error: string }> = [];
  let messagesRemovedTotal = 0;

  // Process each agent
  for (const agent of agents) {
    try {
      // Load the agent's full memory (all chats)
      const fullAgent = await storageWrappers!.loadAgent(worldId, agent.id);
      if (!fullAgent || !fullAgent.memory || fullAgent.memory.length === 0) {
        processedAgents.push(agent.id);
        continue;
      }

      // Find the target message in this chat
      const targetIndex = fullAgent.memory.findIndex(m => m.messageId === messageId && m.chatId === chatId);

      if (targetIndex === -1) {
        // Target message not found in this agent's memory - skip this agent
        processedAgents.push(agent.id);
        continue;
      }

      // Get the target message timestamp
      const targetMsg = fullAgent.memory[targetIndex];
      const targetTimestampValue = targetMsg.createdAt instanceof Date
        ? targetMsg.createdAt.getTime()
        : targetMsg.createdAt ? new Date(targetMsg.createdAt).getTime() : Date.now();

      // Keep messages that are either:
      // 1. From different chats (chatId !== chatId), OR
      // 2. From this chat but before the target timestamp
      const messagesToKeep = fullAgent.memory.filter(m => {
        if (m.chatId !== chatId) {
          return true; // Keep messages from other chats
        }

        const msgTimestamp = m.createdAt instanceof Date
          ? m.createdAt.getTime()
          : m.createdAt ? new Date(m.createdAt).getTime() : Date.now();
        return msgTimestamp < targetTimestampValue; // Keep only messages before target
      });

      const removedCount = fullAgent.memory.length - messagesToKeep.length;
      const removedIds = fullAgent.memory
        .filter(m => m.chatId === chatId)
        .filter(m => {
          const msgTimestamp = m.createdAt instanceof Date
            ? m.createdAt.getTime()
            : m.createdAt ? new Date(m.createdAt).getTime() : Date.now();
          return msgTimestamp >= targetTimestampValue;
        })
        .map(m => m.messageId);

      if (removedCount === 0) {
        processedAgents.push(agent.id);
        continue;
      }

      // Save updated memory
      await storageWrappers!.saveAgentMemory(worldId, agent.id, messagesToKeep);

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
  chatId: string
): Promise<RemovalResult> {
  await ensureInitialization();

  // Check if world.isProcessing is true
  const world = await getWorld(worldId);
  if (!world) {
    throw new Error(`World '${worldId}' not found`);
  }

  if (world.isProcessing) {
    throw new Error('Cannot edit message while world is processing');
  }

  // Step 1: Remove the message and all subsequent messages
  const removalResult = await removeMessagesFrom(worldId, messageId, chatId);

  if (!removalResult.success) {
    return removalResult;
  }

  // Step 2: Verify session mode is ON before resubmitting
  if (!world.currentChatId) {
    return {
      ...removalResult,
      resubmissionStatus: 'skipped',
      resubmissionError: 'Session mode is OFF (currentChatId not set)'
    };
  }

  // Step 3: Verify the chatId matches the current chat
  if (world.currentChatId !== chatId) {
    return {
      ...removalResult,
      resubmissionStatus: 'failed',
      resubmissionError: `Cannot resubmit: message belongs to chat '${chatId}' but current chat is '${world.currentChatId}'`
    };
  }

  // Step 4: Attempt resubmission using publishMessage directly
  try {
    const { publishMessage } = await import('./events.js');
    const messageEvent = publishMessage(world, newContent, 'human', chatId);

    logger.info(`Resubmitted edited message to world '${worldId}' with new messageId '${messageEvent.messageId}'`);

    return {
      ...removalResult,
      resubmissionStatus: 'success',
      newMessageId: messageEvent.messageId
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to resubmit message to world '${worldId}': ${errorMsg}`);
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

  const rootPath = getDefaultRootPath();
  const worldDir = getWorldDir(rootPath, worldId);
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
    logger.debug(`Logged edit error for world '${worldId}'`);
  } catch (error) {
    logger.error(`Failed to log edit error for world '${worldId}': ${error instanceof Error ? error.message : error}`);
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

  const rootPath = getDefaultRootPath();
  const worldDir = getWorldDir(rootPath, worldId);
  const errorsFile = path.join(worldDir, 'edit-errors.json');

  try {
    if (!fs.existsSync(errorsFile)) {
      return [];
    }

    const data = fs.readFileSync(errorsFile, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    logger.error(`Failed to read edit errors for world '${worldId}': ${error instanceof Error ? error.message : error}`);
    return [];
  }
}
