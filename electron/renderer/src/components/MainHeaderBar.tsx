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
 * - 2026-03-15: Added a distinct editing highlight for the header agent currently open in the edit panel.
 * - 2026-03-06: Clicking the session title in the header now copies the chat/session ID to the clipboard.
 * - 2026-03-04: Grid submenu now dismisses on option select and is left-aligned to the Grid icon button.
 * - 2026-03-04: Replaced grid layout dropdown with a submenu anchored under the Grid icon.
 * - 2026-03-04: Replaced grid layout cycle button with dropdown options (`1+2`, `2+1`, `2+2`) while keeping icon view-mode buttons.
 * - 2026-03-04: Replaced world-view dropdown selector with SVG icon buttons and grid-layout cycle button.
 * - 2026-03-04: Added world-view selector controls (Chat/Board/Grid/Canvas) positioned left of Logs and Settings buttons.
 * - 2026-02-27: Replaced the header refresh action with a logs action that opens the right panel in logs mode.
 * - 2026-02-20: Added active-streaming avatar animation state for header agent badges.
 * - 2026-02-20: Highlighted the world main agent in the top header avatar strip.
 * - 2026-02-20: Added refresh button next to the settings gear to reload world agents.
 * - 2026-02-17: Extracted from `App.jsx` as part of Phase 4 component decomposition.
 */

import { useState } from 'react';

