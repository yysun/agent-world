/*
 * Clear Command - Agent Memory Management and Turn Limit Reset
 * 
 * Features:
 * - Clear memory of individual agents or all agents
 * - Reset turn limits (LLM call count) for agents
 * - Support for agent selection by ID or name
 * - Bulk memory clearing and turn limit reset operation
 * - Complete memory reset with simplified structure and archiving (LLM messages only)
 * 
 * Logic:
 * - Handles agent selection by ID or name
 * - Provides system-wide clear option with "all" keyword
 * - Uses clearAgentMemory function to archive existing memory then reset to simplified structure
 * - Turn limit reset is handled automatically by clearAgentMemory function
 * - Archives memory files with conversation history before clearing
 * - Resets only conversationHistory and lastActivity timestamp
 * - Preserves agent ID and basic configuration
 * - Updates last activity timestamp after clearing
 * 
 * Changes:
 * - Initial implementation of clear command
 * - Updated to use World.clearAgentMemory() function for simplified memory clearing with archiving
 * - Replaced complex memory structure with simplified structure and archive preservation
 * - Now properly archives memory.json before clearing to contain only conversationHistory and lastActivity
 * - Enhanced error handling and user feedback
 * - Added turn limit reset functionality (handled automatically by clearAgentMemory)
 */

import { clearAgentMemory, listAgents } from '../../core/agent-manager';
import { toKebabCase } from '../../core/utils';
import { World } from '../../core/types';
import { colors } from '../ui/colors';
import { displayUnifiedMessage } from '../ui/unified-display';

export async function clearCommand(args: string[], world: World): Promise<void> {
  // Set world context for core modules
  const originalWorldId = process.env.AGENT_WORLD_ID;
  process.env.AGENT_WORLD_ID = world.id;

  try {
    if (args.length === 0) {
      displayUnifiedMessage({
        type: 'command',
        content: 'Please specify an agent name or "all".\nUsage: /clear <agent-name> or /clear all',
        commandSubtype: 'usage',
        metadata: { source: 'cli', messageType: 'command' }
      });
      return;
    }

    const identifier = args[0];

    if (identifier.toLowerCase() === 'all') {
      // World is passed directly
      const agents = Array.from(world.agents.values());

      if (agents.length === 0) {
        displayUnifiedMessage({
          type: 'command',
          content: 'No agents to clear.',
          commandSubtype: 'warning',
          metadata: { source: 'cli', messageType: 'command' }
        });
        return;
      }

      displayUnifiedMessage({
        type: 'command',
        content: `Clearing memory for all ${agents.length} agents...`,
        commandSubtype: 'info',
        metadata: { source: 'cli', messageType: 'command' }
      });

      const results: string[] = [];
      for (const agent of agents) {
        try {
          // Clear agent's memory (also resets turn limit automatically)
          const success = await clearAgentMemory(agent.id);

          if (success) {
            results.push(colors.green(`✓ Cleared memory and reset turn limit: ${agent.config.name}`));
          } else {
            results.push(colors.red(`✗ Failed to clear memory for ${agent.config.name}`));
          }
        } catch (error) {
          results.push(colors.red(`✗ Failed to clear memory for ${agent.config.name}: ${error}`));
        }
      }

      // Display results and completion message
      const allResults = results.join('\n') + '\n\n' + colors.green('Memory cleared and turn limits reset for all agents.');

      displayUnifiedMessage({
        type: 'command',
        content: allResults,
        commandSubtype: 'success',
        metadata: { source: 'cli', messageType: 'command' }
      });
    } else {
      // Clear memory for specific agent
      // World is passed directly
      const agents = Array.from(world.agents.values());
      const agent = agents.find(a => a.config.name.toLowerCase() === identifier.toLowerCase());

      if (!agent) {
        displayUnifiedMessage({
          type: 'error',
          content: `Agent not found: ${identifier}\nUse /list to see available agents.`,
          metadata: { source: 'cli', messageType: 'error' }
        });
        return;
      }

      // Clear memory for specific agent (also resets turn limit automatically)
      const success = await clearAgentMemory(agent.id);

      if (success) {
        displayUnifiedMessage({
          type: 'command',
          content: `Memory cleared and turn limit reset for agent: ${agent.config.name}`,
          commandSubtype: 'success',
          metadata: { source: 'cli', messageType: 'command' }
        });
      } else {
        displayUnifiedMessage({
          type: 'error',
          content: `Failed to clear memory for agent: ${agent.config.name}`,
          metadata: { source: 'cli', messageType: 'error' }
        });
      }
    }
  } catch (error) {
    displayUnifiedMessage({
      type: 'error',
      content: `Error clearing memory: ${error}`,
      metadata: { source: 'cli', messageType: 'error' }
    });
  } finally {
    // Restore original world ID
    if (originalWorldId) {
      process.env.AGENT_WORLD_ID = originalWorldId;
    } else {
      delete process.env.AGENT_WORLD_ID;
    }
  }
}
