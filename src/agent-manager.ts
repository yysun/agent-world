/**
 * Agent Manager - Agent CRUD Operations
 *
 * Features:
 * - Agent creation, removal, and update operations within worlds
 * - Agent lookup and listing functionality
 * - Agent subscription management for event-driven message processing
 * - Integration with agent persistence and event system
 * - Duplicate subscription prevention for message events
 *
 * Core Functions:
 * - createAgent: Create new agent in specified world with configuration
 * - removeAgent: Remove agent and cleanup subscriptions and disk data
 * - updateAgent: Update agent properties with persistence
 * - getAgent: Retrieve specific agent by name from world
 * - getAgents: List all agents in specified world
 * - subscribeAgentToMessages: Subscribe agent to MESSAGE events (internal)
 * - unsubscribeAgentFromMessages: Unsubscribe agent from events (internal)
 *
 * Implementation:
 * - Uses shared world state from world-state.ts
 * - Manages agent message subscriptions with duplicate prevention
 * - Delegates file I/O operations to world-persistence.ts
 * - Integrates with event-bus for agent message processing
 * - Handles error cases with proper rollback on failures
 * - Uses kebab-case directory names for agent storage
 */

import * as path from 'path';
import fs from 'fs/promises';
import { Agent, AgentConfig } from './types';
import { worlds, agentSubscriptions, subscribeAgentToMessages, unsubscribeAgentFromMessages } from './world-state';
import { saveAgentToDisk, getAgentsDir } from './world-persistence';
import { toKebabCase } from './utils';

/**
 * Get a specific agent from a world by name
 */
export function getAgent(worldName: string, agentName: string): Agent | null {
  const world = worlds.get(worldName);
  if (!world) return null;

  return world.agents.get(agentName) || null;
}

/**
 * Create an agent in a world
 */
export async function createAgent(worldName: string, config: AgentConfig): Promise<Agent | null> {
  const world = worlds.get(worldName);
  if (!world) return null;

  // Validate required config fields
  if (!config.name || !config.type) {
    return null;
  }

  // Clone config to avoid mutating input
  const agentConfig: AgentConfig = { ...config };
  const agent: Agent = {
    name: config.name,
    type: config.type,
    status: 'active',
    config: agentConfig,
    createdAt: new Date(),
    lastActive: new Date(),
    llmCallCount: 0,
    lastLLMCall: undefined
  };

  world.agents.set(agent.name, agent);

  // Save agent to disk
  try {
    await saveAgentToDisk(worldName, agent);
  } catch (error) {
    // Rollback memory change on disk error
    world.agents.delete(agent.name);
    throw error;
  }

  // Subscribe agent to MESSAGE events (with duplicate prevention)
  subscribeAgentToMessages(worldName, agent);

  return agent;
}

/**
 * Remove an agent from a world
 */
export async function removeAgent(worldName: string, agentName: string): Promise<boolean> {
  const world = worlds.get(worldName);
  if (!world || !world.agents.has(agentName)) return false;

  const agent = world.agents.get(agentName);

  // Unsubscribe from message events
  unsubscribeAgentFromMessages(worldName, agentName);

  // Remove from memory
  world.agents.delete(agentName);

  // Remove from disk
  try {
    if (agent) {
      const agentDir = path.join(getAgentsDir(worldName), toKebabCase(agent.name));
      await fs.rm(agentDir, { recursive: true, force: true });
    }
  } catch (error) {
    // Rollback memory change if disk operation fails
    if (agent) {
      world.agents.set(agentName, agent);
    }
    throw error;
  }

  return true;
}

/**
 * Get all agents in a world
 */
export function getAgents(worldName: string): Agent[] {
  const world = worlds.get(worldName);
  if (!world) return [];

  return Array.from(world.agents.values());
}

/**
 * Update an agent's data
 */
export async function updateAgent(worldName: string, agentName: string, updates: Partial<Agent>): Promise<Agent | null> {
  const world = worlds.get(worldName);
  if (!world) return null;

  const agent = world.agents.get(agentName);
  if (!agent) return null;

  const originalAgent = { ...agent };

  const updatedAgent = {
    ...agent,
    ...updates,
    name: agent.name, // Prevent name changes
    lastActive: new Date()
  };

  // Update in memory
  world.agents.set(agentName, updatedAgent);

  // Save to disk
  try {
    await saveAgentToDisk(worldName, updatedAgent);
  } catch (error) {
    // Rollback memory change on disk error
    world.agents.set(agentName, originalAgent);
    throw error;
  }

  return updatedAgent;
}
