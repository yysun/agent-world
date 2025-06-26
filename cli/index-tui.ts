/**
 * CLI Interface - Interactive Command Line Tool with Real-time Agent Streaming
 * 
 * Core Features:
 * - Interactive command interface (/agents, /show, /add, /help, etc.)
 * - External input handling (piped input and CLI args as broadcast messages)
 * - Real-time streaming with visual indicators and token tracking
 * - Multi-agent concurrent streaming with dedicated display management
 * - Terminal-kit UI with bordered input box for enhanced user experience
 * - World integration for agent loading, persistence, and message broadcasting
 * - Graceful shutdown and cleanup handling
 * 
 * Architecture:
 * - Function-based design with modular streaming display (streaming/streaming-display.ts)
 * - Terminal-kit integration for enhanced terminal UI with input box borders
 * - Command routing with direct World module function imports
 * - SSE event subscription for real-time agent response streaming
 * - External input processing for both piped and CLI argument inputs
 * 
 * UI Enhancements:
 * - Bordered input area using terminal-kit for improved visual clarity
 * - Clean terminal management with proper cursor handling
 * - Maintains compatibility with piped input for automation
 */

// npm run dev || echo "Test completed"
// echo "final piped test" | npx tsx cli/index.ts

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
import { loadSystemPrompt } from '../src/world-persistence';
import { getAgentConversationHistory } from '../src/agent-memory';
import { subscribeToSSE, subscribeToSystem, subscribeToMessages } from '../src/event-bus';
import { colors } from './utils/colors';
import { EventType, SSEEventPayload, SystemEventPayload, MessageEventPayload } from '../src/types';
import * as StreamingDisplay from './streaming/streaming-display';
import termkit from 'terminal-kit';

const term = termkit.terminal;

// Terminal UI utilities for input box
let inputBoxY = 0; // Track the Y position of the input box
let isFirstDraw = true; // Track if this is the first time drawing the box
let isInputBoxVisible = false; // Track if input box is currently visible

function hideInputBox() {
  if (isInputBoxVisible && inputBoxY > 0) {
    // Move to the input box position and clear it
    term.moveTo(1, inputBoxY);
    term.eraseDisplayBelow(); // Clear from cursor to end of screen
    isInputBoxVisible = false;
    isFirstDraw = true; // Reset for next draw to capture new position
  }
}

// Clear the current input line without moving cursor vertically
function clearInputArea() {
  term.column(3); // Move to position after left border and space (where prompt starts)
  term.eraseLineAfter();
}

function showInputPrompt(boxY: number = 0, prompt: string = '> ', userInput: string = '') {
  const width = term.width;
  const innerWidth = width - 4; // 2 for borders + 2 for padding

  // Calculate remaining width after prompt and user input
  const contentLength = prompt.length + userInput.length;
  const remainingWidth = Math.max(0, innerWidth - contentLength);

  if (isFirstDraw) {
    // First time drawing - save current position where output ended
    if (boxY > 0) {
      // Use provided position (for initial setup)
      inputBoxY = boxY;
    } else {
      // Capture current cursor position after screen output
      // Add some spacing and position input box appropriately
      console.log(); // Add one line of spacing after content
      // Position input box at current location, ensuring it fits on screen
      const currentLine = term.height - 5; // Conservative positioning
      inputBoxY = Math.max(3, Math.min(currentLine, term.height - 5));
    }
    isFirstDraw = false;

    // Move to desired position and draw the box
    term.moveTo(1, inputBoxY);
    term.cyan('┌' + '─'.repeat(width - 2) + '┐\n');
    term.cyan('│ ' + prompt + userInput + ' '.repeat(remainingWidth) + ' │\n');
    term.cyan('└' + '─'.repeat(width - 2) + '┘\n');
  } else {
    // Subsequent draws - go to the remembered position and redraw
    term.moveTo(1, inputBoxY);

    // Redraw the box with updated content
    term.cyan('┌' + '─'.repeat(width - 2) + '┐\n');
    term.cyan('│ ' + prompt + userInput + ' '.repeat(remainingWidth) + ' │\n');
    term.cyan('└' + '─'.repeat(width - 2) + '┘\n');
  }

  // Move cursor back up to the middle line, positioned after the prompt and user input
  term.up(2);
  term.right(2 + contentLength); // Position after the left border, space, prompt, and user input

  isInputBoxVisible = true;
  return { x: 2 + contentLength, y: inputBoxY + 1 };
}

