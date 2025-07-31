/**
 * World Storage Module - File I/O Operations for World Data
 *
 * Features:
 * - World configuration persistence to config.json with flattened structure
 * - Kebab-case directory naming from world names
 * - Clean separation of storage data from runtime objects
 * - Handles World serialization without EventEmitter and agents Map
 * - Complete isolation from other internal modules
 * - Explicit rootPath parameter handling (no environment variables)
 *
 * Core Functions:
 * - saveWorldToDisk: Save world config.json with flat structure (excludes eventEmitter and agents)
 * - loadWorldFromDisk: Load world configuration from file
 * - deleteWorldFromDisk: Remove world directory and all contents
 * - loadAllWorldsFromDisk: Scan and load all worlds in root directory
 * - worldExistsOnDisk: Check if world directory exists
 * - getWorldDir: Get world directory path
 * - ensureWorldDirectory: Create world directory structure
 *
 * Implementation:
 * - All functions now require explicit rootPath parameter
 * - No environment variable dependencies (AGENT_WORLD_DATA_PATH removed)
 * - Uses only fs/promises, path, types.ts, and utils.ts
 * - Storage layer works with plain WorldData using flat structure
 * - Manager layer handles EventEmitter reconstruction
 * - Internal-only module (not for direct external import)
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { toKebabCase } from './utils.js';

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
}

/**
 * Get world directory path using kebab-case world name
 */
export function getWorldDir(rootPath: string, worldId: string): string {
  return path.join(rootPath, worldId);
}

/**
 * Ensure world directory structure exists
 */
export async function ensureWorldDirectory(root: string, worldId: string): Promise<void> {
  const worldDir = getWorldDir(root, worldId);
  const agentsDir = path.join(worldDir, 'agents');
  await fs.mkdir(agentsDir, { recursive: true });
}

/**
 * Check if world directory exists on disk
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
 * Save world configuration to disk (excludes eventEmitter and agents)
 */
export async function saveWorld(root: string, worldData: WorldData): Promise<void> {
  const worldId = toKebabCase(worldData.id);
  await ensureWorldDirectory(root, worldId);

  const worldDir = getWorldDir(root, worldId);
  const configPath = path.join(worldDir, 'config.json');

  // Save flat world data structure
  const configData = {
    id: worldData.id,
    name: worldData.name,
    description: worldData.description,
    turnLimit: worldData.turnLimit
  };

  await writeJsonFile(configPath, configData);
}

/**
 * Load world configuration from disk
 */
export async function loadWorld(root: string, worldId: string): Promise<WorldData | null> {
  try {
    const worldDir = getWorldDir(root, worldId);
    const configPath = path.join(worldDir, 'config.json');
    const configData = await readJsonFile<any>(configPath);
    // Validate required fields
    if (!configData || !configData.id && !configData.name || !configData.name || typeof configData.turnLimit === 'undefined') {
      return null;
    }
    const worldData: WorldData = {
      id: configData.id || configData.name, // Support migration from old format
      name: configData.name,
      description: configData.description,
      turnLimit: configData.turnLimit || 5
    };
    return worldData;
  } catch {
    return null;
  }
}

/**
 * Delete world directory and all contents
 */
export async function deleteWorld(root: string, worldId: string): Promise<boolean> {
  try {
    const worldDir = getWorldDir(root, worldId);

    // Check if directory exists first
    await fs.access(worldDir);

    // If we get here, directory exists, so delete it
    await fs.rm(worldDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Load all worlds from root directory
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

    return worlds;
  } catch {
    return [];
  }
}

/**
 * Write JSON file with atomic operation
 */
async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  const jsonData = JSON.stringify(data, null, 2);
  await fs.writeFile(tempPath, jsonData, 'utf8');
  await fs.rename(tempPath, filePath);
}

/**
 * Read JSON file
 */
async function readJsonFile<T>(filePath: string): Promise<T> {
  const data = await fs.readFile(filePath, 'utf8');
  return JSON.parse(data) as T;
}

// Backward compatibility exports (old function names)
export const saveWorldToDisk = saveWorld;
export const loadWorldFromDisk = loadWorld;
export const deleteWorldFromDisk = deleteWorld;
export const loadAllWorldsFromDisk = listWorlds;
export const worldExistsOnDisk = worldExists;
