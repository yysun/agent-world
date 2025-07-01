/**
 * Unified Display System - Smart Contextual Message Display with Intelligent Spacing
 * 
 * Core Features:
 * - Single point of control for all CLI message display
 * - Smart contextual spacing based on message flow and relationships
 * - Conversation-aware spacing that groups related messages
 * - Streaming integration with zero-spacing coordination
 * - Supports all message types: help, command, human, agent, system, debug, error, status, file, instruction
 * - Maintains color coding and emoji indicators for visual hierarchy
 * - Preserves message logging functionality for CLI session storage
 * 
 * Smart Spacing Rules:
 * - Conversation flows (human → agent): Minimal spacing for natural flow
 * - Command sequences: Zero spacing between command and immediate response
 * - Streaming messages: Handled by streaming system, no additional spacing
 * - Instructions/Help: Enhanced spacing for better readability
 * - Time-based grouping: Rapid message sequences get compressed spacing
 * - Context awareness: Maintains conversation state across message types
 * 
 * Implementation:
 * - Function-based approach following project guidelines
 * - Type-safe message interface with metadata support
 * - Context tracking for intelligent spacing decisions
 * - Integration hooks for streaming display and terminal positioning
 * - Performance optimized to avoid latency impact
 * 
 * Usage:
 * - Replace all direct console.log() calls with displayUnifiedMessage()
 * - Specify message type for appropriate formatting and spacing
 * - Include metadata for enhanced logging and spacing coordination
 * - Use displayConversationGroup() for related message sequences
 * - Use forceSpacingBreak() before major UI transitions
 */

import { colors } from './colors';
import { addMessageToStore, createStoredMessage, determineSenderType } from '../message-store';
import { SenderType } from '../../core/types.js';

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
  metadata?: {
    source?: 'cli' | 'streaming' | 'system';
    messageType?: 'response' | 'command' | 'notification' | 'error';
    agentModel?: string;
    tokenCount?: number;
    worldName?: string;
  };
}

// Spacing context for smart display coordination
interface SpacingContext {
  lastMessageType?: MessageType;
  lastSource?: string;
  isInConversation: boolean;
  isStreamingActive: boolean;
  messageCount: number;
  lastTimestamp: number;
}

// Global state for display coordination
let currentWorldName: string = 'default';
let spacingContext: SpacingContext = {
  isInConversation: false,
  isStreamingActive: false,
  messageCount: 0,
  lastTimestamp: 0
};

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
  spacingContext.isStreamingActive = active;
}

/**
 * Reset spacing context (for new sessions or major breaks)
 */
export function resetSpacingContext(): void {
  spacingContext = {
    isInConversation: false,
    isStreamingActive: false,
    messageCount: 0,
    lastTimestamp: 0
  };
}

/**
 * Calculate smart spacing based on message context and flow
 */
function calculateSmartSpacing(message: UnifiedDisplayMessage): { before: number; after: number } {
  const currentTime = Date.now();
  const timeSinceLastMessage = currentTime - spacingContext.lastTimestamp;

  // Default spacing (reduced from original)
  let beforeSpacing = 1;
  let afterSpacing = 0;

  // No spacing for streaming source messages (handled by streaming system)
  if (message.metadata?.source === 'streaming') {
    return { before: 0, after: 0 };
  }

  // Conversation flow detection
  const isConversationalMessage = ['human', 'agent', 'system'].includes(message.type);
  const isCommandMessage = ['command', 'error', 'status'].includes(message.type);
  const isInstructionalMessage = ['help', 'instruction'].includes(message.type);

  // Smart spacing rules
  if (spacingContext.messageCount === 0) {
    // First message - minimal spacing
    beforeSpacing = 0;
  } else if (isConversationalMessage && spacingContext.isInConversation) {
    // Continuing conversation - minimal spacing
    beforeSpacing = 0;
  } else if (message.type === spacingContext.lastMessageType && timeSinceLastMessage < 1000) {
    // Same type, rapid succession - no spacing
    beforeSpacing = 0;
  } else if (isCommandMessage && spacingContext.lastMessageType === 'human') {
    // Command response to human input - minimal spacing
    beforeSpacing = 0;
  } else if (isInstructionalMessage) {
    // Help and instructions - extra spacing for readability
    beforeSpacing = 1;
    afterSpacing = 1;
  } else if (message.type === 'file' || message.commandSubtype === 'success') {
    // File operations and success messages - moderate spacing
    beforeSpacing = 1;
  }

  // Reduce spacing during active streaming
  if (spacingContext.isStreamingActive) {
    beforeSpacing = Math.min(beforeSpacing, 1);
    afterSpacing = 0;
  }

  return { before: beforeSpacing, after: afterSpacing };
}

