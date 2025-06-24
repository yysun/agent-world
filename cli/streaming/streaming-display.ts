/**
 * Streaming Display Manager - Real-time Agent Response Display
 * 
 * Features:
 * - Multi-agent concurrent streaming with dedicated line positioning
 * - Real-time emoji flashing indicators (●/○) with token counting
 * - Terminal cursor management for precise line targeting
 * - Content buffering and preview updates during streaming
 * - Final content display with proper formatting and borders
 * - Error handling with visual feedback
 * 
 * Architecture:
 * - Function-based approach with Map-based state management
 * - Terminal control with cursor save/restore for multi-line updates
 * - Status emoji coloring: cyan (streaming), green (success), red (errors)
 * - Content formatting with gray text styling and proper newline preservation
 * 
 * Implementation:
 * - Each agent gets assigned a dedicated line offset for streaming display
 * - Emoji flashing animation runs independently per agent
 * - Final content display consolidates all agents when streaming completes
 * - Graceful error handling with visual error indicators
 */

import { colors, terminal } from '../utils/colors';

// Agent response management for real-time streaming
interface StreamingAgent {
  agentName: string;
  isStreaming: boolean;
  hasStarted: boolean;
  contentBuffer: string;
  tokenCount: number;
  previewLine: number;
  lineOffset: number; // Relative line position from start of streaming block
  emojiFlashTimer?: NodeJS.Timeout; // Timer for flashing emoji animation
  hasError?: boolean; // Track if streaming ended with error
}

// State management
const activeStreams = new Map<string, StreamingAgent>();
const completedAgents = new Map<string, StreamingAgent>(); // Store completed agents for final display
let streamingStartLine = 0; // The line where streaming block starts
let nextLineOffset = 0; // Next available line offset for new agents

// Emoji flashing animation constants
const FLASH_EMOJIS = ['●', '○']; // Filled and empty circles for flashing effect
let emojiFlashIndex = 0;

/**
 * Start streaming for a specific agent
 */
export function startStreaming(agentName: string, displayName: string): void {
  if (!activeStreams.has(agentName)) {
    // If this is the first agent, mark the starting line
    if (activeStreams.size === 0) {
      console.log(); // Add newline before streaming block starts
      streamingStartLine = (process.stdout as any).rows || 0;
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
      previewLine: streamingStartLine + lineOffset,
      lineOffset,
      hasError: false
    });
  }

  const stream = activeStreams.get(agentName)!;
  if (!stream.hasStarted) {
    // Create a new line for this agent if needed
    if (stream.lineOffset > 0) {
      // Move to the agent's designated line
      for (let i = 0; i < stream.lineOffset; i++) {
        console.log(); // Create empty lines for agents above
      }
    }

    // Show initial flashing emoji preview for this agent (start with empty content)
    const initialEmoji = colors.cyan('●');
    const initialPreview = `${initialEmoji} ${displayName}: ... (0 tokens)`;
    process.stdout.write(initialPreview);
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

    // Save current cursor position
    process.stdout.write(terminal.saveCursor());

    // Move to this agent's specific line
    const linesToMove = stream.lineOffset;
    if (linesToMove > 0) {
      process.stdout.write(terminal.cursorUp(linesToMove));
    }

    // Clear the preview line and show error with red emoji
    process.stdout.write(terminal.clearToEnd());
    process.stdout.write(terminal.cursorToColumn(0));
    const errorEmoji = colors.red('✗');
    process.stdout.write(`${errorEmoji}  ${stream.agentName}: ` + colors.red('[Response ended with error]'));

    // Restore cursor position
    process.stdout.write(terminal.restoreCursor());

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
  streamingStartLine = 0;
  nextLineOffset = 0;
}

// Private helper functions

function displayFinalContent(): void {
  // Get all completed streams
  const completedStreams = Array.from(completedAgents.values()).sort((a, b) => a.lineOffset - b.lineOffset);

  // Move cursor to start of streaming block and clear preview lines
  const totalLines = completedStreams.length;
  if (totalLines > 0) {
    // Move up to the first agent's line
    process.stdout.write(terminal.cursorUp(totalLines - 1));

    // Clear all preview lines
    for (let i = 0; i < totalLines; i++) {
      process.stdout.write(terminal.clearLine());
      process.stdout.write(terminal.cursorToColumn(0));
      if (i < totalLines - 1) {
        process.stdout.write(terminal.cursorDown(1));
      }
    }

    // Move back to start of block
    process.stdout.write(terminal.cursorUp(totalLines - 1));
    process.stdout.write(terminal.cursorToColumn(0));

    // Display final content for all agents with borders
    for (const finalStream of completedStreams) {
      const fullContent = finalStream.contentBuffer.trim();
      if (fullContent) {
        console.log(createBorderedContent(finalStream.agentName, fullContent, finalStream.hasError));
      } else {
        console.log(createBorderedContent(finalStream.agentName, '[no response]', finalStream.hasError));
      }
      console.log(); // Add spacing after each response
    }
  }

  // Reset streaming state
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

  // Format: ● agentName: [20 chars] ... (xxx tokens)
  const emoji = getCurrentEmoji(stream.hasError);
  const preview = `${emoji} ${stream.agentName}: ${displayContent} ... (${tokenCount} tokens)`;

  // Save current cursor position
  process.stdout.write(terminal.saveCursor());

  // Move to this agent's specific line
  const linesToMove = stream.lineOffset;
  if (linesToMove > 0) {
    process.stdout.write(terminal.cursorUp(linesToMove));
  }

  // Update the preview line by clearing and rewriting
  process.stdout.write(terminal.clearToEnd());
  process.stdout.write(terminal.cursorToColumn(0));
  process.stdout.write(preview);

  // Restore cursor position
  process.stdout.write(terminal.restoreCursor());
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
