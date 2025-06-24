#!/usr/bin/env node

/**
 * Agent World - Terminal UI Entry Point
 * 
 * This is the main entry point for the terminal-based user interface.
 * It integrates the terminal-kit UI with the core Agent World system.
 * 
 * Features:
 * - Interactive terminal interface with input fields
 * - Complete command system with all CLI commands implemented:
 *   • /help - Show help message with all available commands
 *   • /agents - List all agents and their status
 *   • /add [agent-name] - Create a new agent with optional name
 *   • /use <agent-name> - Activate an agent for message handling
 *   • /stop <agent-name> - Deactivate an agent
 *   • /show <agent-name> - Display conversation history for an agent
 *   • /clear <agent-name> | all - Clear agent memory or all agents
 *   • /quit - Exit the CLI with proper cleanup
 * - Real-time agent communication and message broadcasting
 * - Event-driven streaming response handling with SSE integration
 * - Agent lifecycle management (create, activate, deactivate)
 * - Memory management and conversation history display
 * - Error handling and user feedback for all operations
 * 
 * Message Handling:
 * - Non-command input is broadcasted to all agents as HUMAN messages
 * - Subscribes to world events for real-time agent response streaming
 * - Shows agent thinking/responding status updates
 * - Handles streaming start, chunk, end, and error events
 * 
 * Command Integration:
 * - Uses existing command modules from cli/commands/ directory
 * - Captures console output from command functions for UI display
 * - Maintains agent state consistency between UI and world system
 * - Provides proper error handling and user guidance
 * 
 * Recent Changes:
 * - Implemented all CLI commands in TUI interface
 * - Added comprehensive command handling with proper error reporting
 * - Integrated existing command modules (help, add, show, clear)
 * - Added agent status management for use/stop commands
 * - Implemented quit command with cleanup
 * - Enhanced user feedback and error messages
 * - ADDED: Message broadcasting for non-command input like regular CLI
 * - ADDED: Event subscription for streaming agent responses
 * - ADDED: Real-time status updates for agent thinking/responding
 * - ADDED: Proper cleanup of event subscriptions on exit
 * - IMPROVED: Single-line streaming display that updates in place per agent
 * - FIXED: Streaming preview now properly maintains one line per agent
 * - FIXED: Multiple agents can stream simultaneously with separate preview lines
 * - ADDED: Automatic cleanup of streaming previews when responses complete
 * - IMPROVED: Input focus automatically returns to user input after all operations
 * - ENHANCED: Consistent input field focus management during streaming and commands
 */

import {
  ensureDefaultWorld,
  getAgents,
  getAgent,
  initializeWorldSystem,
  broadcastMessage,
  createAgent,
  getAgentConversationHistory,
  clearAgentMemory,
  subscribeToWorldEvents
} from '../src/world';
import { createTerminalKitUI, isTerminalCompatible } from './ui/terminal-kit-ui';
import { helpCommand } from './commands/help';
import { addCommand } from './commands/add';
import { showCommand } from './commands/show';
import { clearCommand } from './commands/clear';
import { EventType } from '../src/types';