function normalizeMainAgentValue(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function isMainWorldAgent(agent: { id?: unknown; name?: unknown }, selectedWorld: { mainAgent?: unknown } | null | undefined): boolean {
  const normalizedMainAgent = normalizeMainAgentValue(selectedWorld?.mainAgent);
  if (!normalizedMainAgent) return false;

  const normalizedAgentId = normalizeMainAgentValue(agent?.id);
  const normalizedAgentName = normalizeMainAgentValue(agent?.name);
  return normalizedMainAgent === normalizedAgentId || normalizedMainAgent === normalizedAgentName;
}

function isEditingWorldAgent(agent: { id?: unknown }, editingAgentId: unknown): boolean {
  const normalizedEditingAgentId = normalizeMainAgentValue(editingAgentId);
  if (!normalizedEditingAgentId) return false;
  return normalizeMainAgentValue(agent?.id) === normalizedEditingAgentId;
}

export function getAgentBadgeClassName({
  isEditingAgent,
  isMainAgent,
  isActiveStreamingAgent,
}: {
  isEditingAgent: boolean;
  isMainAgent: boolean;
  isActiveStreamingAgent: boolean;
}): string {
  const toneClassName = isEditingAgent
    ? 'bg-sky-200 text-sky-900 ring-2 ring-sky-400 hover:bg-sky-300'
    : isMainAgent
      ? 'bg-amber-200 text-amber-900 ring-2 ring-amber-400 hover:bg-amber-300'
      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80';
  return `relative flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold transition-colors ${toneClassName} ${isActiveStreamingAgent ? 'header-agent-active' : ''}`.trim();
}

export function getAgentBadgeTitle({
  agentName,
  messageCount,
  isMainAgent,
  isEditingAgent,
  isActiveStreamingAgent,
}: {
  agentName: string;
  messageCount: number;
  isMainAgent: boolean;
  isEditingAgent: boolean;
  isActiveStreamingAgent: boolean;
}): string {
  return `${agentName} • ${messageCount} message${messageCount === 1 ? '' : 's'}${isMainAgent ? ' • Main agent' : ''}${isEditingAgent ? ' • Editing' : ''}${isActiveStreamingAgent ? ' • Responding' : ''}`;
}

export function getAgentBadgeAriaLabel({
  agentName,
  isMainAgent,
  isEditingAgent,
  isActiveStreamingAgent,
}: {
  agentName: string;
  isMainAgent: boolean;
  isEditingAgent: boolean;
  isActiveStreamingAgent: boolean;
}): string {
  return `Edit agent ${agentName}${isMainAgent ? ' (main agent)' : ''}${isEditingAgent ? ' (editing)' : ''}${isActiveStreamingAgent ? ' (responding)' : ''}`;
}

export default function MainHeaderBar({
  leftSidebarCollapsed,
  setLeftSidebarCollapsed,
  selectedWorld,
  selectedSession,
  visibleWorldAgents,
  hiddenWorldAgentCount,
  activeHeaderAgentIds,
  editingAgentId,
  onOpenEditAgentPanel,
  onOpenCreateAgentPanel,
  onOpenSettingsPanel,
  onOpenLogsPanel,
  worldViewMode,
  worldGridLayoutChoiceId,
  isGridLayoutSubmenuOpen,
  onWorldViewModeChange,
  onWorldGridLayoutChoiceChange,
  onToggleGridLayoutSubmenu,
  panelMode,
  panelOpen,
  dragRegionStyle,
  noDragRegionStyle,
}) {
  const normalizedWorldViewMode = String(worldViewMode || 'chat').trim().toLowerCase();
  const [sessionIdCopied, setSessionIdCopied] = useState(false);

  function handleCopySessionId() {
    if (!selectedSession?.id) return;
    navigator.clipboard.writeText(selectedSession.id).then(() => {
      setSessionIdCopied(true);
      setTimeout(() => setSessionIdCopied(false), 1500);
    });
  }

  const iconButtonClassName = (active: boolean) => `flex h-7 w-7 items-center justify-center rounded transition-colors ${active
    ? 'bg-primary text-primary-foreground'
    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
    }`;
  const activeHeaderAgentIdSet = new Set(
    (Array.isArray(activeHeaderAgentIds) ? activeHeaderAgentIds : [])
      .map((id) => normalizeMainAgentValue(id))
      .filter(Boolean),
  );

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
          <div
            className={`text-xs ${selectedSession ? 'cursor-pointer hover:text-foreground' : ''} ${sessionIdCopied ? 'text-green-500' : 'text-muted-foreground'}`}
            onClick={selectedSession ? handleCopySessionId : undefined}
            title={selectedSession ? (sessionIdCopied ? 'Copied!' : `Click to copy chat ID: ${selectedSession.id}`) : undefined}
            style={selectedSession ? noDragRegionStyle : undefined}
          >
            {sessionIdCopied ? 'ID copied!' : (selectedSession ? `${selectedSession.name}` : 'Select a session to start chatting')}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center" style={noDragRegionStyle}>
        {selectedWorld ? (
          <div className="inline-flex items-center gap-2 rounded-md bg-card/70 px-2 py-1">
            {visibleWorldAgents.map((agent, index) => {
              const isMainAgent = isMainWorldAgent(agent, selectedWorld);
              const isEditingAgent = isEditingWorldAgent(agent, editingAgentId);
              const isActiveStreamingAgent = activeHeaderAgentIdSet.has(normalizeMainAgentValue(agent?.id));
              return (
                <button
                  key={`${agent.id}-${index}`}
                  type="button"
                  onClick={() => onOpenEditAgentPanel(agent.id)}
                  className={getAgentBadgeClassName({ isEditingAgent, isMainAgent, isActiveStreamingAgent })}
                  title={getAgentBadgeTitle({
                    agentName: agent.name,
                    messageCount: agent.messageCount,
                    isMainAgent,
                    isEditingAgent,
                    isActiveStreamingAgent,
                  })}
                  aria-label={getAgentBadgeAriaLabel({
                    agentName: agent.name,
                    isMainAgent,
                    isEditingAgent,
                    isActiveStreamingAgent,
                  })}
                >
                  {agent.initials}
                  {isMainAgent ? (
                    <span className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-amber-300 bg-amber-100 px-1 text-[8px] font-semibold leading-3 text-amber-800">
                      MAIN
                    </span>
                  ) : null}
                  <span className="pointer-events-none absolute -top-1 -right-1 min-w-4 rounded-full border border-border/70 bg-card px-1 text-[9px] font-medium leading-4 text-foreground/80">
                    {agent.messageCount}
                  </span>
                </button>
              );
            })}
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
        <div className="relative flex items-center gap-1" role="group" aria-label="World view selector">
          <button
            id="world-view-chat-btn"
            type="button"
            onClick={() => {
              onWorldViewModeChange?.('chat');
              onToggleGridLayoutSubmenu?.(false);
            }}
            className={iconButtonClassName(normalizedWorldViewMode === 'chat')}
            title="Chat View"
            aria-label="Chat View"
            aria-pressed={normalizedWorldViewMode === 'chat'}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button
            id="world-view-board-btn"
            type="button"
            onClick={() => {
              onWorldViewModeChange?.('board');
              onToggleGridLayoutSubmenu?.(false);
            }}
            className={iconButtonClassName(normalizedWorldViewMode === 'board')}
            title="Board View"
            aria-label="Board View"
            aria-pressed={normalizedWorldViewMode === 'board'}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="6" height="16" rx="1" />
              <rect x="10" y="4" width="4" height="16" rx="1" />
              <rect x="15" y="4" width="6" height="16" rx="1" />
            </svg>
          </button>
          <div className="relative">
            <button
              id="world-view-grid-btn"
              type="button"
              onClick={() => {
                if (normalizedWorldViewMode === 'grid') {
                  onToggleGridLayoutSubmenu?.(!isGridLayoutSubmenuOpen);
                  return;
                }
                onWorldViewModeChange?.('grid');
                onToggleGridLayoutSubmenu?.(true);
              }}
              className={iconButtonClassName(normalizedWorldViewMode === 'grid')}
              title="Grid View"
              aria-label="Grid View"
              aria-pressed={normalizedWorldViewMode === 'grid'}
              aria-expanded={normalizedWorldViewMode === 'grid' && Boolean(isGridLayoutSubmenuOpen)}
              aria-controls="grid-layout-submenu"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="8" height="8" rx="1" />
                <rect x="13" y="3" width="8" height="8" rx="1" />
                <rect x="3" y="13" width="8" height="8" rx="1" />
                <rect x="13" y="13" width="8" height="8" rx="1" />
              </svg>
            </button>

            {normalizedWorldViewMode === 'grid' && Boolean(isGridLayoutSubmenuOpen) ? (
              <div
                id="grid-layout-submenu"
                role="menu"
                aria-label="Grid layout options"
                className="absolute left-0 top-8 z-20 flex min-w-[84px] flex-col gap-1 rounded-md border border-border bg-card p-1 shadow-lg"
              >
                <button
                  id="grid-layout-option-1-2"
                  type="button"
                  role="menuitemradio"
                  aria-checked={String(worldGridLayoutChoiceId || '1+2') === '1+2'}
                  onClick={() => {
                    onWorldGridLayoutChoiceChange?.('1+2');
                    onToggleGridLayoutSubmenu?.(false);
                  }}
                  className={`rounded px-2 py-1 text-left text-xs transition-colors ${String(worldGridLayoutChoiceId || '1+2') === '1+2' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent hover:text-accent-foreground'}`}
                >
                  1+2
                </button>
                <button
                  id="grid-layout-option-2-1"
                  type="button"
                  role="menuitemradio"
                  aria-checked={String(worldGridLayoutChoiceId || '1+2') === '2+1'}
                  onClick={() => {
                    onWorldGridLayoutChoiceChange?.('2+1');
                    onToggleGridLayoutSubmenu?.(false);
                  }}
                  className={`rounded px-2 py-1 text-left text-xs transition-colors ${String(worldGridLayoutChoiceId || '1+2') === '2+1' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent hover:text-accent-foreground'}`}
                >
                  2+1
                </button>
                <button
                  id="grid-layout-option-2-2"
                  type="button"
                  role="menuitemradio"
                  aria-checked={String(worldGridLayoutChoiceId || '1+2') === '2+2'}
                  onClick={() => {
                    onWorldGridLayoutChoiceChange?.('2+2');
                    onToggleGridLayoutSubmenu?.(false);
                  }}
                  className={`rounded px-2 py-1 text-left text-xs transition-colors ${String(worldGridLayoutChoiceId || '1+2') === '2+2' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent hover:text-accent-foreground'}`}
                >
                  2+2
                </button>
              </div>
            ) : null}
          </div>
          <button
            id="world-view-canvas-btn"
            type="button"
            onClick={() => {
              onWorldViewModeChange?.('canvas');
              onToggleGridLayoutSubmenu?.(false);
            }}
            className={iconButtonClassName(normalizedWorldViewMode === 'canvas')}
            title="Canvas View"
            aria-label="Canvas View"
            aria-pressed={normalizedWorldViewMode === 'canvas'}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3h18v14H3z" />
              <path d="M8 21h8" />
              <path d="M12 17v4" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenLogsPanel}
          className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${panelMode === 'logs' && panelOpen
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          title="Logs"
          aria-label="Logs"
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
            <path d="M9 6h11" />
            <path d="M9 12h11" />
            <path d="M9 18h11" />
            <path d="M3 6h.01" />
            <path d="M3 12h.01" />
            <path d="M3 18h.01" />
          </svg>
        </button>
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
