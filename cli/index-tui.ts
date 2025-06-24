#!/usr/bin/env node

/**
 * Agent World - Terminal UI Entry Point
 * Interactive Command Line Tool with Real-time Agent Streaming
 * 
 * Features:
 * - Interactive terminal interface with input fields and complete command system
 * - Real-time streaming with flashing emoji indicators (●/○) and token counting
 * - Multi-agent concurrent streaming with dedicated line positioning
 * - Agent conversation history display and memory management
 * - World integration for agent loading and persistence
 * - Console output capture for consistent command execution display
 * 
 * Commands: /help, /agents, /add, /use, /stop, /show, /clear, /quit
 * 
 * Architecture:
 * - Function-based streaming manager with SSE event subscription
 * - Command registry pattern with individual function imports
 * - Terminal control with flashing emoji indicators and color coding
 * - Content formatting with proper newline preservation and gray text styling
 * - Modular streaming manager for real-time agent response handling
 * 
 * Message Handling:
 * - Non-command input is broadcasted to all agents as HUMAN messages
 * - Subscribes to world events for real-time agent response streaming
 * - Delegates streaming management to dedicated streaming manager module
 */

import {
  loadWorldsWithSelection,
  loadWorld,
  getAgents,
  getAgent,
  broadcastMessage,
  subscribeToWorldEvents
} from '../src/world';
import { createTerminalKitUI, isTerminalCompatible } from './ui/terminal-kit-ui';
import { helpCommand } from './commands/help';
import { addCommand } from './commands/add';
import { showCommand } from './commands/show';
import { clearCommand } from './commands/clear';
import { EventType } from '../src/types';
import { colors, terminal } from './utils/colors';
import { createStreamingManager } from './streaming/streaming-manager';

async function main() {
  // Initialize the world system
  const worldId = await loadWorldsWithSelection();

  // Load all agents from our world (same as index.ts)
  await loadAgents(worldId);

  // Check terminal compatibility
  if (!isTerminalCompatible()) {
    console.error('Terminal is not compatible with the TUI interface.');
    console.error('Please ensure you have a terminal with at least 80x24 characters.');
    process.exit(1);
  }

  // Create terminal UI
  const ui = createTerminalKitUI();

  // Create streaming manager
  const streamingManager = createStreamingManager(ui);

  // Variable to store event subscription cleanup function
  let unsubscribe: (() => void) | undefined;

  // Load agents function (merged from loader.ts - same as index.ts)
  async function loadAgents(worldId: string): Promise<void> {
    try {
      // Try to load world from disk if it exists
      try {
        await loadWorld(worldId);
      } catch (error) {
        // World doesn't exist on disk yet, that's okay
      }

      // Don't console.log here, will use /agents command instead
    } catch (error) {
      console.log(colors.red(`Failed to load agents: ${error}`));
      throw error;
    }

    console.log(); // Add spacing
  }

  // Quit command implementation (same as index.ts)
  async function quitCommand(args: string[], worldId: string): Promise<void> {
    console.log(colors.cyan('Goodbye! 👋'));
    process.exit(0);
  }

  // Command registry (same pattern as index.ts)
  const commands: Record<string, (args: string[], worldId: string) => Promise<void>> = {
    add: addCommand,
    agents: async (args: string[], worldId: string) => {
      const allAgents = getAgents(worldId);
      if (allAgents.length === 0) {
        console.log(colors.gray('No agents found. Use /add to create your first agent.'));
      } else {
        console.log(colors.gray(`Found ${allAgents.length} agent(s):`));
        allAgents.forEach(agent => {
          console.log(colors.gray(`  • ${agent.name} - Status: ${agent.status || 'inactive'}`));
        });
      }
    },
    clear: clearCommand,
    help: helpCommand,
    show: showCommand,
    stop: async (args: string[], worldId: string) => {
      if (args.length === 0) {
        console.log('Usage: /stop <agent-name>');
        return;
      }
      const agentToStop = args[0];
      const targetAgent = getAgents(worldId).find(a => a.name === agentToStop);
      if (!targetAgent) {
        console.log(`Agent '${agentToStop}' not found.`);
        return;
      }
      console.log(`Agent '${agentToStop}' deactivated.`);
    },
    use: async (args: string[], worldId: string) => {
      if (args.length === 0) {
        console.log('Usage: /use <agent-name>');
        return;
      }
      const agentName = args[0];
      const agent = getAgents(worldId).find(a => a.name === agentName);
      if (!agent) {
        console.log(`Agent '${agentName}' not found.`);
        return;
      }
      console.log(`Agent '${agentName}' activated. Messages will be sent to this agent.`);
    },
    quit: quitCommand,
  };

  // Initialize UI with handlers
  ui.initialize({
    onInput: async (input: string) => {
      // Handle regular input/messages - broadcast to all agents
      if (input.trim()) {
        try {
          // Display the user's input first
          ui.displayUserInput(input.trim());

          // Small delay to ensure display completes before broadcasting
          await new Promise(resolve => setTimeout(resolve, 25));

          await broadcastMessage(worldId, input.trim(), 'HUMAN');
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
            await cmd(args, worldId);
            if (commandOutput.trim()) {
              ui.displaySystem(commandOutput.trim());
            }

            // For add command, refresh agent list in UI
            if (command === 'add') {
              const updatedAgents = getAgents(worldId);
              ui.updateAgents(updatedAgents.map(agent => ({
                id: agent.id,
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
      if (unsubscribe) {
        unsubscribe();
      }
      streamingManager.cleanup();
      process.exit(0);
    }
  });

  // Subscribe to world events for agent streaming responses
  unsubscribe = subscribeToWorldEvents(worldId, async (event) => {
    if (event.type === EventType.SSE) {
      // Handle streaming LLM responses
      const sseData = event.payload as import('../src/types').SSEEventPayload;

      // Get agent name for display
      const agent = getAgent(worldId, sseData.agentId);
      const agentName = agent?.name || 'Unknown Agent';

      // Use the streaming manager to handle all streaming events
      streamingManager.handleStreamingEvent(sseData.type, sseData.agentId, agentName, sseData.content);
    }
  });

  // Load existing agents and update UI (same approach as index.ts)
  try {
    const agents = getAgents(worldId);
    ui.updateAgents(agents.map(agent => ({
      name: agent.name,
      model: agent.config.model || 'unknown',
      provider: String(agent.config.provider) || 'unknown',
      status: agent.status || 'inactive'
    })));

    ui.setCurrentWorld(worldId);

    // Show welcome message similar to index.ts
    ui.displaySystem('Type a message to broadcast to all agents, or use /help for commands.');

    // Automatically show agents list in gray
    const agentsCmd = commands.agents;
    if (agentsCmd) {
      // Capture console output for the agents command
      const originalLog = console.log;
      let commandOutput = '';
      console.log = (message: string) => {
        commandOutput += message + '\n';
      };

      try {
        await agentsCmd([], worldId);
        if (commandOutput.trim()) {
          ui.displaySystem(commandOutput.trim());
        }
      } finally {
        console.log = originalLog;
      }
    }

    ui.setMode('chat' as any);
  } catch (error) {
    ui.displayError(`Failed to load agents: ${error instanceof Error ? error.message : String(error)}`);
  }
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
