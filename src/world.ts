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
 */

import { v4 as uuidv4 } from 'uuid';
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
  initializeEventBus
} from './event-bus';
import { processAgentMessage } from './agent';
import { initializeFileStorage, getStorageOptions, ensureDirectory } from './storage';
import { toKebabCase } from './utils';
import { worldLogger } from './logger'; // (if not already imported)

// Global world storage
const worlds: Map<string, WorldState> = new Map();

// Track agent message subscriptions to prevent double subscription
const agentSubscriptions: Map<string, () => void> = new Map();

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
const DEFAULT_WORLD_NAME = 'Default World';

/**
 * Get world directory path using kebab-case of world name
 * This function requires the world to be loaded in memory first
 */
function getWorldDir(worldId: string): string {
  const worldsDir = getWorldsDir();
  const world = worlds.get(worldId);
  if (!world) {
    throw new Error(`World ${worldId} not found in memory. Load the world first before accessing its directory.`);
  }
  // Always use kebab-case of world name for folder
  return path.join(worldsDir, toKebabCase(world.name));
}

/**
 * Find the actual world directory by checking both kebab-case name and world ID
 */
async function findWorldDir(worldId: string): Promise<string | null> {
  const worldsDir = getWorldsDir();

  // Try to find world config by scanning directories
  try {
    const entries = await fs.readdir(worldsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const configPath = path.join(worldsDir, entry.name, 'config.json');
        try {
          await fs.access(configPath);
          const configData = await fs.readFile(configPath, 'utf-8');
          const worldConfig = JSON.parse(configData);
          if (worldConfig.id === worldId) {
            return path.join(worldsDir, entry.name);
          }
        } catch {
          // Skip invalid configs
        }
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return null;
}

/**
 * Get world config file path
 */
function getWorldConfigPath(worldId: string): string {
  return path.join(getWorldDir(worldId), 'config.json');
}

/**
 * Get agents directory path
 */
function getAgentsDir(worldId: string): string {
  return path.join(getWorldDir(worldId), 'agents');
}

/**
 * Get agent file path using kebab-case agent name
 */
function getAgentPath(worldId: string, agentName: string): string {
  return path.join(getAgentsDir(worldId), toKebabCase(agentName), 'config.json');
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
    for (const worldId of existingWorlds) {
      try {
        await loadWorldFromDisk(worldId);
      } catch (error) {
        console.warn(`Failed to load world ${worldId}:`, error);
      }
    }
    return existingWorlds[0]; // Return first world ID
  }

  // Create default world
  const defaultWorldId = await createWorld({ name: DEFAULT_WORLD_NAME });
  return defaultWorldId;
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
    const defaultWorldId = await createWorld({ name: DEFAULT_WORLD_NAME });
    return defaultWorldId;
  }

  // Load first available world
  const worldId = existingWorlds[0];
  await loadWorldFromDisk(worldId);
  return worldId;
}

/**
 * Generate unique world ID
 */
function generateWorldId(): string {
  return `world_${uuidv4()}`;
}

/**
 * Generate unique agent ID
 */
function generateAgentId(): string {
  return `agent_${uuidv4()}`;
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

  const worldId = generateWorldId();
  const worldState: WorldState = {
    id: worldId,
    name: options.name || `World ${worldId.slice(-8)}`,
    agents: new Map()
  };

  worlds.set(worldId, worldState);

  // Save to disk immediately
  try {
    await saveWorldToDisk(worldId);
  } catch (error) {
    // Rollback memory change on disk error
    worlds.delete(worldId);
    throw error;
  }

  // Publish world creation event
  await publishWorldEvent({
    action: 'WORLD_CREATED',
    worldId,
    name: worldState.name,
    timestamp: new Date().toISOString()
  });

  return worldId;
}

/**
 * Get world information
 */
export function getWorldInfo(worldId: string): WorldInfo | null {
  const world = worlds.get(worldId);
  if (!world) return null;

  return {
    id: world.id,
    name: world.name,
    agentCount: world.agents.size
  };
}

/**
 * Delete a world and cleanup
 */
export async function deleteWorld(worldId: string): Promise<boolean> {
  const world = worlds.get(worldId);
  if (!world) return false;

  // Get world directory path before removing from memory
  const worldDir = getWorldDir(worldId);

  // Clean up all agent subscriptions for this world
  for (const agentId of world.agents.keys()) {
    unsubscribeAgentFromMessages(worldId, agentId);
  }

  // Remove from memory first
  worlds.delete(worldId);

  // Remove world directory from disk
  try {
    await fs.rm(worldDir, { recursive: true, force: true });
  } catch (error) {
    // Rollback memory change if disk operation fails
    worlds.set(worldId, world);
    throw error;
  }

  return true;
}

