/**
 * useWorldState - World state management from WebSocket events
 * 
 * Features:
 * - Message state (messages, addMessage)
 * - Agent state (agents, updateAgentStatus)
 * - Replay state (isReplayComplete, replayProgress)
 * - Command results (lastCommandResult)
 * - Event processor
 * 
 * Implementation:
 * - Returns state and processor function
 * - Processor handles WebSocketEvent and updates state
 * - Tracks agent streaming status
 * - Manages replay progress
 * 
 * Changes:
 * - Changed from subscription model to processor model
 * - Added lastCommandResult state for command execution feedback
 * - Added result event handling in processor
 */

import { useState, useCallback } from 'react';

// Simplified types for TUI (no dependency on core/)
export interface Message {
  messageId: string;
  sender: string;
  content: string;
  timestamp: Date;
  isHistorical?: boolean;
}

export interface Agent {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  streaming: boolean;
}

export interface CommandResult {
  timestamp: Date;
  success: boolean;
  result: any;
}

export interface WebSocketEvent {
  type: string;
  event?: any;
  eventType?: string;
  isHistorical?: boolean;
  data?: any;
  success?: boolean;
  message?: string;
}

export interface UseWorldStateReturn {
  messages: Message[];
  agents: Agent[];
  isReplayComplete: boolean;
  replayProgress: { current: number; total: number } | null;
  lastCommandResult: CommandResult | null;
  processEvent: (event: WebSocketEvent) => void;
}

export function useWorldState(): UseWorldStateReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isReplayComplete, setIsReplayComplete] = useState(false);
  const [replayProgress, setReplayProgress] = useState<{ current: number; total: number } | null>(null);
  const [lastCommandResult, setLastCommandResult] = useState<CommandResult | null>(null);

  const addMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const updateAgentStatus = useCallback((agentId: string, status: 'active' | 'inactive', streaming: boolean = false) => {
    setAgents(prev => {
      const existing = prev.find(a => a.id === agentId);
      if (existing) {
        return prev.map(a =>
          a.id === agentId
            ? { ...a, status, streaming }
            : a
        );
      } else {
        return [...prev, { id: agentId, name: agentId, status, streaming }];
      }
    });
  }, []);

  const processEvent = useCallback((event: WebSocketEvent) => {
    switch (event.type) {
      case 'event':
        // Handle different event types
        if (event.eventType === 'message' && event.event) {
          const msg = event.event;
          addMessage({
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
            updateAgentStatus(agentName, 'active', true);
          } else if (sseEvent.type === 'end') {
            updateAgentStatus(agentName, 'inactive', false);
          }
        } else if (event.eventType === 'world' && event.event) {
          const worldEvent = event.event;

          if (worldEvent.type === 'response-start' && worldEvent.source?.startsWith('agent:')) {
            const agentName = worldEvent.source.replace('agent:', '');
            updateAgentStatus(agentName, 'active');
          } else if (worldEvent.type === 'response-end' && worldEvent.source?.startsWith('agent:')) {
            const agentName = worldEvent.source.replace('agent:', '');
            updateAgentStatus(agentName, 'inactive');
          }
        }
        break;

      case 'subscribed':
        // Could track agents from world data here if provided
        break;

      case 'replay-complete':
        setIsReplayComplete(true);
        setReplayProgress(null);
        break;

      case 'result':
        setLastCommandResult({
          timestamp: new Date(),
          success: event.success ?? true,
          result: event.data
        });
        break;

      case 'error':
        // Could track errors here
        break;

      default:
        // Ignore other event types
        break;
    }
  }, [addMessage, updateAgentStatus]);

  return {
    messages,
    agents,
    isReplayComplete,
    replayProgress,
    lastCommandResult,
    processEvent
  };
}
