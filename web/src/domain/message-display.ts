/**
 * Message Display Domain Module - Message UI State Management
 * 
 * Features:
 * - Log details toggle (expand/collapse message logs)
 * - Scroll acknowledgment (scroll state management)
 * - Message UI state updates
 * - Display optimization helpers
 * 
 * Pure functions for testability and reusability.
 * 
 * Created: 2025-10-27 - Domain Module Extraction from World.update.ts
 */

import type { WorldComponentState, Message } from '../types';

/**
 * Generic Data Interface for Framework Agnosticism
 * Can be adapted to any frontend framework
 */
export interface MessageDisplayData {
  messages: Message[];
  needScroll: boolean;
}

/**
 * Message Display State Interface (AppRun-specific)
 * Encapsulates message display-related state
 */
export interface MessageDisplayState {
  messages: Message[];
  needScroll: boolean;
}

/**
 * Framework-agnostic business logic for toggling log details
 * Returns the changes needed, not the full state
 */
export function toggleLogDetailsLogic(
  data: MessageDisplayData,
  messageId: string | number
): {
  success: boolean;
  changes: {
    messages: Message[];
    needScroll: boolean;
  };
} {
  if (!messageId || !data.messages) {
    return {
      success: false,
      changes: {
        messages: data.messages,
        needScroll: data.needScroll
      }
    };
  }

  const messages = data.messages.map(msg => {
    if (String(msg.id) === String(messageId)) {
      return {
        ...msg,
        isLogExpanded: !msg.isLogExpanded
      };
    }
    return msg;
  });

  return {
    success: true,
    changes: {
      messages,
      needScroll: false // Don't auto-scroll when toggling logs
    }
  };
}

/**
 * Toggle log details expansion for a specific message - AppRun-specific wrapper
 * 
 * @param state - Current component state
 * @param messageId - ID of message to toggle
 * @returns Updated state with toggled log expansion
 */
export function toggleLogDetails(
  state: WorldComponentState,
  messageId: string | number
): WorldComponentState {
  const data: MessageDisplayData = {
    messages: state.messages,
    needScroll: state.needScroll
  };

  const result = toggleLogDetailsLogic(data, messageId);

  if (result.success) {
    return {
      ...state,
      messages: result.changes.messages,
      needScroll: result.changes.needScroll
    };
  } else {
    return state;
  }
}

/**
 * Framework-agnostic business logic for acknowledging scroll
 * Returns the changes needed, not the full state
 */
export function acknowledgeScrollLogic(): {
  success: boolean;
  changes: {
    needScroll: boolean;
  };
} {
  return {
    success: true,
    changes: {
      needScroll: false
    }
  };
}

/**
 * Acknowledge scroll request (clear needScroll flag) - AppRun-specific wrapper
 * 
 * @param state - Current component state
 * @returns Updated state with scroll acknowledged
 */
export function acknowledgeScroll(
  state: WorldComponentState
): WorldComponentState {
  const result = acknowledgeScrollLogic();

  return {
    ...state,
    needScroll: result.changes.needScroll
  };
}

/**
 * Helper function to find message by ID
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
 * Helper function to update message log expansion state
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
 * Helper function to toggle message log expansion
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
 * Helper function to check if message has expandable content
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
 * Helper function to update multiple messages
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

/**
 * Helper function to create scroll state update
 * 
 * @param state - Current state
 * @param needScroll - New scroll state
 * @returns Updated state with scroll flag
 */
export function updateScrollState(
  state: WorldComponentState,
  needScroll: boolean
): WorldComponentState {
  return {
    ...state,
    needScroll
  };
}

/**
 * Helper function to batch message updates with scroll state
 * 
 * @param state - Current state
 * @param messages - Updated messages
 * @param needScroll - Whether to trigger scroll
 * @returns Updated state with messages and scroll flag
 */
export function updateMessagesWithScroll(
  state: WorldComponentState,
  messages: Message[],
  needScroll: boolean = false
): WorldComponentState {
  return {
    ...state,
    messages,
    needScroll
  };
}