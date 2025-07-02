#!/usr/bin/env node
/**
 * Agent World CLI Entry Point - Console-Based Display
 * 
 * A dual-mode CLI for Agent World with pipeline and interactive capabilities.
 * Provides console-based interface with real-time streaming, color-coded output,
 * and seamless world management.
 *
 * FEATURES:
 * - Pipeline Mode: Execute commands and exit (--command, args, stdin)
 * - Interactive Mode: Real-time console interface with streaming responses
 * - Dual Input Processing: Commands (/) vs Messages (plain text)
 * - World Management: Auto-discovery and interactive selection
 * - Real-time Streaming: Live agent responses with visual feedback
 * - Color Helpers: Consistent styling with simplified color functions
 * - Timer Management: Smart prompt restoration after streaming
 * - Event Handling: Comprehensive world event listeners with filtering
 *
 * ARCHITECTURE:
 * - Uses commander.js for argument parsing and mode detection
 * - Shares command processing logic with WebSocket server (commands/index.ts)
 * - Uses readline for interactive input with proper cleanup
 * - Implements streaming display with real-time chunk accumulation
 *
 * USAGE:
 * Pipeline: cli --root /data/worlds --world myworld --command "/clear agent1"
 * Interactive: cli --root /data/worlds --world myworld
 */

import { program } from 'commander';
import readline from 'readline';
import { CLIClientConnection } from './transport/cli-client.js';
import { processInput } from '../commands/index.js';
import { getWorld } from '../core/world-manager.js';
import { toKebabCase } from '../core/utils.js';
import { World } from '../core/types.js';
import fs from 'fs';
import path from 'path';

// Color helper functions - simplified API
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const blue = (text: string) => `\x1b[34m${text}\x1b[0m`;
const magenta = (text: string) => `\x1b[35m${text}\x1b[0m`;
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;
const gray = (text: string) => `\x1b[90m${text}\x1b[0m`;
const bold = (text: string) => `\x1b[1m${text}\x1b[0m`;

