/**
 * Unified Managers Module - World, Agent, and Message Management
 *
 * Features:
 * - Complete world lifecycle management (create, read, update, delete)
 * - Complete agent lifecycle management with configuration and memory
 * - High-level message broadcasting and routing
 * - EventEmitter integration for runtime world instances
 * - Agent event subscriptions handled automatically during world loading
 * - Dynamic imports for browser/Node.js compatibility
 * - Enhanced runtime agent registration and world synchronization
 * - Batch operations for performance optimization
 * - Memory archiving before clearing for data preservation
 *
 * World Functions:
 * - createWorld: Create new world with configuration
 * - getWorld: Load world configuration only (lightweight)
 * - getFullWorld: Load world with EventEmitter reconstruction and agent subscriptions
 * - updateWorld: Update world configuration
 * - deleteWorld: Remove world and all associated data
 * - listWorlds: Get all world IDs and basic info
 * - getWorldConfig: Get world configuration without runtime objects
 *
 * Agent Functions:
 * - createAgent: Create new agent with configuration and system prompt
 * - getAgent: Load agent by ID with full configuration and memory
 * - updateAgent: Update agent configuration and/or memory
 * - deleteAgent: Remove agent and all associated data
 * - listAgents: Get all agent IDs and basic info
 * - updateAgentMemory: Add messages to agent memory
 * - clearAgentMemory: Archive existing memory then reset to empty state and reset LLM call count
 * - loadAgentsIntoWorld: Load all agents from disk into world runtime
 * - syncWorldAgents: Synchronize world agents Map with disk state
 * - createAgentsBatch: Create multiple agents atomically
 * - registerAgentRuntime: Register agent in world runtime without persistence
 *
 * Message Functions:
 * - broadcastMessage: Send message to all agents in world
 * - sendDirectMessage: Send message to specific agent
 * - getWorldMessages: Get message history (placeholder)
 *
 * Implementation:
 * - Wraps storage modules with business logic
 * - Reconstructs EventEmitter and agents Map for runtime World objects
 * - Automatically subscribes agents to world messages during world loading
 * - Storage layer works with plain data objects (no EventEmitter)
 * - Dynamic imports for storage functions only (browser compatibility)
 * - Clean separation of storage data from runtime objects
 * - Complete isolation from other internal modules
 */

// Import logger and initialize function
import { logger, initializeLogger } from './logger.js';

// Type-only imports
import type { World, CreateWorldParams, UpdateWorldParams, Agent, CreateAgentParams, UpdateAgentParams, AgentInfo, AgentMessage, WorldMessageEvent } from './types';
import type { WorldData } from './world-storage';
import { toKebabCase } from './utils';

// Dynamic imports for browser/Node.js compatibility
import { EventEmitter } from 'events';
import { isNodeEnvironment } from './utils.js';

// Import event functions directly since they work in both environments
import { subscribeAgentToMessages, publishMessage } from './events.js';

// Dynamic function assignments for all storage operations
let saveWorldToDisk: any;
let loadWorldFromDisk: any;
let deleteWorldFromDisk: any;
let loadAllWorldsFromDisk: any;
let worldExistsOnDisk: any;
let loadAllAgentsFromDisk: any;
let saveAgentConfigToDisk: any;
let saveAgentToDisk: any;
let saveAgentMemoryToDisk: any;
let loadAgentFromDisk: any;
let loadAgentFromDiskWithRetry: any;
let deleteAgentFromDisk: any;
let loadAllAgentsFromDiskBatch: any;
let agentExistsOnDisk: any;
let validateAgentIntegrity: any;
let repairAgentData: any;
let archiveAgentMemory: any;

