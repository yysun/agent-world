/**
 * Input Domain Module - User Input Handling Logic
 * 
 * Features:
 * - Input state management (update, validation)
 * - Send message flow (validation, optimistic updates)
 * - Keyboard event handling (Enter key)
 * 
 * Pure functions for testability and reusability.
 * 
 * Created: 2025-10-26 - Phase 2: Domain Module Extraction
 */

import type { WorldComponentState } from '../types';

/**
 * Input State Interface
 * Encapsulates user input-related state
 */
export interface InputState {
  userInput: string;
  isSending: boolean;
  isWaiting: boolean;
}

/**
 * Update user input value
 */
export function updateInput(
  state: WorldComponentState,
  inputValue: string
): WorldComponentState {
  return {
    ...state,
    userInput: inputValue
  };
}

/**
 * Check if Enter key should trigger send
 */
export function shouldSendOnEnter(
  key: string,
  userInput: string | undefined
): boolean {
  return key === 'Enter' && Boolean(userInput?.trim());
}

/**
 * Validate and prepare message for sending
 * Returns null if validation fails
 */
export function validateAndPrepareMessage(
  userInput: string | undefined,
  worldName: string
): { text: string; message: any } | null {
  const messageText = userInput?.trim();
  if (!messageText) return null;

  const userMessage = {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    sender: 'human',
    text: messageText,
    createdAt: new Date(),
    type: 'user',
    userEntered: true,
    worldName
  };

  return { text: messageText, message: userMessage };
}

/**
 * Create optimistic state update for sending message
 */
export function createSendingState(
  state: WorldComponentState,
  userMessage: any
): WorldComponentState {
  return {
    ...state,
    messages: [...(state.messages || []), userMessage],
    userInput: '',
    isSending: true,
    isWaiting: true,
    needScroll: true
  };
}

/**
 * Create success state after message sent
 */
export function createSentState(
  state: WorldComponentState
): WorldComponentState {
  return {
    ...state,
    isSending: false
  };
}

/**
 * Create error state when send fails
 */
export function createSendErrorState(
  state: WorldComponentState,
  errorMessage: string
): WorldComponentState {
  return {
    ...state,
    isSending: false,
    isWaiting: false,
    error: errorMessage
  };
}
