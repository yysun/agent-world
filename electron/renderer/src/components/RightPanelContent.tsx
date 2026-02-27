/**
 * Right Panel Content Component
 * Purpose:
 * - Render the right-side panel body for settings, world, and agent forms.
 *
 * Key Features:
 * - Settings panel with theme/storage/skill toggles.
 * - World edit/create forms.
 * - Agent create/edit forms.
 *
 * Implementation Notes:
 * - Keeps behavior parity with previous inline `App.jsx` conditional rendering.
 * - Receives all mutation handlers and state via props from App orchestration.
 *
 * Recent Changes:
 * - 2026-02-27: Added `Show tool messages` settings toggle above skill options to control tool-card visibility in the main transcript area.
 * - 2026-02-27: Adjusted logs autoscroll to only stick when already near bottom so manual scrolling stays usable during live streaming.
 * - 2026-02-27: Logs panel now streams in chronological order and auto-scrolls to latest entry while open.
 * - 2026-02-27: Added `logs` panel mode UI with unified main/renderer runtime logs and clear-list control.
 * - 2026-02-26: Simplified import-world actions by removing bottom footer buttons and adding inline source-specific import buttons.
 * - 2026-02-26: Added `import-world` panel mode with a single import form supporting local-directory and GitHub shorthand sources.
 * - 2026-02-17: Extracted from `App.jsx` as part of Phase 4 component extraction.
 */

import { useEffect, useRef, useState } from 'react';
import AgentFormFields from './AgentFormFields';
import SettingsSwitch from './SettingsSwitch';
import SettingsSkillSwitch from './SettingsSkillSwitch';
import {
  AGENT_PROVIDER_OPTIONS,
  MIN_TURN_LIMIT,
  WORLD_PROVIDER_OPTIONS,
} from '../constants/app-constants';

function formatLogTimestamp(value: unknown): string {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return rawValue;
  }
  return parsed.toLocaleTimeString();
}

