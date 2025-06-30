/**
 * Consolidated Display Module - Unified Terminal UI Management
 * 
 * Core Features:
 * - Single point of control for all CLI display operations
 * - Interactive input box management with proper spacing
 * - Real-time streaming display with multi-agent concurrent support
 * - Message formatting and display coordination
 * - Terminal positioning and cursor management
 * - Consistent spacing enforcement: display → blank line → input box
 * 
 * Consolidated Functionality:
 * - Terminal display: Input box drawing, positioning, visibility management
 * - Display management: Coordination between streaming, input prompts, and display timing
 * - Streaming display: Real-time agent response streaming with visual indicators
 * - Unified display: Consistent message formatting and spacing across all display types
 * 
 * Implementation:
 * - Function-based design with consolidated state management
 * - Terminal-kit integration for enhanced UI experience
 * - Direct ANSI escape sequences for precise cursor control
 * - Event-driven display coordination
 * - Memory-efficient state tracking
 * 
 * Architecture:
 * - Centralized display sequencing: content → blank line → input box pattern
 * - Multi-agent streaming with dedicated line positioning
 * - Unified message interface with type-safe formatting
 * - Performance optimized for real-time streaming
 */

import { colors } from './colors';
import { addMessageToStore, createStoredMessage } from '../message-store';
import { hasPipedInput as getHasPipedInput } from './terminal-lifecycle';

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

// Terminal display state management
interface TerminalDisplayState {
  inputBoxY: number;
  isInputBoxVisible: boolean;
  term: any; // Terminal-kit instance
}

// Streaming agent state management
interface StreamingAgent {
  agentName: string;
  isStreaming: boolean;
  hasStarted: boolean;
  contentBuffer: string;
  tokenCount: number;
  lineOffset: number; // Relative line position from start of streaming block
  emojiFlashTimer?: NodeJS.Timeout; // Timer for flashing emoji animation
  hasError?: boolean; // Track if streaming ended with error
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

// Display coordination state
interface DisplayCoordinationState {
  isExitPending: boolean;
  exitCallbacks: (() => void)[];
  displayCallbacks: (() => void)[];
}

// Consolidated module state
interface ConsolidatedDisplayState {
  terminal: TerminalDisplayState;
  streaming: {
    activeStreams: Map<string, StreamingAgent>;
    completedStreams: Map<string, StreamingAgent>;
    nextLineOffset: number;
    onAllStreamingEndCallback: (() => void) | null;
    emojiFlashIndex: number;
    isActive: boolean;
  };
  coordination: DisplayCoordinationState;
  global: {
    currentWorldName: string;
  };
}

// Module state
let state: ConsolidatedDisplayState = {
  terminal: {
    inputBoxY: 0,
    isInputBoxVisible: false,
    term: null
  },
  streaming: {
    activeStreams: new Map(),
    completedStreams: new Map(),
    nextLineOffset: 0,
    onAllStreamingEndCallback: null,
    emojiFlashIndex: 0,
    isActive: false
  },
  coordination: {
    isExitPending: false,
    exitCallbacks: [],
    displayCallbacks: []
  },
  global: {
    currentWorldName: 'default'
  }
};

// Debug configuration
const DEBUG_OUTPUT_ENABLED = false;

// Animation constants
const FLASH_EMOJIS = ['●', '○'];

// ============================================================================
// INITIALIZATION AND GLOBAL FUNCTIONS
// ============================================================================

/**
 * Initialize the consolidated display system with terminal-kit instance
 */
export function initializeDisplay(terminalInstance: any): void {
  state.terminal.term = terminalInstance;
  state.terminal.inputBoxY = 0;
  state.terminal.isInputBoxVisible = false;
}

/**
 * Set the current world name for message storage
 */
export function setCurrentWorldName(worldName: string): void {
  state.global.currentWorldName = worldName;
}

// ============================================================================
// UNIFIED MESSAGE DISPLAY SYSTEM
// ============================================================================

/**
 * Main unified display function - single entry point for all message display
 * Enforces consistent spacing: content → blank line → input box pattern
 */
export function displayUnifiedMessage(message: UnifiedDisplayMessage): void {
  // Format the message content based on type
  const formattedContent = formatMessageContent(message);

  // Apply spacing rule: blank line before (unless explicitly skipped)
  if (!message.skipSpacing && !state.streaming.isActive) {
    console.log(); // Blank line before
  }

  // Display the formatted message
  console.log(formattedContent);

  // Apply spacing rule: blank line after (unless explicitly skipped)
  if (!message.skipSpacing && !state.streaming.isActive) {
    console.log(); // Blank line after
  }

  // Store message in CLI session memory if it's a conversational message
  if (shouldStoreMessage(message)) {
    storeMessage(message);
  }

  // After displaying content, ensure proper input box positioning using centralized sequencing
  if (!state.streaming.isActive && !getHasPipedInput()) {
    enforceSequentialDisplayFlow();
  }
}

/**
 * Centralized display sequencing function
 * Enforces: content → blank line → input box pattern
 * Enhanced with edge case handling
 */
function enforceSequentialDisplayFlow(): void {
  try {
    // Handle edge case: if input box is visible but content was just displayed, refresh positioning
    if (state.terminal.isInputBoxVisible) {
      // Hide existing input box to ensure clean slate
      hideInputBox();
    }

    // Ensure there's always a blank line before the input box
    console.log(); // Blank line separator

    // Draw the input box with proper positioning
    drawInputBox('> ');
  } catch (error) {
    // Handle edge cases gracefully - fallback to basic display
    console.error('Error in display sequencing:', error);

    // Attempt basic input box display as fallback
    try {
      if (state.terminal.term) {
        console.log();
        console.log('> '); // Basic prompt fallback
      }
    } catch (fallbackError) {
      console.error('Critical display error:', fallbackError);
    }
  }
}

/**
 * Format message content based on type and subtype
 */
function formatMessageContent(message: UnifiedDisplayMessage): string {
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
    state.global.currentWorldName,
    message.metadata
  );

