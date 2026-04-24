/**
 * Left Sidebar Panel Component
 * Purpose:
 * - Compose the left sidebar shell from world- and chat-owned sections.
 *
 * Key Features:
 * - Provides the shared Electron sidebar frame and top controls.
 * - Routes normal mode to world/session feature sections.
 * - Routes import mode to the worlds feature import workflow.
 *
 * Implementation Notes:
 * - Keeps shell ownership focused on framing while delegating workflows downward.
 *
 * Recent Changes:
 * - 2026-04-19: Extracted world/session/import workflows into feature-owned sidebar sections.
 * - 2026-03-21: Added a single open-sidebar update action that switches between manual check and upgrade states.
 * - 2026-03-14: Redesigned import mode into a multi-form selector with full world, agent, and skill form layouts.
 * - 2026-03-14: Aligned import-mode header spacing with the normal sidebar so `World Import` uses the same section-header placement as `Worlds`.
 * - 2026-03-14: Updated import mode to replace the standard left sidebar content instead of rendering inline within it.
 * - 2026-03-14: Moved the world import form into the left sidebar instead of the right panel.
 * - 2026-03-14: Wired world-card heartbeat status and control props through the left sidebar.
 * - 2026-02-26: Changed import action to open right-panel import form (local directory or GitHub source).
 * - 2026-02-19: Added world export action button alongside create/import controls.
 * - 2026-02-17: Extracted from `App.jsx` as part of Phase 4 component decomposition.
 */

import { SessionSidebarSection } from '../../../features/chat';
import { WorldImportPanel, WorldSidebarSection } from '../../../features/worlds';
import SidebarToggleButton from './SidebarToggleButton';
import { WorldInfoCard } from './transitional';

