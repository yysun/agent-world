/**
 * Shared Domain Logic for Agent World
 * 
 * Purpose: Pure business logic functions shared between web UI, TUI, and server
 * 
 * Features:
 * - Message validation and processing
 * - Chat management utilities
 * - Message display helpers (expandable content, log expansion)
 * - Streaming state utilities
 * - Input validation
 * 
 * Architecture:
 * - All functions are pure (no side effects)
 * - Framework-agnostic (can be used in React, AppRun, or Node.js)
 * - Uses types from ws/types.ts
 * - Highly testable (unit test with simple assertions)
 * 
 * Location Rationale:
 * - Lives in ws/ folder alongside types and client
 * - Imported by web UI for AppRun components
 * - Imported by TUI for Ink components
 * - No framework dependencies
 * 
 * Import Pattern:
 * ```typescript
 * import { validateMessage, hasExpandableContent } from '../../ws/domain.js';
 * ```
 * 
 * Changes:
 * - 2025-11-02: Initial creation - extracted pure functions from web/src/domain/
 */

import type { Message, Agent, Chat, AgentActivityStatus } from './types.js';

// ========================================
// MESSAGE VALIDATION
// ========================================

/**
 * Validate message content
 * 
 * @param content - Message content to validate
 * @returns Validation result with error message if invalid
 */
export function validateMessage(content: string): { valid: boolean; error?: string } {
  if (!content || content.trim().length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }
  if (content.length > 10000) {
    return { valid: false, error: 'Message too long (max 10000 chars)' };
  }
  return { valid: true };
}

/**
 * Check if Enter key should trigger message send
 * 
 * @param key - Key pressed
 * @param input - Current input value
 * @returns True if should send
 */
export function shouldSendOnEnter(key: string, input: string): boolean {
  return key === 'Enter' && Boolean(input?.trim());
}

// ========================================
// MESSAGE UTILITIES
// ========================================

/**
 * Check if message has expandable content
 * 
 * @param message - Message to check
 * @returns True if message can be expanded
 */
export function hasExpandableContent(message: Message): boolean {
  return Boolean(message.expandable || message.isToolEvent || message.logEvent);
}

/**
 * Find message by ID
 * 
 * @param messages - Array of messages
 * @param id - Message ID to find
 * @returns Found message or undefined
 */
export function findMessageById(messages: Message[], id: string): Message | undefined {
  return messages.find(msg => String(msg.id) === String(id));
}

/**
 * Truncate message content to max length
 * 
 * @param content - Message content
 * @param maxLength - Maximum length
 * @returns Truncated content with ellipsis if needed
 */
export function truncateMessage(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + '...';
}

/**
 * Update message log expansion state
 * 
 * @param messages - Array of messages
 * @param messageId - ID of message to update
 * @returns Updated messages array
 */
export function toggleMessageLogExpansion(messages: Message[], messageId: string): Message[] {
  return messages.map(msg => {
    if (String(msg.id) === String(messageId)) {
      return {
        ...msg,
        isLogExpanded: !msg.isLogExpanded
      };
    }
    return msg;
  });
}

// ========================================
// CHAT UTILITIES
// ========================================

/**
 * Check if chat can be deleted
 * 
 * @param chat - Chat to check
 * @returns True if chat can be deleted
 */
export function canDeleteChat(chat: Chat): boolean {
  return chat.id !== 'default' && chat.messageCount === 0;
}

/**
 * Format chat timestamp for display
 * 
 * @param date - Date to format
 * @returns Formatted timestamp string
 */
export function formatChatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  }).format(date);
}

/**
 * Build chat route path
 * 
 * @param worldName - World name
 * @param chatId - Optional chat ID
 * @returns Route path string
 */
export function buildChatRoutePath(worldName: string, chatId?: string): string {
  const encodedWorldName = encodeURIComponent(worldName);
  if (chatId) {
    return `/World/${encodedWorldName}/${encodeURIComponent(chatId)}`;
  }
  return `/World/${encodedWorldName}`;
}

// ========================================
// STREAMING UTILITIES
// ========================================

/**
 * Check if agent is currently streaming
 * 
 * @param agentName - Agent name to check
 * @param agents - Map of agent statuses
 * @returns True if agent is streaming
 */
