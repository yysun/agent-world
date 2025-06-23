/**
 * CLI Interface - Interactive Command Line Tool with Real-time Agent Streaming
 * 
 * Features:
 * - Interactive command line interface for testing and managing agents
 * - Command routing system with support for all available commands
 * - Integrated agent loading and management via World object
 * - Message broadcasting to agents with real-time streaming responses
 * - Simplified help system with minimal output
 * - Clean startup without verbose initialization messages
 * - Uses "HUMAN" sender terminology for all CLI-originated messages
 * 
 * Recent Changes:
 * - Updated message sending to use "HUMAN" as sender instead of "CLI"
 * - Updated to work with new flat event payload structure
 * - Improved compatibility with new MessageEventPayload typing
 * - Maintains all existing functionality with updated event structure
 * - Real-time character-by-character streaming display
 * - Multiple agent streaming with proper separation
 * - Agent memory management via clear command
 * 
 * Logic:
 * - Creates and initializes World instance silently on startup
 * - Loads persisted agents automatically with minimal output
 * - Uses standard console mode for familiar terminal interaction
 * - Routes commands to appropriate command handlers, passing World directly
 * - Provides interactive prompt for user input
 * - Broadcasts messages to all agents simultaneously
 * - Displays real-time streaming responses as characters arrive
 * - Shows agent headers and separators for clear organization
 * - Manages prompt restoration after streaming completes
 * 
 * Changes:
 * - Updated to use World object instead of individual components
 * - Removed SimpleState wrapper - commands now receive World directly
 * - Simplified message broadcasting using World.broadcastMessage method
 * - /use and /stop commands now use agent.start() and agent.stop() methods
 * - Removed verbose initialization messages for clean startup
 * - Added /quit command for clean exit
 * - Simplified help and list output formats
 * - Merged loader functionality into main file for simplicity
 * - REMOVED: All split screen functionality and ConsoleModeManager
 * - REPLACED: Sequential queue with real-time streaming display
 * - ADDED: StreamingManager for immediate character-by-character output
 * - Real-time streaming responses via SSE events with instant display
 * - Agent response separation with clear headers and dividers
 * - Smart prompt restoration only after all agents complete streaming
 * - File storage initialization is now handled automatically by World.ensureDefaultWorld
 */

import * as readline from 'readline';
import { cliLogger } from '../src/logger';
import { addCommand } from './commands/add';
import { clearCommand } from './commands/clear';
import { helpCommand } from './commands/help';
import { listCommand } from './commands/list';
import { stopCommand } from './commands/stop';
import { useCommand } from './commands/use';
import * as World from '../src/world';
import { colors } from './utils/colors';
import { EventType } from '../src/types';
// Debug utility: prints debug data in gray
function debug(...args: any[]) {
  // Print debug output in gray color
  console.log(colors.gray('[debug]'), ...args);
}

// Load agents function (merged from loader.ts)
async function loadAgents(worldId: string): Promise<void> {
  try {
    // Try to load world from disk if it exists
    try {
      await World.loadWorld(worldId);
    } catch (error) {
      // World doesn't exist on disk yet, that's okay
    }

    const agents = World.getAgents(worldId);

    await listCommand([], worldId); // Call list command to display loaded agents
    if (agents.length === 0) {
      // Don't print anything if no agents - will be shown by list command
    }
  } catch (error) {
    console.log(colors.red(`Failed to load agents: ${error}`));
    cliLogger.error({ error }, 'Failed to load agents during CLI startup');
    throw error;
  }

  console.log(); // Add spacing
}

// Quit command implementation
async function quitCommand(args: string[], worldId: string): Promise<void> {
  console.log(colors.cyan('Goodbye! 👋'));
  process.exit(0);
}

// Agent response management for real-time streaming
interface StreamingAgent {
  agentId: string;
  agentName: string;
  isStreaming: boolean;
  hasStarted: boolean;
}

// Function-based streaming manager
const activeStreams = new Map<string, StreamingAgent>();

