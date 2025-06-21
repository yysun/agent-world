/*
 * Simplified Function-Based World Management
 * 
 * Features:
 * - World creation and basic state management
 * - Agent management (create, remove, update, query)
 * - Event system integration (publish, subscribe, messaging)
 * - Basic persistence (save/load world state)
 * - World listing and discovery
 * - Simple in-memory storage with optional persistence
 * 
 * Logic:
 * - Uses Map-based in-memory storage for fast access
 * - Integrates with event-bus.ts for event publishing/subscribing
 * - Provides clean functional API for all world operations
 * - Handles agent lifecycle within world context
 * - Supports basic persistence via JSON file storage
 * - Maintains world state consistency and validation
 * 
 * Changes:
 * - Initial implementation of simplified world management
 * - Function-based approach replacing class-based architecture
 * - Integration with existing event-bus system
 * - Basic persistence for world state and agents
 * - Clean API for agent and event management
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  Agent,
  AgentConfig,
  WorldState,
  WorldOptions,
  WorldInfo,
  MessagePayload
} from './types';
import {
  publishMessage,
  publishWorld,
  subscribeToMessages,
  subscribeToWorld
} from './event-bus';

// Global world storage
const worlds: Map<string, WorldState> = new Map();

// Data directory structure for persistence
const DATA_ROOT = path.join(process.cwd(), 'data');
const WORLDS_DIR = path.join(DATA_ROOT, 'worlds');

// Default world configuration
const DEFAULT_WORLD_NAME = 'Default World';

/**
 * Get world directory path
 */