function stringifyLogData(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getProcessBadgeStyle(process: string) {
  const accentColor = process === 'renderer'
    ? 'var(--color-chart-2)'
    : 'var(--color-chart-1)';

  return {
    color: 'var(--color-sidebar-foreground)',
    backgroundColor: `color-mix(in oklab, ${accentColor} 16%, var(--color-sidebar-accent))`,
    borderColor: `color-mix(in oklab, ${accentColor} 42%, var(--color-sidebar-border))`,
  };
}

function getLevelBadgeStyle(level: string) {
  let accentColor = 'var(--color-chart-2)';
  if (level === 'error') accentColor = 'var(--color-destructive)';
  if (level === 'warn') accentColor = 'var(--color-chart-3)';
  if (level === 'debug' || level === 'trace') accentColor = 'var(--color-chart-5)';

  return {
    color: 'var(--color-sidebar-foreground)',
    backgroundColor: `color-mix(in oklab, ${accentColor} 16%, var(--color-sidebar-accent))`,
    borderColor: `color-mix(in oklab, ${accentColor} 42%, var(--color-sidebar-border))`,
  };
}

function isNearBottom(container: HTMLDivElement, threshold = 24) {
  const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
  return remaining <= threshold;
}

export default function RightPanelContent({
  panelMode,
  loadedWorld,
  selectedAgentForPanel,
  themePreference,
  setThemePreference,
  systemSettings,
  setSystemSettings,
  workspace,
  api,
  globalSkillEntries,
  disabledGlobalSkillIdSet,
  toggleSkillEnabled,
  projectSkillEntries,
  disabledProjectSkillIdSet,
  onCancelSettings,
  savingSystemSettings,
  onSaveSettings,
  settingsNeedRestart,
  onUpdateWorld,
  editingWorld,
  setEditingWorld,
  updatingWorld,
  deletingWorld,
  setWorldConfigEditorField,
  setWorldConfigEditorValue,
  setWorldConfigEditorTarget,
  setWorldConfigEditorOpen,
  onDeleteWorld,
  closePanel,
  onCreateAgent,
  creatingAgent,
  setCreatingAgent,
  setPromptEditorValue,
  setPromptEditorTarget,
  setPromptEditorOpen,
  savingAgent,
  onUpdateAgent,
  editingAgent,
  setEditingAgent,
  deletingAgent,
  onDeleteAgent,
  onCreateWorld,
  creatingWorld,
  setCreatingWorld,
  onImportWorld,
  panelLogs,
  onClearPanelLogs,
}) {
  const [importSourceType, setImportSourceType] = useState('local');
  const [githubImportSource, setGithubImportSource] = useState('@awesome-agent-world/');
  const [importingWorld, setImportingWorld] = useState(false);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldStickLogsToBottomRef = useRef(true);

  useEffect(() => {
    if (panelMode !== 'import-world') return;
    setImportSourceType('local');
    setGithubImportSource('@awesome-agent-world/');
    setImportingWorld(false);
  }, [panelMode]);

  useEffect(() => {
    if (panelMode !== 'logs') return;
    shouldStickLogsToBottomRef.current = true;
  }, [panelMode]);

  useEffect(() => {
    if (panelMode !== 'logs') return;
    const container = logsContainerRef.current;
    if (!container) return;
    if (!shouldStickLogsToBottomRef.current) return;
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'auto',
      });
    });
  }, [panelLogs, panelMode]);

  const onLogsContainerScroll = () => {
    const container = logsContainerRef.current;
    if (!container) return;
    shouldStickLogsToBottomRef.current = isNearBottom(container);
  };

  const onImportFromLocal = async () => {
    if (importingWorld) return;

    setImportingWorld(true);
    try {
      const success = await onImportWorld();
      if (success) {
        closePanel();
      }
    } finally {
      setImportingWorld(false);
    }
  };

  const onImportFromGithub = async () => {
    if (importingWorld) return;
    const source = String(githubImportSource || '').trim();
    if (!source) return;

    setImportingWorld(true);
    try {
      const success = await onImportWorld(source);
      if (success) {
        closePanel();
      }
    } finally {
      setImportingWorld(false);
    }
  };

  return (
    <div className="min-h-0 flex flex-1 flex-col overflow-y-auto">
      {panelMode === 'logs' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2">
            <div className="text-xs text-sidebar-foreground/80">
              {Array.isArray(panelLogs) && panelLogs.length > 0 ? `${panelLogs.length} entries` : 'No log entries yet'}
            </div>
            <button
              type="button"
              onClick={onClearPanelLogs}
              disabled={!Array.isArray(panelLogs) || panelLogs.length === 0}
              className="rounded border border-sidebar-border px-2 py-0.5 text-[11px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-foreground/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear
            </button>
          </div>
          <div
            ref={logsContainerRef}
            onScroll={onLogsContainerScroll}
            className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
          >
            {Array.isArray(panelLogs) && panelLogs.length > 0 ? (
              panelLogs.map((entry) => {
                const process = String(entry?.process || '').trim().toLowerCase() === 'renderer' ? 'renderer' : 'main';
                const level = String(entry?.level || 'info').trim().toLowerCase() || 'info';
                const category = String(entry?.category || 'runtime').trim() || 'runtime';
                const message = String(entry?.message || '').trim() || '(empty log message)';
                const timestamp = formatLogTimestamp(entry?.timestamp);
                const dataText = stringifyLogData(entry?.data);

                return (
                  <article key={String(entry?.id || `${timestamp}-${category}-${message}`)} className="space-y-2 rounded-md border border-sidebar-border bg-sidebar-accent/80 p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className="rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={getProcessBadgeStyle(process)}
                      >
                        {process}
                      </span>
                      <span
                        className="rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={getLevelBadgeStyle(level)}
                      >
                        {level}
                      </span>
                      <span className="text-[10px] text-sidebar-foreground/60">{timestamp}</span>
                    </div>
                    <div className="text-[11px] font-semibold text-sidebar-foreground/70">{category}</div>
                    <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-sidebar-foreground">{message}</pre>
                    {dataText ? (
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-sidebar-border/70 bg-sidebar px-2 py-1 font-mono text-[10px] text-sidebar-foreground/80">
                        {dataText}
                      </pre>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <div className="rounded-md border border-dashed border-sidebar-border bg-sidebar-accent/30 px-3 py-4 text-xs text-sidebar-foreground/60">
                Logs from both Electron processes will appear here.
              </div>
            )}
          </div>
        </div>
      ) : panelMode === 'settings' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-sidebar-foreground/90">Theme</label>
              <div className="inline-flex items-center rounded-md border border-sidebar-border bg-sidebar-accent p-0.5">
                {['system', 'light', 'dark'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setThemePreference(mode)}
                    className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${themePreference === mode
                      ? 'bg-primary text-primary-foreground'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground'
                      }`}
                    title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} theme`}
                  >
                    {mode === 'system' ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                      </svg>
                    ) : mode === 'light' ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                        <circle cx="12" cy="12" r="4" />
                        <line x1="12" y1="2" x2="12" y2="4" />
                        <line x1="12" y1="20" x2="12" y2="22" />
                        <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
                        <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
                        <line x1="2" y1="12" x2="4" y2="12" />
                        <line x1="20" y1="12" x2="22" y2="12" />
                        <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
                        <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-sidebar-border pt-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-sidebar-foreground/90">Storage Type</label>
                  <div className="flex gap-3">
                    {['file', 'sqlite'].map((type) => (
                      <label key={type} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="storageType"
                          value={type}
                          checked={(systemSettings.storageType || 'sqlite') === type}
                          onChange={() => setSystemSettings((settings) => ({ ...settings, storageType: type }))}
                          className="accent-primary"
                        />
                        <span className="text-xs text-sidebar-foreground">{type === 'file' ? 'File' : 'SQLite'}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {(systemSettings.storageType || 'sqlite') === 'file' ? (
                  <div className="mt-4 flex flex-col gap-1">
                    <label className="text-xs font-bold text-sidebar-foreground/90">Data File Path</label>
                    <div className="flex gap-1">
                      <input
                        value={systemSettings.dataPath}
                        onChange={(event) => setSystemSettings((settings) => ({ ...settings, dataPath: event.target.value }))}
                        placeholder={workspace.workspacePath || 'Select folder...'}
                        className="min-w-0 flex-1 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/40 focus:border-sidebar-ring"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const result = typeof api.pickDirectory === 'function'
                            ? await api.pickDirectory()
                            : await api.openWorkspace();
                          const directoryPath = result?.directoryPath ?? result?.workspacePath;
                          if (!result.canceled && directoryPath) {
                            setSystemSettings((settings) => ({ ...settings, dataPath: String(directoryPath) }));
                          }
                        }}
                        className="flex h-auto shrink-0 items-center justify-center rounded-md border border-sidebar-border px-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        title="Browse folder..."
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                      </button>
                    </div>
                    <span className="text-[10px] text-sidebar-foreground/50">AGENT_WORLD_DATA_PATH</span>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col gap-1">
                    <label className="text-xs font-bold text-sidebar-foreground/90">Database File</label>
                    <div className="flex gap-1">
                      <input
                        value={systemSettings.sqliteDatabase}
                        onChange={(event) => setSystemSettings((settings) => ({ ...settings, sqliteDatabase: event.target.value }))}
                        placeholder={workspace.workspacePath ? `${workspace.workspacePath}/database.db` : 'Select file...'}
                        className="min-w-0 flex-1 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/40 focus:border-sidebar-ring"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const result = await api.pickFile();
                          if (!result.canceled && result.filePath) {
                            setSystemSettings((settings) => ({ ...settings, sqliteDatabase: String(result.filePath) }));
                          }
                        }}
                        className="flex h-auto shrink-0 items-center justify-center rounded-md border border-sidebar-border px-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        title="Browse file..."
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      </button>
                    </div>
                    <span className="text-[10px] text-sidebar-foreground/50">AGENT_WORLD_SQLITE_DATABASE</span>
                  </div>
                )}

                <div className="mt-2 border-t border-sidebar-border pt-2">
                  <SettingsSwitch
                    label="Show tool messages"
                    checked={systemSettings.showToolMessages !== false}
                    onClick={() => setSystemSettings((settings) => ({ ...settings, showToolMessages: settings.showToolMessages === false }))}
                  />
                  <SettingsSwitch
                    label="Enable Global Skills"
                    checked={systemSettings.enableGlobalSkills !== false}
                    onClick={() => setSystemSettings((settings) => ({ ...settings, enableGlobalSkills: settings.enableGlobalSkills === false }))}
                  />
                  <div className="ml-1 space-y-0.5">
                    {globalSkillEntries.length > 0 ? (
                      globalSkillEntries.map((entry) => (
                        <SettingsSkillSwitch
                          key={`global-${entry.skillId}`}
                          label={entry.skillId}
                          checked={!disabledGlobalSkillIdSet.has(entry.skillId)}
                          onClick={() => toggleSkillEnabled('global', entry.skillId)}
                          disabled={systemSettings.enableGlobalSkills === false}
                        />
                      ))
                    ) : (
                      <p className="px-1 py-1 text-[11px] text-sidebar-foreground/50">No global skills discovered.</p>
                    )}
                  </div>

                  <SettingsSwitch
                    label="Enable Project Skills"
                    checked={systemSettings.enableProjectSkills !== false}
                    onClick={() => setSystemSettings((settings) => ({ ...settings, enableProjectSkills: settings.enableProjectSkills === false }))}
                  />
                  <div className="ml-1 space-y-0.5">
                    {projectSkillEntries.length > 0 ? (
                      projectSkillEntries.map((entry) => (
                        <SettingsSkillSwitch
                          key={`project-${entry.skillId}`}
                          label={entry.skillId}
                          checked={!disabledProjectSkillIdSet.has(entry.skillId)}
                          onClick={() => toggleSkillEnabled('project', entry.skillId)}
                          disabled={systemSettings.enableProjectSkills === false}
                        />
                      ))
                    ) : (
                      <p className="px-1 py-1 text-[11px] text-sidebar-foreground/50">No project skills discovered.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto flex justify-end gap-2 border-t border-sidebar-border bg-sidebar pt-2">
            <button
              type="button"
              onClick={onCancelSettings}
              disabled={savingSystemSettings}
              className="rounded-xl border border-sidebar-border px-3 py-1 text-xs text-sidebar-foreground hover:bg-sidebar-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSaveSettings}
              disabled={savingSystemSettings}
              className="rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingSystemSettings ? 'Saving...' : (settingsNeedRestart ? 'Save & Restart' : 'Save')}
            </button>
          </div>
        </div>
      ) : panelMode === 'import-world' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            <p className="text-xs text-sidebar-foreground/70">
              Choose import source type, then import into the current workspace.
            </p>

            <div className="space-y-2 rounded-md border border-sidebar-border bg-sidebar-accent p-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-sidebar-foreground">
                <input
                  type="radio"
                  name="import-source-type"
                  value="local"
                  checked={importSourceType === 'local'}
                  onChange={() => setImportSourceType('local')}
                  disabled={importingWorld}
                  className="accent-primary"
                />
                <span>From local directory</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-sidebar-foreground">
                <input
                  type="radio"
                  name="import-source-type"
                  value="github"
                  checked={importSourceType === 'github'}
                  onChange={() => setImportSourceType('github')}
                  disabled={importingWorld}
                  className="accent-primary"
                />
                <span>From GitHub shorthand</span>
              </label>
            </div>

            {importSourceType === 'github' ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-sidebar-foreground/90">GitHub Source</label>
                <input
                  value={githubImportSource}
                  onChange={(event) => setGithubImportSource(event.target.value)}
                  placeholder="@awesome-agent-world/infinite-etude"
                  className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                  disabled={importingWorld}
                />
                <span className="text-[10px] text-sidebar-foreground/60">
                  Example: @awesome-agent-world/infinite-etude
                </span>
                <button
                  type="button"
                  onClick={onImportFromGithub}
                  disabled={importingWorld || !String(githubImportSource || '').trim()}
                  className="mt-2 w-fit rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importingWorld ? 'Importing...' : 'Import from GitHub'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onImportFromLocal}
                disabled={importingWorld}
                className="w-fit rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {importingWorld ? 'Importing...' : 'Open local world folder'}
              </button>
            )}
          </div>
        </div>
      ) : panelMode === 'edit-world' && loadedWorld ? (
        <>
          <form onSubmit={onUpdateWorld} className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-sidebar-foreground/90">World Name</label>
                <div className="rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-xs text-sidebar-foreground/80">
                  {editingWorld.name}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-sidebar-foreground/90">Description</label>
                <textarea
                  value={editingWorld.description}
                  onChange={(event) => setEditingWorld((value) => ({ ...value, description: event.target.value }))}
                  placeholder="Description (optional)"
                  className="h-20 w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                  disabled={updatingWorld || deletingWorld}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-sidebar-foreground/90">LLM Provider</label>
                  <select
                    value={editingWorld.chatLLMProvider}
                    onChange={(event) => setEditingWorld((value) => ({ ...value, chatLLMProvider: event.target.value }))}
                    className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none focus:border-sidebar-ring"
                    disabled={updatingWorld || deletingWorld}
                  >
                    <option value="">Select provider</option>
                    {WORLD_PROVIDER_OPTIONS.map((provider) => (
                      <option key={provider.value} value={provider.value}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-sidebar-foreground/90">LLM model</label>
                  <input
                    value={editingWorld.chatLLMModel}
                    onChange={(event) => setEditingWorld((value) => ({ ...value, chatLLMModel: event.target.value }))}
                    placeholder="Chat LLM model"
                    className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                    disabled={updatingWorld || deletingWorld}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-sidebar-foreground/90">Turn Limit</label>
                <input
                  type="number"
                  min={MIN_TURN_LIMIT}
                  max="50"
                  value={editingWorld.turnLimit}
                  onChange={(event) => setEditingWorld((value) => ({ ...value, turnLimit: Number(event.target.value) || MIN_TURN_LIMIT }))}
                  className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                  disabled={updatingWorld || deletingWorld}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-sidebar-foreground/90">Main Agent</label>
                <input
                  value={editingWorld.mainAgent}
                  onChange={(event) => setEditingWorld((value) => ({ ...value, mainAgent: event.target.value }))}
                  placeholder="Main agent (optional)"
                  className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                  disabled={updatingWorld || deletingWorld}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground">
                <span>Variables (.env): {String(editingWorld.variables || '').trim() ? 'Configured' : 'Not configured'}</span>
                <button
                  type="button"
                  onClick={() => {
                    setWorldConfigEditorField('variables');
                    setWorldConfigEditorValue(editingWorld.variables || '');
                    setWorldConfigEditorTarget('edit');
                    setWorldConfigEditorOpen(true);
                  }}
                  className="rounded p-1 text-sidebar-foreground/50 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                  title="Expand variables editor"
                  disabled={updatingWorld || deletingWorld}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center justify-between rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground">
                <span>MCP Config: {String(editingWorld.mcpConfig || '').trim() ? 'Configured' : 'Not configured'}</span>
                <button
                  type="button"
                  onClick={() => {
                    setWorldConfigEditorField('mcpConfig');
                    setWorldConfigEditorValue(editingWorld.mcpConfig || '');
                    setWorldConfigEditorTarget('edit');
                    setWorldConfigEditorOpen(true);
                  }}
                  className="rounded p-1 text-sidebar-foreground/50 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                  title="Expand MCP editor"
                  disabled={updatingWorld || deletingWorld}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="mt-auto flex justify-between gap-2 border-t border-sidebar-border bg-sidebar pt-2">
              <button
                type="button"
                onClick={onDeleteWorld}
                disabled={deletingWorld || updatingWorld}
                className="rounded-xl border border-destructive/40 px-3 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closePanel}
                  disabled={updatingWorld || deletingWorld}
                  className="rounded-xl border border-sidebar-border px-3 py-1 text-xs text-sidebar-foreground hover:bg-sidebar-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingWorld || deletingWorld}
                  className="rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Save
                </button>
              </div>
            </div>
          </form>
        </>
      ) : panelMode === 'create-agent' && loadedWorld ? (
        <>
          <form onSubmit={onCreateAgent} className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <AgentFormFields
                agent={creatingAgent}
                setAgent={setCreatingAgent}
                disabled={savingAgent}
                providerOptions={AGENT_PROVIDER_OPTIONS}
                onExpandPrompt={() => {
                  setPromptEditorValue(creatingAgent.systemPrompt);
                  setPromptEditorTarget('create');
                  setPromptEditorOpen(true);
                }}
              />
            </div>
            <div className="mt-auto flex justify-between gap-2 border-t border-sidebar-border bg-sidebar pt-2">
              <div></div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closePanel}
                  disabled={savingAgent}
                  className="rounded-xl border border-sidebar-border px-3 py-1 text-xs text-sidebar-foreground hover:bg-sidebar-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAgent}
                  className="rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingAgent ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </form>
        </>
      ) : panelMode === 'edit-agent' && loadedWorld && selectedAgentForPanel ? (
        <>
          <form onSubmit={onUpdateAgent} className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <AgentFormFields
                agent={editingAgent}
                setAgent={setEditingAgent}
                disabled={savingAgent || deletingAgent}
                providerOptions={AGENT_PROVIDER_OPTIONS}
                onExpandPrompt={() => {
                  setPromptEditorValue(editingAgent.systemPrompt);
                  setPromptEditorTarget('edit');
                  setPromptEditorOpen(true);
                }}
              />
            </div>
            <div className="mt-auto flex justify-between gap-2 border-t border-sidebar-border bg-sidebar pt-2">
              <button
                type="button"
                onClick={onDeleteAgent}
                disabled={savingAgent || deletingAgent}
                className="rounded-xl border border-destructive/40 px-3 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closePanel}
                  disabled={savingAgent || deletingAgent}
                  className="rounded-xl border border-sidebar-border px-3 py-1 text-xs text-sidebar-foreground hover:bg-sidebar-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAgent || deletingAgent}
                  className="rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingAgent ? 'Saving...' : deletingAgent ? 'Deleting...' : 'Save'}
                </button>
              </div>
            </div>
          </form>
        </>
      ) : (
        <>
          <form onSubmit={onCreateWorld} className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-sidebar-foreground/90">World Name</label>
                <input
                  value={creatingWorld.name}
                  onChange={(event) => setCreatingWorld((value) => ({ ...value, name: event.target.value }))}
                  placeholder="World name"
                  className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-sidebar-foreground/90">Description</label>
                <textarea
                  value={creatingWorld.description}
                  onChange={(event) => setCreatingWorld((value) => ({ ...value, description: event.target.value }))}
                  placeholder="Description (optional)"
                  className="h-20 w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-sidebar-foreground/90">LLM Provider</label>
                  <select
                    value={creatingWorld.chatLLMProvider}
                    onChange={(event) => setCreatingWorld((value) => ({ ...value, chatLLMProvider: event.target.value }))}
                    className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none focus:border-sidebar-ring"
                  >
                    <option value="">Select provider</option>
                    {WORLD_PROVIDER_OPTIONS.map((provider) => (
                      <option key={provider.value} value={provider.value}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-sidebar-foreground/90">LLM model</label>
                  <input
                    value={creatingWorld.chatLLMModel}
                    onChange={(event) => setCreatingWorld((value) => ({ ...value, chatLLMModel: event.target.value }))}
                    placeholder="Chat LLM model"
                    className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-sidebar-foreground/90">Turn Limit</label>
                <input
                  type="number"
                  min={MIN_TURN_LIMIT}
                  max="50"
                  value={creatingWorld.turnLimit}
                  onChange={(event) => setCreatingWorld((value) => ({ ...value, turnLimit: Number(event.target.value) || MIN_TURN_LIMIT }))}
                  className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-sidebar-foreground/90">Main Agent</label>
                <input
                  value={creatingWorld.mainAgent}
                  onChange={(event) => setCreatingWorld((value) => ({ ...value, mainAgent: event.target.value }))}
                  placeholder="Main agent (optional)"
                  className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                />
              </div>
            </div>
            <div className="mt-auto flex justify-between gap-2 border-t border-sidebar-border bg-sidebar pt-2">
              <div></div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closePanel}
                  className="rounded-xl border border-sidebar-border px-3 py-1 text-xs text-sidebar-foreground hover:bg-sidebar-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
                >
                  Create
                </button>
              </div>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
