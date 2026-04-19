/**
 * Agents Feature Component Exports
 *
 * Purpose:
 * - Expose agent-specific renderer components from the agents feature boundary.
 *
 * Key Features:
 * - Re-exports the full-area agent prompt editor and right-panel agent form surfaces.
 *
 * Implementation Notes:
 * - Keeps agent-owned editor UI out of the transitional `components/` layer.
 *
 * Recent Changes:
 * - 2026-04-19: Added agent form and panel exports for shell routing.
 * - 2026-04-11: Added the initial agent editor export surface.
 */

export { default as AgentFormFields } from './AgentFormFields';
export { default as AgentPanelContent } from './AgentPanelContent';
export { default as AgentPromptEditor } from './AgentPromptEditor';
