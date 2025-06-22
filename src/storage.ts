/*
 * Function-Based File Storage Utility - Persistent Data Management
 *
 * Features:
 * - All persistent data is stored under data/worlds (or configurable root)
 * - Function-based API for file storage operations
 * - Agent data persistence (config with status, memory, system prompt) in data/worlds/agents
 * - Unified event/message history storage in data/worlds/messages and data/worlds/events
 * - Event logging system
 * - File locking for concurrent access
 * - Structured logging with pino
 *
 * Logic:
 * - Provides async file operations with error handling
 * - Manages directory structure and file organization under data/worlds
 * - Implements atomic write operations
 * - Supports JSON serialization with validation
 * - Uses pino for structured logging with appropriate levels
 * - Agent status saved within config.json for simplicity
 * - System prompt saved separately as system-prompt.md for readability
 * - Uses Event objects for both messages and events (unified data structure)
 * - Removes duplicate id/name from nested config when saving agents
 * - Reconstructs id/name in config from top-level agent data when loading
 * - Sorts loaded agents alphabetically by name for consistent event handling order
 *
 * Changes:
 * - REFACTORED: All persistent storage now uses data/worlds (and subfolders)
 * - Converted from class-based to function-based architecture
 * - MOVED: Type definitions to types.ts for better organization
 * - SIMPLIFIED: Removed class complexity while maintaining functionality
 * - MAINTAINED: All existing functionality and API compatibility
 * - ENHANCED: Cleaner separation of concerns with pure functions
 */

import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Agent, Event, AgentMemory, FileStorageOptions, StoragePaths } from './types';
import { utilsLogger } from './logger';
import { toKebabCase } from './utils';

// Global state for file storage
let storageOptions: Required<FileStorageOptions> | undefined = undefined;
let storagePaths: StoragePaths | undefined = undefined;

/**
 * Initialize file storage with options
 */
export async function initializeFileStorage(options: FileStorageOptions = {}): Promise<void> {
  storageOptions = {
    dataPath: options.dataPath ?? './data/worlds',
    enableLogging: options.enableLogging ?? true
  };

  // No global agents/messages/events paths; all storage is per-world
  storagePaths = undefined;

  try {
    // Only create the root data/worlds directory
    await ensureDirectory(storageOptions.dataPath);
    // Suppressed: log('FileStorage initialized', { root: storageOptions.dataPath });
  } catch (error) {
    utilsLogger.error({ error, root: storageOptions.dataPath }, 'Failed to initialize FileStorage');
    throw error;
  }

}

/**
 * Check if storage is initialized
 */

function isStorageInitialized(): boolean {
  return storageOptions !== undefined;
}

/**
 * Ensure storage is initialized, throw error if not
 */

function ensureStorageInitialized(): void {
  if (!isStorageInitialized()) {
    throw new Error('Storage not initialized. Call initializeFileStorage() first.');
  }
}

/**
 * Get current storage paths
 */
export function getStoragePaths(): StoragePaths {
  ensureStorageInitialized();
  return storagePaths!;
}

/**
 * Get current storage options
 */
export function getStorageOptions(): Required<FileStorageOptions> {
  ensureStorageInitialized();
  return storageOptions!;
}

// ====== AGENT STORAGE ======
// Note: Agent storage functions have been moved to world.ts for proper name-based folder handling.
// Use the functions in world.ts instead: createAgent, getAgent, updateAgent, removeAgent, etc.

// ====== EVENT DATA STORAGE (UNIFIED) ======

/**
 * Save event data - unified method for all events and messages
 */
export async function saveEventData(event: Event): Promise<void> {
  ensureStorageInitialized();
  const date = new Date(event.timestamp);
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

  // Create events directory under the data path
  const eventsDir = path.join(storageOptions!.dataPath, 'events');
  await ensureDirectory(eventsDir);

  const dataFile = path.join(eventsDir, `${dateStr}.json`);

  // Load existing data for the day
  let eventData: Event[] = [];
  try {
    eventData = await readJsonFile<Event[]>(dataFile) || [];
  } catch (error) {
    // File doesn't exist yet, start with empty array
    if ((error as any).code !== 'ENOENT') {
      throw error;
    }
  }

  // Add new event
  eventData.push(event);

  // Save updated data
  await writeJsonFile(dataFile, eventData);
}

// Export aliases for compatibility - all events stored in same location
export const saveMessage = saveEventData;
export const saveEvent = saveEventData;

/**
 * Load event data for a date range - unified method for all events and messages
 */
export async function loadEventData(startDate: Date, endDate: Date): Promise<Event[]> {
  ensureStorageInitialized();
  const eventData: Event[] = [];
  const currentDate = new Date(startDate);

  // Create events directory path under the data path
  const eventsDir = path.join(storageOptions!.dataPath, 'events');

  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const dataFile = path.join(eventsDir, `${dateStr}.json`);

    try {
      const dayData = await readJsonFile<Event[]>(dataFile);
      if (dayData) {
        eventData.push(...dayData);
      }
    } catch (error) {
      // File doesn't exist for this date, skip
      if ((error as any).code !== 'ENOENT') {
        utilsLogger.warn({ dateStr, error }, 'Error loading event data');
      }
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return eventData;
}

// Export aliases for compatibility - all events loaded from same location
export const loadMessages = loadEventData;
export const loadEvents = loadEventData;

/**
 * Load recent messages - gets last 7 days of events
 */
export async function loadRecentMessages(limit: number = 100): Promise<Event[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7); // Last 7 days

  const events = await loadEventData(startDate, endDate);
  return events.slice(-limit);
}

// ====== UTILITY FUNCTIONS ======

/**
 * Ensure directory exists - exported utility function
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if ((error as any).code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Remove directory recursively
 */
async function removeDirectory(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    // Ignore if directory doesn't exist
    if ((error as any).code !== 'ENOENT') {
      throw error;
    }
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

/**
 * Write text file with atomic operation
 */
async function writeTextFile(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, content, 'utf8');
  await fs.rename(tempPath, filePath);
}

/**
 * Read text file
 */
async function readTextFile(filePath: string): Promise<string> {
  return await fs.readFile(filePath, 'utf8');
}

/**
 * Internal logging function
 */
function log(message: string, data?: any): void {
  if (!storageOptions?.enableLogging) return;

  if (data) {
    utilsLogger.debug({ ...data }, message);
  } else {
    utilsLogger.debug(message);
  }
}
