#!/usr/bin/env node
/**
 * Agent World Start Script
 *
 * Features:
 * - Ensures required data and environment files exist before starting the server.
 * - If 'data' folder is missing, copies 'data-examples' to 'data'.
 * - If '.env' file is missing, copies '.env.example' to '.env'.
 * - Launches 'npx tsx server/index.ts' as a child process.
 *
 * Implementation:
 * Uses Node.js fs and child_process modules for file/folder checks and copying.
 */


import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';


const cwd = process.cwd();
const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const dataDir = path.join(cwd, 'data');
const dataExamplesDir = path.join(scriptDir, 'data-examples');
const envFile = path.join(cwd, '.env');
const envExampleFile = path.join(scriptDir, '.env.example');
const server = path.join(scriptDir, 'server', 'index.ts');

// Helper to copy folders recursively
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 1. Ensure 'data' folder exists
if (!fs.existsSync(dataDir)) {
  if (fs.existsSync(dataExamplesDir)) {
    console.log("[start.js] 'data' folder not found. Copying 'data-examples' to 'data'...");
    copyDirSync(dataExamplesDir, dataDir);
  } else {
    console.error("[start.js] ERROR: 'data-examples' folder not found. Cannot create 'data' folder.");
    process.exit(1);
  }
}

// 2. Ensure '.env' file exists
if (!fs.existsSync(envFile)) {
  if (fs.existsSync(envExampleFile)) {
    console.log("[start.js] '.env' not found. Copying '.env.example' to '.env'...");
    fs.copyFileSync(envExampleFile, envFile);
  } else {
    console.error("[start.js] ERROR: '.env.example' not found. Cannot create '.env'.");
    process.exit(1);
  }
}

// 3. Launch 'npm run server'
console.log("[start.js] Launching 'npm run server'...");
const child = spawn('npx', ['tsx', server], { stdio: 'inherit', shell: true });
child.on('exit', code => {
  process.exit(code);
});

