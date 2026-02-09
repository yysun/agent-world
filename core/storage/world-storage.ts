/**
 * World Storage Module - File I/O Operations for World Data and Chat Operations
 *
 * Logger Category: storage.query
 * Purpose: World and chat data file I/O operations
 * 
 * Enable with: LOG_STORAGE_QUERY=debug npm run server
 * 
 * What you'll see:
 * - World config saves and loads
 * - Chat data operations
 * - Memory aggregation queries
 * - File operation errors
 *
 * Features:
 * - World configuration persistence to config.json with flattened structure
 * - Complete chat operations with file-based storage (chats directory)
 * - Cross-agent memory aggregation for world-level chat sessions
 * - Kebab-case directory naming from world names
 * - Clean separation of storage data from runtime objects
 * - Handles World serialization without EventEmitter and agents Map
 * - Complete isolation from other internal modules
 * - Explicit rootPath parameter handling (no environment variables)
 * - Cascade deletion for data integrity (world → agents/chats, chat → messages)
 *
 * Core Functions:
 * - saveWorld: Save world config.json with flat structure (excludes runtime properties: eventEmitter, agents, chats, eventStorage, _eventPersistenceCleanup)
 * - loadWorld: Load world configuration from file
 * - deleteWorld: Remove world directory and all contents (cascades to agents and chats)
 * - listWorlds: Scan and load all worlds in root directory
 * - worldExists: Check if world directory exists
 * 
 * Changes:
 * - 2025-11-01: Explicitly exclude runtime properties (eventEmitter, agents, chats, eventStorage, _eventPersistenceCleanup) from saveWorld
 * - getWorldDir: Get world directory path
 * - ensureWorldDirectory: Create world directory structure
 *
 * Chat Functions:
 * - saveChatData: Save complete chat data with metadata and content
 * - loadChatData: Load complete chat data with Date reconstruction
 * - deleteChatData: Remove chat files and cascade delete associated messages from agent memory
 * - listChatHistories: List all chat metadata for a world
 * - updateChatData: Update existing chat with partial data
 * - getMemory: Aggregate memory across all agents for chat sessions
 *
 * Version: 2.1.0 - Added cascade deletion for chat operations
 * Date: 2025-10-30
 * Version: 2.2.0 - Updated to structured logging (storage.query)
 * Date: 2025-10-31
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { toKebabCase } from '../utils.js';
import { createCategoryLogger } from '../logger.js';
import type { World, Chat, CreateChatParams, UpdateChatParams, AgentMessage } from '../types.js';
import { listAgents, loadAgent, deleteMemoryByChatId } from './agent-storage.js';

const logger = createCategoryLogger('storage.query');

// Extract readdir and exists from fs for convenience
const { readdir, access } = fs;
const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};


/**
 * File utility functions
 */
async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

/**
 * World directory and file path utilities
 */
export function getWorldDir(rootPath: string, worldId: string): string {
  const normalizedWorldId = toKebabCase(worldId);
  return path.join(rootPath, normalizedWorldId);
}

export async function ensureWorldDirectory(root: string, worldId: string): Promise<void> {
  const worldDir = getWorldDir(root, worldId);
  await fs.mkdir(worldDir, { recursive: true });
}

/**
 * Check if world exists on disk
 */
