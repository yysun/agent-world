/**
 * CLI Interface - Interactive Command Line Tool with Real-time Agent Streaming
 * 
 * Features:
 * - Interactive command interface for agent testing and management (/agents, /show, /add, etc.)
 * - Unified external input: piped input and CLI args treated as user messages to broadcast
 * - Real-time streaming with flashing emoji indicators and token counting (via StreamingDisplay module)
 * - Multi-agent concurrent streaming with dedicated line positioning
 * - Agent conversation history display and memory management
 * - World object integration for agent loading and persistence
 * - Graceful shutdown handling and clean terminal interaction
 * 
 * Architecture:
 * - Function-based streaming display manager in separate module (streaming/streaming-display.ts)
 * - Command routing system with World object pattern
 * - External input processing for both piped input and CLI arguments
 * - SSE event subscription for real-time agent response streaming
 * - Terminal control integration via imported streaming display module
 * 
 * Recent Changes:
 * - Extracted streaming functionality to dedicated streaming-display.ts module
 * - Maintained function-based approach with clean module separation
 * - Enhanced shutdown handling with proper streaming resource cleanup
 * - Simplified main CLI logic by delegating streaming management to dedicated module
 */

// npm run dev || echo "Test completed"
// echo "final piped test" | npx tsx cli/index.ts

import * as readline from 'readline';
import { cliLogger } from '../src/logger';
import { addCommand } from './commands/add';
import { clearCommand } from './commands/clear';
import { helpCommand } from './commands/help';
import { listCommand } from './commands/list';
import { showCommand } from './commands/show';
import { stopCommand } from './commands/stop';
import { useCommand } from './commands/use';
import * as World from '../src/world';
import { colors, terminal } from './utils/colors';
import { EventType } from '../src/types';
import * as StreamingDisplay from './streaming/streaming-display';

// Debug utility: prints debug data in gray
function debug(...args: any[]) {
  // Print debug output in gray color
  console.log(colors.gray('[debug]'), ...args);
}

// Load agents function (merged from loader.ts)
async function loadAgents(worldName: string): Promise<void> {
  try {
    // Try to load world from disk if it exists
    try {
      await World.loadWorld(worldName);
    } catch (error) {
      // World doesn't exist on disk yet, that's okay
    }

    const agents = World.getAgents(worldName);

    await listCommand([], worldName); // Call agents command to display loaded agents
    if (agents.length === 0) {
      // Don't print anything if no agents - will be shown by agents command
    }
  } catch (error) {
    console.log(colors.red(`Failed to load agents: ${error}`));
    cliLogger.error({ error }, 'Failed to load agents during CLI startup');
    throw error;
  }

  console.log(); // Add spacing
}

// Quit command implementation
async function quitCommand(args: string[], worldName: string): Promise<void> {
  console.log(colors.cyan('Goodbye! 👋'));
  process.exit(0);
}

// Command registry
const commands: Record<string, (args: string[], worldName: string) => Promise<void>> = {
  add: addCommand,
  agents: listCommand,
  clear: clearCommand,
  help: helpCommand,
  show: showCommand,
  stop: stopCommand,
  use: useCommand,
  quit: quitCommand,
};

