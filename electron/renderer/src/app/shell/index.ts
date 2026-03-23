/**
 * App Shell Public Exports
 *
 * Purpose:
 * - Provide the public app-shell boundary for the Electron renderer.
 *
 * Key Features:
 * - Re-exports top-level shell components used by the desktop renderer root.
 * - Keeps app-owned composition separate from feature-owned UI and design-system layers.
 *
 * Implementation Notes:
 * - This boundary is for app-level composition only and must not be treated as shared design-system UI.
 *
 * Recent Changes:
 * - 2026-03-23: Added the initial app-shell export surface.
 */

export * from './components';