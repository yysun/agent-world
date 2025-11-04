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
 * - Tool approval management (showApprovalRequest, sendApprovalResponse)
 * 
 * Responsibilities:
 * - Pure React state management (useState, useCallback, useMemo)
 * - No WebSocket logic
 * - Uses types from ws/types.ts and local types
 * - Memory limit (keep last 1000 messages)
 * 
 * Created: 2025-11-01 - Phase 1: Core Infrastructure
 * Updated: 2025-11-02 - Phase 1: Refactor to use shared types
 * Updated: Phase 7 - Add tool approval system integration
 */

import { useState, useCallback } from 'react';
import type { Message, AgentActivityStatus } from '../../../ws/types.js';
import type { Agent, World, Chat, ApprovalRequest, ApprovalResponse, ApprovalState } from '../types/index.js';

export interface CommandResult {
  timestamp: Date;
  success: boolean;
  result: any;
}

export interface AgentStatus {
  agentId: string;
  message: string;
  phase: string;
  activityId: number | null;
  updatedAt: number;
}

export interface UseWorldStateReturn {
  // State
  messages: Message[];
  agents: Map<string, Agent>;
  world: World | null;
  error: string | null;
  isReplaying: boolean;
  replayProgress: { current: number; total: number; percentage: string } | null;
  lastCommandResult: CommandResult | null;
  agentStatuses: Map<string, AgentStatus>;
  approvalState: ApprovalState;

  // Actions
  addMessage: (message: Message) => void;
  updateMessage: (messageId: string, updates: Partial<Message>) => void;
  addAgent: (agent: Agent) => void;
  updateAgent: (agentId: string, updates: Partial<Agent>) => void;
  removeAgent: (agentId: string) => void;
  setWorld: (world: World | null) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  setReplayProgress: (current: number, total: number) => void;
  setCommandResult: (result: CommandResult | null) => void;
  updateAgentStatus: (agentId: string, status: AgentStatus) => void;
  showApprovalRequest: (request: ApprovalRequest) => void;
  hideApprovalRequest: () => void;
  sendApprovalResponse: (response: ApprovalResponse) => void;
  setApprovalCallback: (callback: (response: ApprovalResponse) => void) => void;
  reset: () => void;
}

const MAX_MESSAGES = 1000;

/**
 * Hook for managing world state including tool approval
 */
export function useWorldState(): UseWorldStateReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Map<string, Agent>>(new Map());
  const [world, setWorldState] = useState<World | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayProgress, setReplayProgressState] = useState<{ current: number; total: number; percentage: string } | null>(null);
  const [error, setErrorState] = useState<string | null>(null);
  const [lastCommandResult, setLastCommandResult] = useState<CommandResult | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<Map<string, AgentStatus>>(new Map());

  // Approval state
  const [approvalState, setApprovalState] = useState<ApprovalState>({
    isShowingApproval: false,
    currentRequest: null
  });

  // Approval response callback (to be set by parent)
  const [approvalResponseCallback, setApprovalResponseCallback] = useState<((response: ApprovalResponse) => void) | null>(null);

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

  const addAgent = useCallback((agent: Agent) => {
    setAgents(prev => {
      const newMap = new Map(prev);
      newMap.set(agent.id, agent);
      return newMap;
    });
  }, []);

  const updateAgent = useCallback((agentId: string, updates: Partial<Agent>) => {
    setAgents(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(agentId);
      if (existing) {
        newMap.set(agentId, { ...existing, ...updates });
      }
      return newMap;
    });
  }, []);

  const removeAgent = useCallback((agentId: string) => {
    setAgents(prev => {
      const newMap = new Map(prev);
      newMap.delete(agentId);
      return newMap;
    });
  }, []);

  const setWorld = useCallback((world: World | null) => {
    setWorldState(world);
  }, []);

  const setReplayProgress = useCallback((current: number, total: number) => {
    const percentage = total > 0 ? `${Math.floor((current / total) * 100)}%` : '0%';
    setReplayProgressState({ current, total, percentage });
    setIsReplaying(current < total);
  }, []);

  const setError = useCallback((error: string | null) => {
    setErrorState(error);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const setCommandResult = useCallback((result: CommandResult | null) => {
    setLastCommandResult(result);
  }, []);

  const updateAgentStatus = useCallback((agentId: string, status: AgentStatus) => {
    setAgentStatuses(prev => {
      const newMap = new Map(prev);
      newMap.set(agentId, status);
      return newMap;
    });
  }, []);

  const showApprovalRequest = useCallback((request: ApprovalRequest) => {
    setApprovalState({
      isShowingApproval: true,
      currentRequest: request
    });
  }, []);

  const hideApprovalRequest = useCallback(() => {
    setApprovalState({
      isShowingApproval: false,
      currentRequest: null
    });
  }, []);

  const sendApprovalResponse = useCallback((response: ApprovalResponse) => {
    // Send response via callback if available
    if (approvalResponseCallback) {
      approvalResponseCallback(response);
    }

    // Hide approval dialog
    hideApprovalRequest();
  }, [approvalResponseCallback, hideApprovalRequest]);

  // Method to set approval response callback (called by parent)
  const setApprovalCallback = useCallback((callback: (response: ApprovalResponse) => void) => {
    setApprovalResponseCallback(() => callback);
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setAgents(new Map());
    setIsReplaying(false);
    setReplayProgressState(null);
    setErrorState(null);
    setLastCommandResult(null);
    setAgentStatuses(new Map());
    setApprovalState({
      isShowingApproval: false,
      currentRequest: null
    });
  }, []);

  return {
    // State
    messages,
    agents,
    world,
    error,
    isReplaying,
    replayProgress,
    lastCommandResult,
    agentStatuses,
    approvalState,

    // Actions
    addMessage,
    updateMessage,
    addAgent,
    updateAgent,
    removeAgent,
    setWorld,
    setError,
    clearMessages,
    setReplayProgress,
    setCommandResult,
    updateAgentStatus,
    showApprovalRequest,
    hideApprovalRequest,
    sendApprovalResponse,
    setApprovalCallback,
    reset
  };
}
