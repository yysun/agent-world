/**
 * Electron Main Window Path Resolution
 *
 * Features:
 * - Resolves renderer index file for source and compiled runtime layouts.
 * - Resolves preload path for source and compiled runtime layouts.
 *
 * Implementation Notes:
 * - Keeps path resolution deterministic and easy to unit test.
 * - Uses dependency-injected `existsSync` for testability.
 *
 * Recent Changes:
 * - 2026-02-12: Removed preload override coupling and resolved preload path by runtime layout candidates.
 * - 2026-02-12: Added extracted window path resolver module for Phase 3 modularization.
 */

import * as path from 'node:path';

type ExistsSync = (candidate: string) => boolean;

export function resolveRendererIndexPath(baseDir: string, existsSync: ExistsSync): string {
  const rendererIndexCandidates = [
    path.join(baseDir, 'renderer', 'dist', 'index.html'),
    path.join(baseDir, '..', 'renderer', 'dist', 'index.html')
  ];

  return rendererIndexCandidates.find((candidate) => existsSync(candidate))
    || rendererIndexCandidates[0];
}

export function resolvePreloadPath(baseDir: string, existsSync: ExistsSync): string {
  const preloadCandidates = [
    path.join(baseDir, 'preload.js'),
    path.join(baseDir, '..', 'preload.js')
  ];

  return preloadCandidates.find((candidate) => existsSync(candidate))
    || preloadCandidates[0];
}
