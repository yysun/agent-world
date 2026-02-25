#!/usr/bin/env node

/**
 * Version Sync: Root package -> Electron package
 *
 * Features:
 * - Keeps `electron/package.json` version aligned with root `package.json`
 * - Supports `--check` mode for CI/release guards
 * - Fails fast with explicit mismatch output when versions diverge
 *
 * Implementation Notes:
 * - Root package version is the single authoritative release version
 * - JSON output formatting preserves 2-space indentation and trailing newline
 * - Script is ESM and runs with Node.js directly
 *
 * Recent Changes:
 * - 2026-02-14: Initial script added for desktop release version-contract enforcement
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const rootPackagePath = path.join(projectRoot, 'package.json');
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

if (!fs.existsSync(rootPackagePath)) {
  fail(`Missing root package.json: ${rootPackagePath}`);
}

if (!fs.existsSync(electronPackagePath)) {
  fail(`Missing electron package.json: ${electronPackagePath}`);
}

const rootPackage = readJson(rootPackagePath);
const electronPackage = readJson(electronPackagePath);

const rootVersion = String(rootPackage.version || '').trim();
const electronVersion = String(electronPackage.version || '').trim();

if (!rootVersion) {
  fail('Root package version is missing or empty.');
}

if (checkOnly) {
  if (rootVersion !== electronVersion) {
    fail(
      [
        'Version mismatch detected:',
        `- root/package.json:     ${rootVersion}`,
        `- electron/package.json: ${electronVersion || '<empty>'}`,
        'Run: npm run version:sync:electron',
      ].join('\n')
    );
  }

  console.log(`OK: root and electron versions are aligned (${rootVersion}).`);
  process.exit(0);
}

if (rootVersion === electronVersion) {
  console.log(`No change: electron version already aligned (${rootVersion}).`);
  process.exit(0);
}

electronPackage.version = rootVersion;
writeJson(electronPackagePath, electronPackage);

console.log(
  [
    'Updated electron version:',
    `- previous: ${electronVersion || '<empty>'}`,
    `- current:  ${rootVersion}`,
  ].join('\n')
);
