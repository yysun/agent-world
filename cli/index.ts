#!/usr/bin/env node
/**
 * Agent World CLI Entry Point - Console-Based Display
 * 
 * A dual-mode CLI for Agent World with pipeline and interactive capabilities.
 * Provides console-based interface with real-time streaming, color-coded output,
 * and seamless world management through commands layer integration.
 *
 * FEATURES:
 * - Pipeline Mode: Execute commands and exit (--command, args, stdin)
 * - Interactive Mode: Real-time console interface with streaming responses
 * - Dual Input Processing: Commands (/) vs Messages (plain text)
 * - World Management: Auto-discovery and interactive selection
 * - Real-time Streaming: Live agent responses via stream.ts module
 * - Color Helpers: Consistent styling with simplified color functions
 * - Timer Management: Smart prompt restoration after streaming
 * - Event Handling: Comprehensive world event listeners with filtering
 *
 * ARCHITECTURE:
 * - Uses commander.js for argument parsing and mode detection
 * - Uses commands layer for all world management (subscribeWorld, getWorld)
 * - Implements ClientConnection interface for console-based event handling
 * - Uses readline for interactive input with proper cleanup
 * - Delegates streaming display to stream.ts module for real-time chunk accumulation
 * - No direct core layer dependencies - all through commands layer
 *
 * USAGE:
 * Pipeline: cli --root /data/worlds --world myworld --command "/clear agent1"
 * Interactive: cli --root /data/worlds --world myworld
 *
 * CHANGES:
 * - Integrated commands layer subscribeWorld() for centralized world management
 * - Implemented CLI-specific ClientConnection with console event handling
 * - Removed direct core dependencies (getWorld, toKebabCase)
 * - Extracted streaming functionality to stream.ts module for better modularity
 * - Maintained all existing functionality and user experience
 * - Added proper world subscription lifecycle management
 */

import { program } from 'commander';
import readline from 'readline';
import { subscribeWorld } from '../core/index.js';
import { getWorld, listWorlds } from '../core/world-manager.js';
import { World } from '../core/types.js';
import { processCLIInput } from './commands.js';
import { ClientConnection } from '../core/subscription.js';
import {
  StreamingState,
  GlobalState,
  createStreamingState,
  createGlobalState,
  setupPromptTimer,
  clearPromptTimer,
  handleWorldEventWithStreaming,
  isStreamingActive
} from './stream.js';

// Color helper functions - consolidated API
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const blue = (text: string) => `\x1b[34m${text}\x1b[0m`;
const magenta = (text: string) => `\x1b[35m${text}\x1b[0m`;
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;
const gray = (text: string) => `\x1b[90m${text}\x1b[0m`;
const bold = (text: string) => `\x1b[1m${text}\x1b[0m`;

// Combined styles
const boldRed = (text: string) => `\x1b[1m\x1b[31m${text}\x1b[0m`;
const boldGreen = (text: string) => `\x1b[1m\x1b[32m${text}\x1b[0m`;
const boldYellow = (text: string) => `\x1b[1m\x1b[33m${text}\x1b[0m`;
const boldBlue = (text: string) => `\x1b[1m\x1b[34m${text}\x1b[0m`;
const boldMagenta = (text: string) => `\x1b[1m\x1b[35m${text}\x1b[0m`;
const boldCyan = (text: string) => `\x1b[1m\x1b[36m${text}\x1b[0m`;

// Semantic helpers
const success = (text: string) => `${boldGreen('✓')} ${text}`;
const error = (text: string) => `${boldRed('✗')} ${text}`;
const bullet = (text: string) => `${gray('•')} ${text}`;

const DEFAULT_ROOT_PATH = process.env.AGENT_WORLD_DATA_PATH || './data/worlds';

interface CLIOptions {
  root?: string;
  world?: string;
  command?: string;
}

