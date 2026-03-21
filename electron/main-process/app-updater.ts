/**
 * Electron App Updater Service
 *
 * Purpose:
 * - Encapsulate desktop release update checks, download lifecycle, and install/restart handoff.
 *
 * Key Features:
 * - Uses `electron-updater` when packaged to check GitHub Releases for updates.
 * - Keeps a renderer-safe in-memory update state with release notes and progress.
 * - Supports stable-by-default updates with persisted prerelease opt-in.
 *
 * Implementation Notes:
 * - Service is dependency-injected for deterministic unit tests.
 * - Dev/source Electron runs degrade gracefully with an `unsupported` state instead of throwing.
 * - Startup checks auto-download updates; install remains an explicit user action.
 *
 * Recent Changes:
 * - 2026-03-21: Removed the temporary dev preview mode so update UI appears only for real packaged-release updates.
 * - 2026-03-21: Added Phase 4 updater state management for check/download/install and prerelease policy.
 */

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error'
  | 'unsupported';

export interface AppUpdateState {
  currentVersion: string;
  allowPrereleaseUpdates: boolean;
  isPackaged: boolean;
  status: AppUpdateStatus;
  statusMessage: string;
  availableVersion: string | null;
  downloadedVersion: string | null;
  releaseName: string | null;
  releaseDate: string | null;
  releaseNotes: string;
  lastCheckedAt: string | null;
  downloadProgressPercent: number | null;
  errorMessage: string | null;
}

export interface AppUpdaterSettings {
  allowPrereleaseUpdates?: boolean;
}

interface UpdateInfoLike {
  version?: string;
  releaseName?: string;
  releaseDate?: string | Date;
  releaseNotes?: unknown;
}

interface DownloadProgressLike {
  percent?: number;
}

interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  fullChangelog?: boolean;
  on: (eventName: string, listener: (...args: any[]) => void) => void;
  checkForUpdates: () => Promise<unknown>;
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
}

interface LoggerLike {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

const NOOP_LOGGER: LoggerLike = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export interface AppUpdaterService {
  initialize: () => Promise<AppUpdateState>;
  getState: () => AppUpdateState;
  checkForUpdates: (options?: { source?: 'manual' | 'startup' }) => Promise<AppUpdateState>;
  installUpdateAndRestart: () => Promise<{ accepted: boolean; reason?: string }>;
  applySettings: (settings: AppUpdaterSettings) => AppUpdateState;
  subscribe: (listener: (state: AppUpdateState) => void) => () => void;
}

interface CreateAppUpdaterServiceDependencies {
  currentVersion: string;
  isPackaged: boolean;
  loadSettings: () => AppUpdaterSettings;
  createAutoUpdater?: () => Promise<AutoUpdaterLike>;
  logger?: LoggerLike;
}

function normalizeReleaseNotes(releaseNotes: unknown): string {
  if (typeof releaseNotes === 'string') {
    return releaseNotes.trim();
  }

  if (Array.isArray(releaseNotes)) {
    return releaseNotes
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim();
        }
        if (entry && typeof entry === 'object') {
          const note = typeof (entry as any).note === 'string' ? (entry as any).note.trim() : '';
          const version = typeof (entry as any).version === 'string' ? String((entry as any).version).trim() : '';
          if (version && note) {
            return `Version ${version}\n${note}`;
          }
          return note;
        }
        return '';
      })
      .filter((value) => value.length > 0)
      .join('\n\n');
  }

  return '';
}

function normalizeReleaseDate(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }

  return null;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function toProgressPercent(progress: DownloadProgressLike | null | undefined): number | null {
  const numeric = Number(progress?.percent);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.max(0, Math.min(100, numeric));
}

function createBaseState(currentVersion: string, isPackaged: boolean, allowPrereleaseUpdates: boolean): AppUpdateState {
  return {
    currentVersion,
    allowPrereleaseUpdates,
    isPackaged,
    status: isPackaged ? 'idle' : 'unsupported',
    statusMessage: isPackaged
      ? 'Ready to check for updates.'
      : 'App updates are only available in packaged desktop releases.',
    availableVersion: null,
    downloadedVersion: null,
    releaseName: null,
    releaseDate: null,
    releaseNotes: '',
    lastCheckedAt: null,
    downloadProgressPercent: null,
    errorMessage: null,
  };
}

