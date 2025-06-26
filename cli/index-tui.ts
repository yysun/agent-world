#!/usr/bin/env node

/**
 * TUI Interface - Interactive Terminal UI Tool with Real-time Agent Streaming
 * 
 * Features:
 * - Interactive terminal interface with 2-part screen layout and input fields
 * - Unified external input: piped input and CLI args treated as user messages to broadcast
 * - Real-time streaming with flashing emoji indicators and token counting (via StreamingDisplay module)
 * - Multi-agent concurrent streaming with dedicated line positioning
 * - Agent conversation history display and memory management
 * - World object integration for agent loading and persistence
 * - Console output capture for consistent command execution display
 * - Graceful shutdown handling and clean terminal interaction
 * 
 * Architecture:
 * - Function-based streaming display manager in separate module (streaming/streaming-display.ts)
 * - Command routing system with direct World function imports
 * - External input processing for both piped input and CLI arguments
 * - SSE event subscription for real-time agent response streaming
 * - Terminal control integration via imported streaming display module
 * - TUI-specific 2-part screen layout with terminal-kit UI components
 * 
 * Recent Changes:
 * - Updated to match index.ts functionality while preserving TUI interface
 * - Integrated StreamingDisplay module for consistent streaming behavior
 * - Added complete command support including export functionality
 * - Enhanced event handling for SYSTEM and MESSAGE events
 * - Added external input processing and graceful shutdown handling
 * - Maintained TUI-specific console output capture and UI updates
 */

import {
  loadWorlds,
  loadWorldFromDisk,
  createWorld,
  loadWorld,
  getAgents,
  getAgent,
  broadcastMessage,
  DEFAULT_WORLD_NAME
} from '../src/world';
import { loadSystemPrompt } from '../src/world-persistence';
import { getAgentConversationHistory } from '../src/agent-memory';
import { subscribeToSSE, subscribeToSystem, subscribeToMessages } from '../src/event-bus';
import { createTerminalKitUI, isTerminalCompatible } from './ui/terminal-kit-ui';
import { helpCommand } from './commands/help';
import { addCommand } from './commands/add';
import { clearCommand } from './commands/clear';
import { exportCommand } from './commands/export';
import { listCommand } from './commands/list';
import { showCommand } from './commands/show';
import { stopCommand } from './commands/stop';
import { useCommand } from './commands/use';
import { EventType, SSEEventPayload, SystemEventPayload, MessageEventPayload } from '../src/types';
import { colors, terminal } from './utils/colors';
import { cliLogger } from '../src/logger';
import * as StreamingDisplay from './streaming/streaming-display';

