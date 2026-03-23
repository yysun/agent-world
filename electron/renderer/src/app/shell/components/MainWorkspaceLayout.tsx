/**
 * Main Workspace Layout Component
 * Purpose:
 * - Compose the primary `<main>` workspace region (header, content area, status bar).
 *
 * Key Features:
 * - Renders `MainHeaderBar` at the top of the workspace.
 * - Renders `MainContentArea` as the central layout body with an optional status bar slot.
 * - Accepts optional `editorContent` node that replaces `MainContentArea` when provided.
 *
 * Implementation Notes:
 * - Uses grouped prop objects to keep `App.jsx` orchestration compact.
 * - Preserves existing render order and styling classes.
 *
 * Recent Changes:
 * - 2026-03-23: Restored the collapsed-sidebar toggle in full-area editor mode by rendering the same floating control used by the normal header.
 * - 2026-03-22: Hide the world/chat header while full-area editor content is active so the skill editor occupies the full workspace column.
 * - 2026-03-08: Added `editorContent` prop to support full-area editor views (e.g. SkillEditor).
 * - 2026-03-05: Added `queuePanel` slot routing into `MainContentArea` so queue and status can be positioned independently around composer.
 * - 2026-02-28: Routed status bar through `MainContentArea` to keep status alignment tied to composer column layout.
 * - 2026-02-22: Replaced StatusActivityBar slot with generic statusBar ReactNode for WorkingStatusBar.
 * - 2026-02-17: Added for Phase 5 final integration cleanup.
 */

import React from 'react';
import MainHeaderBar from './MainHeaderBar';
import MainContentArea from './MainContentArea';
import SidebarToggleButton from './SidebarToggleButton';

export default function MainWorkspaceLayout({
  mainHeaderProps,
  mainContentAreaProps,
  queuePanel,
  statusBar,
  editorContent,
}: {
  mainHeaderProps: any;
  mainContentAreaProps: any;
  queuePanel?: React.ReactNode;
  statusBar?: React.ReactNode;
  editorContent?: React.ReactNode;
}) {
  const showCollapsedSidebarToggle = Boolean(editorContent != null && mainHeaderProps?.leftSidebarCollapsed);

  return (
    <main className="relative flex min-w-0 flex-1 flex-col bg-background">
      {editorContent != null ? (
        <>
          {showCollapsedSidebarToggle ? (
            <SidebarToggleButton
              collapsed
              onToggle={mainHeaderProps.setLeftSidebarCollapsed}
              className="absolute left-24 top-2 z-10 flex h-7 w-7 self-start items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              style={mainHeaderProps.noDragRegionStyle}
            />
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {editorContent}
          </div>
        </>
      ) : (
        <>
          <MainHeaderBar {...mainHeaderProps} />
          <MainContentArea {...mainContentAreaProps} queuePanel={queuePanel} statusBar={statusBar} />
        </>
      )}
    </main>
  );
}