/**
 * List all world IDs (from memory)
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
    const validWorldIds: string[] = [];

    for (const worldDir of worldDirs) {
      try {
        const configPath = path.join(worldsDir, worldDir, 'config.json');
        await fs.access(configPath);
        // Read the config to get the world ID
        const configData = await fs.readFile(configPath, 'utf-8');
        const worldConfig = JSON.parse(configData);
        validWorldIds.push(worldConfig.id);
      } catch (error) {
        // Skip invalid world directories
      }
    }

    return validWorldIds;
  } catch (error) {
    return [];
  }
}

/**
 * Save world state to disk
 */
export async function saveWorld(worldId: string): Promise<void> {
  await saveWorldToDisk(worldId);
}

/**
 * Save world configuration and agents to disk
 */
async function saveWorldToDisk(worldId: string): Promise<void> {
  const world = worlds.get(worldId);
  if (!world) {
    throw new Error(`World ${worldId} not found`);
  }

  const worldDir = getWorldDir(worldId);
  const agentsDir = getAgentsDir(worldId);

  // Ensure directories exist
  await ensureDirectory(worldDir);
  await ensureDirectory(agentsDir);

  // Save world config (without agents)
  const worldConfig = {
    id: world.id,
    name: world.name
  };

  await fs.writeFile(
    getWorldConfigPath(worldId),
    JSON.stringify(worldConfig, null, 2)
  );

  // Save each agent separately
  for (const [agentId, agent] of world.agents) {
    const agentData = {
      ...agent,
      createdAt: agent.createdAt?.toISOString(),
      lastActive: agent.lastActive?.toISOString()
    };

    const agentPath = getAgentPath(worldId, agentId);
    const agentDir = path.dirname(agentPath);

    // Ensure agent directory exists
    await ensureDirectory(agentDir);

    await fs.writeFile(agentPath, JSON.stringify(agentData, null, 2));
  }
}

/**
 * Load world state from disk
 */
export async function loadWorld(worldId: string): Promise<void> {
  await loadWorldFromDisk(worldId);
}

/**
 * Load world configuration and agents from disk
 */
async function loadWorldFromDisk(worldId: string): Promise<void> {
  // Find the actual world directory
  const actualWorldDir = await findWorldDir(worldId);
  if (!actualWorldDir) {
    throw new Error(`World directory not found for ${worldId}`);
  }

  const worldConfigPath = path.join(actualWorldDir, 'config.json');
  const agentsDir = path.join(actualWorldDir, 'agents');

  try {
    // Load world config
    const configData = await fs.readFile(worldConfigPath, 'utf-8');
    const worldConfig = JSON.parse(configData);

    // Create world state
    const worldState: WorldState = {
      id: worldConfig.id,
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

        worldState.agents.set(agent.id, agent);

        // Subscribe loaded agent to MESSAGE events (with duplicate prevention)
        subscribeAgentToMessages(worldId, agent);
      }
    } catch (error) {
      // Agents directory doesn't exist or is empty
    }

    worlds.set(worldId, worldState);
  } catch (error) {
    throw new Error(`Failed to load world ${worldId}: ${error}`);
  }
}

// ===== AGENT MANAGEMENT =====

/**
 * Subscribe an agent to message events if not already subscribed
 */