async function main() {
  // Initialize the world system
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
      // Multiple worlds found - for TUI, just use the first one
      // (TUI doesn't support interactive selection yet)
      await loadWorldFromDisk(worlds[0]);
      worldName = worlds[0];
      break;

    default:
      throw new Error('Unexpected world loading action');
  }

  // Set world name in streaming display for message storage
  StreamingDisplay.setCurrentWorldName(worldName);

  // Load all agents from our world (same as index.ts)
  await loadAgents(worldName);

  // Set up callback to handle streaming completion (adapted for TUI)
  StreamingDisplay.setOnAllStreamingEndCallback(() => {
    // For TUI, we don't need to prompt since it has its own input handling
    // TUI input remains available throughout streaming
  });

  // Check terminal compatibility
  if (!isTerminalCompatible()) {
    console.error('Terminal is not compatible with the TUI interface.');
    console.error('Please ensure you have a terminal with at least 80x24 characters.');
    process.exit(1);
  }

  // Create terminal UI
  const ui = createTerminalKitUI();

  // Handle graceful shutdown
  const shutdown = async () => {
    StreamingDisplay.resetStreamingState(); // Clean up streaming resources
    if (unsubscribeSSE) unsubscribeSSE();
    if (unsubscribeSystem) unsubscribeSystem();
    if (unsubscribeMessages) unsubscribeMessages();
    console.log(colors.cyan('\nGoodbye! 👋'));
    process.exit(0);
  };

  // Setup signal handlers
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Handle input from piped input or command line arguments (adapted for TUI)
  let hasExternalInput = false;
  let externalMessage = '';

  // Check for command line arguments (TUI may not support piped input well)
  const args = process.argv.slice(2);
  if (args.length > 0) {
    hasExternalInput = true;
    externalMessage = args.join(' ');
  }

  // Set up callback to handle streaming completion (adapted for TUI)
  StreamingDisplay.setOnAllStreamingEndCallback(() => {
    // For TUI, we don't need to prompt since it has its own input handling
  });

  // Variables to store event subscription cleanup functions
  let unsubscribeSSE: (() => void) | undefined;
  let unsubscribeSystem: (() => void) | undefined;
  let unsubscribeMessages: (() => void) | undefined;

  // Load agents function (merged from loader.ts - same as index.ts)
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

  // Quit command implementation (same as index.ts)
  async function quitCommand(args: string[], worldName: string): Promise<void> {
    console.log(colors.cyan('Goodbye! 👋'));
    process.exit(0);
  }

  // Command registry (same pattern as index.ts)
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

  // Initialize UI with handlers
  ui.initialize({
    onInput: async (input: string) => {
      // Handle regular input/messages - broadcast to all agents (matches index.ts pattern)
      if (input.trim()) {
        try {
          // Display the user's input using StreamingDisplay for consistency
          StreamingDisplay.displayFormattedMessage({
            sender: 'you',
            content: input.trim(),
            metadata: { source: 'cli', messageType: 'command' }
          });

          // Small delay to ensure display completes before broadcasting
          await new Promise(resolve => setTimeout(resolve, 25));

          await broadcastMessage(worldName, input.trim(), 'HUMAN');
        } catch (error) {
          ui.displayError(`Failed to broadcast message: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    },

    onCommand: async (command: string, args: string[]) => {
      // Handle specific commands using command registry (similar to index.ts)
      try {
        const cmd = commands[command];
        if (cmd) {
          // Capture console output for the command
          const originalLog = console.log;
          let commandOutput = '';
          console.log = (message: string) => {
            commandOutput += message + '\n';
          };

          try {
            await cmd(args, worldName);
            if (commandOutput.trim()) {
              ui.displaySystem(commandOutput.trim());
            }

            // For add command, refresh agent list in UI
            if (command === 'add') {
              const updatedAgents = getAgents(worldName);
              ui.updateAgents(updatedAgents.map(agent => ({
                name: agent.name,
                model: agent.config.model || 'unknown',
                provider: String(agent.config.provider) || 'unknown',
                status: agent.status || 'inactive'
              })));
            }
          } finally {
            console.log = originalLog;
          }
        } else {
          ui.displayError(`Unknown command: ${command}`);
          ui.displaySystem('Type /help to see available commands.');
        }
      } catch (error) {
        ui.displayError(`Command error: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    onQuit: () => {
      if (unsubscribeSSE) unsubscribeSSE();
      if (unsubscribeSystem) unsubscribeSystem();
      if (unsubscribeMessages) unsubscribeMessages();
      StreamingDisplay.resetStreamingState();
      process.exit(0);
    }
  });

  // Subscribe to SSE events for agent streaming responses (matches index.ts)
  unsubscribeSSE = subscribeToSSE(async (event) => {
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
          const estimatedInputTokens = await estimateInputTokens(sseData.agentName, worldName);
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

  // Subscribe to SYSTEM events for debug messages (matches index.ts)
  unsubscribeSystem = subscribeToSystem(async (event) => {
    if (event.type === EventType.SYSTEM) {
      const systemData = event.payload as SystemEventPayload;
      if (systemData.action === 'debug' && systemData.content) {
        // Display debug messages properly during streaming
        StreamingDisplay.displayDebugMessage(colors.gray(systemData.content));
      }
    }
  });

  // Subscribe to MESSAGE events for system messages (like turn limit notifications) (matches index.ts)
  unsubscribeMessages = subscribeToMessages(async (event) => {
    if (event.type === EventType.MESSAGE) {
      const messageData = event.payload as MessageEventPayload;
      // Display @human messages from system OR agents (for turn limit notifications)
      if (messageData.content.startsWith('@human')) {
        // Display @human messages with red dot, showing who sent it
        StreamingDisplay.displayMessage(messageData);
      }
    }
  });

  // Load existing agents and update UI (same approach as index.ts)
  try {
    const agents = getAgents(worldName);
    ui.updateAgents(agents.map(agent => ({
      name: agent.name,
      model: agent.config.model || 'unknown',
      provider: String(agent.config.provider) || 'unknown',
      status: agent.status || 'inactive'
    })));

    ui.setCurrentWorld(worldName);

    // Show welcome message similar to index.ts
    ui.displaySystem('Type a message to broadcast to all agents, or use /help for commands.');

    // Automatically show agents list in gray (using command registry)
    const agentsCmd = commands.agents;
    if (agentsCmd) {
      // Capture console output for the agents command
      const originalLog = console.log;
      let commandOutput = '';
      console.log = (message: string) => {
        commandOutput += message + '\n';
      };

      try {
        await agentsCmd([], worldName);
        if (commandOutput.trim()) {
          ui.displaySystem(commandOutput.trim());
        }
      } finally {
        console.log = originalLog;
      }
    }

    // If we have external input, process it (matches index.ts pattern)
    if (hasExternalInput && externalMessage) {
      StreamingDisplay.displayFormattedMessage({
        sender: 'you',
        content: externalMessage,
        metadata: { source: 'cli', messageType: 'command' }
      });
      try {
        await broadcastMessage(worldName, externalMessage, 'HUMAN');
      } catch (error) {
        ui.displayError(`Error broadcasting message: ${error}`);
      }
    }

    ui.setMode('chat' as any);
  } catch (error) {
    ui.displayError(`Failed to load agents: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Debug utility: prints debug data in gray
function debug(...args: any[]) {
  // Print debug output in gray color
  console.log(colors.gray('[debug]'), ...args);
}

// Function to estimate input tokens from conversation history
async function estimateInputTokens(agentName: string, worldName: string): Promise<number> {
  try {
    const agent = getAgent(worldName, agentName);
    if (!agent) return 50; // Default estimate if agent not found

    // Load actual system prompt and recent conversation history
    const [systemPrompt, conversationHistory] = await Promise.all([
      loadSystemPrompt(worldName, agentName).catch(() => ''),
      getAgentConversationHistory(worldName, agentName, 10).catch(() => [])
    ]);

    // Rough token estimation: ~0.75 tokens per word
    const systemPromptTokens = Math.ceil(systemPrompt.split(/\s+/).length * 0.75);

    // Estimate tokens from recent conversation (last 10 messages)
    const conversationTokens = conversationHistory.reduce((total, msg) => {
      return total + Math.ceil(msg.content.split(/\s+/).length * 0.75);
    }, 0);

    // Add buffer for instruction formatting and context
    const totalEstimate = systemPromptTokens + conversationTokens + 50;

    return Math.max(50, totalEstimate);
  } catch (error) {
    return 50; // Default fallback
  }
}

// Interactive world selection when multiple worlds exist (for potential future use)
async function selectWorldInteractively(worlds: string[]): Promise<string> {
  // For TUI, just return the first world (auto-select behavior)
  // This function is kept for compatibility but TUI doesn't support interactive selection
  return worlds[0];
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
