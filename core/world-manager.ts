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

// Static imports for better ES module compatibility
import { EventEmitter } from 'events';
import { World, CreateWorldParams, UpdateWorldParams, Agent } from './types';
import { toKebabCase } from './utils';

// Storage operations with conditional compilation for browser/Node.js
import {
  saveWorldToDisk,
  loadWorldFromDisk,
  deleteWorldFromDisk,
  loadAllWorldsFromDisk,
  worldExistsOnDisk,
  type WorldData
} from './world-storage';

import {
  loadAllAgentsFromDisk,
  saveAgentConfigToDisk
} from './agent-storage';

import { subscribeAgentToMessages } from './agent-events';

// Import agent-manager functions
import {
  createAgent as createAgentCore,
  getAgent as getAgentCore,
  updateAgent as updateAgentCore,
  deleteAgent as deleteAgentCore,
  clearAgentMemory as clearAgentMemoryCore,
  listAgents as listAgentsCore,
  updateAgentMemory as updateAgentMemoryCore
} from './agent-manager';

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
export async function createWorld(rootPath: string, params: CreateWorldParams): Promise<World> {
  // Check if world already exists
  const exists = await worldExistsOnDisk(rootPath, params.name);
  if (exists) {
    throw new Error(`World with name '${params.name}' already exists`);
  }

  const worldData: WorldData = {
    id: params.name,
    name: params.name,
    description: params.description,
    turnLimit: params.turnLimit || 5
  };

  await saveWorldToDisk(rootPath, worldData);

  // Return runtime World object with EventEmitter and agents Map
  return worldDataToWorld(worldData, rootPath);
}

/**
 * Load world by ID with EventEmitter reconstruction
 */
