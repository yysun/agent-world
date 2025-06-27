/**
 * World and Agent Persistence Module
 *
 * Features:
 * - World configuration save/load operations
 * - Agent data save/load operations with kebab-case directory structure
 * - Agent memory management with separate file storage
 * - System prompt file management
 * - Persistent storage with JSON file format
 * - Error handling and rollback support
 *
 * Core Functions:
 * - World persistence: saveWorldToDisk, loadWorldFromDisk
 * - Agent persistence: saveAgentToDisk, loadAgentFromDisk
 * - Memory management: saveAgentMemory, loadAgentMemory
 * - System prompt: loadSystemPrompt, loadSystemPromptDirect
 * - Directory management: getWorldDir, getAgentPath, findWorldDir
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  Agent,
  AgentMemory,
  WorldState
} from './types';
import { getStorageOptions, ensureDirectory } from './storage';
import { toKebabCase } from './utils';

// ===== DIRECTORY HELPERS =====

/**
 * Get data directory from storage configuration
 */
export function getWorldsDir(): string {
  try {
    const storageOptions = getStorageOptions();
    return storageOptions.dataPath;
  } catch {
    // Fallback to default if storage not initialized
    return path.join(process.cwd(), 'data', 'worlds');
  }
}

/**
 * Get world directory path using kebab-case of world name
 */
export function getWorldDir(worldName: string): string {
  const worldsDir = getWorldsDir();
  return path.join(worldsDir, toKebabCase(worldName));
}

/**
 * Find the actual world directory by checking world name
 */
export async function findWorldDir(worldName: string): Promise<string | null> {
  const worldsDir = getWorldsDir();
  const expectedDir = path.join(worldsDir, toKebabCase(worldName));

  try {
    const configPath = path.join(expectedDir, 'config.json');
    await fs.access(configPath);
    const configData = await fs.readFile(configPath, 'utf-8');
    const worldConfig = JSON.parse(configData);
    if (worldConfig.name === worldName) {
      return expectedDir;
    }
  } catch (error) {
    // Directory or config doesn't exist
  }

  return null;
}

/**
 * Get world config file path
 */
export function getWorldConfigPath(worldName: string): string {
  return path.join(getWorldDir(worldName), 'config.json');
}

/**
 * Get agents directory path
 */
export function getAgentsDir(worldName: string): string {
  return path.join(getWorldDir(worldName), 'agents');
}

/**
 * Get agent file path using kebab-case agent name
 */
export function getAgentPath(worldName: string, agentName: string): string {
  return path.join(getAgentsDir(worldName), toKebabCase(agentName), 'config.json');
}

/**
 * Ensure data directories exist
 */
export async function ensureDataDirectories(): Promise<void> {
  const worldsDir = getWorldsDir();
  await ensureDirectory(worldsDir);
}

// ===== WORLD PERSISTENCE =====

/**
 * Save world configuration and agents to disk
 */
export async function saveWorldToDisk(worldName: string, worldState: WorldState): Promise<void> {
  const worldDir = getWorldDir(worldName);
  const agentsDir = getAgentsDir(worldName);

  // Ensure directories exist
  await ensureDirectory(worldDir);
  await ensureDirectory(agentsDir);

  // Save world config (without agents)
  const worldConfig = {
    name: worldState.name
  };

  await fs.writeFile(
    getWorldConfigPath(worldName),
    JSON.stringify(worldConfig, null, 2)
  );

  // Save each agent separately
  for (const [agentName, agent] of worldState.agents) {
    await saveAgentToDisk(worldName, agent);
  }
}

/**
 * Load world configuration and agents from disk
 */
export async function loadWorldFromDisk(worldName: string): Promise<WorldState> {
  // Find the actual world directory
  const actualWorldDir = await findWorldDir(worldName);
  if (!actualWorldDir) {
    throw new Error(`World directory not found for ${worldName}`);
  }

  const worldConfigPath = path.join(actualWorldDir, 'config.json');
  const agentsDir = path.join(actualWorldDir, 'agents');

  try {
    // Load world config
    const configData = await fs.readFile(worldConfigPath, 'utf-8');
    const worldConfig = JSON.parse(configData);

    // Create world state
    const worldState: WorldState = {
      name: worldConfig.name,
      agents: new Map()
    };

    // Find all config.json files in agent subdirectories (kebab-case folders)
    async function findAgentConfigs(dir: string): Promise<string[]> {
      let results: string[] = [];
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const configPath = path.join(dir, entry.name, 'config.json');
            try {
              await fs.access(configPath);
              results.push(configPath);
            } catch (err) {
              // config.json doesn't exist in this directory, skip
            }
          }
        }
      } catch (err) {
        // Directory may not exist or be empty
      }
      return results;
    }

    try {
      const configFiles = await findAgentConfigs(agentsDir);
      for (const agentPath of configFiles) {
        const agentData = await fs.readFile(agentPath, 'utf-8');
        const agent = JSON.parse(agentData);
        // Restore Date objects
        if (agent.createdAt) agent.createdAt = new Date(agent.createdAt);
        if (agent.lastActive) agent.lastActive = new Date(agent.lastActive);
        if (agent.lastLLMCall) agent.lastLLMCall = new Date(agent.lastLLMCall);

        // Add backward compatibility for new fields
        if (agent.llmCallCount === undefined) agent.llmCallCount = 0;
        if (agent.lastLLMCall === undefined) agent.lastLLMCall = undefined;

        // Remove deprecated metadata field if it exists
        if (agent.metadata !== undefined) {
          delete agent.metadata;
        }

        // Restore name and type to config for backwards compatibility (they are stored at top level)
        if (!agent.config.name) agent.config.name = agent.name;
        if (!agent.config.type) agent.config.type = agent.type;

        // Load system prompt from separate file and add it to config
        const systemPrompt = await loadSystemPromptDirect(actualWorldDir, agent.name);
        agent.config.systemPrompt = systemPrompt;

        // Load memory from separate file (but don't add to agent object to keep it clean)
        // Memory will be loaded on-demand when needed for LLM context

        worldState.agents.set(agent.name, agent);
      }
    } catch (error) {
      // Agents directory doesn't exist or is empty
    }

    return worldState;
  } catch (error) {
    throw new Error(`Failed to load world ${worldName}: ${error}`);
  }
}

