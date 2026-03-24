/**
 * Purpose:
 * - Preserve the legacy WorldChat component import path during the feature-layer migration.
 *
 * Key Features:
 * - Re-exports the World feature view implementation.
 *
 * Notes on Implementation:
 * - Existing callers can continue importing from `components` while ownership lives under `features/world/views`.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Replaced the local implementation with a compatibility re-export.
 */

export { default } from '../features/world/views/world-chat';
export * from '../features/world/views/world-chat';
