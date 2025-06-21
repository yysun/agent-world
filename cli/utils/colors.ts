/*
 * Colors Utility - Console Output Formatting
 * 
 * Features:
 * - ANSI color codes for terminal output
 * - Consistent styling across CLI commands
 * - Support for various text colors and styles
 * 
 * Logic:
 * - Provides color functions for different message types
 * - Uses ANSI escape codes for terminal formatting
 * - Maintains consistent visual hierarchy
 * 
 * Changes:
 * - Enhanced colors utility with full ANSI color support
 */

export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Colors
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  magenta: (text: string) => `\x1b[35m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  white: (text: string) => `\x1b[37m${text}\x1b[0m`,
  gray: (text: string) => `\x1b[90m${text}\x1b[0m`,

  // Styles
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
  underline: (text: string) => `\x1b[4m${text}\x1b[0m`,
};

// Legacy functions for compatibility
export function success(text: string): string {
  return colors.green(`✓ ${text}`);
}

export function error(text: string): string {
  return colors.red(`✗ ${text}`);
}

export function info(text: string): string {
  return colors.blue(`• ${text}`);
}
