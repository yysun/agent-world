/**
 * Streaming Display Manager - Real-time Agent Response Display
 * 
 * Features:
 * - Multi-agent concurrent streaming with dedicated line positioning
 * - Real-time emoji flashing indicators (●/○) with token counting
 * - Direct terminal control with ANSI escape sequences for precise line targeting
 * - Content buffering and preview updates during streaming
 * - Final content logging with proper formatting after streaming completion
 * - Error handling with visual feedback and graceful cleanup
 * - Message display with structured formatting for sender and content
 * 
 * Implementation:
 * - Function-based approach with Map-based state management
 * - Direct ANSI escape sequences for cursor control and line updates
 * - Each agent gets assigned a dedicated line offset for streaming display
 * - Emoji flashing animation runs independently per agent on the same line
 * - Completed streams are hidden and logged as final content
 * - Status emoji coloring: cyan (streaming), green (success), red (errors)
 * - Message objects with sender and content properties for proper formatting
 * 
 * Changes:
 * - Renamed displaySystemMessage to displayMessage for generic message handling
 * - Updated to accept message objects with sender and content properties
 */

import { colors } from './colors';
import { addMessageToStore, createStoredMessage, determineSenderType } from '../message-store';
import { SenderType } from '../../src/types';
import {
  displayUnifiedMessage,
  displayStreamingMessage,
  setCurrentWorldName as setUnifiedWorldName,
  setStreamingActive
} from './unified-display';

// Debug configuration
const DEBUG_OUTPUT_ENABLED = false; // Set to true to show debug messages during streaming

// Agent response management for real-time streaming
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

// State management
const activeStreams = new Map<string, StreamingAgent>();
const completedStreams = new Map<string, StreamingAgent>(); // Store completed streams
let nextLineOffset = 0; // Next available line offset for new agents

// Callback for when all streaming ends
let onAllStreamingEndCallback: (() => void) | null = null;

// Emoji flashing animation constants
const FLASH_EMOJIS = ['●', '○']; // Filled and empty circles for flashing effect
let emojiFlashIndex = 0;

/**
 * Start streaming for a specific agent
 */
