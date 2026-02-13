/**
 * Unit Tests for Main Window Path Resolvers
 *
 * Features:
 * - Verifies renderer index resolution for source and compiled layouts.
 * - Verifies preload path override and fallback behavior.
 *
 * Implementation Notes:
 * - Uses pure-function tests with stubbed `existsSync`.
 * - Avoids Electron runtime dependencies.
 *
 * Recent Changes:
 * - 2026-02-12: Updated preload path assertions for candidate-based runtime resolution (no env override dependency).
 * - 2026-02-12: Moved into layer-based tests/electron subfolder and updated module import paths.
 * - 2026-02-12: Added Phase 3 coverage for window path resolver module.
 */

import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import { resolvePreloadPath, resolveRendererIndexPath } from '../../../electron/main-process/window-paths';

describe('resolveRendererIndexPath', () => {
  it('prefers source-layout renderer index when present', () => {
    const baseDir = '/workspace/electron';
    const sourceCandidate = path.join(baseDir, 'renderer', 'dist', 'index.html');
    const result = resolveRendererIndexPath(baseDir, (candidate) => candidate === sourceCandidate);
    expect(result).toBe(sourceCandidate);
  });

  it('falls back to compiled-layout renderer index when source path is missing', () => {
    const baseDir = '/workspace/electron/dist';
    const compiledCandidate = path.join(baseDir, '..', 'renderer', 'dist', 'index.html');
    const result = resolveRendererIndexPath(baseDir, (candidate) => candidate === compiledCandidate);
    expect(result).toBe(compiledCandidate);
  });
});

describe('resolvePreloadPath', () => {
  it('prefers direct preload path in compiled layout', () => {
    const baseDir = '/workspace/electron/dist';
    const directCandidate = path.join(baseDir, 'preload.js');
    const result = resolvePreloadPath(baseDir, (candidate) => candidate === directCandidate);
    expect(result).toBe(directCandidate);
  });

  it('falls back to parent preload path for source-style layout', () => {
    const baseDir = '/workspace/electron';
    const parentCandidate = path.join(baseDir, '..', 'preload.js');
    const result = resolvePreloadPath(baseDir, (candidate) => candidate === parentCandidate);
    expect(result).toBe(parentCandidate);
  });
});
