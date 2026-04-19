/**
 * World Sidebar Section
 * Purpose:
 * - Render the world-selection and world-action section inside the left sidebar.
 *
 * Key Features:
 * - World list dropdown with outside-click close behavior.
 * - Create/import/export world actions.
 * - Renders caller-provided world detail content below the selector.
 *
 * Implementation Notes:
 * - The shell supplies the world detail content so transitional shell-owned cards stay auditable.
 *
 * Recent Changes:
 * - 2026-04-19: Extracted world sidebar ownership out of `LeftSidebarPanel`.
 */

import { useEffect, useRef, useState } from 'react';
import { MenuItem } from '../../../design-system/primitives';

export default function WorldSidebarSection({
  availableWorlds,
  loadedWorld,
  onOpenCreateWorldPanel,
  onOpenImportWorldPanel,
  onExportWorld,
  onSelectWorld,
  noDragRegionStyle,
  worldDetailsContent,
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
    <>
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
              onClick={onOpenImportWorldPanel}
              className="rounded p-1 text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
              title="Import"
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
            data-testid="world-selector"
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
                  <MenuItem
                    key={world.id}
                    onClick={() => {
                      setWorkspaceMenuOpen(false);
                      onSelectWorld(world.id);
                    }}
                    selected={loadedWorld?.id === world.id}
                    className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[selected=true]:bg-sidebar-accent data-[selected=true]:text-sidebar-accent-foreground"
                    title={world.id}
                    data-testid={`world-item-${world.id}`}
                  >
                    <span className="truncate">{world.name}</span>
                  </MenuItem>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
      {worldDetailsContent}
    </>
  );
}
