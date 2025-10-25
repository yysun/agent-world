/**
 * Storage Validation Utilities
 * 
 * Centralized validation logic for storage operations.
 * Priority 2: Message ID validation to prevent data corruption.
 * 
 * Features:
 * - Automatic message ID migration for legacy data
 * - Non-breaking validation with auto-fix
 * - Transparent handling of missing messageIds
 */

import type { Agent, AgentMessage } from '../types.js';
import { generateId } from '../utils.js';

/**
 * Migrate messages array by adding messageIds to any messages that lack them
 * Returns true if any messages were migrated
 */
export function migrateMessageIds(messages: AgentMessage[], defaultAgentId?: string): boolean {
  let migrated = false;

  for (let i = 0; i < messages.length; i++) {
    if (!messages[i].messageId) {
      let newId = generateId();
      // Fallback if generateId() fails (e.g., in test environments)
      if (!newId) {
        newId = `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      messages[i] = {
        ...messages[i],
        messageId: newId,
        agentId: messages[i].agentId || defaultAgentId || 'unknown'
      };
      migrated = true;
    }
  }

  return migrated;
}

/**
 * Migrate agent messages by adding messageIds to any messages that lack them
 * Returns true if any messages were migrated
 */
export function migrateAgentMessageIds(agent: Agent): boolean {
  let migrated = false;

  agent.memory = agent.memory.map(msg => {
    if (!msg.messageId) {
      migrated = true;
      let newId = generateId();
      // Fallback if generateId() fails (e.g., in test environments)
      if (!newId) {
        newId = `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      return {
        ...msg,
        messageId: newId,
        agentId: msg.agentId || agent.id // Ensure agentId is also set
      };
    }
    return msg;
  });

  return migrated;
}

/**
 * Validate and auto-migrate agent messages
 * Automatically adds messageIds to legacy messages without throwing errors
 * Returns true if migration occurred
 */
export function validateAgentMessageIds(agent: Agent): boolean {
  return migrateAgentMessageIds(agent);
}/**
 * Check if agent has any messages without messageId (non-throwing)
 */
export function hasInvalidMessageIds(agent: Agent): boolean {
  return agent.memory.some(msg => !msg.messageId);
}

/**
 * Get count of messages missing messageId
 */
export function countMissingMessageIds(agent: Agent): number {
  return agent.memory.filter(msg => !msg.messageId).length;
}