// Combined styles for common patterns
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
  const client = new CLIClientConnection(false);

  try {
    let world: any = null;
    if (options.world) {
      const worldId = toKebabCase(options.world);
      world = await getWorld(rootPath, worldId);
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
      const result = await processInput(options.command, world, rootPath, 'HUMAN');
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    }

    // Execute command sequence
    if (commands.length > 0) {
      for (const cmd of commands) {
        if (cmd === 'exit') break;
        const result = await processInput(cmd, world, rootPath, 'HUMAN');
        console.log(`> ${cmd}`);
        console.log(JSON.stringify(result, null, 2));
        if (!result.success) process.exit(1);

        // Refresh world if needed
        if (result.refreshWorld && options.world) {
          const refreshedWorld = await getWorld(rootPath, toKebabCase(options.world));
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
        const result = await processInput(input.trim(), world, rootPath, 'HUMAN');
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
  world: World;
  worldEventListeners: Map<string, (...args: any[]) => void>;
}

interface StreamingState {
  isActive: boolean;
  content: string;
  sender?: string;
  messageId?: string;
}

interface GlobalState {
  promptTimer?: ReturnType<typeof setTimeout>;
}

// Timer management - integrated clearing
function setupPromptTimer(globalState: GlobalState, rl: readline.Interface, callback: () => void, delay: number = 2000): void {
  if (globalState.promptTimer) {
    clearTimeout(globalState.promptTimer);
    globalState.promptTimer = undefined;
  }
  globalState.promptTimer = setTimeout(callback, delay);
}

function clearPromptTimer(globalState: GlobalState): void {
  if (globalState.promptTimer) {
    clearTimeout(globalState.promptTimer);
    globalState.promptTimer = undefined;
  }
}

// World subscription cleanup
function cleanupWorldSubscription(worldState: WorldState | null): void {
  if (worldState?.world && worldState?.worldEventListeners) {
    for (const [eventName, listener] of worldState.worldEventListeners) {
      worldState.world.eventEmitter.off(eventName, listener);
    }
    worldState.worldEventListeners.clear();
  }
}

// Event listeners for world events with streaming support
function setupWorldEventListeners(
  world: World,
  streaming: { current: StreamingState },
  globalState: GlobalState,
  rl?: readline.Interface
): Map<string, (...args: any[]) => void> {
  const worldEventListeners = new Map<string, (...args: any[]) => void>();

  const handler = (eventType: string) => (eventData: any) => {
    // Skip user messages to prevent echo
    if (eventData.sender && (eventData.sender === 'HUMAN' || eventData.sender === 'CLI' || eventData.sender.startsWith('user'))) {
      return;
    }

    // Handle streaming events
    if (eventType === 'sse') {
      if (eventData.type === 'chunk' && eventData.content) {
        if (!streaming.current.isActive) {
          streaming.current.isActive = true;
          streaming.current.content = '';
          streaming.current.sender = eventData.agentName || eventData.sender;
          streaming.current.messageId = eventData.messageId;
          console.log(`\n${boldGreen(`● ${streaming.current.sender}`)} ${gray('is responding...')}`);
          clearPromptTimer(globalState);
        }

        if (streaming.current.messageId === eventData.messageId) {
          streaming.current.content += eventData.content;
          process.stdout.write(eventData.content);

          if (rl) {
            setupPromptTimer(globalState, rl, () => {
              if (streaming.current.isActive) {
                console.log(`\n${gray('Streaming appears stalled - waiting for user input...')}`);
                streaming.current.isActive = false;
                streaming.current.content = '';
                streaming.current.messageId = undefined;
                rl.prompt();
              }
            }, 500);
          }
        }
        return;
      } else if (eventData.type === 'end') {
        if (streaming.current.isActive && streaming.current.messageId === eventData.messageId) {
          console.log('\n');
          streaming.current.isActive = false;
          streaming.current.content = '';
          streaming.current.messageId = undefined;

          if (rl) {
            clearPromptTimer(globalState);
            setupPromptTimer(globalState, rl, () => rl.prompt(), 2000);
          }
        }
        return;
      } else if (eventData.type === 'error') {
        if (streaming.current.isActive && streaming.current.messageId === eventData.messageId) {
          console.log(error(`Stream error: ${eventData.error || eventData.message}`));
          streaming.current.isActive = false;
          streaming.current.content = '';
          streaming.current.messageId = undefined;

          if (rl) {
            clearPromptTimer(globalState);
            setupPromptTimer(globalState, rl, () => rl.prompt(), 2000);
          }
        }
        return;
      }
    }

    // Filter out success messages and display system events
    if (eventData.content && eventData.content.includes('Success message sent')) return;

    if ((eventType === 'system' || eventType === 'world') && eventData.message) {
      console.log(`\n${boldRed('● system:')} ${eventData.message}`);
    }
  };

  // Set up listeners for all event types
  const eventTypes = ['system', 'world', 'message', 'sse'];
  for (const eventType of eventTypes) {
    const eventHandler = handler(eventType);
    world.eventEmitter.on(eventType, eventHandler);
    worldEventListeners.set(eventType, eventHandler);
  }

  return worldEventListeners;
}

// World subscription handler
async function handleSubscribe(
  rootPath: string,
  worldName: string,
  streaming: { current: StreamingState },
  globalState: GlobalState,
  rl?: readline.Interface
): Promise<WorldState | null> {
  const world = await getWorld(rootPath, toKebabCase(worldName));
  if (!world) throw new Error('Failed to load world');

  const worldEventListeners = setupWorldEventListeners(world, streaming, globalState, rl);
  return { world, worldEventListeners };
}

// World discovery and selection
async function listAvailableWorlds(rootPath: string): Promise<string[]> {
  try {
    if (!fs.existsSync(rootPath)) return [];
    const items = fs.readdirSync(rootPath, { withFileTypes: true });
    return items
      .filter(item => item.isDirectory() && !item.name.startsWith('.'))
      .map(item => item.name);
  } catch (error) {
    console.error('Error listing worlds:', error);
    return [];
  }
}

async function selectWorld(rootPath: string, rl: readline.Interface): Promise<string | null> {
  const worlds = await listAvailableWorlds(rootPath);

  if (worlds.length === 0) {
    console.log(boldRed(`No worlds found in ${rootPath}`));
    return null;
  }

  if (worlds.length === 1) {
    console.log(`${boldGreen('Auto-selecting the only available world:')} ${cyan(worlds[0])}`);
    return worlds[0];
  }

  console.log(`\n${boldMagenta('Available worlds:')}`);
  worlds.forEach((world, index) => {
    console.log(`  ${yellow(`${index + 1}.`)} ${cyan(world)}`);
  });

  return new Promise((resolve) => {
    const askForSelection = () => {
      rl.question(`\n${boldMagenta('Select a world (number or name):')} `, (answer) => {
        const trimmed = answer.trim();
        const num = parseInt(trimmed);

        if (!isNaN(num) && num >= 1 && num <= worlds.length) {
          resolve(worlds[num - 1]);
          return;
        }

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
    };
    askForSelection();
  });
}

// Interactive mode: console-based interface
async function runInteractiveMode(options: CLIOptions): Promise<void> {
  const rootPath = options.root || DEFAULT_ROOT_PATH;
  const streaming = { current: { isActive: false, content: '', sender: undefined, messageId: undefined } };
  const globalState: GlobalState = {};

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
        const result = await processInput(trimmedInput, worldState?.world || null, rootPath, 'HUMAN');

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
        if (!streaming.current.isActive) {
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

// Error handling
process.on('unhandledRejection', (error) => {
  console.error(boldRed('Unhandled rejection:'), error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(boldRed('Uncaught exception:'), error);
  process.exit(1);
});

// Run CLI
main().catch((error) => {
  console.error(boldRed('CLI error:'), error);
  process.exit(1);
});