  addMessageToStore(storedMessage);
}

// ============================================================================
// INPUT BOX MANAGEMENT
// ============================================================================

/**
 * Hide the input box and clear its display area
 * Enhanced with better cleanup and error handling
 */
export function hideInputBox(): void {
  if (!state.terminal.term) return;

  if (state.terminal.isInputBoxVisible && state.terminal.inputBoxY > 0) {
    try {
      // Move to the input box position and clear it completely
      state.terminal.term.moveTo(1, state.terminal.inputBoxY);
      state.terminal.term.eraseDisplayBelow(); // Clear from cursor to end of screen
      state.terminal.isInputBoxVisible = false;
      // Keep inputBoxY for potential redraw - don't reset to 0
    } catch (error) {
      // Handle potential terminal positioning errors gracefully
      console.error('Error hiding input box:', error);
      state.terminal.isInputBoxVisible = false;
    }
  }
}

/**
 * Save current terminal position for input box placement
 * Enhanced with automatic spacing calculation
 */
function saveCurrentPosition(): void {
  if (!state.terminal.term) return;

  // Add consistent spacing before input box
  console.log(); // Ensure separation from content
  console.log(); // Additional spacing for visual clarity
  console.log(); // Final spacing line

  // Calculate optimal input box position (always at bottom with 4-line buffer)
  state.terminal.inputBoxY = state.terminal.term.height - 4;
}

/**
 * Draw the input box border and prompt without input text
 * Enhanced with automatic proper spacing and positioning
 */
export function drawInputBox(prompt: string = '> '): { x: number; y: number } {
  if (!state.terminal.term) {
    return { x: 0, y: 0 };
  }

  const width = state.terminal.term.width;

  // Enhanced position saving with proper spacing
  saveCurrentPosition();

  // Move to calculated input box position
  state.terminal.term.moveTo(1, state.terminal.inputBoxY);

  // Draw input box with enhanced styling
  state.terminal.term.cyan('┌' + '─'.repeat(width - 2) + '┐\n');
  state.terminal.term.cyan('│ ' + prompt);

  const inputStartX = 2 + prompt.length;
  const inputY = state.terminal.inputBoxY + 1;
  const remainingWidth = width - inputStartX - 1;

  // Complete the input box structure
  state.terminal.term(' '.repeat(remainingWidth) + '│\n');
  state.terminal.term.cyan('└' + '─'.repeat(width - 2) + '┘\n');

  // Position cursor at the input area
  state.terminal.term.moveTo(inputStartX, inputY);

  state.terminal.isInputBoxVisible = true;
  return { x: inputStartX, y: inputY };
}

/**
 * Update only the input text portion without redrawing the entire box
 */
export function updateInputText(prompt: string = '> ', userInput: string = ''): { x: number; y: number } {
  if (!state.terminal.term || !state.terminal.isInputBoxVisible) {
    return drawInputBox(prompt);
  }

  const width = state.terminal.term.width;
  const inputStartX = 2 + prompt.length;
  const inputY = state.terminal.inputBoxY + 1;
  const maxInputWidth = width - inputStartX - 1;

  state.terminal.term.moveTo(inputStartX, inputY);

  const displayInput = userInput.length > maxInputWidth
    ? userInput.slice(-maxInputWidth)
    : userInput;

  const padding = Math.max(0, maxInputWidth - displayInput.length);
  state.terminal.term(displayInput + ' '.repeat(padding));

  const cursorX = inputStartX + displayInput.length;
  state.terminal.term.moveTo(cursorX, inputY);

  return { x: cursorX, y: inputY };
}

