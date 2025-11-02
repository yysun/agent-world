#!/usr/bin/env node

/**
 * TUI Entry Point
 * 
 * Features:
 * - World selection with CLI-style colors (cyan, yellow, magenta)
 * - WebSocket connection to Agent World server
 * - Ink-based terminal UI
 * - Command-line options for server URL, world, chat, replay
 * - Server availability check before starting
 * 
 * Created: 2025-11-01 - Phase 1: Core Infrastructure
 * Updated: 2025-11-02 - Add colored world selection matching CLI
 */

import React from 'react';
import { render } from 'ink';
import { program } from 'commander';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import http from 'http';
import App from './App.jsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

program
  .name('agent-world-tui')
  .description('Agent World Terminal User Interface')
  .version('1.0.0')
  .option('-s, --server <url>', 'WebSocket server URL', 'ws://localhost:3001')
  .option('-w, --world <name>', 'World name or ID (prompts if not specified)')
  .option('-c, --chat <id>', 'Chat ID to load')
  .option('-r, --replay <value>', 'Replay from sequence number or "beginning"', 'beginning')
  .addHelpText('after', `
Examples:
  $ agent-world-tui                                           # Select world interactively
  $ agent-world-tui --world my-world                          # Connect to specific world
  $ agent-world-tui -s ws://localhost:3001 -w my-world
  $ agent-world-tui -s ws://prod:3001 -w production --chat chat-123
  $ agent-world-tui -w my-world --replay 1500
`)
  .parse();

const options = program.opts();

// Parse replay option
const replayFrom = options.replay === 'beginning' ? 'beginning' : parseInt(options.replay, 10);

async function selectWorld(): Promise<string | null> {
  console.log('Discovering available worlds...');

  try {
    // Dynamic import from core package (runtime only)
    const corePath = resolve(__dirname, '../../core/index.js');
    const { listWorlds } = await import(corePath);

    const worlds = await listWorlds();

    if (worlds.length === 0) {
      console.error('No worlds found. Please create a world first.');
      return null;
    }

    if (worlds.length === 1) {
      console.log(`\x1b[1m\x1b[32mAuto-selecting the only available world:\x1b[0m \x1b[36m${worlds[0].name}\x1b[0m`);
      return worlds[0].name;
    }

    // Multiple worlds - show selection
    console.log('\n\x1b[1m\x1b[35mAvailable worlds:\x1b[0m');
    console.log(`  \x1b[33m0.\x1b[0m \x1b[36mExit\x1b[0m`);
    worlds.forEach((world: any, index: number) => {
      console.log(`  \x1b[33m${index + 1}.\x1b[0m \x1b[36m${world.name}\x1b[0m`);
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('\n\x1b[1m\x1b[35mSelect a world (number or name), or 0 to exit:\x1b[0m ', (answer) => {
        rl.close();

        const trimmed = answer.trim();
        const num = parseInt(trimmed);

        if (num === 0) {
          console.log('Exiting.');
          resolve(null);
          return;
        }

        if (!isNaN(num) && num >= 1 && num <= worlds.length) {
          resolve(worlds[num - 1].name);
          return;
        }

        const found = worlds.find((w: any) =>
          w.name.toLowerCase() === trimmed.toLowerCase() ||
          w.id.toLowerCase() === trimmed.toLowerCase()
        );

        if (found) {
          resolve(found.name);
        } else {
          console.error('Invalid selection.');
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.error('Error listing worlds:', error);
    return null;
  }
}

async function main() {
  let worldId = options.world;

  // If world is not specified, prompt for selection
  if (!worldId) {
    worldId = await selectWorld();
    if (!worldId) {
      process.exit(1);
    }
  }

  // Check if WebSocket server is running
  const serverUrl = options.server;
  const isRunning = await checkServerAvailability(serverUrl);

  if (!isRunning) {
    console.error(`\n❌ WebSocket server at ${serverUrl} is not available.`);
    console.error('\nPlease start the server first in another terminal:');
    console.error('  npm run ws:watch\n');
    process.exit(1);
  }

  startTUI(serverUrl, worldId, options.chat, replayFrom);
}

/**
 * Check if WebSocket server is available
 */
async function checkServerAvailability(wsUrl: string): Promise<boolean> {
  // Parse WebSocket URL to get host and port
  const url = new URL(wsUrl);
  const port = parseInt(url.port || '3001');
  const hostname = url.hostname || 'localhost';

  return new Promise((resolve) => {
    const req = http.get(`http://${hostname}:${port}/health`, { timeout: 2000 }, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function startTUI(serverUrl: string, worldId: string, chatId: string | null, replayFrom: 'beginning' | number) {
  render(
    <App
      serverUrl={serverUrl}
      worldId={worldId}
      chatId={chatId}
      replayFrom={replayFrom}
    />
  );
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

