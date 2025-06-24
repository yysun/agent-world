/*
 * Use Command - Agent Activation
 * 
 * Features:
 * - Activate agents (start them)
 * - Support for agent ID or name-based selection
 * - Status management
 * 
 * Logic:
 * - Searches for agent by ID or partial name match
 * - Uses agent.start() to activate agents
 * - Provides feedback on activation status
 * 
 * Changes:
 * - Updated to receive World object directly instead of SimpleState
 * - Uses agent.start() method instead of setStatus
 * - Accesses agents through world.getAgentManager()
 */

import * as World from '../../src/world';
import { colors } from '../utils/colors';

export async function useCommand(args: string[], worldId: string): Promise<void> {
  if (args.length === 0) {
    console.log(colors.yellow('Please specify an agent ID or name.'));
    console.log(colors.gray('Usage: /use <agent-id-or-name>'));
    return;
  }

  const identifier = args[0];

  try {
    const agents = World.getAgents(worldId);

    // Try to find by exact name first
    let agent = agents.find((a: any) => a.name === identifier);

    // If not found, try partial name match
    if (!agent) {
      agent = agents.find((a: any) => a.name.toLowerCase().includes(identifier.toLowerCase()));
    }

    if (agent) {
      // Update agent status to active
      const updatedAgent = await World.updateAgent(worldId, agent.id, {
        status: 'active',
        lastActive: new Date()
      });

      if (updatedAgent) {
        console.log(colors.green(`✓ Activated agent: ${colors.white(agent.name)}`));
        console.log(colors.gray(`  Status: ${updatedAgent.status}`));
      } else {
        console.log(colors.red(`Failed to activate agent: ${agent.name}`));
      }
    } else {
      console.log(colors.red(`Agent not found: ${identifier}`));
      console.log(colors.gray('Use /list to see available agents.'));
    }

  } catch (error) {
    console.log(colors.red(`Failed to activate agent: ${error}`));
  }
}