/**
 * Update spacing context after displaying a message
 */
function updateSpacingContext(message: UnifiedDisplayMessage): void {
  spacingContext.lastMessageType = message.type;
  spacingContext.lastSource = message.metadata?.source;
  spacingContext.messageCount++;
  spacingContext.lastTimestamp = Date.now();

  // Update conversation state
  const isConversationalMessage = ['human', 'agent', 'system'].includes(message.type);
  if (isConversationalMessage) {
    spacingContext.isInConversation = true;
  } else if (['help', 'instruction', 'file'].includes(message.type)) {
    spacingContext.isInConversation = false;
  }
}
/**
 * Main unified display function - single entry point for all message display
 * Applies smart contextual spacing based on message flow and relationships
 */
export function displayUnifiedMessage(message: UnifiedDisplayMessage): void {
  // Calculate smart spacing based on context
  const spacing = calculateSmartSpacing(message);

  // Format the message content based on type
  const formattedContent = formatMessageContent(message);

  // Apply spacing rule: smart spacing before
  for (let i = 0; i < spacing.before; i++) {
    console.log();
  }

  // Display the formatted message
  console.log(formattedContent);

  // Apply spacing rule: smart spacing after  
  for (let i = 0; i < spacing.after; i++) {
    console.log();
  }

  // Update context for next message
  updateSpacingContext(message);

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
 * Convenience functions for common message types with optimized spacing
 */
export function displaySuccess(content: string): void {
  displayUnifiedMessage({
    type: 'command',
    content,
    commandSubtype: 'success',
    metadata: { source: 'cli', messageType: 'command' }
  });
}

export function displayError(content: string): void {
  displayUnifiedMessage({
    type: 'error',
    content,
    metadata: { source: 'cli', messageType: 'error' }
  });
}

export function displayWarning(content: string): void {
  displayUnifiedMessage({
    type: 'command',
    content,
    commandSubtype: 'warning',
    metadata: { source: 'cli', messageType: 'command' }
  });
}

export function displayInfo(content: string): void {
  displayUnifiedMessage({
    type: 'command',
    content,
    commandSubtype: 'info',
    metadata: { source: 'cli', messageType: 'notification' }
  });
}

export function displayInstruction(content: string): void {
  displayUnifiedMessage({
    type: 'instruction',
    content,
    metadata: { source: 'cli', messageType: 'notification' }
  });
}

/**
 * Special function for streaming integration with proper source marking
 */
export function displayStreamingMessage(content: string, sender: string): void {
  const messageType = sender === 'HUMAN' || sender === 'you' ? 'human' : 'agent';

  displayUnifiedMessage({
    type: messageType,
    content,
    sender,
    metadata: { source: 'streaming', messageType: 'response' }
  });
}

/**
 * Display conversation group - multiple related messages with minimal spacing
 */
export function displayConversationGroup(messages: Array<{ content: string; sender: string; type?: MessageType }>): void {
  messages.forEach((msg, index) => {
    const messageType = msg.type || (msg.sender === 'HUMAN' || msg.sender === 'you' ? 'human' : 'agent');

    // Override spacing for grouped conversation
    if (index === 0) {
      // First message gets normal spacing
      displayUnifiedMessage({
        type: messageType,
        content: msg.content,
        sender: msg.sender,
        metadata: { source: 'cli', messageType: 'response' }
      });
    } else {
      // Subsequent messages get minimal spacing
      displayWithSpacing({
        type: messageType,
        content: msg.content,
        sender: msg.sender,
        metadata: { source: 'cli', messageType: 'response' }
      }, 0, 0);
    }
  });
}

/**
 * Force spacing context reset for major UI breaks (used by terminal system)
 */
export function forceSpacingBreak(): void {
  spacingContext.isInConversation = false;
  spacingContext.lastMessageType = undefined;
  spacingContext.lastTimestamp = 0;
}

/**
 * Get current spacing context (for debugging and coordination)
 */
export function getSpacingContext(): Readonly<SpacingContext> {
  return { ...spacingContext };
}

/**
 * Display with explicit spacing override (for special cases)
 */
export function displayWithSpacing(
  message: UnifiedDisplayMessage,
  beforeLines: number,
  afterLines: number
): void {
  // Apply explicit spacing before
  for (let i = 0; i < beforeLines; i++) {
    console.log();
  }

  // Format and display the message
  const formattedContent = formatMessageContent(message);
  console.log(formattedContent);

  // Apply explicit spacing after
  for (let i = 0; i < afterLines; i++) {
    console.log();
  }

  // Update context normally
  updateSpacingContext(message);

  // Store message if needed
  if (shouldStoreMessage(message)) {
    storeMessage(message);
  }
}
