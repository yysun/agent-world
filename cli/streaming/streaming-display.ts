/**
 * Streaming Display Manager - Real-time Agent Response Display
 * 
 * Features:
 * - Multi-agent concurrent streaming with dedicated line positioning
 * - Real-time emoji flashing indicators (●/○) with token counting
 * - Direct terminal control with ANSI escape sequences for precise line targeting
 * - Content buffering and preview updates during streaming
 * - Final content display with proper formatting and status indicators
 * - Error handling with visual feedback
 * 
 * Architecture:
 * - Function-based approach with Map-based state management
 * - Direct ANSI escape sequences for cursor control and line updates
 * - Status emoji coloring: cyan (streaming), green (success), red (errors)
 * - Content formatting with gray text styling for final responses
 * 
 * Implementation:
 * - Each agent gets assigned a dedicated line offset for streaming display
 * - Emoji flashing animation runs independently per agent on the same line
 * - Final content display updates each agent's line in place
 * - Graceful error handling with visual error indicators
 * 
 * Recent Changes:
 * - Replaced terminal utility functions with direct ANSI escape sequences
 * - Fixed cursor positioning to prevent creating multiple lines
 * - Simplified line management to update content in place
 */

import { colors } from '../utils/colors';

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
const completedAgents = new Map<string, StreamingAgent>(); // Store completed agents for final display
let nextLineOffset = 0; // Next available line offset for new agents

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

    // Store completed agent data for final display
    completedAgents.set(agentName, stream);

    // Remove this agent from active streams
    activeStreams.delete(agentName);

    // If this is the last active stream, show all final content
    if (activeStreams.size === 0) {
      displayFinalContent();
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

    // Store completed agent data for final display (with error status)
    completedAgents.set(agentName, stream);

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
    }
  }
}

/**
 * Display a debug message, handling streaming state properly
 */
export function displayDebugMessage(message: string): void {
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

  // Clear all completed timers
  for (const stream of completedAgents.values()) {
    if (stream.emojiFlashTimer) {
      clearInterval(stream.emojiFlashTimer);
    }
  }

  activeStreams.clear();
  completedAgents.clear();
  nextLineOffset = 0;
}

// Private helper functions

function displayFinalContent(): void {
  // Get all completed streams
  const completedStreams = Array.from(completedAgents.values()).sort((a, b) => a.lineOffset - b.lineOffset);

  // For each completed stream, move to its line and update with final content
  for (let i = 0; i < completedStreams.length; i++) {
    const finalStream = completedStreams[i];

    // Calculate how many lines to move up to reach this agent's line
    const linesToMoveUp = completedStreams.length - i;

    // Move cursor up to this agent's line
    if (linesToMoveUp > 0) {
      process.stdout.write(`\x1B[${linesToMoveUp}A`); // Move cursor up
    }

    // Clear the line and show final content inline
    process.stdout.write('\x1B[2K'); // Clear entire line
    process.stdout.write('\x1B[G');  // Move to beginning of line

    const fullContent = finalStream.contentBuffer.trim();
    const statusEmoji = getStatusEmoji(finalStream.hasError);

    if (fullContent) {
      // Show final content on same line with green checkmark
      const finalDisplay = `${statusEmoji} ${finalStream.agentName}: ${colors.gray(fullContent)}`;
      process.stdout.write(finalDisplay);
    } else {
      const finalDisplay = `${statusEmoji} ${finalStream.agentName}: ${colors.gray('[no response]')}`;
      process.stdout.write(finalDisplay);
    }

    // Move cursor back down
    if (linesToMoveUp > 0) {
      process.stdout.write(`\x1B[${linesToMoveUp}B`); // Move cursor down
    }
  }

  // Add final spacing and reset
  console.log(); // Add spacing after final content
  resetStreamingState();
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
  const stream = activeStreams.get(agentName) || completedAgents.get(agentName);
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

function getStatusEmoji(hasError?: boolean): string {
  const emoji = '●'; // Use filled circle for final display

  // Color the emoji based on status
  if (hasError) {
    return colors.red(emoji);
  } else {
    return colors.green(emoji);
  }
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

function createBorderedContent(agentName: string, content: string, hasError?: boolean): string {
  const statusEmoji = getStatusEmoji(hasError);

  // Prepare the first line with emoji and agent name (single space)
  const firstLine = `${statusEmoji} ${agentName}: `;

  // Split content into lines first to preserve newlines
  const contentLines = content.trim().split('\n');
  const lines: string[] = [];
  let isFirstLine = true;

  for (const contentLine of contentLines) {
    if (contentLine.trim() === '') {
      // Empty line - add empty line
      lines.push('');
      continue;
    }

    // Use full line without any border or artificial length limits
    const words = contentLine.trim().split(/\s+/);
    let currentLine = isFirstLine ? firstLine : '  '; // Add two spaces for indentation on subsequent lines

    // Simply add all words to the line (terminal will handle natural wrapping)
    for (const word of words) {
      const wordToAdd = (currentLine === firstLine || currentLine === '  ' ? '' : ' ') + word;
      // Apply gray color to content words (not to the emoji and agent name)
      if (currentLine === firstLine) {
        // First line: add gray color to content after agent name
        currentLine += colors.gray(wordToAdd);
      } else {
        // Subsequent lines: entire line should be gray with indentation
        currentLine += colors.gray(wordToAdd);
      }
    }

    if (currentLine.trim()) {
      lines.push(currentLine);
    }

    isFirstLine = false;
  }

  // Return lines without any border
  return lines.join('\n');
}
