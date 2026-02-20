/**
 * Main Header Bar Component
 * Purpose:
 * - Render the top header row for world/session context, agent badges, and settings access.
 *
 * Key Features:
 * - Sidebar restore button when the left sidebar is collapsed.
 * - World/session title display.
 * - Agent badge strip with counts and quick edit/create actions.
 * - Settings panel toggle button with active-state styling.
 *
 * Implementation Notes:
 * - Receives all state and actions from `App.jsx` orchestration.
 * - Preserves existing drag/no-drag region behavior for Electron title area.
 *
 * Recent Changes:
 * - 2026-02-20: Added refresh button next to the settings gear to reload world agents.
 * - 2026-02-17: Extracted from `App.jsx` as part of Phase 4 component decomposition.
 */

export default function MainHeaderBar({
  leftSidebarCollapsed,
  setLeftSidebarCollapsed,
  selectedWorld,
  selectedSession,
  visibleWorldAgents,
  hiddenWorldAgentCount,
  onOpenEditAgentPanel,
  onOpenCreateAgentPanel,
  onOpenSettingsPanel,
  onRefreshWorld,
  panelMode,
  panelOpen,
  dragRegionStyle,
  noDragRegionStyle,
}) {
  return (
    <header
      className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b border-border pb-3 pt-2 ${leftSidebarCollapsed ? 'pl-24 pr-5' : 'px-5'
        }`}
      style={dragRegionStyle}
    >
      <div className="flex min-w-0 items-center gap-3">
        {leftSidebarCollapsed ? (
          <button
            type="button"
            onClick={() => setLeftSidebarCollapsed(false)}
            className="flex h-6 w-6 self-start items-center justify-center rounded-md bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            title="Show sidebar"
            aria-label="Show sidebar"
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
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </button>
        ) : null}
        <div>
          <div className="text-sm font-semibold text-foreground">
            {selectedWorld ? selectedWorld.name : 'No world selected'}
          </div>
          <div className="text-xs text-muted-foreground">
            {selectedSession ? `${selectedSession.name}` : 'Select a session to start chatting'}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center" style={noDragRegionStyle}>
        {selectedWorld ? (
          <div className="inline-flex items-center gap-2 rounded-md bg-card/70 px-2 py-1">
            {visibleWorldAgents.map((agent, index) => (
              <button
                key={`${agent.id}-${index}`}
                type="button"
                onClick={() => onOpenEditAgentPanel(agent.id)}
                className="relative flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80"
                title={`${agent.name} • ${agent.messageCount} message${agent.messageCount === 1 ? '' : 's'}`}
                aria-label={`Edit agent ${agent.name}`}
              >
                {agent.initials}
                <span className="pointer-events-none absolute -top-1 -right-1 min-w-4 rounded-full border border-border/70 bg-card px-1 text-[9px] font-medium leading-4 text-foreground/80">
                  {agent.messageCount}
                </span>
              </button>
            ))}
            {hiddenWorldAgentCount > 0 ? (
              <div
                className="flex h-7 min-w-7 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-medium text-muted-foreground"
                title={`${hiddenWorldAgentCount} more agent${hiddenWorldAgentCount > 1 ? 's' : ''}`}
                aria-label={`${hiddenWorldAgentCount} more agents`}
              >
                +{hiddenWorldAgentCount}
              </div>
            ) : null}
            <button
              type="button"
              onClick={onOpenCreateAgentPanel}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-secondary/80"
              title="Add new agent"
              aria-label="Add new agent"
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
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-2" style={noDragRegionStyle}>
        {selectedWorld ? (
          <button
            type="button"
            onClick={onRefreshWorld}
            className="flex h-7 w-7 items-center justify-center rounded transition-colors text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            title="Refresh world"
            aria-label="Refresh world"
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
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onOpenSettingsPanel}
          className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${panelMode === 'settings' && panelOpen
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          title="Settings"
          aria-label="Settings"
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
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
}