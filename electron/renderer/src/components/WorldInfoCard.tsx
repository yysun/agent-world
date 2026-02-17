/**
 * World Info Card Component
 *
 * Features:
 * - Renders selected world metadata in the left sidebar
 * - Exposes edit/delete world actions with disabled states
 * - Displays stable world metrics (agents, turn limit, messages)
 *
 * Implementation Notes:
 * - Presentational component only; all world actions are delegated via props
 * - Keeps existing sidebar typography and spacing to avoid visual regressions
 *
 * Recent Changes:
 * - 2026-02-14: Moved refresh/edit/delete actions to the header row (outside card) aligned right with World Info label.
 * - 2026-02-14: Extracted from App.jsx to reduce top-level renderer complexity.
 */

import React from 'react';

export default function WorldInfoCard({
  loadedWorld,
  worldInfoStats,
  refreshingWorldInfo,
  updatingWorld,
  deletingWorld,
  onRefreshWorldInfo,
  onOpenWorldEditPanel,
  onDeleteWorld
}) {
  if (!loadedWorld) return null;

  return (
    <div className="mb-4 shrink-0 space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="uppercase tracking-wide text-sidebar-foreground/70">World Info</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefreshWorldInfo}
            disabled={refreshingWorldInfo || updatingWorld || deletingWorld}
            className="rounded p-1 text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground disabled:cursor-not-allowed disabled:opacity-50"
            title="Refresh world info"
            aria-label="Refresh world info"
          >
            <svg
              className={`h-4 w-4 ${refreshingWorldInfo ? 'animate-spin' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onOpenWorldEditPanel}
            disabled={refreshingWorldInfo || updatingWorld || deletingWorld}
            className="rounded p-1 text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground disabled:cursor-not-allowed disabled:opacity-50"
            title="Edit world"
            aria-label="Edit world"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onDeleteWorld}
            disabled={refreshingWorldInfo || deletingWorld || updatingWorld}
            className="rounded p-1 text-sidebar-foreground transition-colors hover:bg-destructive/20 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
            title="Delete world"
            aria-label="Delete world"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="rounded-md border border-sidebar-border bg-sidebar-accent p-3">
        <div className="mb-2">
          <div className="text-sm font-semibold text-sidebar-foreground truncate" title={loadedWorld.name}>
            {loadedWorld.name}
          </div>
        </div>
        {loadedWorld.description ? (
          <div className="mb-2 text-sidebar-foreground/80">
            {loadedWorld.description}
          </div>
        ) : null}
        <div className="space-y-1 text-sidebar-foreground/80">
          <div>
            Agents: {worldInfoStats.totalAgents} | Turn Limit: {worldInfoStats.turnLimit} | Messages: {worldInfoStats.totalMessages}
          </div>
        </div>
      </div>
    </div>
  );
}
