/**
 * Main Workspace Layout Component
 * Purpose:
 * - Compose the primary `<main>` workspace region (header, content area, status bar).
 *
 * Key Features:
 * - Renders `MainHeaderBar` at the top of the workspace.
 * - Renders `MainContentArea` as the central layout body.
 * - Renders an optional status bar node at the bottom.
 *
 * Implementation Notes:
 * - Uses grouped prop objects to keep `App.jsx` orchestration compact.
 * - Preserves existing render order and styling classes.
 *
 * Recent Changes:
 * - 2026-02-22: Replaced StatusActivityBar slot with generic statusBar ReactNode for WorkingStatusBar.
 * - 2026-02-17: Added for Phase 5 final integration cleanup.
 */

import React from 'react';
import MainHeaderBar from './MainHeaderBar';
import MainContentArea from './MainContentArea';

export default function MainWorkspaceLayout({
  mainHeaderProps,
  mainContentAreaProps,
  statusBar,
}: {
  mainHeaderProps: any;
  mainContentAreaProps: any;
  statusBar?: React.ReactNode;
}) {
  return (
    <main className="relative flex min-w-0 flex-1 flex-col bg-background">
      <MainHeaderBar {...mainHeaderProps} />
      <MainContentArea {...mainContentAreaProps} />
      {statusBar}
    </main>
  );
}
