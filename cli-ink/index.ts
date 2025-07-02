#!/usr/bin/env node
/**
 * CLI Entry Point for Agent World with Dual Mode Support
 *
 * Features:
 * - Pipeline Mode: Process arguments, execute commands, output results, exit
 * - Interactive Mode: Enter Ink-based UI loop with real-time event handling
 * - Mode Detection: Automatic based on argument presence and stdin availability
 * - Shared Command Core: Uses commands/index.ts processInput() for consistency
 * - Context Preservation: Command line context carries into interactive mode
 * - Dual Input Processing: Commands (/) vs Messages (plain text) via shared logic
 *
 * Input Processing:
 * - If input starts with '/': Process as command via handleCommand()
 * - Else: Process as message to world via handleMessagePublish()
 * - Applies to all input sources: --command, args, stdin, interactive
 *
 * Architecture:
 * - Uses commander.js for robust argument parsing
 * - Implements ClientConnection interface for both modes
 * - Pipeline mode: Direct stdout output, no JSON parsing needed
 * - Interactive mode: Parse JSON responses and route to Ink components
 * - Zero code duplication with WebSocket server command execution
 *
 * Usage:
 * Pipeline Mode:
 *   cli-ink --root /data/worlds --world myworld --command "/clear agent1"
 *   echo "Hello agents" | cli-ink --root /data/worlds --world myworld
 *   cli-ink setroot /data/worlds select myworld "/clear agent1" "Hello world" exit
 *
 * Interactive Mode:
 *   cli-ink
 *   cli-ink --root /data/worlds
 *   cli-ink --root /data/worlds --world myworld
 */

import { program } from 'commander';
import React from 'react';
import { render } from 'ink';
import App from './components/App.js';
import { CLIClientConnection } from './transport/cli-client.js';
import { processInput } from '../commands/index.js';
import { getWorld } from '../core/world-manager.js';
import { toKebabCase } from '../core/utils.js';

const DEFAULT_ROOT_PATH = process.env.AGENT_WORLD_DATA_PATH || './data/worlds';

interface CLIOptions {
  root?: string;
  world?: string;
  command?: string;
}

// Pipeline mode: execute commands and exit
async function runPipelineMode(options: CLIOptions, commands: string[]): Promise<void> {
  const rootPath = options.root || DEFAULT_ROOT_PATH;

  // Create simple pipeline client connection
  const client = new CLIClientConnection(false); // pipeline mode = false for Ink

  try {
    // Load world if specified using core (same as WebSocket server)
    let world: any = null;
    if (options.world) {
      const worldId = toKebabCase(options.world);
      world = await getWorld(rootPath, worldId);
      if (!world) {
        console.error(`Error: World '${options.world}' not found`);
        process.exit(1);
      }
    }

    // Execute single command if provided
    if (options.command) {
      const result = await processInput(options.command, world, rootPath, 'HUMAN');
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    }

    // Execute command sequence if provided
    if (commands.length > 0) {
      for (const cmd of commands) {
        if (cmd === 'exit') break;

        const result = await processInput(cmd, world, rootPath, 'HUMAN');
        console.log(`> ${cmd}`);
        console.log(JSON.stringify(result, null, 2));

        if (!result.success) {
          process.exit(1);
        }

        // Refresh world if needed for commands using core (same as WebSocket)
        if (result.refreshWorld && options.world) {
          const worldId = toKebabCase(options.world);
          const refreshedWorld = await getWorld(rootPath, worldId);
          if (refreshedWorld) {
            world = refreshedWorld;
          }
        }
      }
      process.exit(0);
    }

    // Handle stdin input
    if (!process.stdin.isTTY) {
      let input = '';
      process.stdin.setEncoding('utf8');

      for await (const chunk of process.stdin) {
        input += chunk;
      }

      if (input.trim()) {
        const result = await processInput(input.trim(), world, rootPath, 'HUMAN');
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.success ? 0 : 1);
      }
    }

    // If no specific action, show help
    program.help();

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Interactive mode: start Ink UI
async function runInteractiveMode(options: CLIOptions): Promise<void> {
  const rootPath = options.root || DEFAULT_ROOT_PATH;

  try {
    // Render Ink app
    const { waitUntilExit } = render(
      React.createElement(App, {
        initialRootPath: rootPath,
        initialWorldName: options.world
      })
    );

    await waitUntilExit();
  } catch (error) {
    console.error('Error starting interactive mode:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Main CLI entry point
async function main(): Promise<void> {
  program
    .name('cli-ink')
    .description('Agent World CLI with dual mode support')
    .version('1.0.0')
    .option('-r, --root <path>', 'Root path for worlds data', DEFAULT_ROOT_PATH)
    .option('-w, --world <name>', 'World name to connect to')
    .option('-c, --command <cmd>', 'Command to execute in pipeline mode')
    .allowUnknownOption()
    .parse();

  const options = program.opts<CLIOptions>();
  const commands = program.args;

  // Detect mode: pipeline vs interactive
  const isPipelineMode = !!(
    options.command ||
    commands.length > 0 ||
    !process.stdin.isTTY
  );

  if (isPipelineMode) {
    await runPipelineMode(options, commands);
  } else {
    await runInteractiveMode(options);
  }
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

// Run CLI
main().catch((error) => {
  console.error('CLI error:', error);
  process.exit(1);
});
