/**
 * Root test script regression tests.
 *
 * Purpose:
 * - Lock the root `npm run test` script to fail fast on the first Vitest failure.
 *
 * Key Features:
 * - Verifies the root `test` script passes Vitest's bail flag.
 * - Prevents future manifest drift back to full-suite execution after the first failure.
 *
 * Notes on Implementation:
 * - Reads the real root package manifest and asserts the script contract directly.
 * - Keeps coverage fast and deterministic without spawning child processes.
 *
 * Summary of Recent Changes:
 * - 2026-04-16: Added regression coverage for fail-fast root test execution.
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

describe('root test script', () => {
  it('uses Vitest bail mode so npm run test stops on the first failure', () => {
    const packageJson = readRootPackageJson();

    expect(packageJson.scripts?.test).toBe('vitest run --bail=1');
  });
});