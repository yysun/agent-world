/**
 * Terminal Lifecycle Module - Essential Terminal Functions
 * 
 * Core Features:
 * - Piped input detection and reading
 * - Graceful shutdown with cleanup
 * - Cross-platform terminal compatibility
 * 
 * Implementation:
 * - Simplified to only essential functions
 * - Piped input handling for tsx/nodemon environments
 * - Basic cleanup on shutdown
 */

import { resetStreamingState } from './display';

/**
 * Detect if input is potentially piped
 * Simple and reliable approach for tsx/nodemon compatibility
 */
export async function detectPipedInput(): Promise<boolean> {
  // Primary check - if isTTY is false, it's definitely piped
  if (process.stdin.isTTY === false) {
    return true;
  }

  // For tsx and environments where isTTY might be undefined,
  // treat it as potentially piped and let readPipedInput handle it
  if (process.stdin.isTTY === undefined) {
    return true;
  }

  return false;
}

/**
 * Read piped input content
 * Returns the complete piped input as a string, or empty if no input
 */
export async function readPipedInput(): Promise<string> {
  return new Promise((resolve) => {
    let pipedContent = '';

    // Set a timeout to handle cases where no data is piped
    const timeout = setTimeout(() => {
      resolve('');
    }, 100);

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk) => {
      pipedContent += chunk;
    });

    process.stdin.on('end', () => {
      clearTimeout(timeout);
      resolve(pipedContent.trim());
    });
  });
}

/**
 * Perform graceful shutdown sequence
 * Cleans up state and exits
 */
export async function performShutdown(): Promise<void> {
  // Reset streaming state
  resetStreamingState();

  // Cleanup terminal (show cursor if hidden)
  process.stdout.write('\x1b[?25h'); // Show cursor

  // Display goodbye message
  console.log('\nGoodbye! 👋');

  process.exit(0);
}
