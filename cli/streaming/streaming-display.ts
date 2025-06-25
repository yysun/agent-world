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
 * 
 * Implementation:
 * - Function-based approach with Map-based state management
 * - Direct ANSI escape sequences for cursor control and line updates
 * - Each agent gets assigned a dedicated line offset for streaming display
 * - Emoji flashing animation runs independently per agent on the same line
 * - Completed streams are hidden and logged as final content
 * - Status emoji coloring: cyan (streaming), green (success), red (errors)
 */

import { colors } from '../utils/colors';

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
}

// State management
const activeStreams = new Map<string, StreamingAgent>();
let nextLineOffset = 0; // Next available line offset for new agents

// Callback for when all streaming ends
let onAllStreamingEndCallback: (() => void) | null = null;

// Emoji flashing animation constants
const FLASH_EMOJIS = ['●', '○']; // Filled and empty circles for flashing effect
let emojiFlashIndex = 0;

/**
 * Start streaming for a specific agent
 */
export function startStreaming(agentName: string, displayName: string): void {
  if (!activeStreams.has(agentName)) {
    // If this is the first agent, mark the starting line and add initial spacing
    if (activeStreams.size === 0) {
      console.log(); // Add newline before streaming block starts
      nextLineOffset = 0;
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
      hasError: false
    });

    // Create a new line for this agent and show initial preview
    const initialEmoji = colors.cyan('●');
    const initialPreview = `${initialEmoji} ${displayName}: ... (0 tokens)`;
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

    // Clear the streaming line first
    clearStreamingLine(agentName);

    // Log the final message content with newline
    const finalContent = stream.contentBuffer.trim();
    if (finalContent) {
      console.log(`${colors.green('✓')} ${stream.agentName}: ${colors.gray(finalContent)}`);
      console.log(); // Add newline after final content
    } else {
      console.log(`${colors.green('✓')} ${stream.agentName}: ${colors.gray('[no response]')}`);
      console.log(); // Add newline after final content
    }

    // Remove this agent from active streams
    activeStreams.delete(agentName);

    // If this is the last active stream, do final cleanup
    if (activeStreams.size === 0) {
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

  if (activeStreams.size > 0) {
    // If streaming is active, print the debug message and stay where we are
    // This will naturally place the debug message after the last streaming line
    console.log(message);
  } else {
    // No streaming active, normal display
    console.log(message);
  }
}

/**
 * Display user input that's being sent to agents
 */
export function displayUserInput(message: string): void {
  const orangeDot = colors.orange('●');
  console.log(`${orangeDot} you: ${message}`);
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
  const stream = activeStreams.get(agentName);
  if (!stream || !stream.isStreaming) return;

  // Create preview content (50 characters max)
  const previewContent = stream.contentBuffer
    .replace(/\n/g, ' ') // Replace newlines with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  let displayContent = previewContent;
  if (displayContent.length > 50) {
    displayContent = displayContent.substring(0, 50);
  }

  // Count tokens (approximate: split by spaces and punctuation)
  const tokenCount = stream.contentBuffer
    .split(/[\s\.,;:!?\-'"()\[\]{}]+/)
    .filter(token => token.length > 0).length;

  // Format: ● agentName: [content] ... (xxx tokens)
  const emoji = getCurrentEmoji(stream.hasError);
  const preview = `${emoji} ${stream.agentName}: ${displayContent} ... (${tokenCount} tokens)`;

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