export async function worldExists(root: string, worldId: string): Promise<boolean> {
  try {
    const worldDir = getWorldDir(root, worldId);
    const configPath = path.join(worldDir, 'config.json');
    await fs.access(configPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save world to disk
 */
export async function saveWorld(root: string, worldData: World): Promise<void> {
  await ensureWorldDirectory(root, worldData.id);

  const worldDir = getWorldDir(root, worldData.id);
  const configPath = path.join(worldDir, 'config.json');
  const mcpConfigPath = path.join(worldDir, 'mcp.json');

  // Exclude runtime properties and mcpConfig from config.json
  const {
    mcpConfig,
    eventEmitter,
    agents,
    chats,
    eventStorage,
    _eventPersistenceCleanup,
    ...configData
  } = worldData;

  // Save main config without runtime properties
  await writeJsonFile(configPath, configData);

  // Save mcpConfig to separate file if it exists
  if (mcpConfig !== undefined && mcpConfig !== null) {
    try {
      // Validate that mcpConfig is valid JSON
      const parsedConfig = JSON.parse(mcpConfig);
      await writeJsonFile(mcpConfigPath, parsedConfig);
    } catch (error) {
      // If mcpConfig is not valid JSON, save it as-is (could be a string)
      await writeJsonFile(mcpConfigPath, { config: mcpConfig });
    }
  } else {
    // Remove mcp.json if mcpConfig is null/undefined
    try {
      await fs.unlink(mcpConfigPath);
    } catch {
      // File might not exist, ignore error
    }
  }
}

/**
 * Load world from disk
 */
export async function loadWorld(root: string, worldId: string): Promise<World | null> {
  try {
    const worldDir = getWorldDir(root, worldId);
    const configPath = path.join(worldDir, 'config.json');
    const mcpConfigPath = path.join(worldDir, 'mcp.json');

    const worldData = await readJsonFile<World>(configPath);

    // Reconstruct Date objects
    if (worldData.createdAt) worldData.createdAt = new Date(worldData.createdAt);
    if (worldData.lastUpdated) worldData.lastUpdated = new Date(worldData.lastUpdated);

    // Load mcpConfig from separate file if it exists
    try {
      const mcpData = await readJsonFile<any>(mcpConfigPath);
      // If mcpData has a 'config' field, it was stored as a wrapped string
      if (mcpData && typeof mcpData === 'object' && 'config' in mcpData) {
        worldData.mcpConfig = mcpData.config;
      } else {
        // Otherwise, stringify the JSON object
        worldData.mcpConfig = JSON.stringify(mcpData);
      }
    } catch {
      // mcp.json doesn't exist or can't be read, set to null for backward compatibility
      worldData.mcpConfig = null;
    }

    return worldData;
  } catch {
    return null;
  }
}

/**
 * Delete world from disk
 */
export async function deleteWorld(root: string, worldId: string): Promise<boolean> {
  try {
    const worldDir = getWorldDir(root, worldId);
    await fs.rm(worldDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * List all worlds in root directory
 */
export async function listWorlds(root: string): Promise<World[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const worlds: World[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const worldData = await loadWorld(root, entry.name);
        if (worldData) {
          worlds.push(worldData);
        }
      }
    }

    return worlds.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
  } catch {
    return [];
  }
}

/**
 * Chat directory and file path utilities
 */
export function getChatDir(rootPath: string, worldId: string): string {
  const worldDir = getWorldDir(rootPath, worldId);
  return path.join(worldDir, 'chats');
}

export function getChatFilePath(rootPath: string, worldId: string, chatId: string): string {
  const chatDir = getChatDir(rootPath, worldId);
  return path.join(chatDir, `${chatId}.json`);
}

export async function ensureChatDirectory(rootPath: string, worldId: string): Promise<void> {
  const chatDir = getChatDir(rootPath, worldId);
  await fs.mkdir(chatDir, { recursive: true });
}

/**
 * Save chat data (metadata + content) to disk
 */
export async function saveChatData(rootPath: string, worldId: string, chatData: Chat): Promise<void> {
  await ensureChatDirectory(rootPath, worldId);

  // Save the complete ChatData object
  const chatPath = getChatFilePath(rootPath, worldId, chatData.id);
  await writeJsonFile(chatPath, chatData);
}

/**
 * Load chat data (metadata + content) from disk
 */
export async function loadChatData(rootPath: string, worldId: string, chatId: string): Promise<Chat | null> {
  try {
    const chatPath = getChatFilePath(rootPath, worldId, chatId);
    const chatData = await readJsonFile<Chat>(chatPath);

    // Reconstruct Date objects
    if (chatData.createdAt) chatData.createdAt = new Date(chatData.createdAt);
    if (chatData.updatedAt) chatData.updatedAt = new Date(chatData.updatedAt);

    return chatData;
  } catch (error) {
    logger.error('Failed to load chat data', {
      error: error instanceof Error ? error.message : String(error),
      worldId,
      chatId
    });
    return null;
  }
}

/**
 * Update chat data on disk
 */
export async function updateChatData(rootPath: string, worldId: string, chatId: string, updates: UpdateChatParams): Promise<Chat | null> {
  const chatData = await loadChatData(rootPath, worldId, chatId);
  if (!chatData) return null;

  // Apply updates to metadata
  if (updates.name !== undefined) chatData.name = updates.name;
  if (updates.description !== undefined) chatData.description = updates.description;

  // Update timestamps
  chatData.updatedAt = new Date();

  await saveChatData(rootPath, worldId, chatData);
  return chatData;
}

/**
 * Delete chat data from disk with cascade deletion of associated messages
 */
export async function deleteChatData(rootPath: string, worldId: string, chatId: string): Promise<boolean> {
  try {
    // Delete the chat file
    const chatPath = getChatFilePath(rootPath, worldId, chatId);
    await fs.unlink(chatPath);

    // Cascade delete: Remove all agent memory messages with this chatId
    await deleteMemoryByChatId(rootPath, worldId, chatId);

    return true;
  } catch {
    return false;
  }
}

/**
 * List chat histories (metadata only)
 */
export async function listChatHistories(rootPath: string, worldId: string): Promise<Chat[]> {
  try {
    const chatDir = getChatDir(rootPath, worldId);

    if (!await exists(chatDir)) {
      return [];
    }

    const files = await readdir(chatDir);
    const chatFiles = files.filter((file: string) => file.endsWith('.json'));

    const chats: Chat[] = [];

    for (const file of chatFiles) {
      const chatId = file.replace('.json', '');
      const chatData = await loadChatData(rootPath, worldId, chatId);

      if (chatData) {
        // Extract just the metadata
        const chatInfo: Chat = {
          id: chatData.id,
          worldId: worldId,
          name: chatData.name,
          description: chatData.description,
          createdAt: chatData.createdAt,
          updatedAt: chatData.updatedAt,
          messageCount: chatData.messageCount,
        };
        chats.push(chatInfo);
      }
    }

    return chats.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch (error) {
    logger.error('Failed to list chat histories', {
      error: error instanceof Error ? error.message : String(error),
      worldId
    });
    return [];
  }
}

/**
 * Get aggregated memory across all agents for a given chat
 * Filters messages by chatId and includes agentId for proper message attribution
 */
export async function getMemory(rootPath: string, worldId: string, chatId: string): Promise<AgentMessage[]> {
  try {
    const agents = await listAgents(rootPath, worldId);
    const messages: AgentMessage[] = [];

    for (const agent of agents) {
      const fullAgent = await loadAgent(rootPath, worldId, agent.id);
      const mem = fullAgent?.memory || [];
      for (const m of mem) {
        if (!chatId || m.chatId === chatId) {
          // Ensure agentId is included in the message
          const messageWithAgentId = { ...m, agentId: agent.id };
          messages.push(messageWithAgentId);
        }
      }
    }

    // Sort by createdAt ascending
    messages.sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return at - bt;
    });

    return messages;
  } catch (error) {
    logger.error('Failed to get aggregated memory', {
      error: error instanceof Error ? error.message : String(error),
      worldId,
      chatId
    });
    return [];
  }
}

/**
 * Chat messages storage path utility
 */
function getChatMessagesPath(rootPath: string, worldId: string, chatId: string): string {
  return path.join(getChatDir(rootPath, worldId), `${chatId}_messages.json`);
}

/**
 * Save a message to centralized chat messages file
 */
export async function saveChatMessage(
  rootPath: string,
  worldId: string,
  chatId: string,
  message: AgentMessage
): Promise<void> {
  if (!message.messageId) {
    throw new Error('Cannot save message without messageId');
  }

  await ensureChatDirectory(rootPath, worldId);
  const messagesPath = getChatMessagesPath(rootPath, worldId, chatId);
  
  let messages: AgentMessage[] = [];
  if (await exists(messagesPath)) {
    const data = await fs.readFile(messagesPath, 'utf-8');
    messages = JSON.parse(data);
  }
  
  // Upsert by messageId
  const existingIndex = messages.findIndex(m => m.messageId === message.messageId);
  if (existingIndex >= 0) {
    messages[existingIndex] = message;
  } else {
    messages.push(message);
    // Sort by createdAt to maintain order
    messages.sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return at - bt;
    });
  }
  
  await writeJsonFile(messagesPath, messages);
}

/**
 * Load messages from centralized chat messages file
 */
export async function getChatMessages(
  rootPath: string,
  worldId: string,
  chatId: string
): Promise<AgentMessage[]> {
  const messagesPath = getChatMessagesPath(rootPath, worldId, chatId);
  
  if (!await exists(messagesPath)) {
    return [];
  }
  
  try {
    const data = await fs.readFile(messagesPath, 'utf-8');
    const messages = JSON.parse(data) as AgentMessage[];
    
    // Reconstruct Date objects
    return messages.map(msg => ({
      ...msg,
      createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date()
    }));
  } catch (error) {
    logger.error('Failed to load chat messages', {
      error: error instanceof Error ? error.message : String(error),
      worldId,
      chatId
    });
    return [];
  }
}

/**
 * Get agent-specific view of chat messages
 */
export async function getAgentMemoryForChat(
  rootPath: string,
  worldId: string,
  agentId: string,
  chatId: string
): Promise<AgentMessage[]> {
  // Get all messages from the chat
  const allMessages = await getChatMessages(rootPath, worldId, chatId);
  
  // For now, return all messages in the chat
  // In the future, we could filter based on agent-specific logic
  return allMessages;
}

/**
 * Delete a specific message from chat
 */
export async function deleteChatMessage(
  rootPath: string,
  worldId: string,
  chatId: string,
  messageId: string
): Promise<boolean> {
  const messagesPath = getChatMessagesPath(rootPath, worldId, chatId);
  
  if (!await exists(messagesPath)) {
    return false;
  }
  
  try {
    const data = await fs.readFile(messagesPath, 'utf-8');
    let messages = JSON.parse(data) as AgentMessage[];
    
    const originalLength = messages.length;
    messages = messages.filter(m => m.messageId !== messageId);
    
    if (messages.length === originalLength) {
      return false; // Message not found
    }
    
    await writeJsonFile(messagesPath, messages);
    return true;
  } catch (error) {
    logger.error('Failed to delete chat message', {
      error: error instanceof Error ? error.message : String(error),
      worldId,
      chatId,
      messageId
    });
    return false;
  }
}

/**
 * Update a specific message in chat
 */
export async function updateChatMessage(
  rootPath: string,
  worldId: string,
  chatId: string,
  messageId: string,
  updates: Partial<AgentMessage>
): Promise<boolean> {
  const messagesPath = getChatMessagesPath(rootPath, worldId, chatId);
  
  if (!await exists(messagesPath)) {
    return false;
  }
  
  try {
    const data = await fs.readFile(messagesPath, 'utf-8');
    const messages = JSON.parse(data) as AgentMessage[];
    
    const index = messages.findIndex(m => m.messageId === messageId);
    if (index < 0) {
      return false; // Message not found
    }
    
    messages[index] = { ...messages[index], ...updates };
    
    await writeJsonFile(messagesPath, messages);
    return true;
  } catch (error) {
    logger.error('Failed to update chat message', {
      error: error instanceof Error ? error.message : String(error),
      worldId,
      chatId,
      messageId
    });
    return false;
  }
}
