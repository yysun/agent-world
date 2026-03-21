#!/usr/bin/env node

/**
 * Electron Runtime Dependency Sync: Core package -> Electron package
 *
 * Purpose:
 * - Keeps `electron/package.json` runtime dependencies aligned with the core runtime package.
 * - Prevents packaged Electron apps from missing modules required by `dist/core`.
 * - Supports `--check` mode for release/build guardrails.
 *
 * Key Features:
 * - Treats `core/package.json` dependencies as the authoritative runtime set for `dist/core`.
 * - Merges core runtime dependencies into the Electron package without removing Electron-specific deps.
 * - Fails fast with an explicit mismatch report when required runtime deps drift.
 *
 * Implementation Notes:
 * - Core runtime dependencies override matching versions in `electron/package.json`.
 * - Electron-specific UI/runtime dependencies like React remain intact.
 * - JSON formatting preserves 2-space indentation and a trailing newline.
 *
 * Recent Changes:
 * - 2026-03-21: Added runtime dependency sync for packaged Electron builds.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const corePackagePath = path.join(projectRoot, 'core', 'package.json');
const electronPackagePath = path.join(projectRoot, 'electron', 'package.json');
const checkOnly = process.argv.includes('--check');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function getMissingOrMismatchedCoreDeps(coreDeps, electronDeps) {
  return Object.entries(coreDeps).filter(([name, version]) => electronDeps[name] !== version);
}

if (!fs.existsSync(corePackagePath)) {
  fail(`Missing core package.json: ${corePackagePath}`);
}

if (!fs.existsSync(electronPackagePath)) {
  fail(`Missing electron package.json: ${electronPackagePath}`);
}

const corePackage = readJson(corePackagePath);
const electronPackage = readJson(electronPackagePath);

const coreDependencies = corePackage.dependencies || {};
const electronDependencies = electronPackage.dependencies || {};
const mismatches = getMissingOrMismatchedCoreDeps(coreDependencies, electronDependencies);

if (checkOnly) {
  if (mismatches.length > 0) {
    fail(
      [
        'Electron runtime dependency drift detected:',
        ...mismatches.map(([name, version]) => `- ${name}: expected ${version}, found ${electronDependencies[name] || '<missing>'}`),
        'Run: npm run deps:sync:electron-runtime',
      ].join('\n')
    );
  }

  console.log(`OK: electron runtime dependencies are aligned with core (${Object.keys(coreDependencies).length} deps).`);
  process.exit(0);
}

if (mismatches.length === 0) {
  console.log(`No change: electron runtime dependencies already aligned (${Object.keys(coreDependencies).length} deps).`);
  process.exit(0);
}

electronPackage.dependencies = {
  ...electronDependencies,
  ...coreDependencies,
};

writeJson(electronPackagePath, electronPackage);

console.log(
  [
    'Updated electron runtime dependencies from core package:',
    ...mismatches.map(([name, version]) => `- ${name}: ${electronDependencies[name] || '<missing>'} -> ${version}`),
  ].join('\n')
);