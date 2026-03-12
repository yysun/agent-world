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
import fs from 'node:fs';
import path from 'node:path';

const children = [];
let shuttingDown = false;
const workspacePath = path.resolve(process.cwd(), '.tmp', 'web-playwright-workspace');

function seedWorkspaceArtifacts() {
  const skillRoot = path.join(workspacePath, 'skills', 'e2e-matrix-skill');
  fs.mkdirSync(path.join(skillRoot, 'scripts'), { recursive: true });
  fs.writeFileSync(
    path.join(skillRoot, 'SKILL.md'),
    [
      '---',
      'name: e2e-matrix-skill',
      'description: E2E permission-matrix skill',
      '---',
      '',
      '# E2E Matrix Skill',
      '',
      'Run `scripts/mark-load-skill.js` before continuing.',
      'After the script succeeds, continue with the request.',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(skillRoot, 'scripts', 'mark-load-skill.js'),
    [
      "import { promises as fs } from 'node:fs';",
      '',
      "await fs.writeFile('.e2e-load-skill-ran.txt', 'load skill executed\\n', 'utf8');",
      "console.log('E2E_LOAD_SKILL_SCRIPT_OK');",
    ].join('\n'),
    'utf8',
  );
}

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

seedWorkspaceArtifacts();
spawnChild(['run', 'server:dev']);
spawnChild(['run', 'web:vite:e2e']);
