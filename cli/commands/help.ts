/*
 * Help Command - Usage Information Display
 * 
 * Features:
 * - Displays simplified usage information for all CLI commands
 * - Color-coded output for better readability
 * - Concise command descriptions without verbose examples
 * - Includes show command for displaying agent conversation history
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
 * - Added /show command for agent conversation history display and markdown export
 * - Renamed /list command to /agents for better clarity
 */

import { colors } from '../ui/colors';
import { displayUnifiedMessage } from '../ui/display';

export async function helpCommand(args: string[], worldName: string): Promise<void> {
  const commands = [
    { command: '/help', description: 'Show this help message' },
    { command: '/agents', description: 'List all agents and their status' },
    { command: '/add [agent-name]', description: 'Create a new agent (optionally specify name)' },
    { command: '/use <agent-name>', description: 'Activate an agent' },
    { command: '/stop <agent-name> | all', description: 'Deactivate an agent' },
    { command: '/show <agent-name> [filename]', description: 'Display conversation history or save to markdown file' },
    { command: '/clear <agent-name> | all', description: 'Clear agent memory' },
    { command: '/export <filename>', description: 'Export conversation to markdown file' },
    { command: '/quit', description: 'Exit the CLI' }
  ];

  // Format help content with proper coloring
  const helpContent = commands
    .map(cmd => colors.green(cmd.command) + colors.gray(` - ${cmd.description}`))
    .join('\n');

  // Display using unified display system
  displayUnifiedMessage({
    type: 'help',
    content: helpContent,
    metadata: { source: 'cli', messageType: 'command' }
  });
}