// Initialize dynamic imports (consolidated from all managers)
async function initializeModules() {
  // Initialize logger first
  await initializeLogger();

  if (isNodeEnvironment()) {
    // Node.js environment - use dynamic imports for storage functions
    const worldStorage = await import('./world-storage.js');
    const agentStorage = await import('./agent-storage.js');

    // World storage functions
    saveWorldToDisk = worldStorage.saveWorldToDisk;
    loadWorldFromDisk = worldStorage.loadWorldFromDisk;
    deleteWorldFromDisk = worldStorage.deleteWorldFromDisk;
    loadAllWorldsFromDisk = worldStorage.loadAllWorldsFromDisk;
    worldExistsOnDisk = worldStorage.worldExistsOnDisk;

    // Agent storage functions
    loadAllAgentsFromDisk = agentStorage.loadAllAgentsFromDisk;
    saveAgentConfigToDisk = agentStorage.saveAgentConfigToDisk;
    saveAgentToDisk = agentStorage.saveAgentToDisk;
    saveAgentMemoryToDisk = agentStorage.saveAgentMemoryToDisk;
    loadAgentFromDisk = agentStorage.loadAgentFromDisk;
    loadAgentFromDiskWithRetry = agentStorage.loadAgentFromDiskWithRetry;
    deleteAgentFromDisk = agentStorage.deleteAgentFromDisk;
    loadAllAgentsFromDiskBatch = agentStorage.loadAllAgentsFromDiskBatch;
    agentExistsOnDisk = agentStorage.agentExistsOnDisk;
    validateAgentIntegrity = agentStorage.validateAgentIntegrity;
    repairAgentData = agentStorage.repairAgentData;
    archiveAgentMemory = agentStorage.archiveAgentMemory;
  } else {
    // Browser environment - provide NoOp implementations with debug logging
    logger.warn('Storage operations disabled in browser environment');

    // World storage NoOps
    saveWorldToDisk = async (rootPath: string, worldData: any) => {
      logger.debug('NoOp: saveWorldToDisk called in browser', { worldId: worldData?.id });
    };

    loadWorldFromDisk = async (rootPath: string, worldId: string) => {
      logger.debug('NoOp: loadWorldFromDisk called in browser', { worldId });
      return null;
    };

    deleteWorldFromDisk = async (rootPath: string, worldId: string) => {
      logger.debug('NoOp: deleteWorldFromDisk called in browser', { worldId });
      return false;
    };

    loadAllWorldsFromDisk = async (rootPath: string) => {
      logger.debug('NoOp: loadAllWorldsFromDisk called in browser');
      return [];
    };

    worldExistsOnDisk = async (rootPath: string, worldId: string) => {
      logger.debug('NoOp: worldExistsOnDisk called in browser', { worldId });
      return false;
    };

    // Agent storage NoOps
    loadAllAgentsFromDisk = async (rootPath: string, worldId: string) => {
      logger.debug('NoOp: loadAllAgentsFromDisk called in browser', { worldId });
      return [];
    };

    saveAgentConfigToDisk = async (rootPath: string, worldId: string, agent: any) => {
      logger.debug('NoOp: saveAgentConfigToDisk called in browser', { worldId, agentId: agent?.id });
    };

    saveAgentToDisk = async (rootPath: string, worldId: string, agent: any) => {
      logger.debug('NoOp: saveAgentToDisk called in browser', { worldId, agentId: agent?.id });
    };

    saveAgentMemoryToDisk = async (rootPath: string, worldId: string, agentId: string, memory: any[]) => {
      logger.debug('NoOp: saveAgentMemoryToDisk called in browser', { worldId, agentId, memoryLength: memory?.length });
    };

    loadAgentFromDisk = async (rootPath: string, worldId: string, agentId: string) => {
      logger.debug('NoOp: loadAgentFromDisk called in browser', { worldId, agentId });
      return null;
    };

    loadAgentFromDiskWithRetry = async (rootPath: string, worldId: string, agentId: string, options?: any) => {
      logger.debug('NoOp: loadAgentFromDiskWithRetry called in browser', { worldId, agentId });
      return null;
    };

    deleteAgentFromDisk = async (rootPath: string, worldId: string, agentId: string) => {
      logger.debug('NoOp: deleteAgentFromDisk called in browser', { worldId, agentId });
      return false;
    };

    loadAllAgentsFromDiskBatch = async (rootPath: string, worldId: string, options?: any) => {
      logger.debug('NoOp: loadAllAgentsFromDiskBatch called in browser', { worldId });
      return { successful: [], failed: [] };
    };

    agentExistsOnDisk = async (rootPath: string, worldId: string, agentId: string) => {
      logger.debug('NoOp: agentExistsOnDisk called in browser', { worldId, agentId });
      return false;
    };

    validateAgentIntegrity = async (rootPath: string, worldId: string, agentId: string) => {
      logger.debug('NoOp: validateAgentIntegrity called in browser', { worldId, agentId });
      return true;
    };

    repairAgentData = async (rootPath: string, worldId: string, agentId: string) => {
      logger.debug('NoOp: repairAgentData called in browser', { worldId, agentId });
      return false;
    };

    archiveAgentMemory = async (rootPath: string, worldId: string, agentId: string, memory: any[]) => {
      logger.debug('NoOp: archiveAgentMemory called in browser', { worldId, agentId, memoryLength: memory?.length });
    };
  }
}

