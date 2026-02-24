/**
 * Chat Constants
 *
 * Purpose:
 * - Provide shared chat-session constants and helpers used by core chat flows.
 *
 * Features:
 * - Central default chat title constant for reusable untitled sessions.
 * - Helper to evaluate whether a chat is still in default-title state.
 *
 * Implementation Notes:
 * - Kept framework-agnostic to avoid importing manager/event modules.
 * - Used by both chat lifecycle management and auto-title update paths.
 *
 * Recent Changes:
 * - 2026-02-13: Added shared default-title constant and helper for session title logic.
 */

export const NEW_CHAT_TITLE = 'New Chat';

export function isDefaultChatTitle(name: string | null | undefined): boolean {
  return String(name ?? '').trim() === NEW_CHAT_TITLE;
}

