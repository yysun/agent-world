#!/usr/bin/env node
/**
 * Agent World CLI Entry Point - Dual-Mode Console Interface
 * 
 * Provides pipeline and interactive modes with unified subscription system,
 * real-time streaming, and comprehensive world management.
 *
 * FEATURES:
 * - Pipeline Mode: Execute commands and exit with timer-based cleanup
 * - Interactive Mode: Real-time console interface with streaming responses
 * - Unified Subscription: Both modes use subscribeWorld for consistent event handling
 * - World Management: Auto-discovery and interactive selection
 * - Real-time Streaming: Live agent responses via stream.ts module
 * - Color Helpers: Consistent styling with simplified color functions
 * - Timer Management: Smart prompt restoration and exit handling
 *
 * ARCHITECTURE:
 * - Uses commander.js for argument parsing and mode detection
 * - Uses subscribeWorld for all world management in both modes
 * - Implements ClientConnection interface for console-based event handling
 * - Uses readline for interactive input with proper cleanup
 * - Delegates streaming display to stream.ts module for real-time chunk accumulation
 *
 * USAGE:
 * Pipeline: cli --root /data/worlds --world myworld --command "/clear agent1"
 * Pipeline: cli --root /data/worlds --world myworld "Hello, world!"
 * Pipeline: echo "Hello, world!" | cli --root /data/worlds --world myworld
 * Interactive: cli --root /data/worlds --world myworld
 */

import { program } from 'commander';
import readline from 'readline';
import { listWorlds, subscribeWorld, World, ClientConnection } from '../core/index.js';
import { processCLIInput } from './commands.js';
import {
  StreamingState,
  createStreamingState,
  handleWorldEventWithStreaming,
  isStreamingActive
} from './stream.js';

// Timer management for prompt restoration
interface GlobalState {
  promptTimer?: ReturnType<typeof setTimeout>;
}

function setupPromptTimer(
  globalState: GlobalState,
  rl: readline.Interface,
  callback: () => void,
  delay: number = 2000
): void {
  clearPromptTimer(globalState);
  globalState.promptTimer = setTimeout(callback, delay);
}

function clearPromptTimer(globalState: GlobalState): void {
  if (globalState.promptTimer) {
    clearTimeout(globalState.promptTimer);
    globalState.promptTimer = undefined;
  }
}

function createGlobalState(): GlobalState {
  return {};
}

// Color helpers - consolidated styling API
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const blue = (text: string) => `\x1b[34m${text}\x1b[0m`;
const magenta = (text: string) => `\x1b[35m${text}\x1b[0m`;
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;
const gray = (text: string) => `\x1b[90m${text}\x1b[0m`;
const bold = (text: string) => `\x1b[1m${text}\x1b[0m`;

const boldRed = (text: string) => `\x1b[1m\x1b[31m${text}\x1b[0m`;
const boldGreen = (text: string) => `\x1b[1m\x1b[32m${text}\x1b[0m`;
const boldYellow = (text: string) => `\x1b[1m\x1b[33m${text}\x1b[0m`;
const boldBlue = (text: string) => `\x1b[1m\x1b[34m${text}\x1b[0m`;
const boldMagenta = (text: string) => `\x1b[1m\x1b[35m${text}\x1b[0m`;
const boldCyan = (text: string) => `\x1b[1m\x1b[36m${text}\x1b[0m`;

const success = (text: string) => `${boldGreen('✓')} ${text}`;
const error = (text: string) => `${boldRed('✗')} ${text}`;
const bullet = (text: string) => `${gray('•')} ${text}`;

const DEFAULT_ROOT_PATH = process.env.AGENT_WORLD_DATA_PATH || './data/worlds';

interface CLIOptions {
  root?: string;
  world?: string;
  command?: string;
}

