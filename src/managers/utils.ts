/**
 * Manager Utilities - Helper functions and types for managers
 *
 * Features:
 * - Unique ID generation for events and messages
 * - Type definitions for World EventEmitter events
 * - Manager-specific utility functions
 * - Zero dependencies on existing event systems
 *
 * Implementation:
 * - Uses native crypto.randomUUID() for ID generation
 * - Defines event structures for World.eventEmitter
 * - Self-contained utility functions
 * - Ready for manager module integration
 */

/**
 * Generate unique ID for messages and events
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * World message event data structure for World.eventEmitter
 */
export interface WorldMessageEvent {
  content: string;
  sender: string;
  timestamp: Date;
  messageId: string;
}

/**
 * World SSE event data structure for World.eventEmitter
 */
export interface WorldSSEEvent {
  agentName: string;
  type: 'start' | 'chunk' | 'end' | 'error';
  content?: string;
  error?: string;
  messageId: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}
