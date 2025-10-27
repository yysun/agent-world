/**
 * Deletion Domain Module - Message Deletion Logic
 * 
 * Features:
 * - Delete confirmation modal state
 * - Message deletion validation
 * - Deletion state management
 * 
 * Pure functions for testability and reusability.
 * 
 * Created: 2025-10-26 - Phase 2: Domain Module Extraction
 */

import type { WorldComponentState } from '../types';

/**
 * Deletion State Interface
 * Encapsulates message deletion confirmation state
 */
export interface DeletionState {
  messageToDelete: {
    id: string;
    messageId: string;
    chatId: string;
  } | null;
}

/**
 * Show delete confirmation modal
 * Validates message and chat existence before showing modal
 */
export function showDeleteConfirmation(
  state: WorldComponentState,
  messageId: string,
  backendMessageId: string,
  messageText: string,
  userEntered: boolean
): WorldComponentState {
  const message = state.messages.find(msg => msg.id === messageId);
  if (!message || !message.messageId || !state.currentChat?.id) {
    console.warn('Delete blocked:', {
      noMessage: !message,
      noMessageId: !message?.messageId,
      noChatId: !state.currentChat?.id
    });
    return state;
  }

  return {
    ...state,
    messageToDelete: {
      id: messageId,
      messageId: message.messageId,
      chatId: state.currentChat.id
    }
  };
}

/**
 * Hide delete confirmation modal
 */
export function hideDeleteConfirmation(
  state: WorldComponentState
): WorldComponentState {
  return {
    ...state,
    messageToDelete: null
  };
}

/**
 * Check if deletion is ready to proceed
 */
export function canProceedWithDeletion(
  messageToDelete: DeletionState['messageToDelete']
): boolean {
  return messageToDelete !== null;
}

/**
 * Create error state for deletion failure
 */
export function createDeletionErrorState(
  state: WorldComponentState,
  errorMessage: string
): WorldComponentState {
  return {
    ...state,
    messageToDelete: null,
    error: errorMessage
  };
}

/**
 * Create success state after deletion (triggers reload)
 */
export function createDeletionSuccessState(
  state: WorldComponentState
): WorldComponentState {
  return {
    ...state,
    messageToDelete: null
  };
}
