/**
 * Chat History Domain Module - Chat Session Management Logic
 * 
 * Features:
 * - Create new chat sessions
 * - Load chat from history
 * - Delete chat sessions
 * - Chat deletion confirmation modal
 * 
 * Pure functions and state helpers for testability.
 * 
 * Created: 2025-10-26 - Phase 2: Domain Module Extraction
 */

import type { WorldComponentState } from '../types';

/**
 * Chat Deletion State Interface
 * Encapsulates chat deletion confirmation state
 */
export interface ChatDeletionState {
  chatToDelete: {
    id: string;
    name: string;
  } | null;
}

/**
 * Show chat deletion confirmation modal
 */
export function showChatDeletionConfirm(
  state: WorldComponentState,
  chat: any
): WorldComponentState {
  return {
    ...state,
    chatToDelete: chat
  };
}

/**
 * Hide chat deletion modal
 */
export function hideChatDeletionModals(
  state: WorldComponentState
): WorldComponentState {
  return {
    ...state,
    chatToDelete: null
  };
}

/**
 * Create loading state for chat operations
 */
export function createChatLoadingState(
  state: WorldComponentState
): WorldComponentState {
  return {
    ...state,
    loading: true
  };
}

/**
 * Create loading state with modal cleared
 */
export function createChatLoadingStateWithClearedModal(
  state: WorldComponentState
): WorldComponentState {
  return {
    ...state,
    loading: true,
    chatToDelete: null
  };
}

/**
 * Create error state for chat operations
 */
export function createChatErrorState(
  state: WorldComponentState,
  errorMessage: string,
  clearModal: boolean = false
): WorldComponentState {
  return {
    ...state,
    loading: false,
    chatToDelete: clearModal ? null : state.chatToDelete,
    error: errorMessage
  };
}

/**
 * Build chat route path
 */
export function buildChatRoutePath(
  worldName: string,
  chatId?: string
): string {
  const encodedWorldName = encodeURIComponent(worldName);
  if (chatId) {
    return `/World/${encodedWorldName}/${encodeURIComponent(chatId)}`;
  }
  return `/World/${encodedWorldName}`;
}

/**
 * Check if chat can be deleted
 */
export function canDeleteChat(
  chatToDelete: ChatDeletionState['chatToDelete']
): boolean {
  return chatToDelete !== null;
}
