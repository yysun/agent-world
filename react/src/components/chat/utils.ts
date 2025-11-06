/**
 * Message Conversion Utilities
 * 
 * Purpose: Convert between app Message and ChatMessage formats
 * 
 * Features:
 * - Convert Message to ChatMessage
 * - Convert AgentEvent to ChatMessage
 * - Type-safe conversions
 * 
 * Changes:
 * - 2025-11-04: Created for Phase 5 - Integration
 */

import type { Message } from '@/types';
import type { ChatMessage } from './types';

/**
 * Convert app Message to ChatMessage format
 */
export function messageToChatMessage(message: Message): ChatMessage {
  return {
    id: message.id,
    role: message.sender.toLowerCase() === 'human' || message.sender.toLowerCase() === 'you'
      ? 'user'
      : message.sender.toLowerCase() === 'system'
        ? 'system'
        : 'assistant',
    content: message.content,
    createdAt: message.timestamp,
    sender: message.sender,
    messageId: message.id,
  };
}

/**
 * Convert array of Messages to ChatMessages
 */
export function messagesToChatMessages(messages: Message[]): ChatMessage[] {
  return messages.map(messageToChatMessage);
}
