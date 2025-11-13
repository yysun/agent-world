/**
 * Message Display Domain Module - Message UI helpers
 * 
 * Source: Extracted from web/src/domain/message-display.ts (AppRun frontend)
 * Adapted for: React 19.2.0 - Framework-agnostic pure functions
 * 
 * Features:
 * - Log details toggle logic
 * - Message expansion state
 * - Message finding and filtering
 * - Reply-to target resolution
 * - UI state helpers
 * 
 * All functions are pure with no side effects.
 * 
 * Changes from source:
 * - Removed AppRun WorldComponentState dependencies
 * - Kept only pure transformation and helper logic
 * - Added getReplyTarget() helper from web/src/components/world-chat.tsx
 */

import type { Message } from '../../types';

/**
 * Resolve reply target from replyToMessageId
 * 
 * Source: web/src/components/world-chat.tsx getReplyTarget()
 * 
 * @param message - Message to check
 * @param allMessages - All messages for lookup
 * @returns Reply target name (HUMAN or agent name), or null if not a reply
 */
export function getReplyTarget(message: Message, allMessages: Message[]): string | null {
  if (!message.replyToMessageId) {
    return null;
  }

  const parentMessage = allMessages.find(m => m.messageId === message.replyToMessageId);
  if (!parentMessage) {
    return null;
  }

  // Determine if parent is from human or agent
  const sender = (parentMessage.sender || '').toLowerCase();
  const isHumanParent = sender === 'human' || sender === 'user' || sender === 'you';

  return isHumanParent ? 'HUMAN' : parentMessage.sender;
}

/**
 * Framework-agnostic business logic for toggling log details
 * 
 * @param messages - Array of messages
 * @param messageId - ID of message to toggle
 * @returns Updated messages array
 */
export function toggleLogDetailsLogic(
  messages: Message[],
  messageId: string | number
): Message[] {
  if (!messageId || !messages) {
    return messages;
  }

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

/**
 * Find message by ID
 * 
 * @param messages - Array of messages
 * @param messageId - ID to search for
 * @returns Found message or undefined
 */
export function findMessageById(
  messages: Message[],
  messageId: string | number
): Message | undefined {
  return messages.find(msg => String(msg.id) === String(messageId));
}

/**
 * Update message log expansion state
 * 
 * @param message - Message to update
 * @param isExpanded - New expansion state
 * @returns Updated message
 */
export function updateMessageLogExpansion(
  message: Message,
  isExpanded: boolean
): Message {
  return {
    ...message,
    isLogExpanded: isExpanded
  };
}

/**
 * Toggle message log expansion
 * 
 * @param message - Message to toggle
 * @returns Updated message with toggled expansion
 */
export function toggleMessageLogExpansion(
  message: Message
): Message {
  return updateMessageLogExpansion(message, !message.isLogExpanded);
}

/**
 * Check if message has expandable content
 * 
 * @param message - Message to check
 * @returns True if message has content that can be expanded
 */
export function hasExpandableContent(
  message: Message
): boolean {
  return Boolean(message.expandable || message.isToolEvent || message.logEvent);
}

/**
 * Update multiple messages based on predicate
 * 
 * @param messages - Array of messages
 * @param updateFn - Function to update individual messages
 * @param predicate - Function to determine which messages to update
 * @returns Updated messages array
 */
export function updateMessages(
  messages: Message[],
  updateFn: (message: Message) => Message,
  predicate: (message: Message) => boolean
): Message[] {
  return messages.map(msg => predicate(msg) ? updateFn(msg) : msg);
}
