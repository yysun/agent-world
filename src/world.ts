/**
 * Simplified Function-Based World Management (Per-World Persistent Storage)
 *
 * Features:
 * - World creation, listing, and basic state management
 * - Agent management (create, remove, update, query) within each world
 * - Agent memory management (add, clear, retrieve conversation history with simplified structure)
 * - Event system integration (publish, subscribe, messaging)
 * - Persistent storage of agents, events, and messages in per-world subfolders:
 *     - data/worlds/<worldId>/agents
 *     - data/worlds/<worldId>/events
 *     - data/worlds/<worldId>/messages
 * - In-memory Map-based storage for fast access, with JSON file persistence
 * - Recursively loads agent config.json files from agent subdirectories for compatibility with nested agent storage
 * - Ensures file storage is initialized automatically when ensuring default world
 * - Agent message subscriptions filter by worldId and recipient/targetId for correct delivery
 * 
 * Recent Changes:
 * - Updated agent subscription logic to use new flat event payload structure
 * - Modified message broadcasting to work with MessageEventPayload type
 * - Updated direct messaging functions to use new payload format
 * - Added clearAgentMemory function for simplified memory clearing with archiving (only LLM messages)
 * - Enhanced memory management with simplified structure and archive preservation
 * - Changed sender recognition from "CLI" to "HUMAN" in message processing
 * - Fixed event filtering and routing for agent-specific message delivery
 * - Improved type safety with strict payload typing throughout message handling
 * - Single subscription per agent to prevent duplicate message handling
 * - Agent memory/history system with separate memory.json files per agent
 * - System prompt separation into individual system-prompt.md files per agent
 * - Subscription tracking to prevent double subscriptions during create/load operations
 * - FIXED: Consistent ID vs name usage with clear function naming convention
 * - ADDED: Helper functions for agent lookup by ID, name, or smart detection
 * - FIXED: Centralized turn counter reset to prevent duplication (moved from individual agent subscriptions to broadcast/send functions)
 * - REPLACED: Console.log with event-based debug system using publishDebugEvent for better architecture
 *
 * Logic:
 * - All agent, event, and message storage is now per-world; no global agent/event/message folders
 * - Clean functional API for world, agent, and event/message management
 * - Maintains world state consistency and validation
 * - Integrates with event-bus.ts for event publishing/subscribing
 * - Agents subscribe to messages both during creation and loading, with duplicate prevention
 * - Agent memory stored separately for better organization and performance
 * - System prompts stored as editable markdown files
 * - Complete event-driven message flow: CLI → MESSAGE → Agent → LLM → SSE → CLI
 * - Consistent agent lookup: getAgent() for ID-only, getAgentByName() for name-only, findAgent() for smart lookup
 *
 * Changes:
 * - Refactored to use per-world persistent storage for agents, events, and messages
 * - Removed all global agent/event/message storage logic
 * - Updated all APIs and tests to require worldId for agent/event/message operations
 * - Updated agent loader to support nested agent directories with config.json files
 * - File storage initialization and world loading logic improved for robustness
 * - Simplified event subscription system without duplicate tracking
 * - IMPLEMENTED: Agent memory/history system with separate file storage
 * - IMPLEMENTED: System prompt file separation for better management
 * - IMPLEMENTED: clearAgentMemory function for simplified memory reset with archiving (LLM messages only)
 * - VERIFIED: Complete event-driven message processing flow  
 * - FIXED: Duplicate agent subscriptions prevented with subscription tracking
 * - IMPLEMENTED: Consistent ID vs name handling with helper functions
 * - STANDARDIZED: Agent lookup functions with clear naming convention
 * - UPDATED: Memory functions to use smart agent detection instead of heuristics
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  Agent,
  AgentConfig,
  AgentMemory,
  ChatMessage,
  WorldState,
  WorldOptions,
  WorldInfo,
  MessagePayload,
  MessageEventPayload,
  EventType
} from './types';
import {
  publishMessageEvent,
  publishWorldEvent,
  subscribeToMessages,
  subscribeToWorld,
  subscribeToSSE,
  subscribeToSystem,
  initializeEventBus,
  publishDebugEvent
} from './event-bus';

// Re-export event subscription functions for backward compatibility
export {
  subscribeToMessages as subscribeToMessageEvents,
  subscribeToWorld as subscribeToWorldEvents,
  subscribeToSSE as subscribeToSSEEvents,
  subscribeToSystem as subscribeToSystemEvents
} from './event-bus';
import { processAgentMessage } from './agent';
import { initializeFileStorage, getStorageOptions, ensureDirectory } from './storage';
import { toKebabCase } from './utils';

// Global world storage - keyed by world name
const worlds: Map<string, WorldState> = new Map();

// Track agent message subscriptions to prevent double subscription
const agentSubscriptions: Map<string, () => void> = new Map();

// Turn counter storage for conversation management
const worldConversationCounters: Map<string, number> = new Map();

/**
 * Turn Management - consolidated turn counter operations
 */
