/**
 * Main Workspace Layout Component
 * Purpose:
 * - Compose the primary `<main>` workspace region (header, content area, status bar).
 *
 * Key Features:
 * - Renders `MainHeaderBar` at the top of the workspace.
 * - Renders `MainContentArea` as the central layout body.
 * - Renders `StatusActivityBar` as the bottom status/activity row.
 *
 * Implementation Notes:
 * - Uses grouped prop objects to keep `App.jsx` orchestration compact.
 * - Preserves existing render order and styling classes.
 *
 * Recent Changes:
 * - 2026-02-17: Added for Phase 5 final integration cleanup.
 */

import MainHeaderBar from './MainHeaderBar';
import MainContentArea from './MainContentArea';
import StatusActivityBar from './StatusActivityBar';

export default function MainWorkspaceLayout({
  mainHeaderProps,
  mainContentAreaProps,
  statusActivityBarProps,
}) {
  return (
    <main className="relative flex min-w-0 flex-1 flex-col bg-background">
      <MainHeaderBar {...mainHeaderProps} />
      <MainContentArea {...mainContentAreaProps} />
      <StatusActivityBar {...statusActivityBarProps} />
    </main>
  );
}