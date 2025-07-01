/*
 * List Command - Agent Status Display
 * 
 * Features:
 * - Displays all active agents with minimal formatting
 * - Color-coded status indicators (● green=active, red=inactive)
 * - Shows model name for each agent
 * - Simplified output showing essential information
 * 
 * Logic:
 * - Retrieves all agents from World.getAgentManager()
 * - Formats as list with status dot, name, model info, and truncated ID
 * - Shows agent status with minimal visual clutter
 * - Extracts model information from agent properties
 * 
 * Changes:
 * - Updated to use World object instead of direct AgentManager access
 * - Commands now access components through state.world getter methods
 * - Simplified output format to "● name - model (id...)" format
 * - Removed verbose agent metadata and descriptions
 * - Removed section headers and separators
 * - Added model name display from agent configuration
 * - Removed numbering for cleaner appearance
 * - Removed provider name to keep output minimal
 */

import * as World from '../../src/world';
import { colors } from '../ui/colors';
import { displayUnifiedMessage } from '../ui/unified-display';

export async function listCommand(args: string[], worldName: string): Promise<void> {
  const agents = World.getAgents(worldName);

  if (agents.length === 0) {
    displayUnifiedMessage({
      type: 'status',
      content: '📭 No agents found. Use /add to create your first agent.',
      color: colors.yellow('📭 No agents found. Use /add to create your first agent.'),
      metadata: { source: 'cli', messageType: 'command' }
    });
    return;
  }

  // Format agent list
  const agentList = agents.map((agent: any) => {
    const status = agent.status === 'active' ? colors.green('●') : colors.red('●');
    const name = colors.white(agent.name || 'Unnamed Agent');
    const model = agent.model || 'unknown';
    const modelInfo = colors.gray(`- ${model}`);
    return `${status} ${name} ${modelInfo}`;
  }).join('\n');

  // Display using unified display system
  displayUnifiedMessage({
    type: 'status',
    content: agentList,
    metadata: { source: 'cli', messageType: 'command' }
  });
}
