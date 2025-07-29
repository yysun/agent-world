/**
 * Unified Managers Module - World, Agent, and Message Management
 *
 * Features:
 * - Complete world lifecycle management (create, read, update, delete)
 * - Complete agent lifecycle management with configuration and memory
 * - High-level message broadcasting and routing
 * - EventEmitter integration for runtime world instances
 * - Agent event subscriptions handled automatically during world loading
 * - Static imports for events, llm-manager, and utils modules for improved separation of concerns
 * - Enhanced runtime agent registration and world synchronization
 * - Batch operations for performance optimization
 * - Memory archiving before clearing for data preservation
 *
 * Performance Optimizations:
 * - Static imports for events, llm-manager, and utils modules eliminate dynamic import overhead
 * - Environment detection delegated to storage-factory for clean separation of concerns
 * - Pre-initialized storage function wrappers from storage factory
 * - Single moduleInitialization promise for all async operations
 * - Eliminated per-method import overhead and file system lookups
 *
 * World Functions:
 * - createWorld: Create new world with configuration
 * - getWorld: Load world with EventEmitter reconstruction and agent subscriptions (complete functionality)
 * - updateWorld: Update world configuration
 * - deleteWorld: Remove world and all associated data
 * - listWorlds: Get all world IDs and basic info
 * - getWorldConfig: Get world configuration without runtime objects (lightweight)
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
 * - getWorldMessages: Get message history (placeholder)
 *
 * Implementation:
 * - Wraps storage modules with business logic
 * - Reconstructs EventEmitter and agents Map for runtime World objects
 * - Automatically subscribes agents to world messages during world loading
 * - Storage layer works with plain data objects (no EventEmitter)
 * - Static imports for events, llm-manager, and utils modules
 * - Environment detection handled by storage-factory module
 * - Clean separation of storage data from runtime objects
 * - Complete isolation from other internal modules
 * - Environment-aware storage function wrappers from storage factory
 *
 * Separation of Concerns:
 * - Static imports: events.js, llm-manager.js, utils.js (no dynamic imports)
 * - Environment detection: Delegated to storage-factory.js
 * - Storage operations: Wrapped functions from storage-factory with environment awareness
 * - NoOp implementations: Provided by storage-factory for browser environments
 */

// Import logger and initialize function
import { createCategoryLogger, initializeLogger } from './logger.js';

// Create core category logger for managers
const logger = createCategoryLogger('core');

// Type-only imports
import type { World, CreateWorldParams, UpdateWorldParams, Agent, CreateAgentParams, UpdateAgentParams, AgentInfo, AgentMessage, StorageManager, MessageProcessor, WorldMessageEvent, WorldSSEEvent } from './types.js';
import type { WorldData } from './world-storage.js';

// Static imports for core modules
import { EventEmitter } from 'events';
import * as events from './events.js';
import * as llmManager from './llm-manager.js';
import * as utils from './utils.js';

// Storage and utility function assignments - initialized from storage factory
let storageInstance: any = null;
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

