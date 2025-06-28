/**
 * Agent Storage Module - File I/O Operations for Agent Data
 *
 * Features:
 * - Agent file persistence with three-file structure (config.json, system-prompt.md, memory.json)
 * - Kebab-case directory naming from agent names
 * - Date serialization handling for AgentMessage.createdAt
 * - Atomic file operations with error handling
 * - Complete isolation from other internal modules
 *
 * Core Functions:
 * - saveAgentToDisk: Save agent config, system prompt, and memory to separate files
 * - loadAgentFromDisk: Load complete agent data from files with Date reconstruction
 * - deleteAgentFromDisk: Remove agent directory and all files
 * - loadAllAgentsFromDisk: Scan and load all agents in world directory
 * - agentExistsOnDisk: Check if agent directory exists
 * - getAgentDir: Get agent directory path
 * - ensureAgentDirectory: Create agent directory structure
 *
 * Implementation:
 * - Extracted from world-persistence.ts functions
 * - Uses only fs/promises, path, types.ts, and utils.ts
 * - Handles memory as simple AgentMessage[] array
 * - Proper Date object serialization/deserialization
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { Agent, AgentMessage } from '../types.js';
import { toKebabCase } from '../utils.js';

/**
 * Get root directory from environment variable or default
 */
function getRootDirectory(): string {
  return process.env.AGENT_WORLD_DATA_PATH || './data/worlds';
}

/**
 * Get agent directory path using kebab-case agent name
 */
export function getAgentDir(worldId: string, agentId: string): string {
  const root = getRootDirectory();
  return path.join(root, worldId, 'agents', agentId);
}

/**
 * Ensure agent directory structure exists
 */
export async function ensureAgentDirectory(worldId: string, agentId: string): Promise<void> {
  const agentDir = getAgentDir(worldId, agentId);
  await fs.mkdir(agentDir, { recursive: true });
}

/**
 * Check if agent directory exists on disk
 */
export async function agentExistsOnDisk(worldId: string, agentId: string): Promise<boolean> {
  try {
    const agentDir = getAgentDir(worldId, agentId);
    const configPath = path.join(agentDir, 'config.json');
    await fs.access(configPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save agent to disk with three-file structure
 */
export async function saveAgentToDisk(worldId: string, agent: Agent): Promise<void> {
  const agentId = toKebabCase(agent.id);
  await ensureAgentDirectory(worldId, agentId);

  const agentDir = getAgentDir(worldId, agentId);

  // Save system prompt as markdown file
  const systemPromptPath = path.join(agentDir, 'system-prompt.md');
  const systemPromptContent = agent.config.systemPrompt || `You are ${agent.id}, an AI agent.`;
  await writeTextFile(systemPromptPath, systemPromptContent);

  // Save memory as JSON with Date serialization
  const memoryPath = path.join(agentDir, 'memory.json');
  await writeJsonFile(memoryPath, agent.memory || []);

  // Save config without system prompt (stored separately) and with Date serialization
  const { systemPrompt, ...configWithoutPrompt } = agent.config;
  const agentData = {
    ...agent,
    config: configWithoutPrompt,
    createdAt: agent.createdAt?.toISOString(),
    lastActive: agent.lastActive?.toISOString(),
    lastLLMCall: agent.lastLLMCall?.toISOString()
  };

  const configPath = path.join(agentDir, 'config.json');
  await writeJsonFile(configPath, agentData);
}

/**
 * Load agent from disk with complete data reconstruction
 */
export async function loadAgentFromDisk(worldId: string, agentId: string): Promise<Agent | null> {
  try {
    const agentDir = getAgentDir(worldId, agentId);

    // Load config
    const configPath = path.join(agentDir, 'config.json');
    const agentData = await readJsonFile<any>(configPath);

    // Load system prompt
    const systemPromptPath = path.join(agentDir, 'system-prompt.md');
    const systemPrompt = await readTextFile(systemPromptPath);

    // Load memory with Date reconstruction
    const memoryPath = path.join(agentDir, 'memory.json');
    const memory = await readJsonFile<AgentMessage[]>(memoryPath);
    const reconstructedMemory = memory.map(msg => ({
      ...msg,
      createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date()
    }));

    // Reconstruct agent with Date objects and system prompt
    const agent: Agent = {
      ...agentData,
      config: {
        ...agentData.config,
        systemPrompt
      },
      memory: reconstructedMemory,
      createdAt: agentData.createdAt ? new Date(agentData.createdAt) : new Date(),
      lastActive: agentData.lastActive ? new Date(agentData.lastActive) : new Date(),
      lastLLMCall: agentData.lastLLMCall ? new Date(agentData.lastLLMCall) : undefined
    };

    return agent;
  } catch (error) {
    return null;
  }
}

/**
 * Delete agent directory and all files
 */
export async function deleteAgentFromDisk(worldId: string, agentId: string): Promise<boolean> {
  try {
    const agentDir = getAgentDir(worldId, agentId);
    await fs.rm(agentDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Load all agents from world directory
 */
export async function loadAllAgentsFromDisk(worldId: string): Promise<Agent[]> {
  try {
    const root = getRootDirectory();
    const agentsDir = path.join(root, worldId, 'agents');

    const entries = await fs.readdir(agentsDir, { withFileTypes: true });
    const agents: Agent[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const agent = await loadAgentFromDisk(worldId, entry.name);
        if (agent) {
          agents.push(agent);
        }
      }
    }

    return agents;
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