// Initialize modules immediately
const moduleInitialization = initializeModules();

// ========================
// WORLD MANAGEMENT
// ========================

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

  logger.debug('getWorldConfig called', {
    originalWorldId: worldId,
    normalizedWorldId,
    rootPath
  });

  const worldData = await loadWorldFromDisk(rootPath, normalizedWorldId);

  logger.debug('loadWorldFromDisk result', {
    worldFound: !!worldData,
    worldId: worldData?.id,
    worldName: worldData?.name,
    agentsLength: worldData?.agents?.length || 0
  });

  if (!worldData) {
    logger.debug('World not found, returning null');
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

      const agent = await createAgent(world.rootPath, world.id, agentParams);
      // Update runtime map
      world.agents.set(agent.id, agent);
      return agent;
    },

    async getAgent(agentName) {
      // Always convert agent name to kebab-case for consistent ID lookup
      const agentId = toKebabCase(agentName);

      try {
        return await getAgent(world.rootPath, world.id, agentId);
      } catch (error) {
        return null;
      }
    },

    async updateAgent(agentName, updates) {
      // Always convert agent name to kebab-case for consistent ID lookup
      const agentId = toKebabCase(agentName);

      try {
        const updatedAgent = await updateAgent(world.rootPath, world.id, agentId, updates);

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
        const success = await deleteAgent(world.rootPath, world.id, agentId);

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

      logger.debug('World.clearAgentMemory called', {
        originalAgentName: agentName,
        convertedAgentId: agentId,
        worldRootPath: world.rootPath,
        worldId: world.id,
        agentsInMap: Array.from(world.agents.keys())
      });

      try {
        const clearedAgent = await clearAgentMemory(world.rootPath, world.id, agentId);

        logger.debug('Core clearAgentMemory result', {
          success: !!clearedAgent,
          clearedAgentId: clearedAgent?.id,
          clearedAgentName: clearedAgent?.name,
          memoryLength: clearedAgent?.memory?.length || 0
        });

        if (clearedAgent) {
          // Update runtime map
          world.agents.set(clearedAgent.id, clearedAgent);
          logger.debug('Updated world.agents map with cleared agent');
        }
        return clearedAgent;
      } catch (error) {
        logger.error('clearAgentMemory error in world manager', { agentName, error: error instanceof Error ? error.message : error });
        return null;
      }
    },

    async listAgents() {
      try {
        return await listAgents(world.rootPath, world.id);
      } catch (error) {
        return [];
      }
    },

    async updateAgentMemory(agentName, messages) {
      // Always convert agent name to kebab-case for consistent ID lookup
      const agentId = toKebabCase(agentName);

      try {
        const updatedAgent = await updateAgentMemory(world.rootPath, world.id, agentId, messages);

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
        const agent = await getAgent(world.rootPath, world.id, agentId);

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

// ========================
// AGENT MANAGEMENT
// ========================

/**
 * Batch agent creation parameters
 */
export interface BatchCreateParams {
  agents: CreateAgentParams[];
  failOnError?: boolean;
  maxConcurrency?: number;
}

/**
 * Batch creation result
 */
export interface BatchCreateResult {
  successful: Agent[];
  failed: Array<{ params: CreateAgentParams; error: string }>;
  totalCount: number;
  successCount: number;
  failureCount: number;
}

/**
 * Agent runtime registration options
 */
export interface RuntimeRegistrationOptions {
  updateWorldMap?: boolean;
  validateAgent?: boolean;
}

/**
 * World synchronization result
 */
export interface WorldSyncResult {
  loadedCount: number;
  errorCount: number;
  repairedCount: number;
  errors: Array<{ agentId: string; error: string }>;
}

/**
 * Register agent in world runtime without persistence
 */
export async function registerAgentRuntime(
  rootPath: string,
  worldId: string,
  agent: Agent,
  options: RuntimeRegistrationOptions = {}
): Promise<boolean> {
  // Ensure modules are initialized
  await moduleInitialization;

  const {
    updateWorldMap = true,
    validateAgent = false
  } = options;

  try {
    // Validate agent if requested
    if (validateAgent) {
      if (!agent.id || !agent.type || !agent.name || !agent.provider || !agent.model) {
        throw new Error('Invalid agent structure for runtime registration');
      }
    }

    // Agent registration is handled by world-manager
    // Event subscriptions are handled automatically when world loads agents

    return true;
  } catch {
    return false;
  }
}

/**
 * Load all agents from disk into world runtime
 */
export async function loadAgentsIntoWorld(
  rootPath: string,
  worldId: string,
  options: any = {}
): Promise<WorldSyncResult> {
  // Ensure modules are initialized
  await moduleInitialization;

  const { repairCorrupted = true, ...loadOptions } = options;

  const result: WorldSyncResult = {
    loadedCount: 0,
    errorCount: 0,
    repairedCount: 0,
    errors: []
  };

  try {
    // Load agents using batch loading
    const batchResult = await loadAllAgentsFromDiskBatch(rootPath, worldId, loadOptions);

    // Register successful agents in runtime
    for (const agent of batchResult.successful) {
      const registered = await registerAgentRuntime(rootPath, worldId, agent, {
        updateWorldMap: true,
        validateAgent: false // Already validated during loading
      });

      if (registered) {
        result.loadedCount++;
      } else {
        result.errors.push({
          agentId: agent.id,
          error: 'Failed to register agent in runtime'
        });
        result.errorCount++;
      }
    }

    // Handle failed loads
    for (const failure of batchResult.failed) {
      if (repairCorrupted && failure.agentId !== 'SYSTEM') {
        // Attempt to repair the agent
        const repaired = await repairAgentData(rootPath, worldId, failure.agentId);
        if (repaired) {
          result.repairedCount++;

          // Try loading again after repair
          const agent = await loadAgentFromDiskWithRetry(rootPath, worldId, failure.agentId, loadOptions);
          if (agent) {
            const registered = await registerAgentRuntime(rootPath, worldId, agent);
            if (registered) {
              result.loadedCount++;
            } else {
              result.errors.push({
                agentId: failure.agentId,
                error: 'Failed to register repaired agent in runtime'
              });
              result.errorCount++;
            }
          } else {
            result.errors.push({
              agentId: failure.agentId,
              error: 'Failed to load agent after repair'
            });
            result.errorCount++;
          }
        } else {
          result.errors.push({
            agentId: failure.agentId,
            error: `Repair failed: ${failure.error}`
          });
          result.errorCount++;
        }
      } else {
        result.errors.push(failure);
        result.errorCount++;
      }
    }

  } catch (error) {
    result.errors.push({
      agentId: 'SYSTEM',
      error: error instanceof Error ? error.message : 'Unknown error during world sync'
    });
    result.errorCount++;
  }

  return result;
}

/**
 * Synchronize world agents Map with disk state
 */
export async function syncWorldAgents(rootPath: string, worldId: string): Promise<WorldSyncResult> {
  // Ensure modules are initialized
  await moduleInitialization;

  return loadAgentsIntoWorld(rootPath, worldId, {
    includeMemory: true,
    allowPartialLoad: true,
    validateIntegrity: true,
    repairCorrupted: true
  });
}

/**
 * Create multiple agents atomically
 */
export async function createAgentsBatch(rootPath: string, worldId: string, params: BatchCreateParams): Promise<BatchCreateResult> {
  // Ensure modules are initialized
  await moduleInitialization;

  const { agents, failOnError = false, maxConcurrency = 5 } = params;

  const result: BatchCreateResult = {
    successful: [],
    failed: [],
    totalCount: agents.length,
    successCount: 0,
    failureCount: 0
  };

  // Process agents in batches to avoid overwhelming the system
  const batches: CreateAgentParams[][] = [];
  for (let i = 0; i < agents.length; i += maxConcurrency) {
    batches.push(agents.slice(i, i + maxConcurrency));
  }

  for (const batch of batches) {
    const batchPromises = batch.map(async (agentParams) => {
      try {
        const agent = await createAgent(rootPath, worldId, agentParams);
        result.successful.push(agent);
        result.successCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.failed.push({ params: agentParams, error: errorMessage });
        result.failureCount++;

        if (failOnError) {
          throw error;
        }
      }
    });

    try {
      await Promise.all(batchPromises);
    } catch (error) {
      if (failOnError) {
        throw error;
      }
    }
  }

  return result;
}

/**
 * Create new agent with configuration and system prompt
 */
export async function createAgent(rootPath: string, worldId: string, params: CreateAgentParams): Promise<Agent> {
  // Ensure modules are initialized
  await moduleInitialization;

  // Automatically generate ID from name if not provided
  const agentId = params.id || toKebabCase(params.name);

  // Check if agent already exists
  const exists = await agentExistsOnDisk(rootPath, worldId, agentId);
  if (exists) {
    throw new Error(`Agent with ID '${agentId}' already exists`);
  }

  const now = new Date();
  const agent: Agent = {
    id: agentId,
    name: params.name,
    type: params.type,
    status: 'inactive',
    provider: params.provider,
    model: params.model,
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    systemPrompt: params.systemPrompt,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    createdAt: now,
    lastActive: now,
    llmCallCount: 0,
    memory: []
  };

  // Save configuration and system prompt (config.json + system-prompt.md)
  // Memory starts empty and is saved separately to memory.json
  await saveAgentToDisk(rootPath, worldId, agent);

  // Register in runtime
  const registered = await registerAgentRuntime(rootPath, worldId, agent, {
    updateWorldMap: true,
    validateAgent: false
  });

  if (!registered) {
    // Clean up if runtime registration failed
    await deleteAgentFromDisk(rootPath, worldId, agent.id);
    throw new Error('Failed to register agent in world runtime');
  }

  return agent;
}

/**
 * Load agent by ID with full configuration and memory
 */
export async function getAgent(rootPath: string, worldId: string, agentId: string): Promise<Agent | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  return await loadAgentFromDisk(rootPath, worldId, agentId);
}

/**
 * Update agent configuration and/or memory
 */
export async function updateAgent(rootPath: string, worldId: string, agentId: string, updates: UpdateAgentParams): Promise<Agent | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  const existingAgent = await loadAgentFromDisk(rootPath, worldId, agentId);

  if (!existingAgent) {
    return null;
  }

  // Merge updates with existing agent
  const updatedAgent: Agent = {
    ...existingAgent,
    name: updates.name || existingAgent.name,
    type: updates.type || existingAgent.type,
    status: updates.status || existingAgent.status,
    provider: updates.provider || existingAgent.provider,
    model: updates.model || existingAgent.model,
    apiKey: updates.apiKey !== undefined ? updates.apiKey : existingAgent.apiKey,
    baseUrl: updates.baseUrl !== undefined ? updates.baseUrl : existingAgent.baseUrl,
    systemPrompt: updates.systemPrompt !== undefined ? updates.systemPrompt : existingAgent.systemPrompt,
    temperature: updates.temperature !== undefined ? updates.temperature : existingAgent.temperature,
    maxTokens: updates.maxTokens !== undefined ? updates.maxTokens : existingAgent.maxTokens,
    azureEndpoint: updates.azureEndpoint !== undefined ? updates.azureEndpoint : existingAgent.azureEndpoint,
    azureApiVersion: updates.azureApiVersion !== undefined ? updates.azureApiVersion : existingAgent.azureApiVersion,
    azureDeployment: updates.azureDeployment !== undefined ? updates.azureDeployment : existingAgent.azureDeployment,
    ollamaBaseUrl: updates.ollamaBaseUrl !== undefined ? updates.ollamaBaseUrl : existingAgent.ollamaBaseUrl,
    lastActive: new Date()
  };

  await saveAgentConfigToDisk(rootPath, worldId, updatedAgent);
  return updatedAgent;
}

/**
 * Delete agent and all associated data
 */
export async function deleteAgent(rootPath: string, worldId: string, agentId: string): Promise<boolean> {
  // Ensure modules are initialized
  await moduleInitialization;

  return await deleteAgentFromDisk(rootPath, worldId, agentId);
}

/**
 * Get all agent IDs and basic information
 */
export async function listAgents(rootPath: string, worldId: string): Promise<AgentInfo[]> {
  // Ensure modules are initialized
  await moduleInitialization;

  const allAgents = await loadAllAgentsFromDisk(rootPath, worldId);

  return allAgents.map((agent: Agent) => ({
    id: agent.id,
    name: agent.name,
    type: agent.type,
    model: agent.model,
    status: agent.status,
    createdAt: agent.createdAt,
    lastActive: agent.lastActive,
    memorySize: agent.memory.length,
    llmCallCount: agent.llmCallCount
  }));
}

/**
 * Add messages to agent memory
 */
export async function updateAgentMemory(rootPath: string, worldId: string, agentId: string, messages: AgentMessage[]): Promise<Agent | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  const existingAgent = await loadAgentFromDisk(rootPath, worldId, agentId);

  if (!existingAgent) {
    return null;
  }

  const updatedAgent: Agent = {
    ...existingAgent,
    memory: [...existingAgent.memory, ...messages],
    lastActive: new Date()
  };

  // Save memory to memory.json and update config timestamps
  await saveAgentMemoryToDisk(rootPath, worldId, agentId, updatedAgent.memory);
  await saveAgentConfigToDisk(rootPath, worldId, updatedAgent);
  return updatedAgent;
}

