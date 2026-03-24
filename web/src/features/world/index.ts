/**
 * Purpose:
 * - Re-export World feature public modules.
 *
 * Key Features:
 * - Provides stable feature imports for World route composition and update handling.
 *
 * Notes on Implementation:
 * - Use this barrel for route-level World composition during the layered migration.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added the World feature barrel exports.
 */

export {
  AgentEdit,
  WorldChat,
  WorldChatHistory,
  WorldDashboard,
  WorldEdit,
  getAgentStripCssVars,
  getAgentStripStyleAttribute,
  getInitialViewportMode,
  getViewportMode,
  resolveRightPanelViewportMode,
} from './views';
export { worldRouteUiHandlers, worldUpdateHandlers } from './update';