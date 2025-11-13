/**
 * SSE Helpers Domain Module - SSE state helpers
 * 
 * Source: Extracted from web/src/domain/sse-streaming.ts (AppRun frontend)
 * Adapted for: React 19.2.0 - Framework-agnostic pure functions
 * 
 * Features:
 * - Streaming state checks
 * - Active agent helpers
 * 
 * All functions are pure with no side effects.
 * 
 * Changes from source:
 * - Removed AppRun WorldComponentState dependencies
 * - Removed state creation functions (will be handled in React hooks)
 * - Kept only pure helper functions
 */

import type { Agent } from '../../types';

/**
 * Streaming State Interface
 */
export interface StreamingState {
  activeAgent: Agent | null;
  isWaiting: boolean;
}

/**
 * Check if currently streaming
 * 
 * @param state - Streaming state
 * @returns True if streaming
 */
export function isStreaming(state: StreamingState): boolean {
  return state.isWaiting && state.activeAgent !== null;
}

/**
 * Get active agent name if streaming
 * 
 * @param state - Streaming state
 * @returns Agent name or null
 */
export function getActiveAgentName(state: StreamingState): string | null {
  return state.activeAgent?.name || null;
}