/**
 * Clear agent memory (archive current memory then reset to empty state)
 * Also resets the LLM call count to 0
 */
export async function clearAgentMemory(rootPath: string, worldId: string, agentId: string): Promise<Agent | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  logger.debug('Core clearAgentMemory called', {
    rootPath,
    worldId,
    agentId
  });

  const existingAgent = await loadAgentFromDisk(rootPath, worldId, agentId);

  logger.debug('loadAgentFromDisk result', {
    agentFound: !!existingAgent,
    agentName: existingAgent?.name,
    memoryLength: existingAgent?.memory?.length || 0,
    currentLLMCallCount: existingAgent?.llmCallCount || 0
  });

  if (!existingAgent) {
    logger.debug('Agent not found on disk, returning null');
    return null;
  }

  // Archive current memory if it exists and has content
  if (existingAgent.memory && existingAgent.memory.length > 0) {
    try {
      logger.debug('Archiving existing memory');
      await archiveAgentMemory(rootPath, worldId, agentId, existingAgent.memory);
      logger.debug('Memory archived successfully');
    } catch (error) {
      logger.warn('Failed to archive memory', { agentId, error: error instanceof Error ? error.message : error });
      // Continue with clearing even if archiving fails
    }
  }

  const updatedAgent: Agent = {
    ...existingAgent,
    memory: [],
    llmCallCount: 0,
    lastActive: new Date()
  };

  logger.debug('Saving cleared memory to disk');

  // Save empty memory to memory.json and update config timestamps
  await saveAgentMemoryToDisk(rootPath, worldId, agentId, []);
  await saveAgentConfigToDisk(rootPath, worldId, updatedAgent);

  logger.debug('Memory and LLM call count cleared and saved successfully', {
    agentId,
    newLLMCallCount: updatedAgent.llmCallCount
  });
  return updatedAgent;
}