/**
 * List all worlds from disk
 */
export async function listWorldsFromDisk(): Promise<string[]> {
  try {
    await ensureDataDirectories();
    const worldsDir = getWorldsDir();
    const worldDirs = await fs.readdir(worldsDir);

    // Filter to only include directories with valid config files
    const validWorldNames: string[] = [];

    for (const worldDir of worldDirs) {
      try {
        const configPath = path.join(worldsDir, worldDir, 'config.json');
        await fs.access(configPath);
        // Read the config to get the world name
        const configData = await fs.readFile(configPath, 'utf-8');
        const worldConfig = JSON.parse(configData);
        validWorldNames.push(worldConfig.name);
      } catch (error) {
        // Skip invalid world directories
      }
    }

    return validWorldNames;
  } catch (error) {
    return [];
  }
}

// ===== AGENT PERSISTENCE =====

/**
 * Save a single agent to disk
 */
export async function saveAgentToDisk(worldName: string, agent: Agent): Promise<void> {
  const agentDir = path.join(getAgentsDir(worldName), toKebabCase(agent.name));
  await ensureDirectory(agentDir);

  // Save system prompt separately as markdown file
  const systemPromptPath = path.join(agentDir, 'system-prompt.md');
  const systemPromptContent = agent.config.systemPrompt || `You are ${agent.name}, an AI agent.`;
  await fs.writeFile(systemPromptPath, systemPromptContent, 'utf8');

  // Save config without system prompt content and remove duplicate name/type fields
  const { systemPrompt, name, type, ...configWithoutDuplicates } = agent.config;
  const agentData = {
    ...agent,
    config: configWithoutDuplicates,
    createdAt: agent.createdAt?.toISOString(),
    lastActive: agent.lastActive?.toISOString()
  };

  await fs.writeFile(
    getAgentPath(worldName, agent.name),
    JSON.stringify(agentData, null, 2)
  );
}

// ===== SYSTEM PROMPT MANAGEMENT =====

/**
 * Load system prompt from file using direct world directory path
 */
export async function loadSystemPromptDirect(worldDir: string, agentName: string): Promise<string> {
  const agentDir = path.join(worldDir, 'agents', toKebabCase(agentName));
  const systemPromptPath = path.join(agentDir, 'system-prompt.md');

  try {
    return await fs.readFile(systemPromptPath, 'utf8');
  } catch (error) {
    // Return default if file doesn't exist
    return `You are ${agentName}, an AI agent.`;
  }
}

/**
 * Load system prompt from file
 */
export async function loadSystemPrompt(worldName: string, agentName: string): Promise<string> {
  const agentDir = path.join(getAgentsDir(worldName), toKebabCase(agentName));
  const systemPromptPath = path.join(agentDir, 'system-prompt.md');

  try {
    return await fs.readFile(systemPromptPath, 'utf8');
  } catch (error) {
    // Return default if file doesn't exist
    return `You are ${agentName}, an AI agent.`;
  }
}

// ===== AGENT MEMORY MANAGEMENT =====

/**
 * Save agent memory to separate file
 */
export async function saveAgentMemory(worldName: string, agentName: string, memory: any): Promise<void> {
  const agentDir = path.join(getAgentsDir(worldName), toKebabCase(agentName));
  await ensureDirectory(agentDir);

  const memoryPath = path.join(agentDir, 'memory.json');
  await fs.writeFile(memoryPath, JSON.stringify(memory, null, 2), 'utf8');
}

/**
 * Load agent memory from file - uses LLM-compatible schema
 */
export async function loadAgentMemory(worldName: string, agentName: string): Promise<AgentMemory> {
  const agentDir = path.join(getAgentsDir(worldName), toKebabCase(agentName));
  const memoryPath = path.join(agentDir, 'memory.json');

  try {
    const memoryData = await fs.readFile(memoryPath, 'utf8');
    const memory = JSON.parse(memoryData);

    // Convert createdAt strings back to Date objects for AI SDK compatibility
    if (memory.messages) {
      memory.messages = memory.messages.map((msg: any) => ({
        ...msg,
        createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date()
      }));
    }

    return memory;
  } catch (error) {
    // Return new LLM-compatible default memory structure
    return {
      messages: [],
      lastActivity: new Date().toISOString()
    };
  }
}
