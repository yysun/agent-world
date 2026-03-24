/**
 * Purpose:
 * - Re-export World feature view modules through a feature-owned import surface.
 *
 * Key Features:
 * - Provides stable world view imports for the route page during the incremental migration.
 * - Keeps world-specific UI ownership out of the generic component bucket.
 *
 * Notes on Implementation:
 * - Existing world view implementations stay in place temporarily and are surfaced through this feature layer.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added the World feature view barrel exports for the layered refactor.
 */

export { default as WorldChat } from './world-chat';
export { default as WorldDashboard } from './world-dashboard';
export { default as WorldChatHistory } from './world-chat-history';
export { default as AgentEdit } from './agent-edit';
export { default as WorldEdit } from './world-edit';
export {
  getAgentStripCssVars,
  getAgentStripStyleAttribute,
  getInitialViewportMode,
  getViewportMode,
  resolveRightPanelViewportMode,
} from './viewport';