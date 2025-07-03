/**
 * World Manager Module - CRUD Operations for World Lifecycle
 *
 * Features:
 * - Complete world lifecycle management (create, read, update, delete)
 * - EventEmitter integration for runtime world instances
 * - Agent event subscriptions handled automatically during world loading
 * - Clean separation of storage data from runtime objects
 * - Isolated operations using world-storage.ts
 * - Dynamic imports for browser/Node.js compatibility
 * - Ready for EventBus integration in Phase 3
 *
 * Core Functions:
 * - createWorld: Create new world with configuration
 * - getWorld: Load world configuration only (lightweight)
 * - getFullWorld: Load world with EventEmitter reconstruction and agent subscriptions
 * - updateWorld: Update world configuration
 * - deleteWorld: Remove world and all associated data
 * - listWorlds: Get all world IDs and basic info
 * - getWorldConfig: Get world configuration without runtime objects
 *
 * Implementation:
 * - Wraps world-storage.ts with business logic
 * - Uses only types.ts, utils.ts, and world-storage.ts
 * - Reconstructs EventEmitter and agents Map for runtime World objects
 * - Automatically subscribes agents to world messages during world loading
 * - Storage layer works with plain WorldData (no EventEmitter)
 * - Dynamic imports for storage functions only (browser compatibility)
 */

// Type-only imports
import type { World, CreateWorldParams, UpdateWorldParams, Agent } from './types';
import type { WorldData } from './world-storage';
import { toKebabCase } from './utils';

// Dynamic imports for browser/Node.js compatibility
import { EventEmitter } from 'events';

// Import event functions directly since they work in both environments
import { subscribeAgentToMessages } from './agent-events';

// Dynamic function assignments for storage operations only
let saveWorldToDisk: any;
let loadWorldFromDisk: any;
let deleteWorldFromDisk: any;
let loadAllWorldsFromDisk: any;
let worldExistsOnDisk: any;
let loadAllAgentsFromDisk: any;
let saveAgentConfigToDisk: any;
let createAgentCore: any;
let getAgentCore: any;
let updateAgentCore: any;
let deleteAgentCore: any;
let clearAgentMemoryCore: any;
let listAgentsCore: any;
let updateAgentMemoryCore: any;

// Initialize dynamic imports
async function initializeModules() {
  if (typeof __IS_BROWSER__ === 'undefined' || !__IS_BROWSER__) {
    // Node.js environment - use dynamic imports for storage functions
    const worldStorage = await import('./world-storage');
    const agentStorage = await import('./agent-storage');
    const agentManager = await import('./agent-manager');

    saveWorldToDisk = worldStorage.saveWorldToDisk;
    loadWorldFromDisk = worldStorage.loadWorldFromDisk;
    deleteWorldFromDisk = worldStorage.deleteWorldFromDisk;
    loadAllWorldsFromDisk = worldStorage.loadAllWorldsFromDisk;
    worldExistsOnDisk = worldStorage.worldExistsOnDisk;
    loadAllAgentsFromDisk = agentStorage.loadAllAgentsFromDisk;
    saveAgentConfigToDisk = agentStorage.saveAgentConfigToDisk;
    createAgentCore = agentManager.createAgent;
    getAgentCore = agentManager.getAgent;
    updateAgentCore = agentManager.updateAgent;
    deleteAgentCore = agentManager.deleteAgent;
    clearAgentMemoryCore = agentManager.clearAgentMemory;
    listAgentsCore = agentManager.listAgents;
    updateAgentMemoryCore = agentManager.updateAgentMemory;
  } else {
    // Browser environment - provide no-op implementations for storage functions only
    console.warn('World management functions disabled in browser environment');

    const browserNoOp = () => {
      throw new Error('This function is not available in browser environment');
    };

    saveWorldToDisk = browserNoOp;
    loadWorldFromDisk = browserNoOp;
    deleteWorldFromDisk = browserNoOp;
    loadAllWorldsFromDisk = browserNoOp;
    worldExistsOnDisk = browserNoOp;
    loadAllAgentsFromDisk = browserNoOp;
    saveAgentConfigToDisk = browserNoOp;
    createAgentCore = browserNoOp;
    getAgentCore = browserNoOp;
    updateAgentCore = browserNoOp;
    deleteAgentCore = browserNoOp;
    clearAgentMemoryCore = browserNoOp;
    listAgentsCore = browserNoOp;
    updateAgentMemoryCore = browserNoOp;
  }
}

// Initialize modules immediately
const moduleInitialization = initializeModules();

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
  // Ensure modules are initialized
  await moduleInitialization;

  // Convert name to kebab-case for consistent ID format
  const worldId = toKebabCase(params.name);

  // Check if world already exists
  const exists = await worldExistsOnDisk(rootPath, worldId);
  if (exists) {
    throw new Error(`World with name '${params.name}' already exists`);
  }

  const worldData: WorldData = {
    id: worldId,
    name: params.name,
    description: params.description,
    turnLimit: params.turnLimit || 5
  };

  await saveWorldToDisk(rootPath, worldData);

  // Return runtime World object with EventEmitter and agents Map
  return worldDataToWorld(worldData, rootPath);
}

