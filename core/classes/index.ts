/**
 * Classes Module - Object-oriented Core Components
 * 
 * Features:
 * - Unified exports for all core classes (Agent, AgentManager, World)
 * - Factory methods for creating class instances with proper initialization
 * - Configuration interfaces and utility types for class instantiation
 * - Migration helpers for transitioning from function-based to class-based architecture
 * - Backward compatibility wrappers for gradual adoption
 * 
 * Architecture:
 * - Agent: Individual agent instances with full LLM and memory capabilities
 * - AgentManager: Centralized agent lifecycle management with caching
 * - World: Complete world implementation with event system and storage integration
 * - Factory patterns for consistent class instantiation and initialization
 * - Comprehensive error handling and validation across all classes
 * 
 * Usage:
 * ```typescript
 * import { World, Agent, AgentManager } from './classes/index.js';
 * 
 * // Create world with storage manager
 * const world = await World.create({
 *   id: 'my-world',
 *   name: 'My World',
 *   rootPath: '/path/to/data'
 * }, storageManager);
 * 
 * // Create agent
 * const agent = await world.createAgent({
 *   name: 'Assistant',
 *   type: 'helper',
 *   provider: LLMProvider.OPENAI,
 *   model: 'gpt-4'
 * });
 * ```
 * 
 * Migration:
 * - Provides backward compatibility with function-based API
 * - Factory methods create appropriate class instances
 * - Wrapper functions maintain existing API surface
 * - Gradual migration path with feature flags
 * 
 * Changes:
 * - 2025-01-XX: Created as part of class-based architecture refactor
 * - Centralizes all core class exports and factory methods
 * - Provides unified interface for class instantiation
 * - Includes migration utilities for backward compatibility
 */

// Export all core classes
export { Agent } from './Agent.js';
export { AgentManager } from './AgentManager.js';
export { ChatManager } from './ChatManager.js';
export { World } from './World.js';

// Export configuration interfaces
export type { AgentConfig, AgentMetrics } from './Agent.js';
export type { AgentManagerConfig, AgentManagerMetrics, BatchResult } from './AgentManager.js';
export type { ChatManagerConfig, ChatManagerMetrics } from './ChatManager.js';
export type { WorldConfig, WorldMetrics } from './World.js';

// Import for factory methods
import { Agent, AgentConfig } from './Agent.js';
import { AgentManager, AgentManagerConfig } from './AgentManager.js';
import { ChatManager, ChatManagerConfig } from './ChatManager.js';
import { World, WorldConfig } from './World.js';
import type { BaseStorageManager } from '../storage/BaseStorageManager.js';
import type { CreateAgentParams, CreateWorldParams, WorldData } from '../types.js';

/**
 * Factory method to create Agent instance with proper initialization
 */
export async function createAgent(
  config: AgentConfig,
  storageManager: BaseStorageManager,
  worldId: string
): Promise<Agent> {
  const agent = new Agent(config);
  await agent.initialize(storageManager, worldId);
  return agent;
}

/**
 * Factory method to create ChatManager instance
 */
export async function createChatManager(
  storageManager: BaseStorageManager,
  config: ChatManagerConfig
): Promise<ChatManager> {
  const manager = new ChatManager(storageManager, config);
  await manager.initialize();
  return manager;
}

/**
 * Factory method to create AgentManager instance
 */
export async function createAgentManager(
  storageManager: BaseStorageManager,
  config: AgentManagerConfig
): Promise<AgentManager> {
  const manager = new AgentManager(storageManager, config);
  await manager.initialize();
  return manager;
}

/**
 * Factory method to create World instance - replaces worldDataToWorld
 */
export async function createWorld(
  config: WorldConfig,
  storageManager: BaseStorageManager
): Promise<World> {
  return await World.create(config, storageManager);
}

/**
 * Factory method to create World from existing WorldData
 */
export async function createWorldFromData(
  worldData: WorldData,
  rootPath: string,
  storageManager: BaseStorageManager
): Promise<World> {
  return await World.fromWorldData(worldData, rootPath, storageManager);
}

/**
 * Migration utility: Convert function-based agent creation to class-based
 */
export async function migrateCreateAgent(
  legacyParams: CreateAgentParams,
  storageManager: BaseStorageManager,
  worldId: string
): Promise<Agent> {
  const agentConfig: AgentConfig = {
    id: legacyParams.id || generateAgentId(legacyParams.name),
    name: legacyParams.name,
    type: legacyParams.type,
    provider: legacyParams.provider,
    model: legacyParams.model,
    systemPrompt: legacyParams.systemPrompt,
    temperature: legacyParams.temperature,
    maxTokens: legacyParams.maxTokens,
    status: 'active'
  };
  
  return await createAgent(agentConfig, storageManager, worldId);
}

/**
 * Migration utility: Convert function-based world creation to class-based
 */