function subscribeAgentToMessages(worldId: string, agent: Agent): void {
  const subscriptionKey = `${worldId}:${agent.id}`;

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
      if (payload.sender !== agent.id) {
        try {
          // Ensure agent config has id field
          const agentConfigWithId = {
            ...agent.config,
            id: agent.id,
            name: agent.name
          };
          await processAgentMessage(agentConfigWithId, {
            name: 'message',
            id: event.id,
            content: payload.content,
            sender: payload.sender,
            payload: payload
          }, undefined, worldId);
        } catch (error) {
          console.error(`Agent ${agent.id} failed to process message:`, error);
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
function unsubscribeAgentFromMessages(worldId: string, agentId: string): void {
  const subscriptionKey = `${worldId}:${agentId}`;
  const unsubscribe = agentSubscriptions.get(subscriptionKey);

  if (unsubscribe) {
    unsubscribe();
    agentSubscriptions.delete(subscriptionKey);
  }
}

/**
 * Save a single agent to disk
 */
async function saveAgentToDisk(worldId: string, agent: Agent): Promise<void> {
  const agentDir = path.join(getAgentsDir(worldId), toKebabCase(agent.name));
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
    getAgentPath(worldId, agent.name),
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
async function loadSystemPrompt(worldId: string, agentName: string): Promise<string> {
  const agentDir = path.join(getAgentsDir(worldId), toKebabCase(agentName));
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
async function saveAgentMemory(worldId: string, agentName: string, memory: any): Promise<void> {
  const agentDir = path.join(getAgentsDir(worldId), toKebabCase(agentName));
  await ensureDirectory(agentDir);

  const memoryPath = path.join(agentDir, 'memory.json');
  await fs.writeFile(memoryPath, JSON.stringify(memory, null, 2), 'utf8');
}

/**
 * Load agent memory from file - uses LLM-compatible schema
 */
async function loadAgentMemory(worldId: string, agentName: string): Promise<AgentMemory> {
  const agentDir = path.join(getAgentsDir(worldId), toKebabCase(agentName));
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
export async function addToAgentMemory(worldId: string, agentIdOrName: string, message: ChatMessage): Promise<void> {
  // Check if agentIdOrName is an ID (UUID format) or a name
  const agent = agentIdOrName.includes('-') && agentIdOrName.length > 10
    ? getAgent(worldId, agentIdOrName)  // Likely an ID
    : getAgents(worldId).find(a => a.name === agentIdOrName); // Likely a name

  if (!agent) return;

  // Load current memory using agent name
  const memory = await loadAgentMemory(worldId, agent.name);

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
  await saveAgentMemory(worldId, agent.name, memory);
}

/**
 * Get agent's conversation history for LLM context
 */
export async function getAgentConversationHistory(worldId: string, agentIdOrName: string, limit: number = 20): Promise<ChatMessage[]> {
  // Check if agentIdOrName is an ID (UUID format) or a name
  const agent = agentIdOrName.includes('-') && agentIdOrName.length > 10
    ? getAgent(worldId, agentIdOrName)  // Likely an ID
    : getAgents(worldId).find(a => a.name === agentIdOrName); // Likely a name

  if (!agent) return [];

  const memory = await loadAgentMemory(worldId, agent.name);
  const history = memory.messages || [];

  // Return last N messages
  return history.slice(-limit);
}

/**
 * Create an agent in a world
 */
export async function createAgent(worldId: string, config: AgentConfig): Promise<Agent | null> {
  const world = worlds.get(worldId);
  if (!world) return null;

  // Always use config.id if provided, otherwise generate
  const agentId = config.id || generateAgentId();
  // Clone config to avoid mutating input
  const agentConfig: AgentConfig = { ...config, id: agentId };
  const agent: Agent = {
    id: agentId,
    name: config.name,
    type: config.type,
    status: 'active',
    config: agentConfig,
    createdAt: new Date(),
    lastActive: new Date(),
    metadata: {}
  };

  world.agents.set(agentId, agent);

  // Save agent to disk
  try {
    await saveAgentToDisk(worldId, agent);
  } catch (error) {
    // Rollback memory change on disk error
    world.agents.delete(agentId);
    throw error;
  }

  // Subscribe agent to MESSAGE events (with duplicate prevention)
  subscribeAgentToMessages(worldId, agent);

  return agent;
}

/**
 * Remove an agent from a world
 */
export async function removeAgent(worldId: string, agentId: string): Promise<boolean> {
  const world = worlds.get(worldId);
  if (!world || !world.agents.has(agentId)) return false;

  const agent = world.agents.get(agentId);

  // Unsubscribe from message events
  unsubscribeAgentFromMessages(worldId, agentId);

  // Remove from memory
  world.agents.delete(agentId);

  // Remove from disk
  try {
    if (agent) {
      const agentDir = path.join(getAgentsDir(worldId), toKebabCase(agent.name));
      await fs.rm(agentDir, { recursive: true, force: true });
    }
  } catch (error) {
    // Rollback memory change if disk operation fails
    if (agent) {
      world.agents.set(agentId, agent);
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
export function getAgents(worldId: string): Agent[] {
  const world = worlds.get(worldId);
  if (!world) return [];

  return Array.from(world.agents.values());
}

/**
 * Get a specific agent from a world
 */
export function getAgent(worldId: string, agentId: string): Agent | null {
  const world = worlds.get(worldId);
  if (!world) return null;

  return world.agents.get(agentId) || null;
}

/**
 * Update an agent's data
 */
export async function updateAgent(worldId: string, agentId: string, updates: Partial<Agent>): Promise<Agent | null> {
  const world = worlds.get(worldId);
  if (!world) return null;

  const agent = world.agents.get(agentId);
  if (!agent) return null;

  const originalAgent = { ...agent };

  const updatedAgent = {
    ...agent,
    ...updates,
    id: agent.id, // Prevent ID changes
    lastActive: new Date()
  };

  // Update in memory
  world.agents.set(agentId, updatedAgent);

  // Save to disk
  try {
    await saveAgentToDisk(worldId, updatedAgent);
  } catch (error) {
    // Rollback memory change on disk error
    world.agents.set(agentId, originalAgent);
    throw error;
  }

  return updatedAgent;
}

// ===== EVENT SYSTEM =====

/**
 * Broadcast a message to all agents in a world
 */
export async function broadcastMessage(worldId: string, message: string, sender?: string): Promise<void> {
  const world = worlds.get(worldId);
  if (!world) {
    throw new Error(`World ${worldId} not found`);
  }

  // Create simple message payload with flat structure
  const messageEventPayload: MessageEventPayload = {
    content: message,
    sender: sender || 'system'
  };

  // Publish MESSAGE event with flat payload structure
  await publishMessageEvent(messageEventPayload);
}

/**
 * Send a direct message to a specific agent
 */
export async function sendMessage(worldId: string, targetId: string, message: string, sender?: string): Promise<void> {
  const world = worlds.get(worldId);
  if (!world) {
    throw new Error(`World ${worldId} not found`);
  }

  const target = world.agents.get(targetId);
  if (!target) {
    throw new Error(`Agent ${targetId} not found in world ${worldId}`);
  }

  // Create simple message payload with flat structure
  const messageEventPayload: MessageEventPayload = {
    content: message,
    sender: sender || 'system'
  };

  // Publish direct message event
  await publishMessageEvent(messageEventPayload);
}

/**
 * Subscribe to world events with filtering
 */
export function subscribeToWorldEvents(worldId: string, callback: (event: any) => void): () => void {
  // Subscribe to world events and filter by worldId
  const unsubscribeWorld = subscribeToWorld((event: any) => {
    if (event.payload?.worldId === worldId) {
      callback(event);
    }
  });

  // Subscribe to messages and filter by worldId
  const unsubscribeMessages = subscribeToMessages((event: any) => {
    if (event.payload?.worldId === worldId) {
      callback(event);
    }
  });

  // Subscribe to SSE events for agents in this world
  const unsubscribeSSE = subscribeToSSE((event: any) => {
    // Check if this SSE event is for an agent in this world
    const agent = getAgent(worldId, event.payload?.agentId);
    if (agent) {
      callback(event);
    }
  });

  // Return combined unsubscribe function
  return () => {
    unsubscribeWorld();
    unsubscribeMessages();
    unsubscribeSSE();
  };
}

/**
 * Subscribe to messages for a specific agent in a world
 */
export function subscribeToAgentMessages(worldId: string, agentId: string, callback: (event: any) => void): () => void {
  return subscribeToMessages((event: any) => {
    if (event.payload?.worldId === worldId &&
      (event.payload?.recipient === agentId || event.payload?.targetId === agentId)) {
      callback(event);
    }
  });
}

/**
 * Clear agent's memory - archives existing memory.json then creates fresh simplified memory
 */
export async function clearAgentMemory(worldId: string, agentIdOrName: string): Promise<boolean> {
  // Check if agentIdOrName is an ID (UUID format) or a name
  const agent = agentIdOrName.includes('-') && agentIdOrName.length > 10
    ? getAgent(worldId, agentIdOrName)  // Likely an ID
    : getAgents(worldId).find(a => a.name === agentIdOrName); // Likely a name

  if (!agent) return false;

  try {
    const agentDir = path.join(getAgentsDir(worldId), toKebabCase(agent.name));
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
        console.log(`📦 Archived agent memory: ${path.basename(archivePath)}`);
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
    await saveAgentMemory(worldId, agent.name, emptyMemory);

    // Update agent's last active timestamp
    const agents = getAgents(worldId);
    const agentForUpdate = agents.find(a => a.name === agent.name);
    if (agentForUpdate) {
      await updateAgent(worldId, agentForUpdate.id, {
        lastActive: new Date()
      });
    }

    return true;
  } catch (error) {
    const agentName = agent ? agent.name : agentIdOrName;
    console.error(`Failed to clear memory for agent ${agentName}:`, error);
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
    unsubscribe();
  }
  agentSubscriptions.clear();

  worlds.clear();
}