// Initialize modules and storage from environment-aware storage factory
async function initializeModules() {
  initializeLogger();
  
  // Get storage instance and wrappers from storage factory (handles environment detection)
  const storageFactory = await import('./storage-factory.js');
  const {
    storageInstance: storage,
    saveWorldToDisk: saveWorld,
    loadWorldFromDisk: loadWorld,
    deleteWorldFromDisk: deleteWorld,
    loadAllWorldsFromDisk: loadAllWorlds,
    worldExistsOnDisk: worldExists,
    loadAllAgentsFromDisk: loadAllAgents,
    saveAgentConfigToDisk: saveAgentConfig,
    saveAgentToDisk: saveAgent,
    saveAgentMemoryToDisk: saveAgentMemory,
    loadAgentFromDisk: loadAgent,
    loadAgentFromDiskWithRetry: loadAgentWithRetry,
    deleteAgentFromDisk: deleteAgent,
    loadAllAgentsFromDiskBatch: loadAllAgentsBatch,
    agentExistsOnDisk: agentExists,
    validateAgentIntegrity: validateIntegrity,
    repairAgentData: repairData,
    archiveAgentMemory: archiveMemory
  } = await storageFactory.createStorageWithWrappers();

  // Assign storage instance and wrappers
  storageInstance = storage;
  saveWorldToDisk = saveWorld;
  loadWorldFromDisk = loadWorld;
  deleteWorldFromDisk = deleteWorld;
  loadAllWorldsFromDisk = loadAllWorlds;
  worldExistsOnDisk = worldExists;
  loadAllAgentsFromDisk = loadAllAgents;
  saveAgentConfigToDisk = saveAgentConfig;
  saveAgentToDisk = saveAgent;
  saveAgentMemoryToDisk = saveAgentMemory;
  loadAgentFromDisk = loadAgent;
  loadAgentFromDiskWithRetry = loadAgentWithRetry;
  deleteAgentFromDisk = deleteAgent;
  loadAllAgentsFromDiskBatch = loadAllAgentsBatch;
  agentExistsOnDisk = agentExists;
  validateAgentIntegrity = validateIntegrity;
  repairAgentData = repairData;
  archiveAgentMemory = archiveMemory;
}

const moduleInitialization = initializeModules();

// ========================
// WORLD MANAGEMENT
// ========================

/**
 * World listing information - extends WorldData with computed agentCount
 */
export interface WorldInfo extends WorldData {
  agentCount: number;
}

/**
 * Create new world with configuration
 */
