/**
 * Electron release package contract tests.
 *
 * Purpose:
 * - Prevent packaging-manifest drift that breaks desktop release automation.
 *
 * Key Features:
 * - Verifies Electron uses the root release version.
 * - Verifies Electron declares `electron-builder` when release scripts depend on it.
 * - Verifies Electron packages every core runtime dependency required by `dist/core`.
 * - Verifies the postinstall and dist scripts stay aligned with the declared dependency.
 *
 * Implementation Notes:
 * - Reads the real package manifests with `node:fs` to avoid mocked `fs` state.
 * - Treats the Electron package manifest as a public release contract boundary.
 *
 * Recent Changes:
 * - 2026-03-21: Added regression coverage for the Electron packaging dependency contract.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return actual;
});

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8'));
}

describe('electron release package contract', () => {
  it('keeps the electron package version aligned with the root package version', () => {
    const rootPackage = readJson('../../package.json');
    const electronPackage = readJson('../../electron/package.json');

    expect(electronPackage.version).toBe(rootPackage.version);
  });

  it('declares electron-builder for the release scripts that require it', () => {
    const electronPackage = readJson('../../electron/package.json');
    const builderVersion = electronPackage.devDependencies?.['electron-builder'];

    expect(builderVersion).toBeTruthy();
    expect(electronPackage.scripts?.postinstall).toContain('electron-builder install-app-deps');
    expect(electronPackage.scripts?.['dist:mac']).toContain('electron-builder');
    expect(electronPackage.scripts?.['dist:win']).toContain('electron-builder');
  });

  it('includes all core runtime dependencies needed by the packaged app', () => {
    const corePackage = readJson('../../core/package.json');
    const electronPackage = readJson('../../electron/package.json');

    for (const [dependencyName, dependencyVersion] of Object.entries(corePackage.dependencies)) {
      expect(electronPackage.dependencies?.[dependencyName]).toBe(dependencyVersion);
    }
  });
});