/**
 * Clear the input text area without redrawing the box
 */
export function clearInputText(prompt: string = '> '): void {
  if (!state.terminal.term || !state.terminal.isInputBoxVisible) return;

  const width = state.terminal.term.width;
  const inputStartX = 2 + prompt.length;
  const inputY = state.terminal.inputBoxY + 1;
  const maxInputWidth = width - inputStartX - 1;

  state.terminal.term.moveTo(inputStartX, inputY);
  state.terminal.term(' '.repeat(maxInputWidth));
  state.terminal.term.moveTo(inputStartX, inputY);
}

// ============================================================================
// STREAMING DISPLAY MANAGEMENT
// ============================================================================

/**
 * Start streaming for a specific agent
 */
export function startStreaming(agentName: string, displayName: string, estimatedInputTokens?: number): void {
  if (!state.streaming.activeStreams.has(agentName)) {
    if (state.streaming.activeStreams.size === 0) {
      console.log();
      state.streaming.nextLineOffset = 0;
      state.streaming.isActive = true;
    }

    const lineOffset = state.streaming.nextLineOffset++;

    state.streaming.activeStreams.set(agentName, {
      agentName,
      isStreaming: true,
      hasStarted: false,
      contentBuffer: '',
      tokenCount: 0,
      lineOffset,
      hasError: false,
      usage: estimatedInputTokens ? {
        inputTokens: estimatedInputTokens,
        outputTokens: 0,
        totalTokens: estimatedInputTokens
      } : undefined
    });

    const initialEmoji = colors.cyan('●');
    const initialPreview = estimatedInputTokens
      ? `${initialEmoji} ${displayName}: ... (↑${estimatedInputTokens} ↓0 tokens)`
      : `${initialEmoji} ${displayName}: ... (0 tokens)`;
    console.log(initialPreview);

    const stream = state.streaming.activeStreams.get(agentName)!;
    stream.hasStarted = true;
    startEmojiFlashing(agentName);
  }
}

/**
 * Add content to an agent's streaming buffer
 */
