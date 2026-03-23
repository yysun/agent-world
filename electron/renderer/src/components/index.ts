/**
 * Renderer Components Compatibility Barrel
 *
 * Purpose:
 * - Provide a temporary import surface for renderer UI that has not yet moved into an explicit app-shell or feature boundary.
 *
 * Key Features:
 * - Exposes only unmigrated component-owned UI.
 * - Excludes design-system primitives, app-shell composition, and migrated feature-owned UI.
 *
 * Implementation Notes:
 * - New business-specific renderer UI should prefer `app/shell` or `features/<domain>` instead of this barrel.
 * - This file exists to keep the remaining migration incremental and should shrink over time.
 *
 * Recent Changes:
 * - 2026-03-23: Reframed the barrel as a transitional compatibility surface after moving shell and feature exports to explicit boundaries.
 * - 2026-03-23: Narrowed the exports to unmigrated component-owned UI only.
 * - 2026-02-10: Initial implementation with streaming indicators.
 */

export { default as ToolExecutionStatus } from './ToolExecutionStatus';
export { default as WorldInfoCard } from './WorldInfoCard';
export { default as AgentFormFields } from './AgentFormFields';
export { default as PromptEditorModal } from './PromptEditorModal';
export { default as WorldConfigEditorModal } from './WorldConfigEditorModal';
export { default as RightPanelContent } from './RightPanelContent';
export { default as WorkingStatusBar } from './WorkingStatusBar';
export { default as EditorModalsHost } from './EditorModalsHost';
