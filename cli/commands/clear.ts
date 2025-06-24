/*
 * Clear Command - Agent Memory Management
 * 
 * Features:
 * - Clear memory of individual agents or all agents
 * - Support for agent selection by ID or name
 * - Bulk memory clearing operation
 * - Complete memory reset with simplified structure and archiving (LLM messages only)
 * 
 * Logic:
 * - Handles agent selection by ID or name
 * - Provides system-wide clear option with "all" keyword
 * - Uses clearAgentMemory function to archive existing memory then reset to simplified structure
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
 */

import * as World from '../../src/world';
import { colors } from '../utils/colors';

export async function clearCommand(args: string[], worldName: string): Promise<void> {
  if (args.length === 0) {
    console.log(colors.yellow('Please specify an agent name or "all".'));
    console.log(colors.gray('Usage: /clear <agent-name> or /clear all'));
    return;
  }

  const identifier = args[0];

  try {
    if (identifier.toLowerCase() === 'all') {
      const agents = World.getAgents(worldName);

      if (agents.length === 0) {
        console.log(colors.yellow('No agents to clear.'));
        return;
      }

      console.log(colors.blue(`Clearing memory for all ${agents.length} agents...`));

      for (const agent of agents) {
        try {
          // Clear agent's memory using the proper clearAgentMemory function
          const success = await World.clearAgentMemory(worldName, agent.name);

          if (success) {
            console.log(colors.green(`✓ Cleared memory: ${agent.name}`));
          } else {
            console.log(colors.red(`✗ Failed to clear memory for ${agent.name}`));
          }
        } catch (error) {
          console.log(colors.red(`✗ Failed to clear memory for ${agent.name}: ${error}`));
        }
      }

      console.log(colors.green(`\nMemory cleared for all agents.`));
    } else {
      // Clear memory for specific agent
      const agents = World.getAgents(worldName);
      const agent = agents.find(a => a.name.toLowerCase() === identifier.toLowerCase());

      if (!agent) {
        console.log(colors.red(`Agent not found: ${identifier}`));
        console.log(colors.gray('Use /list to see available agents.'));
        return;
      }

      // Clear memory for specific agent using the proper clearAgentMemory function
      const success = await World.clearAgentMemory(worldName, agent.name);

      if (success) {
        console.log(colors.green(`✓ Memory cleared for agent: ${agent.name}`));
      } else {
        console.log(colors.red(`Failed to clear memory for agent: ${agent.name}`));
      }
    }
  } catch (error) {
    console.log(colors.red(`Error clearing memory: ${error}`));
  }
}
