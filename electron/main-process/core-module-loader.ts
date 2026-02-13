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
 * - 2026-02-12: Extracted dynamic core-module resolution from `electron/main.ts`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function importCoreModule(baseDir: string): Promise<any> {
  const candidates = [
    path.resolve(baseDir, '../dist/core/index.js'),
    path.resolve(baseDir, '../../dist/core/index.js')
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    return import(pathToFileURL(candidate).href);
  }

  const searched = candidates.map((item) => `'${item}'`).join(', ');
  throw new Error(`Failed to locate core module. Searched: ${searched}`);
}

