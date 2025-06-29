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
 * - Automatic world-agent relationship maintenance
 * - Clean separation from internal event systems
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
 * - No direct file system dependencies
 * - Enhanced world-agent relationship management
 * - Ready for EventBus integration in Phase 3
 */

import { Agent, AgentMessage, LLMProvider, CreateAgentParams, UpdateAgentParams, AgentInfo } from './types.js';
import {
  saveAgentToDisk,
  loadAgentFromDisk,
  loadAgentFromDiskWithRetry,
  deleteAgentFromDisk,
  loadAllAgentsFromDisk,
  loadAllAgentsFromDiskBatch,
  agentExistsOnDisk,
  validateAgentIntegrity,
  repairAgentData,
  type AgentLoadOptions,
  type BatchLoadResult
} from './agent-storage.js';
import { subscribeAgentToMessages } from './agent-events.js';
import { getWorld } from './world-manager.js';

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
  subscribeToEvents?: boolean;
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
 * Get world ID from environment variable or default
 */
function getWorldId(): string {
  return process.env.AGENT_WORLD_ID || 'default-world';
}

/**
 * Track agent subscriptions for cleanup
 */
const agentSubscriptions = new Map<string, () => void>();

/**
 * Register agent in world runtime without persistence
 */
export async function registerAgentRuntime(
  agent: Agent,
  options: RuntimeRegistrationOptions = {}
): Promise<boolean> {
  const {
    subscribeToEvents = true,
    updateWorldMap = true,
    validateAgent = false
  } = options;

  try {
    const worldId = getWorldId();

    // Validate agent if requested
    if (validateAgent) {
      if (!agent.id || !agent.type || !agent.name || !agent.provider || !agent.model) {
        throw new Error('Invalid agent structure for runtime registration');
      }
    }

    // Get world for registration
    const world = await getWorld(worldId);
    if (!world) {
      throw new Error(`World '${worldId}' not found for agent runtime registration`);
    }

    // Update world agents Map
    if (updateWorldMap) {
      world.agents.set(agent.id, agent);
    }

    // Subscribe to events
    if (subscribeToEvents) {
      const subscriptionKey = `${worldId}:${agent.id}`;

      // Clean up existing subscription if any
      const existingUnsubscribe = agentSubscriptions.get(subscriptionKey);
      if (existingUnsubscribe) {
        existingUnsubscribe();
      }

      // Create new subscription
      const unsubscribe = subscribeAgentToMessages(world, agent);
      agentSubscriptions.set(subscriptionKey, unsubscribe);
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Load all agents from disk into world runtime
 */
export async function loadAgentsIntoWorld(
  options: AgentLoadOptions & { repairCorrupted?: boolean } = {}
): Promise<WorldSyncResult> {
  const { repairCorrupted = true, ...loadOptions } = options;
  const worldId = getWorldId();

  const result: WorldSyncResult = {
    loadedCount: 0,
    errorCount: 0,
    repairedCount: 0,
    errors: []
  };

  try {
    // Get world
    const world = await getWorld(worldId);
    if (!world) {
      result.errors.push({ agentId: 'SYSTEM', error: `World '${worldId}' not found` });
      result.errorCount++;
      return result;
    }

    // Clear existing agents from world Map
    world.agents.clear();

    // Load agents using batch loading
    const batchResult = await loadAllAgentsFromDiskBatch(worldId, loadOptions);

    // Register successful agents in runtime
    for (const agent of batchResult.successful) {
      const registered = await registerAgentRuntime(agent, {
        subscribeToEvents: true,
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
        const repaired = await repairAgentData(worldId, failure.agentId);
        if (repaired) {
          result.repairedCount++;

          // Try loading again after repair
          const agent = await loadAgentFromDiskWithRetry(worldId, failure.agentId, loadOptions);
          if (agent) {
            const registered = await registerAgentRuntime(agent);
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
export async function syncWorldAgents(): Promise<WorldSyncResult> {
  return loadAgentsIntoWorld({
    includeMemory: true,
    allowPartialLoad: true,
    validateIntegrity: true,
    repairCorrupted: true
  });
}

/**
 * Create multiple agents atomically
 */
export async function createAgentsBatch(params: BatchCreateParams): Promise<BatchCreateResult> {
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
        const agent = await createAgent(agentParams);
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
export async function createAgent(params: CreateAgentParams): Promise<Agent> {
  const worldId = getWorldId();

  // Check if agent already exists
  const exists = await agentExistsOnDisk(worldId, params.id);
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
    autoSyncMemory: true, // ← Default: enable auto-sync
    createdAt: now,
    lastActive: now,
    llmCallCount: 0,
    memory: []
  };

  // Save to disk first
  await saveAgentToDisk(worldId, agent);

  // Register in runtime
  const registered = await registerAgentRuntime(agent, {
    subscribeToEvents: true,
    updateWorldMap: true,
    validateAgent: false
  });

  if (!registered) {
    // Clean up if runtime registration failed
    await deleteAgentFromDisk(worldId, agent.id);
    throw new Error('Failed to register agent in world runtime');
  }

  return agent;
}

/**
 * Load agent by ID with full configuration and memory
 */
export async function getAgent(agentId: string): Promise<Agent | null> {
  const worldId = getWorldId();
  return await loadAgentFromDisk(worldId, agentId);
}

/**
 * Update agent configuration and/or memory
 */
export async function updateAgent(agentId: string, updates: UpdateAgentParams): Promise<Agent | null> {
  const worldId = getWorldId();
  const existingAgent = await loadAgentFromDisk(worldId, agentId);

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
    autoSyncMemory: updates.autoSyncMemory !== undefined ? updates.autoSyncMemory : existingAgent.autoSyncMemory,
    azureEndpoint: updates.azureEndpoint !== undefined ? updates.azureEndpoint : existingAgent.azureEndpoint,
    azureApiVersion: updates.azureApiVersion !== undefined ? updates.azureApiVersion : existingAgent.azureApiVersion,
    azureDeployment: updates.azureDeployment !== undefined ? updates.azureDeployment : existingAgent.azureDeployment,
    ollamaBaseUrl: updates.ollamaBaseUrl !== undefined ? updates.ollamaBaseUrl : existingAgent.ollamaBaseUrl,
    lastActive: new Date()
  };

  await saveAgentToDisk(worldId, updatedAgent);
  return updatedAgent;
}

/**
 * Delete agent and all associated data
 */
export async function deleteAgent(agentId: string): Promise<boolean> {
  const worldId = getWorldId();

  // Unsubscribe from events
  const subscriptionKey = `${worldId}:${agentId}`;
  const unsubscribe = agentSubscriptions.get(subscriptionKey);
  if (unsubscribe) {
    unsubscribe();
    agentSubscriptions.delete(subscriptionKey);
  }

  // Remove from world agents Map
  const world = await getWorld(worldId);
  if (world) {
    world.agents.delete(agentId);
  }

  return await deleteAgentFromDisk(worldId, agentId);
}

/**
 * Get all agent IDs and basic information
 */
export async function listAgents(): Promise<AgentInfo[]> {
  const worldId = getWorldId();
  const allAgents = await loadAllAgentsFromDisk(worldId);

  return allAgents.map(agent => ({
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
export async function updateAgentMemory(agentId: string, messages: AgentMessage[]): Promise<Agent | null> {
  const worldId = getWorldId();
  const existingAgent = await loadAgentFromDisk(worldId, agentId);

  if (!existingAgent) {
    return null;
  }

  const updatedAgent: Agent = {
    ...existingAgent,
    memory: [...existingAgent.memory, ...messages],
    lastActive: new Date()
  };

  await saveAgentToDisk(worldId, updatedAgent);
  return updatedAgent;
}

/**
 * Clear agent memory (reset to empty state)
 */
export async function clearAgentMemory(agentId: string): Promise<Agent | null> {
  const worldId = getWorldId();
  const existingAgent = await loadAgentFromDisk(worldId, agentId);

  if (!existingAgent) {
    return null;
  }

  const updatedAgent: Agent = {
    ...existingAgent,
    memory: [],
    lastActive: new Date()
  };

  await saveAgentToDisk(worldId, updatedAgent);
  return updatedAgent;
}

/**
 * Get agent configuration without memory (lightweight operation)
 */
export async function getAgentConfig(agentId: string): Promise<Omit<Agent, 'memory'> | null> {
  const worldId = getWorldId();
  const agent = await loadAgentFromDisk(worldId, agentId);

  if (!agent) {
    return null;
  }

  const { memory, ...config } = agent;
  return config;
}
