/**
 * Electron Dev Launcher Helper
 *
 * Purpose:
 * - Start the Electron desktop app from the root workspace without hardcoding a CDP port.
 *
 * Key Features:
 * - Resolves the Electron CLI from the desktop workspace dependency tree.
 * - Adds a remote debugging port only when explicitly requested via env var.
 * - Exports deterministic helpers for launcher contract tests.
 *
 * Implementation Notes:
 * - Runs Electron with the working directory set to the electron workspace.
 * - Uses Node's module resolution from `electron/package.json` to avoid depending on root installs.
 *
 * Recent Changes:
 * - 2026-04-15: Restored the helper after the repo drifted back to a hardcoded `--remote-debugging-port=9222` dev command.
 */

import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function resolveElectronWorkspacePackageJsonPath(cwd = process.cwd()) {
  return path.resolve(cwd, 'electron/package.json');
}

export function buildElectronDevLaunchArgs(env = process.env) {
  const cdpPort = String(env.AGENT_WORLD_ELECTRON_CDP_PORT || '').trim();
  return cdpPort ? [`--remote-debugging-port=${cdpPort}`, '.'] : ['.'];
}

export function resolveElectronCliPath(cwd = process.cwd()) {
  const electronWorkspacePackageJsonPath = resolveElectronWorkspacePackageJsonPath(cwd);
  const requireFromElectronWorkspace = createRequire(pathToFileURL(electronWorkspacePackageJsonPath).href);
  return requireFromElectronWorkspace.resolve('electron/cli.js');
}

export function runElectronDev({
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  const electronWorkspaceDir = path.dirname(resolveElectronWorkspacePackageJsonPath(cwd));
  const electronCliPath = resolveElectronCliPath(cwd);
  const child = spawn(process.execPath, [electronCliPath, ...buildElectronDevLaunchArgs(env)], {
    cwd: electronWorkspaceDir,
    env,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    console.error(error);
    process.exit(1);
  });

  return child;
}

const invokedAsScript = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (invokedAsScript) {
  runElectronDev();
}