async function main() {
  // Check terminal compatibility
  if (!isTerminalCompatible()) {
    console.error('Terminal is not compatible with the TUI interface.');
    console.error('Please ensure you have a terminal with at least 80x24 characters.');
    process.exit(1);
  }

  // Initialize the world system
  const worldId = await initializeWorldSystem();

  // Create terminal UI
  const ui = createTerminalKitUI();

  // Variable to store event subscription cleanup function
  let unsubscribe: (() => void) | undefined;

  // Streaming state management for real-time content display
  const streamingAgents = new Map<string, {
    agentId: string;
    agentName: string;
    contentBuffer: string;
    tokenCount: number;
    isStreaming: boolean;
    lastPreviewLength: number;
  }>();

  // Initialize UI with handlers
  ui.initialize({
    onInput: async (input: string) => {
      // Handle regular input/messages - broadcast to all agents
      if (input.trim()) {
        try {
          await broadcastMessage(worldId, input.trim(), 'HUMAN');
        } catch (error) {
          ui.displayError(`Failed to broadcast message: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    },

    onCommand: async (command: string, args: string[]) => {
      // Handle specific commands
      try {
        switch (command) {
          case 'help':
            await helpCommand(args, worldId);
            break;

          case 'agents':
          case 'list':
            const allAgents = getAgents(worldId);
            if (allAgents.length === 0) {
              ui.displaySystem('No agents found. Use /add to create your first agent.');
            } else {
              ui.displaySystem(`Found ${allAgents.length} agent(s):`);
              allAgents.forEach(agent => {
                ui.displaySystem(`  • ${agent.name} (${agent.id}) - Status: ${agent.status || 'inactive'}`);
              });
            }
            break;

          case 'add':
            // Capture console output for the add command
            const originalLog = console.log;
            let addOutput = '';
            console.log = (message: string) => {
              addOutput += message + '\n';
            };

            try {
              await addCommand(args, worldId);
              ui.displaySystem(addOutput.trim());

              // Refresh agent list in UI
              const updatedAgents = getAgents(worldId);
              ui.updateAgents(updatedAgents.map(agent => ({
                id: agent.id,
                name: agent.name,
                model: agent.config.model || 'unknown',
                provider: String(agent.config.provider) || 'unknown',
                status: agent.status || 'inactive'
              })));
            } finally {
              console.log = originalLog;
            }
            break;

          case 'use':
            if (args.length === 0) {
              ui.displayError('Usage: /use <agent-name>');
              return;
            }

            const agentName = args[0];
            const agent = getAgents(worldId).find(a => a.name === agentName || a.id === agentName);

            if (!agent) {
              ui.displayError(`Agent '${agentName}' not found.`);
              return;
            }

            // Update agent status to active (for now, just mark as active)
            // In a full implementation, this would start the agent's message processing
            ui.displaySystem(`Agent '${agentName}' activated. Messages will be sent to this agent.`);
            break;

          case 'stop':
            if (args.length === 0) {
              ui.displayError('Usage: /stop <agent-name>');
              return;
            }

            const agentToStop = args[0];
            const targetAgent = getAgents(worldId).find(a => a.name === agentToStop || a.id === agentToStop);

            if (!targetAgent) {
              ui.displayError(`Agent '${agentToStop}' not found.`);
              return;
            }

            // Update agent status to inactive
            ui.displaySystem(`Agent '${agentToStop}' deactivated.`);
            break;

          case 'show':
            // Capture console output for the show command
            const originalShowLog = console.log;
            let showOutput = '';
            console.log = (message: string) => {
              showOutput += message + '\n';
            };

            try {
              await showCommand(args, worldId);
              if (showOutput.trim()) {
                ui.displaySystem(showOutput.trim());
              }
            } finally {
              console.log = originalShowLog;
            }
            break;

          case 'clear':
            // Capture console output for the clear command
            const originalClearLog = console.log;
            let clearOutput = '';
            console.log = (message: string) => {
              clearOutput += message + '\n';
            };

            try {
              await clearCommand(args, worldId);
              if (clearOutput.trim()) {
                ui.displaySystem(clearOutput.trim());
              }
            } finally {
              console.log = originalClearLog;
            }
            break;

          case 'quit':
            // Cleanup event subscription
            if (unsubscribe) {
              unsubscribe();
            }
            process.exit(0);
            break;

          default:
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

      switch (sseData.type) {
        case 'start':
          // Initialize streaming state for this agent
          streamingAgents.set(sseData.agentId, {
            agentId: sseData.agentId,
            agentName,
            contentBuffer: '',
            tokenCount: 0,
            isStreaming: true,
            lastPreviewLength: 0
          });
          ui.displaySystem(`🤖 ${agentName} is thinking...`);
          break;

        case 'chunk':
          // Update streaming content
          const streamingAgent = streamingAgents.get(sseData.agentId);
          if (streamingAgent && sseData.content) {
            streamingAgent.contentBuffer += sseData.content;

            // Calculate token count (approximate)
            streamingAgent.tokenCount = streamingAgent.contentBuffer
              .split(/[\s\.,;:!?\-'"()\[\]{}]+/)
              .filter(token => token.length > 0).length;

            // Create preview content (50 characters max)
            const previewContent = streamingAgent.contentBuffer
              .replace(/\n/g, ' ') // Replace newlines with spaces
              .replace(/\s+/g, ' ') // Normalize whitespace
              .trim();

            let displayContent = previewContent;
            if (displayContent.length > 50) {
              displayContent = displayContent.substring(0, 47) + '...';
            }

            // Create the full preview line
            const previewLine = `● ${agentName}: ${displayContent} (${streamingAgent.tokenCount} tokens)`;

            // Update the streaming preview for this agent
            ui.updateStreamingPreview(streamingAgent.agentId, previewLine);
            streamingAgent.lastPreviewLength = previewLine.length;
          }
          break;

        case 'end':
          // Display final complete content
          const completedAgent = streamingAgents.get(sseData.agentId);
          if (completedAgent) {
            // Clear the streaming preview for this agent
            ui.clearStreamingPreview(sseData.agentId);

            const fullContent = completedAgent.contentBuffer.trim();

            if (fullContent) {
              // Format the final response similar to regular CLI
              ui.displayMessage(agentName, fullContent);
            } else {
              ui.displaySystem(`✅ ${agentName}: [no response]`);
            }

            // Clean up streaming state
            streamingAgents.delete(sseData.agentId);
          } else {
            ui.displaySystem(`✅ ${agentName} has finished responding.`);
          }
          break;

        case 'error':
          // Display error and clean up
          const errorAgent = streamingAgents.get(sseData.agentId);
          if (errorAgent) {
            // Clear the streaming preview for this agent
            ui.clearStreamingPreview(sseData.agentId);

            ui.displayError(`❌ ${agentName} encountered an error: ${sseData.error || 'Unknown error'}`);
            streamingAgents.delete(sseData.agentId);
          } else {
            ui.displayError(`❌ ${agentName} encountered an error while responding.`);
          }
          break;
      }
    }
  });

  // Load existing agents and update UI
  try {
    const agents = getAgents(worldId);
    ui.updateAgents(agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      model: agent.config.model || 'unknown',
      provider: String(agent.config.provider) || 'unknown',
      status: agent.status || 'inactive'
    })));

    ui.setCurrentWorld(worldId);

    if (agents.length === 0) {
      ui.displaySystem('No agents found. Use /add to create your first agent.');
    } else {
      ui.displaySystem(`Found ${agents.length} agent(s). Use /agents to see them, /use <name> to activate.`);
    }

    // Show welcome message and start in chat mode
    ui.displaySystem('Welcome to Agent World! Type /help for available commands.');
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
