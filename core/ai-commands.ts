/**
 * AI Commands Module
 *
 * This module defines a list of special AI commands that require custom handling.
 * Instead of sending their results back to the LLM, the output is saved
 * directly to agent memory as an assistant message.
 */

// Hardcoded list of AI commands
const AI_COMMANDS = new Set(['gemini', 'copilot', 'codex']);

/**
 * Check if a command is a special AI command.
 *
 * @param command - The command string to check (e.g., "gemini", "codex exec 'query'", "ls").
 *                  Can include arguments - only the first word is checked.
 * @returns True if the command is an AI command, false otherwise.
 */
export function isAICommand(command: string): boolean {
  if (!command) return false;

  // Extract first word from command (handles "codex exec 'query'" -> "codex")
  const firstWord = command.trim().split(/\s+/)[0].toLowerCase();
  return AI_COMMANDS.has(firstWord);
}
