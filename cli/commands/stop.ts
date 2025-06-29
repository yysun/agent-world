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

import { updateAgent } from '../../core/agent-manager';
import { toKebabCase } from '../../core/utils';
import { World } from '../../core/types';
import { displayUnifiedMessage, displayError, displaySuccess } from '../ui/unified-display';
import { colors } from '../ui/colors';

export async function stopCommand(args: string[], world: World): Promise<void> {
  // Set world context for core modules
  const originalWorldId = process.env.AGENT_WORLD_ID;
  process.env.AGENT_WORLD_ID = world.id;

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
          // Update agent status to inactive
          const updatedAgent = await updateAgent(agent.id, {
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

    // Stop specific agent
    // World is passed directly
    const agents = Array.from(world.agents.values());

    // Try to find by exact name first
    let agent = agents.find(a => a.config.name === identifier);

    // If not found, try partial name match
    if (!agent) {
      agent = agents.find(a => a.config.name.toLowerCase().includes(identifier.toLowerCase()));
    }

    if (agent) {
      displayUnifiedMessage({
        content: `Stopping agent: ${agent.config.name}...`,
        type: 'command'
      });

      // Update agent status to inactive
      const updatedAgent = await updateAgent(agent.id, {
        status: 'inactive'
      });

      if (updatedAgent) {
        displaySuccess(`Successfully stopped: ${agent.config.name}`);
      } else {
        displayError(`Failed to stop agent: ${agent.config.name}`);
      }
    } else {
      displayError(`Agent not found: ${identifier}`);
      displayUnifiedMessage({
        content: 'Use /list to see available agents.',
        type: 'instruction'
      });
    }

  } catch (error) {
    displayError(`Failed to stop agent: ${error}`);
  } finally {
    // Restore original world ID
    if (originalWorldId) {
      process.env.AGENT_WORLD_ID = originalWorldId;
    } else {
      delete process.env.AGENT_WORLD_ID;
    }
  }
}
