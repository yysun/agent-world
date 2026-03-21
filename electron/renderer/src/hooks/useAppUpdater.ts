/**
 * useAppUpdater Hook
 * Purpose:
 * - Manage renderer-side desktop app updater state and actions.
 *
 * Key Features:
 * - Loads initial updater state from the preload bridge.
 * - Subscribes to live updater state events from the main process.
 * - Exposes manual check and install/restart actions with user notifications.
 *
 * Implementation Notes:
 * - Keeps update notifications scoped to meaningful state transitions.
 * - Uses refs to suppress duplicate toasts during startup replays.
 *
 * Recent Changes:
 * - 2026-03-21: Added install confirmation text so release notes stay visible before restart-to-upgrade.
 * - 2026-03-21: Added Phase 4 desktop updater renderer orchestration.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppUpdateState, DesktopApi } from '../types/desktop-api';
import { safeMessage } from '../domain/desktop-api';

const DEFAULT_UPDATE_STATE: AppUpdateState = {
  currentVersion: 'unknown',
  allowPrereleaseUpdates: false,
  isPackaged: false,
  status: 'unsupported',
  statusMessage: 'App updates are only available in packaged desktop releases.',
  availableVersion: null,
  downloadedVersion: null,
  releaseName: null,
  releaseDate: null,
  releaseNotes: '',
  lastCheckedAt: null,
  downloadProgressPercent: null,
  errorMessage: null,
};

function shouldNotifyStatus(nextState: AppUpdateState, previousState: AppUpdateState | null): boolean {
  if (!previousState) {
    return false;
  }

  if (nextState.status !== previousState.status) {
    return true;
  }

  if (nextState.status === 'downloaded' && nextState.downloadedVersion !== previousState.downloadedVersion) {
    return true;
  }

  return false;
}

function notifyForUpdateState(
  nextState: AppUpdateState,
  setStatusText: (text: string, kind?: string) => void,
): void {
  if (nextState.status === 'available') {
    setStatusText(`Update ${nextState.availableVersion || 'available'} found. Downloading now...`, 'info');
    return;
  }

  if (nextState.status === 'downloaded') {
    setStatusText(`Update ${nextState.downloadedVersion || 'downloaded'} is ready. Restart to upgrade.`, 'success');
    return;
  }

  if (nextState.status === 'error' && nextState.errorMessage) {
    setStatusText(nextState.errorMessage, 'error');
  }
}

export function buildUpdateInstallConfirmationMessage(updateState: AppUpdateState): string {
  const version = updateState.downloadedVersion || updateState.availableVersion || 'the latest version';
  const releaseLabel = String(updateState.releaseName || '').trim() || `Agent World ${version}`;
  const releaseNotes = String(updateState.releaseNotes || '').trim();
  const notesBlock = releaseNotes
    ? releaseNotes.slice(0, 2000)
    : 'No release notes were provided for this update.';

  return [
    `Install ${releaseLabel}?`,
    'The app will restart to finish upgrading.',
    '',
    'Release notes:',
    notesBlock,
  ].join('\n');
}

export function useAppUpdater({
  api,
  setStatusText,
}: {
  api: DesktopApi;
  setStatusText: (text: string, kind?: string) => void;
}) {
  const [appUpdateState, setAppUpdateState] = useState<AppUpdateState>(DEFAULT_UPDATE_STATE);
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const previousStateRef = useRef<AppUpdateState | null>(null);

  useEffect(() => {
    let disposed = false;

    api.getUpdateState()
      .then((nextState) => {
        if (disposed) return;
        setAppUpdateState(nextState);
        previousStateRef.current = nextState;
      })
      .catch((error) => {
        if (disposed) return;
        setStatusText(safeMessage(error, 'Failed to load app update status.'), 'error');
      });

    const unsubscribe = api.onUpdateEvent((nextState) => {
      if (disposed) return;
      const previousState = previousStateRef.current;
      setAppUpdateState(nextState);
      if (shouldNotifyStatus(nextState, previousState)) {
        notifyForUpdateState(nextState, setStatusText);
      }
      previousStateRef.current = nextState;
      if (nextState.status !== 'checking') {
        setCheckingForUpdates(false);
      }
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [api, setStatusText]);

  const checkForUpdates = useCallback(async () => {
    setCheckingForUpdates(true);
    try {
      const nextState = await api.checkForUpdates();
      setAppUpdateState(nextState);
      previousStateRef.current = nextState;
      if (nextState.status === 'up-to-date') {
        setStatusText('You are up to date.', 'success');
      } else if (nextState.status === 'unsupported') {
        setStatusText(nextState.statusMessage, 'info');
      } else if (nextState.status === 'error' && nextState.errorMessage) {
        setStatusText(nextState.errorMessage, 'error');
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to check for updates.'), 'error');
    } finally {
      setCheckingForUpdates(false);
    }
  }, [api, setStatusText]);

  const installUpdateAndRestart = useCallback(async () => {
    try {
      if (
        appUpdateState.status === 'downloaded'
        && typeof window !== 'undefined'
        && typeof window.confirm === 'function'
      ) {
        const confirmed = window.confirm(buildUpdateInstallConfirmationMessage(appUpdateState));
        if (!confirmed) {
          return;
        }
      }

      const result = await api.installUpdateAndRestart();
      if (!result?.accepted) {
        setStatusText(String(result?.reason || 'No downloaded update is ready to install.'), 'info');
        return;
      }

      setStatusText('Restarting to install the downloaded update...', 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to install the downloaded update.'), 'error');
    }
  }, [api, appUpdateState, setStatusText]);

  return {
    appUpdateState,
    checkingForUpdates,
    checkForUpdates,
    installUpdateAndRestart,
  };
}