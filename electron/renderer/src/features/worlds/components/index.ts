/**
 * Worlds Feature Component Exports
 *
 * Purpose:
 * - Expose world-specific renderer components from the worlds feature boundary.
 *
 * Key Features:
 * - Re-exports the full-area world text editor and its field type.
 *
 * Implementation Notes:
 * - Keeps world-owned editor UI out of the transitional `components/` layer.
 *
 * Recent Changes:
 * - 2026-04-11: Added the initial world editor export surface.
 */

export { default as WorldTextEditor } from './WorldTextEditor';
export type { WorldTextEditorField } from './WorldTextEditor';