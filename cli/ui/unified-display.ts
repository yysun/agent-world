/**
 * Unified Display System - Consistent Message Display with Standard Spacing
 * 
 * Core Features:
 * - Single point of control for all CLI message display
 * - Enforces "blank line before and after" rule for all message blocks
 * - Supports all message types: help, command, human, agent, system, debug, error, status, file, instruction
 * - Maintains color coding and emoji indicators for visual hierarchy
 * - Integrates with existing streaming display and terminal-kit systems
 * - Preserves message logging functionality for CLI session storage
 * 
 * Implementation:
 * - Function-based approach following project guidelines
 * - Type-safe message interface with metadata support
 * - Consistent spacing enforcement with configurable exceptions
 * - Integration hooks for streaming display and terminal positioning
 * - Performance optimized to avoid latency impact
 * 
 * Usage:
 * - Replace all direct console.log() calls with displayUnifiedMessage()
 * - Specify message type for appropriate formatting and spacing
 * - Include metadata for enhanced logging and debugging
 */

import { colors } from './colors';
import { addMessageToStore, createStoredMessage, determineSenderType } from '../message-store';
import { SenderType } from '../../src/types';

// Message type definitions for unified display
export type MessageType = 
  | 'help'        // Command help and usage information
  | 'command'     // Command execution results (success, error, warning, info)
  | 'human'       // User input messages
  | 'agent'       // Agent response messages
  | 'system'      // System notifications and @human messages
  | 'debug'       // Development debugging output
  | 'error'       // Error messages and failures
  | 'status'      // Agent listing, creation, memory operations
  | 'file'        // Export/file operation feedback
  | 'instruction' // Terminal UI instructions and prompts

// Command subtypes for specific styling
export type CommandSubtype = 'success' | 'error' | 'warning' | 'info' | 'usage';

// Unified message interface
export interface UnifiedDisplayMessage {
  type: MessageType;
  content: string;
  sender?: string;
  commandSubtype?: CommandSubtype;
  emoji?: string;
  color?: string;
  skipSpacing?: boolean; // For special cases like streaming previews
  metadata?: {
    source?: 'cli' | 'streaming' | 'system';
    messageType?: 'response' | 'command' | 'notification' | 'error';
    agentModel?: string;
    tokenCount?: number;
    worldName?: string;
  };
}

// Global state for display coordination
let currentWorldName: string = 'default';
let isStreamingActive: boolean = false;

/**
 * Set the current world name for message storage
 */
export function setCurrentWorldName(worldName: string): void {
  currentWorldName = worldName;
}

/**
 * Set streaming state for display coordination
 */
export function setStreamingActive(active: boolean): void {
  isStreamingActive = active;
}

/**
 * Main unified display function - single entry point for all message display
 * Enforces consistent spacing: blank line before and after each message block
 */
export function displayUnifiedMessage(message: UnifiedDisplayMessage): void {
  // Format the message content based on type
  const formattedContent = formatMessageContent(message);
  
  // Apply spacing rule: blank line before (unless explicitly skipped)
  if (!message.skipSpacing) {
    console.log(); // Blank line before
  }
  
  // Display the formatted message
  console.log(formattedContent);
  
  // Apply spacing rule: blank line after (unless explicitly skipped)
  if (!message.skipSpacing) {
    console.log(); // Blank line after
  }
  
  // Store message in CLI session memory if it's a conversational message
  if (shouldStoreMessage(message)) {
    storeMessage(message);
  }
}

/**
 * Format message content based on type and subtype
 */
function formatMessageContent(message: UnifiedDisplayMessage): string {
  const { type, content, sender, commandSubtype, emoji, color } = message;
  
  switch (type) {
    case 'help':
      return formatHelpMessage(content);
      
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
      // Fallback for unknown types
      return colors.gray(content);
  }
}

/**
 * Format help messages (command lists and usage information)
 */
function formatHelpMessage(content: string): string {
  // Help content should already be formatted with colors
  return content;
}

/**
 * Format command execution messages with appropriate icons and colors
 */
