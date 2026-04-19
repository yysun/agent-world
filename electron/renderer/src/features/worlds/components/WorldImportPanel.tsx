/**
 * World Import Panel
 * Purpose:
 * - Render the world/agent import workflow inside the left sidebar import mode.
 *
 * Key Features:
 * - Supports importing full worlds or individual agents.
 * - Preserves local-vs-GitHub source selection and field validation.
 * - Keeps import-specific transient state inside the worlds feature.
 *
 * Implementation Notes:
 * - The shell owns the outer sidebar frame; this feature owns the import workflow body.
 *
 * Recent Changes:
 * - 2026-04-19: Extracted the import workflow out of `LeftSidebarPanel`.
 */

import { useState } from 'react';
import { Input, Radio } from '../../../design-system/primitives';

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
];

const DEFAULT_GITHUB_REPO = 'yysun/awesome-agent-world';

export default function WorldImportPanel({
  loadedWorld,
  onCloseImportWorldPanel,
  onImportWorld,
  onImportAgent,
}) {
  const [importTarget, setImportTarget] = useState('world');
  const [worldImportSourceType, setWorldImportSourceType] = useState('local');
  const [worldGithubRepo, setWorldGithubRepo] = useState(DEFAULT_GITHUB_REPO);
  const [worldGithubName, setWorldGithubName] = useState('');
  const [agentImportSourceType, setAgentImportSourceType] = useState('local');
  const [agentGithubRepo, setAgentGithubRepo] = useState(DEFAULT_GITHUB_REPO);
  const [agentGithubName, setAgentGithubName] = useState('agent-kit');
  const [importingWorld, setImportingWorld] = useState(false);

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

  return (
    <>
      <div className="mb-4 shrink-0 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <div className="uppercase tracking-wide text-sidebar-foreground/70">Import</div>
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
                <Radio
                  name="left-world-import-source-type"
                  value="local"
                  checked={worldImportSourceType === 'local'}
                  onChange={() => setWorldImportSourceType('local')}
                  disabled={importingWorld}
                />
                <span>From local directory</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sidebar-foreground">
                <Radio
                  name="left-world-import-source-type"
                  value="github"
                  checked={worldImportSourceType === 'github'}
                  onChange={() => setWorldImportSourceType('github')}
                  disabled={importingWorld}
                />
                <span>From GitHub</span>
              </label>
            </div>

            {worldImportSourceType === 'github' ? (
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-sidebar-foreground/90">GitHub Repo</label>
                  <Input
                    value={worldGithubRepo}
                    onChange={(event) => setWorldGithubRepo(event.target.value)}
                    placeholder="owner/repo"
                    tone="sidebar"
                    className="bg-sidebar"
                    disabled={importingWorld}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-sidebar-foreground/90">World Name</label>
                  <Input
                    value={worldGithubName}
                    onChange={(event) => setWorldGithubName(event.target.value)}
                    placeholder="infinite-etude"
                    tone="sidebar"
                    className="bg-sidebar"
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
                <Radio
                  name="left-agent-import-source-type"
                  value="local"
                  checked={agentImportSourceType === 'local'}
                  onChange={() => setAgentImportSourceType('local')}
                  disabled={importingWorld}
                />
                <span>From local directory</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sidebar-foreground">
                <Radio
                  name="left-agent-import-source-type"
                  value="github"
                  checked={agentImportSourceType === 'github'}
                  onChange={() => setAgentImportSourceType('github')}
                  disabled={importingWorld}
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
                  <Input
                    value={agentGithubRepo}
                    onChange={(event) => setAgentGithubRepo(event.target.value)}
                    placeholder="owner/repo"
                    tone="sidebar"
                    className="bg-sidebar"
                    disabled={importingWorld}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-sidebar-foreground/90">Agent Name</label>
                  <Input
                    value={agentGithubName}
                    onChange={(event) => setAgentGithubName(event.target.value)}
                    placeholder="agent-kit"
                    tone="sidebar"
                    className="bg-sidebar"
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
        ) : null}
      </div>
    </>
  );
}
