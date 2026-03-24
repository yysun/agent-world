/**
 * Purpose:
 * - Preserve the legacy World update import path while the implementation moves to feature slices.
 *
 * Key Features:
 * - Re-exports the composed World feature update surface.
 *
 * Notes on Implementation:
 * - Existing tests and callers continue to import `worldUpdateHandlers` from this path during migration.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Replaced the monolithic implementation with a compatibility facade over feature update slices.
 */

export { worldUpdateHandlers } from '../features/world/update';