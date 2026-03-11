/**
 * Purpose:
 * - Launch the real local server and Vite web app for Playwright web E2E.
 *
 * Key Features:
 * - Starts the API server and browser app in parallel.
 * - Forwards stdio so Playwright surfaces startup logs.
 * - Handles SIGTERM/SIGINT by stopping both child processes cleanly.
 *
 * Notes on Implementation:
 * - Kept as a small Node supervisor to avoid `npm-run-all` teardown hangs under Playwright.
 * - Playwright itself decides readiness by waiting on the configured web URL.
 *
 * Summary of Recent Changes:
 * - 2026-03-10: Added dedicated web-server supervisor for Playwright E2E startup/shutdown.
 */

import { spawn } from 'node:child_process';

const children = [];
let shuttingDown = false;

function spawnChild(args) {
  const child = spawn('npm', args, {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    for (const other of children) {
      if (other.pid && other.pid !== child.pid) {
        other.kill('SIGTERM');
      }
    }
    process.exit(code ?? (signal ? 1 : 0));
  });
  return child;
}

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    child.kill(signal);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

spawnChild(['run', 'server:dev']);
spawnChild(['run', 'web:vite:e2e']);