export default function LeftSidebarPanel({
  leftSidebarCollapsed,
  setLeftSidebarCollapsed,
  dragRegionStyle,
  noDragRegionStyle,
  appUpdateState,
  onCheckForUpdates,
  onInstallUpdateAndRestart,
  availableWorlds,
  loadedWorld,
  panelMode,
  onOpenCreateWorldPanel,
  onOpenImportWorldPanel,
  onCloseImportWorldPanel,
  onImportWorld,
  onImportAgent,
  onExportWorld,
  onSelectWorld,
  loadingWorld,
  worldLoadError,
  worldInfoStats,
  heartbeatJob,
  heartbeatAction,
  refreshingWorldInfo,
  updatingWorld,
  deletingWorld,
  onRefreshWorldInfo,
  onOpenWorldEditPanel,
  onDeleteWorld,
  onStartHeartbeat,
  onStopHeartbeat,
  onCreateSession,
  sessionSearch,
  setSessionSearch,
  sessions,
  filteredSessions,
  selectedSessionId,
  pendingHitlSessionIds,
  onSelectSession,
  deletingSessionId,
  onDeleteSession,
}) {
  const isSidebarOpen = !leftSidebarCollapsed;
  const isUpdateReady = appUpdateState?.status === 'downloaded';
  const isPackagedApp = appUpdateState?.isPackaged === true;
  const shouldShowUpdateAction = isSidebarOpen && (isUpdateReady || isPackagedApp);
  const updateActionLabel = isUpdateReady
    ? 'Upgrade'
    : appUpdateState?.status === 'checking'
      ? 'Checking...'
      : appUpdateState?.status === 'downloading'
        ? 'Downloading...'
        : 'Check';
  const updateActionDisabled = appUpdateState?.status === 'checking' || appUpdateState?.status === 'downloading';

  const updateActionButton = shouldShowUpdateAction ? (
    <button
      type="button"
      onClick={isUpdateReady ? onInstallUpdateAndRestart : onCheckForUpdates}
      disabled={updateActionDisabled}
      className={isUpdateReady
        ? 'rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground transition-colors hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60'
        : 'rounded-xl border border-sidebar-border px-3 py-1 text-xs font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10 disabled:cursor-not-allowed disabled:opacity-60'
      }
      title={isUpdateReady
        ? `Upgrade to ${appUpdateState?.downloadedVersion || 'the latest version'}`
        : 'Check for published desktop updates'
      }
      aria-label={updateActionLabel}
      style={noDragRegionStyle}
      data-testid="sidebar-update-action"
    >
      {updateActionLabel}
    </button>
  ) : null;

  let worldDetailsContent = null;
  if (loadingWorld) {
    worldDetailsContent = (
      <div className="mb-4 shrink-0 rounded-md border border-sidebar-border bg-sidebar-accent p-4 text-xs">
        <div className="flex items-center gap-2 text-sidebar-foreground">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Loading world from folder...</span>
        </div>
      </div>
    );
  } else if (worldLoadError) {
    worldDetailsContent = (
      <div className="mb-4 shrink-0 rounded-md border border-sidebar-border bg-sidebar-accent p-4 text-xs">
        <div className="mb-2 text-sidebar-foreground">
          {worldLoadError}
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={onOpenCreateWorldPanel}
            className="w-full rounded border border-sidebar-border px-2 py-1.5 text-sidebar-foreground hover:border-sidebar-primary hover:bg-sidebar"
          >
            Create a World
          </button>
        </div>
      </div>
    );
  } else if (availableWorlds.length === 0 && !worldLoadError) {
    worldDetailsContent = (
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
    );
  } else if (loadedWorld) {
    worldDetailsContent = (
      <WorldInfoCard
        loadedWorld={loadedWorld}
        worldInfoStats={worldInfoStats}
        heartbeatJob={heartbeatJob}
        heartbeatAction={heartbeatAction}
        refreshingWorldInfo={refreshingWorldInfo}
        updatingWorld={updatingWorld}
        deletingWorld={deletingWorld}
        onRefreshWorldInfo={onRefreshWorldInfo}
        onOpenWorldEditPanel={onOpenWorldEditPanel}
        onDeleteWorld={onDeleteWorld}
        selectedSessionId={selectedSessionId}
        onStartHeartbeat={onStartHeartbeat}
        onStopHeartbeat={onStopHeartbeat}
      />
    );
  } else if (availableWorlds.length > 0) {
    worldDetailsContent = (
      <div className="mb-4 shrink-0 rounded-md border border-dashed border-sidebar-border p-3 text-xs text-sidebar-foreground/70">
        Select a world from the dropdown above
      </div>
    );
  }

  return (
    <aside
      className={`flex min-h-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground overflow-hidden transition-all duration-200 ${leftSidebarCollapsed ? 'w-0 border-r-0 p-0 opacity-0' : 'w-80 px-4 pb-4 pt-2 opacity-100'
        }`}
    >
      <div className="mb-3 flex h-8 shrink-0 items-start justify-end gap-2" style={dragRegionStyle}>
        {updateActionButton}
        <SidebarToggleButton
          collapsed={false}
          onToggle={setLeftSidebarCollapsed}
          className="flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
          style={noDragRegionStyle}
        />
      </div>

      {panelMode === 'import-world' ? (
        <WorldImportPanel
          loadedWorld={loadedWorld}
          onCloseImportWorldPanel={onCloseImportWorldPanel}
          onImportWorld={onImportWorld}
          onImportAgent={onImportAgent}
        />
      ) : (
        <>
          <WorldSidebarSection
            availableWorlds={availableWorlds}
            loadedWorld={loadedWorld}
            onOpenCreateWorldPanel={onOpenCreateWorldPanel}
            onOpenImportWorldPanel={onOpenImportWorldPanel}
            onExportWorld={onExportWorld}
            onSelectWorld={onSelectWorld}
            noDragRegionStyle={noDragRegionStyle}
            worldDetailsContent={worldDetailsContent}
          />
          <SessionSidebarSection
            loadedWorld={loadedWorld}
            onCreateSession={onCreateSession}
            sessionSearch={sessionSearch}
            setSessionSearch={setSessionSearch}
            sessions={sessions}
            filteredSessions={filteredSessions}
            selectedSessionId={selectedSessionId}
            pendingHitlSessionIds={pendingHitlSessionIds}
            onSelectSession={onSelectSession}
            deletingSessionId={deletingSessionId}
            onDeleteSession={onDeleteSession}
          />
        </>
      )}
    </aside>
  );
}