export function startStreaming(agentName: string, displayName: string, estimatedInputTokens?: number): void {
  if (!activeStreams.has(agentName)) {
    // If this is the first agent, mark the starting line and add initial spacing
    if (activeStreams.size === 0) {
      console.log(); // Add newline before streaming block starts
      nextLineOffset = 0;
      // Notify unified display system that streaming is active
      setStreamingActive(true);
    }

    // Assign this agent the next available line
    const lineOffset = nextLineOffset++;

    activeStreams.set(agentName, {
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

    // Create a new line for this agent and show initial preview
    const initialEmoji = colors.cyan('●');
    const initialPreview = estimatedInputTokens
      ? `${initialEmoji} ${displayName}: ... (↑${estimatedInputTokens} ↓0 tokens)`
      : `${initialEmoji} ${displayName}: ... (0 tokens)`;
    console.log(initialPreview);

    const stream = activeStreams.get(agentName)!;
    stream.hasStarted = true;

    // Start flashing emoji animation
    startEmojiFlashing(agentName);
  }
}

/**
 * Add content to an agent's streaming buffer
 */
export function addStreamingContent(agentName: string, content: string): void {
  const stream = activeStreams.get(agentName);
  if (stream && stream.isStreaming) {
    // Add content to buffer
    stream.contentBuffer += content;

    // Update token count (approximate: split by spaces and punctuation)
    stream.tokenCount = stream.contentBuffer
      .split(/[\s\.,;:!?\-'"()\[\]{}]+/)
      .filter(token => token.length > 0).length;

    // Update preview immediately with current content
    updateStreamingPreview(agentName);
  }
}

/**
 * End streaming for a specific agent
 */
export function endStreaming(agentName: string): void {
  const stream = activeStreams.get(agentName);
  if (stream) {
    stream.isStreaming = false;

    // Stop emoji flashing animation
    stopEmojiFlashing(agentName);

    // Store completed agent data for final display
    completedStreams.set(agentName, stream);

    // Remove this agent from active streams
    activeStreams.delete(agentName);

    // If this is the last active stream, clear all previews and show final content
    if (activeStreams.size === 0) {
      // Clear all streaming preview lines first
      clearAllStreamingLines();

      // Notify unified display system that streaming is no longer active
      setStreamingActive(false);

      // Display final content for all completed agents in order using unified display
      const sortedStreams = Array.from(completedStreams.values()).sort((a, b) => a.lineOffset - b.lineOffset);

      for (const completedStream of sortedStreams) {
        const finalContent = completedStream.contentBuffer.trim();
        if (finalContent) {
          // Use unified display system for final agent responses
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
          // Use unified display for empty responses  
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

      // Clean up completed streams
      completedStreams.clear();

      displayFinalContent();
      // Call the callback if set, with a small delay to ensure output is complete
      if (onAllStreamingEndCallback) {
        setTimeout(() => {
          onAllStreamingEndCallback!();
        }, 50);
      }
    }
  }
}

/**
 * Mark an agent's streaming as having an error
 */
export function markStreamingError(agentName: string): void {
  const stream = activeStreams.get(agentName);
  if (stream) {
    // Mark as error and stop emoji flashing animation
    stream.hasError = true;
    stopEmojiFlashing(agentName);

    // Calculate how many lines to move up to reach this agent's line
    const linesToMoveUp = activeStreams.size - stream.lineOffset;

    // Move cursor up to this agent's line
    if (linesToMoveUp > 0) {
      process.stdout.write(`\x1B[${linesToMoveUp}A`); // Move cursor up
    }

    // Clear the line and show error
    process.stdout.write('\x1B[2K'); // Clear entire line
    process.stdout.write('\x1B[G');  // Move to beginning of line
    const errorEmoji = colors.red('✗');
    process.stdout.write(`${errorEmoji} ${stream.agentName}: ` + colors.red('[Response ended with error]'));

    // Move cursor back down to the bottom
    if (linesToMoveUp > 0) {
      process.stdout.write(`\x1B[${linesToMoveUp}B`); // Move cursor down
    }

    // Remove this agent from active streams
    activeStreams.delete(agentName);

    // If no more active streams, clean up and reset
    if (activeStreams.size === 0) {
      console.log(); // Add spacing
      resetStreamingState();
      // Call the callback if set, with a small delay to ensure output is complete
      if (onAllStreamingEndCallback) {
        setTimeout(() => {
          onAllStreamingEndCallback!();
        }, 50);
      }
    }
  }
}

/**
 * Set callback to be called when all streaming ends
 */
export function setOnAllStreamingEndCallback(callback: (() => void) | null): void {
  onAllStreamingEndCallback = callback;
}

/**
 * Display a debug message, handling streaming state properly
 */
export function displayDebugMessage(message: string): void {
  if (!DEBUG_OUTPUT_ENABLED) {
    return; // Debug output is disabled
  }

  // Use unified display system for debug messages
  displayUnifiedMessage({
    type: 'debug',
    content: message,
    skipSpacing: activeStreams.size > 0, // Skip spacing during streaming
    metadata: { source: 'streaming' }
  });
}

/**
 * Display user input that's being sent to agents
 * @deprecated Use displayFormattedMessage instead
 */
export function displayUserInput(message: string): void {
  displayFormattedMessage({
    sender: 'you',
    senderType: SenderType.HUMAN,
    content: message,
    metadata: { source: 'cli', messageType: 'command' }
  });
}

/**
 * Display messages with a red dot
 * @deprecated Use displayFormattedMessage instead
 */
export function displayMessage(messageData: { content: string; sender: string }): void {
  displayFormattedMessage({
    sender: messageData.sender,
    content: messageData.content,
    metadata: { source: 'system', messageType: 'notification' }
  });
}

// Global world name for message storage
let currentWorldName: string = 'default';

/**
 * Set the current world name for message storage
 */
export function setCurrentWorldName(worldName: string): void {
  currentWorldName = worldName;
  // Sync with unified display system
  setUnifiedWorldName(worldName);
}

// Unified message display interface
export interface DisplayMessage {
  sender: string;
  senderType?: SenderType;
  content: string;
  dotColor?: string;
  metadata?: {
    source?: 'cli' | 'streaming' | 'system';
    messageType?: 'response' | 'command' | 'notification' | 'error';
    agentModel?: string;
    tokenCount?: number;
  };
}

/**
 * Unified display function for all message types
 * This is the single capture point for all messages to be stored and displayed
 * @deprecated Use unified display system instead
 */
export function displayFormattedMessage(message: DisplayMessage): void {
  // Determine message type based on sender and content
  let messageType: 'human' | 'agent' | 'system' = 'system';

  if (message.senderType === SenderType.HUMAN || message.sender === 'HUMAN' || message.sender === 'you') {
    messageType = 'human';
  } else if (message.senderType === SenderType.AGENT || (message.sender && message.sender !== 'system' && !message.content.startsWith('@human'))) {
    messageType = 'agent';
  }

  // Convert to unified display message
  displayUnifiedMessage({
    type: messageType,
    content: message.content,
    sender: message.sender,
    skipSpacing: activeStreams.size > 0, // Skip spacing during streaming for real-time display
    metadata: message.metadata
  });
}

/**
 * Check if any agent is currently streaming
 */
export function isStreamingActive(): boolean {
  return activeStreams.size > 0;
}

/**
 * Reset all streaming state (for cleanup)
 */
export function resetStreamingState(): void {
  // Clear all active timers
  for (const stream of activeStreams.values()) {
    if (stream.emojiFlashTimer) {
      clearInterval(stream.emojiFlashTimer);
    }
  }

  activeStreams.clear();
  completedStreams.clear();
  nextLineOffset = 0;
}

/**
 * Clear the streaming line for a specific agent
 */
function clearStreamingLine(agentName: string): void {
  const stream = activeStreams.get(agentName);
  if (!stream) return;

  // Calculate how many lines to move up to reach this agent's line
  const linesToMoveUp = nextLineOffset - stream.lineOffset;

  if (linesToMoveUp > 0) {
    // Move cursor up to this agent's line
    process.stdout.write(`\x1B[${linesToMoveUp}A`);
  }

  // Clear the entire line
  process.stdout.write('\x1B[2K'); // Clear entire line
  process.stdout.write('\x1B[G');  // Move to beginning of line

  if (linesToMoveUp > 0) {
    // Move cursor back down to the bottom
    process.stdout.write(`\x1B[${linesToMoveUp}B`);
  }
}

/**
 * Clear all streaming preview lines
 */
function clearAllStreamingLines(): void {
  if (nextLineOffset === 0) return;

  // Move cursor up to the first streaming line
  process.stdout.write(`\x1B[${nextLineOffset}A`);

  // Clear all streaming lines
  for (let i = 0; i < nextLineOffset; i++) {
    process.stdout.write('\x1B[2K'); // Clear entire line
    if (i < nextLineOffset - 1) {
      process.stdout.write('\x1B[B'); // Move down to next line
    }
  }

  // Move cursor back to beginning of first line
  process.stdout.write(`\x1B[${nextLineOffset - 1}A`);
  process.stdout.write('\x1B[G'); // Move to beginning of line
}

// Private helper functions

function displayFinalContent(): void {
  // Reset streaming state
  resetStreamingState();
}

/**
 * Refresh the streaming display by clearing all lines and redrawing only active streams
 */
function refreshStreamingDisplay(): void {
  const totalLines = nextLineOffset;

  if (totalLines === 0) return;

  // Move cursor up to first streaming line and clear all lines
  process.stdout.write(`\x1B[${totalLines}A`);

  // Clear all streaming lines
  for (let i = 0; i < totalLines; i++) {
    process.stdout.write('\x1B[2K'); // Clear entire line
    if (i < totalLines - 1) {
      process.stdout.write('\x1B[B'); // Move down to next line
    }
  }

  // Move cursor back to first line
  process.stdout.write(`\x1B[${totalLines - 1}A`);

  // Redraw only active streams
  const activeStreamsList = Array.from(activeStreams.values()).sort((a, b) => a.lineOffset - b.lineOffset);

  // Update line offsets for remaining active streams
  for (let i = 0; i < activeStreamsList.length; i++) {
    const stream = activeStreamsList[i];
    stream.lineOffset = i;

    // Display this stream
    const statusEmoji = stream.isStreaming ? '●' : '○';
    const truncatedContent = stream.contentBuffer.length > 60
      ? stream.contentBuffer.substring(0, 57) + '...'
      : stream.contentBuffer;

    const display = `${statusEmoji} ${stream.agentName}: ${truncatedContent} (${stream.tokenCount} tokens)`;
    process.stdout.write(display);

    if (i < activeStreamsList.length - 1) {
      process.stdout.write('\n');
    }
  }

  // Update nextLineOffset to match current active streams
  nextLineOffset = activeStreamsList.length;
}

function startEmojiFlashing(agentName: string): void {
  const stream = activeStreams.get(agentName);
  if (!stream) return;

  // Clear any existing timer
  if (stream.emojiFlashTimer) {
    clearInterval(stream.emojiFlashTimer);
  }

  // Start flashing animation (500ms interval)
  stream.emojiFlashTimer = setInterval(() => {
    if (!activeStreams.has(agentName)) {
      // Agent is no longer streaming, stop the timer
      clearInterval(stream.emojiFlashTimer!);
      return;
    }

    updateStreamingPreview(agentName);
  }, 500);
}

function stopEmojiFlashing(agentName: string): void {
  const stream = activeStreams.get(agentName);
  if (stream?.emojiFlashTimer) {
    clearInterval(stream.emojiFlashTimer);
    stream.emojiFlashTimer = undefined;
  }
}

function getCurrentEmoji(hasError?: boolean): string {
  const emoji = FLASH_EMOJIS[emojiFlashIndex];
  emojiFlashIndex = (emojiFlashIndex + 1) % FLASH_EMOJIS.length;

  // Use cyan for streaming (different from final status colors)
  return colors.cyan(emoji);
}

function updateStreamingPreview(agentName: string): void {
  const stream = activeStreams.get(agentName) || completedStreams.get(agentName);
  if (!stream) return;

  // Create preview content (50 characters max)
  const previewContent = stream.contentBuffer
    .replace(/\n/g, ' ') // Replace newlines with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  let displayContent = previewContent;
  if (displayContent.length > 50) {
    displayContent = displayContent.substring(0, 50);
  }

  // Count tokens (approximate: split by spaces and punctuation, unless we have actual usage)
  let tokenDisplay: string;
  if (stream.usage) {
    // Update output token count based on current content
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

  // Format: ● agentName: [content] ... (xxx tokens)
  const emoji = getCurrentEmoji(stream.hasError);
  const preview = `${emoji} ${stream.agentName}: ${displayContent} ... (${tokenDisplay})`;

  // Find the line for this agent (count from 1, as line 0 is the first streaming line)
  const targetLine = stream.lineOffset + 1;

  // Save current cursor position, move to target line, update, restore
  process.stdout.write('\x1B[s'); // Save cursor position
  process.stdout.write(`\x1B[${targetLine}A`); // Move up to target line
  process.stdout.write('\x1B[2K'); // Clear entire line
  process.stdout.write('\x1B[G');  // Move to beginning of line
  process.stdout.write(preview);
  process.stdout.write('\x1B[u'); // Restore cursor position
}

/**
 * Update the final preview for an agent (used when usage info becomes available)
 */
export function updateFinalPreview(agentName: string): void {
  updateStreamingPreview(agentName);
}

/**
 * Set token usage information for an agent
 */
export function setStreamingUsage(agentName: string, usage: { inputTokens: number; outputTokens: number; totalTokens: number }): void {
  const stream = activeStreams.get(agentName) || completedStreams.get(agentName);
  if (stream) {
    stream.usage = usage;
  }
}