async function main() {
  // Load worlds with smart selection (also initializes file storage)
  const worldName = await World.loadWorldsWithSelection();

  // Streaming manager is now function-based (no initialization needed)

  // Handle graceful shutdown
  const shutdown = async () => {
    StreamingDisplay.resetStreamingState(); // Clean up streaming resources
    console.log(colors.cyan('\nGoodbye! 👋'));
    process.exit(0);
  };

  // Setup signal handlers
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Load all agents from our sample world
  await loadAgents(worldName);

  // Handle input from piped input or command line arguments
  let hasExternalInput = false;
  let externalMessage = '';
  let hasPipedInput = false;

  // Check for piped input first (like echo "message" | npm run dev)
  // Try to detect if there's actual piped data by checking for immediate data availability
  let hasPotentialPipedInput = false;

  // First, check if stdin is definitely not a TTY (real piped input)
  if (process.stdin.isTTY === false) {
    hasPotentialPipedInput = true;
  } else if (process.stdin.isTTY === undefined) {
    // For tsx/nodemon, we need to check if there's actually piped data
    // Set a very short timeout to see if data is immediately available
    try {
      const hasData = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 10); // Very short timeout

        process.stdin.once('readable', () => {
          clearTimeout(timeout);
          resolve(true);
        });

        // If stdin is already readable with data, resolve immediately
        if (process.stdin.readable && process.stdin.readableLength > 0) {
          clearTimeout(timeout);
          resolve(true);
        }
      });

      hasPotentialPipedInput = hasData;
    } catch (error) {
      hasPotentialPipedInput = false;
    }
  }

  if (hasPotentialPipedInput) {
    hasExternalInput = true;
    hasPipedInput = true;
    // Read all piped input
    let pipedContent = '';
    process.stdin.setEncoding('utf8');

    for await (const chunk of process.stdin) {
      pipedContent += chunk;
    }

    externalMessage = pipedContent.trim();
  } else {
    // Check for command line arguments
    const args = process.argv.slice(2);
    if (args.length > 0) {
      hasExternalInput = true;
      externalMessage = args.join(' ');
    }
  }

  // Create readline interface first
  let rl: readline.Interface;

  if (hasPipedInput) {
    // For piped input, we need to create readline interface differently
    // since stdin was already consumed
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: colors.cyan('> ')
    });

    // Ensure stdin is properly set up for interactive use after piped input
    process.stdin.resume();
  } else {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: colors.cyan('> ')
    });
  }

  // If we have external input, broadcast it
  if (hasExternalInput && externalMessage) {
    console.log(colors.gray(`> ${externalMessage}`)); // Show as user input
    try {
      await World.broadcastMessage(worldName, externalMessage, 'HUMAN');
    } catch (error) {
      console.log(colors.red(`Error broadcasting message: ${error}`));
    }
  }

  // Handle input
  rl.on('line', async (input: string) => {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      rl.prompt();
      return;
    }

    // Clear the current line to prevent echoing the command input
    readline.moveCursor(process.stdout, 0, -1); // Move cursor up one line
    readline.clearLine(process.stdout, 0);      // Clear the line
    readline.cursorTo(process.stdout, 0);       // Move cursor to start

    if (trimmedInput.startsWith('/')) {
      // Handle commands
      const parts = trimmedInput.slice(1).split(' ');
      const commandName = parts[0];
      const commandArgs = parts.slice(1);

      if (commands[commandName]) {
        try {
          await commands[commandName](commandArgs, worldName);
        } catch (error) {
          console.log(colors.red(`Error executing command: ${error}`));
        }
      } else {
        console.log(colors.yellow(`Unknown command: /${commandName}`));
        await helpCommand([], worldName);
      }
    } else {
      // Broadcast message to all agents
      try {
        await World.broadcastMessage(worldName, trimmedInput, 'HUMAN');
      } catch (error) {
        console.log(colors.red(`Error broadcasting message: ${error}`));
      }
    }

    rl.prompt();
  });

  rl.on('close', shutdown);

  // Subscribe to SSE events for agent streaming responses
  const unsubscribe = World.subscribeToSSEEvents(worldName, async (event) => {
    if (event.type === EventType.SSE) {
      // Handle streaming LLM responses
      const sseData = event.payload;

      // Get agent name for display
      const agents = World.getAgents(worldName);
      const agent = agents.find(a => a.name === sseData.agentName);
      const agentName = agent?.name || 'Unknown Agent';

      switch (sseData.type) {
        case 'start':
          StreamingDisplay.startStreaming(sseData.agentName, agentName);
          break;
        case 'chunk':
          StreamingDisplay.addStreamingContent(sseData.agentName, sseData.content || '');
          break;
        case 'end':
          StreamingDisplay.endStreaming(sseData.agentName);
          // Show prompt again after response completes
          setTimeout(() => {
            if (!StreamingDisplay.isStreamingActive()) {
              rl.prompt();
            }
          }, 100);
          break;
        case 'error':
          StreamingDisplay.markStreamingError(sseData.agentName);
          setTimeout(() => {
            if (!StreamingDisplay.isStreamingActive()) {
              rl.prompt();
            }
          }, 100);
          break;
      }
    }
  });

  // Show initial prompt
  console.log(colors.gray('Type a message to broadcast to all agents, or use /help for commands.'));
  console.log(); // Add extra spacing before prompt

  // If we had external input, wait a bit for potential streaming to start before showing prompt
  if (hasExternalInput) {
    setTimeout(() => {
      if (!StreamingDisplay.isStreamingActive()) {
        rl.prompt();
      }
    }, 100);
  } else {
    rl.prompt();
  }
}

// Run the CLI
main().catch((error) => {
  console.error(colors.red('Fatal error:'), error);
  cliLogger.error({ error }, 'Fatal CLI error occurred');
  process.exit(1);
});
