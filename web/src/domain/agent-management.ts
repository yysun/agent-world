/**
 * Agent Management Domain Module - Agent CRUD and Memory Operations
 * 
 * Features:
 * - Agent deletion with message cleanup
 * - Agent memory clearing (individual agents)
 * - World memory clearing (all agents)
 * - Agent state updates and UI consistency
 * 
 * Pure functions for testability and reusability.
 * 
 * Created: 2025-10-27 - Domain Module Extraction from World.update.ts
 */

import type { WorldComponentState, Agent } from '../types';
import api from '../api';

/**
 * Agent Management State Interface
 * Encapsulates agent-related state
 */
export interface AgentManagementState {
  selectedAgent: Agent | null;
  selectedSettingsTarget: 'world' | string;
  world: {
    agents: Agent[];
  } | null;
  messages: any[];
}

/**
 * Delete agent and cleanup associated data
 * 
 * @param state - Current component state
 * @param agent - Agent to delete
 * @param worldName - Name of the world
 * @returns Promise<WorldComponentState> - Updated state
 */
export async function deleteAgent(
  state: WorldComponentState,
  agent: Agent,
  worldName: string
): Promise<WorldComponentState> {
  try {
    await api.deleteAgent(worldName, agent.name);

    const updatedAgents = (state.world?.agents ?? []).filter(a => a.id !== agent.id);
    const isSelectedAgent = state.selectedAgent?.id === agent.id;

    return {
      ...state,
      world: state.world ? { ...state.world, agents: updatedAgents } : null,
      messages: (state.messages || []).filter(msg => msg.sender !== agent.name),
      selectedAgent: isSelectedAgent ? null : state.selectedAgent,
      selectedSettingsTarget: isSelectedAgent ? 'world' : state.selectedSettingsTarget
    };
  } catch (error: any) {
    return { ...state, error: error.message || 'Failed to delete agent' };
  }
}

/**
 * Clear memory for a specific agent
 * 
 * @param state - Current component state
 * @param agent - Agent whose memory to clear
 * @param worldName - Name of the world
 * @returns Promise<WorldComponentState> - Updated state
 */
export async function clearAgentMessages(
  state: WorldComponentState,
  agent: Agent,
  worldName: string
): Promise<WorldComponentState> {
  try {
    await api.clearAgentMemory(worldName, agent.name);

    const updatedAgents = state.world?.agents.map(a =>
      a.id === agent.id ? { ...a, messageCount: 0 } : a
    ) ?? [];

    const updatedSelectedAgent = state.selectedAgent?.id === agent.id
      ? { ...state.selectedAgent, messageCount: 0 }
      : state.selectedAgent;

    return {
      ...state,
      world: state.world ? { ...state.world, agents: updatedAgents } : null,
      messages: (state.messages || []).filter(msg => msg.sender !== agent.name),
      selectedAgent: updatedSelectedAgent
    };
  } catch (error: any) {
    return { ...state, error: error.message || 'Failed to clear agent messages' };
  }
}

/**
 * Clear memory for all agents in the world
 * 
 * @param state - Current component state
 * @param worldName - Name of the world
 * @returns Promise<WorldComponentState> - Updated state
 */
export async function clearWorldMessages(
  state: WorldComponentState,
  worldName: string
): Promise<WorldComponentState> {
  try {
    await Promise.all(
      (state.world?.agents ?? []).map(agent => api.clearAgentMemory(worldName, agent.name))
    );

    const updatedAgents = (state.world?.agents ?? []).map(agent => ({ ...agent, messageCount: 0 }));
    const updatedSelectedAgent = state.selectedAgent ? { ...state.selectedAgent, messageCount: 0 } : null;

    return {
      ...state,
      world: state.world ? { ...state.world, agents: updatedAgents } : null,
      messages: [],
      selectedAgent: updatedSelectedAgent
    };
  } catch (error: any) {
    return { ...state, error: error.message || 'Failed to clear world messages' };
  }
}

/**
 * Helper function to update agent message count
 * 
 * @param agents - Array of agents
 * @param agentId - ID of agent to update
 * @param messageCount - New message count
 * @returns Updated agents array
 */
export function updateAgentMessageCount(
  agents: Agent[],
  agentId: string,
  messageCount: number
): Agent[] {
  return agents.map(agent =>
    agent.id === agentId ? { ...agent, messageCount } : agent
  );
}

/**
 * Helper function to filter messages by agent
 * 
 * @param messages - Array of messages
 * @param agentName - Name of agent to filter out
 * @returns Filtered messages array
 */
export function filterMessagesByAgent(
  messages: any[],
  agentName: string
): any[] {
  return messages.filter(msg => msg.sender !== agentName);
}

/**
 * Helper function to reset selected agent if it matches the target
 * 
 * @param selectedAgent - Currently selected agent
 * @param targetAgentId - ID of agent to check against
 * @returns Updated selected agent (null if it was the target)
 */
export function resetSelectedAgentIfMatch(
  selectedAgent: Agent | null,
  targetAgentId: string
): Agent | null {
  return selectedAgent?.id === targetAgentId ? null : selectedAgent;
}

/**
 * Helper function to reset settings target if selected agent was deleted
 * 
 * @param selectedSettingsTarget - Current settings target
 * @param selectedAgent - Currently selected agent
 * @param deletedAgentId - ID of deleted agent
 * @returns Updated settings target
 */
export function resetSettingsTargetIfAgentDeleted(
  selectedSettingsTarget: string,
  selectedAgent: Agent | null,
  deletedAgentId: string
): string {
  const wasSelectedAgent = selectedAgent?.id === deletedAgentId;
  return wasSelectedAgent ? 'world' : selectedSettingsTarget;
}