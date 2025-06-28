/**
 * CLI Interface - Interactive Command Line Tool with Real-time Agent Streaming
 * 
 * Core Features:
 * - Interactive command interface (/agents, /show, /add, /help, etc.)
 * - External input handling (piped input and CLI args as broadcast messages)
 * - Real-time streaming with visual indicators and token tracking
 * - Multi-agent concurrent streaming with dedicated display management
 * - Modular terminal UI with separated display, lifecycle, and coordination concerns
 * - World integration for agent loading, persistence, and message broadcasting
 * - Graceful shutdown and cleanup handling
 * 
 * Architecture:
 * - Function-based design with modular UI components (ui/terminal-display.ts, ui/terminal-lifecycle.ts, ui/display-manager.ts)
 * - Terminal-kit integration with dynamic import for ES module compatibility
 * - Command routing with direct World module function imports
 * - SSE event subscription for real-time agent response streaming
 * - External input processing for both piped and CLI argument inputs
 * - Separated concerns: display logic, terminal lifecycle, and display coordination
 * 
 * UI Architecture:
 * - terminal-display.ts: Input box drawing, positioning, and visibility management
 * - terminal-lifecycle.ts: Terminal setup, shutdown, signal handling, and piped input detection
 * - display-manager.ts: Coordination between streaming, input prompts, and exit timing
 * - streaming-display.ts: Real-time streaming content and agent response management
 * - unified-display.ts: Consistent message formatting and spacing across all display types
 * 
 * Refactoring Changes:
 * - Extracted terminal UI state and functions into dedicated modules
 * - Centralized terminal lifecycle management for consistent initialization/cleanup
 * - Separated display coordination logic for better maintainability
 * - Maintained all existing functionality while improving code organization
 * - Preserved function-based approach following project guidelines
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
import { colors } from './ui/colors';
import { EventType, SSEEventPayload, SystemEventPayload, MessageEventPayload } from '../src/types';
import * as StreamingDisplay from './ui/streaming-display';
import { displayUnifiedMessage, setCurrentWorldName } from './ui/unified-display';
import {
  initializeTerminalDisplay,
  hideInputBox,
  showInputPrompt
} from './ui/terminal-display';
import {
  initializeTerminal,
  setupShutdownHandlers,
  getTerminal,
  detectPipedInput,
  readPipedInput,
  performShutdown,
  hasPipedInput
} from './ui/terminal-lifecycle';
import {
  setupStreamingEndCallback,
  handleExternalInputDisplay,
  showInitialPrompt,
  handlePostCommandDisplay,
  handlePostBroadcastDisplay
} from './ui/display-manager';

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
    displayUnifiedMessage({
      type: 'error',
      content: `Failed to load agents: ${error}`,
      metadata: { source: 'cli', messageType: 'error' }
    });
    cliLogger.error({ error }, 'Failed to load agents during CLI startup');
    throw error;
  }
}

// Quit command implementation
async function quitCommand(args: string[], worldName: string): Promise<void> {
  displayUnifiedMessage({
    type: 'instruction',
    content: 'Goodbye! 👋',
    metadata: { source: 'cli', messageType: 'command' }
  });
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
  const term = getTerminal();
  return new Promise((resolve) => {
    displayUnifiedMessage({
      type: 'instruction',
      content: 'Multiple worlds found:\n' + worlds.map((world, index) => `  ${index + 1}. ${world}`).join('\n'),
      metadata: { source: 'cli', messageType: 'command' }
    });

    let input = '';

    const handleKey = (name: string, matches: any, data: any) => {
      if (name === 'ENTER') {
        const selection = parseInt(input.trim());

        if (isNaN(selection) || selection < 1 || selection > worlds.length) {
          displayUnifiedMessage({
            type: 'command',
            content: 'Invalid selection. Please try again.',
            commandSubtype: 'warning',
            metadata: { source: 'cli', messageType: 'command' }
          });
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
    const conversationTokens = conversationHistory.reduce((total: number, msg) => {
      return total + Math.ceil(msg.content.split(/\s+/).length * 0.75);
    }, 0 as number);

    // Add buffer for formatting and context
    return Math.max(50, systemPromptTokens + conversationTokens + 50);
  } catch (error) {
    return 50;
  }
}

async function main() {
  // Detect piped input first
  const hasPipedInputDetected = await detectPipedInput();

  // Initialize terminal
  const term = await initializeTerminal(hasPipedInputDetected);
  initializeTerminalDisplay(term);

  // Setup graceful shutdown handlers
  setupShutdownHandlers();

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
  setCurrentWorldName(worldName);

  // Load agents and display current state
  await loadAgents(worldName);

  // Set up callback to show prompt when streaming ends
  setupStreamingEndCallback();

  // Handle external input (piped or CLI arguments)
  let hasExternalInput = false;
  let externalMessage = '';

  if (hasPipedInputDetected) {
    hasExternalInput = true;
    externalMessage = await readPipedInput();
  } else {
    // Check for command line arguments
    const args = process.argv.slice(2);
    if (args.length > 0) {
      hasExternalInput = true;
      externalMessage = args.join(' ');
    }
  }

  // Setup graceful shutdown (after hasPipedInputDetected is defined)
  const shutdown = async () => {
    await performShutdown();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Create terminal-kit input interface
  let inputHandler: any;
  let currentInput = '';

  if (hasPipedInputDetected) {
    displayUnifiedMessage({
      type: 'instruction',
      content: 'Note: Interactive mode not available after piped input.',
      metadata: { source: 'cli', messageType: 'notification' }
    });
  } else {
    // Terminal is already initialized for interactive mode in initializeTerminal()
  }

  // If we have external input, broadcast it
  if (hasExternalInput && externalMessage) {
    displayUnifiedMessage({
      type: 'human',
      content: externalMessage,
      sender: 'you',
      metadata: { source: 'cli', messageType: 'command' }
    });
    try {
      await broadcastMessage(worldName, externalMessage, 'HUMAN');
    } catch (error) {
      displayUnifiedMessage({
        type: 'error',
        content: `Error broadcasting message: ${error}`,
        metadata: { source: 'cli', messageType: 'error' }
      });
    }
  }

  // Handle input with terminal-kit
  if (!hasPipedInputDetected) {
    const term = getTerminal();
    term.on('key', async (name: string, matches: any, data: any) => {
      if (name === 'CTRL_C') {
        await shutdown();
        return;
      }

      if (name === 'ENTER') {
        const trimmedInput = currentInput.trim();
        currentInput = '';

        if (!trimmedInput) {
          showInputPrompt('> ', '');
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
              displayUnifiedMessage({
                type: 'error',
                content: `Error executing command: ${error}`,
                metadata: { source: 'cli', messageType: 'error' }
              });
            }
          } else {
            displayUnifiedMessage({
              type: 'command',
              content: `Unknown command: /${commandName}`,
              commandSubtype: 'warning',
              metadata: { source: 'cli', messageType: 'command' }
            });
            await helpCommand([], worldName);
          }

          // Reset position and show input prompt immediately after command execution
          handlePostCommandDisplay();
        } else {
          // Broadcast message to all agents
          displayUnifiedMessage({
            type: 'human',
            content: trimmedInput,
            sender: 'you',
            metadata: { source: 'cli', messageType: 'command' }
          });
          try {
            await broadcastMessage(worldName, trimmedInput, 'HUMAN');
          } catch (error) {
            displayUnifiedMessage({
              type: 'error',
              content: `Error broadcasting message: ${error}`,
              metadata: { source: 'cli', messageType: 'error' }
            });
          }

          // For broadcast messages, wait for streaming to complete or show prompt if no streaming
          handlePostBroadcastDisplay();
        }

      } else if (name === 'BACKSPACE') {
        if (currentInput.length > 0) {
          currentInput = currentInput.slice(0, -1);
          showInputPrompt('> ', currentInput);
        }
      } else if (data.isCharacter) {
        currentInput += String.fromCharCode(data.codepoint);
        showInputPrompt('> ', currentInput);
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
  handleExternalInputDisplay(hasExternalInput, hasPipedInputDetected);

  if (!hasExternalInput) {
    showInitialPrompt();

    // Keep the process alive for interactive mode
    if (!hasPipedInputDetected) {
      setInterval(() => { }, 1000);
    }
  }
}

// Run the CLI
main().catch((error) => {
  displayUnifiedMessage({
    type: 'error',
    content: `Fatal error: ${error}`,
    metadata: { source: 'cli', messageType: 'error' }
  });
  cliLogger.error({ error }, 'Fatal CLI error occurred');
  process.exit(1);
});
