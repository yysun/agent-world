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
 * Generic State Interface for Framework Agnosticism
 * Can be adapted to any frontend framework
 */
export interface AgentManagementData {
  agents: Agent[];
  messages: any[];
  selectedAgent: Agent | null;
  selectedSettingsTarget: 'world' | 'agent' | 'chat' | null;
}

/**
 * Agent Management State Interface (AppRun-specific)
 * Encapsulates agent-related state
 */
export interface AgentManagementState {
  selectedAgent: Agent | null;
  selectedSettingsTarget: 'world' | 'agent' | 'chat' | null;
  world: {
    agents: Agent[];
  } | null;
  messages: any[];
}

/**
 * Framework-agnostic business logic for agent deletion
 * Returns the changes needed, not the full state
 */
export async function deleteAgentLogic(
  data: AgentManagementData,
  agent: Agent,
  worldName: string
): Promise<{
  success: boolean;
  error?: string;
  changes: {
    agents: Agent[];
    messages: any[];
    selectedAgent: Agent | null;
    selectedSettingsTarget: 'world' | 'agent' | 'chat' | null;
  };
}> {
  try {
    await api.deleteAgent(worldName, agent.name);

    const updatedAgents = data.agents.filter(a => a.id !== agent.id);
    const isSelectedAgent = data.selectedAgent?.id === agent.id;

    return {
      success: true,
      changes: {
        agents: updatedAgents,
        messages: data.messages.filter(msg => msg.sender !== agent.name),
        selectedAgent: isSelectedAgent ? null : data.selectedAgent,
        selectedSettingsTarget: isSelectedAgent ? 'world' : data.selectedSettingsTarget
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to delete agent',
      changes: {
        agents: data.agents,
        messages: data.messages,
        selectedAgent: data.selectedAgent,
        selectedSettingsTarget: data.selectedSettingsTarget
      }
    };
  }
}

/**
 * Delete agent and cleanup associated data (AppRun-specific wrapper)
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
  const data: AgentManagementData = {
    agents: state.world?.agents ?? [],
    messages: state.messages || [],
    selectedAgent: state.selectedAgent,
    selectedSettingsTarget: state.selectedSettingsTarget
  };

  const result = await deleteAgentLogic(data, agent, worldName);

  if (result.success) {
    return {
      ...state,
      world: state.world ? { ...state.world, agents: result.changes.agents } : null,
      messages: result.changes.messages,
      selectedAgent: result.changes.selectedAgent,
      selectedSettingsTarget: result.changes.selectedSettingsTarget
    };
  } else {
    return { ...state, error: result.error || null };
  }
}

/**
 * Framework-agnostic business logic for clearing agent messages
 * Returns the changes needed, not the full state
 */
export async function clearAgentMessagesLogic(
  data: AgentManagementData,
  agent: Agent,
  worldName: string
): Promise<{
  success: boolean;
  error?: string;
  changes: {
    agents: Agent[];
    messages: any[];
    selectedAgent: Agent | null;
  };
}> {
  try {
    await api.clearAgentMemory(worldName, agent.name);

    const updatedAgents = data.agents.map(a =>
      a.id === agent.id ? { ...a, messageCount: 0 } : a
    );

    const updatedSelectedAgent = data.selectedAgent?.id === agent.id
      ? { ...data.selectedAgent, messageCount: 0 }
      : data.selectedAgent;

    return {
      success: true,
      changes: {
        agents: updatedAgents,
        messages: data.messages.filter(msg => msg.sender !== agent.name),
        selectedAgent: updatedSelectedAgent
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to clear agent messages',
      changes: {
        agents: data.agents,
        messages: data.messages,
        selectedAgent: data.selectedAgent
      }
    };
  }
}

/**
 * Clear memory for a specific agent - AppRun-specific wrapper
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
  const data: AgentManagementData = {
    agents: state.world?.agents ?? [],
    messages: state.messages || [],
    selectedAgent: state.selectedAgent,
    selectedSettingsTarget: state.selectedSettingsTarget
  };

  const result = await clearAgentMessagesLogic(data, agent, worldName);

  if (result.success) {
    return {
      ...state,
      world: state.world ? { ...state.world, agents: result.changes.agents } : null,
      messages: result.changes.messages,
      selectedAgent: result.changes.selectedAgent
    };
  } else {
    return { ...state, error: result.error || null };
  }
}

/**
 * Framework-agnostic business logic for clearing all world messages
 * Returns the changes needed, not the full state
 */
export async function clearWorldMessagesLogic(
  data: AgentManagementData,
  worldName: string
): Promise<{
  success: boolean;
  error?: string;
  changes: {
    agents: Agent[];
    messages: any[];
    selectedAgent: Agent | null;
  };
}> {
  try {
    await Promise.all(
      data.agents.map(agent => api.clearAgentMemory(worldName, agent.name))
    );

    const updatedAgents = data.agents.map(agent => ({ ...agent, messageCount: 0 }));
    const updatedSelectedAgent = data.selectedAgent ? { ...data.selectedAgent, messageCount: 0 } : null;

    return {
      success: true,
      changes: {
        agents: updatedAgents,
        messages: [],
        selectedAgent: updatedSelectedAgent
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to clear world messages',
      changes: {
        agents: data.agents,
        messages: data.messages,
        selectedAgent: data.selectedAgent
      }
    };
  }
}

/**
 * Clear memory for all agents in the world - AppRun-specific wrapper
 * 
 * @param state - Current component state
 * @param worldName - Name of the world
 * @returns Promise<WorldComponentState> - Updated state
 */
export async function clearWorldMessages(
  state: WorldComponentState,
  worldName: string
): Promise<WorldComponentState> {
  const data: AgentManagementData = {
    agents: state.world?.agents ?? [],
    messages: state.messages || [],
    selectedAgent: state.selectedAgent,
    selectedSettingsTarget: state.selectedSettingsTarget
  };

  const result = await clearWorldMessagesLogic(data, worldName);

  if (result.success) {
    return {
      ...state,
      world: state.world ? { ...state.world, agents: result.changes.agents } : null,
      messages: result.changes.messages,
      selectedAgent: result.changes.selectedAgent
    };
  } else {
    return { ...state, error: result.error || null };
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