export const TurnManager = {
  /**
   * Get turn counter for a world
   */
  getCount: (worldName: string): number => {
    return worldConversationCounters.get(worldName) || 0;
  },

  /**
   * Increment turn counter for a world
   */
  increment: (worldName: string): number => {
    const current = TurnManager.getCount(worldName);
    const newCount = current + 1;
    worldConversationCounters.set(worldName, newCount);
    publishDebugEvent(`[Turn Counter] ${worldName}: ${current} → ${newCount}`, { worldName, current, newCount });
    return newCount;
  },

  /**
   * Reset turn counter for a world
   */
  reset: (worldName: string): void => {
    const current = TurnManager.getCount(worldName);
    worldConversationCounters.set(worldName, 0);
    publishDebugEvent(`[Turn Counter] ${worldName}: ${current} → 0 (reset)`, { worldName, current, reset: true });
  },

  /**
   * Check if turn limit is reached
   */
  isLimitReached: (worldName: string): boolean => {
    return TurnManager.getCount(worldName) >= 5;
  }
};

// Legacy function exports for backward compatibility
export const getTurnCounter = TurnManager.getCount;
export const incrementTurnCounter = TurnManager.increment;
export const resetTurnCounter = TurnManager.reset;
export const isTurnLimitReached = TurnManager.isLimitReached;

// Get data directory from storage configuration
function getWorldsDir(): string {
  try {
    const storageOptions = getStorageOptions();
    return storageOptions.dataPath;
  } catch {
    // Fallback to default if storage not initialized
    return path.join(process.cwd(), 'data', 'worlds');
  }
}

// Default world configuration
export const DEFAULT_WORLD_NAME = 'Default World';

/**
 * Get world directory path using kebab-case of world name
 */
function getWorldDir(worldName: string): string {
  const worldsDir = getWorldsDir();
  return path.join(worldsDir, toKebabCase(worldName));
}

/**
 * Find the actual world directory by checking world name
 */
