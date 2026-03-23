/**
 * Settings Feature Public Exports
 *
 * Purpose:
 * - Provide the public settings-feature entry point for renderer imports.
 *
 * Key Features:
 * - Re-exports settings-specific business UI from the dedicated feature boundary.
 *
 * Implementation Notes:
 * - Shared generic UI still comes from `design-system/`; this surface is settings-specific.
 *
 * Recent Changes:
 * - 2026-03-23: Added the initial settings feature export surface.
 */

export * from './components';