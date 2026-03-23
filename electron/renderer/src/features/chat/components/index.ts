/**
 * Chat Feature Components Barrel
 *
 * Purpose:
 * - Expose chat-specific business UI components owned by the renderer chat feature.
 *
 * Key Features:
 * - Groups transcript, composer, and chat-local status widgets behind one feature surface.
 * - Re-exports message helper utilities used by focused renderer tests.
 *
 * Implementation Notes:
 * - This barrel is business-specific and must remain outside `design-system/`.
 *
 * Recent Changes:
 * - 2026-03-23: Added the initial feature-scoped chat components barrel.
 */

export { default as ComposerBar } from './ComposerBar';
export { default as EditorChatPane } from './EditorChatPane';
export { default as ElapsedTimeCounter } from './ElapsedTimeCounter';
export { default as MessageContent } from './MessageContent';
export { default as MessageListPanel } from './MessageListPanel';
export * from './MessageContent';
export * from './MessageListPanel';