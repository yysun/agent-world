/**
 * Agent Storage Module - File I/O Operations for Agent Data
 *
 * Features:
 * - Agent file persistence with three-file structure (config.json, system-prompt.md, memory.json)
 * - Kebab-case directory naming from agent names
 * - Date serialization handling for AgentMessage.createdAt
 * - Atomic file operations with error handling
 * - Enhanced loading with retry mechanism and partial recovery
 * - Batch loading optimization for performance
 * - Complete isolation from other internal modules
 * - Memory archiving for data preservation before clearing
 *
 * Core Functions:
 * - saveAgentToDisk: Save agent config, system prompt, and memory to separate files
 * - saveAgentConfigToDisk: Save agent config and system prompt without memory
 * - loadAgentFromDisk: Load complete agent data from files with Date reconstruction
 * - loadAgentFromDiskWithRetry: Enhanced loading with retry mechanism
 * - loadAllAgentsFromDisk: Scan and load all agents in world directory
 * - loadAllAgentsFromDiskBatch: Optimized batch loading with parallel processing
 * - deleteAgentFromDisk: Remove agent directory and all files
 * - agentExistsOnDisk: Check if agent directory exists
 * - getAgentDir: Get agent directory path
 * - ensureAgentDirectory: Create agent directory structure
 * - validateAgentIntegrity: Check agent data consistency
 * - repairAgentData: Attempt to repair corrupted agent files
 * - archiveAgentMemory: Archive current memory before clearing
 *
 * Implementation:
 * - Extracted from world-persistence.ts functions
 * - Uses only fs/promises, path, types.ts, and utils.js
 * - Handles memory as simple AgentMessage[] array
 * - Proper Date object serialization/deserialization
 * - Enhanced error recovery and data validation
 * - Memory archiving preserves conversation history with timestamps
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { Agent, AgentMessage } from './types.js';
import { toKebabCase } from './utils.js';

/**
 * Agent loading options for enhanced control
 */
export interface AgentLoadOptions {
  includeMemory?: boolean;
  retryCount?: number;
  retryDelay?: number;
  allowPartialLoad?: boolean;
  validateIntegrity?: boolean;
}

/**
 * Agent integrity check result
 */
