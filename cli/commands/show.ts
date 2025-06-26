/*
 * Show Command - Agent Conversation History Display and Export
 * 
 * Features:
 * - Display conversation history for a specific agent
 * - Optional file export to markdown format
 * - Format: ● agent-name header followed by unnumbered Q/A pairs
 * - Q: User messages (from HUMAN or other agents)
 * - A: Assistant messages (from LLM)
 * - Color-coded for better readability (display mode)
 * - Clean markdown formatting for file export
 * - Blank lines between Q/A pairs for improved formatting
 * - Handles empty conversation history gracefully
 * 
 * Usage:
 * - /show <agent-name> - Display conversation history in terminal
 * - /show <agent-name> <filename> - Save conversation history to markdown file
 * 
 * Logic:
 * - Validates agent name parameter
 * - Checks if agent exists in current world
 * - Loads agent's conversation history from memory.json
 * - Formats messages as unnumbered Q/A pairs with proper styling and spacing
 * - Shows helpful error messages for edge cases
 * - Exports to markdown file if filename provided
 * 
 * Changes:
 * - Initial implementation of show command
 * - Uses World.getAgentConversationHistory for memory access
 * - Follows existing command pattern and error handling
 * - Updated to use unnumbered Q/A format with spacing between pairs
 * - Added file export functionality with markdown formatting
 */

import * as World from '../../src/world';
import { colors } from '../utils/colors';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function showCommand(args: string[], worldName: string): Promise<void> {
  // Check if agent name is provided
  if (args.length === 0) {
    console.log(colors.yellow('❌ Please specify an agent name: /show <agent-name> [filename]'));
    return;
  }

  const agentName = args[0];
  const fileName = args[1]; // Optional filename parameter

  // Get agent by name
  const agent = World.getAgent(worldName, agentName);

  if (!agent) {
    console.log(colors.red(`❌ Agent "${agentName}" not found.`));
    console.log(colors.gray('Use /list to see available agents.'));
    return;
  }

  try {
    // Load conversation history
    const history = await World.getAgentConversationHistory(worldName, agent.name);

    if (fileName) {
      // Save to markdown file
      await saveConversationToMarkdown(agent.name, history, fileName);
    } else {
      // Display in terminal
      await displayConversationInTerminal(agent.name, history);
    }

  } catch (error) {
    console.log(colors.red(`❌ Error loading conversation history: ${error}`));
  }
}

/**
 * Display conversation history in terminal with colors and formatting
 */
async function displayConversationInTerminal(agentName: string, history: any[]): Promise<void> {
  // Display agent header
  console.log(`${colors.green('●')} ${colors.white(agentName)}`);

  if (history.length === 0) {
    console.log(colors.gray('  No conversation history found.'));
    console.log();
    return;
  }

  // Format and display conversation history
  const questionAnswerPairs = formatConversationPairs(history, true);

  // Display all pairs with blank lines between them
  questionAnswerPairs.forEach((pair, index) => {
    console.log(pair);
    if (index < questionAnswerPairs.length - 1) {
      console.log(); // Add blank line between pairs
    }
  });

  console.log();
}

/**
 * Save conversation history to markdown file
 */
async function saveConversationToMarkdown(agentName: string, history: any[], fileName: string): Promise<void> {
  if (history.length === 0) {
    console.log(colors.yellow(`No conversation history found for ${agentName}. No file created.`));
    return;
  }

  // Ensure the filename has .md extension
  const finalFileName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;

  // Build markdown content
  const markdownContent = buildMarkdownContent(agentName, history);

  try {
    // Write to file
    await fs.writeFile(finalFileName, markdownContent, 'utf8');
    console.log(colors.green(`✅ Conversation history saved to: ${finalFileName}`));
  } catch (error) {
    console.log(colors.red(`❌ Error saving file: ${error}`));
  }
}

/**
 * Build markdown content from conversation history
 */
function buildMarkdownContent(agentName: string, history: any[]): string {
  const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

  let markdown = `# ${agentName} - Conversation History\n\n`;
  markdown += `*Exported on ${now}*\n\n`;

  const questionAnswerPairs = formatConversationPairs(history, false);

  questionAnswerPairs.forEach((pair, index) => {
    markdown += pair + '\n';
    if (index < questionAnswerPairs.length - 1) {
      markdown += '\n'; // Add blank line between pairs
    }
  });

  return markdown;
}

/**
 * Format conversation into Q/A pairs
 * @param history - Array of conversation messages
 * @param useColors - Whether to apply terminal colors (true for display, false for markdown)
 */
function formatConversationPairs(history: any[], useColors: boolean): string[] {
  const questionAnswerPairs: string[] = [];
  let currentPair = '';

  for (const message of history) {
    if (message.role === 'user') {
      // If we have a previous pair, add it to pairs array
      if (currentPair) {
        questionAnswerPairs.push(currentPair);
      }

      // Start new Q/A pair
      const qLabel = useColors ? colors.cyan('Q:') : '**Q:**';
      const content = formatMessageContent(message.content, useColors);
      const indent = useColors ? '  ' : '';
      currentPair = `${indent}${qLabel} ${content}`;
    } else if (message.role === 'assistant') {
      // Complete the current pair with the answer
      const aLabel = useColors ? colors.magenta('A:') : '**A:**';
      const content = formatMessageContent(message.content, useColors);
      const indent = useColors ? '  ' : '';
      currentPair += `\n${indent}${aLabel} ${content}`;
    }
  }

  // Add the last pair if it exists
  if (currentPair) {
    questionAnswerPairs.push(currentPair);
  }

  return questionAnswerPairs;
}

/**
 * Format message content for display
 * - Handles multi-line messages
 * - Adds proper indentation
 * - Applies colors for terminal display or plain text for markdown
 */
function formatMessageContent(content: string, useColors: boolean = true): string {
  if (!content) return useColors ? colors.gray('(empty message)') : '*(empty message)*';

  // Split into lines and format each one
  const lines = content.trim().split('\n');
  const formattedLines = lines.map((line, index) => {
    // First line doesn't need extra indentation
    if (index === 0) {
      return useColors ? colors.gray(line) : line;
    }
    // Subsequent lines get extra indentation to align with content
    const indent = useColors ? '     ' : '   ';
    return useColors ? colors.gray(`${indent}${line}`) : `${indent}${line}`;
  });

  return formattedLines.join('\n');
}
