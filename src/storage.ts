/*
 * Function-Based File Storage Utility - Persistent Data Management
 * 
 * Features:
 * - Function-based API for file storage operations
 * - Agent data persistence (config with status, memory, system prompt)
 * - Unified event/message history storage
 * - Event logging system
 * - File locking for concurrent access
 * - Structured logging with pino
 * 
 * Logic:
 * - Provides async file operations with error handling
 * - Manages directory structure and file organization
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
 * - REFACTORED: Converted from class-based to function-based architecture
 * - MOVED: Type definitions to types.ts for better organization
 * - SIMPLIFIED: Removed class complexity while maintaining functionality
 * - MAINTAINED: All existing functionality and API compatibility
 * - ENHANCED: Cleaner separation of concerns with pure functions
 */

import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Agent, Event, AgentMemory, FileStorageOptions, StoragePaths, StorageType } from './types';
import { utilsLogger } from './logger';

// Global state for file storage
let storageOptions: Required<FileStorageOptions>;
let storagePaths: StoragePaths;
let fileLocks: Set<string> = new Set();

/**
 * Initialize file storage with options
 */
export async function initializeFileStorage(options: FileStorageOptions = {}): Promise<void> {
  storageOptions = {
    dataPath: options.dataPath ?? './data',
    enableLogging: options.enableLogging ?? true
  };

  // Set up storage paths
  storagePaths = {
    agents: path.join(storageOptions.dataPath, 'agents'),
    messages: path.join(storageOptions.dataPath, 'world', 'messages'),
    events: path.join(storageOptions.dataPath, 'world', 'events')
  };

  try {
    // Create all necessary directories
    await ensureDirectory(storageOptions.dataPath);
    await ensureDirectory(storagePaths.agents);
    await ensureDirectory(storagePaths.messages);
    await ensureDirectory(storagePaths.events);

    // Suppressed: log('FileStorage initialized', { paths: storagePaths });

  } catch (error) {
    utilsLogger.error({ error, paths: storagePaths }, 'Failed to initialize FileStorage');
    throw error;
  }
}

/**
 * Get current storage paths
 */
export function getStoragePaths(): StoragePaths {
  return storagePaths;
}

/**
 * Get current storage options
 */
export function getStorageOptions(): Required<FileStorageOptions> {
  return storageOptions;
}

// ====== AGENT STORAGE ======

/**
 * Save agent configuration and status
 */
export async function saveAgent(agent: Agent): Promise<void> {
  const agentDir = path.join(storagePaths.agents, agent.id);
  await ensureDirectory(agentDir);

  // Save system prompt to separate markdown file
  const systemPromptPath = path.join(agentDir, 'system-prompt.md');
  await writeTextFile(systemPromptPath, agent.config.instructions || 'You are a helpful AI assistant.');

  // Save agent config (without system prompt and without duplicated id/name) with status included
  const configPath = path.join(agentDir, 'config.json');
  const { instructions, ...configWithoutPrompt } = agent.config;
  const agentWithoutPrompt = {
    ...agent,
    config: configWithoutPrompt
  };
  await writeJsonFile(configPath, agentWithoutPrompt);

  utilsLogger.info({ agentId: agent.id, agentName: agent.name }, 'Agent saved to storage');
}

/**
 * Load agent configuration
 */
export async function loadAgent(agentId: string): Promise<Agent | null> {
  try {
    const configPath = path.join(storagePaths.agents, agentId, 'config.json');
    const systemPromptPath = path.join(storagePaths.agents, agentId, 'system-prompt.md');

    const agentConfig = await readJsonFile<Agent>(configPath);
    let instructions: string;

    try {
      instructions = await readTextFile(systemPromptPath);
    } catch (promptError) {
      if ((promptError as any).code === 'ENOENT') {
        utilsLogger.warn({ agentId }, 'system-prompt.md not found for agent, using default');
        instructions = 'You are a helpful AI assistant.';
      } else {
        throw promptError;
      }
    }

    // Merge system prompt and id/name back into config
    return {
      ...agentConfig,
      config: {
        ...agentConfig.config,
        instructions: instructions
      }
    };
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      return null;
    }
    log(`Error loading agent ${agentId}:`, error);
    throw error;
  }
}

/**
 * Load all agents
 */
