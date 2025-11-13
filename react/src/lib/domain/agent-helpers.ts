/**
 * Agent Helpers Domain Module - Agent array transformations
 * 
 * Source: Extracted from web/src/domain/agent-management.ts (AppRun frontend)
 * Adapted for: React 19.2.0 - Framework-agnostic pure functions
 * 
 * Features:
 * - Agent array updates
 * - Message filtering by agent
 * - Selected agent state helpers
 * 
 * All functions are pure with no side effects.
 * 
 * Changes from source:
 * - Removed API calls (moved to hooks)
 * - Removed AppRun WorldComponentState dependencies
 * - Kept only pure array transformation helpers
 */

import type { Agent, Message } from '../../types';

/**
 * Update agent message count
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
 * Filter messages by agent
 * 
 * @param messages - Array of messages
 * @param agentName - Name of agent to filter out
 * @returns Filtered messages array
 */
export function filterMessagesByAgent(
  messages: Message[],
  agentName: string
): Message[] {
  return messages.filter(msg => msg.sender !== agentName);
}

/**
 * Reset selected agent if it matches the target
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
