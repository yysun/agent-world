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
 */

import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import App from './App.jsx';

const cli = meow(`
  Usage
    $ agent-world-tui --server <url> --world <name>

  Options
    --server, -s  WebSocket server URL (default: ws://localhost:3001)
    --world, -w   World name or ID (required)
    --chat, -c    Chat ID to load (optional)
    --replay      Replay from sequence number or 'beginning' (default: beginning)
    --help        Show this help message

  Examples
    $ agent-world-tui --server ws://localhost:3001 --world my-world
    $ agent-world-tui -s ws://prod:3001 -w production --chat chat-123
    $ agent-world-tui -w my-world --replay 1500
`, {
  importMeta: import.meta,
  flags: {
    server: {
      type: 'string',
      alias: 's',
      default: 'ws://localhost:3001'
    },
    world: {
      type: 'string',
      alias: 'w',
      isRequired: true
    },
    chat: {
      type: 'string',
      alias: 'c'
    },
    replay: {
      type: 'string',
      default: 'beginning'
    }
  }
});

// Parse replay option
const replayFrom = cli.flags.replay === 'beginning' ? 'beginning' : parseInt(cli.flags.replay, 10);

render(
  <App
    serverUrl={cli.flags.server}
    worldId={cli.flags.world}
    chatId={cli.flags.chat || null}
    replayFrom={replayFrom}
  />
);
