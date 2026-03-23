/**
 * Electron Renderer Design-System Root Exports
 *
 * Purpose:
 * - Expose the approved public design-system surface for renderer consumers and tests.
 *
 * Key Features:
 * - Re-exports primitive and pattern layers only.
 * - Keeps business-specific UI out of the root surface.
 *
 * Implementation Notes:
 * - Foundations remain CSS-owned and are loaded through the renderer stylesheet entry.
 *
 * Recent Changes:
 * - 2026-03-23: Added the initial root export surface.
 */

export * from './foundations';
export * from './patterns';
export * from './primitives';