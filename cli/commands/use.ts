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

import { updateAgent } from '../../core/agent-manager';
import { toKebabCase } from '../../core/utils';
import { World } from '../../core/types';
import { displayUnifiedMessage, displayError, displaySuccess } from '../ui/unified-display';
import { colors } from '../ui/colors';

export async function useCommand(args: string[], world: World): Promise<void> {
  // Set world context for core modules
  const originalWorldId = process.env.AGENT_WORLD_ID;
  process.env.AGENT_WORLD_ID = world.id;

  try {
    if (args.length === 0) {
      displayUnifiedMessage({
        content: 'Please specify an agent name.\nUsage: /use <agent-name>',
        type: 'help'
      });
      return;
    }

    const agentName = args[0];

    // World is passed directly
    const agents = Array.from(world.agents.values());

    // Try to find by exact name first
    let agent = agents.find(a => a.config.name === agentName);

    // If not found, try partial name match
    if (!agent) {
      agent = agents.find(a => a.config.name.toLowerCase().includes(agentName.toLowerCase()));
    }

    if (agent) {
      // Update agent status to active
      const updatedAgent = await updateAgent(agent.id, {
        status: 'active'
      });

      if (updatedAgent) {
        displaySuccess(`Activated agent: ${agent.config.name}`);
        displayUnifiedMessage({
          content: `  Status: ${updatedAgent.status}`,
          type: 'status'
        });
      } else {
        displayError(`Failed to activate agent: ${agent.config.name}`);
      }
    } else {
      displayError(`Agent not found: ${agentName}`);
      displayUnifiedMessage({
        content: 'Use /list to see available agents.',
        type: 'instruction'
      });
    }

  } catch (error) {
    displayError(`Failed to activate agent: ${error}`);
  } finally {
    // Restore original world ID
    if (originalWorldId) {
      process.env.AGENT_WORLD_ID = originalWorldId;
    } else {
      delete process.env.AGENT_WORLD_ID;
    }
  }
}
