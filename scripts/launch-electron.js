#!/usr/bin/env node

/**
 * Launch Electron App - Simple launcher for agent-world desktop app
 * 
 * Purpose:
 * - Launch the Electron desktop app when running `agent-world` command
 * - Ensures necessary builds exist before launching
 * 
 * Features:
 * - Checks for core build
 * - Launches Electron app
 * - Provides helpful error messages if builds are missing
 * 
 * Implementation Notes:
 * - Used as bin entry point in package.json
 * - Replaces CLI as default when running `agent-world` command
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Check if core build exists
const coreIndexPath = path.join(projectRoot, 'dist', 'core', 'index.js');
if (!fs.existsSync(coreIndexPath)) {
  console.error('Error: Core build not found. Please run: npm run build');
  process.exit(1);
}

// Check if electron directory exists
const electronPath = path.join(projectRoot, 'electron');
if (!fs.existsSync(electronPath)) {
  console.error('Error: Electron app not found.');
  process.exit(1);
}

// Launch Electron app
const electronMainPath = path.join(electronPath, 'main.js');
const electronProcess = spawn('npx', ['electron', electronMainPath], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: { ...process.env }
});

electronProcess.on('error', (error) => {
  console.error('Failed to launch Electron app:', error);
  process.exit(1);
});

electronProcess.on('exit', (code) => {
  process.exit(code || 0);
});