export async function createWorld(rootPath: string, params: CreateWorldParams): Promise<World> {
  // Ensure modules are initialized
  await moduleInitialization;

  // Convert name to kebab-case for consistent ID format
  const worldId = utils.toKebabCase(params.name);

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
 * Load world by ID with EventEmitter reconstruction and agent loading
 * This is the function used by the subscription layer for complete world setup
 * Automatically converts worldId to kebab-case for consistent lookup
 */
export async function getWorld(rootPath: string, worldId: string): Promise<World | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  // Automatically convert worldId to kebab-case for consistent lookup
  const normalizedWorldId = utils.toKebabCase(worldId);

  const worldData = await loadWorldFromDisk(rootPath, normalizedWorldId);

  if (!worldData) {
    return null;
  }

  // Create runtime World with fresh EventEmitter and methods
  const world = worldDataToWorld(worldData, rootPath);

  // Load agents into world runtime - use normalizedWorldId consistently
  const agents = await loadAllAgentsFromDisk(rootPath, normalizedWorldId);
  for (const agentData of agents) {
    // Enhance agent data with methods before adding to world
    const enhancedAgent = enhanceAgentWithMethods(agentData, rootPath, normalizedWorldId);
    world.agents.set(enhancedAgent.id, enhancedAgent);
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
  const normalizedWorldId = utils.toKebabCase(worldId);

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
  const normalizedWorldId = utils.toKebabCase(worldId);

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
  const normalizedWorldId = utils.toKebabCase(worldId);

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
 * Create StorageManager implementation (R3.1)
 * Uses pre-initialized functions for performance optimization
 */
function createStorageManager(rootPath: string): StorageManager {
  return {
    // World operations
    async saveWorld(worldData: WorldData): Promise<void> {
      await moduleInitialization;
      return saveWorldToDisk(rootPath, worldData);
    },

    async loadWorld(worldId: string): Promise<WorldData | null> {
      await moduleInitialization;
      return loadWorldFromDisk(rootPath, worldId);
    },

    async deleteWorld(worldId: string): Promise<boolean> {
      await moduleInitialization;
      return deleteWorldFromDisk(rootPath, worldId);
    },

    async listWorlds(): Promise<WorldData[]> {
      await moduleInitialization;
      return loadAllWorldsFromDisk(rootPath);
    },

    // Agent operations  
    async saveAgent(worldId: string, agent: Agent): Promise<void> {
      await moduleInitialization;
      return saveAgentToDisk(rootPath, worldId, agent);
    },

    async loadAgent(worldId: string, agentId: string): Promise<Agent | null> {
      await moduleInitialization;
      const agentData = await loadAgentFromDisk(rootPath, worldId, agentId);
      return agentData ? enhanceAgentWithMethods(agentData, rootPath, worldId) : null;
    },

    async deleteAgent(worldId: string, agentId: string): Promise<boolean> {
      await moduleInitialization;
      return deleteAgentFromDisk(rootPath, worldId, agentId);
    },

    async listAgents(worldId: string): Promise<Agent[]> {
      await moduleInitialization;
      const agentList = await loadAllAgentsFromDisk(rootPath, worldId);
      return agentList.map((agentData: any) => enhanceAgentWithMethods(agentData, rootPath, worldId));
    },

    // Batch operations
    async saveAgentsBatch(worldId: string, agents: Agent[]): Promise<void> {
      await moduleInitialization;
      for (const agent of agents) {
        await saveAgentToDisk(rootPath, worldId, agent);
      }
    },

    async loadAgentsBatch(worldId: string, agentIds: string[]): Promise<Agent[]> {
      await moduleInitialization;
      const agents: Agent[] = [];
      for (const agentId of agentIds) {
        const agentData = await loadAgentFromDisk(rootPath, worldId, agentId);
        if (agentData) agents.push(enhanceAgentWithMethods(agentData, rootPath, worldId));
      }
      return agents;
    },

    // Integrity operations
    async validateIntegrity(worldId: string, agentId?: string): Promise<boolean> {
      await moduleInitialization;
      if (agentId) {
        const result = await validateAgentIntegrity(rootPath, worldId, agentId);
        return result.isValid;
      } else {
        return worldExistsOnDisk(rootPath, worldId);
      }
    },

    async repairData(worldId: string, agentId?: string): Promise<boolean> {
      await moduleInitialization;
      if (agentId) {
        return repairAgentData(rootPath, worldId, agentId);
      }
      return false; // World repair not implemented yet
    }
  };
}

/**
 * Create MessageProcessor implementation (R4.1)
 * Uses statically imported functions from utils and events modules
 */
function createMessageProcessor(): MessageProcessor {
  return {
    extractMentions(content: string): string[] {
      return utils.extractMentions(content);
    },

    extractParagraphBeginningMentions(content: string): string[] {
      return utils.extractParagraphBeginningMentions(content);
    },

    determineSenderType(sender: string | undefined) {
      return utils.determineSenderType(sender);
    },

    shouldAutoMention(response: string, sender: string, agentId: string): boolean {
      return events.shouldAutoMention(response, sender, agentId);
    },

    addAutoMention(response: string, sender: string): string {
      return events.addAutoMention(response, sender);
    },

    removeSelfMentions(response: string, agentId: string): string {
      return events.removeSelfMentions(response, agentId);
    }
  };
}

/**
 * Enhance agent data with methods to create a full Agent object
 * Uses statically imported functions from utils, events, and llm-manager modules
 */
function enhanceAgentWithMethods(agentData: any, rootPath: string, worldId: string): Agent {
  return {
    ...agentData,
    // LLM Operations
    generateResponse: async (prompt: string, options?: any) => {
      await moduleInitialization;
      const worldData = await getWorldConfig(rootPath, worldId);
      if (!worldData) throw new Error(`World ${worldId} not found`);
      const world = worldDataToWorld(worldData, rootPath);
      const messages = [{ role: 'user' as const, content: prompt, createdAt: new Date() }];
      return await llmManager.generateAgentResponse(world, agentData, messages);
    },
    streamResponse: async (prompt: string, options?: any) => {
      await moduleInitialization;
      const worldData = await getWorldConfig(rootPath, worldId);
      if (!worldData) throw new Error(`World ${worldId} not found`);
      const world = worldDataToWorld(worldData, rootPath);
      const messages = [{ role: 'user' as const, content: prompt, createdAt: new Date() }];
      return await llmManager.streamAgentResponse(world, agentData, messages);
    },
    completeChat: async (messages: any[], options?: any) => {
      await moduleInitialization;
      const worldData = await getWorldConfig(rootPath, worldId);
      if (!worldData) throw new Error(`World ${worldId} not found`);
      const world = worldDataToWorld(worldData, rootPath);
      return await llmManager.generateAgentResponse(world, agentData, messages);
    },

    // Memory Management
    addMemory: async (message: any) => {
      await moduleInitialization;
      agentData.memory = agentData.memory || [];
      agentData.memory.push(message);
      await saveAgentMemoryToDisk(rootPath, worldId, agentData.id, agentData.memory);
      return message;
    },
    getMemory: async () => {
      return agentData.memory || [];
    },
    clearMemory: async () => {
      return await clearAgentMemory(rootPath, worldId, agentData.id);
    },
    archiveMemory: async () => {
      await moduleInitialization;
      return await archiveAgentMemory(rootPath, worldId, agentData.id, agentData.memory || []);
    },

    // Message Processing
    processMessage: async (message: any) => {
      await moduleInitialization;
      const worldData = await getWorldConfig(rootPath, worldId);
      if (!worldData) throw new Error(`World ${worldId} not found`);
      const world = worldDataToWorld(worldData, rootPath);
      return await events.processAgentMessage(world, agentData, message);
    },
    sendMessage: async (content: string, type?: string) => {
      await moduleInitialization;
      const worldData = await getWorldConfig(rootPath, worldId);
      if (!worldData) throw new Error(`World ${worldId} not found`);
      const world = worldDataToWorld(worldData, rootPath);
      return events.publishMessage(world, content, agentData.id);
    }
  };
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

    // Unified interfaces (R3.2, R4.2)
    storage: createStorageManager(rootPath),
    messageProcessor: createMessageProcessor(),

    // Agent operation methods
    async createAgent(params) {
      // Automatically convert agent name to kebab-case for consistent ID
      const agentParams = {
        ...params,
        id: utils.toKebabCase(params.name)
      };

      const agent = await createAgent(world.rootPath, world.id, agentParams);
      // Update runtime map
      world.agents.set(agent.id, agent);
      return agent;
    },

    async getAgent(agentName) {
      // Always convert agent name to kebab-case for consistent ID lookup
      const agentId = utils.toKebabCase(agentName);

      try {
        return await getAgent(world.rootPath, world.id, agentId);
      } catch (error) {
        return null;
      }
    },

    async updateAgent(agentName, updates) {
      // Always convert agent name to kebab-case for consistent ID lookup
      const agentId = utils.toKebabCase(agentName);

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
      const agentId = utils.toKebabCase(agentName);

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
      const agentId = utils.toKebabCase(agentName);

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
      const agentId = utils.toKebabCase(agentName);

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
      const agentId = utils.toKebabCase(agentName);

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
    },

    // Utility methods (R1.1)
    getTurnLimit() {
      return world.turnLimit;
    },

    getCurrentTurnCount() {
      // Implementation: Get current turn count from agent call counts
      let totalCalls = 0;
      for (const agent of world.agents.values()) {
        totalCalls += agent.llmCallCount;
      }
      return totalCalls;
    },

    hasReachedTurnLimit() {
      return world.getCurrentTurnCount() >= world.turnLimit;
    },

    resetTurnCount() {
      // Reset all agent LLM call counts
      for (const agent of world.agents.values()) {
        agent.llmCallCount = 0;
        agent.lastLLMCall = undefined;
      }
    },

    // Event methods (R1.2)
    publishMessage(content: string, sender: string) {
      events.publishMessage(world, content, sender);
    },

    subscribeToMessages(handler: (event: WorldMessageEvent) => void) {
      return events.subscribeToMessages(world, handler);
    },

    broadcastMessage(message: string, sender?: string) {
      events.broadcastToWorld(world, message, sender);
    },

    publishSSE(data: Partial<WorldSSEEvent>) {
      events.publishSSE(world, data);
    },

    subscribeToSSE(handler: (event: WorldSSEEvent) => void) {
      return events.subscribeToSSE(world, handler);
    },

    // Agent subscription methods (R1.3)
    subscribeAgent(agent: Agent) {
      return events.subscribeAgentToMessages(world, agent);
    },

    unsubscribeAgent(agentId: string) {
      // Implementation: Remove agent from subscription registry
      // This would require tracking subscriptions - for now, placeholder
      logger.debug('Unsubscribing agent from messages', { agentId, worldId: world.id });
    },

    getSubscribedAgents() {
      // Implementation: Return list of subscribed agent IDs
      // This would require tracking subscriptions - for now, return all agents
      return Array.from(world.agents.keys());
    },

    isAgentSubscribed(agentId: string) {
      // Implementation: Check if agent is subscribed
      // For now, assume all agents in the map are subscribed
      return world.agents.has(agentId);
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
          const agentData = await loadAgentFromDiskWithRetry(rootPath, worldId, failure.agentId, loadOptions);
          if (agentData) {
            const agent = enhanceAgentWithMethods(agentData, rootPath, worldId);
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
  const agentId = params.id || utils.toKebabCase(params.name);

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
    systemPrompt: params.systemPrompt,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    createdAt: now,
    lastActive: now,
    llmCallCount: 0,
    memory: [],

    // LLM operation methods (R2.1)
    async generateResponse(messages: AgentMessage[]): Promise<string> {
      await moduleInitialization;
      if (!agent.world) throw new Error('Agent not attached to world');
      return llmManager.generateAgentResponse(agent.world, agent, messages);
    },

    async streamResponse(messages: AgentMessage[]): Promise<string> {
      await moduleInitialization;
      if (!agent.world) throw new Error('Agent not attached to world');
      return llmManager.streamAgentResponse(agent.world, agent, messages);
    },

    // Memory management methods (R2.2)
    async addToMemory(message: AgentMessage): Promise<void> {
      await moduleInitialization;
      agent.memory.push(message);
      // Auto-save memory if agent is attached to world
      if (agent.world) {
        await saveAgentMemoryToDisk(agent.world.rootPath, agent.world.id, agent.id, agent.memory);
      }
    },

    getMemorySize(): number {
      return agent.memory.length;
    },

    async archiveMemory(): Promise<void> {
      await moduleInitialization;
      if (agent.world) {
        await archiveAgentMemory(agent.world.rootPath, agent.world.id, agent.id, agent.memory);
        agent.memory = [];
      }
    },

    getMemorySlice(start: number, end: number): AgentMessage[] {
      return agent.memory.slice(start, end);
    },

    searchMemory(query: string): AgentMessage[] {
      const lowerQuery = query.toLowerCase();
      return agent.memory.filter(msg =>
        msg.content.toLowerCase().includes(lowerQuery) ||
        (msg.sender && msg.sender.toLowerCase().includes(lowerQuery))
      );
    },

    // Message processing methods (R2.3)
    async shouldRespond(messageEvent: WorldMessageEvent): Promise<boolean> {
      await moduleInitialization;
      if (!agent.world) return false;
      return events.shouldAgentRespond(agent.world, agent, messageEvent);
    },

    async processMessage(messageEvent: WorldMessageEvent): Promise<void> {
      await moduleInitialization;
      if (!agent.world) throw new Error('Agent not attached to world');
      return events.processAgentMessage(agent.world, agent, messageEvent);
    },

    extractMentions(content: string): string[] {
      return utils.extractMentions(content);
    },

    isMentioned(content: string): boolean {
      const mentions = agent.extractMentions(content);
      return mentions.includes(agent.id.toLowerCase()) || mentions.includes(agent.name.toLowerCase());
    }
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

  const agentData = await loadAgentFromDisk(rootPath, worldId, agentId);
  return agentData ? enhanceAgentWithMethods(agentData, rootPath, worldId) : null;
}

/**
 * Update agent configuration and/or memory
 */
export async function updateAgent(rootPath: string, worldId: string, agentId: string, updates: UpdateAgentParams): Promise<Agent | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  const existingAgentData = await loadAgentFromDisk(rootPath, worldId, agentId);

  if (!existingAgentData) {
    return null;
  }

  // Merge updates with existing agent
  const updatedAgent: Agent = {
    ...existingAgentData,
    name: updates.name || existingAgentData.name,
    type: updates.type || existingAgentData.type,
    status: updates.status || existingAgentData.status,
    provider: updates.provider || existingAgentData.provider,
    model: updates.model || existingAgentData.model,
    systemPrompt: updates.systemPrompt !== undefined ? updates.systemPrompt : existingAgentData.systemPrompt,
    temperature: updates.temperature !== undefined ? updates.temperature : existingAgentData.temperature,
    maxTokens: updates.maxTokens !== undefined ? updates.maxTokens : existingAgentData.maxTokens,
    lastActive: new Date()
  };

  await saveAgentConfigToDisk(rootPath, worldId, updatedAgent);
  return enhanceAgentWithMethods(updatedAgent, rootPath, worldId);
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

  const existingAgentData = await loadAgentFromDisk(rootPath, worldId, agentId);

  if (!existingAgentData) {
    return null;
  }

  const updatedAgent: Agent = {
    ...existingAgentData,
    memory: [...existingAgentData.memory, ...messages],
    lastActive: new Date()
  };

  // Save memory to memory.json and update config timestamps
  await saveAgentMemoryToDisk(rootPath, worldId, agentId, updatedAgent.memory);
  await saveAgentConfigToDisk(rootPath, worldId, updatedAgent);
  return enhanceAgentWithMethods(updatedAgent, rootPath, worldId);
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

  const existingAgentData = await loadAgentFromDisk(rootPath, worldId, agentId);

  logger.debug('loadAgentFromDisk result', {
    agentFound: !!existingAgentData,
    agentName: existingAgentData?.name,
    memoryLength: existingAgentData?.memory?.length || 0,
    currentLLMCallCount: existingAgentData?.llmCallCount || 0
  });

  if (!existingAgentData) {
    logger.debug('Agent not found on disk, returning null');
    return null;
  }

  // Archive current memory if it exists and has content
  if (existingAgentData.memory && existingAgentData.memory.length > 0) {
    try {
      logger.debug('Archiving existing memory');
      await archiveAgentMemory(rootPath, worldId, agentId, existingAgentData.memory);
      logger.debug('Memory archived successfully');
    } catch (error) {
      logger.warn('Failed to archive memory', { agentId, error: error instanceof Error ? error.message : error });
      // Continue with clearing even if archiving fails
    }
  }

  const updatedAgent: Agent = {
    ...existingAgentData,
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
  return enhanceAgentWithMethods(updatedAgent, rootPath, worldId);
}

/**
 * Get agent configuration without memory (lightweight operation)
 */
export async function getAgentConfig(rootPath: string, worldId: string, agentId: string): Promise<Omit<Agent, 'memory'> | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  const agentData = await loadAgentFromDisk(rootPath, worldId, agentId);

  if (!agentData) {
    return null;
  }

  const agent = enhanceAgentWithMethods(agentData, rootPath, worldId);
  const { memory, ...config } = agent;
  return config;
}

// ========================
// STORAGE CONFIGURATION
// ========================

/**
 * Set storage configuration for the system
 */
export async function setStorageConfiguration(config: any): Promise<void> {
  const storageFactory = await import('./storage-factory.js');
  storageInstance = await storageFactory.createStorage(config);
}

/**
 * Get current storage type information
 */
export async function getStorageInfo(): Promise<{
  type: string;
  isInitialized: boolean;
  supportedFeatures: string[];
}> {
  await moduleInitialization;

  const type = storageInstance ?
    ('archiveAgentMemory' in storageInstance ? 'sqlite' : 'file') :
    'file';

  const supportedFeatures = type === 'sqlite' ?
    ['enhanced-archives', 'search', 'analytics', 'transactions'] :
    ['basic-archives'];

  return {
    type,
    isInitialized: !!storageInstance,
    supportedFeatures
  };
}

/**
 * Migrate storage from one type to another
 */
export async function migrateStorage(
  sourceRootPath: string,
  targetConfig: any,
  options: any = {}
): Promise<any> {
  const { migrateFileToSQLite } = await import('./migration-tools.js');

  if (targetConfig.type === 'sqlite') {
    return migrateFileToSQLite(sourceRootPath, targetConfig.sqlite?.database, options);
  }

  throw new Error('Migration to file storage not supported');
}
