/*
 * Help Command - Usage Information Display
 * 
 * Features:
 * - Displays simplified usage information for all CLI commands
 * - Color-coded output for better readability
 * - Concise command descriptions without verbose examples
 * 
 * Logic:
 * - Shows available commands with brief descriptions
 * - Minimal output for quick reference
 * - No header message for clean output
 * 
 * Changes:
 * - Updated to receive World object directly instead of SimpleState
 * - Simplified to show only command names and brief descriptions
 * - Removed verbose usage examples, tips, and header message
 * - Added /quit command
 */

import { colors } from '../utils/colors';

export async function helpCommand(args: string[], worldId: string): Promise<void> {
  const commands = [
    { command: '/help', description: 'Show this help message' },
    { command: '/list', description: 'List all agents and their status' },
    { command: '/add [name]', description: 'Create a new agent (optionally specify name)' },
    { command: '/use', description: 'Activate an agent' },
    { command: '/stop', description: 'Deactivate an agent' },
    { command: '/clear', description: 'Clear agent memory' },
    { command: '/quit', description: 'Exit the CLI' }
  ];

  commands.forEach(cmd => {
    console.log(colors.green(cmd.command) + colors.gray(` - ${cmd.description}`));
  });

  console.log();
}
