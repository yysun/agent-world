/**
 * Unit Tests for useAppUpdater helpers
 *
 * Features:
 * - Verifies install confirmation text includes versioned release context.
 * - Verifies release notes are surfaced before restart-to-upgrade.
 *
 * Implementation Notes:
 * - Uses pure helper coverage only; no React runtime is required.
 * - Keeps assertions deterministic in the node test environment.
 *
 * Recent Changes:
 * - 2026-03-21: Added coverage for upgrade confirmation messaging so release notes remain visible in the simplified sidebar flow.
 */

import { describe, expect, it } from 'vitest';
import { buildUpdateInstallConfirmationMessage } from '../../../electron/renderer/src/hooks/useAppUpdater';

describe('buildUpdateInstallConfirmationMessage', () => {
  it('includes the downloaded version and release notes in the confirmation text', () => {
    const message = buildUpdateInstallConfirmationMessage({
      currentVersion: '0.15.0',
      allowPrereleaseUpdates: false,
      isPackaged: true,
      status: 'downloaded',
      statusMessage: 'Update ready.',
      availableVersion: '0.16.0',
      downloadedVersion: '0.16.0',
      releaseName: 'Agent World 0.16.0',
      releaseDate: '2026-03-21T10:00:00.000Z',
      releaseNotes: 'Bug fixes and updater support.',
      lastCheckedAt: '2026-03-21T10:05:00.000Z',
      downloadProgressPercent: 100,
      errorMessage: null,
    });

    expect(message).toContain('Install Agent World 0.16.0?');
    expect(message).toContain('Release notes:');
    expect(message).toContain('Bug fixes and updater support.');
  });
});
