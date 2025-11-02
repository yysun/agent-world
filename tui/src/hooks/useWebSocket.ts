/**
 * WebSocket Connection Hook
 * 
 * Manages WebSocket connection lifecycle and provides methods
 * for subscribing, sending messages, and executing commands.
 * 
 * Features:
 * - Automatic reconnection
 * - Event callback handling
 * - Connection state tracking
 * - Message queue for offline messages
 * 
 * Created: 2025-11-01 - Phase 1: Core Infrastructure
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import WebSocket from 'ws';

export interface WebSocketMessage {
  type: 'subscribe' | 'enqueue' | 'command' | 'unsubscribe' | 'ping';
  worldId?: string;
  chatId?: string | null;
  replayFrom?: 'beginning' | number;
  content?: string;
  sender?: string;
  command?: string;
}

export interface WebSocketEvent {
  type: 'event' | 'subscribed' | 'enqueued' | 'result' | 'replay-complete' | 'error' | 'pong';
  seq?: number;
  isHistorical?: boolean;
  eventType?: string;
  event?: any;
  currentSeq?: number;
  replayingFrom?: number;
  historicalEventCount?: number;
  messageId?: string;
  queuePosition?: number;
  estimatedWaitSeconds?: number;
  success?: boolean;
  message?: string;
  data?: any;
  refreshWorld?: boolean;
  lastSeq?: number;
  code?: string;
  details?: string;
}

export interface UseWebSocketOptions {
  onEvent?: (event: WebSocketEvent) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface UseWebSocketReturn {
  connected: boolean;
  connecting: boolean;
  lastError: string | null;
  subscribe: (worldId: string, chatId: string | null, replayFrom: 'beginning' | number) => void;
  enqueue: (worldId: string, chatId: string | null, content: string, sender?: string) => void;
  executeCommand: (worldId: string, command: string) => void;
  unsubscribe: (worldId: string, chatId?: string | null) => void;
  ping: () => void;
  disconnect: () => void;
}

export function useWebSocket(
  serverUrl: string,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const messageQueueRef = useRef<WebSocketMessage[]>([]);

  const {
    onEvent,
    onConnected,
    onDisconnected,
    onError,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5
  } = options;

  const send = useCallback((message: WebSocketMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      // Queue message for when connection is restored
      messageQueueRef.current.push(message);
    }
  }, []);

  const flushMessageQueue = useCallback(() => {
    if (messageQueueRef.current.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
      messageQueueRef.current.forEach(msg => send(msg));
      messageQueueRef.current = [];
    }
  }, [send]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || connecting) {
      return;
    }

    setConnecting(true);
    setLastError(null);

    try {
      const ws = new WebSocket(serverUrl);

      ws.on('open', () => {
        setConnected(true);
        setConnecting(false);
        reconnectAttemptsRef.current = 0;
        onConnected?.();
        flushMessageQueue();
      });

      ws.on('message', (data: Buffer) => {
        try {
          const msg: WebSocketEvent = JSON.parse(data.toString());
          onEvent?.(msg);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      });

      ws.on('error', (error: Error) => {
        setLastError(error.message);
        onError?.(error);
      });

      ws.on('close', () => {
        setConnected(false);
        setConnecting(false);
        onDisconnected?.();
        wsRef.current = null;

        // Attempt reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else {
          setLastError(`Failed to reconnect after ${maxReconnectAttempts} attempts`);
        }
      });

      wsRef.current = ws;
    } catch (error) {
      setConnecting(false);
      setLastError(error instanceof Error ? error.message : 'Connection failed');
      onError?.(error instanceof Error ? error : new Error('Connection failed'));
    }
  }, [serverUrl, connecting, onConnected, onDisconnected, onError, flushMessageQueue, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnected(false);
    setConnecting(false);
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [serverUrl]); // Reconnect if server URL changes

  const subscribe = useCallback((worldId: string, chatId: string | null, replayFrom: 'beginning' | number) => {
    send({
      type: 'subscribe',
      worldId,
      chatId,
      replayFrom
    });
  }, [send]);

  const enqueue = useCallback((worldId: string, chatId: string | null, content: string, sender: string = 'human') => {
    send({
      type: 'enqueue',
      worldId,
      chatId,
      content,
      sender
    });
  }, [send]);

  const executeCommand = useCallback((worldId: string, command: string) => {
    send({
      type: 'command',
      worldId,
      command
    });
  }, [send]);

  const unsubscribe = useCallback((worldId: string, chatId?: string | null) => {
    send({
      type: 'unsubscribe',
      worldId,
      chatId
    });
  }, [send]);

  const ping = useCallback(() => {
    send({ type: 'ping' });
  }, [send]);

  return {
    connected,
    connecting,
    lastError,
    subscribe,
    enqueue,
    executeCommand,
    unsubscribe,
    ping,
    disconnect
  };
}