export async function loadAllAgents(): Promise<Agent[]> {
  try {
    const agentDirs = await fs.readdir(storagePaths.agents);
    const agents: Agent[] = [];

    for (const agentId of agentDirs) {
      const agent = await loadAgent(agentId);
      if (agent) {
        agents.push(agent);
      }
    }

    // Sort agents alphabetically by name to ensure consistent event handling order
    agents.sort((a, b) => a.name.localeCompare(b.name));

    return agents;
  } catch (error) {
    utilsLogger.error({ error }, 'Failed to load agents');
    return [];
  }
}

/**
 * Delete agent data
 */
export async function deleteAgent(agentId: string): Promise<void> {
  const agentDir = path.join(storagePaths.agents, agentId);
  await removeDirectory(agentDir);
  utilsLogger.info({ agentId }, 'Agent deleted from storage');
}

/**
 * Save agent memory
 */
export async function saveAgentMemory(agentId: string, memory: AgentMemory): Promise<void> {
  const agentDir = path.join(storagePaths.agents, agentId);
  await fs.mkdir(agentDir, { recursive: true });
  const memoryPath = path.join(agentDir, 'memory.json');
  await writeJsonFile(memoryPath, memory);
}

/**
 * Load agent memory
 */
export async function loadAgentMemory(agentId: string): Promise<AgentMemory | null> {
  try {
    const memoryPath = path.join(storagePaths.agents, agentId, 'memory.json');
    return await readJsonFile<AgentMemory>(memoryPath);
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

// ====== EVENT DATA STORAGE (UNIFIED) ======

/**
 * Save event data (messages, events, etc.) - unified method
 */
export async function saveEventData(event: Event, storageType: StorageType = 'events'): Promise<void> {
  const date = new Date(event.timestamp);
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const targetPath = storageType === 'messages' ? storagePaths.messages : storagePaths.events;
  const dataFile = path.join(targetPath, `${dateStr}.json`);

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

/**
 * Save message to history (compatibility wrapper)
 */
export async function saveMessage(message: Event): Promise<void> {
  return saveEventData(message, 'messages');
}

/**
 * Save event to log (compatibility wrapper)
 */
export async function saveEvent(event: Event): Promise<void> {
  return saveEventData(event, 'events');
}

/**
 * Load event data for a date range (messages, events, etc.) - unified method
 */
export async function loadEventData(startDate: Date, endDate: Date, storageType: StorageType = 'events'): Promise<Event[]> {
  const eventData: Event[] = [];
  const currentDate = new Date(startDate);
  const targetPath = storageType === 'messages' ? storagePaths.messages : storagePaths.events;

  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const dataFile = path.join(targetPath, `${dateStr}.json`);

    try {
      const dayData = await readJsonFile<Event[]>(dataFile);
      if (dayData) {
        eventData.push(...dayData);
      }
    } catch (error) {
      // File doesn't exist for this date, skip
      if ((error as any).code !== 'ENOENT') {
        utilsLogger.warn({ storageType, dateStr, error }, 'Error loading event data');
      }
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return eventData;
}

/**
 * Load messages for a date range (compatibility wrapper)
 */
export async function loadMessages(startDate: Date, endDate: Date): Promise<Event[]> {
  return loadEventData(startDate, endDate, 'messages');
}

/**
 * Load events for a date range (compatibility wrapper)
 */
export async function loadEvents(startDate: Date, endDate: Date): Promise<Event[]> {
  return loadEventData(startDate, endDate, 'events');
}

/**
 * Load recent messages
 */
export async function loadRecentMessages(limit: number = 100): Promise<Event[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7); // Last 7 days

  const messages = await loadMessages(startDate, endDate);
  return messages.slice(-limit);
}

// ====== UTILITY FUNCTIONS ======

/**
 * Ensure directory exists
 */
async function ensureDirectory(dirPath: string): Promise<void> {
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
  const lockKey = filePath;

  // Wait for any existing lock
  while (fileLocks.has(lockKey)) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  fileLocks.add(lockKey);

  try {
    const tempPath = `${filePath}.tmp`;
    const jsonData = JSON.stringify(data, null, 2);

    await fs.writeFile(tempPath, jsonData, 'utf8');
    await fs.rename(tempPath, filePath);

  } finally {
    fileLocks.delete(lockKey);
  }
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
  const lockKey = filePath;

  // Wait for any existing lock
  while (fileLocks.has(lockKey)) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  fileLocks.add(lockKey);

  try {
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, content, 'utf8');
    await fs.rename(tempPath, filePath);

  } finally {
    fileLocks.delete(lockKey);
  }
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
  if (!storageOptions.enableLogging) return;

  if (data) {
    utilsLogger.debug({ ...data }, message);
  } else {
    utilsLogger.debug(message);
  }
}
