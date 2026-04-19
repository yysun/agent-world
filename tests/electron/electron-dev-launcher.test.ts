/**
 * Electron dev launcher contract tests.
 *
 * Purpose:
 * - Lock the Electron dev script to the opt-in CDP launcher so normal local runs do not fail on port collisions.
 *
 * Key Features:
 * - Verifies the Electron package script uses the dedicated launcher helper.
 * - Verifies the launcher only adds a remote debugging port when explicitly requested.
 *
 * Implementation Notes:
 * - Reads the real Electron package manifest for script coverage.
 * - Imports the helper directly for deterministic argument assertions.
 *
 * Recent Changes:
 * - 2026-04-19: Added regression coverage for script-anchored workspace resolution.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildElectronDevLaunchArgs,
  resolveElectronExecutablePath,
  resolveElectronWorkspacePackageJsonPath,
} from '../../scripts/run-electron-dev.mjs';

type ElectronPackageJson = {
  scripts?: Record<string, string | undefined>;
};

function readElectronPackageJson(): ElectronPackageJson {
  const packageJsonPath = path.resolve(process.cwd(), 'electron/package.json');
  const packageJsonText = readFileSync(packageJsonPath, 'utf8');
  return JSON.parse(packageJsonText) as ElectronPackageJson;
}

describe('electron dev launcher', () => {
  it('uses the dedicated launcher script instead of hardcoding a CDP port in package.json', () => {
    const packageJson = readElectronPackageJson();

    expect(packageJson.scripts?.['electron:dev']).toBe(
      'wait-on http://127.0.0.1:5181 file:dist/main.js && cross-env ELECTRON_RENDERER_URL=http://127.0.0.1:5181 node ../scripts/run-electron-dev.mjs',
    );
  });

  it('adds a remote debugging port only when AGENT_WORLD_ELECTRON_CDP_PORT is set', () => {
    expect(buildElectronDevLaunchArgs({})).toEqual(['.']);
    expect(buildElectronDevLaunchArgs({ AGENT_WORLD_ELECTRON_CDP_PORT: '9333' })).toEqual([
      '--remote-debugging-port=9333',
      '.',
    ]);
  });

  it('resolves the Electron executable from the desktop workspace package tree', () => {
    const executablePath = resolveElectronExecutablePath();

    expect(existsSync(executablePath)).toBe(true);
    expect(executablePath).toContain(`${path.sep}electron${path.sep}node_modules${path.sep}electron${path.sep}`);
  });

  it('resolves the Electron workspace package.json from the helper location', () => {
    expect(resolveElectronWorkspacePackageJsonPath()).toBe(
      path.resolve(process.cwd(), 'electron/package.json'),
    );
  });
});