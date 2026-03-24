/**
 * Root web dev script regression tests.
 *
 * Purpose:
 * - Lock the root `npm run dev` web path to the real SPA Vite config used by browser flows.
 *
 * Key Features:
 * - Verifies the root `web:vite` script points at `web/vite.config.js`.
 * - Ensures local manual dev-server runs do not fall back to serving the repo root as a directory listing.
 *
 * Notes on Implementation:
 * - Reads the real root package manifest and asserts the script contract directly.
 * - Keeps coverage fast and deterministic without spawning child processes.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added regression coverage for the root manual web dev-server script.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

type RootPackageJson = {
  scripts?: Record<string, string | undefined>;
};

function readRootPackageJson(): RootPackageJson {
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  const packageJsonText = readFileSync(packageJsonPath, 'utf8');
  return JSON.parse(packageJsonText) as RootPackageJson;
}

describe('root web dev script', () => {
  it('uses the web Vite config so manual dev serves the SPA instead of the repo root', () => {
    const packageJson = readRootPackageJson();

    expect(packageJson.scripts?.['web:vite']).toBe(
      'vite dev --config web/vite.config.js --host 127.0.0.1 --port 8080 --strictPort',
    );
  });
});