function getWorldDir(worldId: string): string {
  return path.join(WORLDS_DIR, worldId);
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
 * Get agent file path
 */
function getAgentPath(worldId: string, agentId: string): string {
  return path.join(getAgentsDir(worldId), `${agentId}.json`);
}

/**
 * Ensure data directories exist
 */
async function ensureDataDirectories(): Promise<void> {
  try {
    await fs.mkdir(WORLDS_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create data directories:', error);
  }
}

/**
 * Create default world if no worlds exist
 */
export async function ensureDefaultWorld(): Promise<string> {
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
  const worldId = generateWorldId();
  const worldState: WorldState = {
    id: worldId,
    name: options.name || `World ${worldId.slice(-8)}`,
    agents: new Map(),
    createdAt: new Date(),
    metadata: options.metadata || {}
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
  publishWorld({
    type: 'WORLD_CREATED',
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
    agentCount: world.agents.size,
    createdAt: world.createdAt,
    metadata: world.metadata
  };
}

/**
 * Delete a world and cleanup
 */
export async function deleteWorld(worldId: string): Promise<boolean> {
  const world = worlds.get(worldId);
  if (!world) return false;

  // Remove from memory first
  worlds.delete(worldId);

  // Remove world directory from disk
  try {
    const worldDir = getWorldDir(worldId);
    await fs.rm(worldDir, { recursive: true, force: true });
  } catch (error) {
    // Rollback memory change if disk operation fails
    worlds.set(worldId, world);
    throw error;
  }

  // Publish world deletion event
  publishWorld({
    type: 'WORLD_DELETED',
    worldId,
    timestamp: new Date().toISOString()
  });

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
    const worldDirs = await fs.readdir(WORLDS_DIR);
    
    // Filter to only include directories with valid config files
    const validWorlds: string[] = [];
    
    for (const worldDir of worldDirs) {
      const configPath = getWorldConfigPath(worldDir);
      try {
        await fs.access(configPath);
        validWorlds.push(worldDir);
      } catch (error) {
        // Skip invalid world directories
      }
    }
    
    return validWorlds;
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
  await fs.mkdir(worldDir, { recursive: true });
  await fs.mkdir(agentsDir, { recursive: true });

  // Save world config (without agents)
  const worldConfig = {
    id: world.id,
    name: world.name,
    createdAt: world.createdAt.toISOString(),
    metadata: world.metadata
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
    
    await fs.writeFile(
      getAgentPath(worldId, agentId),
      JSON.stringify(agentData, null, 2)
    );
  }

  publishWorld({
    type: 'WORLD_SAVED',
    worldId,
    timestamp: new Date().toISOString()
  });
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
  const worldConfigPath = getWorldConfigPath(worldId);
  const agentsDir = getAgentsDir(worldId);

  try {
    // Load world config
    const configData = await fs.readFile(worldConfigPath, 'utf-8');
    const worldConfig = JSON.parse(configData);

    // Create world state
    const worldState: WorldState = {
      id: worldConfig.id,
      name: worldConfig.name,
      agents: new Map(),
      createdAt: new Date(worldConfig.createdAt),
      metadata: worldConfig.metadata || {}
    };

    // Load agents if agents directory exists
    try {
      const agentFiles = await fs.readdir(agentsDir);
      
      for (const agentFile of agentFiles) {
        if (agentFile.endsWith('.json')) {
          const agentPath = path.join(agentsDir, agentFile);
          const agentData = await fs.readFile(agentPath, 'utf-8');
          const agent = JSON.parse(agentData);
          
          // Restore Date objects
          if (agent.createdAt) agent.createdAt = new Date(agent.createdAt);
          if (agent.lastActive) agent.lastActive = new Date(agent.lastActive);
          
          worldState.agents.set(agent.id, agent);
        }
      }
    } catch (error) {
      // Agents directory doesn't exist or is empty
    }

    worlds.set(worldId, worldState);

    publishWorld({
      type: 'WORLD_LOADED',
      worldId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    throw new Error(`Failed to load world ${worldId}: ${error}`);
  }
}

// ===== AGENT MANAGEMENT =====

/**
 * Save a single agent to disk
 */
async function saveAgentToDisk(worldId: string, agent: Agent): Promise<void> {
  const agentsDir = getAgentsDir(worldId);
  await fs.mkdir(agentsDir, { recursive: true });
  
  const agentData = {
    ...agent,
    createdAt: agent.createdAt?.toISOString(),
    lastActive: agent.lastActive?.toISOString()
  };
  
  await fs.writeFile(
    getAgentPath(worldId, agent.id),
    JSON.stringify(agentData, null, 2)
  );
}

/**
 * Create an agent in a world
 */
export async function createAgent(worldId: string, config: AgentConfig): Promise<Agent | null> {
  const world = worlds.get(worldId);
  if (!world) return null;

  const agentId = generateAgentId();
  const agent: Agent = {
    id: agentId,
    name: config.name,
    type: config.type,
    status: 'active',
    config,
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

  // Publish agent creation event
  publishWorld({
    type: 'AGENT_CREATED',
    worldId,
    agentId,
    agentName: agent.name,
    agentType: agent.type,
    timestamp: new Date().toISOString()
  });

  return agent;
}

/**
 * Remove an agent from a world
 */
export async function removeAgent(worldId: string, agentId: string): Promise<boolean> {
  const world = worlds.get(worldId);
  if (!world || !world.agents.has(agentId)) return false;

  const agent = world.agents.get(agentId);
  
  // Remove from memory
  world.agents.delete(agentId);

  // Remove from disk
  try {
    const agentPath = getAgentPath(worldId, agentId);
    await fs.unlink(agentPath);
  } catch (error) {
    // Rollback memory change if disk operation fails
    if (agent) {
      world.agents.set(agentId, agent);
    }
    throw error;
  }

  // Publish agent removal event
  publishWorld({
    type: 'AGENT_REMOVED',
    worldId,
    agentId,
    agentName: agent?.name,
    timestamp: new Date().toISOString()
  });

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

  // Publish agent update event
  publishWorld({
    type: 'AGENT_UPDATED',
    worldId,
    agentId,
    updates: Object.keys(updates),
    timestamp: new Date().toISOString()
  });

  return updatedAgent;
}

// ===== EVENT SYSTEM =====

/**
 * Publish a world event
 */
export async function publishWorldEvent(worldId: string, type: string, data: any): Promise<void> {
  const world = worlds.get(worldId);
  if (!world) {
    throw new Error(`World ${worldId} not found`);
  }

  await publishWorld({
    type,
    worldId,
    data,
    timestamp: new Date().toISOString()
  });
}

/**
 * Broadcast a message to all agents in a world
 */
export async function broadcastMessage(worldId: string, message: string, sender?: string): Promise<void> {
  const world = worlds.get(worldId);
  if (!world) {
    throw new Error(`World ${worldId} not found`);
  }

  const messagePayload: MessagePayload = {
    name: 'broadcast',
    payload: { message, worldId },
    id: uuidv4(),
    sender: sender || 'system',
    senderType: 'system',
    content: message,
    timestamp: new Date().toISOString(),
    worldId
  };

  await publishMessage(messagePayload);
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

  const messagePayload: MessagePayload = {
    name: 'direct_message',
    payload: { message, worldId, targetId },
    id: uuidv4(),
    sender: sender || 'system',
    senderType: 'system',
    recipient: targetId,
    content: message,
    timestamp: new Date().toISOString(),
    worldId
  };

  await publishMessage(messagePayload);
}

/**
 * Subscribe to world events with filtering
 */
export function subscribeToWorldEvents(worldId: string, callback: (event: any) => void): () => void {
  // Subscribe to world events and filter by worldId
  const unsubscribeWorld = subscribeToWorld((event: any) => {
    if (event.worldId === worldId) {
      callback(event);
    }
  });

  // Subscribe to messages and filter by worldId
  const unsubscribeMessages = subscribeToMessages((event: any) => {
    if (event.worldId === worldId) {
      callback(event);
    }
  });

  // Return combined unsubscribe function
  return () => {
    unsubscribeWorld();
    unsubscribeMessages();
  };
}

/**
 * Subscribe to messages for a specific agent in a world
 */
export function subscribeToAgentMessages(worldId: string, agentId: string, callback: (event: any) => void): () => void {
  return subscribeToMessages((event: any) => {
    if (event.worldId === worldId &&
      (event.recipient === agentId || event.targetId === agentId)) {
      callback(event);
    }
  });
}

/**
 * Test helper: Clear all worlds (for testing only)
 * @internal
 */
export function _clearAllWorldsForTesting(): void {
  worlds.clear();
}