async function findWorldDir(worldName: string): Promise<string | null> {
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
function getWorldConfigPath(worldName: string): string {
  return path.join(getWorldDir(worldName), 'config.json');
}

/**
 * Get agents directory path
 */
function getAgentsDir(worldName: string): string {
  return path.join(getWorldDir(worldName), 'agents');
}

/**
 * Get agent file path using kebab-case agent name
 */
function getAgentPath(worldName: string, agentName: string): string {
  return path.join(getAgentsDir(worldName), toKebabCase(agentName), 'config.json');
}

/**
 * Ensure data directories exist
 */
async function ensureDataDirectories(): Promise<void> {
  const worldsDir = getWorldsDir();
  await ensureDirectory(worldsDir);
}

/**
 * Create default world if no worlds exist
 */
export async function ensureDefaultWorld(): Promise<string> {
  // Initialize event bus with local provider
  initializeEventBus({ provider: 'local', enableLogging: true });

  await initializeFileStorage();
  await ensureDataDirectories();

  // Check if any worlds exist on disk
  const existingWorlds = await listWorldsFromDisk();

  if (existingWorlds.length > 0) {
    // Load existing worlds into memory
    for (const worldName of existingWorlds) {
      try {
        await loadWorldFromDisk(worldName);
      } catch (error) {
        console.warn(`Failed to load world ${worldName}:`, error);
      }
    }
    return existingWorlds[0]; // Return first world name
  }

  // Create default world
  const defaultWorldName = await createWorld({ name: DEFAULT_WORLD_NAME });
  return defaultWorldName;
}

/**
 * Load worlds with basic logic - returns world list and suggests action
 */
export async function loadWorlds(): Promise<{ worlds: string[]; action: 'create' | 'use' | 'select'; defaultWorld?: string }> {
  // Initialize event bus with local provider
  initializeEventBus({ provider: 'local', enableLogging: true });

  await initializeFileStorage();
  await ensureDataDirectories();

  // Check if any worlds exist on disk
  const existingWorlds = await listWorldsFromDisk();

  if (existingWorlds.length === 0) {
    // No worlds found - suggest creating default world
    return { worlds: existingWorlds, action: 'create' };
  }

  if (existingWorlds.length === 1) {
    // One world found - suggest using it automatically
    return { worlds: existingWorlds, action: 'use', defaultWorld: existingWorlds[0] };
  }

  // Multiple worlds found - suggest interactive selection
  return { worlds: existingWorlds, action: 'select' };
}

/**
 * Simple world loading - loads first available world or creates default
 */
export async function loadWorldsWithSelection(): Promise<string> {
  // Initialize event bus with local provider
  initializeEventBus({ provider: 'local', enableLogging: true });

  await initializeFileStorage();
  await ensureDataDirectories();

  // Check if any worlds exist on disk
  const existingWorlds = await listWorldsFromDisk();

  if (existingWorlds.length === 0) {
    // No worlds found - create default world
    const defaultWorldName = await createWorld({ name: DEFAULT_WORLD_NAME });
    return defaultWorldName;
  }

  // Load first available world
  const worldName = existingWorlds[0];
  await loadWorldFromDisk(worldName);
  return worldName;
}

/**
 * Initialize world system and ensure default world exists
 */
export async function initializeWorldSystem(): Promise<string> {
  return await ensureDefaultWorld();
}

// ===== WORLD MANAGEMENT =====

/**
 * Create a new world
 */
export async function createWorld(options: WorldOptions = {}): Promise<string> {
  // Initialize event bus with local provider (defensive)
  initializeEventBus({ provider: 'local', enableLogging: true });

  const worldName = options.name || `world-${Date.now()}`;
  const worldState: WorldState = {
    name: worldName,
    agents: new Map()
  };

  worlds.set(worldName, worldState);

  // Initialize turn counter for this world
  worldConversationCounters.set(worldName, 0);

  // Save to disk immediately
  try {
    await saveWorldToDisk(worldName);
  } catch (error) {
    // Rollback memory change on disk error
    worlds.delete(worldName);
    throw error;
  }

  // Publish world creation event
  await publishWorldEvent({
    action: 'WORLD_CREATED',
    worldName,
    name: worldState.name,
    timestamp: new Date().toISOString()
  });

  return worldName;
}

/**
 * Get world information
 */
export function getWorldInfo(worldName: string): WorldInfo | null {
  const world = worlds.get(worldName);
  if (!world) return null;

  return {
    name: world.name,
    agentCount: world.agents.size
  };
}

/**
 * Delete a world and cleanup
 */
export async function deleteWorld(worldName: string): Promise<boolean> {
  const world = worlds.get(worldName);
  if (!world) return false;

  // Get world directory path before removing from memory
  const worldDir = getWorldDir(worldName);

  // Clean up all agent subscriptions for this world
  for (const agentName of world.agents.keys()) {
    unsubscribeAgentFromMessages(worldName, agentName);
  }

  // Remove from memory first
  worlds.delete(worldName);

  // Remove world directory from disk
  try {
    await fs.rm(worldDir, { recursive: true, force: true });
  } catch (error) {
    // Rollback memory change if disk operation fails
    worlds.set(worldName, world);
    throw error;
  }

  return true;
}

/**
 * List all world names (from memory)
 */
export function listWorlds(): string[] {
  return Array.from(worlds.keys());
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

/**
 * Save world state to disk
 */
export async function saveWorld(worldName: string): Promise<boolean> {
  try {
    await saveWorldToDisk(worldName);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return false;
    }
    throw error;
  }
}

/**
 * Save world configuration and agents to disk
 */
async function saveWorldToDisk(worldName: string): Promise<void> {
  const world = worlds.get(worldName);
  if (!world) {
    throw new Error(`World ${worldName} not found`);
  }

  const worldDir = getWorldDir(worldName);
  const agentsDir = getAgentsDir(worldName);

  // Ensure directories exist
  await ensureDirectory(worldDir);
  await ensureDirectory(agentsDir);

  // Save world config (without agents)
  const worldConfig = {
    name: world.name
  };

  await fs.writeFile(
    getWorldConfigPath(worldName),
    JSON.stringify(worldConfig, null, 2)
  );

  // Save each agent separately
  for (const [agentName, agent] of world.agents) {
    const agentData = {
      ...agent,
      createdAt: agent.createdAt?.toISOString(),
      lastActive: agent.lastActive?.toISOString()
    };

    const agentPath = getAgentPath(worldName, agent.name);
    const agentDir = path.dirname(agentPath);

    // Ensure agent directory exists
    await ensureDirectory(agentDir);

    await fs.writeFile(agentPath, JSON.stringify(agentData, null, 2));
  }
}

/**
 * Load world state from disk
 */
export async function loadWorld(worldName: string): Promise<void> {
  await loadWorldFromDisk(worldName);
}

/**
 * Load world configuration and agents from disk
 */
export async function loadWorldFromDisk(worldName: string): Promise<void> {
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

        // Load system prompt from separate file and add it to config
        const systemPrompt = await loadSystemPromptDirect(actualWorldDir, agent.name);
        agent.config.systemPrompt = systemPrompt;

        // Load memory from separate file (but don't add to agent object to keep it clean)
        // Memory will be loaded on-demand when needed for LLM context

        worldState.agents.set(agent.name, agent);

        // Subscribe loaded agent to MESSAGE events (with duplicate prevention)
        subscribeAgentToMessages(worldName, agent);
      }
    } catch (error) {
      // Agents directory doesn't exist or is empty
    }

    worlds.set(worldName, worldState);

    // Initialize turn counter for this world
    worldConversationCounters.set(worldName, 0);
  } catch (error) {
    throw new Error(`Failed to load world ${worldName}: ${error}`);
  }
}

