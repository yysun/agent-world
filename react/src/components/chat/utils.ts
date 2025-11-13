/**
 * Message Conversion Utilities
 * 
 * Purpose: Convert between app Message and ChatMessage formats
 * 
 * Features:
 * - Convert Message to ChatMessage
 * - Convert AgentEvent to ChatMessage
 * - Preserve tool-related fields (tool_calls, tool_call_id) for formatting
 * - Type-safe conversions
 * 
 * Changes:
 * - 2025-11-12: Preserve tool_calls and tool_call_id fields for tool call formatting
 * - 2025-11-12: Use message.type for role, fallback to sender-based detection
 * - 2025-11-12: Use message.text as primary content field, fallback to message.content
 * - 2025-11-04: Created for Phase 5 - Integration
 */

import type { Message } from '@/types';
import type { ChatMessage } from './types';

/**
 * Convert app Message to ChatMessage format
 */
export function messageToChatMessage(message: Message): ChatMessage {
  const converted = {
    id: message.id,
    role: message.type as ChatMessage['role'] || (
      message.sender.toLowerCase() === 'human' || message.sender.toLowerCase() === 'you'
        ? 'user'
        : message.sender.toLowerCase() === 'system'
          ? 'system'
          : message.sender.toLowerCase() === 'tool' || message.role === 'tool'
            ? 'tool'
            : 'assistant'
    ),
    content: message.text || message.content || '',
    createdAt: message.timestamp || (message.createdAt ? new Date(message.createdAt).toISOString() : new Date().toISOString()),
    sender: message.sender,
    messageId: message.messageId || message.id,
    replyToMessageId: message.replyToMessageId,
    // Preserve tool-related fields for formatting
    tool_calls: (message as any).tool_calls || (message as any).toolCalls,
    tool_call_id: (message as any).tool_call_id || (message as any).toolCallId,
    // Preserve all extended Message fields by spreading
    ...(message as any)
  };

  return converted;
}

/**
 * Convert array of Messages to ChatMessages
 */
export function messagesToChatMessages(messages: Message[]): ChatMessage[] {
  return messages.map(messageToChatMessage);
}
