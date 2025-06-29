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

import { World } from '../../core/types';
import { displayUnifiedMessage, displayError, displaySuccess } from '../ui/unified-display';
import { colors } from '../ui/colors';

export async function stopCommand(args: string[], world: World): Promise<void> {
  try {
    if (args.length === 0) {
      displayUnifiedMessage({
        content: 'Please specify an agent name or "all".\nUsage: /stop <agent-name> or /stop all',
        type: 'help'
      });
      return;
    }

    const identifier = args[0];

    if (identifier.toLowerCase() === 'all') {
      // World is passed directly
      const agents = Array.from(world.agents.values());

      if (agents.length === 0) {
        displayUnifiedMessage({
          content: 'No agents to stop.',
          type: 'status'
        });
        return;
      }

      displayUnifiedMessage({
        content: `Deactivating all ${agents.length} agents...`,
        type: 'command'
      });

      let successCount = 0;
      let failureCount = 0;

      for (const agent of agents) {
        try {
          // Update agent status to inactive using World method
          const updatedAgent = await world.updateAgent(agent.config.name, {
            status: 'inactive'
          });

          if (updatedAgent) {
            successCount++;
          } else {
            failureCount++;
          }
        } catch (error) {
          failureCount++;
        }
      }

      const summary = `Stopped ${successCount} agents successfully.` +
        (failureCount > 0 ? ` ${failureCount} failed.` : '');

      displaySuccess(summary);
      return;
    }

    // Stop specific agent using World method
    displayUnifiedMessage({
      content: `Stopping agent: ${identifier}...`,
      type: 'command'
    });

    // Update agent status to inactive using World method
    const updatedAgent = await world.updateAgent(identifier, {
      status: 'inactive'
    });

    if (updatedAgent) {
      displaySuccess(`Successfully stopped: ${updatedAgent.config.name}`);
    } else {
      displayError(`Agent not found: ${identifier}`);
      displayUnifiedMessage({
        content: 'Use /list to see available agents.',
        type: 'instruction'
      });
    }

  } catch (error) {
    displayError(`Failed to stop agent: ${error}`);
  }
}