async function defaultCreateAutoUpdater(): Promise<AutoUpdaterLike> {
  const updaterModule = await import('electron-updater');
  const autoUpdater = (updaterModule as any).autoUpdater;
  if (!autoUpdater) {
    throw new Error('electron-updater autoUpdater is unavailable.');
  }
  return autoUpdater as AutoUpdaterLike;
}

export function createAppUpdaterService(
  dependencies: CreateAppUpdaterServiceDependencies,
): AppUpdaterService {
  const {
    currentVersion,
    isPackaged,
    loadSettings,
    createAutoUpdater = defaultCreateAutoUpdater,
    logger = NOOP_LOGGER,
  } = dependencies;

  const listeners = new Set<(state: AppUpdateState) => void>();
  const initialSettings = loadSettings();
  let state = createBaseState(currentVersion, isPackaged, initialSettings.allowPrereleaseUpdates === true);
  let updater: AutoUpdaterLike | null = null;
  let isInitialized = false;
  let activeCheckPromise: Promise<AppUpdateState> | null = null;

  function notify(): void {
    for (const listener of listeners) {
      listener(state);
    }
  }

  function setState(partial: Partial<AppUpdateState>): AppUpdateState {
    state = {
      ...state,
      ...partial,
    };
    notify();
    return state;
  }

  function applyUpdaterSettings(settings: AppUpdaterSettings): AppUpdateState {
    const allowPrereleaseUpdates = settings.allowPrereleaseUpdates === true;
    if (updater) {
      updater.allowPrerelease = allowPrereleaseUpdates;
    }

    return setState({
      allowPrereleaseUpdates,
    });
  }

  function assignUpdateInfo(updateInfo: UpdateInfoLike | null | undefined): Partial<AppUpdateState> {
    return {
      availableVersion: typeof updateInfo?.version === 'string' ? updateInfo.version.trim() || null : null,
      releaseName: typeof updateInfo?.releaseName === 'string' ? updateInfo.releaseName.trim() || null : null,
      releaseDate: normalizeReleaseDate(updateInfo?.releaseDate),
      releaseNotes: normalizeReleaseNotes(updateInfo?.releaseNotes),
    };
  }

  function registerUpdaterEvents(targetUpdater: AutoUpdaterLike): void {
    targetUpdater.on('checking-for-update', () => {
      logger.info('Checking for app updates');
      setState({
        status: 'checking',
        statusMessage: 'Checking for updates...',
        errorMessage: null,
        downloadProgressPercent: null,
      });
    });

    targetUpdater.on('update-available', (updateInfo: UpdateInfoLike) => {
      logger.info('App update available', {
        version: updateInfo?.version,
      });
      setState({
        ...assignUpdateInfo(updateInfo),
        status: 'available',
        statusMessage: `Update ${String(updateInfo?.version || '').trim() || 'available'} found. Downloading now...`,
        downloadedVersion: null,
        errorMessage: null,
        lastCheckedAt: new Date().toISOString(),
      });
    });

    targetUpdater.on('update-not-available', () => {
      logger.info('No app update available');
      setState({
        status: 'up-to-date',
        statusMessage: 'You are up to date.',
        availableVersion: null,
        downloadedVersion: null,
        releaseName: null,
        releaseDate: null,
        releaseNotes: '',
        downloadProgressPercent: null,
        errorMessage: null,
        lastCheckedAt: new Date().toISOString(),
      });
    });

    targetUpdater.on('download-progress', (progress: DownloadProgressLike) => {
      const progressPercent = toProgressPercent(progress);
      logger.debug('App update download progress', { progressPercent });
      setState({
        status: 'downloading',
        statusMessage: progressPercent === null
          ? 'Downloading update...'
          : `Downloading update... ${Math.round(progressPercent)}%`,
        downloadProgressPercent: progressPercent,
        errorMessage: null,
      });
    });

    targetUpdater.on('update-downloaded', (updateInfo: UpdateInfoLike) => {
      logger.info('App update downloaded', {
        version: updateInfo?.version,
      });
      setState({
        ...assignUpdateInfo(updateInfo),
        status: 'downloaded',
        statusMessage: `Update ${String(updateInfo?.version || '').trim() || 'downloaded'} is ready. Restart to upgrade.`,
        downloadedVersion: typeof updateInfo?.version === 'string' ? updateInfo.version.trim() || null : null,
        downloadProgressPercent: 100,
        errorMessage: null,
        lastCheckedAt: new Date().toISOString(),
      });
    });

    targetUpdater.on('error', (error: unknown) => {
      const errorMessage = toErrorMessage(error, 'Failed to check for updates.');
      logger.error('App updater failed', { error: errorMessage });
      setState({
        status: 'error',
        statusMessage: errorMessage,
        errorMessage,
        downloadProgressPercent: null,
        lastCheckedAt: new Date().toISOString(),
      });
    });
  }

  async function ensureUpdaterReady(): Promise<AutoUpdaterLike | null> {
    if (!isPackaged) {
      setState({
        status: 'unsupported',
        statusMessage: 'App updates are only available in packaged desktop releases.',
      });
      return null;
    }

    if (updater) {
      return updater;
    }

    try {
      updater = await createAutoUpdater();
      updater.autoDownload = true;
      updater.autoInstallOnAppQuit = false;
      updater.allowPrerelease = state.allowPrereleaseUpdates;
      updater.fullChangelog = true;
      registerUpdaterEvents(updater);
      return updater;
    } catch (error) {
      const errorMessage = toErrorMessage(error, 'Failed to initialize the desktop updater.');
      logger.error('Failed to initialize app updater', { error: errorMessage });
      setState({
        status: 'error',
        statusMessage: errorMessage,
        errorMessage,
      });
      return null;
    }
  }

  async function checkForUpdates(options?: { source?: 'manual' | 'startup' }): Promise<AppUpdateState> {
    if (activeCheckPromise) {
      return await activeCheckPromise;
    }

    activeCheckPromise = (async () => {
      const readyUpdater = await ensureUpdaterReady();
      if (!readyUpdater) {
        return state;
      }

      try {
        if (options?.source === 'manual') {
          setState({
            status: 'checking',
            statusMessage: 'Checking for updates...',
            errorMessage: null,
          });
        }
        await readyUpdater.checkForUpdates();
        return state;
      } catch (error) {
        const errorMessage = toErrorMessage(error, 'Failed to check for updates.');
        logger.error('App updater check failed', { error: errorMessage });
        return setState({
          status: 'error',
          statusMessage: errorMessage,
          errorMessage,
          lastCheckedAt: new Date().toISOString(),
        });
      } finally {
        activeCheckPromise = null;
      }
    })();

    return await activeCheckPromise;
  }

  async function initialize(): Promise<AppUpdateState> {
    if (isInitialized) {
      return state;
    }

    isInitialized = true;
    applyUpdaterSettings(loadSettings());
    await ensureUpdaterReady();
    if (isPackaged) {
      void checkForUpdates({ source: 'startup' });
    }
    return state;
  }

  async function installUpdateAndRestart(): Promise<{ accepted: boolean; reason?: string }> {
    const readyUpdater = await ensureUpdaterReady();
    if (!readyUpdater) {
      return {
        accepted: false,
        reason: 'Desktop updater is unavailable in the current runtime.',
      };
    }

    if (state.status !== 'downloaded') {
      return {
        accepted: false,
        reason: state.status === 'downloading'
          ? 'Update is still downloading.'
          : 'No downloaded update is ready to install.',
      };
    }

    logger.info('Installing downloaded app update');
    readyUpdater.quitAndInstall(false, true);
    return { accepted: true };
  }

  return {
    initialize,
    getState: () => state,
    checkForUpdates,
    installUpdateAndRestart,
    applySettings: applyUpdaterSettings,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}