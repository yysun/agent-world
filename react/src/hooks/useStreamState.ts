/**
 * Stream State Hook - SSE streaming state management
 * 
 * Source: Replaces web/src/domain/sse-streaming.ts state management
 * Created for: React 19.2.0
 * 
 * Features:
 * - Active agent tracking during streaming
 * - Waiting/spinner state
 * - Stream lifecycle handlers
 * 
 * Changes from source:
 * - Converted state creation functions to React hook
 * - Manages state with useState
 * - Provides handler functions for SSE events
 */

import { useState, useCallback } from 'react';
import type { Agent } from '../types';
import { isStreaming as checkIsStreaming, getActiveAgentName as getAgentName } from '../lib/domain/sse-helpers';

/**
 * Hook for managing SSE streaming state
 * 
 * @returns Streaming state and handlers
 */
export function useStreamState() {
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);

  const handleStreamStart = useCallback((agentName: string, agents: Agent[]) => {
    const agent = agents.find(a => a.name === agentName);
    setActiveAgent(agent || null);
  }, []);

  const handleStreamEnd = useCallback(() => {
    setActiveAgent(null);
  }, []);

  const handleStreamError = useCallback(() => {
    setActiveAgent(null);
    setIsWaiting(false);
  }, []);

  const isCurrentlyStreaming = checkIsStreaming({ activeAgent, isWaiting });
  const activeAgentName = getAgentName({ activeAgent, isWaiting });

  return {
    // State
    activeAgent,
    isWaiting,
    isCurrentlyStreaming,
    activeAgentName,

    // Setters
    setActiveAgent,
    setIsWaiting,

    // Handlers
    handleStreamStart,
    handleStreamEnd,
    handleStreamError,
  };
}
