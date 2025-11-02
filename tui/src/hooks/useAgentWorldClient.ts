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

import { useCallback, useEffect } from 'react';
import type { WebSocketClient } from '../../../ws/ws-client.js';
import type { WSMessage } from '../../../ws/types.js';

export interface UseAgentWorldClientOptions {
  onEvent?: (event: any) => void;
  onStatus?: (status: any) => void;
}

export interface UseAgentWorldClientReturn {
  subscribe: (worldId: string, chatId: string | null, replayFrom: 'beginning' | number) => void;
  enqueue: (worldId: string, chatId: string | null, content: string, sender?: string) => void;
  executeCommand: (worldId: string, command: string) => void;
  unsubscribe: (worldId: string, chatId?: string | null) => void;
}

/**
 * Hook for high-level WebSocket protocol operations
 */
export function useAgentWorldClient(
  ws: WebSocketClient | null,
  connected: boolean,
  options: UseAgentWorldClientOptions = {}
): UseAgentWorldClientReturn {
  const { onEvent, onStatus } = options;

  // Setup event listeners with useEffect for proper cleanup
  useEffect(() => {
    if (!ws) return;

    if (onEvent) {
      ws.on('event', onEvent);
    }
    if (onStatus) {
      ws.on('status', onStatus);
    }

    // Cleanup listeners on unmount or when dependencies change
    return () => {
      if (onEvent) {
        ws.off('event', onEvent);
      }
      if (onStatus) {
        ws.off('status', onStatus);
      }
    };
  }, [ws, onEvent, onStatus]);

  const subscribe = useCallback((
    worldId: string,
    chatId: string | null,
    replayFrom: 'beginning' | number = 'beginning'
  ) => {
    if (!ws || !connected) {
      console.warn('Cannot subscribe: not connected');
      return;
    }
    const fromSeq = replayFrom === 'beginning' ? 0 : replayFrom;
    ws.subscribe(worldId, chatId, fromSeq);
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
    ws.sendMessage(worldId, content, chatId ?? undefined, sender);
  }, [ws, connected]);

  const executeCommand = useCallback((worldId: string, command: string) => {
    if (!ws || !connected) {
      console.warn('Cannot execute command: not connected');
      return;
    }
    ws.sendCommand(worldId, command);
  }, [ws, connected]);

  const unsubscribe = useCallback((worldId: string, chatId?: string | null) => {
    if (!ws || !connected) {
      console.warn('Cannot unsubscribe: not connected');
      return;
    }
    ws.unsubscribe(worldId, chatId);
  }, [ws, connected]);

  return {
    subscribe,
    enqueue,
    executeCommand,
    unsubscribe
  };
}
