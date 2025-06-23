/**
 * CLI Interface - Interactive Command Line Tool with Real-time Agent Streaming
 * 
 * Features:
 * - Interactive command line interface for testing and managing agents
 * - Command routing system with support for all available commands
 * - Integrated agent loading and management via World object
 * - Message broadcasting to agents with flashing emoji preview and multi-line final display
 * - Multi-agent line management for concurrent streaming without overlap
 * - Simplified help system with minimal output
 * - Clean startup without verbose initialization messages
 * - Uses "HUMAN" sender terminology for all CLI-originated messages
 * - Smart streaming display with 50-character preview, token count, and full content reveal
 * 
 * Recent Changes:
 * - MAJOR: Implemented flashing emoji indicators (●/○) for active streaming states
 * - Enhanced streaming preview to show exactly 50 characters with token count display
 * - Added real-time token counting for streaming responses
 * - Implemented emoji animation with 500ms flash interval for visual feedback
 * - Enhanced multi-agent streaming to prevent display overlap and conflicts
 * - Added proper cleanup of emoji timers on streaming completion or errors
 * - Improved concurrent streaming with proper line allocation system
 * - Enhanced terminal control with save/restore cursor functionality
 * - Added completed agents tracking for coordinated final display
 * - Implemented synchronized final content display after all agents complete
 * - Fixed SSE data routing to display on each agent's dedicated line
 * - CRITICAL: Fixed newline preservation in LLM responses for proper formatting
 * - Updated final display to preserve original content structure and paragraphs
 * - Removed artificial line length limits to use full terminal width
 * - Simplified final display by removing left border for cleaner appearance
 * - Added gray color formatting for message content in final display
 * 
 * Streaming Display Logic:
 * - Each agent gets assigned a dedicated line offset for preview display
 * - During streaming: Shows flashing emoji with "● agentName: [50 chars] ... (xxx tokens)" format
 * - Multiple agents stream simultaneously without interfering with each other
 * - Content updates use cursor positioning to target specific agent lines
 * - Preview updates via emoji flashing animation (500ms interval)
 * - After all streaming: Clears all preview lines and displays complete content
 * - Final display shows all agent responses in order with proper formatting
 * - Proper spacing and agent headers for clear organization
 * 
 * Multi-Agent Line Management:
 * - streamingStartLine: Tracks where the streaming block begins
 * - nextLineOffset: Assigns unique line positions to each agent
 * - activeStreams: Manages currently streaming agents with line positions and emoji timers
 * - completedAgents: Stores finished agents for synchronized final display
 * - Cursor save/restore: Enables precise line targeting for updates
 * - Line clearing and positioning: Ensures clean transitions and no overlap
 * - Emoji flashing: Provides visual feedback for active streaming state
 * 
 * Logic:
 * - Creates and initializes World instance silently on startup
 * - Loads persisted agents automatically with minimal output
 * - Uses standard console mode for familiar terminal interaction
 * - Routes commands to appropriate command handlers, passing World directly
 * - Provides interactive prompt for user input
 * - Broadcasts messages to all agents simultaneously
 * - Displays real-time streaming responses with flashing emoji indicators
 * - Shows agent headers and separators for clear organization
 * - Manages prompt restoration after streaming completes
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
 * - ENHANCED: Single-line preview with multi-line final display system
 * - ENHANCED: Multi-agent line management with dedicated positioning
 * - Real-time streaming responses via SSE events with smart display management
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
import { colors, terminal } from './utils/colors';
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
  contentBuffer: string;
  tokenCount: number;
  previewLine: number;
  lineOffset: number; // Relative line position from start of streaming block
  emojiFlashTimer?: NodeJS.Timeout; // Timer for flashing emoji animation
  hasError?: boolean; // Track if streaming ended with error
}

// Function-based streaming manager
const activeStreams = new Map<string, StreamingAgent>();
const completedAgents = new Map<string, StreamingAgent>(); // Store completed agents for final display
let streamingStartLine = 0; // The line where streaming block starts
let nextLineOffset = 0; // Next available line offset for new agents

function startStreaming(agentId: string, agentName: string): void {
  if (!activeStreams.has(agentId)) {
    // If this is the first agent, mark the starting line
    if (activeStreams.size === 0) {
      console.log(); // Add newline before streaming block starts
      streamingStartLine = (process.stdout as any).rows || 0;
      nextLineOffset = 0;
    }

    // Assign this agent the next available line
    const lineOffset = nextLineOffset++;

    activeStreams.set(agentId, {
      agentId,
      agentName,
      isStreaming: true,
      hasStarted: false,
      contentBuffer: '',
      tokenCount: 0,
      previewLine: streamingStartLine + lineOffset,
      lineOffset,
      hasError: false
    });
  }

  const stream = activeStreams.get(agentId)!;
  if (!stream.hasStarted) {
    // Create a new line for this agent if needed
    if (stream.lineOffset > 0) {
      // Move to the agent's designated line
      for (let i = 0; i < stream.lineOffset; i++) {
        console.log(); // Create empty lines for agents above
      }
    }

    // Show initial flashing emoji preview for this agent (start with empty content)
    const initialEmoji = colors.cyan('●');
    const initialPreview = `${initialEmoji} ${agentName}: ... (0 tokens)`;
    process.stdout.write(initialPreview);
    stream.hasStarted = true;

    // Start flashing emoji animation
    startEmojiFlashing(agentId);
  }
}

function addStreamingContent(agentId: string, content: string): void {
  const stream = activeStreams.get(agentId);
  if (stream && stream.isStreaming) {
    // Add content to buffer
    stream.contentBuffer += content;

    // Update token count (approximate: split by spaces and punctuation)
    stream.tokenCount = stream.contentBuffer
      .split(/[\s\.,;:!?\-'"()\[\]{}]+/)
      .filter(token => token.length > 0).length;

    // Update preview immediately with current content
    updateStreamingPreview(agentId);
  }
}

function endStreaming(agentId: string): void {
  const stream = activeStreams.get(agentId);
  if (stream) {
    stream.isStreaming = false;

    // Stop emoji flashing animation
    stopEmojiFlashing(agentId);

    // Store completed agent data for final display
    completedAgents.set(agentId, stream);

    // Remove this agent from active streams
    activeStreams.delete(agentId);

    // If this is the last active stream, show all final content
    if (activeStreams.size === 0) {
      // Get all completed streams
      const completedStreams = Array.from(completedAgents.values()).sort((a, b) => a.lineOffset - b.lineOffset);

      // Move cursor to start of streaming block and clear preview lines
      const totalLines = completedStreams.length;
      if (totalLines > 0) {
        // Move up to the first agent's line
        process.stdout.write(terminal.cursorUp(totalLines - 1));

        // Clear all preview lines
        for (let i = 0; i < totalLines; i++) {
          process.stdout.write(terminal.clearLine());
          process.stdout.write(terminal.cursorToColumn(0));
          if (i < totalLines - 1) {
            process.stdout.write(terminal.cursorDown(1));
          }
        }

        // Move back to start of block
        process.stdout.write(terminal.cursorUp(totalLines - 1));
        process.stdout.write(terminal.cursorToColumn(0));

        // Display final content for all agents with borders
        for (const finalStream of completedStreams) {
          const fullContent = finalStream.contentBuffer.trim();
          if (fullContent) {
            console.log(createBorderedContent(finalStream.agentName, fullContent, finalStream.hasError));
          } else {
            console.log(createBorderedContent(finalStream.agentName, '[no response]', finalStream.hasError));
          }
          console.log(); // Add spacing after each response
        }
      }

      // Reset streaming state
      completedAgents.clear();
      streamingStartLine = 0;
      nextLineOffset = 0;
    }
  }
}

function markStreamingError(agentId: string): void {
  const stream = activeStreams.get(agentId);
  if (stream) {
    // Mark as error and stop emoji flashing animation
    stream.hasError = true;
    stopEmojiFlashing(agentId);

    // Store completed agent data for final display (with error status)
    completedAgents.set(agentId, stream);

    // Save current cursor position
    process.stdout.write(terminal.saveCursor());

    // Move to this agent's specific line
    const linesToMove = stream.lineOffset;
    if (linesToMove > 0) {
      process.stdout.write(terminal.cursorUp(linesToMove));
    }

    // Clear the preview line and show error with red emoji
    process.stdout.write(terminal.clearToEnd());
    process.stdout.write(terminal.cursorToColumn(0));
    const errorEmoji = colors.red('✗');
    process.stdout.write(`${errorEmoji}  ${stream.agentName}: ` + colors.red('[Response ended with error]'));

    // Restore cursor position
    process.stdout.write(terminal.restoreCursor());

    // Remove this agent from active streams
    activeStreams.delete(agentId);

    // If no more active streams, clean up and reset
    if (activeStreams.size === 0) {
      console.log(); // Add spacing
      streamingStartLine = 0;
      nextLineOffset = 0;
    }
  }
}

function isStreamingActive(): boolean {
  return activeStreams.size > 0;
}

// Emoji flashing animation for streaming indicators
const FLASH_EMOJIS = ['●', '○']; // Filled and empty circles for flashing effect
let emojiFlashIndex = 0;

function startEmojiFlashing(agentId: string): void {
  const stream = activeStreams.get(agentId);
  if (!stream) return;

  // Clear any existing timer
  if (stream.emojiFlashTimer) {
    clearInterval(stream.emojiFlashTimer);
  }

  // Start flashing animation (500ms interval)
  stream.emojiFlashTimer = setInterval(() => {
    if (!activeStreams.has(agentId)) {
      // Agent is no longer streaming, stop the timer
      clearInterval(stream.emojiFlashTimer!);
      return;
    }

    updateStreamingPreview(agentId);
  }, 500);
}

function stopEmojiFlashing(agentId: string): void {
  const stream = activeStreams.get(agentId) || completedAgents.get(agentId);
  if (stream?.emojiFlashTimer) {
    clearInterval(stream.emojiFlashTimer);
    stream.emojiFlashTimer = undefined;
  }
}

function getCurrentEmoji(hasError?: boolean): string {
  const emoji = FLASH_EMOJIS[emojiFlashIndex];
  emojiFlashIndex = (emojiFlashIndex + 1) % FLASH_EMOJIS.length;

  // Use cyan for streaming (different from final status colors)
  return colors.cyan(emoji);
}

function getStatusEmoji(hasError?: boolean): string {
  const emoji = '●'; // Use filled circle for final display

  // Color the emoji based on status
  if (hasError) {
    return colors.red(emoji);
  } else {
    return colors.green(emoji);
  }
}

function updateStreamingPreview(agentId: string): void {
  const stream = activeStreams.get(agentId);
  if (!stream || !stream.isStreaming) return;

  // Create preview content (50 characters max)
  const previewContent = stream.contentBuffer
    .replace(/\n/g, ' ') // Replace newlines with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  let displayContent = previewContent;
  if (displayContent.length > 50) {
    displayContent = displayContent.substring(0, 50);
  }

  // Count tokens (approximate: split by spaces and punctuation)
  const tokenCount = stream.contentBuffer
    .split(/[\s\.,;:!?\-'"()\[\]{}]+/)
    .filter(token => token.length > 0).length;

  // Format: ● agentName: [20 chars] ... (xxx tokens)
  const emoji = getCurrentEmoji(stream.hasError);
  const preview = `${emoji} ${stream.agentName}: ${displayContent} ... (${tokenCount} tokens)`;

  // Save current cursor position
  process.stdout.write(terminal.saveCursor());

  // Move to this agent's specific line
  const linesToMove = stream.lineOffset;
  if (linesToMove > 0) {
    process.stdout.write(terminal.cursorUp(linesToMove));
  }

  // Update the preview line by clearing and rewriting
  process.stdout.write(terminal.clearToEnd());
  process.stdout.write(terminal.cursorToColumn(0));
  process.stdout.write(preview);

  // Restore cursor position
  process.stdout.write(terminal.restoreCursor());
}

// Helper function to create content display without border
function createBorderedContent(agentName: string, content: string, hasError?: boolean): string {
  const statusEmoji = getStatusEmoji(hasError);

  // Prepare the first line with emoji and agent name (single space)
  const firstLine = `${statusEmoji} ${agentName}: `;

  // Split content into lines first to preserve newlines
  const contentLines = content.trim().split('\n');
  const lines: string[] = [];
  let isFirstLine = true;

  for (const contentLine of contentLines) {
    if (contentLine.trim() === '') {
      // Empty line - add empty line
      lines.push('');
      continue;
    }

    // Use full line without any border or artificial length limits
    const words = contentLine.trim().split(/\s+/);
    let currentLine = isFirstLine ? firstLine : '  '; // Add two spaces for indentation on subsequent lines

    // Simply add all words to the line (terminal will handle natural wrapping)
    for (const word of words) {
      const wordToAdd = (currentLine === firstLine || currentLine === '  ' ? '' : ' ') + word;
      // Apply gray color to content words (not to the emoji and agent name)
      if (currentLine === firstLine) {
        // First line: add gray color to content after agent name
        currentLine += colors.gray(wordToAdd);
      } else {
        // Subsequent lines: entire line should be gray with indentation
        currentLine += colors.gray(wordToAdd);
      }
    }

    if (currentLine.trim()) {
      lines.push(currentLine);
    }

    isFirstLine = false;
  }

  // Return lines without any border
  return lines.join('\n');
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
