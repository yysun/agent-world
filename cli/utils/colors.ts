/*
 * Colors Utility - Console Output Formatting with Terminal Control
 * 
 * Features:
 * - ANSI color codes for terminal output
 * - Consistent styling across CLI commands
 * - Support for various text colors and styles
 * - Terminal control utilities for cursor management and streaming display
 * 
 * Recent Changes:
 * - Added comprehensive terminal control utilities for streaming display
 * - Implemented cursor positioning, line clearing, and display state management
 * - Enhanced ANSI escape sequence support for advanced terminal manipulation
 * - Added functions for save/restore cursor, hide/show cursor, and line navigation
 * 
 * Logic:
 * - Provides color functions for different message types
 * - Uses ANSI escape codes for terminal formatting
 * - Maintains consistent visual hierarchy
 * - Includes terminal control functions for real-time streaming display management
 * - Supports cursor positioning and line clearing for single-line preview updates
 * 
 * Changes:
 * - Enhanced colors utility with full ANSI color support
 * - Added terminal control object with cursor and line management functions
 * - Implemented support for streaming display preview/final display system
 * - Maintains backward compatibility with existing color functions
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

// Terminal control utilities for streaming display
export const terminal = {
  // Move cursor up n lines
  cursorUp: (lines: number = 1) => `\x1b[${lines}A`,

  // Move cursor down n lines
  cursorDown: (lines: number = 1) => `\x1b[${lines}B`,

  // Move cursor to column position
  cursorToColumn: (column: number = 0) => `\x1b[${column}G`,

  // Clear current line
  clearLine: () => '\x1b[2K',

  // Clear from cursor to end of line
  clearToEnd: () => '\x1b[0K',

  // Save cursor position
  saveCursor: () => '\x1b[s',

  // Restore cursor position
  restoreCursor: () => '\x1b[u',

  // Hide cursor
  hideCursor: () => '\x1b[?25l',

  // Show cursor
  showCursor: () => '\x1b[?25h'
};