export async function getWorld(rootPath: string, worldId: string): Promise<World | null> {
  const worldData = await loadWorldFromDisk(rootPath, worldId);

  if (!worldData) {
    return null;
  }

  // Create runtime World with fresh EventEmitter and methods
  const world = worldDataToWorld(worldData, rootPath);

  // Load agents and subscribe them to messages
  const agents = await loadAllAgentsFromDisk(rootPath, worldId);
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
export async function updateWorld(rootPath: string, worldId: string, updates: UpdateWorldParams): Promise<World | null> {
  const existingData = await loadWorldFromDisk(rootPath, worldId);

  if (!existingData) {
    return null;
  }

  // Merge updates with existing configuration
  const updatedData: WorldData = {
    ...existingData,
    ...updates
  };

  await saveWorldToDisk(rootPath, updatedData);
  return worldDataToWorld(updatedData, rootPath);
}

/**
 * Delete world and all associated data
 */
export async function deleteWorld(rootPath: string, worldId: string): Promise<boolean> {
  return await deleteWorldFromDisk(rootPath, worldId);
}

/**
 * Get all world IDs and basic information
 */
export async function listWorlds(rootPath: string): Promise<WorldInfo[]> {
  const allWorldData = await loadAllWorldsFromDisk(rootPath);

  return allWorldData.map((data: WorldData) => ({
    id: data.id,
    name: data.name,
    description: data.description,
    turnLimit: data.turnLimit || 5,
    agentCount: 0 // TODO: Count agents in world directory when implemented
  }));
}

/**
 * Get world configuration without runtime objects (lightweight operation)
 */
export async function getWorldConfig(rootPath: string, worldId: string): Promise<WorldData | null> {
  const worldData = await loadWorldFromDisk(rootPath, worldId);

  if (!worldData) {
    return null;
  }

  return worldData;
}

/**
 * Convert storage WorldData to runtime World object
 * Reconstructs EventEmitter and agents Map for runtime use
 */
function worldDataToWorld(data: WorldData, rootPath: string): World {
  const world: World = {
    id: data.id,
    rootPath: rootPath,
    name: data.name,
    description: data.description,
    turnLimit: data.turnLimit,
    eventEmitter: new EventEmitter(),
    agents: new Map(), // Empty agents map - to be populated by agent manager

    // Agent operation methods
    async createAgent(params) {
      const agent = await createAgentCore(world.rootPath, world.id, params);
      // Update runtime map
      world.agents.set(agent.id, agent);
      return agent;
    },

    async getAgent(agentName) {
      // Try to find agent by name or ID
      let agentId = agentName;

      try {
        // First try with the provided name as-is
        let agent = await getAgentCore(world.rootPath, world.id, agentId);

        // If not found, try with kebab-case conversion
        if (!agent) {
          agentId = toKebabCase(agentName);
          agent = await getAgentCore(world.rootPath, world.id, agentId);
        }

        return agent;
      } catch (error) {
        return null;
      }
    },

    async updateAgent(agentName, updates) {
      // Try to find agent by name or ID
      let agentId = agentName;

      try {
        // First try with the provided name as-is
        let updatedAgent = await updateAgentCore(world.rootPath, world.id, agentId, updates);

        // If not found, try with kebab-case conversion
        if (!updatedAgent) {
          agentId = toKebabCase(agentName);
          updatedAgent = await updateAgentCore(world.rootPath, world.id, agentId, updates);
        }

        if (updatedAgent) {
          // Update runtime map
          world.agents.set(updatedAgent.id, updatedAgent);
        }
        return updatedAgent;
      } catch (error) {
        return null;
      }
    },

    async deleteAgent(agentName) {
      // Try to find agent by name or ID
      let agentId = agentName;

      try {
        // First try with the provided name as-is
        let success = await deleteAgentCore(world.rootPath, world.id, agentId);

        // If not found, try with kebab-case conversion
        if (!success) {
          agentId = toKebabCase(agentName);
          success = await deleteAgentCore(world.rootPath, world.id, agentId);
        }

        if (success) {
          // Remove from runtime map
          world.agents.delete(agentId);
        }
        return success;
      } catch (error) {
        return false;
      }
    },

    async clearAgentMemory(agentName) {
      // Try to find agent by name or ID
      let agentId = agentName;

      try {
        // First try with the provided name as-is
        let clearedAgent = await clearAgentMemoryCore(world.rootPath, world.id, agentId);

        // If not found, try with kebab-case conversion
        if (!clearedAgent) {
          agentId = toKebabCase(agentName);
          clearedAgent = await clearAgentMemoryCore(world.rootPath, world.id, agentId);
        }

        if (clearedAgent) {
          // Update runtime map
          world.agents.set(clearedAgent.id, clearedAgent);
        }
        return clearedAgent;
      } catch (error) {
        return null;
      }
    },

    async listAgents() {
      try {
        return await listAgentsCore(world.rootPath, world.id);
      } catch (error) {
        return [];
      }
    },

    async updateAgentMemory(agentName, messages) {
      // Try to find agent by name or ID
      let agentId = agentName;

      try {
        // First try with the provided name as-is
        let updatedAgent = await updateAgentMemoryCore(world.rootPath, world.id, agentId, messages);

        // If not found, try with kebab-case conversion
        if (!updatedAgent) {
          agentId = toKebabCase(agentName);
          updatedAgent = await updateAgentMemoryCore(world.rootPath, world.id, agentId, messages);
        }

        if (updatedAgent) {
          // Update runtime map
          world.agents.set(updatedAgent.id, updatedAgent);
        }
        return updatedAgent;
      } catch (error) {
        return null;
      }
    },

    async saveAgentConfig(agentName) {
      // Try to find agent by name or ID
      let agentId = agentName;

      try {
        // First try with the provided name as-is
        let agent = await getAgentCore(world.rootPath, world.id, agentId);

        // If not found, try with kebab-case conversion
        if (!agent) {
          agentId = toKebabCase(agentName);
          agent = await getAgentCore(world.rootPath, world.id, agentId);
        }

        if (!agent) {
          throw new Error(`Agent ${agentName} not found`);
        }

        // Save only agent configuration without memory
        await saveAgentConfigToDisk(world.rootPath, world.id, agent);
      } catch (error) {
        throw error;
      }
    },

    // World operation methods
    async save() {
      const worldData: WorldData = {
        id: world.id,
        name: world.name,
        description: world.description,
        turnLimit: world.turnLimit
      };
      await saveWorldToDisk(world.rootPath, worldData);
    },

    async delete() {
      return await deleteWorldFromDisk(world.rootPath, world.id);
    },

    async reload() {
      const worldData = await loadWorldFromDisk(world.rootPath, world.id);
      if (worldData) {
        world.name = worldData.name;
        world.description = worldData.description;
        world.turnLimit = worldData.turnLimit;
      }
    }
  };

  return world;
}
