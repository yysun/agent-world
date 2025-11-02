/**
 * useAgentWorldClient Hook
 * 
 * Purpose: High-level WebSocket protocol operations
 * 
 * Features:
 * - Subscribe to world events
 * - Enqueue messages for processing
 * - Execute CLI commands
 * - Unsubscribe from world
 * - Ping/heartbeat
 * 
 * Responsibilities:
 * - Protocol operations only
 * - Depends on WebSocketClient instance
 * - No state management
 * - No event processing
 * 
 * Created: 2025-11-02 - Phase 1: Implement focused hooks
 */

import { useCallback } from 'react';
import type { WebSocketClient } from '../../ws/ws-client.js';
import type { WSMessage, WSEvent } from '../../ws/types.js';

export interface UseAgentWorldClientOptions {
  onEvent?: (event: WSEvent) => void;
  onMessage?: (message: WSMessage) => void;
}

export interface UseAgentWorldClientReturn {
  subscribe: (worldId: string, chatId: string | null, replayFrom: 'beginning' | number) => void;
  enqueue: (worldId: string, chatId: string | null, content: string, sender?: string) => void;
  executeCommand: (worldId: string, command: string) => void;
  unsubscribe: (worldId: string, chatId?: string | null) => void;
  ping: () => void;
}

/**
 * Hook for high-level WebSocket protocol operations
 */
export function useAgentWorldClient(
  ws: WebSocketClient | null,
  connected: boolean,
  options: UseAgentWorldClientOptions = {}
): UseAgentWorldClientReturn {
  const { onEvent, onMessage } = options;

  // Setup event listeners if provided
  if (ws && onEvent) {
    ws.on('event', onEvent);
  }

  if (ws && onMessage) {
    ws.on('message', onMessage);
  }

  const subscribe = useCallback((
    worldId: string,
    chatId: string | null,
    replayFrom: 'beginning' | number = 'beginning'
  ) => {
    if (!ws || !connected) {
      console.warn('Cannot subscribe: not connected');
      return;
    }
    ws.subscribe(worldId, chatId, replayFrom);
  }, [ws, connected]);

  const enqueue = useCallback((
    worldId: string,
    chatId: string | null,
    content: string,
    sender: string = 'user'
  ) => {
    if (!ws || !connected) {
      console.warn('Cannot enqueue: not connected');
      return;
    }
    ws.enqueue(worldId, chatId, content, sender);
  }, [ws, connected]);

  const executeCommand = useCallback((worldId: string, command: string) => {
    if (!ws || !connected) {
      console.warn('Cannot execute command: not connected');
      return;
    }
    ws.executeCommand(worldId, command);
  }, [ws, connected]);

  const unsubscribe = useCallback((worldId: string, chatId?: string | null) => {
    if (!ws || !connected) {
      console.warn('Cannot unsubscribe: not connected');
      return;
    }
    ws.unsubscribe(worldId, chatId);
  }, [ws, connected]);

  const ping = useCallback(() => {
    if (!ws || !connected) {
      return;
    }
    ws.ping();
  }, [ws, connected]);

  return {
    subscribe,
    enqueue,
    executeCommand,
    unsubscribe,
    ping
  };
}