// Pipeline mode execution with timer-based cleanup
async function runPipelineMode(options: CLIOptions, messageFromArgs: string | null): Promise<void> {
  const rootPath = options.root || DEFAULT_ROOT_PATH;

  try {
    let world: World | null = null;
    let worldSubscription: any = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const pipelineClient: ClientConnection = {
      send: (data: string) => { },
      isOpen: true,
      onWorldEvent: (eventType: string, eventData: any) => {
        if (eventData.content && eventData.content.includes('Success message sent')) return;

        if ((eventType === 'system' || eventType === 'world') && eventData.message) {
          console.log(`${boldRed('● system:')} ${eventData.message}`);
        }

        if (eventType === 'sse' && eventData.content) {
          setupExitTimer(5000);
        }

        if (eventType === 'message' && eventData.content) {
          console.log(`${boldGreen('● ' + (eventData.sender || 'agent') + ':')} ${eventData.content}`);
          setupExitTimer(3000);
        }
      },
      onError: (error: string) => {
        console.log(red(`Error: ${error}`));
      }
    };

    const setupExitTimer = (delay: number = 2000) => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (worldSubscription) worldSubscription.unsubscribe();
        process.exit(0);
      }, delay);
    };

    if (options.world) {
      worldSubscription = await subscribeWorld(options.world, rootPath, pipelineClient);
      if (!worldSubscription) {
        console.error(boldRed(`Error: World '${options.world}' not found`));
        process.exit(1);
      }
      world = worldSubscription.world;
    }

    // Execute command from --command option
    if (options.command) {
      if (!options.command.startsWith('/') && !world) {
        console.error(boldRed('Error: World must be specified to send user messages'));
        process.exit(1);
      }
      const result = await processCLIInput(options.command, world, rootPath, 'HUMAN');
      console.log(JSON.stringify(result, null, 2));

      // Only set timer if sending message to world (not for commands)
      if (!options.command.startsWith('/') && world) {
        setupExitTimer();
      } else {
        // For commands, exit immediately after processing
        if (worldSubscription) worldSubscription.unsubscribe();
        process.exit(result.success ? 0 : 1);
      }

      if (!result.success) {
        setTimeout(() => process.exit(1), 100);
        return;
      }
    }

    // Execute message from args
    if (messageFromArgs) {
      if (!world) {
        console.error(boldRed('Error: World must be specified to send user messages'));
        process.exit(1);
      }
      const result = await processCLIInput(messageFromArgs, world, rootPath, 'HUMAN');
      console.log(JSON.stringify(result, null, 2));

      // Set timer with longer delay for message processing (always needed for messages)
      setupExitTimer(8000);

      if (!result.success) {
        setTimeout(() => process.exit(1), 100);
        return;
      }
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

        // Set timer with longer delay for message processing (always needed for stdin messages)
        setupExitTimer(8000);

        if (!result.success) {
          setTimeout(() => process.exit(1), 100);
          return;
        }
        return;
      }
    }

    if (!options.command && !messageFromArgs) {
      program.help();
    }
  } catch (error) {
    console.error(boldRed('Error:'), error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

interface WorldState {
  subscription: any;
  world: World;
}

function cleanupWorldSubscription(worldState: WorldState | null): void {
  if (worldState?.subscription) {
    worldState.subscription.unsubscribe();
  }
}

// World subscription handler
async function handleSubscribe(
  rootPath: string,
  worldName: string,
  streaming: StreamingState,
  globalState: GlobalState,
  rl?: readline.Interface
): Promise<WorldState | null> {
  const cliClient: ClientConnection = {
    send: (data: string) => { },
    isOpen: true,
    onWorldEvent: (eventType: string, eventData: any) => {
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
  streaming: StreamingState,
  globalState: GlobalState,
  rl?: readline.Interface
): void {
  if (handleWorldEventWithStreaming(eventType, eventData, streaming)) {
    return;
  }

  if (eventData.content && eventData.content.includes('Success message sent')) return;

  if ((eventType === 'system' || eventType === 'world') && eventData.message) {
    console.log(`\n${boldRed('● system:')} ${eventData.message}`);
  }
}

// World discovery and selection
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

  if (worlds.length === 1) {
    console.log(`${boldGreen('Auto-selecting the only available world:')} ${cyan(worlds[0])}`);
    return worlds[0];
  }

  console.log(`\n${boldMagenta('Available worlds:')}`);
  worlds.forEach((world, index) => {
    console.log(`  ${yellow(`${index + 1}.`)} ${cyan(world)}`);
  });

  return new Promise((resolve) => {
    function askForSelection() {
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
    }

    askForSelection();
  });
}

// Interactive mode: console-based interface
async function runInteractiveMode(options: CLIOptions): Promise<void> {
  const rootPath = options.root || DEFAULT_ROOT_PATH;
  const globalState: GlobalState = createGlobalState();
  const streaming = createStreamingState();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  // Set up streaming callbacks
  streaming.wait = (delay: number) => {
    setupPromptTimer(globalState, rl, () => {
      if (streaming.isActive) {
        console.log(`\n${gray('Streaming appears stalled - waiting for user input...')}`);
        streaming.isActive = false;
        streaming.content = '';
        streaming.sender = undefined;
        streaming.messageId = undefined;
        rl.prompt();
      } else {
        rl.prompt();
      }
    }, delay);
  };

  streaming.stopWait = () => {
    clearPromptTimer(globalState);
  };

  console.log(boldCyan('Agent World CLI (Interactive Mode)'));
  console.log(cyan('===================================='));

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

    rl.prompt();

    rl.on('line', async (input) => {
      const trimmedInput = input.trim();

      if (!trimmedInput) {
        rl.prompt();
        return;
      }

      console.log(`\n${boldYellow('● you:')} ${trimmedInput}`);

      try {
        const result = await processCLIInput(trimmedInput, worldState?.world || null, rootPath, 'HUMAN');

        if (result.success === false) {
          console.log(error(`Error: ${result.error || result.message || 'Command failed'}`));
        } else if (result.message &&
          !result.message.includes('Success message sent') &&
          !result.message.includes('Message sent to world')) {
          console.log(success(result.message));
        }

        if (result.data && !(result.data.sender === 'HUMAN')) {
          console.log(`${boldMagenta('Data:')} ${JSON.stringify(result.data, null, 2)}`);
        }

        // Refresh world if needed
        if (result.refreshWorld && currentWorldName && worldState) {
          try {
            console.log(boldBlue('Refreshing world state...'));

            // Use the subscription's refresh method to properly destroy old world and create new
            const refreshedWorld = await worldState.subscription.refresh(rootPath);
            worldState.world = refreshedWorld;

            console.log(success('World state refreshed'));
          } catch (error) {
            console.error(error(`Error refreshing world: ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        }

      } catch (error) {
        console.error(error(`Command error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }

      if (streaming.wait) {
        streaming.wait(5000);
      }
    });

    rl.on('close', () => {
      console.log(`\n${boldCyan('Goodbye!')}`);
      if (worldState) {
        if (streaming.stopWait) {
          streaming.stopWait();
        }
        cleanupWorldSubscription(worldState);
      }
      process.exit(0);
    });

    rl.on('SIGINT', () => {
      console.log(`\n${boldCyan('Goodbye!')}`);
      if (worldState) {
        if (streaming.stopWait) {
          streaming.stopWait();
        }
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
    .allowExcessArguments()
    .parse();

  const options = program.opts<CLIOptions>();
  const args = program.args;
  const messageFromArgs = args.length > 0 ? args.join(' ') : null;

  const isPipelineMode = !!(
    options.command ||
    messageFromArgs ||
    !process.stdin.isTTY
  );

  if (isPipelineMode) {
    await runPipelineMode(options, messageFromArgs);
  } else {
    await runInteractiveMode(options);
  }
}

// Global error handling
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

setupErrorHandlers();
main().catch((error) => {
  console.error(boldRed('CLI error:'), error);
  process.exit(1);
});
