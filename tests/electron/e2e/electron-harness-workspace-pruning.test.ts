/**
 * Unit Tests for Electron E2E Harness Workspace Pruning
 *
 * Purpose:
 * - Verify old Electron Playwright `run-*` workspaces are pruned deterministically.
 *
 * Key Features:
 * - Covers the pure run-selection policy.
 * - Covers the filesystem-backed pruning helper with injected fake fs behavior.
 *
 * Implementation Notes:
 * - Uses injected filesystem doubles only; no real files or directories are touched.
 * - Keeps the regression narrowly scoped to the harness cleanup policy.
 *
 * Recent Changes:
 * - 2026-03-13: Added regression coverage for pruning stale Electron E2E run directories.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  getWorkspaceRunsToPrune,
  pruneWorkspaceRuns,
} from '../../electron-e2e/support/workspace-pruning';

function normalizeForAssertion(value: string): string {
  return String(value).replace(/\\/g, '/');
}

function createDirectoryEntry(name: string, isDirectory: boolean = true) {
  return {
    name,
    isDirectory: () => isDirectory,
  };
}

describe('electron harness workspace pruning', () => {
  it('prunes only the oldest run directories beyond the retention limit', () => {
    const directoriesToPrune = getWorkspaceRunsToPrune([
      'notes',
      'run-100-oldest',
      'run-200-middle',
      'run-300-newest',
    ], 2);

    expect(directoriesToPrune).toEqual(['run-100-oldest']);
  });

  it('removes only prunable run directories from the workspace root', () => {
    const rmSync = vi.fn();
    const prunedDirectories = pruneWorkspaceRuns('/tmp/electron-playwright-workspace', {
      maxRetainedRuns: 2,
      fsLike: {
        existsSync: vi.fn(() => true),
        readdirSync: vi.fn(() => [
          createDirectoryEntry('run-100-oldest'),
          createDirectoryEntry('docs'),
          createDirectoryEntry('run-200-middle'),
          createDirectoryEntry('run-300-newest'),
          createDirectoryEntry('README.md', false),
        ]),
        rmSync,
      },
    });

    expect(prunedDirectories).toEqual(['run-100-oldest']);
    expect(rmSync).toHaveBeenCalledTimes(1);
    expect(normalizeForAssertion(rmSync.mock.calls[0][0])).toBe('/tmp/electron-playwright-workspace/run-100-oldest');
    expect(rmSync.mock.calls[0][1]).toEqual({ recursive: true, force: true });
  });
});
