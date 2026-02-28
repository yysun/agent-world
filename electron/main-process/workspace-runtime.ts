/**
 * Electron Workspace Runtime State
 *
 * Features:
 * - Tracks active and initialized workspace runtime paths.
 * - Ensures workspace/core runtime readiness before handler execution.
 * - Initializes startup workspace from CLI argument or persisted preference.
 *
 * Implementation Notes:
 * - Keeps mutable workspace state isolated from IPC route handlers.
 * - Uses queued async subscription cleanup on workspace switch.
 * - Keeps active core workspace state stable while cleanup runs.
 *
 * Recent Changes:
 * - 2026-02-26: Added optional categorized logger dependency and removed direct console error logging from core-runtime readiness queue handling.
 * - 2026-02-13: Made core readiness transition serialized/awaitable so workspace switches fully reset subscriptions before new runtime work continues.
 * - 2026-02-12: Replaced fire-and-forget reset state clobber with queued async cleanup to avoid workspace switch races.
 * - 2026-02-12: Extracted workspace/core runtime state management from `electron/main.ts`.
 */

interface WorkspaceState {
  workspacePath: string | null;
  storagePath: string | null;
  coreInitialized: boolean;
}

interface CreateWorkspaceRuntimeDependencies {
  configureWorkspaceStorage: (workspacePath: string) => void;
  configureProvidersFromEnv: () => void;
  workspaceFromCommandLine: () => string | null;
  readWorkspacePreference: () => string | null;
  writeWorkspacePreference: (workspacePath: string) => void;
  getDefaultWorkspacePath: () => string;
  resetRuntimeSubscriptions: () => Promise<void>;
  loggerWorkspace?: {
    error: (message: string, data?: unknown) => void;
  };
}

export interface WorkspaceRuntime {
  ensureCoreReady: () => Promise<void>;
  setWorkspace: (workspacePath: string, persist: boolean) => void;
  getWorkspaceState: () => WorkspaceState;
  initializeWorkspace: () => void;
}

export function createWorkspaceRuntime(dependencies: CreateWorkspaceRuntimeDependencies): WorkspaceRuntime {
  const {
    configureWorkspaceStorage,
    configureProvidersFromEnv,
    workspaceFromCommandLine,
    readWorkspacePreference,
    writeWorkspacePreference,
    getDefaultWorkspacePath,
    resetRuntimeSubscriptions,
    loggerWorkspace
  } = dependencies;

  let activeWorkspacePath: string | null = null;
  let coreWorkspacePath: string | null = null;
  let ensureQueue: Promise<void> = Promise.resolve();

  function ensureWorkspaceSelected() {
    if (!activeWorkspacePath) {
      throw new Error('No workspace selected. Click "Open Folder" first.');
    }
  }

  function ensureCoreReady(): Promise<void> {
    ensureWorkspaceSelected();
    const run = ensureQueue.then(async () => {
      const targetWorkspacePath = activeWorkspacePath;
      if (!targetWorkspacePath) throw new Error('No workspace path available');

      if (!coreWorkspacePath) {
        configureWorkspaceStorage(targetWorkspacePath);
        configureProvidersFromEnv();
        coreWorkspacePath = targetWorkspacePath;
        return;
      }

      if (coreWorkspacePath === targetWorkspacePath) {
        return;
      }

      await resetRuntimeSubscriptions();

      const latestWorkspacePath = activeWorkspacePath;
      if (!latestWorkspacePath) throw new Error('No workspace path available');
      configureWorkspaceStorage(latestWorkspacePath);
      configureProvidersFromEnv();
      coreWorkspacePath = latestWorkspacePath;
    });

    ensureQueue = run.catch((error) => {
      loggerWorkspace?.error('Failed to ensure core runtime', {
        error: error instanceof Error ? error.message : String(error)
      });
    });
    return run;
  }

  function setWorkspace(workspacePath: string, persist: boolean) {
    activeWorkspacePath = workspacePath;
    if (persist) {
      writeWorkspacePreference(workspacePath);
    }
  }

  function getWorkspaceState(): WorkspaceState {
    return {
      workspacePath: activeWorkspacePath,
      storagePath: activeWorkspacePath,
      coreInitialized: !!coreWorkspacePath
    };
  }

  function initializeWorkspace() {
    const startupWorkspace = workspaceFromCommandLine() || readWorkspacePreference();
    if (startupWorkspace) {
      setWorkspace(startupWorkspace, false);
      return;
    }
    setWorkspace(getDefaultWorkspacePath(), false);
  }

  return {
    ensureCoreReady,
    setWorkspace,
    getWorkspaceState,
    initializeWorkspace
  };
}
