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
 * - Chat session management with auto-save and restoration capabilities
 *
 * Chat Session Management:
 * - Integrated into getWorld: Auto-restoration of last active chat with snapshot support
 * - Event-driven auto-save: Chat state automatically saved via event emitter
 * - generateChatTitleFromMessages: Extract meaningful titles from message content
 * - Enhanced newChat(): Returns complete World object for consistent state management
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
 * Chat Functions:
 * - createChat: Create new chat with optional snapshot
 * - getChat: Load chat by ID with snapshot data
 * - updateChat: Update chat metadata and message counts
 * - deleteChat: Remove chat and associated snapshots
 * - listChat: Get all chats for a world
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
import type { World, CreateWorldParams, UpdateWorldParams, Agent, CreateAgentParams, UpdateAgentParams, AgentInfo, AgentMessage, StorageManager, MessageProcessor, WorldMessageEvent, WorldSSEEvent, ChatData, CreateChatParams, UpdateChatParams, WorldChat, LLMProvider } from './types.js';
import type { WorldData } from './world-storage.js';

// Regular imports
import { SenderType } from './types.js';

// Static imports for core modules
import { EventEmitter } from 'events';
import * as events from './events.js';
import * as llmManager from './llm-manager.js';
import * as storageFactory from './storage-factory.js';
import * as utils from './utils.js';

// Storage wrapper instance - initialized from storage factory
let storageWrappers: storageFactory.StorageAPI | null = null;

// Initialize modules and storage from environment-aware storage factory
async function initializeModules() {
  initializeLogger();

  // Get storage wrapper instance from storage factory (handles environment detection)
  storageWrappers = await storageFactory.createStorageWithWrappers();
}

const moduleInitialization = initializeModules();

// ========================
// NEW CHAT OPTIMIZATION CONFIGURATION
// ========================

/**
 * Configuration constants for new chat optimization
 */
const NEW_CHAT_CONFIG = {
  // Chat title that indicates a potentially reusable chat
  REUSABLE_CHAT_TITLE: 'New Chat',

  // Enable/disable new chat optimization (for testing/debugging)
  ENABLE_OPTIMIZATION: true
} as const;

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
  const exists = await storageWrappers!.worldExists(worldId);
  if (exists) {
    throw new Error(`World with name '${params.name}' already exists`);
  }

  const worldData: WorldData = {
    id: worldId,
    name: params.name,
    description: params.description,
    turnLimit: params.turnLimit || 5,
    createdAt: new Date(),
    lastUpdated: new Date(),
    totalAgents: 0,
    totalMessages: 0
  };

  await storageWrappers!.saveWorld(worldData);

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

  const worldData = await storageWrappers!.loadWorld(normalizedWorldId);

  if (!worldData) {
    return null;
  }

  // Create runtime World with fresh EventEmitter and methods
  const world = worldDataToWorld(worldData, rootPath);

  // Load agents into world runtime - use normalizedWorldId consistently
  const agents = await storageWrappers!.listAgents(normalizedWorldId);
  for (const agentData of agents) {
    // Enhance agent data with methods before adding to world
    const enhancedAgent = enhanceAgentWithMethods(agentData, rootPath, normalizedWorldId);
    world.agents.set(enhancedAgent.id, enhancedAgent);
  }

  // AUTO-RESTORE LAST CHAT: Load last chat and restore agent memory
  try {
    // If world has a currentChatId, restore that specific chat
    if (worldData.currentChatId) {
      const chatData = await storageWrappers!.loadChatData(normalizedWorldId, worldData.currentChatId);
      if (chatData?.chat) {
        // Restore agent memory from current chat content
        if (chatData.chat.agents) {
          for (const snapshotAgent of chatData.chat.agents) {
            const worldAgent = world.agents.get(snapshotAgent.id);
            if (worldAgent && snapshotAgent.memory) {
              // Restore memory while preserving agent config
              worldAgent.memory = [...snapshotAgent.memory];
              worldAgent.llmCallCount = snapshotAgent.llmCallCount || 0;
              worldAgent.lastLLMCall = snapshotAgent.lastLLMCall ? new Date(snapshotAgent.lastLLMCall) : undefined;
            }
          }
        }

        logger.debug('Auto-restored current chat', {
          worldId: normalizedWorldId,
          chatId: worldData.currentChatId,
          messageCount: 0 // Will be calculated when messages are loaded
        });
      }
    } else {
      // Fall back to last active chat if no currentChatId
      try {
        const chats = await storageWrappers!.listChats(normalizedWorldId);

        if (chats.length > 0) {
          // Find the most recently updated chat
          const lastChatInfo = chats.reduce((latest: ChatData, current: ChatData) =>
            new Date(current.updatedAt) > new Date(latest.updatedAt) ? current : latest
          );

          // Load the complete chat data
          const lastChatData = await storageWrappers!.loadChatData(normalizedWorldId, lastChatInfo.id);

          if (lastChatData) {
            if (lastChatData.chat?.agents) {
              // Restore agent memory from chat content
              for (const snapshotAgent of lastChatData.chat.agents) {
                const worldAgent = world.agents.get(snapshotAgent.id);
                if (worldAgent && snapshotAgent.memory) {
                  // Restore memory while preserving agent config
                  worldAgent.memory = [...snapshotAgent.memory];
                  worldAgent.llmCallCount = snapshotAgent.llmCallCount || 0;
                  worldAgent.lastLLMCall = snapshotAgent.lastLLMCall ? new Date(snapshotAgent.lastLLMCall) : undefined;
                }
              }
            }

            // Update world's currentChatId to the restored chat
            world.currentChatId = lastChatData.id;

            // Save the updated currentChatId to world data
            const updatedWorldData = {
              ...worldData,
              currentChatId: lastChatData.id
            };
            await storageWrappers!.saveWorld(updatedWorldData);

            logger.debug('Auto-restored last chat and set as current', {
              worldId: normalizedWorldId,
              chatId: lastChatData.id,
              messageCount: lastChatData.messageCount
            });
          }
        }
      } catch (error) {
        logger.warn('Failed to auto-restore chat, continuing with fresh agents', {
          worldId: normalizedWorldId,
          error: error instanceof Error ? error.message : error
        });
      }
    }
  } catch (error) {
    logger.warn('Failed to auto-restore chat, continuing with fresh agents', {
      worldId: normalizedWorldId,
      error: error instanceof Error ? error.message : error
    });
  }

  return world;
}