/**
 * Get agent configuration without memory (lightweight operation)
 */
export async function getAgentConfig(rootPath: string, worldId: string, agentId: string): Promise<Omit<Agent, 'memory'> | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  const agent = await loadAgentFromDisk(rootPath, worldId, agentId);

  if (!agent) {
    return null;
  }

  const { memory, ...config } = agent;
  return config;
}

// ========================
// MESSAGE MANAGEMENT
// ========================

/**
 * Broadcast message to all agents in a world
 */
export async function broadcastMessage(rootPath: string, worldId: string, message: string, sender?: string): Promise<void> {
  const world = await getFullWorld(rootPath, worldId);
  if (!world) {
    throw new Error(`World ${worldId} not found`);
  }

  publishMessage(world, message, sender || 'HUMAN');
}

/**
 * Send direct message to specific agent
 */
export async function sendDirectMessage(
  rootPath: string,
  worldId: string,
  targetAgentId: string,
  message: string,
  sender?: string
): Promise<void> {
  const world = await getFullWorld(rootPath, worldId);
  if (!world) {
    throw new Error(`World ${worldId} not found`);
  }

  const targetAgent = world.agents.get(targetAgentId);
  if (!targetAgent) {
    throw new Error(`Agent ${targetAgentId} not found in world ${worldId}`);
  }

  // Publish with target information for filtering
  publishMessage(world, `@${targetAgentId} ${message}`, sender || 'HUMAN');
}

/**
 * Get world message history (placeholder for future implementation)
 */
export async function getWorldMessages(worldId: string): Promise<WorldMessageEvent[]> {
  // Implementation depends on if you want to track message history
  // Could store in World object or separate storage
  return [];
}
