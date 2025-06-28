/**
 * Agent Manager Module - CRUD Operations for Agent Lifecycle
 *
 * Features:
 * - Complete agent lifecycle management (create, read, update, delete)
 * - AgentMessage memory integration with typed operations
 * - System prompt management with markdown file support
 * - Configuration persistence with Date serialization
 * - Isolated operations using agent-storage.ts
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
 *
 * Implementation:
 * - Wraps agent-storage.ts with business logic
 * - Uses only types.ts, utils.ts, and agent-storage.ts
 * - No direct file system dependencies
 * - Ready for EventBus integration in Phase 3
 */

import { Agent, AgentMessage, AgentConfig, LLMProvider } from './types.js';
import {
  saveAgentToDisk,
  loadAgentFromDisk,
  deleteAgentFromDisk,
  loadAllAgentsFromDisk,
  agentExistsOnDisk
} from './agent-storage.js';
import { subscribeAgentToMessages } from './agent-events.js';
import { getWorld } from './world-manager.js';

/**
 * Agent creation parameters
 */
export interface CreateAgentParams {
  id: string;
  name: string;
  type: string;
  provider: LLMProvider;
  model: string;
  systemPrompt?: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Agent update parameters (partial update support)
 */
export interface UpdateAgentParams {
  type?: string;
  config?: Partial<AgentConfig>;
  status?: 'active' | 'inactive' | 'error';
}

/**
 * Agent listing information
 */
export interface AgentInfo {
  id: string;
  name: string;
  type: string;
  model: string;
  status?: string;
  createdAt?: Date;
  lastActive?: Date;
  memorySize: number;
  llmCallCount: number;
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
    type: params.type,
    status: 'inactive',
    config: {
      name: params.name,
      type: params.type,
      provider: params.provider,
      model: params.model,
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
      systemPrompt: params.systemPrompt,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      autoSyncMemory: true // ← Default: enable auto-sync
    },
    createdAt: now,
    lastActive: now,
    llmCallCount: 0,
    memory: []
  };

  await saveAgentToDisk(worldId, agent);

  // Get world for event subscription
  const world = await getWorld(worldId);
  if (world) {
    // Add agent to world
    world.agents.set(agent.id, agent);

    // Automatically subscribe agent to world messages
    const unsubscribe = subscribeAgentToMessages(world, agent);
    agentSubscriptions.set(`${worldId}:${agent.id}`, unsubscribe);
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
    type: updates.type || existingAgent.type,
    status: updates.status || existingAgent.status,
    config: updates.config ? { ...existingAgent.config, ...updates.config } : existingAgent.config,
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
    name: agent.config.name,
    type: agent.type,
    model: agent.config.model,
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