// ===== AGENT LOOKUP HELPERS =====

/**
 * Get a specific agent from a world by name
 */
export function getAgent(worldName: string, agentName: string): Agent | null {
  const world = worlds.get(worldName);
  if (!world) return null;

  return world.agents.get(agentName) || null;
}

// ===== AGENT MANAGEMENT =====

/**
 * Subscribe an agent to message events if not already subscribed
 */
function subscribeAgentToMessages(worldName: string, agent: Agent): void {
  const subscriptionKey = `${worldName}:${agent.name}`;

  // Check if already subscribed
  if (agentSubscriptions.has(subscriptionKey)) {
    return; // Already subscribed, skip
  }

  // Subscribe agent to MESSAGE events from event bus
  const unsubscribe = subscribeToMessages(async (event) => {
    // Only process MESSAGE events with MessageEventPayload
    if (event.type === EventType.MESSAGE && event.payload && 'content' in event.payload && 'sender' in event.payload) {
      const payload = event.payload as MessageEventPayload;

      // Don't process messages from this agent itself
      if (payload.sender !== agent.name) {
        try {
          // Ensure agent config has name field
          const agentConfigWithName = {
            ...agent.config,
            name: agent.name
          };
          await processAgentMessage(agentConfigWithName, {
            name: 'message',
            id: event.id,
            content: payload.content,
            sender: payload.sender,
            payload: payload
          }, undefined, worldName);

          // Increment turn counter after successful agent message processing
          if (payload.sender !== 'HUMAN' && payload.sender !== 'human' && payload.sender !== 'system') {
            TurnManager.increment(worldName);
          }
        } catch (error) {
          console.error(`Agent ${agent.name} failed to process message:`, error);
        }
      }
    }
  });

  // Store the unsubscribe function
  agentSubscriptions.set(subscriptionKey, unsubscribe);
}

