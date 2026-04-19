/**
 * Worlds Feature Component Exports
 *
 * Purpose:
 * - Expose world-specific renderer components from the worlds feature boundary.
 *
 * Key Features:
 * - Re-exports world editor, right-panel, and sidebar surfaces.
 *
 * Implementation Notes:
 * - Keeps world-owned editor UI out of the transitional `components/` layer.
 *
 * Recent Changes:
 * - 2026-04-19: Added world panel, import-panel, and sidebar exports for shell routing.
 * - 2026-04-11: Added the initial world editor export surface.
 */

export { default as WorldImportPanel } from './WorldImportPanel';
export { default as WorldPanelContent } from './WorldPanelContent';
export { default as WorldSidebarSection } from './WorldSidebarSection';
export { default as WorldTextEditor } from './WorldTextEditor';
export type { WorldTextEditorField } from './WorldTextEditor';