// Pipeline mode: execute commands and exit
async function runPipelineMode(options: CLIOptions, commands: string[]): Promise<void> {
  const rootPath = options.root || DEFAULT_ROOT_PATH;

  try {
    let world: World | null = null;
    if (options.world) {
      world = await getWorld(options.world, rootPath);
      if (!world) {
        console.error(boldRed(`Error: World '${options.world}' not found`));
        process.exit(1);
      }
    }

    // Execute single command
    if (options.command) {
      if (!options.command.startsWith('/') && !world) {
        console.error(boldRed('Error: World must be specified to send user messages'));
        process.exit(1);
      }
      const result = await processCLIInput(options.command, world, rootPath, 'HUMAN');
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    }

    // Execute command sequence
    if (commands.length > 0) {
      for (const cmd of commands) {
        if (cmd === 'exit') break;
        const result = await processCLIInput(cmd, world, rootPath, 'HUMAN');
        console.log(`> ${cmd}`);
        console.log(JSON.stringify(result, null, 2));
        if (!result.success) process.exit(1);

        // Refresh world if needed
        if (result.refreshWorld && options.world) {
          const refreshedWorld = await getWorld(options.world, rootPath);
          if (refreshedWorld) world = refreshedWorld;
        }
      }
      process.exit(0);
    }

    // Handle stdin input
    if (!process.stdin.isTTY) {
      let input = '';
      process.stdin.setEncoding('utf8');
      for await (const chunk of process.stdin) input += chunk;

      if (input.trim()) {
        if (!world) {
          console.error(boldRed('Error: World must be specified to send user messages'));
          process.exit(1);
        }
        const result = await processCLIInput(input.trim(), world, rootPath, 'HUMAN');
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.success ? 0 : 1);
      }
    }

    program.help();
  } catch (error) {
    console.error(boldRed('Error:'), error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

interface WorldState {
  subscription: any; // WorldSubscription from commands layer
  world: World;
}

function cleanupWorldSubscription(worldState: WorldState | null): void {
  if (worldState?.subscription) {
    worldState.subscription.unsubscribe();
  }
}

// Event listeners for world events are now handled in commands layer

// World subscription handler
async function handleSubscribe(
  rootPath: string,
  worldName: string,
  streaming: { current: StreamingState },
  globalState: GlobalState,
  rl?: readline.Interface
): Promise<WorldState | null> {
  // Create CLI client connection
  const cliClient: ClientConnection = {
    send: (data: string) => {
      // CLI doesn't need to send data back, but we implement for interface compliance
    },
    isOpen: true,
    onWorldEvent: (eventType: string, eventData: any) => {
      // Handle world events - use existing event handling logic
      handleWorldEvent(eventType, eventData, streaming, globalState, rl);
    },
    onError: (error: string) => {
      console.log(red(`Error: ${error}`));
    }
  };

  const subscription = await subscribeWorld(worldName, rootPath, cliClient);
  if (!subscription) throw new Error('Failed to load world');

  return { subscription, world: subscription.world };
}

// Handle world events with streaming support
function handleWorldEvent(
  eventType: string,
  eventData: any,
  streaming: { current: StreamingState },
  globalState: GlobalState,
  rl?: readline.Interface
): void {
  // Try streaming event handling first
  if (handleWorldEventWithStreaming(eventType, eventData, streaming, globalState, rl)) {
    return;
  }

  // Filter out success messages and display system events
  if (eventData.content && eventData.content.includes('Success message sent')) return;

  if ((eventType === 'system' || eventType === 'world') && eventData.message) {
    console.log(`\n${boldRed('● system:')} ${eventData.message}`);
  }
}

// World discovery and selection using core functions
async function getAvailableWorldNames(rootPath: string): Promise<string[]> {
  try {
    const worldInfos = await listWorlds(rootPath);
    return worldInfos.map(info => info.id);
  } catch (error) {
    console.error('Error listing worlds:', error);
    return [];
  }
}

async function selectWorld(rootPath: string, rl: readline.Interface): Promise<string | null> {
  const worlds = await getAvailableWorldNames(rootPath);

  if (worlds.length === 0) {
    console.log(boldRed(`No worlds found in ${rootPath}`));
    return null;
  }

  // Auto-select if there's only one world
  if (worlds.length === 1) {
    console.log(`${boldGreen('Auto-selecting the only available world:')} ${cyan(worlds[0])}`);
    return worlds[0];
  }

  // Display available worlds for selection
  console.log(`\n${boldMagenta('Available worlds:')}`);
  worlds.forEach((world, index) => {
    console.log(`  ${yellow(`${index + 1}.`)} ${cyan(world)}`);
  });

  // Process world selection
  return new Promise((resolve) => {
    function askForSelection() {
      rl.question(`\n${boldMagenta('Select a world (number or name):')} `, (answer) => {
        const trimmed = answer.trim();
        const num = parseInt(trimmed);

        // Try to match by number
        if (!isNaN(num) && num >= 1 && num <= worlds.length) {
          resolve(worlds[num - 1]);
          return;
        }

        // Try to match by name
        const found = worlds.find(world =>
          world.toLowerCase() === trimmed.toLowerCase() ||
          world.toLowerCase().includes(trimmed.toLowerCase())
        );

        if (found) {
          resolve(found);
          return;
        }

        console.log(boldRed('Invalid selection. Please try again.'));
        askForSelection();
      });
    }

    askForSelection();
  });
}

// Interactive mode: console-based interface
async function runInteractiveMode(options: CLIOptions): Promise<void> {
  const rootPath = options.root || DEFAULT_ROOT_PATH;
  const streaming = { current: createStreamingState() };
  const globalState: GlobalState = createGlobalState();

  console.log(boldCyan('Agent World CLI (Interactive Mode)'));
  console.log(cyan('===================================='));

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  let worldState: WorldState | null = null;
  let currentWorldName = '';

  try {
    // Load initial world or prompt for selection
    if (options.world) {
      console.log(`\n${boldBlue(`Loading world: ${options.world}`)}`);
      try {
        worldState = await handleSubscribe(rootPath, options.world, streaming, globalState, rl);
        currentWorldName = options.world;
        console.log(success(`Connected to world: ${currentWorldName}`));

        if (worldState?.world) {
          console.log(`${gray('Agents:')} ${yellow(String(worldState.world.agents?.size || 0))} ${gray('| Turn Limit:')} ${yellow(String(worldState.world.turnLimit || 'N/A'))}`);
        }
      } catch (error) {
        console.error(error(`Error loading world: ${error instanceof Error ? error.message : 'Unknown error'}`));
        process.exit(1);
      }
    } else {
      console.log(`\n${boldBlue('Discovering available worlds...')}`);
      const selectedWorld = await selectWorld(rootPath, rl);

      if (!selectedWorld) {
        console.log(error('No world selected. Exiting.'));
        rl.close();
        return;
      }

      console.log(`\n${boldBlue(`Loading world: ${selectedWorld}`)}`);
      try {
        worldState = await handleSubscribe(rootPath, selectedWorld, streaming, globalState, rl);
        currentWorldName = selectedWorld;
        console.log(success(`Connected to world: ${currentWorldName}`));

        if (worldState?.world) {
          console.log(`${gray('Agents:')} ${yellow(String(worldState.world.agents?.size || 0))} ${gray('| Turn Limit:')} ${yellow(String(worldState.world.turnLimit || 'N/A'))}`);
        }
      } catch (error) {
        console.error(error(`Error loading world: ${error instanceof Error ? error.message : 'Unknown error'}`));
        rl.close();
        return;
      }
    }

    // Show usage tips
    console.log(`\n${gray('Tips:')}`);
    console.log(`  ${bullet(gray('Type commands like:'))} ${cyan('/clear agent1')}, ${cyan('/addagent MyAgent')}`);
    console.log(`  ${bullet(gray('Type messages to send to agents'))}`);
    console.log(`  ${bullet(gray('Press'))} ${boldYellow('Ctrl+C')} ${gray('to exit')}`);
    console.log('');

    // Set up command processing
    rl.prompt();

    rl.on('line', async (input) => {
      const trimmedInput = input.trim();

      if (!trimmedInput) {
        rl.prompt();
        return;
      }

      // Display user input
      console.log(`\n${boldYellow('● you:')} ${trimmedInput}`);

      try {
        const result = await processCLIInput(trimmedInput, worldState?.world || null, rootPath, 'HUMAN');

        // Display result (skip user message confirmations)
        if (result.success === false) {
          console.log(error(`Error: ${result.error || result.message || 'Command failed'}`));
        } else if (result.message &&
          !result.message.includes('Success message sent') &&
          !result.message.includes('Message sent to world')) {
          console.log(success(result.message));
        }

        // Skip showing data for user messages (they contain sender: HUMAN)
        if (result.data && !(result.data.sender === 'HUMAN')) {
          console.log(`${boldMagenta('Data:')} ${JSON.stringify(result.data, null, 2)}`);
        }

        // Refresh world if needed
        if (result.refreshWorld && currentWorldName && worldState) {
          try {
            console.log(boldBlue('Refreshing world state...'));
            cleanupWorldSubscription(worldState);
            worldState = await handleSubscribe(rootPath, currentWorldName, streaming, globalState, rl);
            console.log(success('World state refreshed'));
          } catch (error) {
            console.error(error(`Error refreshing world: ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        }

      } catch (error) {
        console.error(error(`Command error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }

      // Set up timer after user input to allow for streaming or other events
      setupPromptTimer(globalState, rl, () => {
        if (!isStreamingActive(streaming)) {
          rl.prompt();
        }
      }, 5000); // Brief delay to allow for streaming to start
    });

    rl.on('close', () => {
      console.log(`\n${boldCyan('Goodbye!')}`);
      if (worldState) {
        clearPromptTimer(globalState);
        cleanupWorldSubscription(worldState);
      }
      process.exit(0);
    });

    // Handle Ctrl+C gracefully
    rl.on('SIGINT', () => {
      console.log(`\n${boldCyan('Goodbye!')}`);
      if (worldState) {
        clearPromptTimer(globalState);
        cleanupWorldSubscription(worldState);
      }
      rl.close();
    });

  } catch (error) {
    console.error(boldRed('Error starting interactive mode:'), error instanceof Error ? error.message : error);
    rl.close();
    process.exit(1);
  }
}

// Main CLI entry point
async function main(): Promise<void> {
  program
    .name('cli')
    .description('Agent World CLI')
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

// Global error handling and CLI initialization
function setupErrorHandlers() {
  process.on('unhandledRejection', (error) => {
    console.error(boldRed('Unhandled rejection:'), error);
    process.exit(1);
  });

  process.on('uncaughtException', (error) => {
    console.error(boldRed('Uncaught exception:'), error);
    process.exit(1);
  });
}

// Set up error handlers and run CLI
setupErrorHandlers();
main().catch((error) => {
  console.error(boldRed('CLI error:'), error);
  process.exit(1);
});
