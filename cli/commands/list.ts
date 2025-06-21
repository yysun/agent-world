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
 * - Extracts model information from agent.config
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
import { colors } from '../utils/colors';

export async function listCommand(args: string[], worldId: string): Promise<void> {
  const agents = World.getAgents(worldId);

  if (agents.length === 0) {
    console.log(colors.yellow('📭 No agents found. Use /add to create your first agent.'));
    return;
  }

  agents.forEach((agent: any, i: number) => {
    const status = agent.status === 'active' ? colors.green('●') : colors.red('●');
    const name = colors.white(agent.name || 'Unnamed Agent');
    const model = agent.config?.model || 'unknown';
    const modelInfo = colors.gray(`- ${model}`);
    const shortId = colors.gray(`(${agent.id.slice(0, 8)}...)`);

    console.log(`${status} ${name} ${modelInfo} ${shortId}`);
  });
  console.log();
}
