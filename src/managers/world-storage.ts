/**
 * World Storage Module - File I/O Operations for World Data
 *
 * Features:
 * - World configuration persistence to config.json
 * - Kebab-case directory naming from world names
 * - Clean separation of storage data from runtime objects
 * - Handles World serialization without EventEmitter and agents Map
 * - Complete isolation from other internal modules
 *
 * Core Functions:
 * - saveWorldToDisk: Save world config.json (excludes eventEmitter and agents)
 * - loadWorldFromDisk: Load world configuration from file
 * - deleteWorldFromDisk: Remove world directory and all contents
 * - loadAllWorldsFromDisk: Scan and load all worlds in root directory
 * - worldExistsOnDisk: Check if world directory exists
 * - getWorldDir: Get world directory path
 * - ensureWorldDirectory: Create world directory structure
 *
 * Implementation:
 * - Extracted from world-persistence.ts functions
 * - Uses only fs/promises, path, types.ts, and utils.ts
 * - Storage layer works with plain WorldData (no EventEmitter)
 * - Manager layer handles EventEmitter reconstruction
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { WorldConfig } from '../types.js';
import { toKebabCase } from '../utils.js';

/**
 * Serializable world data for storage (no EventEmitter, no agents Map)
 */
export interface WorldData {
  id: string;
  config: WorldConfig;
}

/**
 * Get root directory from environment variable or default
 */
function getRootDirectory(): string {
  return process.env.AGENT_WORLD_DATA_PATH || './data/worlds';
}

/**
 * Get world directory path using kebab-case world name
 */
export function getWorldDir(root: string, worldId: string): string {
  return path.join(root, worldId);
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
export async function worldExistsOnDisk(root: string, worldId: string): Promise<boolean> {
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
export async function saveWorldToDisk(root: string, worldData: WorldData): Promise<void> {
  const worldId = toKebabCase(worldData.id);
  await ensureWorldDirectory(root, worldId);

  const worldDir = getWorldDir(root, worldId);
  const configPath = path.join(worldDir, 'config.json');

  // Save only serializable world data
  const configData = {
    name: worldData.config.name,
    description: worldData.config.description,
    turnLimit: worldData.config.turnLimit || 5
  };

  await writeJsonFile(configPath, configData);
}

/**
 * Load world configuration from disk
 */
export async function loadWorldFromDisk(root: string, worldId: string): Promise<WorldData | null> {
  try {
    const worldDir = getWorldDir(root, worldId);
    const configPath = path.join(worldDir, 'config.json');

    const configData = await readJsonFile<any>(configPath);

    const worldData: WorldData = {
      id: configData.name,
      config: {
        name: configData.name,
        description: configData.description,
        turnLimit: configData.turnLimit || 5
      }
    };

    return worldData;
  } catch {
    return null;
  }
}

/**
 * Delete world directory and all contents
 */
export async function deleteWorldFromDisk(root: string, worldId: string): Promise<boolean> {
  try {
    const worldDir = getWorldDir(root, worldId);
    await fs.rm(worldDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Load all worlds from root directory
 */
export async function loadAllWorldsFromDisk(root: string): Promise<WorldData[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const worlds: WorldData[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const worldData = await loadWorldFromDisk(root, entry.name);
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
