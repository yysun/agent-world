/**
 * Editing Domain Module - Message Edit Logic
 * 
 * Features:
 * - Edit mode state management
 * - Text update handling
 * - Edit cancellation
 * 
 * Pure functions for testability and reusability.
 * 
 * Created: 2025-10-26 - Phase 2: Domain Module Extraction
 */

import type { WorldComponentState } from '../types';

/**
 * Editing State Interface
 * Encapsulates message editing state
 */
export interface EditingState {
  editingMessageId: string | null;
  editingText: string;
}

/**
 * Start editing a message
 */
export function startEditMessage(
  state: WorldComponentState,
  messageId: string,
  text: string
): WorldComponentState {
  return {
    ...state,
    editingMessageId: messageId,
    editingText: text
  };
}

/**
 * Cancel message editing
 */
export function cancelEditMessage(
  state: WorldComponentState
): WorldComponentState {
  return {
    ...state,
    editingMessageId: null,
    editingText: ''
  };
}

/**
 * Update editing text value
 */
export function updateEditText(
  state: WorldComponentState,
  textValue: string
): WorldComponentState {
  return {
    ...state,
    editingText: textValue
  };
}

/**
 * Check if edit text is valid for saving
 */
export function isEditTextValid(editingText: string | undefined): boolean {
  return Boolean(editingText?.trim());
}