export interface AgentIntegrityResult {
  isValid: boolean;
  hasConfig: boolean;
  hasSystemPrompt: boolean;
  hasMemory: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Batch loading result with success and failure tracking
 */
export interface BatchLoadResult {
  successful: Agent[];
  failed: Array<{ agentId: string; error: string }>;
  totalCount: number;
  successCount: number;
  failureCount: number;
}

/**
 * Get agent directory path using kebab-case agent name
 */
export function getAgentDir(rootPath: string, worldId: string, agentId: string): string {
  return path.join(rootPath, worldId, 'agents', agentId);
}

/**
 * Ensure agent directory structure exists
 */
export async function ensureAgentDirectory(rootPath: string, worldId: string, agentId: string): Promise<void> {
  const agentDir = getAgentDir(rootPath, worldId, agentId);
  await fs.mkdir(agentDir, { recursive: true });
}

/**
 * Check if agent directory exists on disk
 */
export async function agentExists(rootPath: string, worldId: string, agentId: string): Promise<boolean> {
  try {
    const agentDir = getAgentDir(rootPath, worldId, agentId);
    const configPath = path.join(agentDir, 'config.json');
    await fs.access(configPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate agent data integrity
 */
export async function validateAgentIntegrity(rootPath: string, worldId: string, agentId: string): Promise<AgentIntegrityResult> {
  const result: AgentIntegrityResult = {
    isValid: true,
    hasConfig: false,
    hasSystemPrompt: false,
    hasMemory: false,
    errors: [],
    warnings: []
  };

  const agentDir = getAgentDir(rootPath, worldId, agentId);

  try {
    // Check config file
    const configPath = path.join(agentDir, 'config.json');
    try {
      await fs.access(configPath);
      result.hasConfig = true;

      // Validate config content
      const configData = await readJsonFile<any>(configPath);
      if (!configData.id || !configData.type || !configData.provider || !configData.model) {
        result.errors.push('Invalid config structure');
        result.isValid = false;
      }
    } catch {
      result.errors.push('Missing config.json file');
      result.isValid = false;
    }

    // Check system prompt file
    const systemPromptPath = path.join(agentDir, 'system-prompt.md');
    try {
      await fs.access(systemPromptPath);
      result.hasSystemPrompt = true;
    } catch {
      result.warnings.push('Missing system-prompt.md file');
    }

    // Check memory file
    const memoryPath = path.join(agentDir, 'memory.json');
    try {
      await fs.access(memoryPath);
      result.hasMemory = true;

      // Validate memory content
      try {
        const memoryData = await readJsonFile<AgentMessage[]>(memoryPath);
        if (!Array.isArray(memoryData)) {
          result.errors.push('Invalid memory.json structure');
          result.isValid = false;
        }
      } catch {
        result.errors.push('Corrupted memory.json file');
        result.isValid = false;
      }
    } catch {
      result.warnings.push('Missing memory.json file');
    }

  } catch (error) {
    result.errors.push(`Directory access error: ${error}`);
    result.isValid = false;
  }

  return result;
}

/**
 * Attempt to repair corrupted agent data
 */
export async function repairAgentData(rootPath: string, worldId: string, agentId: string): Promise<boolean> {
  try {
    const integrity = await validateAgentIntegrity(rootPath, worldId, agentId);
    const agentDir = getAgentDir(rootPath, worldId, agentId);

    let repaired = false;

    // Repair missing system prompt
    if (!integrity.hasSystemPrompt) {
      const systemPromptPath = path.join(agentDir, 'system-prompt.md');
      const defaultPrompt = `You are ${agentId}, an AI agent.`;
      await writeTextFile(systemPromptPath, defaultPrompt);
      repaired = true;
    }

    // Repair missing memory file
    if (!integrity.hasMemory) {
      const memoryPath = path.join(agentDir, 'memory.json');
      await writeJsonFile(memoryPath, []);
      repaired = true;
    }

    return repaired;
  } catch {
    return false;
  }
}

/**
 * Save agent to disk with three-file structure
 */
export async function saveAgent(rootPath: string, worldId: string, agent: Agent): Promise<void> {
  const agentId = toKebabCase(agent.id);
  await ensureAgentDirectory(rootPath, worldId, agentId);

  const agentDir = getAgentDir(rootPath, worldId, agentId);

  // Save system prompt as markdown file
  const systemPromptPath = path.join(agentDir, 'system-prompt.md');
  const systemPromptContent = agent.systemPrompt || `You are ${agent.id}, an AI agent.`;
  await writeTextFile(systemPromptPath, systemPromptContent);

  // Save memory as JSON with Date serialization
  const memoryPath = path.join(agentDir, 'memory.json');
  // Serialize memory, preserving new lines as \n
  const serializedMemory = (agent.memory || []).map(msg => ({
    ...msg,
    content: typeof msg.content === 'string' ? msg.content.replace(/\n/g, '\\n') : msg.content
  }));
  await writeJsonFile(memoryPath, serializedMemory);

  // Save agent data without system prompt (stored separately) and with Date serialization
  // Exclude systemPrompt and memory from config.json
  const { systemPrompt, memory, ...agentWithoutPromptAndMemory } = agent;
  const agentData = {
    ...agentWithoutPromptAndMemory,
    createdAt: agent.createdAt instanceof Date ? agent.createdAt.toISOString() : agent.createdAt,
    lastActive: agent.lastActive instanceof Date ? agent.lastActive.toISOString() : agent.lastActive,
    lastLLMCall: agent.lastLLMCall instanceof Date ? agent.lastLLMCall.toISOString() : agent.lastLLMCall
  };

  const configPath = path.join(agentDir, 'config.json');
  await writeJsonFile(configPath, agentData);
}

/**
 * Save agent configuration and system prompt to disk without memory
 * This is useful for saving agent metadata changes without including chat history
 */
export async function saveAgentConfig(rootPath: string, worldId: string, agent: Agent): Promise<void> {
  const agentId = toKebabCase(agent.id);
  await ensureAgentDirectory(rootPath, worldId, agentId);

  const agentDir = getAgentDir(rootPath, worldId, agentId);

  // Save system prompt as markdown file
  const systemPromptPath = path.join(agentDir, 'system-prompt.md');
  const systemPromptContent = agent.systemPrompt || `You are ${agent.id}, an AI agent.`;
  await writeTextFile(systemPromptPath, systemPromptContent);

  // Save agent data without system prompt and memory, with Date serialization
  const { systemPrompt, memory, ...agentWithoutPromptAndMemory } = agent;
  const agentData = {
    ...agentWithoutPromptAndMemory,
    createdAt: agent.createdAt instanceof Date ? agent.createdAt.toISOString() : agent.createdAt,
    lastActive: agent.lastActive instanceof Date ? agent.lastActive.toISOString() : agent.lastActive,
    lastLLMCall: agent.lastLLMCall instanceof Date ? agent.lastLLMCall.toISOString() : agent.lastLLMCall
  };

  const configPath = path.join(agentDir, 'config.json');
  await writeJsonFile(configPath, agentData);
}

/**
 * Save only agent memory to disk (performance optimized)
 */
export async function saveAgentMemory(
  rootPath: string,
  worldId: string,
  agentId: string,
  memory: AgentMessage[]
): Promise<void> {
  const agentDir = getAgentDir(rootPath, worldId, agentId);

  // Ensure directory exists
  await ensureAgentDirectory(rootPath, worldId, agentId);

  // Save memory as JSON with Date serialization
  const memoryPath = path.join(agentDir, 'memory.json');
  // Serialize memory, preserving new lines as \n
  const serializedMemory = (memory || []).map(msg => ({
    ...msg,
    content: typeof msg.content === 'string' ? msg.content.replace(/\n/g, '\\n') : msg.content
  }));
  await writeJsonFile(memoryPath, serializedMemory);
}

/**
 * Archive agent memory to timestamped file before clearing
 */
export async function archiveAgentMemory(
  rootPath: string,
  worldId: string,
  agentId: string,
  memory: AgentMessage[]
): Promise<void> {
  const agentDir = getAgentDir(rootPath, worldId, agentId);

  // Create archive directory if it doesn't exist
  const archiveDir = path.join(agentDir, 'archive');
  await fs.mkdir(archiveDir, { recursive: true });

  // Generate timestamp for archive filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveFilename = `memory-${timestamp}.json`;
  const archivePath = path.join(archiveDir, archiveFilename);

  // Save memory to archive file
  // Serialize memory, preserving new lines as \n
  const serializedMemory = (memory || []).map(msg => ({
    ...msg,
    content: typeof msg.content === 'string' ? msg.content.replace(/\n/g, '\\n') : msg.content
  }));
  await writeJsonFile(archivePath, serializedMemory);
}

/**
 * Enhanced agent loading with retry mechanism and partial recovery
 */
export async function loadAgentWithRetry(
  rootPath: string,
  worldId: string,
  agentId: string,
  options: AgentLoadOptions = {}
): Promise<Agent | null> {
  const {
    includeMemory = true,
    retryCount = 2,
    retryDelay = 100,
    allowPartialLoad = false,
    validateIntegrity = false
  } = options;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      // Validate integrity if requested
      if (validateIntegrity) {
        const integrity = await validateAgentIntegrity(rootPath, worldId, agentId);
        if (!integrity.isValid && !allowPartialLoad) {
          // Attempt repair on first try
          if (attempt === 0) {
            await repairAgentData(rootPath, worldId, agentId);
            continue; // Retry after repair
          }
          throw new Error(`Agent integrity check failed: ${integrity.errors.join(', ')}`);
        }
      }

      const agentDir = getAgentDir(rootPath, worldId, agentId);

      // Load config
      const configPath = path.join(agentDir, 'config.json');
      const agentData = await readJsonFile<any>(configPath);

      // Load system prompt with fallback
      const systemPromptPath = path.join(agentDir, 'system-prompt.md');
      let systemPrompt: string;
      try {
        systemPrompt = await fs.readFile(systemPromptPath, 'utf8');
      } catch {
        systemPrompt = `You are ${agentId}, an AI agent.`;
        // Create missing system prompt file if allowing partial load
        if (allowPartialLoad) {
          await writeTextFile(systemPromptPath, systemPrompt);
        }
      }

      // Load memory with fallback
      let memory: AgentMessage[] = [];
      if (includeMemory) {
        const memoryPath = path.join(agentDir, 'memory.json');
        try {
          const rawMemory = await readJsonFile<AgentMessage[]>(memoryPath);
          memory = rawMemory.map(msg => ({
            ...msg,
            content: typeof msg.content === 'string' ? msg.content.replace(/\\n/g, '\n') : msg.content,
            createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date()
          }));
        } catch {
          // Create missing memory file if allowing partial load
          if (allowPartialLoad) {
            await writeJsonFile(memoryPath, []);
          }
        }
      }

      // Reconstruct agent with Date objects and system prompt
      const agent: Agent = {
        ...agentData,
        id: agentId, // Ensure the id is always set correctly
        systemPrompt,
        memory,
        createdAt: agentData.createdAt ? new Date(agentData.createdAt) : new Date(),
        lastActive: agentData.lastActive ? new Date(agentData.lastActive) : new Date(),
        lastLLMCall: agentData.lastLLMCall ? new Date(agentData.lastLLMCall) : undefined
      };

      return agent;

    } catch (error) {
      if (attempt === retryCount) {
        // Last attempt failed
        return null;
      }

      // Wait before retry
      if (retryDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  return null;
}

/**
 * Load agent from disk with complete data reconstruction (original method)
 */
export async function loadAgent(rootPath: string, worldId: string, agentId: string): Promise<Agent | null> {
  return loadAgentWithRetry(rootPath, worldId, agentId, {
    includeMemory: true,
    retryCount: 1,
    allowPartialLoad: true,
    validateIntegrity: false
  });
}

/**
 * Optimized batch loading with parallel processing
 */
export async function loadAgentsBatch(
  rootPath: string,
  worldId: string,
  options: AgentLoadOptions = {}
): Promise<BatchLoadResult> {
  const result: BatchLoadResult = {
    successful: [],
    failed: [],
    totalCount: 0,
    successCount: 0,
    failureCount: 0
  };

  try {
    const agentsDir = path.join(rootPath, worldId, 'agents');

    const entries = await fs.readdir(agentsDir, { withFileTypes: true });
    const agentDirs = entries.filter(entry => entry.isDirectory());

    result.totalCount = agentDirs.length;

    // Load agents in parallel batches to avoid overwhelming the system
    const batchSize = 10;
    const batches: string[][] = [];

    for (let i = 0; i < agentDirs.length; i += batchSize) {
      batches.push(agentDirs.slice(i, i + batchSize).map(entry => entry.name));
    }

    for (const batch of batches) {
      const batchPromises = batch.map(async (agentId) => {
        try {
          const agent = await loadAgentWithRetry(rootPath, worldId, agentId, options);
          if (agent) {
            result.successful.push(agent);
            result.successCount++;
          } else {
            result.failed.push({ agentId, error: 'Failed to load agent data' });
            result.failureCount++;
          }
        } catch (error) {
          result.failed.push({
            agentId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          result.failureCount++;
        }
      });

      await Promise.all(batchPromises);
    }

  } catch (error) {
    // Directory doesn't exist or other filesystem error
    result.failed.push({
      agentId: 'SYSTEM',
      error: error instanceof Error ? error.message : 'Failed to access agents directory'
    });
  }

  return result;
}

/**
 * Load all agents from world directory (original method)
 */
export async function listAgents(rootPath: string, worldId: string): Promise<Agent[]> {
  const result = await loadAgentsBatch(rootPath, worldId, {
    includeMemory: true,
    allowPartialLoad: true,
    validateIntegrity: false
  });

  return result.successful;
}

/**
 * Delete agent directory and all files
 */
export async function deleteAgent(rootPath: string, worldId: string, agentId: string): Promise<boolean> {
  try {
    const agentDir = getAgentDir(rootPath, worldId, agentId);

    // Check if directory exists first
    await fs.access(agentDir);

    // If we get here, directory exists, so delete it
    await fs.rm(agentDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
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
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return `You are an AI agent.`; // Default fallback
  }
}

// Backward compatibility exports (old function names)
export const saveAgentToDisk = saveAgent;
export const saveAgentConfigToDisk = saveAgentConfig;
export const saveAgentMemoryToDisk = saveAgentMemory;
export const loadAgentFromDisk = loadAgent;
export const loadAgentFromDiskWithRetry = loadAgentWithRetry;
export const loadAllAgentsFromDiskBatch = loadAgentsBatch;
export const loadAllAgentsFromDisk = listAgents;
export const deleteAgentFromDisk = deleteAgent;
export const agentExistsOnDisk = agentExists;
