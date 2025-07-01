/**
 * Display Manager Module - Coordination between Streaming, Input, and Display Systems
 * 
 * Core Features:
 * - Coordinexport function handlePostBroadcastDisplay(): void {
  // For broadcast messages, wait for streaming to complete or show prompt if no streaming
  setTimeout(() => {
    if (!StreamingDisplay.isStreamingActive()) {
      drawInputBox('> ');
    }
  }, 50);
}play timing between streaming and input prompts
 * - Manages callbacks for streaming end events
 * - Handles display state during external input processing
 * - Orchestrates input prompt display after streaming completion
 * - Manages exit timing for piped input scenarios
 * 
 * Implementation:
 * - Function-based coordination system
 * - Integration with streaming display and terminal input
 * - State management for display timing
 * - Callback management for event coordination
 * 
 * Architecture:
 * - Centralized display coordination logic
 * - Event-driven display state management
 * - Integration with terminal lifecycle and streaming systems
 * - Clean separation of display concerns
 */

import { isStreamingActive, setOnAllStreamingEndCallback } from './stream';
import { drawInputBox, updateInputText } from './display';
import { displayUnifiedMessage } from './display';
import { detectPipedInput } from './terminal-lifecycle';

// Display manager state
interface DisplayManagerState {
  isExitPending: boolean;
  exitCallbacks: (() => void)[];
  displayCallbacks: (() => void)[];
}

// Module state
let state: DisplayManagerState = {
  isExitPending: false,
  exitCallbacks: [],
  displayCallbacks: []
};

/**
 * Setup streaming end callback to show input prompt when streaming completes
 * Configures the streaming display system to automatically show input prompt
 * when all streaming operations complete
 */
export function setupStreamingEndCallback(): void {
  StreamingDisplay.setOnAllStreamingEndCallback(() => {
    if (!getHasPipedInput()) {
      drawInputBox('> '); // Always show empty input after streaming ends
    }
  });
}

/**
 * Handle external input processing and exit timing
 * Manages the display and exit sequence for piped input and CLI arguments
 * 
 * @param hasExternalInput - Whether external input was provided
 * @param isPiped - Whether input came from a pipe
 */
export function handleExternalInputDisplay(hasExternalInput: boolean, isPiped: boolean): void {
  if (hasExternalInput && isPiped) {
    // Handle piped input exit timing
    setTimeout(() => {
      if (!StreamingDisplay.isStreamingActive()) {
        displayUnifiedMessage({
          type: 'instruction',
          content: 'Piped input processed. Exiting...',
          metadata: { source: 'cli', messageType: 'notification' }
        });
        process.exit(0);
      } else {
        // Set callback to exit when streaming completes
        StreamingDisplay.setOnAllStreamingEndCallback(() => {
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
    // Handle CLI arguments input
    setTimeout(() => {
      if (!StreamingDisplay.isStreamingActive()) {
        if (!isPiped) {
          drawInputBox('> ');
        }
      }
    }, 100);
  }
}

/**
 * Show initial prompt and instructions for interactive mode
 * Displays welcome instructions and initial input prompt
 */
export function showInitialPrompt(): void {
  if (!getHasPipedInput()) {
    // Show instructions first, then draw input box
    displayUnifiedMessage({
      type: 'instruction',
      content: 'Type a message to broadcast to all agents, or use /help for commands.',
      metadata: { source: 'cli', messageType: 'notification' }
    });
    drawInputBox('> ');
  }
}

/**
 * Handle post-command display timing
 * Shows input prompt after command execution, with timing coordination
 */
export function handlePostCommandDisplay(): void {
  drawInputBox('> ');
}

/**
 * Handle post-broadcast display timing
 * Manages input prompt display after message broadcasting
 */
export function handlePostBroadcastDisplay(): void {
  // For broadcast messages, wait for streaming to complete or show prompt if no streaming
  setTimeout(() => {
    if (!StreamingDisplay.isStreamingActive()) {
      showInputPrompt('> ', '');
    }
  }, 50);
}

/**
 * Check if streaming is currently active
 * Wrapper function for streaming state checking
 */
export function isStreamingActive(): boolean {
  return StreamingDisplay.isStreamingActive();
}

/**
 * Add callback to execute when display operations complete
 * 
 * @param callback - Function to call when display is ready
 */
export function addDisplayCallback(callback: () => void): void {
  state.displayCallbacks.push(callback);
}

/**
 * Execute all registered display callbacks
 */
export function executeDisplayCallbacks(): void {
  for (const callback of state.displayCallbacks) {
    try {
      callback();
    } catch (error) {
      console.error('Error executing display callback:', error);
    }
  }

  // Clear callbacks after execution
  state.displayCallbacks = [];
}

/**
 * Set exit pending state
 * Used to coordinate graceful exit timing
 */
export function setExitPending(pending: boolean): void {
  state.isExitPending = pending;
}

/**
 * Check if exit is pending
 */
export function isExitPending(): boolean {
  return state.isExitPending;
}

/**
 * Add callback to execute before exit
 * 
 * @param callback - Function to call before exit
 */
export function addExitCallback(callback: () => void): void {
  state.exitCallbacks.push(callback);
}

/**
 * Execute all exit callbacks and exit
 */
export function executeExitCallbacks(): void {
  for (const callback of state.exitCallbacks) {
    try {
      callback();
    } catch (error) {
      console.error('Error executing exit callback:', error);
    }
  }

  process.exit(0);
}

/**
 * Reset display manager state
 * Useful for testing or reinitialization
 */
export function resetDisplayManagerState(): void {
  state.isExitPending = false;
  state.exitCallbacks = [];
  state.displayCallbacks = [];
}
