/**
 * Agent World - Streaming Manager Module
 * Real-time Agent Response Streaming with Visual Indicators
 * 
 * Features:
 * - Multi-agent concurrent streaming with dedicated line positioning
 * - Real-time flashing emoji indicators (●/○) and token counting
 * - Content buffering and preview generation with 50-character limits
 * - Error handling and cleanup for failed streams
 * - Final content formatting with proper newline preservation
 * 
 * Architecture:
 * - Function-based streaming manager with state management
 * - Agent stream lifecycle: start → chunk → end/error
 * - Emoji flashing animation with 500ms intervals
 * - Color-coded status indicators (cyan=streaming, green=success, red=error)
 * 
 * Usage:
 * 1. Call createStreamingManager() to get manager functions
 * 2. Call handleStreamingEvent() for SSE events
 * 3. Manager handles all preview updates and final display
 */

import { colors } from '../utils/colors';

export interface StreamingAgent {
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

export interface StreamingUI {
  displaySystem(message: string): void;
  displayMessage(agentName: string, content: string): void;
  displayError(message: string): void;
  updateStreamingPreview(agentName: string, preview: string): void;
  clearStreamingPreview(agentName: string): void;
}

export interface StreamingManager {
  handleStreamingEvent(type: 'start' | 'chunk' | 'end' | 'error', agentName: string, agentDisplayName: string, content?: string): void;
  isStreamingActive(): boolean;
  cleanup(): void;
}

/**
 * Create a streaming manager with encapsulated state
 */
export function createStreamingManager(ui: StreamingUI): StreamingManager {
  // Internal state
  const activeStreams = new Map<string, StreamingAgent>();
  const completedAgents = new Map<string, StreamingAgent>(); // Store completed agents for final display
  let streamingStartLine = 0; // The line where streaming block starts
  let nextLineOffset = 0; // Next available line offset for new agents

  // Emoji flashing animation for streaming indicators
  const FLASH_EMOJIS = ['●', '○']; // Filled and empty circles for flashing effect
  let emojiFlashIndex = 0;

  /**
   * Handle incoming streaming events from SSE
   */
  function handleStreamingEvent(type: 'start' | 'chunk' | 'end' | 'error', agentName: string, agentDisplayName: string, content?: string): void {
    switch (type) {
      case 'start':
        startStreaming(agentName, agentDisplayName);
        break;
      case 'chunk':
        addStreamingContent(agentName, content || '');
        break;
      case 'end':
        endStreaming(agentName);
        break;
      case 'error':
        markStreamingError(agentName);
        break;
    }
  }

  /**
   * Check if any streams are currently active
   */
  function isStreamingActive(): boolean {
    return activeStreams.size > 0;
  }

  function startStreaming(agentName: string, agentDisplayName: string): void {
    if (!activeStreams.has(agentName)) {
      // If this is the first agent, mark the starting line
      if (activeStreams.size === 0) {
        ui.displaySystem(''); // Add newline before streaming block starts
        streamingStartLine = 0; // UI handles line management
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
      // Show initial flashing emoji preview for this agent (start with empty content)
      const initialEmoji = colors.cyan('●');
      const initialPreview = `${initialEmoji} ${agentDisplayName}: ... (0 tokens)`;
      ui.updateStreamingPreview(agentName, initialPreview);
      stream.hasStarted = true;

      // Start flashing emoji animation
      startEmojiFlashing(agentName);
    }
  }

  function addStreamingContent(agentName: string, content: string): void {
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

  function endStreaming(agentName: string): void {
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
        // Get all completed streams
        const completedStreams = Array.from(completedAgents.values()).sort((a, b) => a.lineOffset - b.lineOffset);

        // Clear all streaming previews
        completedStreams.forEach(stream => {
          ui.clearStreamingPreview(stream.agentName);
        });

        // Display final content for all agents
        completedStreams.forEach(stream => {
          const formattedContent = createBorderedContent(stream.agentName, stream.contentBuffer, stream.hasError);
          ui.displayMessage(stream.agentName, colors.gray(stream.contentBuffer.trim()));
        });

        // Clean up completed agents map
        completedAgents.clear();
        nextLineOffset = 0;
      }
    }
  }

  function markStreamingError(agentName: string): void {
    const stream = activeStreams.get(agentName);
    if (stream) {
      // Mark as error and stop emoji flashing animation
      stream.hasError = true;
      stopEmojiFlashing(agentName);

      // Store completed agent data for final display (with error status)
      completedAgents.set(agentName, stream);

      // Clear the streaming preview for this agent
      ui.clearStreamingPreview(agentName);

      // Show error message
      ui.displayError(`❌ ${stream.agentName}: Response ended with error`);

      // Remove this agent from active streams
      activeStreams.delete(agentName);

      // If no more active streams, clean up and reset
      if (activeStreams.size === 0) {
        completedAgents.clear();
        nextLineOffset = 0;
      }
    }
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

    // Update the streaming preview for this agent
    ui.updateStreamingPreview(stream.agentName, preview);
  }

  /**
   * Helper function to create content display without border
   */
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

  /**
   * Cleanup all active streams and timers
   */
  function cleanup(): void {
    // Stop all emoji flashing timers
    for (const [agentId] of activeStreams) {
      stopEmojiFlashing(agentId);
    }

    // Clear all maps
    activeStreams.clear();
    completedAgents.clear();
    nextLineOffset = 0;
  }

  // Return the manager interface
  return {
    handleStreamingEvent,
    isStreamingActive,
    cleanup
  };
}
