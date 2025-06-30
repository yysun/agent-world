/**
 * Terminal Lifecycle Module - Terminal Setup, Shutdown, and Process Management
 * 
 * Core Features:
 * - Terminal-kit initialization and configuration
 * - Graceful shutdown handling with cleanup
 * - Signal handling (SIGINT, SIGTERM) for proper exit
 * - Cursor and input management
 * - Process exit coordination with display systems
 * 
 * Implementation:
 * - Function-based lifecycle management
 * - Integration with streaming display system
 * - Piped input detection and handling
 * - Terminal state preservation and restoration
 * 
 * Architecture:
 * - Centralized terminal setup/teardown
 * - Signal handler registration and cleanup
 * - Coordination with display and streaming modules
 * - Cross-platform terminal compatibility
 */

import { displayUnifiedMessage, isStreamingActive, resetStreamingState } from './display';

// Terminal lifecycle state
interface TerminalLifecycleState {
  term: any;
  isInitialized: boolean;
  shutdownCallbacks: (() => Promise<void> | void)[];
  hasPipedInput: boolean;
}

// Module state
let state: TerminalLifecycleState = {
  term: null,
  isInitialized: false,
  shutdownCallbacks: [],
  hasPipedInput: false
};

/**
 * Initialize terminal-kit and configure terminal for interactive use
 * 
 * @param hasPipedInput - Whether input is coming from a pipe
 * @returns Terminal instance
 */
export async function initializeTerminal(hasPipedInput: boolean = false): Promise<any> {
  // Initialize terminal-kit
  const termkit = await import('terminal-kit');
  const term = termkit.default?.terminal || termkit.terminal;

  state.term = term;
  state.hasPipedInput = hasPipedInput;

  if (hasPipedInput) {
    displayUnifiedMessage({
      type: 'instruction',
      content: 'Note: Interactive mode not available after piped input.',
      metadata: { source: 'cli', messageType: 'notification' }
    });
  } else {
    // Initialize terminal for interactive mode
    term.grabInput(true);
    term.hideCursor();

    // Don't clear terminal - let content flow naturally
    term('\x1b[?25h'); // Show cursor using ANSI escape
  }

  state.isInitialized = true;
  return term;
}

/**
 * Setup graceful shutdown handlers for SIGINT and SIGTERM
 * Registers signal handlers that will cleanup terminal state and exit gracefully
 */
export function setupShutdownHandlers(): void {
  if (!state.isInitialized) {
    throw new Error('Terminal must be initialized before setting up shutdown handlers');
  }

  const shutdown = async () => {
    await performShutdown();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Add a callback to be executed during shutdown
 * Useful for modules that need cleanup before exit
 * 
 * @param callback - Function to call during shutdown
 */
export function addShutdownCallback(callback: () => Promise<void> | void): void {
  state.shutdownCallbacks.push(callback);
}

/**
 * Perform graceful shutdown sequence
 * Executes all registered callbacks, cleans up terminal state, and exits
 */
export async function performShutdown(): Promise<void> {
  // Execute all shutdown callbacks
  for (const callback of state.shutdownCallbacks) {
    try {
      await callback();
    } catch (error) {
      console.error('Error during shutdown callback:', error);
    }
  }

  // Reset streaming state
  resetStreamingState();

  // Cleanup terminal state
  if (state.term && !state.hasPipedInput) {
    state.term.grabInput(false);
    state.term.clear();
    state.term('\x1b[?25h'); // Show cursor
    state.term.moveTo(1, 1);
  }

  // Display goodbye message
  displayUnifiedMessage({
    type: 'instruction',
    content: 'Goodbye! 👋',
    skipSpacing: true,
    metadata: { source: 'cli', messageType: 'notification' }
  });

  process.exit(0);
}

/**
 * Cleanup terminal without exiting process
 * Useful for transitioning between different terminal modes
 */
export function cleanupTerminal(): void {
  if (state.term && !state.hasPipedInput) {
    state.term.grabInput(false);
    state.term('\x1b[?25h'); // Show cursor
  }
}

/**
 * Get terminal instance
 */
export function getTerminal(): any {
  return state.term;
}

/**
 * Check if terminal is initialized
 */
export function isTerminalInitialized(): boolean {
  return state.isInitialized;
}

/**
 * Check if input is from pipe
 */
export function hasPipedInput(): boolean {
  return state.hasPipedInput;
}

/**
 * Detect if input is potentially piped
 * Handles tsx/nodemon and other execution environments
 */
export async function detectPipedInput(): Promise<boolean> {
  if (process.stdin.isTTY === false) {
    return true;
  } else if (process.stdin.isTTY === undefined) {
    // For tsx/nodemon, check if data is immediately available
    try {
      const hasData = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 10);

        process.stdin.once('readable', () => {
          clearTimeout(timeout);
          resolve(true);
        });

        if (process.stdin.readable && process.stdin.readableLength > 0) {
          clearTimeout(timeout);
          resolve(true);
        }
      });

      return hasData;
    } catch (error) {
      return false;
    }
  }

  return false;
}

/**
 * Read piped input content
 * Returns the complete piped input as a string
 */
export async function readPipedInput(): Promise<string> {
  let pipedContent = '';
  process.stdin.setEncoding('utf8');

  for await (const chunk of process.stdin) {
    pipedContent += chunk;
  }

  return pipedContent.trim();
}
