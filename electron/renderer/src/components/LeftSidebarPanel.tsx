/**
 * Left Sidebar Panel Component
 * Purpose:
 * - Render the left sidebar shell for worlds, world info, and chat sessions.
 *
 * Key Features:
 * - World list dropdown with outside-click close behavior.
 * - World info/loading/error/empty states.
 * - Session search, selection, creation, and deletion actions.
 *
 * Implementation Notes:
 * - Keeps dropdown/menu state local to this component.
 * - Receives all domain state/actions from `App.jsx` orchestration.
 *
 * Recent Changes:
 * - 2026-02-19: Added world export action button alongside create/import controls.
 * - 2026-02-17: Extracted from `App.jsx` as part of Phase 4 component decomposition.
 */

import { useEffect, useRef, useState } from 'react';
import WorldInfoCard from './WorldInfoCard';

export default function LeftSidebarPanel({
  leftSidebarCollapsed,
  setLeftSidebarCollapsed,
  dragRegionStyle,
  noDragRegionStyle,
  availableWorlds,
  loadedWorld,
  onOpenCreateWorldPanel,
  onImportWorld,
  onExportWorld,
  onSelectWorld,
  loadingWorld,
  worldLoadError,
  worldInfoStats,
  refreshingWorldInfo,
  updatingWorld,
  deletingWorld,
  onRefreshWorldInfo,
  onOpenWorldEditPanel,
  onDeleteWorld,
  onCreateSession,
  sessionSearch,
  setSessionSearch,
  sessions,
  filteredSessions,
  selectedSessionId,
  onSelectSession,
  deletingSessionId,
  onDeleteSession,
}) {
  const workspaceDropdownRef = useRef(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);

  useEffect(() => {
    if (!workspaceMenuOpen) return undefined;

    const onDocumentPointerDown = (event) => {
      const target = event.target;
      if (workspaceDropdownRef.current && target instanceof Node && !workspaceDropdownRef.current.contains(target)) {
        setWorkspaceMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', onDocumentPointerDown);
    return () => document.removeEventListener('pointerdown', onDocumentPointerDown);
  }, [workspaceMenuOpen]);

  return (
    <aside
      className={`flex min-h-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground overflow-hidden transition-all duration-200 ${leftSidebarCollapsed ? 'w-0 border-r-0 p-0 opacity-0' : 'w-80 px-4 pb-4 pt-2 opacity-100'
        }`}
    >
      <div className="mb-3 flex h-8 shrink-0 items-start justify-end gap-2" style={dragRegionStyle}>
        <button
          type="button"
          onClick={() => setLeftSidebarCollapsed(true)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          style={noDragRegionStyle}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <polyline points="15 6 9 12 15 18" />
          </svg>
        </button>
      </div>

      <div className="mb-4 shrink-0 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <div className="uppercase tracking-wide text-sidebar-foreground/70">
            Worlds {availableWorlds.length > 0 ? `(${availableWorlds.length})` : ''}
          </div>
          <div className="flex items-center gap-1" style={noDragRegionStyle}>
            <button
              type="button"
              onClick={onOpenCreateWorldPanel}
              className="rounded p-1 text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
              title="Create new world"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onImportWorld}
              className="rounded p-1 text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
              title="Import world from folder"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onExportWorld}
              disabled={!loadedWorld}
              className="rounded p-1 text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground disabled:cursor-not-allowed disabled:opacity-50"
              title={!loadedWorld ? 'Load a world before export' : 'Export world'}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className="relative" ref={workspaceDropdownRef} style={noDragRegionStyle}>
          <button
            type="button"
            onClick={() => setWorkspaceMenuOpen((value) => !value)}
            className="flex w-full items-center justify-between rounded-md border border-sidebar-border bg-sidebar px-2 py-2 text-left text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <span className="truncate">
              {loadedWorld?.name || (availableWorlds.length > 0 ? 'Select a world' : 'No worlds available')}
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`ml-2 h-4 w-4 shrink-0 transition-transform ${workspaceMenuOpen ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {workspaceMenuOpen ? (
            <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-auto rounded-md border border-sidebar-border bg-sidebar p-1 shadow-lg">
              {availableWorlds.length === 0 ? (
                <div className="px-2 py-1.5 text-sidebar-foreground/70">No worlds available</div>
              ) : (
                availableWorlds.map((world) => (
                  <button
                    key={world.id}
                    type="button"
                    onClick={() => {
                      setWorkspaceMenuOpen(false);
                      onSelectWorld(world.id);
                    }}
                    className={`flex w-full items-center rounded px-2 py-1.5 text-left text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${loadedWorld?.id === world.id ? 'bg-sidebar-accent' : ''
                      }`}
                    title={world.id}
                  >
                    <span className="truncate">{world.name}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>

      {loadingWorld ? (
        <div className="mb-4 shrink-0 rounded-md border border-sidebar-border bg-sidebar-accent p-4 text-xs">
          <div className="flex items-center gap-2 text-sidebar-foreground">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Loading world from folder...</span>
          </div>
        </div>
      ) : worldLoadError ? (
        <div className="mb-4 shrink-0 rounded-md border border-sidebar-border bg-sidebar-accent p-4 text-xs">
          <div className="mb-2 text-sidebar-foreground">
            {worldLoadError}
          </div>
          <div className="space-y-2">
            <button
              type="button"
              onClick={onOpenCreateWorldPanel}
              className="w-full rounded border border-sidebar-border px-2 py-1.5 text-sidebar-foreground hover:bg-sidebar hover:border-sidebar-primary"
            >
              Create a World
            </button>
          </div>
        </div>
      ) : availableWorlds.length === 0 && !worldLoadError ? (
        <div className="mb-4 shrink-0 rounded-md border border-sidebar-border bg-sidebar-accent p-4 text-xs">
          <div className="mb-2 font-medium text-sidebar-foreground">
            No worlds available
          </div>
          <div className="mb-2 text-sidebar-foreground/70">
            Create your first world or import an existing one
          </div>
          <div className="text-[10px] text-sidebar-foreground/60">
            Tip: Use the + button above to create a new world
          </div>
        </div>
      ) : loadedWorld ? (
        <WorldInfoCard
          loadedWorld={loadedWorld}
          worldInfoStats={worldInfoStats}
          refreshingWorldInfo={refreshingWorldInfo}
          updatingWorld={updatingWorld}
          deletingWorld={deletingWorld}
          onRefreshWorldInfo={onRefreshWorldInfo}
          onOpenWorldEditPanel={onOpenWorldEditPanel}
          onDeleteWorld={onDeleteWorld}
        />
      ) : availableWorlds.length > 0 ? (
        <div className="mb-4 shrink-0 rounded-md border border-dashed border-sidebar-border p-3 text-xs text-sidebar-foreground/70">
          Select a world from the dropdown above
        </div>
      ) : null}

      <div className="mb-2 flex shrink-0 items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-sidebar-foreground/70">Chat Sessions</div>
        <button
          type="button"
          onClick={onCreateSession}
          disabled={!loadedWorld}
          className="flex h-7 w-7 items-center justify-center rounded text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground disabled:cursor-not-allowed disabled:opacity-50"
          title={!loadedWorld ? 'Load a world first' : 'Create new session'}
          aria-label={!loadedWorld ? 'Load a world first' : 'Create new session'}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div className="mb-2 shrink-0">
        <input
          type="text"
          value={sessionSearch}
          onChange={(event) => setSessionSearch(event.target.value)}
          placeholder="Search sessions..."
          className="w-full rounded-md border border-sidebar-border bg-sidebar px-2 py-1 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/60 focus:border-sidebar-ring"
          aria-label="Search chat sessions"
        />
      </div>

      <div className="flex-1 min-h-0 space-y-1 overflow-auto pr-1">
        {sessions.length === 0 ? (
          <div className="rounded-md border border-dashed border-sidebar-border p-3 text-xs text-sidebar-foreground/70">
            {loadedWorld ? 'No sessions yet.' : 'No world loaded.'}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="rounded-md border border-dashed border-sidebar-border p-3 text-xs text-sidebar-foreground/70">
            No matching sessions.
          </div>
        ) : (
          filteredSessions.map((session) => (
            <div
              key={session.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectSession(session.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectSession(session.id);
                }
              }}
              className={`group w-full rounded-md pl-2 pr-0 py-1 text-left text-xs ${selectedSessionId === session.id
                ? 'bg-sidebar-session-selected text-sidebar-foreground'
                : 'bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground'
                }`}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="min-w-0 flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${selectedSessionId === session.id
                      ? 'bg-sidebar-foreground/75'
                      : 'bg-sidebar-foreground/35 group-hover:bg-sidebar-foreground/55'
                      }`}
                    aria-hidden="true"
                  />
                  <div className="truncate text-[11px] font-medium leading-[1.05]">{session.name}</div>
                </div>
                <div className="relative h-5 w-7 shrink-0 -mr-1">
                  <span
                    className={`absolute inset-0 inline-flex items-center justify-center rounded-full border border-sidebar-border bg-sidebar-accent px-1.5 text-[10px] font-medium leading-none text-sidebar-foreground/80 transition-opacity ${deletingSessionId === session.id
                      ? 'opacity-0'
                      : 'opacity-100 group-hover:opacity-0 group-focus-within:opacity-0'
                      }`}
                    aria-hidden="true"
                  >
                    {session.messageCount}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => onDeleteSession(session.id, event)}
                    disabled={deletingSessionId === session.id}
                    className={`absolute inset-0 flex items-center justify-center rounded text-sidebar-foreground/70 transition-all hover:bg-destructive/20 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50 ${deletingSessionId === session.id
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                      }`}
                    title="Delete session"
                    aria-label={`Delete session ${session.name}`}
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
