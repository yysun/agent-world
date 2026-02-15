/**
 * Electron Core Module Loader
 *
 * Features:
 * - Resolves and imports the compiled core runtime module from supported layouts.
 * - Supports source-runtime and compiled-runtime Electron path structures.
 *
 * Implementation Notes:
 * - Uses explicit candidate probing to keep startup behavior deterministic.
 * - Throws with searched paths for clear startup diagnostics.
 *
 * Recent Changes:
 * - 2026-02-15: Load the newest existing core candidate by mtime to avoid stale runtime bundles during local dev.
 * - 2026-02-15: Reordered candidate resolution to prefer root `dist/core/index.js` over `electron/dist/core/index.js` to avoid stale core runtime in `electron:dev`.
 * - 2026-02-12: Extracted dynamic core-module resolution from `electron/main.ts`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function importCoreModule(baseDir: string): Promise<any> {
  const candidates = [
    path.resolve(baseDir, '../../dist/core/index.js'),
    path.resolve(baseDir, '../dist/core/index.js')
  ];

  const existingCandidates = candidates
    .filter((candidate) => fs.existsSync(candidate))
    .map((candidate) => ({
      candidate,
      mtimeMs: fs.statSync(candidate).mtimeMs
    }))
    .sort((left, right) => {
      if (right.mtimeMs !== left.mtimeMs) {
        return right.mtimeMs - left.mtimeMs;
      }
      return candidates.indexOf(left.candidate) - candidates.indexOf(right.candidate);
    });

  if (existingCandidates.length > 0) {
    return import(pathToFileURL(existingCandidates[0].candidate).href);
  }

  const searched = candidates.map((item) => `'${item}'`).join(', ');
  throw new Error(`Failed to locate core module. Searched: ${searched}`);
}

