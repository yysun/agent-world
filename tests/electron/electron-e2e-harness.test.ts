/**
 * Electron E2E harness contract tests.
 *
 * Purpose:
 * - Lock the desktop Playwright harness to a file-based Electron executable resolver.
 *
 * Key Features:
 * - Verifies the harness resolves the Electron binary from `electron/node_modules/electron/path.txt`.
 * - Verifies the override dist path remains supported for custom Electron distributions.
 *
 * Implementation Notes:
 * - Imports the real E2E harness helper directly for deterministic path assertions.
 * - Avoids launching Electron so the regression coverage stays fast and local.
 *
 * Summary of Recent Changes:
 * - 2026-04-16: Added coverage for the file-based Electron executable resolver used by desktop E2E.
 */

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveElectronExecutablePath } from '../electron-e2e/support/electron-harness.js';

describe('electron e2e harness', () => {
  it('resolves the Electron executable from the workspace path.txt shim', () => {
    const electronPackageRoot = '/tmp/electron';

    expect(resolveElectronExecutablePath(electronPackageRoot, {
      existsSync: () => true,
      readFileSync: () => 'Electron.app/Contents/MacOS/Electron',
    })).toBe(path.join(electronPackageRoot, 'dist', 'Electron.app/Contents/MacOS/Electron'));
  });

  it('prefers ELECTRON_OVERRIDE_DIST_PATH when present', () => {
    expect(resolveElectronExecutablePath('/tmp/electron', {
      existsSync: () => true,
      readFileSync: () => 'electron',
      overrideDistPath: '/tmp/custom-electron-dist',
    })).toBe('/tmp/custom-electron-dist/electron');
  });
});