function formatCommandMessage(
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
function formatHumanMessage(content: string, sender?: string): string {
  const senderName = sender === 'HUMAN' ? 'you' : (sender || 'you');
  return `${colors.orange('●')} ${senderName}: ${content}`;
}

/**
 * Format agent response messages with green dot
 */
function formatAgentMessage(content: string, sender?: string): string {
  const agentName = sender || 'Agent';
  return `${colors.green('●')} ${agentName}: ${content}`;
}

/**
 * Format system messages and @human notifications
 */
function formatSystemMessage(content: string, sender?: string): string {
  if (content.startsWith('@human')) {
    // Special formatting for @human messages
    return `${colors.yellow('?')} ${colors.yellow(sender || 'system')}: ${content}`;
  }
  
  return `${colors.red('●')} ${sender || 'system'}: ${content}`;
}

/**
 * Format debug messages (only shown when debugging enabled)
 */
function formatDebugMessage(content: string): string {
  return colors.gray(`[debug] ${content}`);
}

/**
 * Format error messages with consistent styling
 */
function formatErrorMessage(content: string): string {
  if (content.startsWith('✗') || content.startsWith('Error:')) {
    return colors.red(content);
  }
  return colors.red(`✗ ${content}`);
}

/**
 * Format status messages (agent listing, operations, etc.)
 */
function formatStatusMessage(content: string, emoji?: string, color?: string): string {
  if (emoji && color) {
    return `${emoji} ${color}`;
  }
  
  // Default status formatting
  return content;
}

/**
 * Format file operation messages
 */
function formatFileMessage(content: string, subtype?: CommandSubtype): string {
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
function formatInstructionMessage(content: string): string {
  return colors.gray(content);
}

/**
 * Determine if a message should be stored in CLI session memory
 */
function shouldStoreMessage(message: UnifiedDisplayMessage): boolean {
  // Store conversational messages (human, agent, system)
  const conversationalTypes: MessageType[] = ['human', 'agent', 'system'];
  return conversationalTypes.includes(message.type);
}

/**
 * Store message in CLI session memory
 */
function storeMessage(message: UnifiedDisplayMessage): void {
  if (!message.sender) return;
  
  const storedMessage = createStoredMessage(
    message.sender,
    message.content,
    currentWorldName,
    message.metadata
  );
  
  addMessageToStore(storedMessage);
}

/**
 * Helper function for backward compatibility - displays with automatic type detection
 */
export function displayMessage(content: string, sender?: string, type?: MessageType): void {
  const messageType = type || detectMessageType(content, sender);
  
  displayUnifiedMessage({
    type: messageType,
    content,
    sender,
    metadata: { source: 'cli' }
  });
}

/**
 * Detect message type from content and sender (for backward compatibility)
 */
function detectMessageType(content: string, sender?: string): MessageType {
  if (sender === 'HUMAN' || sender === 'you') return 'human';
  if (sender && sender !== 'system') return 'agent';
  if (content.startsWith('@human')) return 'system';
  if (content.includes('✓') || content.includes('✗')) return 'command';
  if (content.includes('Error:')) return 'error';
  
  return 'status'; // Default fallback
}

/**
 * Convenience functions for common message types
 */
export function displaySuccess(content: string): void {
  displayUnifiedMessage({
    type: 'command',
    content,
    commandSubtype: 'success'
  });
}

export function displayError(content: string): void {
  displayUnifiedMessage({
    type: 'error',
    content
  });
}

export function displayWarning(content: string): void {
  displayUnifiedMessage({
    type: 'command',
    content,
    commandSubtype: 'warning'
  });
}

export function displayInfo(content: string): void {
  displayUnifiedMessage({
    type: 'command',
    content,
    commandSubtype: 'info'
  });
}

export function displayInstruction(content: string): void {
  displayUnifiedMessage({
    type: 'instruction',
    content
  });
}

/**
 * Special function for streaming integration - skips spacing for real-time updates
 */
export function displayStreamingMessage(content: string, sender: string, skipSpacing: boolean = false): void {
  const messageType = sender === 'HUMAN' || sender === 'you' ? 'human' : 'agent';
  
  displayUnifiedMessage({
    type: messageType,
    content,
    sender,
    skipSpacing,
    metadata: { source: 'streaming' }
  });
}
