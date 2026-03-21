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

import { useEffect, useRef, useState } from 'react';
import WorldInfoCard from './WorldInfoCard';

const IMPORT_TARGETS = [
  {
    key: 'world',
    title: 'Import World',
    description: 'Bring in a full world with its agents, chats, and settings.',
  },
  {
    key: 'agent',
    title: 'Import Agent',
    description: 'Bring a single agent into the currently loaded world.',
  },
  {
    key: 'skill',
    title: 'Import Skill',
    description: 'Add a reusable skill into the current workspace skill registry.',
  },
];

const DEFAULT_GITHUB_REPO = 'yysun/awesome-agent-world';

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
  onImportSkill,
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
  onSelectSession,
  deletingSessionId,
  onDeleteSession,
}) {
  const workspaceDropdownRef = useRef(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [importTarget, setImportTarget] = useState('world');
  const [worldImportSourceType, setWorldImportSourceType] = useState('local');
  const [worldGithubRepo, setWorldGithubRepo] = useState(DEFAULT_GITHUB_REPO);
  const [worldGithubName, setWorldGithubName] = useState('');
  const [agentImportSourceType, setAgentImportSourceType] = useState('local');
  const [agentGithubRepo, setAgentGithubRepo] = useState(DEFAULT_GITHUB_REPO);
  const [agentGithubName, setAgentGithubName] = useState('agent-kit');
  const [skillImportSourceType, setSkillImportSourceType] = useState('local');
  const [skillGithubRepo, setSkillGithubRepo] = useState(DEFAULT_GITHUB_REPO);
  const [skillGithubName, setSkillGithubName] = useState('writing-skill');
  const [importingWorld, setImportingWorld] = useState(false);
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

  useEffect(() => {
    if (panelMode !== 'import-world') return;
    setImportTarget('world');
    setWorldImportSourceType('local');
    setWorldGithubRepo(DEFAULT_GITHUB_REPO);
    setWorldGithubName('');
    setAgentImportSourceType('local');
    setAgentGithubRepo(DEFAULT_GITHUB_REPO);
    setAgentGithubName('agent-kit');
    setSkillImportSourceType('local');
    setSkillGithubRepo(DEFAULT_GITHUB_REPO);
    setSkillGithubName('writing-skill');
    setImportingWorld(false);
  }, [panelMode]);

  const onImportFromLocal = async () => {
    if (importingWorld) return;

    setImportingWorld(true);
    try {
      const success = await onImportWorld();
      if (success) {
        onCloseImportWorldPanel();
      }
    } finally {
      setImportingWorld(false);
    }
  };

  const onImportFromGithub = async () => {
    if (importingWorld) return;
    const repo = String(worldGithubRepo || '').trim();
    const itemName = String(worldGithubName || '').trim();
    if (!repo || !itemName) return;

    setImportingWorld(true);
    try {
      const success = await onImportWorld({ repo, itemName });
      if (success) {
        onCloseImportWorldPanel();
      }
    } finally {
      setImportingWorld(false);
    }
  };

  const onImportAgentFromLocal = async () => {
    if (importingWorld || typeof onImportAgent !== 'function') return;

    setImportingWorld(true);
    try {
      const success = await onImportAgent();
      if (success) {
        onCloseImportWorldPanel();
      }
    } finally {
      setImportingWorld(false);
    }
  };

  const onImportAgentFromGithub = async () => {
    if (importingWorld || typeof onImportAgent !== 'function') return;
    const repo = String(agentGithubRepo || '').trim();
    const itemName = String(agentGithubName || '').trim();
    if (!repo || !itemName) return;

    setImportingWorld(true);
    try {
      const success = await onImportAgent({ repo, itemName });
      if (success) {
        onCloseImportWorldPanel();
      }
    } finally {
      setImportingWorld(false);
    }
  };

  const onImportSkillFromLocal = async () => {
    if (importingWorld || typeof onImportSkill !== 'function') return;

    setImportingWorld(true);
    try {
      const success = await onImportSkill();
      if (success) {
        onCloseImportWorldPanel();
      }
    } finally {
      setImportingWorld(false);
    }
  };

  const onImportSkillFromGithub = async () => {
    if (importingWorld || typeof onImportSkill !== 'function') return;
    const repo = String(skillGithubRepo || '').trim();
    const itemName = String(skillGithubName || '').trim();
    if (!repo || !itemName) return;

    setImportingWorld(true);
    try {
      const success = await onImportSkill({ repo, itemName });
      if (success) {
        onCloseImportWorldPanel();
      }
    } finally {
      setImportingWorld(false);
    }
  };

  if (panelMode === 'import-world') {
    return (
      <aside
        className={`flex min-h-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground overflow-hidden transition-all duration-200 ${leftSidebarCollapsed ? 'w-0 border-r-0 p-0 opacity-0' : 'w-80 px-4 pb-4 pt-2 opacity-100'
          }`}
      >
        <div className="mb-3 flex h-8 shrink-0 items-start justify-end gap-2" style={dragRegionStyle}>
          {updateActionButton}
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
            <div className="uppercase tracking-wide text-sidebar-foreground/70">Import</div>
            <div className="flex items-center gap-1" style={noDragRegionStyle}>
              <button
                type="button"
                onClick={onCloseImportWorldPanel}
                className="rounded p-1 text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                title="Close import"
                aria-label="Close import"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div
          className="flex min-h-0 flex-1 flex-col rounded-md border border-sidebar-border bg-sidebar-accent p-3 text-xs"
          data-testid="left-sidebar-import-panel"
        >
          <p className="mb-3 text-sidebar-foreground/70">
            Choose what to import, then set the source details in the form below.
          </p>

          <div className="grid gap-2" data-testid="import-target-list">
            {IMPORT_TARGETS.map((target) => {
              const selected = importTarget === target.key;
              return (
                <button
                  key={target.key}
                  type="button"
                  onClick={() => setImportTarget(target.key)}
                  className={`rounded-md border px-3 py-2 text-left transition-colors ${selected
                    ? 'border-sidebar-primary bg-sidebar text-sidebar-foreground shadow-sm'
                    : 'border-sidebar-border bg-sidebar text-sidebar-foreground hover:border-sidebar-primary/50 hover:bg-sidebar'
                    }`}
                  aria-pressed={selected}
                  data-testid={`import-target-${target.key}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-sidebar-foreground">{target.title}</div>
                      <div className="mt-1 text-[11px] leading-4 text-sidebar-foreground/70">{target.description}</div>
                    </div>
                    <div className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${selected ? 'bg-sidebar-primary' : 'bg-sidebar-border'}`} />
                  </div>
                </button>
              );
            })}
          </div>

          {importTarget === 'world' ? (
            <div className="mt-3 rounded-md border border-sidebar-border bg-sidebar px-3 py-3" data-testid="left-sidebar-import-world-panel">
              <div className="mb-1 text-xs font-semibold text-sidebar-foreground">World source</div>
              <p className="mb-3 text-[11px] leading-4 text-sidebar-foreground/65">
                Import a complete world package, including agents, chats, and world configuration.
              </p>
              <div className="space-y-2 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2">
                <label className="flex cursor-pointer items-center gap-2 text-sidebar-foreground">
                  <input
                    type="radio"
                    name="left-world-import-source-type"
                    value="local"
                    checked={worldImportSourceType === 'local'}
                    onChange={() => setWorldImportSourceType('local')}
                    disabled={importingWorld}
                    className="accent-primary"
                  />
                  <span>From local directory</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sidebar-foreground">
                  <input
                    type="radio"
                    name="left-world-import-source-type"
                    value="github"
                    checked={worldImportSourceType === 'github'}
                    onChange={() => setWorldImportSourceType('github')}
                    disabled={importingWorld}
                    className="accent-primary"
                  />
                  <span>From GitHub</span>
                </label>
              </div>

              {worldImportSourceType === 'github' ? (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-sidebar-foreground/90">GitHub Repo</label>
                    <input
                      value={worldGithubRepo}
                      onChange={(event) => setWorldGithubRepo(event.target.value)}
                      placeholder="owner/repo"
                      className="w-full rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                      disabled={importingWorld}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-sidebar-foreground/90">World Name</label>
                    <input
                      value={worldGithubName}
                      onChange={(event) => setWorldGithubName(event.target.value)}
                      placeholder="infinite-etude"
                      className="w-full rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                      disabled={importingWorld}
                    />
                  </div>
                  <span className="text-[10px] text-sidebar-foreground/60">
                    Example: repo yysun/awesome-agent-world, world infinite-etude
                  </span>
                  <button
                    type="button"
                    onClick={onImportFromGithub}
                    disabled={importingWorld || !String(worldGithubRepo || '').trim() || !String(worldGithubName || '').trim()}
                    className="mt-1 w-fit rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {importingWorld ? 'Importing...' : 'Import World'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onImportFromLocal}
                  disabled={importingWorld}
                  className="mt-3 w-fit rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importingWorld ? 'Importing...' : 'Open local world folder'}
                </button>
              )}
            </div>
          ) : importTarget === 'agent' ? (
            <div className="mt-3 rounded-md border border-sidebar-border bg-sidebar px-3 py-3" data-testid="left-sidebar-import-agent-panel">
              <div className="mb-1 text-xs font-semibold text-sidebar-foreground">Agent source</div>
              <p className="mb-3 text-[11px] leading-4 text-sidebar-foreground/65">
                Import one agent profile into the selected world without replacing the rest of its data.
              </p>
              <div className="space-y-2 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2">
                <label className="flex cursor-pointer items-center gap-2 text-sidebar-foreground">
                  <input
                    type="radio"
                    name="left-agent-import-source-type"
                    value="local"
                    checked={agentImportSourceType === 'local'}
                    onChange={() => setAgentImportSourceType('local')}
                    disabled={importingWorld}
                    className="accent-primary"
                  />
                  <span>From local directory</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sidebar-foreground">
                  <input
                    type="radio"
                    name="left-agent-import-source-type"
                    value="github"
                    checked={agentImportSourceType === 'github'}
                    onChange={() => setAgentImportSourceType('github')}
                    disabled={importingWorld}
                    className="accent-primary"
                  />
                  <span>From GitHub</span>
                </label>
              </div>

              <div className="mt-3 rounded-md border border-dashed border-sidebar-border bg-sidebar-accent/70 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-sidebar-foreground/55">Destination World</div>
                <div className="mt-1 text-[11px] leading-4 text-sidebar-foreground/80">{loadedWorld?.name || 'No world selected'}</div>
              </div>

              {agentImportSourceType === 'github' ? (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-sidebar-foreground/90">GitHub Repo</label>
                    <input
                      value={agentGithubRepo}
                      onChange={(event) => setAgentGithubRepo(event.target.value)}
                      placeholder="owner/repo"
                      className="w-full rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                      disabled={importingWorld}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-sidebar-foreground/90">Agent Name</label>
                    <input
                      value={agentGithubName}
                      onChange={(event) => setAgentGithubName(event.target.value)}
                      placeholder="agent-kit"
                      className="w-full rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                      disabled={importingWorld}
                    />
                  </div>
                  <span className="text-[10px] text-sidebar-foreground/60">Example: repo yysun/awesome-agent-world, agent agent-kit</span>
                  <button
                    type="button"
                    onClick={onImportAgentFromGithub}
                    disabled={importingWorld || !loadedWorld || typeof onImportAgent !== 'function' || !String(agentGithubRepo || '').trim() || !String(agentGithubName || '').trim()}
                    className="mt-1 w-fit rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {importingWorld ? 'Importing...' : 'Import Agent'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onImportAgentFromLocal}
                  disabled={importingWorld || !loadedWorld || typeof onImportAgent !== 'function'}
                  className="mt-3 w-fit rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importingWorld ? 'Importing...' : 'Open local agent folder'}
                </button>
              )}
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-sidebar-border bg-sidebar px-3 py-3" data-testid="left-sidebar-import-skill-panel">
              <div className="mb-1 text-xs font-semibold text-sidebar-foreground">Skill source</div>
              <p className="mb-3 text-[11px] leading-4 text-sidebar-foreground/65">
                Import a reusable skill package into the workspace skill registry used by this desktop app.
              </p>
              <div className="space-y-2 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2">
                <label className="flex cursor-pointer items-center gap-2 text-sidebar-foreground">
                  <input
                    type="radio"
                    name="left-skill-import-source-type"
                    value="local"
                    checked={skillImportSourceType === 'local'}
                    onChange={() => setSkillImportSourceType('local')}
                    disabled={importingWorld}
                    className="accent-primary"
                  />
                  <span>From local directory</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sidebar-foreground">
                  <input
                    type="radio"
                    name="left-skill-import-source-type"
                    value="github"
                    checked={skillImportSourceType === 'github'}
                    onChange={() => setSkillImportSourceType('github')}
                    disabled={importingWorld}
                    className="accent-primary"
                  />
                  <span>From GitHub</span>
                </label>
              </div>

              <div className="mt-3 rounded-md border border-dashed border-sidebar-border bg-sidebar-accent/70 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-sidebar-foreground/55">Destination Scope</div>
                <div className="mt-1 text-[11px] leading-4 text-sidebar-foreground/80">Current workspace</div>
              </div>

              {skillImportSourceType === 'github' ? (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-sidebar-foreground/90">GitHub Repo</label>
                    <input
                      value={skillGithubRepo}
                      onChange={(event) => setSkillGithubRepo(event.target.value)}
                      placeholder="owner/repo"
                      className="w-full rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                      disabled={importingWorld}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-sidebar-foreground/90">Skill Name</label>
                    <input
                      value={skillGithubName}
                      onChange={(event) => setSkillGithubName(event.target.value)}
                      placeholder="writing-skill"
                      className="w-full rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                      disabled={importingWorld}
                    />
                  </div>
                  <span className="text-[10px] text-sidebar-foreground/60">Example: repo yysun/awesome-agent-world, skill writing-skill</span>
                  <button
                    type="button"
                    onClick={onImportSkillFromGithub}
                    disabled={importingWorld || typeof onImportSkill !== 'function' || !String(skillGithubRepo || '').trim() || !String(skillGithubName || '').trim()}
                    className="mt-1 w-fit rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {importingWorld ? 'Importing...' : 'Import Skill'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onImportSkillFromLocal}
                  disabled={importingWorld || typeof onImportSkill !== 'function'}
                  className="mt-3 w-fit rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importingWorld ? 'Importing...' : 'Open local skill folder'}
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`flex min-h-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground overflow-hidden transition-all duration-200 ${leftSidebarCollapsed ? 'w-0 border-r-0 p-0 opacity-0' : 'w-80 px-4 pb-4 pt-2 opacity-100'
        }`}
    >
      <div className="mb-3 flex h-8 shrink-0 items-start justify-end gap-2" style={dragRegionStyle}>
        {updateActionButton}
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
                    data-testid={`world-item-${world.id}`}
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

      <div className="flex-1 min-h-0 space-y-1 overflow-auto pr-1" data-testid="session-list">
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
              data-testid={`session-item-${session.id}`}
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