/**
 * Load world configuration only (lightweight operation)
 * Automatically converts worldId to kebab-case for consistent lookup
 * Note: For full world with agents and events, use subscription layer
 * @deprecated Use getWorldConfig for explicit lightweight access or subscribeWorld for full world
 */
export async function getWorld(rootPath: string, worldId: string): Promise<WorldData | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  // Automatically convert worldId to kebab-case for consistent lookup
  const normalizedWorldId = toKebabCase(worldId);

  const worldData = await loadWorldFromDisk(rootPath, normalizedWorldId);

  if (!worldData) {
    return null;
  }

  return worldData;
}

/**
 * Load full world by ID with EventEmitter reconstruction and agent loading
 * This is the function used by the subscription layer for complete world setup
 * Automatically converts worldId to kebab-case for consistent lookup
 */
export async function getFullWorld(rootPath: string, worldId: string): Promise<World | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  // Automatically convert worldId to kebab-case for consistent lookup
  const normalizedWorldId = toKebabCase(worldId);

  const worldData = await loadWorldFromDisk(rootPath, normalizedWorldId);

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
 * Automatically converts worldId to kebab-case for consistent lookup
 */
export async function updateWorld(rootPath: string, worldId: string, updates: UpdateWorldParams): Promise<World | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  // Automatically convert worldId to kebab-case for consistent lookup
  const normalizedWorldId = toKebabCase(worldId);

  const existingData = await loadWorldFromDisk(rootPath, normalizedWorldId);

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
 * Automatically converts worldId to kebab-case for consistent lookup
 */
export async function deleteWorld(rootPath: string, worldId: string): Promise<boolean> {
  // Ensure modules are initialized
  await moduleInitialization;

  // Automatically convert worldId to kebab-case for consistent lookup
  const normalizedWorldId = toKebabCase(worldId);

  return await deleteWorldFromDisk(rootPath, normalizedWorldId);
}

/**
 * Get all world IDs and basic information
 */
export async function listWorlds(rootPath: string): Promise<WorldInfo[]> {
  // Ensure modules are initialized
  await moduleInitialization;

  const allWorldData = await loadAllWorldsFromDisk(rootPath);

  // Count agents for each world
  const worldsWithAgentCount = await Promise.all(
    allWorldData.map(async (data: WorldData) => {
      try {
        const agents = await loadAllAgentsFromDisk(rootPath, data.id);
        return {
          id: data.id,
          name: data.name,
          description: data.description,
          turnLimit: data.turnLimit || 5,
          agentCount: agents.length
        };
      } catch (error) {
        // If agent loading fails, still return world info with 0 agents
        return {
          id: data.id,
          name: data.name,
          description: data.description,
          turnLimit: data.turnLimit || 5,
          agentCount: 0
        };
      }
    })
  );

  return worldsWithAgentCount;
}

/**
 * Get world configuration without runtime objects (lightweight operation)
 * Automatically converts worldId to kebab-case for consistent lookup
 */
export async function getWorldConfig(rootPath: string, worldId: string): Promise<WorldData | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  // Automatically convert worldId to kebab-case for consistent lookup
  const normalizedWorldId = toKebabCase(worldId);

  const worldData = await loadWorldFromDisk(rootPath, normalizedWorldId);

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
      // Automatically convert agent name to kebab-case for consistent ID
      const agentParams = {
        ...params,
        id: toKebabCase(params.name)
      };

      const agent = await createAgentCore(world.rootPath, world.id, agentParams);
      // Update runtime map
      world.agents.set(agent.id, agent);
      return agent;
    },

    async getAgent(agentName) {
      // Always convert agent name to kebab-case for consistent ID lookup
      const agentId = toKebabCase(agentName);

      try {
        return await getAgentCore(world.rootPath, world.id, agentId);
      } catch (error) {
        return null;
      }
    },

    async updateAgent(agentName, updates) {
      // Always convert agent name to kebab-case for consistent ID lookup
      const agentId = toKebabCase(agentName);

      try {
        const updatedAgent = await updateAgentCore(world.rootPath, world.id, agentId, updates);

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
      // Always convert agent name to kebab-case for consistent ID lookup
      const agentId = toKebabCase(agentName);

      try {
        const success = await deleteAgentCore(world.rootPath, world.id, agentId);

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
      // Always convert agent name to kebab-case for consistent ID lookup
      const agentId = toKebabCase(agentName);

      try {
        const clearedAgent = await clearAgentMemoryCore(world.rootPath, world.id, agentId);

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
      // Always convert agent name to kebab-case for consistent ID lookup
      const agentId = toKebabCase(agentName);

      try {
        const updatedAgent = await updateAgentMemoryCore(world.rootPath, world.id, agentId, messages);

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
      // Always convert agent name to kebab-case for consistent ID lookup
      const agentId = toKebabCase(agentName);

      try {
        const agent = await getAgentCore(world.rootPath, world.id, agentId);

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
