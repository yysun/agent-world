/**
 * Unit Tests for Electron App Updater Service
 *
 * Features:
 * - Verifies packaged startup initializes and checks for updates.
 * - Verifies updater events drive deterministic renderer-safe state.
 * - Verifies prerelease policy and install handoff behavior.
 *
 * Implementation Notes:
 * - Uses dependency-injected updater doubles without Electron runtime.
 * - Keeps all assertions in memory with no network or filesystem access.
 *
 * Recent Changes:
 * - 2026-03-21: Removed the temporary dev preview coverage and restored unsupported-only behavior for non-packaged runs.
 * - 2026-03-21: Added Phase 4 coverage for desktop update lifecycle orchestration.
 */

import { describe, expect, it, vi } from 'vitest';
import { createAppUpdaterService } from '../../../electron/main-process/app-updater';

function createMockAutoUpdater() {
  const listeners = new Map<string, Array<(...args: any[]) => void>>();

  return {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    allowPrerelease: false,
    fullChangelog: false,
    on: vi.fn((eventName: string, listener: (...args: any[]) => void) => {
      const existing = listeners.get(eventName) || [];
      existing.push(listener);
      listeners.set(eventName, existing);
    }),
    emit(eventName: string, ...args: any[]) {
      for (const listener of listeners.get(eventName) || []) {
        listener(...args);
      }
    },
    checkForUpdates: vi.fn(async () => ({ updateInfo: null })),
    quitAndInstall: vi.fn(),
  };
}

describe('createAppUpdaterService', () => {
  it('initializes packaged updater instances and runs a startup check', async () => {
    const updater = createMockAutoUpdater();
    const createAutoUpdater = vi.fn(async () => updater);

    const service = createAppUpdaterService({
      currentVersion: '0.15.0',
      isPackaged: true,
      loadSettings: () => ({ allowPrereleaseUpdates: false }),
      createAutoUpdater,
    });

    await service.initialize();

    expect(createAutoUpdater).toHaveBeenCalledTimes(1);
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.fullChangelog).toBe(true);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('tracks update availability, download completion, and install handoff', async () => {
    const updater = createMockAutoUpdater();
    const service = createAppUpdaterService({
      currentVersion: '0.15.0',
      isPackaged: true,
      loadSettings: () => ({ allowPrereleaseUpdates: false }),
      createAutoUpdater: async () => updater,
    });

    await service.initialize();
    updater.emit('checking-for-update');
    updater.emit('update-available', {
      version: '0.16.0',
      releaseName: '0.16.0',
      releaseDate: '2026-03-21T10:00:00.000Z',
      releaseNotes: [{ version: '0.16.0', note: 'Bug fixes and updater support.' }],
    });
    updater.emit('download-progress', { percent: 42.4 });
    updater.emit('update-downloaded', {
      version: '0.16.0',
      releaseName: '0.16.0',
      releaseDate: '2026-03-21T10:00:00.000Z',
      releaseNotes: [{ version: '0.16.0', note: 'Bug fixes and updater support.' }],
    });

    const updateState = service.getState();

    expect(updateState.status).toBe('downloaded');
    expect(updateState.downloadedVersion).toBe('0.16.0');
    expect(updateState.releaseName).toBe('0.16.0');
    expect(updateState.releaseNotes).toContain('Bug fixes and updater support.');
    expect(updateState.downloadProgressPercent).toBe(100);

    const installResult = await service.installUpdateAndRestart();

    expect(installResult).toEqual({ accepted: true });
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('keeps updates unsupported for non-packaged desktop runs and honors prerelease settings changes', async () => {
    const createAutoUpdater = vi.fn(async () => createMockAutoUpdater());
    const service = createAppUpdaterService({
      currentVersion: '0.15.0',
      isPackaged: false,
      loadSettings: () => ({ allowPrereleaseUpdates: false }),
      createAutoUpdater,
    });

    const initializedState = await service.initialize();
    const updatedState = service.applySettings({ allowPrereleaseUpdates: true });

    expect(createAutoUpdater).not.toHaveBeenCalled();
    expect(initializedState.status).toBe('unsupported');
    expect(updatedState.allowPrereleaseUpdates).toBe(true);
  });

  it('keeps install unavailable for non-packaged desktop runs', async () => {
    const createAutoUpdater = vi.fn(async () => createMockAutoUpdater());
    const service = createAppUpdaterService({
      currentVersion: '0.15.0',
      isPackaged: false,
      loadSettings: () => ({ allowPrereleaseUpdates: true }),
      createAutoUpdater,
    });

    const initializedState = await service.initialize();
    const installResult = await service.installUpdateAndRestart();

    expect(createAutoUpdater).not.toHaveBeenCalled();
    expect(initializedState.status).toBe('unsupported');
    expect(installResult).toEqual({
      accepted: false,
      reason: 'Desktop updater is unavailable in the current runtime.',
    });
  });
});