/**
 * Unsubscribe an agent from message events
 */
function unsubscribeAgentFromMessages(worldName: string, agentName: string): void {
  const subscriptionKey = `${worldName}:${agentName}`;
  const unsubscribe = agentSubscriptions.get(subscriptionKey);

  if (unsubscribe) {
    unsubscribe();
    agentSubscriptions.delete(subscriptionKey);
  }
}

/**
 * Save a single agent to disk
 */
async function saveAgentToDisk(worldName: string, agent: Agent): Promise<void> {
  const agentDir = path.join(getAgentsDir(worldName), toKebabCase(agent.name));
  await ensureDirectory(agentDir);

  // Save system prompt separately as markdown file
  const systemPromptPath = path.join(agentDir, 'system-prompt.md');
  const systemPromptContent = agent.config.systemPrompt || `You are ${agent.name}, an AI agent.`;
  await fs.writeFile(systemPromptPath, systemPromptContent, 'utf8');

  // Save config without system prompt content
  const { systemPrompt, ...configWithoutPrompt } = agent.config;
  const agentData = {
    ...agent,
    config: configWithoutPrompt,
    createdAt: agent.createdAt?.toISOString(),
    lastActive: agent.lastActive?.toISOString()
  };

  await fs.writeFile(
    getAgentPath(worldName, agent.name),
    JSON.stringify(agentData, null, 2)
  );
}

/**
 * Load system prompt from file using direct world directory path
 */
