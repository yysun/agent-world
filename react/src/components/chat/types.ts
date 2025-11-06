/**
 * Chat Component Type Definitions
 * 
 * Purpose: TypeScript types for chat UI components
 * 
 * Features:
 * - ChatRole and ChatMessage interfaces
 * - Type guards for role checking
 * - Compatible with core AgentMessage types
 * 
 * Implementation:
 * - Maps to core/types.ts AgentMessage structure
 * - Extends with UI-specific metadata
 * - Provides utility functions for type safety
 * 
 * Changes:
 * - 2025-11-04: Created for Phase 1 - Foundation
 */

/**
 * Chat message role types
 */
export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Tool call structure for function calling
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Chat message interface compatible with core AgentMessage
 */
export interface ChatMessage {
  /** Unique message identifier */
  id: string;

  /** Message role (user, assistant, system, tool) */
  role: ChatRole;

  /** Message text content */
  content: string;

  /** ISO timestamp string */
  createdAt: string;

  /** Optional sender name/identifier */
  sender?: string;

  /** Backend message ID for persistence (REQUIRED for new messages as of v6) */
  messageId?: string;

  /** Parent message ID for threading support (v7+) */
  replyToMessageId?: string;

  /** UI-specific metadata */
  meta?: {
    /** Whether message is currently streaming */
    streaming?: boolean;

    /** Tool name for tool messages */
    toolName?: string;
  };

  /** Tool calls for function calling (assistant messages) */
  tool_calls?: ToolCall[];

  /** Tool call ID for tool response messages */
  tool_call_id?: string;
}

/**
 * Type guard: Check if message is from user
 */
export function isUserMessage(msg: ChatMessage): boolean {
  return msg.role === 'user';
}

/**
 * Type guard: Check if message is from assistant
 */
export function isAssistantMessage(msg: ChatMessage): boolean {
  return msg.role === 'assistant';
}

/**
 * Type guard: Check if message is system message
 */
export function isSystemMessage(msg: ChatMessage): boolean {
  return msg.role === 'system';
}

/**
 * Type guard: Check if message is tool message
 */
export function isToolMessage(msg: ChatMessage): boolean {
  return msg.role === 'tool';
}

/**
 * Type guard: Check if message has tool calls
 */
export function hasToolCalls(msg: ChatMessage): boolean {
  return Boolean(msg.tool_calls && msg.tool_calls.length > 0);
}

/**
 * Type guard: Check if message is a reply (has parent)
 */
export function isReplyMessage(msg: ChatMessage): boolean {
  return Boolean(msg.replyToMessageId);
}

/**
 * Type guard: Check if message is currently streaming
 */
export function isStreamingMessage(msg: ChatMessage): boolean {
  return Boolean(msg.meta?.streaming);
}
