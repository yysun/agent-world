/**
 * App Shell Components Barrel
 *
 * Purpose:
 * - Expose renderer app-shell components that orchestrate the desktop workspace frame.
 *
 * Key Features:
 * - Groups shell/layout components separately from feature and design-system code.
 * - Provides a stable import surface for the desktop app root and shell-focused tests.
 *
 * Implementation Notes:
 * - These components are app-owned composition surfaces, not reusable design-system UI.
 *
 * Recent Changes:
 * - 2026-03-23: Added the initial app-shell component barrel.
 */

export { default as LeftSidebarPanel } from './LeftSidebarPanel';
export { default as MainContentArea } from './MainContentArea';
export { default as MainHeaderBar } from './MainHeaderBar';
export { default as MainWorkspaceLayout } from './MainWorkspaceLayout';
export { default as RightPanelContent } from './RightPanelContent';
export { default as RightPanelShell } from './RightPanelShell';
export { default as SidebarToggleButton } from './SidebarToggleButton';
export { WorkingStatusBar } from './transitional';
