/**
 * CLI Message Store - Session-based Conversation Memory
 * 
 * Features:
 * - In-memory storage of all conversation messages during CLI session
 * - Structured message format with timestamps and sender classification
 * - World-based message organization and retrieval
 * - Support for human, agent, and system message types
 * - Memory-efficient storage with configurable retention limits
 * 
 * Implementation:
 * - Function-based approach with Map-based storage
 * - Automatic message ID generation with timestamp-based uniqueness
 * - Sender type classification for consistent message handling
 * - Single capture point through unified display function
 * 
 * Usage:
 * - Call addMessageToStore() from the unified display function
 * - Use getMessagesForWorld() for export operations
 * - Call clearMessagesForWorld() for memory management
 */

import { SenderType } from '../core/types.js';

// Message interface for stored conversations
export interface StoredMessage {
  id: string;
  timestamp: Date;
  sender: string;
  senderType: SenderType;
  content: string;
  worldName: string;
  metadata?: {
    source?: 'cli' | 'streaming' | 'system';
    messageType?: 'response' | 'command' | 'notification' | 'error';
    agentModel?: string;
    tokenCount?: number;
  };
}

// Global message storage for CLI session - Map of worldName -> messages array
const messageStore = new Map<string, StoredMessage[]>();

// Configuration
const MAX_MESSAGES_PER_WORLD = 10000; // Configurable retention limit

/**
 * Add a message to the CLI session store
 */
export function addMessageToStore(message: Omit<StoredMessage, 'id'>): void {
  const messageWithId: StoredMessage = {
    ...message,
    id: generateMessageId()
  };

  // Get or create messages array for this world
  const worldMessages = messageStore.get(message.worldName) || [];

  // Add new message
  worldMessages.push(messageWithId);

  // Apply retention limit if configured
  if (worldMessages.length > MAX_MESSAGES_PER_WORLD) {
    worldMessages.splice(0, worldMessages.length - MAX_MESSAGES_PER_WORLD);
  }

  // Update store
  messageStore.set(message.worldName, worldMessages);
}

/**
 * Get all messages for a specific world
 */
export function getMessagesForWorld(worldName: string): StoredMessage[] {
  return messageStore.get(worldName) || [];
}

/**
 * Get messages for a world since a specific time
 */
export function getMessagesSinceTime(worldName: string, since: Date): StoredMessage[] {
  const worldMessages = messageStore.get(worldName) || [];
  return worldMessages.filter(msg => msg.timestamp >= since);
}

/**
 * Get messages for a world with pagination
 */
export function getMessagesForWorldPaginated(
  worldName: string,
  limit?: number,
  offset?: number
): StoredMessage[] {
  const worldMessages = messageStore.get(worldName) || [];

  if (limit === undefined) {
    return worldMessages;
  }

  const startIndex = offset || 0;
  return worldMessages.slice(startIndex, startIndex + limit);
}

/**
 * Clear all messages for a specific world
 */
export function clearMessagesForWorld(worldName: string): void {
  messageStore.delete(worldName);
}

/**
 * Clear all messages from all worlds
 */
export function clearAllMessages(): void {
  messageStore.clear();
}

/**
 * Get message count for a world
 */
export function getMessageCount(worldName: string): number {
  const worldMessages = messageStore.get(worldName) || [];
  return worldMessages.length;
}

/**
 * Get all worlds that have messages
 */
export function getWorldsWithMessages(): string[] {
  return Array.from(messageStore.keys());
}

/**
 * Get memory usage statistics
 */
export function getMemoryStats(): {
  totalWorlds: number;
  totalMessages: number;
  worldStats: { worldName: string; messageCount: number }[];
} {
  const totalWorlds = messageStore.size;
  let totalMessages = 0;
  const worldStats: { worldName: string; messageCount: number }[] = [];

  messageStore.forEach((messages, worldName) => {
    totalMessages += messages.length;
    worldStats.push({ worldName, messageCount: messages.length });
  });

  return {
    totalWorlds,
    totalMessages,
    worldStats
  };
}

/**
 * Determine sender type from sender name (matches agent.ts logic)
 */
export function determineSenderType(sender: string): SenderType {
  if (sender === 'HUMAN' || sender === 'human' || sender === 'user' || sender === 'you') {
    return SenderType.HUMAN;
  }
  if (sender === 'system' || sender === 'world') {
    return SenderType.WORLD;
  }
  return SenderType.AGENT;
}

/**
 * Generate unique message ID
 */
function generateMessageId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `msg_${timestamp}_${random}`;
}

/**
 * Helper function to create a stored message from basic parameters
 */
export function createStoredMessage(
  sender: string,
  content: string,
  worldName: string,
  metadata?: StoredMessage['metadata']
): Omit<StoredMessage, 'id'> {
  return {
    timestamp: new Date(),
    sender,
    senderType: determineSenderType(sender),
    content,
    worldName,
    metadata
  };
}
