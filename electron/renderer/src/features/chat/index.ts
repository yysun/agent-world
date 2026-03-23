/**
 * Chat Feature Public Exports
 *
 * Purpose:
 * - Provide the public chat-feature entry point for renderer imports.
 *
 * Key Features:
 * - Re-exports chat business UI from the dedicated chat feature boundary.
 * - Keeps app-shell imports off the transitional flat components directory.
 *
 * Implementation Notes:
 * - Shared generic UI still comes from `design-system/`; this surface is chat-specific.
 *
 * Recent Changes:
 * - 2026-03-23: Added the initial chat feature export surface.
 */

export * from './components';