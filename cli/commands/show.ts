/*
 * Show Command - Agent Conversation History Display
 * 
 * Features:
 * - Display conversation history for a specific agent
 * - Format: ● agent-name header followed by unnumbered Q/A pairs
 * - Q: User messages (from HUMAN or other agents)
 * - A: Assistant messages (from LLM)
 * - Color-coded for better readability
 * - Blank lines between Q/A pairs for improved formatting
 * - Handles empty conversation history gracefully
 * 
 * Logic:
 * - Validates agent name parameter
 * - Checks if agent exists in current world
 * - Loads agent's conversation history from memory.json
 * - Formats messages as unnumbered Q/A pairs with proper styling and spacing
 * - Shows helpful error messages for edge cases
 * 
 * Changes:
 * - Initial implementation of show command
 * - Uses World.getAgentConversationHistory for memory access
 * - Follows existing command pattern and error handling
 * - Updated to use unnumbered Q/A format with spacing between pairs
 */

import * as World from '../../src/world';
import { colors } from '../utils/colors';

export async function showCommand(args: string[], worldId: string): Promise<void> {
  // Check if agent name is provided
  if (args.length === 0) {
    console.log(colors.yellow('❌ Please specify an agent name: /show <agent-name>'));
    return;
  }

  const agentName = args[0];

  // Get all agents to find the one with matching name
  const agents = World.getAgents(worldId);
  const agent = agents.find(a => a.name === agentName || a.id === agentName);

  if (!agent) {
    console.log(colors.red(`❌ Agent "${agentName}" not found.`));
    console.log(colors.gray('Use /list to see available agents.'));
    return;
  }

  try {
    // Load conversation history
    const history = await World.getAgentConversationHistory(worldId, agent.id);

    // Display agent header
    console.log(`${colors.green('●')} ${colors.white(agent.name)}`);

    if (history.length === 0) {
      console.log(colors.gray('  No conversation history found.'));
      console.log();
      return;
    }

    // Format and display conversation history
    let isExpectingAnswer = false;
    let questionAnswerPairs: string[] = [];
    let currentPair = '';

    for (const message of history) {
      if (message.role === 'user') {
        // If we have a previous pair, add it to pairs array
        if (currentPair) {
          questionAnswerPairs.push(currentPair);
        }

        // Start new Q/A pair
        const qLabel = colors.cyan(`Q:`);
        const content = formatMessageContent(message.content);
        currentPair = `  ${qLabel} ${content}`;
        isExpectingAnswer = true;
      } else if (message.role === 'assistant') {
        // Complete the current pair with the answer
        const aLabel = colors.magenta('A:');
        const content = formatMessageContent(message.content);
        currentPair += `\n  ${aLabel} ${content}`;
        isExpectingAnswer = false;
      }
    }

    // Add the last pair if it exists
    if (currentPair) {
      questionAnswerPairs.push(currentPair);
    }

    // Display all pairs with blank lines between them
    questionAnswerPairs.forEach((pair, index) => {
      console.log(pair);
      if (index < questionAnswerPairs.length - 1) {
        console.log(); // Add blank line between pairs
      }
    });

    console.log();

  } catch (error) {
    console.log(colors.red(`❌ Error loading conversation history: ${error}`));
  }
}

/**
 * Format message content for display
 * - Handles multi-line messages
 * - Adds proper indentation
 * - Limits line length for readability
 */
function formatMessageContent(content: string): string {
  if (!content) return colors.gray('(empty message)');

  // Split into lines and format each one
  const lines = content.trim().split('\n');
  const formattedLines = lines.map((line, index) => {
    // First line doesn't need extra indentation
    if (index === 0) {
      return colors.gray(line);
    }
    // Subsequent lines get extra indentation to align with content
    return colors.gray(`     ${line}`);
  });

  return formattedLines.join('\n');
}
