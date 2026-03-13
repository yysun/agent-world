/**
 * Electron E2E workspace pruning helpers.
 *
 * Purpose:
 * - Keep the Playwright Electron workspace root bounded by pruning old per-run directories.
 *
 * Key Features:
 * - Selects only `run-*` directories for deletion.
 * - Retains the newest run directories based on their timestamp-prefixed names.
 * - Exposes a small filesystem-backed pruning helper for the real E2E harness.
 *
 * Implementation Notes:
 * - Run directory names already start with `Date.now()`, so lexical ordering matches age.
 * - Pruning is best-effort and intentionally forceful because the directories are disposable.
 *
 * Recent Changes:
 * - 2026-03-13: Added bounded workspace pruning to prevent Electron E2E temp-directory buildup.
 */

import fs from 'node:fs';
import * as path from 'node:path';

const RUN_DIRECTORY_PREFIX = 'run-';

export const DEFAULT_MAX_RETAINED_WORKSPACE_RUNS = 40;

interface DirectoryEntryLike {
  name: string;
  isDirectory: () => boolean;
}

interface WorkspacePruningFs {
  existsSync: (targetPath: string) => boolean;
  readdirSync: (targetPath: string, options: { withFileTypes: true }) => DirectoryEntryLike[];
  rmSync: (targetPath: string, options: { recursive: true; force: true }) => void;
}

export function getWorkspaceRunsToPrune(
  runDirectoryNames: string[],
  maxRetainedRuns: number = DEFAULT_MAX_RETAINED_WORKSPACE_RUNS,
): string[] {
  const boundedMaxRetainedRuns = Number.isFinite(maxRetainedRuns)
    ? Math.max(0, Math.trunc(maxRetainedRuns))
    : DEFAULT_MAX_RETAINED_WORKSPACE_RUNS;

  const sortedRunDirectories = runDirectoryNames
    .filter((name) => typeof name === 'string' && name.startsWith(RUN_DIRECTORY_PREFIX))
    .sort();

  const pruneCount = Math.max(0, sortedRunDirectories.length - boundedMaxRetainedRuns);
  return sortedRunDirectories.slice(0, pruneCount);
}

export function pruneWorkspaceRuns(
  workspaceRoot: string,
  options: {
    fsLike?: WorkspacePruningFs;
    maxRetainedRuns?: number;
  } = {},
): string[] {
  const fsLike = options.fsLike ?? fs;
  const maxRetainedRuns = options.maxRetainedRuns ?? DEFAULT_MAX_RETAINED_WORKSPACE_RUNS;

  if (!fsLike.existsSync(workspaceRoot)) {
    return [];
  }

  const runDirectoryNames = fsLike
    .readdirSync(workspaceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const prunedDirectoryNames = getWorkspaceRunsToPrune(runDirectoryNames, maxRetainedRuns);
  for (const directoryName of prunedDirectoryNames) {
    fsLike.rmSync(path.join(workspaceRoot, directoryName), { recursive: true, force: true });
  }

  return prunedDirectoryNames;
}