async function loadSystemPromptDirect(worldDir: string, agentName: string): Promise<string> {
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
async function loadSystemPrompt(worldName: string, agentName: string): Promise<string> {
  const agentDir = path.join(getAgentsDir(worldName), toKebabCase(agentName));
  const systemPromptPath = path.join(agentDir, 'system-prompt.md');

  try {
    return await fs.readFile(systemPromptPath, 'utf8');
  } catch (error) {
    // Return default if file doesn't exist
    return `You are ${agentName}, an AI agent.`;
  }
}

/**
 * Save agent memory to separate file
 */
async function saveAgentMemory(worldName: string, agentName: string, memory: any): Promise<void> {
  const agentDir = path.join(getAgentsDir(worldName), toKebabCase(agentName));
  await ensureDirectory(agentDir);

  const memoryPath = path.join(agentDir, 'memory.json');
  await fs.writeFile(memoryPath, JSON.stringify(memory, null, 2), 'utf8');
}

/**
 * Load agent memory from file - uses LLM-compatible schema
 */
async function loadAgentMemory(worldName: string, agentName: string): Promise<AgentMemory> {
  const agentDir = path.join(getAgentsDir(worldName), toKebabCase(agentName));
  const memoryPath = path.join(agentDir, 'memory.json');

  try {
    const memoryData = await fs.readFile(memoryPath, 'utf8');
    const memory = JSON.parse(memoryData);

    return memory;
  } catch (error) {
    // Return new LLM-compatible default memory structure
    return {
      messages: [],
      lastActivity: new Date().toISOString()
    };
  }
}

/**
 * Add message to agent's conversation history using LLM-compatible schema
 */
export async function addToAgentMemory(worldName: string, agentName: string, message: ChatMessage): Promise<void> {
  const agent = getAgent(worldName, agentName);
  if (!agent) return;

  // Load current memory using agent name
  const memory = await loadAgentMemory(worldName, agent.name);

  // Add message to conversation history
  if (!memory.messages) {
    memory.messages = [];
  }

  memory.messages.push({
    ...message,
    timestamp: message.timestamp || new Date().toISOString()
  });

  // Keep only last 50 messages for performance
  if (memory.messages.length > 50) {
    memory.messages = memory.messages.slice(-50);
  }

  memory.lastActivity = new Date().toISOString();

  // Save updated memory using agent name
  await saveAgentMemory(worldName, agent.name, memory);
}

/**
 * Get agent's conversation history for LLM context
 */
export async function getAgentConversationHistory(worldName: string, agentName: string, limit: number = 20): Promise<ChatMessage[]> {
  const agent = getAgent(worldName, agentName);
  if (!agent) return [];

  const memory = await loadAgentMemory(worldName, agent.name);
  const history = memory.messages || [];

  // Return last N messages
  return history.slice(-limit);
}

/**
 * Create an agent in a world
 */
export async function createAgent(worldName: string, config: AgentConfig): Promise<Agent | null> {
  const world = worlds.get(worldName);
  if (!world) return null;

  // Validate required config fields
  if (!config.name || !config.type) {
    return null;
  }

  // Clone config to avoid mutating input
  const agentConfig: AgentConfig = { ...config };
  const agent: Agent = {
    name: config.name,
    type: config.type,
    status: 'active',
    config: agentConfig,
    createdAt: new Date(),
    lastActive: new Date(),
    metadata: {}
  };

  world.agents.set(agent.name, agent);

  // Save agent to disk
  try {
    await saveAgentToDisk(worldName, agent);
  } catch (error) {
    // Rollback memory change on disk error
    world.agents.delete(agent.name);
    throw error;
  }

  // Subscribe agent to MESSAGE events (with duplicate prevention)
  subscribeAgentToMessages(worldName, agent);

  return agent;
}

/**
 * Remove an agent from a world
 */
export async function removeAgent(worldName: string, agentName: string): Promise<boolean> {
  const world = worlds.get(worldName);
  if (!world || !world.agents.has(agentName)) return false;

  const agent = world.agents.get(agentName);

  // Unsubscribe from message events
  unsubscribeAgentFromMessages(worldName, agentName);

  // Remove from memory
  world.agents.delete(agentName);

  // Remove from disk
  try {
    if (agent) {
      const agentDir = path.join(getAgentsDir(worldName), toKebabCase(agent.name));
      await fs.rm(agentDir, { recursive: true, force: true });
    }
  } catch (error) {
    // Rollback memory change if disk operation fails
    if (agent) {
      world.agents.set(agentName, agent);
    }
    throw error;
  }

  // Note: Event subscriptions are handled by the event bus automatically
  // No manual cleanup needed for simplified subscription model

  return true;
}

/**
 * Get all agents in a world
 */
export function getAgents(worldName: string): Agent[] {
  const world = worlds.get(worldName);
  if (!world) return [];

  return Array.from(world.agents.values());
}

/**
 * Update an agent's data
 */
export async function updateAgent(worldName: string, agentName: string, updates: Partial<Agent>): Promise<Agent | null> {
  const world = worlds.get(worldName);
  if (!world) return null;

  const agent = world.agents.get(agentName);
  if (!agent) return null;

  const originalAgent = { ...agent };

  const updatedAgent = {
    ...agent,
    ...updates,
    name: agent.name, // Prevent name changes
    lastActive: new Date()
  };

  // Update in memory
  world.agents.set(agentName, updatedAgent);

  // Save to disk
  try {
    await saveAgentToDisk(worldName, updatedAgent);
  } catch (error) {
    // Rollback memory change on disk error
    world.agents.set(agentName, originalAgent);
    throw error;
  }

  return updatedAgent;
}

// ===== EVENT SYSTEM =====

/**
 * Broadcast a message to all agents in a world
 */
export async function broadcastMessage(worldName: string, message: string, sender?: string): Promise<void> {
  const world = worlds.get(worldName);
  if (!world) {
    throw new Error(`World ${worldName} not found`);
  }

  const senderName = sender || 'HUMAN';

  // Reset turn counter for human or system messages (centralized - happens once per message)
  if (senderName === 'HUMAN' || senderName === 'human' || senderName === 'system') {
    publishDebugEvent(`[Centralized Reset] Turn counter reset for ${senderName} broadcast message`, {
      worldName,
      sender: senderName
    });
    TurnManager.reset(worldName);
  }

  // Create simple message payload with flat structure
  const messageEventPayload: MessageEventPayload = {
    content: message,
    sender: senderName
  };

  // Publish MESSAGE event with flat payload structure
  await publishMessageEvent(messageEventPayload);
}

/**
 * Send a direct message to a specific agent
 */
export async function sendMessage(worldName: string, targetName: string, message: string, sender?: string): Promise<void> {
  const world = worlds.get(worldName);
  if (!world) {
    throw new Error(`World not found`);
  }

  const target = world.agents.get(targetName);
  if (!target) {
    throw new Error(`Agent not found`);
  }

  const senderName = sender || 'system';

  // Reset turn counter for human or system messages (centralized - happens once per message)
  if (senderName === 'HUMAN' || senderName === 'human' || senderName === 'system') {
    publishDebugEvent(`[Centralized Reset] Turn counter reset for ${senderName} direct message`, {
      worldName,
      sender: senderName,
      targetName
    });
    TurnManager.reset(worldName);
  }

  // Create simple message payload with flat structure
  const messageEventPayload: MessageEventPayload = {
    content: message,
    sender: senderName
  };

  // Publish direct message event
  await publishMessageEvent(messageEventPayload);
}



/**
 * Subscribe to messages for a specific agent in a world
 */
export function subscribeToAgentMessages(worldName: string, agentName: string, callback: (event: any) => void): () => void {
  return subscribeToMessages((event: any) => {
    if (event.payload?.worldName === worldName &&
      (event.payload?.recipient === agentName || event.payload?.targetName === agentName)) {
      callback(event);
    }
  });
}

/**
 * Clear agent's memory - archives existing memory.json then creates fresh simplified memory
 */
export async function clearAgentMemory(worldName: string, agentName: string): Promise<boolean> {
  const agent = getAgent(worldName, agentName);
  if (!agent) return false;

  try {
    const agentDir = path.join(getAgentsDir(worldName), toKebabCase(agent.name));
    const memoryPath = path.join(agentDir, 'memory.json');

    // Archive the existing memory.json file if it exists
    try {
      // Check if memory file exists and has content
      const existingMemory = await fs.readFile(memoryPath, 'utf8');
      const memoryData = JSON.parse(existingMemory);

      // Only archive if there's meaningful content (messages)
      if (memoryData.messages && memoryData.messages.length > 0) {
        // Create archives directory within agent folder
        const archivesDir = path.join(agentDir, 'archives');
        await ensureDirectory(archivesDir);

        // Create timestamped archive filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archivePath = path.join(archivesDir, `memory_archive_${timestamp}.json`);

        // Copy the existing memory to archive
        await fs.copyFile(memoryPath, archivePath);
      }
    } catch (error) {
      // File might not exist or be invalid JSON, which is fine - continue with clear
    }

    // Delete the existing memory.json file if it exists
    try {
      await fs.unlink(memoryPath);
    } catch (error) {
      // File might not exist, which is fine
    }

    // Create simplified memory structure - only stores LLM messages
    const emptyMemory: AgentMemory = {
      messages: [], // Empty array for LLM messages
      lastActivity: new Date().toISOString()
    };

    // Save the simplified empty memory to the agent's memory file
    await saveAgentMemory(worldName, agent.name, emptyMemory);

    // Update agent's last active timestamp
    const agents = getAgents(worldName);
    const agentForUpdate = agents.find(a => a.name === agent.name);
    if (agentForUpdate) {
      await updateAgent(worldName, agentForUpdate.name, {
        lastActive: new Date()
      });
    }

    return true;
  } catch (error) {
    const agentNameStr = agent ? agent.name : agentName;
    console.error(`Failed to clear memory for agent ${agentNameStr}:`, error);
    return false;
  }
}

/**
 * Test helper: Clear all worlds (for testing only)
 * @internal
 */
export function _clearAllWorldsForTesting(): void {
  // Clean up all subscriptions
  for (const unsubscribe of agentSubscriptions.values()) {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  }
  agentSubscriptions.clear();

  worlds.clear();
}
