#!/usr/bin/env node
/**
 * CLI Entry Point for Agent World with Console-Based Display
 * 
 * FILE COMMENT BLOCK:
 * This file implements the main CLI entry point for Agent World with console-based
 * display functionality, replacing the previous Ink-based UI components with simple
 * console.log outputs for events and interactions.
 *
 * FEATURES:
 * - Pipeline Mode: Process arguments, execute commands, output results, exit
 * - Interactive Mode: Console-based interface with real-time event handling
 * - Mode Detection: Automatic based on argument presence and stdin availability
 * - Shared Command Core: Uses commands/index.ts processInput() for consistency
 * - Context Preservation: Command line context carries into interactive mode
 * - Dual Input Processing: Commands (/) vs Messages (plain text) via shared logic
 * - Console Display: Uses console.log for all events and interactions
 * - Real-time Streaming: Shows agent responses as they stream in
 * - World Management: Interactive world selection and subscription
 * - Event Handling: Comprehensive event listener setup for world events
 *
 * IMPLEMENTATION:
 * - Removed React/Ink dependencies and components
 * - Uses readline for interactive input handling
 * - Implements streaming display with real-time chunk accumulation
 * - Provides world selection interface when no world specified
 * - Maintains same command processing logic as WebSocket server
 * - Includes proper cleanup and error handling
 *
 * CHANGES FROM INK VERSION:
 * - Replaced Ink components with console.log outputs
 * - Added readline interface for interactive mode
 * - Implemented console-based world selection
 * - Added real-time streaming display via stdout
 * - Simplified event handling to use console outputs
 * - Removed React/JSX dependencies
 *
 * Input Processing:
 * - If input starts with '/': Process as command via handleCommand()
 * - Else: Process as message to world via handleMessagePublish()
 * - Applies to all input sources: --command, args, stdin, interactive
 *
 * Architecture:
 * - Uses commander.js for robust argument parsing
 * - Pipeline mode: Direct stdout output, no JSON parsing needed
 * - Interactive mode: Console-based display with readline for input
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
import readline from 'readline';
import { CLIClientConnection } from './transport/cli-client.js';
import { processInput } from '../commands/index.js';
import { getWorld } from '../core/world-manager.js';
import { toKebabCase } from '../core/utils.js';
import { World } from '../core/types.js';
import fs from 'fs';
import path from 'path';

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

// Clean up world subscription and event listeners
function cleanupWorldSubscription(worldState: WorldState | null): void {
  if (worldState?.world && worldState?.worldEventListeners) {
    console.debug('Cleaning up world subscription', {
      world: worldState.world.name,
      listenerCount: worldState.worldEventListeners.size
    });

    // Remove all event listeners
    for (const [eventName, listener] of worldState.worldEventListeners) {
      worldState.world.eventEmitter.off(eventName, listener);
    }
    worldState.worldEventListeners.clear();

    console.debug('World subscription cleanup completed', { world: worldState.world.name });
  }
}

// Set up event listeners for world events
function setupWorldEventListeners(
  world: World,
  streaming: { current: StreamingState }
): Map<string, (...args: any[]) => void> {
  const worldEventListeners = new Map<string, (...args: any[]) => void>();

  console.debug('Setting up world event listeners', { world: world.name });

  // Generic handler that forwards events to console with filtering
  const handler = (eventType: string) => (eventData: any) => {
    // Skip echoing user messages back to client
    if (eventData.sender && (eventData.sender === 'HUMAN' || eventData.sender === 'CLI' || eventData.sender.startsWith('user'))) {
      console.debug('Skipping echo of user message', { eventType, sender: eventData.sender });
      return;
    }

    // Handle SSE events specially for streaming display
    if (eventType === 'sse') {
      if (eventData.type === 'chunk' && eventData.content) {
        // Start streaming if not active
        if (!streaming.current.isActive) {
          streaming.current.isActive = true;
          streaming.current.content = '';
          streaming.current.sender = eventData.agentName || eventData.sender;
          streaming.current.messageId = eventData.messageId;
          console.log(`\n🤖 ${streaming.current.sender} is responding...`);
        }

        // Accumulate streaming content
        if (streaming.current.messageId === eventData.messageId) {
          streaming.current.content += eventData.content;
          // Print chunks in real-time
          process.stdout.write(eventData.content);
        }
        return;
      } else if (eventData.type === 'end') {
        // End streaming
        if (streaming.current.isActive && streaming.current.messageId === eventData.messageId) {
          console.log('\n'); // New line after streaming
          streaming.current.isActive = false;
          streaming.current.content = '';
          streaming.current.messageId = undefined;
        }
        return;
      } else if (eventData.type === 'error') {
        // Handle streaming errors
        if (streaming.current.isActive && streaming.current.messageId === eventData.messageId) {
          console.log(`\n❌ Stream error: ${eventData.error || eventData.message}`);
          streaming.current.isActive = false;
          streaming.current.content = '';
          streaming.current.messageId = undefined;
        }
        return;
      }
    }

    // Filter out "Success message sent" messages
    if (eventData.content && eventData.content.includes('Success message sent')) {
      return;
    }

    // Display other events
    if (eventType === 'message' && eventData.content) {
      console.log(`\n🤖 ${eventData.sender || 'Agent'}: ${eventData.content}`);
    } else if (eventType === 'system' && eventData.message) {
      console.log(`\n📟 System: ${eventData.message}`);
    } else if (eventType === 'world' && eventData.message) {
      console.log(`\n🌍 World: ${eventData.message}`);
    }
  };

  // List of event types to forward
  const eventTypes = ['system', 'world', 'message', 'sse'];

  // Set up listeners for all event types
  for (const eventType of eventTypes) {
    const eventHandler = handler(eventType);
    world.eventEmitter.on(eventType, eventHandler);
    worldEventListeners.set(eventType, eventHandler);
  }

  console.info('World event listeners setup completed', {
    world: world.name,
    eventTypeCount: eventTypes.length
  });

  return worldEventListeners;
}

// Handle world subscription
async function handleSubscribe(
  rootPath: string,
  worldName: string,
  streaming: { current: StreamingState }
): Promise<WorldState | null> {
  console.debug('Handling world subscription', { worldName });

  const worldId = toKebabCase(worldName);
  const world = await getWorld(rootPath, worldId);
  if (!world) {
    console.warn('Failed to load world for subscription', { worldName, worldId });
    throw new Error('Failed to load world');
  }

  // Set up event listeners
  const worldEventListeners = setupWorldEventListeners(world, streaming);

  console.info('World subscription successful', { worldName, worldId });

  return { world, worldEventListeners };
}

// List available worlds
async function listAvailableWorlds(rootPath: string): Promise<string[]> {
  try {
    const worldsPath = rootPath;
    if (!fs.existsSync(worldsPath)) {
      return [];
    }

    const items = fs.readdirSync(worldsPath, { withFileTypes: true });
    const worlds = items
      .filter(item => item.isDirectory())
      .map(item => item.name)
      .filter(name => !name.startsWith('.'));

    return worlds;
  } catch (error) {
    console.error('Error listing worlds:', error);
    return [];
  }
}

// Interactive world selection
async function selectWorld(rootPath: string, rl: readline.Interface): Promise<string | null> {
  const worlds = await listAvailableWorlds(rootPath);

  if (worlds.length === 0) {
    console.log('❌ No worlds found in', rootPath);
    return null;
  }

  if (worlds.length === 1) {
    console.log(`✅ Auto-selecting the only available world: ${worlds[0]}`);
    return worlds[0];
  }

  console.log('\n📋 Available worlds:');
  worlds.forEach((world, index) => {
    console.log(`  ${index + 1}. ${world}`);
  });

  return new Promise((resolve) => {
    const askForSelection = () => {
      rl.question('\n🌍 Select a world (number or name): ', (answer) => {
        const trimmed = answer.trim();

        // Try number selection
        const num = parseInt(trimmed);
        if (!isNaN(num) && num >= 1 && num <= worlds.length) {
          resolve(worlds[num - 1]);
          return;
        }

        // Try name selection
        const found = worlds.find(world =>
          world.toLowerCase() === trimmed.toLowerCase() ||
          world.toLowerCase().includes(trimmed.toLowerCase())
        );

        if (found) {
          resolve(found);
          return;
        }

        console.log('❌ Invalid selection. Please try again.');
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

  console.log('🌍 Agent World CLI (Interactive Mode)');
  console.log('====================================');

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
      console.log(`\n📡 Loading world: ${options.world}`);
      try {
        worldState = await handleSubscribe(rootPath, options.world, streaming);
        currentWorldName = options.world;
        console.log(`✅ Connected to world: ${currentWorldName}`);

        if (worldState?.world) {
          console.log(`📊 Agents: ${worldState.world.agents?.size || 0} | Turn Limit: ${worldState.world.turnLimit || 'N/A'}`);
        }
      } catch (error) {
        console.error(`❌ Error loading world: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    } else {
      console.log('\n🔍 Discovering available worlds...');
      const selectedWorld = await selectWorld(rootPath, rl);

      if (!selectedWorld) {
        console.log('❌ No world selected. Exiting.');
        rl.close();
        return;
      }

      console.log(`\n📡 Loading world: ${selectedWorld}`);
      try {
        worldState = await handleSubscribe(rootPath, selectedWorld, streaming);
        currentWorldName = selectedWorld;
        console.log(`✅ Connected to world: ${currentWorldName}`);

        if (worldState?.world) {
          console.log(`📊 Agents: ${worldState.world.agents?.size || 0} | Turn Limit: ${worldState.world.turnLimit || 'N/A'}`);
        }
      } catch (error) {
        console.error(`❌ Error loading world: ${error instanceof Error ? error.message : 'Unknown error'}`);
        rl.close();
        return;
      }
    }

    // Show usage tips
    console.log('\n💡 Tips:');
    console.log('  • Type commands like: getworld, clear agent1, addagent MyAgent');
    console.log('  • Type messages to send to agents');
    console.log('  • Press Ctrl+C to exit');
    console.log('');

    // Set up command processing
    rl.prompt();

    rl.on('line', async (input) => {
      const trimmedInput = input.trim();

      if (!trimmedInput) {
        rl.prompt();
        return;
      }

      try {
        const result = await processInput(trimmedInput, worldState?.world || null, rootPath, 'HUMAN');

        // Display result
        if (result.success === false) {
          console.log(`❌ Error: ${result.error || result.message || 'Command failed'}`);
        } else if (result.message && !result.message.includes('Success message sent')) {
          console.log(`✅ ${result.message}`);
        }

        if (result.data) {
          console.log('📄 Data:', JSON.stringify(result.data, null, 2));
        }

        // Refresh world if needed
        if (result.refreshWorld && currentWorldName && worldState) {
          try {
            console.log('🔄 Refreshing world state...');
            cleanupWorldSubscription(worldState);
            worldState = await handleSubscribe(rootPath, currentWorldName, streaming);
            console.log('✅ World state refreshed');
          } catch (error) {
            console.error(`❌ Error refreshing world: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

      } catch (error) {
        console.error(`❌ Command error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      rl.prompt();
    });

    rl.on('close', () => {
      console.log('\n👋 Goodbye!');
      if (worldState) {
        cleanupWorldSubscription(worldState);
      }
      process.exit(0);
    });

    // Handle Ctrl+C gracefully
    rl.on('SIGINT', () => {
      console.log('\n👋 Goodbye!');
      if (worldState) {
        cleanupWorldSubscription(worldState);
      }
      rl.close();
    });

  } catch (error) {
    console.error('Error starting interactive mode:', error instanceof Error ? error.message : error);
    rl.close();
    process.exit(1);
  }
}

// Main CLI entry point
async function main(): Promise<void> {
  program
    .name('cli-ink')
    .description('Agent World CLI with console-based display')
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