export function addStreamingContent(agentName: string, content: string): void {
  const stream = state.streaming.activeStreams.get(agentName);
  if (stream && stream.isStreaming) {
    stream.contentBuffer += content;
    stream.tokenCount = stream.contentBuffer
      .split(/[\s\.,;:!?\-'"()\[\]{}]+/)
      .filter(token => token.length > 0).length;
    updateStreamingPreview(agentName);
  }
}

/**
 * End streaming for a specific agent
 */
export function endStreaming(agentName: string): void {
  const stream = state.streaming.activeStreams.get(agentName);
  if (stream) {
    stream.isStreaming = false;
    stopEmojiFlashing(agentName);
    state.streaming.completedStreams.set(agentName, stream);
    state.streaming.activeStreams.delete(agentName);

    if (state.streaming.activeStreams.size === 0) {
      clearAllStreamingLines();
      state.streaming.isActive = false;

      const sortedStreams = Array.from(state.streaming.completedStreams.values())
        .sort((a, b) => a.lineOffset - b.lineOffset);

      for (const completedStream of sortedStreams) {
        const finalContent = completedStream.contentBuffer.trim();
        if (finalContent) {
          displayUnifiedMessage({
            type: 'agent',
            content: finalContent,
            sender: completedStream.agentName,
            metadata: {
              source: 'streaming',
              messageType: 'response',
              tokenCount: completedStream.usage?.outputTokens || completedStream.tokenCount
            }
          });
        } else {
          displayUnifiedMessage({
            type: 'agent',
            content: '[no response]',
            sender: completedStream.agentName,
            metadata: {
              source: 'streaming',
              messageType: 'response'
            }
          });
        }
      }

      state.streaming.completedStreams.clear();
      resetStreamingState();

      if (state.streaming.onAllStreamingEndCallback) {
        setTimeout(() => {
          state.streaming.onAllStreamingEndCallback!();
        }, 50);
      }
    }
  }
}

/**
 * Mark an agent's streaming as having an error
 */
export function markStreamingError(agentName: string): void {
  const stream = state.streaming.activeStreams.get(agentName);
  if (stream) {
    stream.hasError = true;
    stopEmojiFlashing(agentName);

    const linesToMoveUp = state.streaming.activeStreams.size - stream.lineOffset;
    if (linesToMoveUp > 0) {
      process.stdout.write(`\x1B[${linesToMoveUp}A`);
    }

    process.stdout.write('\x1B[2K');
    process.stdout.write('\x1B[G');
    const errorEmoji = colors.red('✗');
    process.stdout.write(`${errorEmoji} ${stream.agentName}: ` + colors.red('[Response ended with error]'));

    if (linesToMoveUp > 0) {
      process.stdout.write(`\x1B[${linesToMoveUp}B`);
    }

    state.streaming.activeStreams.delete(agentName);

    if (state.streaming.activeStreams.size === 0) {
      console.log();
      resetStreamingState();
      if (state.streaming.onAllStreamingEndCallback) {
        setTimeout(() => {
          state.streaming.onAllStreamingEndCallback!();
        }, 50);
      }
    }
  }
}

/**
 * Set token usage information for an agent
 */
export function setStreamingUsage(agentName: string, usage: { inputTokens: number; outputTokens: number; totalTokens: number }): void {
  const stream = state.streaming.activeStreams.get(agentName) || state.streaming.completedStreams.get(agentName);
  if (stream) {
    stream.usage = usage;
  }
}

/**
 * Update the final preview for an agent
 */
export function updateFinalPreview(agentName: string): void {
  updateStreamingPreview(agentName);
}

/**
 * Check if any agent is currently streaming
 */
export function isStreamingActive(): boolean {
  return state.streaming.activeStreams.size > 0;
}

// ============================================================================
// DISPLAY COORDINATION
// ============================================================================

/**
 * Setup streaming end callback to show input prompt when streaming completes
 * Uses centralized sequencing for consistent flow
 */
export function setupStreamingEndCallback(): void {
  setOnAllStreamingEndCallback(() => {
    if (!getHasPipedInput()) {
      enforceSequentialDisplayFlow();
    }
  });
}

/**
 * Set callback to be called when all streaming ends
 */
export function setOnAllStreamingEndCallback(callback: (() => void) | null): void {
  state.streaming.onAllStreamingEndCallback = callback;
}

/**
 * Handle external input processing and exit timing
 */
export function handleExternalInputDisplay(hasExternalInput: boolean, isPiped: boolean): void {
  if (hasExternalInput && isPiped) {
    setTimeout(() => {
      if (!isStreamingActive()) {
        displayUnifiedMessage({
          type: 'instruction',
          content: 'Piped input processed. Exiting...',
          metadata: { source: 'cli', messageType: 'notification' }
        });
        process.exit(0);
      } else {
        setOnAllStreamingEndCallback(() => {
          displayUnifiedMessage({
            type: 'instruction',
            content: 'Streaming completed. Exiting...',
            metadata: { source: 'cli', messageType: 'notification' }
          });
          process.exit(0);
        });
      }
    }, 100);
  } else if (hasExternalInput) {
    setTimeout(() => {
      if (!isStreamingActive()) {
        if (!isPiped) {
          enforceSequentialDisplayFlow();
        }
      }
    }, 100);
  }
}

/**
 * Show initial prompt for interactive mode
 * Just ensures input box is ready - initialization message is handled elsewhere
 */
export function showInitialPrompt(): void {
  if (!getHasPipedInput()) {
    // Just ensure the input box is shown without additional messaging
    // The initialization message is displayed by loadAgents function
    enforceSequentialDisplayFlow();
  }
}

/**
 * Handle post-command display timing
 * Uses centralized sequencing to ensure proper flow
 */
export function handlePostCommandDisplay(): void {
  enforceSequentialDisplayFlow();
}

/**
 * Handle post-broadcast display timing
 * Uses centralized sequencing with streaming coordination
 */
export function handlePostBroadcastDisplay(): void {
  setTimeout(() => {
    if (!isStreamingActive()) {
      enforceSequentialDisplayFlow();
    }
  }, 50);
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Display success message
 */
export function displaySuccess(content: string): void {
  displayUnifiedMessage({
    type: 'command',
    content,
    commandSubtype: 'success'
  });
}

/**
 * Display error message
 */
export function displayError(content: string): void {
  displayUnifiedMessage({
    type: 'error',
    content
  });
}

/**
 * Display warning message
 */
export function displayWarning(content: string): void {
  displayUnifiedMessage({
    type: 'command',
    content,
    commandSubtype: 'warning'
  });
}

/**
 * Display info message
 */
export function displayInfo(content: string): void {
  displayUnifiedMessage({
    type: 'command',
    content,
    commandSubtype: 'info'
  });
}

/**
 * Display instruction message
 */
export function displayInstruction(content: string): void {
  displayUnifiedMessage({
    type: 'instruction',
    content
  });
}

/**
 * Display debug message
 */
export function displayDebugMessage(message: string): void {
  if (!DEBUG_OUTPUT_ENABLED) return;

  displayUnifiedMessage({
    type: 'debug',
    content: message,
    skipSpacing: state.streaming.isActive,
    metadata: { source: 'streaming' }
  });
}

// ============================================================================
// PRIVATE HELPER FUNCTIONS
// ============================================================================

/**
 * Start emoji flashing animation for an agent
 */
function startEmojiFlashing(agentName: string): void {
  const stream = state.streaming.activeStreams.get(agentName);
  if (!stream) return;

  if (stream.emojiFlashTimer) {
    clearInterval(stream.emojiFlashTimer);
  }

  stream.emojiFlashTimer = setInterval(() => {
    if (!state.streaming.activeStreams.has(agentName)) {
      clearInterval(stream.emojiFlashTimer!);
      return;
    }
    updateStreamingPreview(agentName);
  }, 500);
}

/**
 * Stop emoji flashing animation for an agent
 */
function stopEmojiFlashing(agentName: string): void {
  const stream = state.streaming.activeStreams.get(agentName);
  if (stream?.emojiFlashTimer) {
    clearInterval(stream.emojiFlashTimer);
    stream.emojiFlashTimer = undefined;
  }
}

/**
 * Get current emoji for animation
 */
function getCurrentEmoji(): string {
  const emoji = FLASH_EMOJIS[state.streaming.emojiFlashIndex];
  state.streaming.emojiFlashIndex = (state.streaming.emojiFlashIndex + 1) % FLASH_EMOJIS.length;
  return colors.cyan(emoji);
}

/**
 * Update streaming preview for an agent
 */
function updateStreamingPreview(agentName: string): void {
  const stream = state.streaming.activeStreams.get(agentName) || state.streaming.completedStreams.get(agentName);
  if (!stream) return;

  const previewContent = stream.contentBuffer
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let displayContent = previewContent;
  if (displayContent.length > 50) {
    displayContent = displayContent.substring(0, 50);
  }

  let tokenDisplay: string;
  if (stream.usage) {
    const outputTokens = stream.contentBuffer
      .split(/[\s\.,;:!?\-'"()\[\]{}]+/)
      .filter(token => token.length > 0).length;
    stream.usage.outputTokens = outputTokens;
    stream.usage.totalTokens = stream.usage.inputTokens + outputTokens;
    tokenDisplay = `↑${stream.usage.inputTokens} ↓${stream.usage.outputTokens} tokens`;
  } else {
    const tokenCount = stream.contentBuffer
      .split(/[\s\.,;:!?\-'"()\[\]{}]+/)
      .filter(token => token.length > 0).length;
    tokenDisplay = `${tokenCount} tokens`;
  }

  const emoji = getCurrentEmoji();
  const preview = `${emoji} ${stream.agentName}: ${displayContent} ... (${tokenDisplay})`;

  const targetLine = stream.lineOffset + 1;
  process.stdout.write('\x1B[s');
  process.stdout.write(`\x1B[${targetLine}A`);
  process.stdout.write('\x1B[2K');
  process.stdout.write('\x1B[G');
  process.stdout.write(preview);
  process.stdout.write('\x1B[u');
}

/**
 * Clear all streaming preview lines
 */
function clearAllStreamingLines(): void {
  if (state.streaming.nextLineOffset === 0) return;

  process.stdout.write(`\x1B[${state.streaming.nextLineOffset}A`);

  for (let i = 0; i < state.streaming.nextLineOffset; i++) {
    process.stdout.write('\x1B[2K');
    if (i < state.streaming.nextLineOffset - 1) {
      process.stdout.write('\x1B[B');
    }
  }

  process.stdout.write(`\x1B[${state.streaming.nextLineOffset - 1}A`);
  process.stdout.write('\x1B[G');
}

/**
 * Reset all streaming state (for cleanup)
 */
export function resetStreamingState(): void {
  for (const stream of state.streaming.activeStreams.values()) {
    if (stream.emojiFlashTimer) {
      clearInterval(stream.emojiFlashTimer);
    }
  }

  state.streaming.activeStreams.clear();
  state.streaming.completedStreams.clear();
  state.streaming.nextLineOffset = 0;
}

// ============================================================================
// BACKWARDS COMPATIBILITY EXPORTS
// ============================================================================

// Re-export functions for backward compatibility
export { initializeDisplay as initializeTerminalDisplay };
