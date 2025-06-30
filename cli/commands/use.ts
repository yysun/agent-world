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

import { World } from '../../core/types';
import { displayUnifiedMessage, displayError, displaySuccess } from '../ui/display';
import { colors } from '../ui/colors';

export async function useCommand(args: string[], world: World): Promise<void> {
  try {
    if (args.length === 0) {
      displayUnifiedMessage({
        content: 'Please specify an agent name.\nUsage: /use <agent-name>',
        type: 'help'
      });
      return;
    }

    const agentName = args[0];

    // Activate agent using World method
    const updatedAgent = await world.updateAgent(agentName, {
      status: 'active'
    });

    if (updatedAgent) {
      displaySuccess(`Activated agent: ${updatedAgent.name}`);
      displayUnifiedMessage({
        content: `  Status: ${updatedAgent.status}`,
        type: 'status'
      });
    } else {
      displayError(`Agent not found: ${agentName}`);
      displayUnifiedMessage({
        content: 'Use /list to see available agents.',
        type: 'instruction'
      });
    }

  } catch (error) {
    displayError(`Failed to activate agent: ${error}`);
  }
}
