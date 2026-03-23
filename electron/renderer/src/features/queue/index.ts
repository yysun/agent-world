/**
 * Queue Feature Public Exports
 *
 * Purpose:
 * - Provide the public queue-feature entry point for renderer imports.
 *
 * Key Features:
 * - Re-exports queue-specific business UI from the queue feature boundary.
 * - Keeps app-level imports off the transitional flat components directory.
 *
 * Implementation Notes:
 * - Shared generic UI still comes from `design-system/`; this surface is business-specific.
 *
 * Recent Changes:
 * - 2026-03-23: Added the initial queue feature export surface.
 */

export * from './components';