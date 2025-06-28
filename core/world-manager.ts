/**
 * World Manager Module - CRUD Operations for World Lifecycle
 *
 * Features:
 * - Complete world lifecycle management (create, read, update, delete)
 * - EventEmitter integration for runtime world instances
 * - Clean separation of storage data from runtime objects
 * - Isolated operations using world-storage.ts
 * - Ready for EventBus integration in Phase 3
 *
 * Core Functions:
 * - createWorld: Create new world with configuration
 * - getWorld: Load world by ID with EventEmitter reconstruction
 * - updateWorld: Update world configuration
 * - deleteWorld: Remove world and all associated data
 * - listWorlds: Get all world IDs and basic info
 * - getWorldConfig: Get world configuration without runtime objects
 *
 * Implementation:
 * - Wraps world-storage.ts with business logic
 * - Uses only types.ts, utils.ts, and world-storage.ts
 * - Reconstructs EventEmitter and agents Map for runtime World objects
 * - Storage layer works with plain WorldData (no EventEmitter)
 */

import { EventEmitter } from 'events';
import { World, WorldConfig } from './types.js';
import {
  WorldData,
  saveWorldToDisk,
  loadWorldFromDisk,
  deleteWorldFromDisk,
  loadAllWorldsFromDisk,
  worldExistsOnDisk
} from './world-storage.js';
import { loadAllAgentsFromDisk } from './agent-storage.js';
import { subscribeAgentToMessages } from './agent-events.js';

/**
 * World creation parameters
 */
export interface CreateWorldParams {
  name: string;
  description?: string;
  turnLimit?: number;
}

/**
 * World update parameters (partial update support)
 */
export interface UpdateWorldParams {
  name?: string;
  description?: string;
  turnLimit?: number;
}

/**
 * World listing information
 */
export interface WorldInfo {
  id: string;
  name: string;
  description?: string;
  turnLimit: number;
  agentCount: number;
}

/**
 * Get root directory from environment variable or default
 */
function getRootDirectory(): string {
  return process.env.AGENT_WORLD_DATA_PATH || './data/worlds';
}

/**
 * Create new world with configuration
 */
export async function createWorld(params: CreateWorldParams): Promise<World> {
  const root = getRootDirectory();

  // Check if world already exists
  const exists = await worldExistsOnDisk(root, params.name);
  if (exists) {
    throw new Error(`World with name '${params.name}' already exists`);
  }

  const worldData: WorldData = {
    id: params.name,
    config: {
      name: params.name,
      description: params.description,
      turnLimit: params.turnLimit || 5
    }
  };

  await saveWorldToDisk(root, worldData);

  // Return runtime World object with EventEmitter and agents Map
  return worldDataToWorld(worldData);
}

/**
 * Load world by ID with EventEmitter reconstruction
 */
export async function getWorld(worldId: string): Promise<World | null> {
  const root = getRootDirectory();
  const worldData = await loadWorldFromDisk(root, worldId);

  if (!worldData) {
    return null;
  }

  // Create runtime World with fresh EventEmitter
  const world: World = {
    id: worldData.id,
    config: worldData.config,
    eventEmitter: new EventEmitter(), // ← Fresh EventEmitter
    agents: new Map()
  };

  // Load agents and subscribe them to messages
  const agents = await loadAllAgentsFromDisk(worldId);
  for (const agent of agents) {
    world.agents.set(agent.id, agent);
    // Automatically subscribe agent to world messages
    subscribeAgentToMessages(world, agent);
  }

  return world;
}

/**
 * Update world configuration
 */
export async function updateWorld(worldId: string, updates: UpdateWorldParams): Promise<World | null> {
  const root = getRootDirectory();
  const existingData = await loadWorldFromDisk(root, worldId);

  if (!existingData) {
    return null;
  }

  // Merge updates with existing configuration
  const updatedData: WorldData = {
    ...existingData,
    config: {
      ...existingData.config,
      ...updates
    }
  };

  await saveWorldToDisk(root, updatedData);
  return worldDataToWorld(updatedData);
}

/**
 * Delete world and all associated data
 */
export async function deleteWorld(worldId: string): Promise<boolean> {
  const root = getRootDirectory();
  return await deleteWorldFromDisk(root, worldId);
}

/**
 * Get all world IDs and basic information
 */
export async function listWorlds(): Promise<WorldInfo[]> {
  const root = getRootDirectory();
  const allWorldData = await loadAllWorldsFromDisk(root);

  return allWorldData.map(data => ({
    id: data.id,
    name: data.config.name,
    description: data.config.description,
    turnLimit: data.config.turnLimit || 5,
    agentCount: 0 // TODO: Count agents in world directory when implemented
  }));
}

/**
 * Get world configuration without runtime objects (lightweight operation)
 */
export async function getWorldConfig(worldId: string): Promise<WorldConfig | null> {
  const root = getRootDirectory();
  const worldData = await loadWorldFromDisk(root, worldId);

  if (!worldData) {
    return null;
  }

  return worldData.config;
}

/**
 * Convert storage WorldData to runtime World object
 * Reconstructs EventEmitter and agents Map for runtime use
 */
function worldDataToWorld(data: WorldData): World {
  return {
    id: data.id,
    config: data.config,
    eventEmitter: new EventEmitter(),
    agents: new Map() // Empty agents map - to be populated by agent manager
  };
}
