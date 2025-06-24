#!/usr/bin/env node

/**
 * Agent World - Terminal UI Entry Point
 * 
 * This is the main entry point for the terminal-based user interface.
 * It integrates the terminal-kit UI with the core Agent World system.
 * 
 * Features:
 * - Interactive terminal interface with input fields
 * - Multi-mode UI system (chat, agent management, etc.)
 * - Real-time agent communication
 * - Command processing and agent lifecycle management
 */

import {
  ensureDefaultWorld,
  getAgents,
  getAgent,
  initializeWorldSystem,
  broadcastMessage
} from '../src/world';
import { createTerminalKitUI, isTerminalCompatible } from './ui/terminal-kit-ui';

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
          case 'agents':
          case 'list':
            const agents = getAgents(worldId);
            ui.updateAgents(agents.map(agent => ({
              id: agent.id,
              name: agent.name,
              model: agent.config.model || 'unknown',
              provider: String(agent.config.provider) || 'unknown',
              status: agent.status || 'inactive'
            })));
            ui.setMode('list_agents' as any);
            break;

          case 'add':
            ui.setMode('add_agent' as any);
            ui.displaySystem('Add agent functionality coming soon...');
            break;

          case 'use':
            if (args.length === 0) {
              ui.displayError('Usage: /use <agent-name>');
              return;
            }

            const agentName = args[0];
            const agent = getAgents(worldId).find(a => a.name === agentName);

            if (!agent) {
              ui.displayError(`Agent '${agentName}' not found.`);
              return;
            }

            // For now, just mark as active (real implementation would start the agent)
            ui.displaySystem(`Agent '${agentName}' would be activated (implementation needed).`);
            break;

          case 'stop':
            if (args.length === 0) {
              ui.displayError('Usage: /stop <agent-name>');
              return;
            }

            const agentToStop = args[0];
            const targetAgent = getAgents(worldId).find(a => a.name === agentToStop);

            if (!targetAgent) {
              ui.displayError(`Agent '${agentToStop}' not found.`);
              return;
            }

            // For now, just show message (real implementation would stop the agent)
            ui.displaySystem(`Agent '${agentToStop}' would be stopped (implementation needed).`);
            break;

          default:
            ui.displayError(`Unknown command: ${command}`);
        }
      } catch (error) {
        ui.displayError(`Command error: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    onQuit: () => {
      // Cleanup on quit
      const agents = getAgents(worldId);
      for (const agent of agents) {
        // For now, just log (real implementation would stop agents)
        console.log(`Would stop agent ${agent.name}`);
      }
      process.exit(0);
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
