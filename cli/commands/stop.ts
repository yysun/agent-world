/*
 * Stop Command - Agent Deactivation
 * 
 * Features:
 * - Stop individual agents or all agents
 * - Support for bulk operations
 * - Agent selection by ID or name
 * 
 * Logic:
 * - Handles agent selection by ID or name
 * - Provides system-wide stop option
 * - Uses agent.stop() method to properly stop agents
 * 
 * Changes:
 * - Updated to receive World object directly instead of SimpleState
 * - Uses agent.stop() method instead of setStatus
 * - Accesses agents through world.getAgentManager()
 */

import * as World from '../../src/world';
import { colors } from '../utils/colors';

export async function stopCommand(args: string[], worldName: string): Promise<void> {
  if (args.length === 0) {
    console.log(colors.yellow('Please specify an agent name or "all".'));
    console.log(colors.gray('Usage: /stop <agent-name> or /stop all'));
    return;
  }

  const identifier = args[0];

  try {
    if (identifier.toLowerCase() === 'all') {
      const agents = World.getAgents(worldName);

      if (agents.length === 0) {
        console.log(colors.yellow('No agents to stop.'));
        return;
      }

      console.log(colors.blue(`Deactivating all ${agents.length} agents...`));

      for (const agent of agents) {
        try {
          // Update agent status to inactive
          const updatedAgent = await World.updateAgent(worldName, agent.name, {
            status: 'inactive',
            lastActive: new Date()
          });

          if (updatedAgent) {
            console.log(colors.green(`✓ Stopped: ${agent.name}`));
          }
        } catch (error) {
          console.log(colors.red(`✗ Failed to stop ${agent.name}: ${error}`));
        }
      }

      console.log(colors.cyan('All agents stopped.'));
      return;
    }

    // Stop specific agent
    const agents = World.getAgents(worldName);

    // Try to find by exact name first
    let agent = agents.find((a: any) => a.name === identifier);

    // If not found, try partial name match
    if (!agent) {
      agent = agents.find((a: any) => a.name.toLowerCase().includes(identifier.toLowerCase()));
    }

    if (agent) {
      console.log(colors.blue(`Stopping agent: ${agent.name}...`));

      // Update agent status to inactive
      const updatedAgent = await World.updateAgent(worldName, agent.name, {
        status: 'inactive',
        lastActive: new Date()
      });

      if (updatedAgent) {
        console.log(colors.green(`✓ Successfully stopped: ${agent.name}`));
      } else {
        console.log(colors.red(`Failed to stop agent: ${agent.name}`));
      }
    } else {
      console.log(colors.red(`Agent not found: ${identifier}`));
      console.log(colors.gray('Use /list to see available agents.'));
    }

  } catch (error) {
    console.log(colors.red(`Failed to stop agent: ${error}`));
  }
}
