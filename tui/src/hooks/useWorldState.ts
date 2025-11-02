/**
 * World State Management Hook
 * 
 * Manages world state derived from WebSocket events:
 * - Message history
 * - Agent activity status
 * - Streaming state
 * - Event replay progress
 * 
 * Provides filtered and formatted data for UI components.
 * 
 * Created: 2025-11-01 - Phase 1: Core Infrastructure
 */

import { useState, useCallback } from 'react';
import type { WebSocketEvent } from './useWebSocket.js';
import type { Message } from '../types/index.ts';

export interface AgentStatus {
  name: string;
  isActive: boolean;
  isStreaming: boolean;
  currentMessage?: string;
  lastActivity?: Date;
}

export interface WorldState {
  messages: Message[];
  agents: Map<string, AgentStatus>;
  isReplaying: boolean;
  replayProgress?: {
    current: number;
    total: number;
    percentage: number;
  };
  error: string | null;
}

export interface UseWorldStateReturn extends WorldState {
  addMessage: (message: Message) => void;
  updateAgentStatus: (agentName: string, status: Partial<AgentStatus>) => void;
  setReplayProgress: (current: number, total: number) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  reset: () => void;
}

const MAX_MESSAGES = 1000; // Keep last 1000 messages in memory

export function useWorldState(): UseWorldStateReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Map<string, AgentStatus>>(new Map());
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayProgress, setReplayProgressState] = useState<{ current: number; total: number; percentage: number } | undefined>();
  const [error, setError] = useState<string | null>(null);

  const addMessage = useCallback((message: Message) => {
    setMessages(prev => {
      const newMessages = [...prev, message];
      // Keep only last MAX_MESSAGES
      if (newMessages.length > MAX_MESSAGES) {
        return newMessages.slice(newMessages.length - MAX_MESSAGES);
      }
      return newMessages;
    });
  }, []);

  const updateAgentStatus = useCallback((agentName: string, status: Partial<AgentStatus>) => {
    setAgents(prev => {
      const newAgents = new Map(prev);
      const current = newAgents.get(agentName) || {
        name: agentName,
        isActive: false,
        isStreaming: false
      };
      newAgents.set(agentName, { ...current, ...status });
      return newAgents;
    });
  }, []);

  const setReplayProgress = useCallback((current: number, total: number) => {
    if (total > 0) {
      setIsReplaying(true);
      setReplayProgressState({
        current,
        total,
        percentage: Math.round((current / total) * 100)
      });
    } else {
      setIsReplaying(false);
      setReplayProgressState(undefined);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setAgents(new Map());
    setIsReplaying(false);
    setReplayProgressState(undefined);
    setError(null);
  }, []);

  return {
    messages,
    agents,
    isReplaying,
    replayProgress,
    error,
    addMessage,
    updateAgentStatus,
    setReplayProgress,
    setError,
    clearMessages,
    reset
  };
}

/**
 * Hook to process WebSocket events and update world state
 */
export function useEventProcessor(worldState: UseWorldStateReturn) {
  return useCallback((event: WebSocketEvent) => {
    switch (event.type) {
      case 'subscribed':
        if (event.historicalEventCount && event.historicalEventCount > 0) {
          worldState.setReplayProgress(0, event.historicalEventCount);
        }
        break;

      case 'event':
        // Update replay progress for historical events
        if (event.isHistorical && worldState.replayProgress) {
          worldState.setReplayProgress(
            worldState.replayProgress.current + 1,
            worldState.replayProgress.total
          );
        }

        // Process event by type
        if (event.eventType === 'message' && event.event) {
          const msg = event.event;
          worldState.addMessage({
            messageId: msg.messageId || `${Date.now()}-${Math.random()}`,
            sender: msg.sender || 'unknown',
            content: msg.content || '',
            timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
            isHistorical: event.isHistorical
          });
        } else if (event.eventType === 'sse' && event.event) {
          const sseEvent = event.event;
          const agentName = sseEvent.agentName;

          if (sseEvent.type === 'start') {
            worldState.updateAgentStatus(agentName, {
              isStreaming: true,
              isActive: true,
              currentMessage: ''
            });
          } else if (sseEvent.type === 'chunk') {
            worldState.updateAgentStatus(agentName, {
              currentMessage: (worldState.agents.get(agentName)?.currentMessage || '') + (sseEvent.content || '')
            });
          } else if (sseEvent.type === 'end') {
            const finalMessage = worldState.agents.get(agentName)?.currentMessage;
            if (finalMessage) {
              worldState.addMessage({
                messageId: sseEvent.messageId || `${Date.now()}-${Math.random()}`,
                sender: agentName,
                content: finalMessage,
                timestamp: new Date(),
                isHistorical: event.isHistorical
              });
            }
            worldState.updateAgentStatus(agentName, {
              isStreaming: false,
              isActive: false,
              currentMessage: undefined,
              lastActivity: new Date()
            });
          }
        } else if (event.eventType === 'world' && event.event) {
          const worldEvent = event.event;

          // Track agent activity
          if (worldEvent.type === 'response-start' && worldEvent.source?.startsWith('agent:')) {
            const agentName = worldEvent.source.replace('agent:', '');
            worldState.updateAgentStatus(agentName, {
              isActive: true,
              lastActivity: new Date()
            });
          } else if (worldEvent.type === 'response-end' && worldEvent.source?.startsWith('agent:')) {
            const agentName = worldEvent.source.replace('agent:', '');
            worldState.updateAgentStatus(agentName, {
              isActive: false,
              lastActivity: new Date()
            });
          }
        }
        break;

      case 'replay-complete':
        worldState.setReplayProgress(0, 0);
        break;

      case 'error':
        worldState.setError(event.message || 'Unknown error');
        break;

      default:
        // Ignore other message types
        break;
    }
  }, [worldState]);
}
