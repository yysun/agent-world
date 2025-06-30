/**
 * Message Formatting Module - Terminal Message Formatting Functions
 * 
 * Core Features:
 * - Type-safe message content formatting based on message types
 * - Consistent color scheme and emoji usage across all message types
 * - Support for command subtypes with appropriate visual indicators
 * - Centralized formatting logic for maintainability
 * 
 * Implementation:
 * - Function-based design with clear separation of concerns
 * - Color utility integration for consistent terminal styling
 * - Support for custom emoji and color overrides
 * - Extensible architecture for new message types
 * 
 * Message Types Supported:
 * - help: Help content (raw formatting)
 * - command: Command execution with success/error/warning/info subtypes
 * - human: User messages with orange indicator
 * - agent: Agent responses with green indicator
 * - system: System messages and @human notifications
 * - debug: Debug messages (gray, conditional display)
 * - error: Error messages with red styling
 * - status: Status messages with custom styling
 * - file: File operation messages
 * - instruction: Terminal UI instructions
 * 
 * Architecture:
 * - Main formatting dispatcher function
 * - Dedicated formatter for each message type
 * - Consistent parameter interfaces
 * - Color abstraction for terminal compatibility
 */

import { colors } from './colors';

// Re-export types for consumer convenience
export type MessageType = 'help' | 'command' | 'human' | 'agent' | 'system' | 'debug' | 'error' | 'status' | 'file' | 'instruction';
export type CommandSubtype = 'success' | 'error' | 'warning' | 'info' | 'usage';

// Message interface for formatting
export interface FormattableMessage {
  type: MessageType;
  content: string;
  sender?: string;
  commandSubtype?: CommandSubtype;
  emoji?: string;
  color?: string;
}

/**
 * Main message formatting dispatcher - routes to type-specific formatters
 */
export function formatMessageContent(message: FormattableMessage): string {
  const { type, content, sender, commandSubtype, emoji, color } = message;

  switch (type) {
    case 'help':
      return content; // Help content should already be formatted

    case 'command':
      return formatCommandMessage(content, commandSubtype, emoji, color);

    case 'human':
      return formatHumanMessage(content, sender);

    case 'agent':
      return formatAgentMessage(content, sender);

    case 'system':
      return formatSystemMessage(content, sender);

    case 'debug':
      return formatDebugMessage(content);

    case 'error':
      return formatErrorMessage(content);

    case 'status':
      return formatStatusMessage(content, emoji, color);

    case 'file':
      return formatFileMessage(content, commandSubtype);

    case 'instruction':
      return formatInstructionMessage(content);

    default:
      return colors.gray(content);
  }
}

/**
 * Format command execution messages with appropriate icons and colors
 */
export function formatCommandMessage(
  content: string,
  subtype?: CommandSubtype,
  customEmoji?: string,
  customColor?: string
): string {
  if (customEmoji && customColor) {
    return `${customEmoji} ${customColor}`;
  }

  switch (subtype) {
    case 'success':
      return colors.green(`✓ ${content}`);
    case 'error':
      return colors.red(`✗ ${content}`);
    case 'warning':
      return colors.yellow(`⚠ ${content}`);
    case 'info':
      return colors.blue(`• ${content}`);
    case 'usage':
      return colors.gray(content);
    default:
      return content;
  }
}

/**
 * Format human (user) messages with orange dot
 */
export function formatHumanMessage(content: string, sender?: string): string {
  const senderName = sender === 'HUMAN' ? 'you' : (sender || 'you');
  return `${colors.orange('●')} ${senderName}: ${content}`;
}

/**
 * Format agent response messages with green dot
 */
export function formatAgentMessage(content: string, sender?: string): string {
  const agentName = sender || 'Agent';
  return `${colors.green('●')} ${agentName}: ${content}`;
}

/**
 * Format system messages and @human notifications
 */
export function formatSystemMessage(content: string, sender?: string): string {
  if (content.startsWith('@human')) {
    return `${colors.yellow('?')} ${colors.yellow(sender || 'system')}: ${content}`;
  }
  return `${colors.red('●')} ${sender || 'system'}: ${content}`;
}

/**
 * Format debug messages (only shown when debugging enabled)
 */
export function formatDebugMessage(content: string): string {
  return colors.gray(`[debug] ${content}`);
}

/**
 * Format error messages with consistent styling
 */
export function formatErrorMessage(content: string): string {
  if (content.startsWith('✗') || content.startsWith('Error:')) {
    return colors.red(content);
  }
  return colors.red(`✗ ${content}`);
}

/**
 * Format status messages (agent listing, operations, etc.)
 */
export function formatStatusMessage(content: string, emoji?: string, color?: string): string {
  if (emoji && color) {
    return `${emoji} ${color}`;
  }
  return content;
}

/**
 * Format file operation messages
 */
export function formatFileMessage(content: string, subtype?: CommandSubtype): string {
  switch (subtype) {
    case 'success':
      return colors.green(`✅ ${content}`);
    case 'error':
      return colors.red(`❌ ${content}`);
    default:
      return content;
  }
}

/**
 * Format instruction and terminal UI messages
 */
export function formatInstructionMessage(content: string): string {
  return colors.gray(content);
}

/**
 * Utility function to determine if a message should be stored in CLI session memory
 */
export function shouldStoreMessage(messageType: MessageType): boolean {
  const conversationalTypes: MessageType[] = ['human', 'agent', 'system'];
  return conversationalTypes.includes(messageType);
}

/**
 * Utility function to get a default emoji for a message type
 */
export function getDefaultEmoji(messageType: MessageType): string {
  switch (messageType) {
    case 'human':
      return '●';
    case 'agent':
      return '●';
    case 'system':
      return '●';
    case 'command':
      return '•';
    case 'error':
      return '✗';
    case 'debug':
      return '[debug]';
    default:
      return '';
  }
}

/**
 * Utility function to get a default color for a message type
 */
export function getDefaultColor(messageType: MessageType): (text: string) => string {
  switch (messageType) {
    case 'human':
      return colors.orange;
    case 'agent':
      return colors.green;
    case 'system':
      return colors.red;
    case 'command':
      return colors.blue;
    case 'error':
      return colors.red;
    case 'debug':
      return colors.gray;
    case 'instruction':
      return colors.gray;
    default:
      return colors.gray;
  }
}