/**
 * Get world with fresh agent configurations (no memory restoration)
 * Use this for new chat sessions where agents should start with empty memory
 */
export async function getWorldFresh(rootPath: string, worldId: string): Promise<World | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  // Automatically convert worldId to kebab-case for consistent lookup
  const normalizedWorldId = utils.toKebabCase(worldId);

  const worldData = await storageWrappers!.loadWorld(normalizedWorldId);

  if (!worldData) {
    return null;
  }

  // Create runtime World with fresh EventEmitter and methods
  const world = worldDataToWorld(worldData, rootPath);

  // Load agents into world runtime with FRESH memory (no restoration)
  const agents = await storageWrappers!.listAgents(normalizedWorldId);
  for (const agentData of agents) {
    // Enhance agent data with methods before adding to world
    const enhancedAgent = enhanceAgentWithMethods(agentData, rootPath, normalizedWorldId);

    // FRESH START: Clear agent memory for new chat session
    enhancedAgent.memory = [];
    enhancedAgent.llmCallCount = 0;
    enhancedAgent.lastLLMCall = undefined;

    world.agents.set(enhancedAgent.id, enhancedAgent);
  }

  logger.debug('Created fresh world with empty agent memory', {
    worldId: normalizedWorldId,
    agentCount: agents.length
  });

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

  const existingData = await storageWrappers!.loadWorld(normalizedWorldId);

  if (!existingData) {
    return null;
  }

  // Merge updates with existing configuration
  const updatedData: WorldData = {
    ...existingData,
    ...updates,
    lastUpdated: new Date() // Always update the timestamp on any world update
  };

  await storageWrappers!.saveWorld(updatedData);
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

  return await storageWrappers!.deleteWorld(normalizedWorldId);
}

/**
 * Get all world IDs and basic information
 */