export function isStreaming(agentName: string, agents: Map<string, AgentActivityStatus>): boolean {
  return agents.get(agentName)?.phase === 'thinking';
}

/**
 * Get list of active agents
 * 
 * @param agents - Map of agent statuses
 * @returns Array of active agent names
 */
export function getActiveAgents(agents: Map<string, AgentActivityStatus>): string[] {
  return Array.from(agents.entries())
    .filter(([_, status]) => status.phase === 'thinking')
    .map(([name]) => name);
}

/**
 * Check if any agent is currently processing
 * 
 * @param agents - Map of agent statuses
 * @returns True if any agent is active
 */
export function hasActiveAgents(agents: Map<string, AgentActivityStatus>): boolean {
  return Array.from(agents.values()).some(status => status.phase === 'thinking');
}

// ========================================
// AGENT UTILITIES
// ========================================

/**
 * Get agent by name
 * 
 * @param agents - Array of agents
 * @param name - Agent name
 * @returns Found agent or undefined
 */
export function findAgentByName(agents: Agent[], name: string): Agent | undefined {
  return agents.find(agent => agent.name === name);
}

/**
 * Get agent by ID
 * 
 * @param agents - Array of agents
 * @param id - Agent ID
 * @returns Found agent or undefined
 */
export function findAgentById(agents: Agent[], id: string): Agent | undefined {
  return agents.find(agent => agent.id === id);
}

/**
 * Check if agent name is unique
 * 
 * @param agents - Array of agents
 * @param name - Name to check
 * @param excludeId - Optional ID to exclude from check (for edits)
 * @returns True if name is unique
 */
export function isAgentNameUnique(agents: Agent[], name: string, excludeId?: string): boolean {
  return !agents.some(agent =>
    agent.name === name && agent.id !== excludeId
  );
}

// ========================================
// EVENT PROCESSING
// ========================================

/**
 * Process SSE event data into structured format
 * 
 * @param eventType - Type of SSE event
 * @param data - Event data
 * @returns Structured event object
 */
export function processSSEEvent(
  eventType: string,
  data: any
): { type: string; action?: string; content?: string; agentName?: string } | null {
  if (!eventType || !data) return null;

  const result: any = { type: eventType };

  switch (eventType) {
    case 'stream-start':
      result.action = 'start';
      result.agentName = data.sender;
      break;
    case 'stream-chunk':
      result.action = 'chunk';
      result.content = data.content;
      result.agentName = data.sender;
      break;
    case 'stream-end':
      result.action = 'end';
      result.content = data.content;
      result.agentName = data.sender;
      break;
    case 'stream-error':
      result.action = 'error';
      result.content = data.error;
      result.agentName = data.sender;
      break;
  }

  return result;
}

/**
 * Extract message ID from event data
 * 
 * @param data - Event data
 * @returns Message ID or null
 */
export function extractMessageId(data: any): string | null {
  return data?.messageId || data?.id || null;
}

// ========================================
// DISPLAY UTILITIES
// ========================================

/**
 * Format agent name for display
 * 
 * @param agent - Agent object
 * @returns Formatted display name
 */
export function formatAgentDisplayName(agent: Agent): string {
  return agent.description
    ? `${agent.name} (${agent.description})`
    : agent.name;
}

/**
 * Get agent status label
 * 
 * @param agent - Agent object
 * @returns Status label string
 */
export function getAgentStatusLabel(agent: Agent): string {
  if (!agent.status) return 'Unknown';

  switch (agent.status) {
    case 'active':
      return 'Active';
    case 'inactive':
      return 'Inactive';
    case 'error':
      return 'Error';
    default:
      return agent.status;
  }
}

/**
 * Format message timestamp for display
 * 
 * @param date - Date to format
 * @returns Formatted time string
 */
export function formatMessageTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

/**
 * Get message type display label
 * 
 * @param message - Message object
 * @returns Type label string
 */
export function getMessageTypeLabel(message: Message): string {
  if (message.isToolEvent) return 'Tool';
  if (message.logEvent) return 'Log';
  if (message.worldEvent) return 'World';
  return message.type || 'Message';
}
