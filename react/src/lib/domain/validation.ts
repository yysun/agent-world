/**
 * Validation Domain Module - Pure validation functions
 * 
 * Source: Extracted from web/src/domain/*.ts (AppRun frontend)
 * Adapted for: React 19.2.0 - Framework-agnostic pure functions
 * 
 * Features:
 * - Input validation (message, Enter key)
 * - Edit text validation
 * - Deletion readiness checks
 * - Chat validation
 * - World name validation
 * 
 * All functions are pure with no side effects.
 * 
 * Changes from source:
 * - Removed AppRun WorldComponentState dependencies
 * - Kept only pure validation logic
 */

import type { Message } from '../../types';

/**
 * Check if Enter key should trigger send
 * 
 * @param key - Key pressed
 * @param userInput - Current input value
 * @returns True if should send message
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
 * 
 * @param userInput - User's input text
 * @param worldName - Name of the world
 * @returns Prepared message object or null if invalid
 */
export function validateAndPrepareMessage(
  userInput: string | undefined,
  worldName: string
): { text: string; message: Message } | null {
  const messageText = userInput?.trim();
  if (!messageText) return null;

  const userMessage: Message = {
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
 * Check if edit text is valid for saving
 * 
 * @param editingText - Text being edited
 * @returns True if text is valid
 */
export function isEditTextValid(editingText: string | undefined): boolean {
  return Boolean(editingText?.trim());
}

/**
 * Check if deletion is ready to proceed
 * 
 * @param messageToDelete - Message to delete metadata
 * @returns True if can proceed with deletion
 */
export function canProceedWithDeletion(
  messageToDelete: { id: string; messageId: string; chatId: string } | null
): boolean {
  return messageToDelete !== null;
}

/**
 * Check if chat can be deleted
 * 
 * @param chatToDelete - Chat to delete metadata
 * @returns True if can delete chat
 */
export function canDeleteChat(
  chatToDelete: { id: string; name: string } | null
): boolean {
  return chatToDelete !== null;
}

/**
 * Validate world name for export
 * 
 * @param worldName - World name to validate
 * @returns True if valid
 */
export function isValidWorldName(worldName: string): boolean {
  return Boolean(worldName && worldName.trim().length > 0);
}
