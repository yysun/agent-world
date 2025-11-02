/**
 * useWorldState Hook - Application State Management
 * 
 * Purpose: Manages application state derived from WebSocket events
 * 
 * Features:
 * - Message history (addMessage, clearMessages)
 * - Agent status tracking (updateAgentStatus)
 * - Replay progress (isReplaying, replayProgress)
 * - Command results (lastCommandResult)
 * - Error state
 * 
 * Responsibilities:
 * - Pure React state management (useState, useCallback, useMemo)
 * - No WebSocket logic
 * - Uses types from ws/types.ts
 * - Memory limit (keep last 1000 messages)
 * 
 * Created: 2025-11-01 - Phase 1: Core Infrastructure
 * Updated: 2025-11-02 - Phase 1: Refactor to use shared types
 */

import { useState, useCallback } from 'react';
import type { Message, AgentActivityStatus } from '../../../ws/types.js';

export interface CommandResult {
  timestamp: Date;
  success: boolean;
  result: any;
}

export interface UseWorldStateReturn {
  messages: Message[];
  agents: Map<string, AgentActivityStatus>;
  isReplaying: boolean;
  replayProgress: { current: number; total: number; percentage: number } | null;
  error: string | null;
  lastCommandResult: CommandResult | null;
  addMessage: (message: Message) => void;
  updateMessage: (messageId: string, updates: Partial<Message>) => void;
  updateAgentStatus: (agentName: string, status: Partial<AgentActivityStatus>) => void;
  setReplayProgress: (current: number, total: number) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  reset: () => void;
}

const MAX_MESSAGES = 1000;

/**
 * Hook for managing world state
 */
export function useWorldState(): UseWorldStateReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Map<string, AgentActivityStatus>>(new Map());
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayProgress, setReplayProgressState] = useState<{ current: number; total: number; percentage: number } | null>(null);
  const [error, setErrorState] = useState<string | null>(null);
  const [lastCommandResult, setLastCommandResult] = useState<CommandResult | null>(null);

  const addMessage = useCallback((message: Message) => {
    setMessages(prev => {
      const updated = [...prev, message];
      // Keep only last MAX_MESSAGES
      if (updated.length > MAX_MESSAGES) {
        return updated.slice(updated.length - MAX_MESSAGES);
      }
      return updated;
    });
  }, []);

  const updateMessage = useCallback((messageId: string, updates: Partial<Message>) => {
    setMessages(prev => prev.map(msg =>
      msg.id === messageId ? { ...msg, ...updates } : msg
    ));
  }, []);

  const updateAgentStatus = useCallback((agentName: string, status: Partial<AgentActivityStatus>) => {
    setAgents(prev => {
      const newAgents = new Map(prev);
      const existing = newAgents.get(agentName);

      if (existing) {
        newAgents.set(agentName, { ...existing, ...status });
      } else {
        newAgents.set(agentName, {
          agentId: agentName,
          message: status.message || '',
          phase: status.phase || 'thinking',
          activityId: status.activityId || null,
          toolName: status.toolName,
          updatedAt: Date.now()
        });
      }

      return newAgents;
    });
  }, []);

  const setReplayProgress = useCallback((current: number, total: number) => {
    const percentage = total > 0 ? Math.floor((current / total) * 100) : 0;
    setReplayProgressState({ current, total, percentage });
    setIsReplaying(current < total);
  }, []);

  const setError = useCallback((error: string | null) => {
    setErrorState(error);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setAgents(new Map());
    setIsReplaying(false);
    setReplayProgressState(null);
    setErrorState(null);
    setLastCommandResult(null);
  }, []);

  return {
    messages,
    agents,
    isReplaying,
    replayProgress,
    error,
    lastCommandResult,
    addMessage,
    updateMessage,
    updateAgentStatus,
    setReplayProgress,
    setError,
    clearMessages,
    reset
  };
}
