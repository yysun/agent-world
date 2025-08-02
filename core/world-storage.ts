/**
 * World Storage Module - File I/O Operations for World Data and Chat Operations
 *
 * Features:
 * - World configuration persistence to config.json with flattened structure
 * - Complete chat operations with file-based storage (chats directory)
 * - Kebab-case directory naming from world names
 * - Clean separation of storage data from runtime objects
 * - Handles World serialization without EventEmitter and agents Map
 * - Complete isolation from other internal modules
 * - Explicit rootPath parameter handling (no environment variables)
 *
 * Core Functions:
 * - saveWorld: Save world config.json with flat structure (excludes eventEmitter and agents)
 * - loadWorld: Load world configuration from file
 * - deleteWorld: Remove world directory and all contents
 * - listWorlds: Scan and load all worlds in root directory
 * - worldExists: Check if world directory exists
 * - getWorldDir: Get world directory path
 * - ensureWorldDirectory: Create world directory structure
 *
 * Chat Functions:
 * - saveChatData: Save complete chat data with metadata and content
 * - loadChatData: Load complete chat data with Date reconstruction
 * - deleteChatData: Remove chat files
 * - listChatHistories: List all chat metadata for a world
 * - updateChatData: Update existing chat with partial data
 *
 * Version: 2.0.0 - Updated for new ChatData/WorldChat architecture
 * Date: 2025-08-01
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { toKebabCase } from './utils.js';
import { logger } from './logger.js';
import type { WorldChat, ChatData, CreateChatParams, UpdateChatParams } from './types.js';

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
 * Serializable world data for storage (flat structure, no EventEmitter, no agents Map)
 */
export interface WorldData {
  id: string;
  name: string;
  description?: string;
  turnLimit: number;
  chatLLMProvider?: string; // For chat summarization
  chatLLMModel?: string; // For chat summarization
  currentChatId?: string | null; // Track active chat session
  createdAt: Date;
  lastUpdated: Date;
  totalAgents: number;
  totalMessages: number;
}

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
export async function saveWorld(root: string, worldData: WorldData): Promise<void> {
  await ensureWorldDirectory(root, worldData.id);

  const worldDir = getWorldDir(root, worldData.id);
  const configPath = path.join(worldDir, 'config.json');

  await writeJsonFile(configPath, worldData);
}

/**
 * Load world from disk
 */
export async function loadWorld(root: string, worldId: string): Promise<WorldData | null> {
  try {
    const worldDir = getWorldDir(root, worldId);
    const configPath = path.join(worldDir, 'config.json');

    const worldData = await readJsonFile<WorldData>(configPath);

    // Reconstruct Date objects
    if (worldData.createdAt) worldData.createdAt = new Date(worldData.createdAt);
    if (worldData.lastUpdated) worldData.lastUpdated = new Date(worldData.lastUpdated);

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
export async function listWorlds(root: string): Promise<WorldData[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const worlds: WorldData[] = [];

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
export async function saveChatData(rootPath: string, worldId: string, chatData: ChatData): Promise<void> {
  await ensureChatDirectory(rootPath, worldId);

  // Save the complete ChatData object
  const chatPath = getChatFilePath(rootPath, worldId, chatData.id);
  await writeJsonFile(chatPath, chatData);
}

/**
 * Load chat data (metadata + content) from disk
 */
export async function loadChatData(rootPath: string, worldId: string, chatId: string): Promise<ChatData | null> {
  try {
    const chatPath = getChatFilePath(rootPath, worldId, chatId);
    const chatData = await readJsonFile<ChatData>(chatPath);

    // Reconstruct Date objects
    if (chatData.createdAt) chatData.createdAt = new Date(chatData.createdAt);
    if (chatData.updatedAt) chatData.updatedAt = new Date(chatData.updatedAt);
    if (chatData.chat?.metadata?.capturedAt) {
      chatData.chat.metadata.capturedAt = new Date(chatData.chat.metadata.capturedAt);
    }

    return chatData;
  } catch (error) {
    logger.debug('Error loading chat data:', error);
    return null;
  }
}

/**
 * Update chat data on disk
 */
export async function updateChatData(rootPath: string, worldId: string, chatId: string, updates: UpdateChatParams): Promise<ChatData | null> {
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
 * Delete chat data from disk
 */
export async function deleteChatData(rootPath: string, worldId: string, chatId: string): Promise<boolean> {
  try {
    const chatPath = getChatFilePath(rootPath, worldId, chatId);
    await fs.unlink(chatPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List chat histories (metadata only)
 */
export async function listChatHistories(rootPath: string, worldId: string): Promise<ChatData[]> {
  try {
    const chatDir = getChatDir(rootPath, worldId);

    if (!await exists(chatDir)) {
      return [];
    }

    const files = await readdir(chatDir);
    const chatFiles = files.filter((file: string) => file.endsWith('.json'));

    const chats: ChatData[] = [];

    for (const file of chatFiles) {
      const chatId = file.replace('.json', '');
      const chatData = await loadChatData(rootPath, worldId, chatId);

      if (chatData) {
        // Extract just the metadata
        const chatInfo: ChatData = {
          id: chatData.id,
          worldId: worldId,
          name: chatData.name,
          description: chatData.description,
          createdAt: chatData.createdAt,
          updatedAt: chatData.updatedAt,
          messageCount: chatData.messageCount,
          tags: chatData.tags
        };
        chats.push(chatInfo);
      }
    }

    return chats.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch (error) {
    logger.error('Error listing chat histories:', error);
    return [];
  }
}
