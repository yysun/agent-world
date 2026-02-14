#!/usr/bin/env node

/**
 * Prepare Electron Runtime Assets
 *
 * Features:
 * - Copies compiled core runtime output into `electron/dist/core`
 * - Copies SQL migrations into `electron/dist/migrations`
 * - Ensures packaged Electron runtime can resolve core + migrations paths
 *
 * Implementation Notes:
 * - Requires root core build output at `dist/core`
 * - Uses recursive copy with overwrite for deterministic packaging inputs
 * - Intended to run before electron-builder packaging commands
 *
 * Recent Changes:
 * - 2026-02-14: Initial script added for desktop packaging runtime preparation
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const rootCoreDistDir = path.join(rootDir, 'dist', 'core');
const rootMigrationsDir = path.join(rootDir, 'migrations');
const electronDistDir = path.join(rootDir, 'electron', 'dist');
const electronCoreDistDir = path.join(electronDistDir, 'core');
const electronMigrationsDistDir = path.join(electronDistDir, 'migrations');

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(rootCoreDistDir)) {
  fail(`Missing core build output: ${rootCoreDistDir}\nRun: npm run build:core`);
}

if (!fs.existsSync(rootMigrationsDir)) {
  fail(`Missing migrations directory: ${rootMigrationsDir}`);
}

fs.mkdirSync(electronDistDir, { recursive: true });
fs.rmSync(electronCoreDistDir, { recursive: true, force: true });
fs.rmSync(electronMigrationsDistDir, { recursive: true, force: true });

fs.cpSync(rootCoreDistDir, electronCoreDistDir, { recursive: true });
fs.cpSync(rootMigrationsDir, electronMigrationsDistDir, { recursive: true });

console.log('Prepared Electron runtime assets:');
console.log(`- core:       ${electronCoreDistDir}`);
console.log(`- migrations: ${electronMigrationsDistDir}`);
