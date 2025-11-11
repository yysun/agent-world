/**
 * SSE Streaming Domain Module - Server-Sent Events Logic
 * 
 * Features:
 * - Stream lifecycle state management (start, chunk, end, error)
 * - Active agent tracking during streaming
 * - Error handling
 * 
 * Note: isWaiting (spinner) is controlled by world events (pending count),
 * not by stream events, to avoid race conditions.
 * 
 * Pure functions for state transitions.
 * 
 * Created: 2025-10-26 - Phase 2: Domain Module Extraction
 * Updated: 2025-11-11 - Removed isWaiting control from stream events
 */

import type { WorldComponentState } from '../types';

/**
 * Streaming State Interface
 * Encapsulates SSE streaming state
 */
export interface StreamingState {
  activeAgent: any | null;
  isWaiting: boolean;
  needScroll: boolean;
  error: string | null;
}

/**
 * Create state for stream start
 * Sets active agent (isWaiting controlled by world events)
 */
export function createStreamStartState(
  state: WorldComponentState,
  agentName: string
): WorldComponentState {
  const activeAgent = state.world?.agents.find(a => a.name === agentName);

  return {
    ...state,
    activeAgent: activeAgent || null,
    needScroll: true
  };
}

/**
 * Create state for stream chunk received
 * Maintains scroll flag
 */
export function createStreamChunkState(
  state: WorldComponentState
): WorldComponentState {
  return {
    ...state,
    needScroll: true
  };
}

/**
 * Create state for stream end
 * Clears active agent (isWaiting controlled by world events)
 */
export function createStreamEndState(
  state: WorldComponentState
): WorldComponentState {
  return {
    ...state,
    activeAgent: null,
    needScroll: true
  };
}

/**
 * Create state for stream error
 * Clears streaming state and sets error message
 */
export function createStreamErrorState(
  state: WorldComponentState,
  errorMessage: string
): WorldComponentState {
  return {
    ...state,
    activeAgent: null,
    isWaiting: false,
    isSending: false,
    error: errorMessage
  };
}

/**
 * Check if currently streaming
 */
export function isStreaming(state: StreamingState): boolean {
  return state.isWaiting && state.activeAgent !== null;
}

/**
 * Get active agent name if streaming
 */
export function getActiveAgentName(state: StreamingState): string | null {
  return state.activeAgent?.name || null;
}
