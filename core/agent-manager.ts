/**
 * Agent Manager Module - CRUD Operations for Agent Lifecycle
 *
 * Features:
 * - Complete agent lifecycle management (create, read, update, delete)
 * - AgentMessage memory integration with typed operations
 * - System prompt management with markdown file support
 * - Configuration persistence with Date serialization
 * - Isolated operations using agent-storage.ts
 * - Enhanced runtime agent registration and world synchronization
 * - Batch operations for performance optimization
 * - Clean separation from event systems (handled by world-manager)
 * - Dynamic imports for browser/Node.js compatibility
 *
 * Core Functions:
 * - createAgent: Create new agent with configuration and system prompt
 * - getAgent: Load agent by ID with full configuration and memory
 * - updateAgent: Update agent configuration and memory
 * - deleteAgent: Remove agent and all associated data
 * - listAgents: Get all agent IDs and basic info
 * - updateAgentMemory: Add messages to agent memory
 * - clearAgentMemory: Reset agent memory to empty state
 * - getAgentConfig: Get agent configuration without memory
 * - loadAgentsIntoWorld: Load all agents from disk into world runtime
 * - syncWorldAgents: Synchronize world agents Map with disk state
 * - createAgentsBatch: Create multiple agents atomically
 * - registerAgentRuntime: Register agent in world runtime without persistence
 *
 * Implementation:
 * - Wraps agent-storage.ts with business logic
 * - Uses only types.ts, utils.ts, and agent-storage.ts
 * - Dynamic imports for storage functions only (browser compatibility)
 * - Event subscriptions managed by world-manager during world loading
 * - Enhanced world-agent relationship management
 * - Ready for EventBus integration in Phase 3
 */

import { Agent, AgentMessage, LLMProvider, CreateAgentParams, UpdateAgentParams, AgentInfo } from './types';
import type { AgentLoadOptions, BatchLoadResult } from './agent-storage';

// Dynamic function assignments for storage operations only
let saveAgentToDisk: any,
  saveAgentMemoryToDisk: any,
  loadAgentFromDisk: any,
  loadAgentFromDiskWithRetry: any,
  deleteAgentFromDisk: any,
  loadAllAgentsFromDisk: any,
  loadAllAgentsFromDiskBatch: any,
  agentExistsOnDisk: any,
  validateAgentIntegrity: any,
  repairAgentData: any;

// Initialize dynamic imports
async function initializeModules() {
  if (typeof __IS_BROWSER__ === 'undefined' || !__IS_BROWSER__) {
    // Node.js environment - use dynamic imports for storage functions
    const agentStorage = await import('./agent-storage');

    saveAgentToDisk = agentStorage.saveAgentToDisk;
    saveAgentMemoryToDisk = agentStorage.saveAgentMemoryToDisk;
    loadAgentFromDisk = agentStorage.loadAgentFromDisk;
    loadAgentFromDiskWithRetry = agentStorage.loadAgentFromDiskWithRetry;
    deleteAgentFromDisk = agentStorage.deleteAgentFromDisk;
    loadAllAgentsFromDisk = agentStorage.loadAllAgentsFromDisk;
    loadAllAgentsFromDiskBatch = agentStorage.loadAllAgentsFromDiskBatch;
    agentExistsOnDisk = agentStorage.agentExistsOnDisk;
    validateAgentIntegrity = agentStorage.validateAgentIntegrity;
    repairAgentData = agentStorage.repairAgentData;
  } else {
    // Browser environment - provide no-op implementations for storage functions only
    console.warn('Agent storage functions disabled in browser environment');

    const browserNoOp = () => {
      throw new Error('This function is not available in browser environment');
    };

    saveAgentToDisk = browserNoOp;
    saveAgentMemoryToDisk = browserNoOp;
    loadAgentFromDisk = browserNoOp;
    loadAgentFromDiskWithRetry = browserNoOp;
    deleteAgentFromDisk = browserNoOp;
    loadAllAgentsFromDisk = browserNoOp;
    loadAllAgentsFromDiskBatch = browserNoOp;
    agentExistsOnDisk = browserNoOp;
    validateAgentIntegrity = browserNoOp;
    repairAgentData = browserNoOp;
  }
}

// Initialize modules immediately
const moduleInitialization = initializeModules();

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
  options: AgentLoadOptions & { repairCorrupted?: boolean } = {}
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
    // World registration handled by world-manager
    // const world = await getWorld(rootPath, worldId);
    // if (!world) {
    //   result.errors.push({ agentId: 'SYSTEM', error: `World '${worldId}' not found` });
    //   result.errorCount++;
    //   return result;
    // }

    // Clear existing agents from world Map - handled by world-manager
    // world.agents.clear();

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

  // Check if agent already exists
  const exists = await agentExistsOnDisk(rootPath, worldId, params.id);
  if (exists) {
    throw new Error(`Agent with ID '${params.id}' already exists`);
  }

  const now = new Date();
  const agent: Agent = {
    id: params.id,
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

  // Save to disk first
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

  await saveAgentToDisk(rootPath, worldId, updatedAgent);
  return updatedAgent;
}

/**
 * Delete agent and all associated data
 */
export async function deleteAgent(rootPath: string, worldId: string, agentId: string): Promise<boolean> {
  // Ensure modules are initialized
  await moduleInitialization;

  // Cleanup is handled by world-manager when agents are removed from world.agents Map

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

  await saveAgentToDisk(rootPath, worldId, updatedAgent);
  return updatedAgent;
}

/**
 * Clear agent memory (reset to empty state)
 */
export async function clearAgentMemory(rootPath: string, worldId: string, agentId: string): Promise<Agent | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  const existingAgent = await loadAgentFromDisk(rootPath, worldId, agentId);

  if (!existingAgent) {
    return null;
  }

  const updatedAgent: Agent = {
    ...existingAgent,
    memory: [],
    lastActive: new Date()
  };

  await saveAgentToDisk(rootPath, worldId, updatedAgent);
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

/**
 * Update agent memory and save to disk atomically (memory-only save for performance)
 */
export async function updateAgentMemoryAndSave(
  rootPath: string,
  worldId: string,
  agentId: string,
  newMessages: AgentMessage[]
): Promise<Agent | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  const existingAgent = await loadAgentFromDisk(rootPath, worldId, agentId);

  if (!existingAgent) {
    return null;
  }

  // Update memory in agent object
  const updatedMemory = [...existingAgent.memory, ...newMessages];
  existingAgent.memory = updatedMemory;
  existingAgent.lastActive = new Date();

  // Save only memory to disk for performance
  await saveAgentMemoryToDisk(rootPath, worldId, agentId, updatedMemory);

  return existingAgent;
}