// Load agents and display current state
async function loadAgents(worldName: string): Promise<void> {
  try {
    // Load world from disk if it exists
    try {
      await loadWorld(worldName);
    } catch (error) {
      // World doesn't exist on disk yet, that's okay
    }

    await listCommand([], worldName); // Display loaded agents
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

// Interactive world selection
async function selectWorldInteractively(worlds: string[]): Promise<string> {
  return new Promise((resolve) => {
    console.log(colors.cyan('\nMultiple worlds found:'));
    worlds.forEach((world, index) => {
      console.log(colors.gray(`  ${index + 1}. ${world}`));
    });

    let input = '';

    const handleKey = (name: string, matches: any, data: any) => {
      if (name === 'ENTER') {
        const selection = parseInt(input.trim());

        if (isNaN(selection) || selection < 1 || selection > worlds.length) {
          console.log(colors.yellow('Invalid selection. Please try again.'));
          console.log(colors.cyan(`\nSelect a world (1-${worlds.length}): `));
          input = '';
          return;
        }

        term.removeAllListeners('key');
        resolve(worlds[selection - 1]);
      } else if (name === 'BACKSPACE') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (data.isCharacter) {
        input += String.fromCharCode(data.codepoint);
        process.stdout.write(String.fromCharCode(data.codepoint));
      }
    };

    term.on('key', handleKey);
    console.log(colors.cyan(`\nSelect a world (1-${worlds.length}): `));
  });
}

// Estimate input tokens for streaming display
async function estimateInputTokens(agentName: string, worldName: string): Promise<number> {
  try {
    const agent = getAgent(worldName, agentName);
    if (!agent) return 50;

    // Load system prompt and recent conversation history
    const [systemPrompt, conversationHistory] = await Promise.all([
      loadSystemPrompt(worldName, agentName).catch(() => ''),
      getAgentConversationHistory(worldName, agentName, 10).catch(() => [])
    ]);

    // Token estimation: ~0.75 tokens per word
    const systemPromptTokens = Math.ceil(systemPrompt.split(/\s+/).length * 0.75);
    const conversationTokens = conversationHistory.reduce((total, msg) => {
      return total + Math.ceil(msg.content.split(/\s+/).length * 0.75);
    }, 0);

    // Add buffer for formatting and context
    return Math.max(50, systemPromptTokens + conversationTokens + 50);
  } catch (error) {
    return 50;
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

  // Set world name in streaming display
  StreamingDisplay.setCurrentWorldName(worldName);

  // Load agents and display current state
  await loadAgents(worldName);

  // Set up callback to show prompt when streaming ends
  StreamingDisplay.setOnAllStreamingEndCallback(() => {
    if (!hasPipedInput) {
      showInputPrompt(0, '> ', ''); // Always show empty input after streaming ends
    }
  });

  // Handle external input (piped or CLI arguments)
  let hasExternalInput = false;
  let externalMessage = '';
  let hasPipedInput = false;

  // Check for piped input
  let hasPotentialPipedInput = false;

  if (process.stdin.isTTY === false) {
    hasPotentialPipedInput = true;
  } else if (process.stdin.isTTY === undefined) {
    // For tsx/nodemon, check if data is immediately available
    try {
      const hasData = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 10);

        process.stdin.once('readable', () => {
          clearTimeout(timeout);
          resolve(true);
        });

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

  // Setup graceful shutdown (after hasPipedInput is defined)
  const shutdown = async () => {
    StreamingDisplay.resetStreamingState();
    if (!hasPipedInput) {
      term.grabInput(false);
      term.clear();
      term('\x1b[?25h'); // Show cursor
      term.moveTo(1, 1);
    }
    console.log(colors.cyan('\nGoodbye! 👋'));
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Create terminal-kit input interface
  let inputHandler: any;
  let currentInput = '';

  if (hasPipedInput) {
    console.log(colors.yellow('\nNote: Interactive mode not available after piped input.'));
  } else {
    // Initialize terminal for interactive mode
    term.grabInput(true);
    term.hideCursor();

    // Don't clear terminal - let content flow naturally
    term('\x1b[?25h'); // Show cursor using ANSI escape
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

  // Handle input with terminal-kit
  if (!hasPipedInput) {
    term.on('key', async (name: string, matches: any, data: any) => {
      if (name === 'CTRL_C') {
        await shutdown();
        return;
      }

      if (name === 'ENTER') {
        const trimmedInput = currentInput.trim();
        currentInput = '';

        if (!trimmedInput) {
          showInputPrompt(0, '> ', '');
          return;
        }

        // Hide the input box immediately after Enter is pressed
        hideInputBox();

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

          // Show input prompt immediately after command execution for commands
          showInputPrompt(0, '> ', '');
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

          // For broadcast messages, wait for streaming to complete or show prompt if no streaming
          setTimeout(() => {
            if (!StreamingDisplay.isStreamingActive()) {
              showInputPrompt(0, '> ', '');
            }
          }, 50);
        }

      } else if (name === 'BACKSPACE') {
        if (currentInput.length > 0) {
          currentInput = currentInput.slice(0, -1);
          showInputPrompt(0, '> ', currentInput);
        }
      } else if (data.isCharacter) {
        currentInput += String.fromCharCode(data.codepoint);
        showInputPrompt(0, '> ', currentInput);
      }
    });
  }

  // Subscribe to SSE events for streaming responses
  const unsubscribe = subscribeToSSE(async (event) => {
    if (event.type === EventType.SSE) {
      const sseData = event.payload as SSEEventPayload;

      // Get agent name for display
      const agents = getAgents(worldName);
      const agent = agents.find(a => a.name === sseData.agentName);
      const agentName = agent?.name || 'Unknown Agent';

      switch (sseData.type) {
        case 'start':
          const estimatedInputTokens = await estimateInputTokens(sseData.agentName, worldName);
          StreamingDisplay.startStreaming(sseData.agentName, agentName, estimatedInputTokens);
          break;
        case 'chunk':
          StreamingDisplay.addStreamingContent(sseData.agentName, sseData.content || '');
          break;
        case 'end':
          // Set usage information before ending streaming
          if (sseData.usage) {
            StreamingDisplay.setStreamingUsage(sseData.agentName, sseData.usage);
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
        StreamingDisplay.displayDebugMessage(colors.gray(systemData.content));
      }
    }
  });

  // Subscribe to MESSAGE events for system notifications
  subscribeToMessages(async (event) => {
    if (event.type === EventType.MESSAGE) {
      const messageData = event.payload as MessageEventPayload;
      // Display @human messages (e.g., turn limit notifications)
      if (messageData.content.startsWith('@human')) {
        StreamingDisplay.displayMessage(messageData);
      }
    }
  });

  // Handle piped input exit or show prompt
  if (hasExternalInput && hasPipedInput) {
    setTimeout(() => {
      if (!StreamingDisplay.isStreamingActive()) {
        console.log(colors.cyan('\nPiped input processed. Exiting...'));
        process.exit(0);
      } else {
        StreamingDisplay.setOnAllStreamingEndCallback(() => {
          console.log(colors.cyan('\nStreaming completed. Exiting...'));
          process.exit(0);
        });
      }
    }, 100);
  } else if (hasExternalInput) {
    setTimeout(() => {
      if (!StreamingDisplay.isStreamingActive()) {
        if (!hasPipedInput) {
          showInputPrompt(0, '> ', '');
        }
      }
    }, 100);
  } else {
    if (!hasPipedInput) {
      // Show instructions first, then draw input box
      console.log(colors.gray('Type a message to broadcast to all agents, or use /help for commands.'));
      console.log(); // Add spacing
      showInputPrompt(0, '> ', '');

      // Keep the process alive for interactive mode
      setInterval(() => { }, 1000);
    }
  }
}

// Run the CLI
main().catch((error) => {
  console.error(colors.red('Fatal error:'), error);
  cliLogger.error({ error }, 'Fatal CLI error occurred');
  process.exit(1);
});
