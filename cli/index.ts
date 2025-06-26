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
 * - Command routing system with direct World function imports
 * - External input processing for both piped input and CLI arguments
 * - SSE event subscription for real-time agent response streaming
 * - Terminal control integration via imported streaming display module
 * 
 * Recent Changes:
 * - Extracted streaming functionality to dedicated streaming-display.ts module
 * - Maintained function-based approach with clean module separation
 * - Enhanced shutdown handling with proper streaming resource cleanup
 * - Simplified main CLI logic by delegating streaming management to dedicated module
 * - Removed web server integration (now handled by separate launcher)
 * - Refactored to use direct function imports from World module instead of namespace import
 */

// npm run dev || echo "Test completed"
// echo "final piped test" | npx tsx cli/index.ts

import * as readline from 'readline';
import { cliLogger } from '../src/logger';
import { addCommand } from './commands/add';
import { clearCommand } from './commands/clear';
import { exportCommand } from './commands/export';
import { helpCommand } from './commands/help';
import { listCommand } from './commands/list';
import { showCommand } from './commands/show';
import { stopCommand } from './commands/stop';
import { useCommand } from './commands/use';
import {
  loadWorlds,
  loadWorld,
  loadWorldFromDisk,
  createWorld,
  getAgents,
  getAgent,
  broadcastMessage,
  DEFAULT_WORLD_NAME
} from '../src/world';
import { subscribeToSSE, subscribeToSystem, subscribeToMessages } from '../src/event-bus';
import { colors, terminal } from './utils/colors';
import { EventType, SSEEventPayload, SystemEventPayload, MessageEventPayload } from '../src/types';
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
      await loadWorld(worldName);
    } catch (error) {
      // World doesn't exist on disk yet, that's okay
    }

    const agents = getAgents(worldName);

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
  export: exportCommand,
  help: helpCommand,
  show: showCommand,
  stop: stopCommand,
  use: useCommand,
  quit: quitCommand,
};

