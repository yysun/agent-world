/**
 * Chat Constants
 *
 * Purpose:
 * - Provide shared chat-session constants and helpers used by core chat flows.
 *
 * Features:
 * - Central default chat title constant for reusable untitled sessions.
 * - Helper to evaluate whether a chat is still in default-title state.
 * - Explicit title provenance type and constants for auto-title vs. manual-rename tracking.
 *
 * Implementation Notes:
 * - Kept framework-agnostic to avoid importing manager/event modules.
 * - Used by both chat lifecycle management and auto-title update paths.
 *
 * Recent Changes:
 * - 2026-03-13: Added TitleProvenance type and TITLE_PROVENANCE_* constants for explicit provenance tracking (Phase 3).
 * - 2026-02-13: Added shared default-title constant and helper for session title logic.
 */

export const NEW_CHAT_TITLE = 'New Chat';

export function isDefaultChatTitle(name: string | null | undefined): boolean {
  return String(name ?? '').trim() === NEW_CHAT_TITLE;
}

/**
 * Title provenance discriminates how the current chat name was assigned:
 *  - 'default': The title has never been changed (still 'New Chat') or is a legacy row.
 *  - 'auto':    The title was set by automatic title generation.
 *  - 'manual':  The title was explicitly renamed by the user.
 */
export type TitleProvenance = 'default' | 'auto' | 'manual';

export const TITLE_PROVENANCE_DEFAULT: TitleProvenance = 'default';
export const TITLE_PROVENANCE_AUTO: TitleProvenance = 'auto';
export const TITLE_PROVENANCE_MANUAL: TitleProvenance = 'manual';

