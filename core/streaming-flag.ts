/**
 * Global Streaming Flag Module
 *
 * Provides centralized control over streaming vs non-streaming LLM responses.
 * Default is ON (streaming enabled) to preserve existing behavior.
 * CLI pipeline mode sets this to OFF, interactive mode keeps it ON.
 *
 * Features:
 * - Global streaming state management
 * - Type-safe getter/setter functions
 * - Default ON behavior for backward compatibility
 * - Thread-safe flag operations
 * - Debug logging for flag state changes
 */

import { createCategoryLogger } from './logger.js';

// Create streaming flag logger
const logger = createCategoryLogger('streaming');

/**
 * Global streaming flag state
 * Default is true (ON) to preserve existing streaming behavior
 */
let globalStreamingEnabled = true;

/**
 * Get current streaming flag state
 * @returns true if streaming is enabled, false for non-streaming mode
 */
export function isStreamingEnabled(): boolean {
  return globalStreamingEnabled;
}

/**
 * Set streaming flag state
 * @param enabled - true to enable streaming, false for non-streaming mode
 */
export function setStreamingEnabled(enabled: boolean): void {
  const previousState = globalStreamingEnabled;
  globalStreamingEnabled = enabled;
  
  // Log state changes for debugging
  if (previousState !== enabled) {
    logger.debug(`Streaming flag changed: ${previousState} → ${enabled}`);
  }
}

/**
 * Enable streaming mode (convenience function)
 */
export function enableStreaming(): void {
  setStreamingEnabled(true);
}

/**
 * Disable streaming mode (convenience function)
 */
export function disableStreaming(): void {
  setStreamingEnabled(false);
}

/**
 * Get streaming flag state as string for logging
 * @returns "ON" or "OFF" string representation
 */
export function getStreamingStatus(): string {
  return globalStreamingEnabled ? 'ON' : 'OFF';
}