// Interactive world selection when multiple worlds exist
async function selectWorldInteractively(worlds: string[]): Promise<string> {
  return new Promise((resolve) => {
    console.log(colors.cyan('\nMultiple worlds found:'));
    worlds.forEach((world, index) => {
      console.log(colors.gray(`  ${index + 1}. ${world}`));
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const askForSelection = () => {
      rl.question(colors.cyan(`\nSelect a world (1-${worlds.length}): `), (answer) => {
        const selection = parseInt(answer.trim());

        if (isNaN(selection) || selection < 1 || selection > worlds.length) {
          console.log(colors.yellow('Invalid selection. Please try again.'));
          askForSelection();
          return;
        }

        rl.close();
        resolve(worlds[selection - 1]);
      });
    };

    askForSelection();
  });
}

// Function to estimate input tokens from conversation history
function estimateInputTokens(agentName: string, worldName: string): number {
  try {
    const agent = getAgent(worldName, agentName);
    if (!agent) return 50; // Default estimate if agent not found

    // Get recent conversation context (rough estimate)
    // System prompt + recent conversation history
    const systemPromptTokens = (agent.config.systemPrompt || '').split(/\s+/).length;
    const conversationEstimate = 100; // Rough estimate for recent conversation

    return Math.max(50, systemPromptTokens + conversationEstimate);
  } catch (error) {
    return 50; // Default fallback
  }
}

async function main() {
  // Load worlds with smart selection (also initializes file storage)
  const { worlds, action, defaultWorld } = await loadWorlds();

  let worldName: string;

  switch (action) {
    case 'create':
      // No worlds found - create default world
      worldName = await createWorld({ name: DEFAULT_WORLD_NAME });
      break;

    case 'use':
      // One world found - use it automatically
      await loadWorldFromDisk(defaultWorld!);
      worldName = defaultWorld!;
      break;

    case 'select':
      // Multiple worlds found - let user pick
      const selectedWorld = await selectWorldInteractively(worlds);
      await loadWorldFromDisk(selectedWorld);
      worldName = selectedWorld;
      break;

    default:
      throw new Error('Unexpected world loading action');
  }

  // Set world name in streaming display for message storage
  StreamingDisplay.setCurrentWorldName(worldName);

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

  // Set up callback to show prompt when streaming ends
  StreamingDisplay.setOnAllStreamingEndCallback(() => {
    if (rl) {
      rl.prompt();
    }
  });

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
    // For piped input, we can still create the interface but it won't be interactive
    // This is a fundamental limitation of Node.js - once stdin is consumed by piping, 
    // it can't be restored to interactive mode
    console.log(colors.yellow('\nNote: Interactive mode not available after piped input.'));

    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: colors.cyan('> ')
    });
  } else {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: colors.cyan('> ')
    });
  }

  // If we have external input, broadcast it
  if (hasExternalInput && externalMessage) {
    StreamingDisplay.displayFormattedMessage({
      sender: 'you',
      content: externalMessage,
      metadata: { source: 'cli', messageType: 'command' }
    });
    try {
      await broadcastMessage(worldName, externalMessage, 'HUMAN');
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
      StreamingDisplay.displayFormattedMessage({
        sender: 'you',
        content: trimmedInput,
        metadata: { source: 'cli', messageType: 'command' }
      });
      try {
        await broadcastMessage(worldName, trimmedInput, 'HUMAN');
      } catch (error) {
        console.log(colors.red(`Error broadcasting message: ${error}`));
      }
    }

    // Wait a short moment for potential streaming to start, then show prompt if no streaming
    setTimeout(() => {
      if (!StreamingDisplay.isStreamingActive()) {
        rl.prompt();
      }
    }, 50);
  });

  rl.on('close', shutdown);

  // Subscribe to SSE events for agent streaming responses
  const unsubscribe = subscribeToSSE(async (event) => {
    if (event.type === EventType.SSE) {
      // Handle streaming LLM responses
      const sseData = event.payload as SSEEventPayload;

      // Get agent name for display
      const agents = getAgents(worldName);
      const agent = agents.find(a => a.name === sseData.agentName);
      const agentName = agent?.name || 'Unknown Agent';

      switch (sseData.type) {
        case 'start':
          // Estimate input tokens from message context
          const estimatedInputTokens = estimateInputTokens(sseData.agentName, worldName);
          StreamingDisplay.startStreaming(sseData.agentName, agentName, estimatedInputTokens);
          break;
        case 'chunk':
          StreamingDisplay.addStreamingContent(sseData.agentName, sseData.content || '');
          break;
        case 'end':
          // Set usage information if available BEFORE ending streaming
          if (sseData.usage) {
            StreamingDisplay.setStreamingUsage(sseData.agentName, sseData.usage);
            // Trigger one final preview update to show the actual token counts
            StreamingDisplay.updateFinalPreview(sseData.agentName);
          }
          StreamingDisplay.endStreaming(sseData.agentName);
          break;
        case 'error':
          StreamingDisplay.markStreamingError(sseData.agentName);
          break;
      }
    }
  });

  // Subscribe to SYSTEM events for debug messages
  subscribeToSystem(async (event) => {
    if (event.type === EventType.SYSTEM) {
      const systemData = event.payload as SystemEventPayload;
      if (systemData.action === 'debug' && systemData.content) {
        // Display debug messages properly during streaming
        StreamingDisplay.displayDebugMessage(colors.gray(systemData.content));
      }
    }
  });

  // Subscribe to MESSAGE events for system messages (like turn limit notifications)
  subscribeToMessages(async (event) => {
    if (event.type === EventType.MESSAGE) {
      const messageData = event.payload as MessageEventPayload;
      // Display @human messages from system OR agents (for turn limit notifications)
      if (messageData.content.startsWith('@human')) {
        // Display @human messages with red dot, showing who sent it
        StreamingDisplay.displayMessage(messageData);
      }
    }
  });

  // Show initial prompt
  console.log(colors.gray('Type a message to broadcast to all agents, or use /help for commands.'));
  console.log(); // Add extra spacing before prompt

  // If we had piped input, wait a bit for potential streaming to start and then exit gracefully
  if (hasExternalInput && hasPipedInput) {
    setTimeout(() => {
      if (!StreamingDisplay.isStreamingActive()) {
        console.log(colors.cyan('\nPiped input processed. Exiting...'));
        process.exit(0);
      } else {
        // Wait for streaming to complete
        StreamingDisplay.setOnAllStreamingEndCallback(() => {
          console.log(colors.cyan('\nStreaming completed. Exiting...'));
          process.exit(0);
        });
      }
    }, 100);
  } else if (hasExternalInput) {
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