export async function listWorlds(rootPath: string): Promise<WorldInfo[]> {
  // Ensure modules are initialized
  await moduleInitialization;

  const allWorldData = await storageWrappers!.listWorlds();

  // Count agents for each world
  const worldsWithAgentCount = await Promise.all(
    allWorldData.map(async (data: WorldData) => {
      try {
        const agents = await storageWrappers!.listAgents(data.id);
        return {
          ...data, // Include all WorldData properties
          agentCount: agents.length
        };
      } catch (error) {
        // If agent loading fails, still return world info with 0 agents
        return {
          ...data, // Include all WorldData properties
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

  const worldData = await storageWrappers!.loadWorld(normalizedWorldId);

  logger.debug('loadWorld result', {
    worldFound: !!worldData,
    worldId: worldData?.id,
    worldName: worldData?.name
  });

  if (!worldData) {
    logger.debug('World not found, returning null');
    return null;
  }

  return worldData;
}

/**
 * Create StorageManager implementation (R3.1)
 * Uses direct StorageAPI wrapper functions to eliminate extra mapping layer
 */
function createStorageManager(rootPath: string): StorageManager {
  return {
    // World operations
    async saveWorld(worldData: WorldData): Promise<void> {
      await moduleInitialization;
      return storageWrappers!.saveWorld(worldData);
    },

    async loadWorld(worldId: string): Promise<WorldData | null> {
      await moduleInitialization;
      return storageWrappers!.loadWorld(worldId);
    },

    async deleteWorld(worldId: string): Promise<boolean> {
      await moduleInitialization;
      return storageWrappers!.deleteWorld(worldId);
    },

    async listWorlds(): Promise<WorldData[]> {
      await moduleInitialization;
      return storageWrappers!.listWorlds();
    },

    // Agent operations  
    async saveAgent(worldId: string, agent: Agent): Promise<void> {
      await moduleInitialization;
      return storageWrappers!.saveAgent(worldId, agent);
    },

    async loadAgent(worldId: string, agentId: string): Promise<Agent | null> {
      await moduleInitialization;
      const agentData = await storageWrappers!.loadAgent(worldId, agentId);
      return agentData ? enhanceAgentWithMethods(agentData, rootPath, worldId) : null;
    },

    async deleteAgent(worldId: string, agentId: string): Promise<boolean> {
      await moduleInitialization;
      return storageWrappers!.deleteAgent(worldId, agentId);
    },

    async listAgents(worldId: string): Promise<Agent[]> {
      await moduleInitialization;
      const agentList = await storageWrappers!.listAgents(worldId);
      return agentList.map((agentData: any) => enhanceAgentWithMethods(agentData, rootPath, worldId));
    },

    // Batch operations
    async saveAgentsBatch(worldId: string, agents: Agent[]): Promise<void> {
      await moduleInitialization;
      for (const agent of agents) {
        await storageWrappers!.saveAgent(worldId, agent);
      }
    },

    async loadAgentsBatch(worldId: string, agentIds: string[]): Promise<Agent[]> {
      await moduleInitialization;
      const agents: Agent[] = [];
      for (const agentId of agentIds) {
        const agentData = await storageWrappers!.loadAgent(worldId, agentId);
        if (agentData) agents.push(enhanceAgentWithMethods(agentData, rootPath, worldId));
      }
      return agents;
    },

    // Chat history operations
    async saveChatData(worldId: string, chat: ChatData): Promise<void> {
      await moduleInitialization;
      return storageWrappers!.saveChatData(worldId, chat);
    },

    async loadChatData(worldId: string, chatId: string): Promise<ChatData | null> {
      await moduleInitialization;
      return storageWrappers!.loadChatData(worldId, chatId);
    },

    async deleteChatData(worldId: string, chatId: string): Promise<boolean> {
      await moduleInitialization;
      return storageWrappers!.deleteChatData(worldId, chatId);
    },

    async listChats(worldId: string): Promise<ChatData[]> {
      await moduleInitialization;
      return storageWrappers!.listChats(worldId);
    },

    async updateChatData(worldId: string, chatId: string, updates: UpdateChatParams): Promise<ChatData | null> {
      await moduleInitialization;
      return storageWrappers!.updateChatData(worldId, chatId, updates);
    },

    // Chat operations
    async saveWorldChat(worldId: string, chatId: string, chat: WorldChat): Promise<void> {
      await moduleInitialization;
      return storageWrappers!.saveWorldChat(worldId, chatId, chat);
    },

    async loadWorldChat(worldId: string, chatId: string): Promise<WorldChat | null> {
      await moduleInitialization;
      return storageWrappers!.loadWorldChat(worldId, chatId);
    },

    async loadWorldChatFull(worldId: string, chatId: string): Promise<WorldChat | null> {
      await moduleInitialization;
      return storageWrappers!.loadWorldChatFull(worldId, chatId);
    },

    async restoreFromWorldChat(worldId: string, chat: WorldChat): Promise<boolean> {
      await moduleInitialization;
      return storageWrappers!.restoreFromWorldChat(worldId, chat);
    },

    // Integrity operations
    async validateIntegrity(worldId: string, agentId?: string): Promise<boolean> {
      await moduleInitialization;
      if (agentId) {
        const result = await storageWrappers!.validateIntegrity(worldId, agentId);
        return result.isValid;
      } else {
        return storageWrappers!.worldExists(worldId);
      }
    },

    async repairData(worldId: string, agentId?: string): Promise<boolean> {
      await moduleInitialization;
      if (agentId) {
        return storageWrappers!.repairData(worldId, agentId);
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
      return await llmManager.streamAgentResponse(world, agentData, messages, events.publishSSE);
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
      await storageWrappers!.saveAgentMemory(worldId, agentData.id, agentData.memory);
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
      return await storageWrappers!.archiveMemory(worldId, agentData.id, agentData.memory || []);
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
    chatLLMProvider: data.chatLLMProvider as LLMProvider,
    chatLLMModel: data.chatLLMModel,
    currentChatId: data.currentChatId || null, // NEW: Initialize from data
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
        await storageWrappers!.saveAgent(world.id, agent);
      } catch (error) {
        throw error;
      }
    },

    // Chat history methods - implemented using new ChatData model
    async createChatData(params: CreateChatParams): Promise<ChatData> {
      // Delegate to the createChatData function
      return await createChatData(world.rootPath, world.id, params);
    },

    async loadChatData(chatId: string): Promise<ChatData | null> {
      return await storageWrappers!.loadChatData(world.id, chatId);
    },

    async loadChat(chatId: string): Promise<ChatData | null> {
      return await storageWrappers!.loadChatData(world.id, chatId);
    },

    async loadChatFull(chatId: string): Promise<WorldChat | null> {
      return await storageWrappers!.loadWorldChatFull(world.id, chatId);
    },

    async updateChatData(chatId: string, updates: UpdateChatParams): Promise<ChatData | null> {
      return await storageWrappers!.updateChatData(world.id, chatId, updates);
    },

    async deleteChatData(chatId: string): Promise<boolean> {
      return await storageWrappers!.deleteChatData(world.id, chatId);
    },

    async listChats(): Promise<ChatData[]> {
      try {
        return await storageWrappers!.listChats(world.id);
      } catch (error) {
        logger.error('Failed to list chats', {
          worldId: world.id,
          error: error instanceof Error ? error.message : error
        });
        throw error;
      }
    },

    async createWorldChat(): Promise<WorldChat> {
      return await createWorldChat(world.rootPath, world.id);
    },

    async restoreFromWorldChat(chatId: string): Promise<boolean> {
      return await restoreWorldChat(world.rootPath, world.id, chatId);
    },



    // World operation methods
    async save(): Promise<void> {
      const worldData: WorldData = {
        id: world.id,
        name: world.name,
        description: world.description,
        turnLimit: world.turnLimit,
        chatLLMProvider: world.chatLLMProvider,
        chatLLMModel: world.chatLLMModel,
        currentChatId: world.currentChatId,
        createdAt: new Date(), // This should ideally preserve the original
        lastUpdated: new Date(),
        totalAgents: world.agents.size,
        totalMessages: Array.from(world.agents.values()).reduce((total, agent) => total + agent.memory.length, 0)
      };
      await storageWrappers!.saveWorld(worldData);
    },

    async delete() {
      return await storageWrappers!.deleteWorld(world.id);
    },

    async reload() {
      const worldData = await storageWrappers!.loadWorld(world.id);
      if (worldData) {
        world.name = worldData.name;
        world.description = worldData.description;
        world.turnLimit = worldData.turnLimit;
        world.chatLLMProvider = worldData.chatLLMProvider as LLMProvider;
        world.chatLLMModel = worldData.chatLLMModel;
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
    },

    // NEW: Chat Reuse Detection and Optimization
    async isCurrentChatReusable(): Promise<boolean> {
      try {
        // Early exit if optimization is disabled
        if (!NEW_CHAT_CONFIG.ENABLE_OPTIMIZATION) {
          logger.debug('Chat optimization disabled, not reusing', { worldId: world.id });
          return false;
        }

        // No current chat - cannot reuse
        if (!world.currentChatId) {
          logger.debug('No current chat to reuse', { worldId: world.id });
          return false;
        }

        // Load current chat data
        const currentChat = await storageWrappers!.loadChatData(world.id, world.currentChatId);
        if (!currentChat) {
          logger.debug('Current chat not found, cannot reuse', {
            worldId: world.id,
            chatId: world.currentChatId
          });
          return false;
        }

        // Simplified reusability logic: title is "New Chat" OR message count is 0
        const isTitleReusable = currentChat.name === NEW_CHAT_CONFIG.REUSABLE_CHAT_TITLE;
        const isMessageCountReusable = currentChat.messageCount === 0;

        if (!isTitleReusable && !isMessageCountReusable) {
          logger.debug('Chat is not reusable - title not "New Chat" and has messages', {
            worldId: world.id,
            chatId: world.currentChatId,
            title: currentChat.name,
            messageCount: currentChat.messageCount
          });
          return false;
        }

        // Chat is reusable
        logger.debug('Current chat is reusable', {
          worldId: world.id,
          chatId: world.currentChatId,
          title: currentChat.name,
          messageCount: currentChat.messageCount,
          reusableByTitle: isTitleReusable,
          reusableByMessageCount: isMessageCountReusable
        });
        return true;

      } catch (error) {
        logger.warn('Error checking chat reusability, defaulting to non-reusable', {
          worldId: world.id,
          chatId: world.currentChatId,
          error: error instanceof Error ? error.message : error
        });
        return false;
      }
    },

    async reuseCurrentChat(): Promise<World> {
      try {
        if (!world.currentChatId) {
          throw new Error('No current chat to reuse');
        }

        logger.debug('Reusing current chat instead of creating new one', {
          worldId: world.id,
          chatId: world.currentChatId
        });

        // 1. Reset agent memories to fresh state (same as newChat)
        for (const agent of world.agents.values()) {
          agent.memory = [];
          agent.llmCallCount = 0;
          agent.lastLLMCall = undefined;
        }

        // 2. Update chat metadata to reflect reuse
        await storageWrappers!.updateChatData(world.id, world.currentChatId, {
          messageCount: 0 // Reset message count since we're clearing memories
        });

        // 3. Save the fresh agent states
        await world.saveCurrentState();

        // 4. Update world state and save
        const worldData = {
          id: world.id,
          name: world.name,
          description: world.description,
          turnLimit: world.turnLimit,
          chatLLMProvider: world.chatLLMProvider,
          chatLLMModel: world.chatLLMModel,
          currentChatId: world.currentChatId, // Keep same chat ID
          createdAt: new Date(), // This should ideally preserve the original
          lastUpdated: new Date(),
          totalAgents: world.agents.size,
          totalMessages: 0 // Reset since we cleared memories
        };
        await storageWrappers!.saveWorld(worldData);

        logger.debug('Successfully reused current chat', {
          worldId: world.id,
          reuseId: world.currentChatId,
          agentCount: world.agents.size
        });

        return world;

      } catch (error) {
        logger.error('Failed to reuse current chat, falling back to new chat creation', {
          worldId: world.id,
          chatId: world.currentChatId,
          error: error instanceof Error ? error.message : error
        });

        // Fallback to creating new chat
        return await world.createNewChat();
      }
    },

    async createNewChat(): Promise<World> {
      try {
        // 1. Save current state to previous chat (if any)
        if (world.currentChatId) {
          await world.saveCurrentState();
        }

        // 2. Generate new chat ID
        const newChatId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // 3. Create new chat record
        const newChatData = await createChatData('', world.id, {
          name: 'New Chat',
          description: 'New chat session',
          captureChat: true
        });

        // 4. Reset agent memories to fresh state
        for (const agent of world.agents.values()) {
          agent.memory = [];
          agent.llmCallCount = 0;
          agent.lastLLMCall = undefined;
        }

        // 5. Update currentChatId
        world.currentChatId = newChatData.id;

        // 6. Auto-save initial state to new chat and save world once
        await world.saveCurrentState();
        const worldData = {
          id: world.id,
          name: world.name,
          description: world.description,
          turnLimit: world.turnLimit,
          chatLLMProvider: world.chatLLMProvider,
          chatLLMModel: world.chatLLMModel,
          currentChatId: world.currentChatId,
          createdAt: new Date(), // This should ideally preserve the original
          lastUpdated: new Date(),
          totalAgents: world.agents.size,
          totalMessages: Array.from(world.agents.values()).reduce((total, agent) => total + agent.memory.length, 0)
        };
        await storageWrappers!.saveWorld(worldData);

        logger.debug('Created new chat', {
          worldId: world.id,
          chatId: world.currentChatId
        });


        // Ensure returned world includes the new chat in chats array
        return world; // Return the complete updated World object
      } catch (error) {
        logger.error('Failed to create new chat', {
          worldId: world.id,
          error: error instanceof Error ? error.message : error
        });
        throw error;
      }
    },

    async newChat(): Promise<World> {
      try {
        // NEW: Check if current chat is reusable before creating new one
        if (NEW_CHAT_CONFIG.ENABLE_OPTIMIZATION) {
          const canReuse = await world.isCurrentChatReusable();
          if (canReuse) {
            logger.debug('Reusing current chat instead of creating new one', {
              worldId: world.id,
              chatId: world.currentChatId
            });
            return await world.reuseCurrentChat();
          }
        }

        // Fallback to creating new chat
        logger.debug('Creating new chat', {
          worldId: world.id,
          optimizationEnabled: NEW_CHAT_CONFIG.ENABLE_OPTIMIZATION
        });
        return await world.createNewChat();

      } catch (error) {
        logger.error('Failed in newChat method', {
          worldId: world.id,
          error: error instanceof Error ? error.message : error
        });
        throw error;
      }
    },

    async loadChatById(chatId: string): Promise<void> {
      try {
        // 1. Save current state to previous chat (if any)
        if (world.currentChatId && world.currentChatId !== chatId) {
          await world.saveCurrentState();
        }

        // 2. Use restoreWorldChat for consistent behavior
        const success = await restoreWorldChat(world.rootPath, world.id, chatId);
        if (!success) {
          throw new Error(`Failed to restore chat ${chatId}`);
        }

        // 3. Update currentChatId in the runtime world object
        world.currentChatId = chatId;

        // 4. Save world data with updated currentChatId
        const worldData = {
          id: world.id,
          name: world.name,
          description: world.description,
          turnLimit: world.turnLimit,
          chatLLMProvider: world.chatLLMProvider,
          chatLLMModel: world.chatLLMModel,
          currentChatId: world.currentChatId,
          createdAt: new Date(), // This should ideally preserve the original
          lastUpdated: new Date(),
          totalAgents: world.agents.size,
          totalMessages: Array.from(world.agents.values()).reduce((total, agent) => total + agent.memory.length, 0)
        };
        await storageWrappers!.saveWorld(worldData);

        logger.debug('Loaded chat using restoreWorldChat', {
          worldId: world.id,
          chatId: world.currentChatId
        });
      } catch (error) {
        logger.error('Failed to load chat', {
          worldId: world.id,
          chatId,
          error: error instanceof Error ? error.message : error
        });
        throw error;
      }
    },

    async getCurrentChat(): Promise<ChatData | null> {
      try {
        if (!world.currentChatId) {
          return null;
        }
        return await storageWrappers!.loadChatData(world.id, world.currentChatId);
      } catch (error) {
        logger.warn('Failed to get current chat', {
          worldId: world.id,
          currentChatId: world.currentChatId,
          error: error instanceof Error ? error.message : error
        });
        return null;
      }
    },

    async saveCurrentState(): Promise<void> {
      try {
        if (!world.currentChatId) {
          logger.debug('No current chat to save state to', { worldId: world.id });
          return;
        }

        // 1. Capture current agent memories and create messages
        const allMessages: AgentMessage[] = [];
        for (const agent of world.agents.values()) {
          if (agent.memory && agent.memory.length > 0) {
            allMessages.push(...agent.memory);
          }
        }

        // Sort messages by timestamp
        allMessages.sort((a, b) => {
          const timeA = a.createdAt ? (a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime()) : 0;
          const timeB = b.createdAt ? (b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime()) : 0;
          return timeA - timeB;
        });

        // 2. Update chat with current state
        await storageWrappers!.updateChatData(world.id, world.currentChatId, {
          messageCount: allMessages.length
        });

        logger.debug('Saved current world state to chat', {
          worldId: world.id,
          chatId: world.currentChatId,
          messageCount: allMessages.length
        });
      } catch (error) {
        logger.error('Failed to save current state', {
          worldId: world.id,
          currentChatId: world.currentChatId,
          error: error instanceof Error ? error.message : error
        });
        throw error;
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
    const batchResult = await storageWrappers!.loadAgentsBatch(worldId, [], loadOptions);

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
        const repaired = await storageWrappers!.repairData(worldId, failure.agentId);
        if (repaired) {
          result.repairedCount++;

          // Try loading again after repair
          const agentData = await storageWrappers!.loadAgentWithRetry(worldId, failure.agentId, loadOptions);
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
  const exists = await storageWrappers!.agentExists(worldId, agentId);
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
      return llmManager.streamAgentResponse(agent.world, agent, messages, events.publishSSE);
    },

    // Memory management methods (R2.2)
    async addToMemory(message: AgentMessage): Promise<void> {
      await moduleInitialization;
      agent.memory.push(message);
      // Auto-save memory if agent is attached to world
      if (agent.world) {
        await storageWrappers!.saveAgentMemory(agent.world.id, agent.id, agent.memory);
      }
    },

    getMemorySize(): number {
      return agent.memory.length;
    },

    async archiveMemory(): Promise<void> {
      await moduleInitialization;
      if (agent.world) {
        await storageWrappers!.archiveMemory(agent.world.id, agent.id, agent.memory);
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
  await storageWrappers!.saveAgent(worldId, agent);

  // Register in runtime
  const registered = await registerAgentRuntime(rootPath, worldId, agent, {
    updateWorldMap: true,
    validateAgent: false
  });

  if (!registered) {
    // Clean up if runtime registration failed
    await storageWrappers!.deleteAgent(worldId, agent.id);
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

  const agentData = await storageWrappers!.loadAgent(worldId, agentId);
  return agentData ? enhanceAgentWithMethods(agentData, rootPath, worldId) : null;
}

/**
 * Update agent configuration and/or memory
 */
export async function updateAgent(rootPath: string, worldId: string, agentId: string, updates: UpdateAgentParams): Promise<Agent | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  const existingAgentData = await storageWrappers!.loadAgent(worldId, agentId);

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

  await storageWrappers!.saveAgent(worldId, updatedAgent);
  return enhanceAgentWithMethods(updatedAgent, rootPath, worldId);
}

/**
 * Delete agent and all associated data
 */
export async function deleteAgent(rootPath: string, worldId: string, agentId: string): Promise<boolean> {
  // Ensure modules are initialized
  await moduleInitialization;

  return await storageWrappers!.deleteAgent(worldId, agentId);
}

/**
 * Get all agent IDs and basic information
 */
export async function listAgents(rootPath: string, worldId: string): Promise<AgentInfo[]> {
  // Ensure modules are initialized
  await moduleInitialization;

  const allAgents = await storageWrappers!.listAgents(worldId);

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

  const existingAgentData = await storageWrappers!.loadAgent(worldId, agentId);

  if (!existingAgentData) {
    return null;
  }

  const updatedAgent: Agent = {
    ...existingAgentData,
    memory: [...existingAgentData.memory, ...messages],
    lastActive: new Date()
  };

  // Save memory to memory.json and update config timestamps
  await storageWrappers!.saveAgentMemory(worldId, agentId, updatedAgent.memory);
  await storageWrappers!.saveAgent(worldId, updatedAgent);
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

  const existingAgentData = await storageWrappers!.loadAgent(worldId, agentId);

  logger.debug('loadAgent result', {
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
      await storageWrappers!.archiveMemory(worldId, agentId, existingAgentData.memory);
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
  await storageWrappers!.saveAgentMemory(worldId, agentId, []);
  await storageWrappers!.saveAgent(worldId, updatedAgent);

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

  const agentData = await storageWrappers!.loadAgent(worldId, agentId);

  if (!agentData) {
    return null;
  }

  const agent = enhanceAgentWithMethods(agentData, rootPath, worldId);
  const { memory, ...config } = agent;
  return config;
}

// ========================
// CHAT HISTORY MANAGEMENT
// ========================

/**
 * Create new chat history entry with optional snapshot
 */
/**
 * Create a new chat data entry with optional world snapshot
 * This properly separates ChatData (metadata) from WorldChat (content)
 */
export async function createChatData(rootPath: string, worldId: string, params: CreateChatParams): Promise<ChatData> {
  await moduleInitialization;

  const chatId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();

  // Optionally capture WorldChat (full world state)
  let worldChat: WorldChat | undefined;
  if (params.captureChat) {
    worldChat = await createWorldChat(rootPath, worldId);
  }

  // Always use "New Chat" as initial title
  const initialTitle = params.name || "New Chat";

  // Create ChatData entry (metadata)
  const chatData: ChatData = {
    id: chatId,
    worldId,
    name: initialTitle,
    description: params.description,
    createdAt: now,
    updatedAt: now,
    messageCount: worldChat?.messages?.length || 0,
    chat: worldChat
  };

  await storageWrappers!.saveChatData(worldId, chatData);

  // Save the snapshot data separately if it exists
  if (worldChat) {
    await storageWrappers!.saveWorldChat(worldId, chatId, worldChat);
  }

  return chatData;
}

// ...existing code...

/**
 * Load chat history entry with snapshot
 */
/**
 * Get chat data with metadata and content
 */
export async function getChatData(rootPath: string, worldId: string, chatId: string): Promise<ChatData | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  // Load complete ChatData
  const chatData = await storageWrappers!.loadChatData(worldId, chatId);
  return chatData;
}

// (legacy getChat removed)

/**
 * Update chat title based on human messages when they are published
 * This should be called when a human message is published to the event emitter
 */
async function updateChatTitleFromHumanMessage(world: World): Promise<void> {
  try {
    // Only update if there's a current chat
    if (!world.currentChatId) {
      return;
    }

    // Collect all human messages from agents' memory
    const allHumanMessages: AgentMessage[] = [];
    for (const agent of world.agents.values()) {
      if (agent.memory) {
        const humanMessages = agent.memory.filter(msg =>
          msg.role === 'user' &&
          msg.content &&
          msg.content.trim().length > 0
        );
        allHumanMessages.push(...humanMessages);
      }
    }

    // Sort by timestamp and get last 10
    allHumanMessages.sort((a, b) =>
      (a.createdAt || new Date(0)).getTime() - (b.createdAt || new Date(0)).getTime()
    );
    const last10HumanMessages = allHumanMessages.slice(-10);

    if (last10HumanMessages.length === 0) {
      return;
    }

    // Generate new title
    const newTitle = await generateChatTitleFromMessages(last10HumanMessages, world);

    // Update chat title in storage
    await storageWrappers!.updateChatData(world.id, world.currentChatId, {
      name: newTitle
    });

    logger.debug('Updated chat title from human message', {
      worldId: world.id,
      chatId: world.currentChatId,
      newTitle,
      messageCount: last10HumanMessages.length
    });

  } catch (error) {
    logger.warn('Failed to update chat title from human message', {
      worldId: world.id,
      chatId: world.currentChatId,
      error: error instanceof Error ? error.message : error
    });
  }
}

/**
 * Generate chat title from message content with LLM support
 */
async function generateChatTitleFromMessages(messages: AgentMessage[], world?: World, maxLength: number = 50): Promise<string> {
  if (!messages || messages.length === 0) {
    return 'New Chat';
  }

  // Try LLM-based title generation if world has LLM provider configured
  if (world && world.chatLLMProvider && world.chatLLMModel) {
    try {
      // Get last 10 human messages for title generation
      const humanMessages = messages
        .filter(msg => msg.role === 'user' && msg.content && msg.content.trim().length > 0)
        .slice(-10);

      if (humanMessages.length > 0) {
        const titlePrompt = `Generate a concise, informative title for this chat conversation. The title should be descriptive but brief.

Recent messages:
${humanMessages.map(msg => `User: ${msg.content}`).join('\n')}

Generate only the title, no quotes or explanations:`;

        const titleMessages: AgentMessage[] = [
          { role: 'user', content: titlePrompt, createdAt: new Date() }
        ];

        // Create a temporary agent configuration for title generation
        const tempAgent: any = {
          id: 'chat-title-generator',
          name: 'Chat Title Generator',
          type: 'title-generator',
          provider: world.chatLLMProvider,
          model: world.chatLLMModel,
          systemPrompt: 'You are a helpful assistant that creates concise, informative titles for chat conversations.',
          temperature: 0.8,
          maxTokens: 50,
          memory: [],
          llmCallCount: 0
        };

        const generatedTitle = await llmManager.generateAgentResponse(world, tempAgent, titleMessages);

        // Clean up the generated title
        let title = generatedTitle.trim().replace(/^["']|["']$/g, ''); // Remove quotes
        title = title.replace(/[\n\r]+/g, ' '); // Replace newlines with spaces
        title = title.replace(/\s+/g, ' '); // Normalize whitespace

        // Truncate if too long
        if (title.length > maxLength) {
          title = title.substring(0, maxLength - 3) + '...';
        }

        if (title && title.length > 0) {
          return title;
        }
      }
    } catch (error) {
      logger.warn('Failed to generate LLM title, using fallback', {
        error: error instanceof Error ? error.message : error
      });
    }
  }

  // Fallback: Use first agent message or user message
  const firstAgentMessage = messages.find(msg =>
    msg.role === 'assistant' &&
    msg.content &&
    msg.content.trim().length > 0
  );

  const firstUserMessage = messages.find(msg =>
    msg.role === 'user' &&
    msg.content &&
    msg.content.trim().length > 0 &&
    !msg.content.startsWith('@') // Skip mention-only messages
  );

  const messageToUse = firstAgentMessage || firstUserMessage;

  if (!messageToUse) {
    return 'New Chat';
  }

  let title = messageToUse.content.trim();

  // Clean up the title
  title = title.replace(/[\n\r]+/g, ' '); // Replace newlines with spaces
  title = title.replace(/\s+/g, ' '); // Normalize whitespace

  // Truncate if too long
  if (title.length > maxLength) {
    title = title.substring(0, maxLength - 3) + '...';
  }

  return title || 'New Chat';
}

/**
 * Create snapshot of current world state
 */
export async function createWorldChat(rootPath: string, worldId: string): Promise<WorldChat> {
  // Ensure modules are initialized
  await moduleInitialization;

  const worldData = await storageWrappers!.loadWorld(worldId);
  if (!worldData) {
    throw new Error(`World ${worldId} not found`);
  }

  const agents = await storageWrappers!.listAgents(worldId);
  const allMessages: AgentMessage[] = [];
  let totalMessages = 0;

  // Collect all agent messages
  for (const agent of agents) {
    if (agent.memory && agent.memory.length > 0) {
      allMessages.push(...agent.memory);
      totalMessages += agent.memory.length;
    }
  }

  const snapshot: WorldChat = {
    world: worldData,
    agents,
    messages: allMessages,
    metadata: {
      capturedAt: new Date(),
      version: '1.0',
      totalMessages,
      activeAgents: agents.filter((a: any) => a.status === 'active').length
    }
  };

  return snapshot;
}

/**
 * Restore world state from snapshot
 */
/**
 * Restore world state from snapshot (consolidated function)
 * Can accept either a snapshot object or a chat ID to load snapshot from
 */
export async function restoreWorldChat(
  rootPath: string,
  worldId: string,
  snapshotOrChatId: WorldChat | string
): Promise<boolean> {
  // Ensure modules are initialized
  await moduleInitialization;

  try {
    let snapshot: WorldChat;

    // Handle different input types
    if (typeof snapshotOrChatId === 'string') {
      // It's a chat ID - load the chat data and extract WorldChat
      const chatId = snapshotOrChatId;
      const chatData = await storageWrappers!.loadChatData(worldId, chatId);
      if (!chatData || !chatData.chat) {
        logger.warn('Chat not found or has no content', { worldId, chatId });
        return false;
      }
      snapshot = chatData.chat;
      logger.debug('Loaded snapshot from chat', { worldId, chatId });
    } else {
      // It's already a snapshot object
      snapshot = snapshotOrChatId;
      logger.debug('Using provided snapshot', { worldId });
    }

    // Core restoration logic
    // Save world configuration
    await storageWrappers!.saveWorld(snapshot.world);

    // Clear existing agents and restore from snapshot
    const existingAgents = await storageWrappers!.listAgents(worldId);
    for (const agent of existingAgents) {
      await storageWrappers!.deleteAgent(worldId, agent.id);
    }

    // Restore agents with their memory
    for (const agentData of snapshot.agents) {
      // Cast AgentData to Agent since storage layer handles data-only objects
      await storageWrappers!.saveAgent(worldId, agentData as any);
      if (agentData.memory && agentData.memory.length > 0) {
        await storageWrappers!.saveAgentMemory(worldId, agentData.id, agentData.memory);
      }
    }

    return true;
  } catch (error) {
    const errorContext = typeof snapshotOrChatId === 'string'
      ? { worldId, chatId: snapshotOrChatId }
      : { worldId };
    logger.error('Failed to restore from snapshot', {
      ...errorContext,
      error: error instanceof Error ? error.message : error
    });
    return false;
  }
}



// ========================
// WORLD EXPORT
// ========================

/**
 * Export world and agents to markdown format
 * 
 * @param rootPath - Root path for worlds data
 * @param worldName - World name or ID to export
 * @returns Promise<string> - Markdown content as string
 */
export async function exportWorldToMarkdown(rootPath: string, worldName: string): Promise<string> {
  // Ensure modules are initialized
  await moduleInitialization;

  // Load world configuration
  const worldData = await getWorldConfig(rootPath, worldName);
  if (!worldData) {
    throw new Error(`World '${worldName}' not found`);
  }

  // Load all agents in the world
  const agents = await listAgents(rootPath, worldData.id);

  // Generate markdown content
  let markdown = `# World Export: ${worldData.name}\n\n`;
  markdown += `**Exported on:** ${new Date().toISOString()}\n\n`;

  // World information
  markdown += `## World Configuration\n\n`;
  markdown += `- **Name:** ${worldData.name}\n`;
  markdown += `- **ID:** ${worldData.id}\n`;
  markdown += `- **Description:** ${worldData.description || 'No description'}\n`;
  markdown += `- **Turn Limit:** ${worldData.turnLimit}\n`;
  markdown += `- **Total Agents:** ${agents.length}\n\n`;

  // Agents section
  if (agents.length > 0) {
    markdown += `## Agents (${agents.length})\n\n`;

    for (const agentInfo of agents) {
      // Load full agent data to get memory
      const fullAgent = await getAgent(rootPath, worldData.id, agentInfo.name);
      if (!fullAgent) continue;

      markdown += `### ${fullAgent.name}\n\n`;
      markdown += `**Configuration:**\n`;
      markdown += `- **ID:** ${fullAgent.id}\n`;
      markdown += `- **Type:** ${fullAgent.type}\n`;
      markdown += `- **LLM Provider:** ${fullAgent.provider}\n`;
      markdown += `- **Model:** ${fullAgent.model}\n`;
      markdown += `- **Status:** ${fullAgent.status || 'active'}\n`;
      markdown += `- **Temperature:** ${fullAgent.temperature || 'default'}\n`;
      markdown += `- **Max Tokens:** ${fullAgent.maxTokens || 'default'}\n`;
      markdown += `- **LLM Calls:** ${fullAgent.llmCallCount}\n`;
      markdown += `- **Created:** ${fullAgent.createdAt ? (fullAgent.createdAt instanceof Date ? fullAgent.createdAt.toISOString() : fullAgent.createdAt) : 'Unknown'}\n`;
      markdown += `- **Last Active:** ${fullAgent.lastActive ? (fullAgent.lastActive instanceof Date ? fullAgent.lastActive.toISOString() : fullAgent.lastActive) : 'Unknown'}\n\n`;

      if (fullAgent.systemPrompt) {
        markdown += `**System Prompt:**\n`;
        markdown += `\`\`\`\n${fullAgent.systemPrompt}\n\`\`\`\n\n`;
      }

      // Agent memory
      if (fullAgent.memory && fullAgent.memory.length > 0) {
        markdown += `**Memory (${fullAgent.memory.length} messages):**\n\n`;

        fullAgent.memory.forEach((message, index) => {
          markdown += `${index + 1}. **${message.role}** ${message.sender ? `(${message.sender})` : ''}\n`;
          if (message.createdAt) {
            markdown += `   *${message.createdAt instanceof Date ? message.createdAt.toISOString() : message.createdAt}*\n`;
          }
          markdown += '   ```markdown\n';
          // Pad each line of content with 4 spaces, preserving original newlines
          let paddedContent = '';
          if (typeof message.content === 'string') {
            // Split by /(?<=\n)/ to preserve empty lines and trailing newlines
            paddedContent = message.content
              .split(/(\n)/)
              .map(part => part === '\n' ? '\n' : '    ' + part)
              .join('');
          }
          markdown += `${paddedContent}\n`;
          markdown += '   ```\n\n';
        });
      } else {
        markdown += `**Memory:** No messages\n\n`;
      }

      markdown += `---\n\n`;
    }
  } else {
    markdown += `## Agents\n\nNo agents found in this world.\n\n`;
  }

  return markdown;
}

// ========================
// ENHANCED MESSAGE PUBLISHING WITH AUTO-SAVE
// ========================

/**
 * Enhanced message publishing with automatic chat session management
 * This wraps the core events.publishMessage with auto-save functionality
 * Use this instead of directly calling events.publishMessage for chat sessions
 */
export async function publishMessageWithAutoSave(
  world: World,
  content: string,
  sender: string,
  currentChatId?: string
): Promise<{ messageId: string; chatId?: string; autoSaved?: boolean }> {
  // First publish the message using core events
  const messageEvent = {
    content,
    sender,
    timestamp: new Date(),
    messageId: utils.generateId()
  };

  // Use core events to publish the message
  events.publishMessage(world, content, sender);

  // Update chat title if this is a human message
  const senderType = utils.determineSenderType(sender);
  if (senderType === SenderType.HUMAN) {
    // Don't await to avoid blocking message publishing
    updateChatTitleFromHumanMessage(world).catch(error => {
      logger.warn('Failed to update chat title after human message', {
        worldId: world.id,
        sender,
        error: error instanceof Error ? error.message : error
      });
    });
  }

  // ENHANCED AUTO-SAVE: Use world's saveCurrentState method
  try {
    // If world has a current chat, auto-save to it
    if (world.currentChatId) {
      await world.saveCurrentState();

      logger.debug('Auto-saved to current chat', {
        worldId: world.id,
        chatId: world.currentChatId,
        sender,
        messageId: messageEvent.messageId
      });

      return {
        messageId: messageEvent.messageId,
        chatId: world.currentChatId,
        autoSaved: true
      };
    } else {
      // No current chat - create new one if we have messages
      const allMessages: AgentMessage[] = [];
      for (const agent of world.agents.values()) {
        if (agent.memory && agent.memory.length > 0) {
          allMessages.push(...agent.memory);
        }
      }

      if (allMessages.length > 0) {
        const updatedWorld = await world.newChat();

        logger.debug('Created new chat for auto-save', {
          worldId: world.id,
          chatId: updatedWorld.currentChatId,
          messageCount: allMessages.length,
          sender,
          messageId: messageEvent.messageId
        });

        return {
          messageId: messageEvent.messageId,
          chatId: updatedWorld.currentChatId || undefined,
          autoSaved: true
        };
      }
    }

    // Return message ID even if auto-save wasn't triggered
    return {
      messageId: messageEvent.messageId,
      chatId: world.currentChatId || undefined,
      autoSaved: false
    };

  } catch (error) {
    // Log error but don't fail message publishing
    logger.error('Auto-save error during message publishing', {
      worldId: world.id,
      sender,
      messageId: messageEvent.messageId,
      error: error instanceof Error ? error.message : error
    });

    return {
      messageId: messageEvent.messageId,
      chatId: world.currentChatId || undefined,
      autoSaved: false
    };
  }
}

/**
 * Wrapper function for backward compatibility
 * Use publishMessageWithAutoSave for new implementations that need auto-save
 */
export function publishMessage(world: World, content: string, sender: string): void {
  events.publishMessage(world, content, sender);
}

/**
 * Publish event to a specific channel using World.eventEmitter (NEW)
 * This enables separation of event types: 'system', 'message', 'sse'
 * @param world - World instance
 * @param type - Event type/channel ('system', 'message', 'sse')
 * @param content - Event content (can be string or object)
 */
export function publishEvent(world: World, type: string, content: any): void {
  events.publishEvent(world, type, content);
}