function startStreaming(agentId: string, agentName: string): void {
  if (!activeStreams.has(agentId)) {
    activeStreams.set(agentId, {
      agentId,
      agentName,
      isStreaming: true,
      hasStarted: false
    });
  }

  const stream = activeStreams.get(agentId)!;
  if (!stream.hasStarted) {
    process.stdout.write(colors.blue(`\n> ${agentName}: `));
    stream.hasStarted = true;
  }
}

function addStreamingContent(agentId: string, content: string): void {
  const stream = activeStreams.get(agentId);
  if (stream && stream.isStreaming) {
    // Display content immediately for real-time streaming
    process.stdout.write(content);
  }
}

function endStreaming(agentId: string): void {
  const stream = activeStreams.get(agentId);
  if (stream) {
    stream.isStreaming = false;
    // Add newline after streaming completes
    console.log();
    activeStreams.delete(agentId);
  }
}

function markStreamingError(agentId: string): void {
  const stream = activeStreams.get(agentId);
  if (stream) {
    console.log(colors.red('\n[Response ended with error]'));
    activeStreams.delete(agentId);
  }
}

function isStreamingActive(): boolean {
  return activeStreams.size > 0;
}

// Command registry
const commands: Record<string, (args: string[], worldId: string) => Promise<void>> = {
  add: addCommand,
  clear: clearCommand,
  help: helpCommand,
  list: listCommand,
  stop: stopCommand,
  use: useCommand,
  quit: quitCommand,
};

async function main() {
  // Load worlds with smart selection (also initializes file storage)
  const worldId = await World.loadWorldsWithSelection();

  // Streaming manager is now function-based (no initialization needed)

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log(colors.cyan('\nGoodbye! 👋'));
    process.exit(0);
  };

  // Setup signal handlers
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Load all agents from our sample world
  await loadAgents(worldId);

  // Handle command line arguments (before starting UI)
  const args = process.argv.slice(2);
  if (args.length > 0) {
    const commandName = args[0].replace(/^\//, ''); // Remove leading slash if present
    if (commands[commandName]) {
      await commands[commandName](args.slice(1), worldId);
    } else {
      console.log(colors.yellow(`Unknown command: ${args[0]}`));
      await helpCommand([], worldId);
    }
  }

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: colors.cyan('> ')
  });

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
          await commands[commandName](commandArgs, worldId);
        } catch (error) {
          console.log(colors.red(`Error executing command: ${error}`));
        }
      } else {
        console.log(colors.yellow(`Unknown command: /${commandName}`));
        await helpCommand([], worldId);
      }
    } else {
      // Broadcast message to all agents
      try {
        await World.broadcastMessage(worldId, trimmedInput, 'HUMAN');
      } catch (error) {
        console.log(colors.red(`Error broadcasting message: ${error}`));
      }
    }

    rl.prompt();
  });

  rl.on('close', shutdown);

  // Subscribe to world events for agent streaming responses
  const unsubscribe = World.subscribeToWorldEvents(worldId, async (event) => {
    if (event.type === EventType.SSE) {
      // Handle streaming LLM responses
      const sseData = event.payload;

      // Get agent name for display
      const agent = World.getAgent(worldId, sseData.agentId);
      const agentName = agent?.name || 'Unknown Agent';

      switch (sseData.type) {
        case 'start':
          startStreaming(sseData.agentId, agentName);
          break;
        case 'chunk':
          addStreamingContent(sseData.agentId, sseData.content || '');
          break;
        case 'end':
          endStreaming(sseData.agentId);
          // Show prompt again after response completes
          setTimeout(() => {
            if (!isStreamingActive()) {
              rl.prompt();
            }
          }, 100);
          break;
        case 'error':
          markStreamingError(sseData.agentId);
          setTimeout(() => {
            if (!isStreamingActive()) {
              rl.prompt();
            }
          }, 100);
          break;
      }
    }
  });

  // Show initial prompt
  console.log(colors.gray('Type a message to broadcast to all agents, or use /help for commands.'));
  rl.prompt();
}

// Run the CLI
main().catch((error) => {
  console.error(colors.red('Fatal error:'), error);
  cliLogger.error({ error }, 'Fatal CLI error occurred');
  process.exit(1);
});
