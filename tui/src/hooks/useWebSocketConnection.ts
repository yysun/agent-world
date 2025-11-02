/**
 * useWebSocketConnection Hook
 * 
 * Purpose: Manages WebSocket connection lifecycle
 * 
 * Features:
 * - Connection state management (connected, connecting, error)
 * - Automatic reconnection with exponential backoff
 * - Connection event callbacks
 * - Uses WebSocketClient from ws/ws-client.ts
 * 
 * Responsibilities:
 * - Connection lifecycle only (connect, disconnect, reconnect)
 * - No protocol operations (subscribe, enqueue, etc.)
 * - No state management (messages, agents, etc.)
 * 
 * Created: 2025-11-02 - Phase 1: Refactor to use shared ws/ws-client.ts
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { WebSocketClient } from '../../ws/ws-client.js';
import type { ConnectionState } from '../../ws/ws-client.js';

export interface UseWebSocketConnectionOptions {
  onConnected?: () => void;
  onDisconnected?: (code: number, reason: string) => void;
  onError?: (error: any) => void;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  reconnectBackoff?: number;
  autoReconnect?: boolean;
}

export interface UseWebSocketConnectionReturn {
  ws: WebSocketClient | null;
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  state: ConnectionState;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * Hook for managing WebSocket connection lifecycle
 */
export function useWebSocketConnection(
  serverUrl: string,
  options: UseWebSocketConnectionOptions = {}
): UseWebSocketConnectionReturn {
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<WebSocketClient | null>(null);

  const {
    onConnected,
    onDisconnected,
    onError,
    reconnectDelay = 1000,
    maxReconnectDelay = 30000,
    reconnectBackoff = 1.5,
    autoReconnect = true
  } = options;

  // Initialize WebSocket client
  useEffect(() => {
    const client = new WebSocketClient({
      url: serverUrl,
      reconnectDelay,
      maxReconnectDelay,
      reconnectBackoff,
      autoReconnect
    });

    // Setup event listeners
    client.on('stateChange', (newState: ConnectionState) => {
      setState(newState);
    });

    client.on('connected', () => {
      setError(null);
      onConnected?.();
    });

    client.on('disconnected', (code: number, reason: string) => {
      onDisconnected?.(code, reason);
    });

    client.on('error', (err: any) => {
      const errorMessage = err?.message || String(err);
      setError(errorMessage);
      onError?.(err);
    });

    clientRef.current = client;

    // Auto-connect
    client.connect().catch((err: any) => {
      setError(err?.message || 'Failed to connect');
      onError?.(err);
    });

    // Cleanup on unmount
    return () => {
      client.disconnect();
    };
  }, [serverUrl, reconnectDelay, maxReconnectDelay, reconnectBackoff, autoReconnect]);

  const connect = useCallback(async () => {
    if (clientRef.current) {
      try {
        await clientRef.current.connect();
      } catch (err: any) {
        setError(err?.message || 'Failed to connect');
        throw err;
      }
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (clientRef.current) {
      await clientRef.current.disconnect();
    }
  }, []);

  return {
    ws: clientRef.current,
    connected: state === 'connected',
    connecting: state === 'connecting',
    reconnecting: state === 'reconnecting',
    state,
    error,
    connect,
    disconnect
  };
}