export async function migrateCreateWorld(
  rootPath: string,
  legacyParams: CreateWorldParams,
  storageManager: BaseStorageManager
): Promise<World> {
  const worldConfig: WorldConfig = {
    id: generateWorldId(legacyParams.name),
    rootPath,
    name: legacyParams.name,
    description: legacyParams.description,
    turnLimit: legacyParams.turnLimit || 5,
    chatLLMProvider: legacyParams.chatLLMProvider,
    chatLLMModel: legacyParams.chatLLMModel
  };
  
  return await createWorld(worldConfig, storageManager);
}

/**
 * Backward compatibility wrapper: Creates world that matches old World interface
 */
export async function createLegacyCompatibleWorld(
  rootPath: string,
  params: CreateWorldParams,
  storageManager: BaseStorageManager
): Promise<any> {
  const world = await migrateCreateWorld(rootPath, params, storageManager);
  
  // Return world with legacy interface methods
  return {
    // Core properties
    id: world.id,
    rootPath: world.rootPath,
    name: world.name,
    description: world.description,
    turnLimit: world.turnLimit,
    chatLLMProvider: world.chatLLMProvider,
    chatLLMModel: world.chatLLMModel,
    currentChatId: world.currentChatId,
    eventEmitter: world.eventEmitter,
    agents: world.agents,
    storage: world.storage,
    messageProcessor: world.messageProcessor,
    
    // Agent operations
    createAgent: (params: CreateAgentParams) => world.createAgent(params),
    getAgent: (agentName: string) => world.getAgent(agentName),
    updateAgent: (agentName: string, updates: any) => world.updateAgent(agentName, updates),
    deleteAgent: (agentName: string) => world.deleteAgent(agentName),
    clearAgentMemory: (agentName: string) => world.clearAgentMemory(agentName),
    listAgents: () => world.listAgents(),
    updateAgentMemory: (agentName: string, messages: any[]) => world.updateAgentMemory(agentName, messages),
    saveAgentConfig: (agentName: string) => world.saveAgentConfig(agentName),
    
    // Chat operations
    createChatData: (params: any) => world.createChatData(params),
    loadChatData: (chatId: string) => world.loadChatData(chatId),
    loadChat: (chatId: string) => world.loadChat(chatId),
    loadChatFull: (chatId: string) => world.loadChatFull(chatId),
    updateChatData: (chatId: string, updates: any) => world.updateChatData(chatId, updates),
    deleteChatData: (chatId: string) => world.deleteChatData(chatId),
    listChats: () => world.listChats(),
    createWorldChat: () => world.createWorldChat(),
    restoreFromWorldChat: (chatId: string) => world.restoreFromWorldChat(chatId),
    
    // Enhanced chat methods
    isCurrentChatReusable: () => world.isCurrentChatReusable(),
    reuseCurrentChat: () => world.reuseCurrentChat(),
    createNewChat: () => world.createNewChat(),
    newChat: () => world.newChat(),
    loadChatById: (chatId: string) => world.loadChatById(chatId),
    getCurrentChat: () => world.getCurrentChat(),
    saveCurrentState: () => world.saveCurrentState(),
    
    // World operations
    save: () => world.save(),
    delete: () => world.delete(),
    reload: () => world.reload(),
    
    // Utility methods
    getTurnLimit: () => world.getTurnLimit(),
    getCurrentTurnCount: () => world.getCurrentTurnCount(),
    hasReachedTurnLimit: () => world.hasReachedTurnLimit(),
    resetTurnCount: () => world.resetTurnCount(),
    
    // Event methods
    publishMessage: (content: string, sender: string) => world.publishMessage(content, sender),
    subscribeToMessages: (handler: any) => world.subscribeToMessages(handler),
    publishSSE: (data: any) => world.publishSSE(data),
    subscribeToSSE: (handler: any) => world.subscribeToSSE(handler),
    
    // Agent subscription methods
    subscribeAgent: (agent: any) => world.subscribeAgent(agent),
    unsubscribeAgent: (agentId: string) => world.unsubscribeAgent(agentId),
    getSubscribedAgents: () => world.getSubscribedAgents(),
    isAgentSubscribed: (agentId: string) => world.isAgentSubscribed(agentId),
    
    // Additional methods for compatibility
    getMetrics: () => world.getMetrics(),
    cleanup: () => world.cleanup()
  };
}

/**
 * Utility to determine if class-based architecture should be used
 * Can be controlled via environment variable or feature flag
 */
export function shouldUseClassBasedArchitecture(): boolean {
  return process.env.AGENT_WORLD_USE_CLASSES === 'true' || false;
}

/**
 * Feature flag for gradual migration
 */
export function enableClassBasedFeatures(): void {
  process.env.AGENT_WORLD_USE_CLASSES = 'true';
}

/**
 * Feature flag to disable class-based features
 */
export function disableClassBasedFeatures(): void {
  process.env.AGENT_WORLD_USE_CLASSES = 'false';
}

// Helper functions
function generateAgentId(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateWorldId(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}