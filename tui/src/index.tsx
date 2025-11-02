#!/usr/bin/env node

/**
 * Agent World TUI - Entry Point
 * 
 * Terminal User Interface for Agent World using Ink (React for CLIs).
 * Connects to WebSocket server for real-time monitoring and interaction.
 * 
 * Usage:
 *   agent-world-tui --server ws://localhost:3001 --world my-world
 *   agent-world-tui -s ws://localhost:3001 -w my-world --chat chat-123
 * 
 * Created: 2025-11-01 - Phase 1: Core Infrastructure
 * Updated: 2025-11-02 - Migrated from meow to commander.js for consistency
 */

import React from 'react';
import { render } from 'ink';
import { program } from 'commander';
import App from './App.jsx';

program
  .name('agent-world-tui')
  .description('Agent World Terminal User Interface')
  .version('1.0.0')
  .option('-s, --server <url>', 'WebSocket server URL', 'ws://localhost:3001')
  .requiredOption('-w, --world <name>', 'World name or ID')
  .option('-c, --chat <id>', 'Chat ID to load')
  .option('-r, --replay <value>', 'Replay from sequence number or "beginning"', 'beginning')
  .addHelpText('after', `
Examples:
  $ agent-world-tui --server ws://localhost:3001 --world my-world
  $ agent-world-tui -s ws://prod:3001 -w production --chat chat-123
  $ agent-world-tui -w my-world --replay 1500
`)
  .parse();

const options = program.opts();

// Parse replay option
const replayFrom = options.replay === 'beginning' ? 'beginning' : parseInt(options.replay, 10);

render(
  <App
    serverUrl={options.server}
    worldId={options.world}
    chatId={options.chat || null}
    replayFrom={replayFrom}
  />
);
