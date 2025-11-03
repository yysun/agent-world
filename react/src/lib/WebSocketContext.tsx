/**
 * WebSocket Context - Global WebSocket client management
 * 
 * Purpose: Provides WebSocket client instance and connection state across app
 * 
 * Features:
 * - Browser WebSocket compatibility check
 * - Auto-connect on mount
 * - Connection state tracking
 * - Error handling
 * - Cleanup on unmount
 * 
 * Usage:
 * ```tsx
 * function App() {
 *   return (
 *     <WebSocketProvider>
 *       <YourComponents />
 *     </WebSocketProvider>
 *   );
 * }
 * 
 * function Component() {
 *   const { client, state } = useWebSocketContext();
 *   // ...
 * }
 * ```
 * 
 * Changes:
 * - 2025-11-03: Initial WebSocket context implementation
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { WebSocketClient, ConnectionState } from '@/lib/ws-client';
import { WS_URL } from '@/lib/config';

interface WebSocketContextValue {
  client: WebSocketClient | null;
  state: ConnectionState;
  error: Error | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<WebSocketClient | null>(null);
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<Error | null>(null);

  // Initialize client
  useEffect(() => {
    // Check WebSocket support
    if (!('WebSocket' in window)) {
      setError(new Error('WebSocket not supported in this browser'));
      return;
    }

    const wsClient = new WebSocketClient(WS_URL);
    setClient(wsClient);

    // Listen to connection state changes
    wsClient.on('connecting', () => setState('connecting'));
    wsClient.on('connected', () => {
      setState('connected');
      setError(null);
    });
    wsClient.on('disconnected', () => setState('disconnected'));
    wsClient.on('reconnecting', () => setState('reconnecting'));
    wsClient.on('error', (err: Error) => setError(err));

    // Auto-connect
    wsClient.connect().catch((err) => {
      console.error('Failed to connect:', err);
      setError(err);
    });

    // Cleanup on unmount
    return () => {
      wsClient.disconnect();
    };
  }, []);

  const connect = useCallback(async () => {
    if (!client) return;
    try {
      await client.connect();
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  }, [client]);

  const disconnect = useCallback(async () => {
    if (!client) return;
    await client.disconnect();
  }, [client]);

  return (
    <WebSocketContext.Provider value={{ client, state, error, connect, disconnect }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within WebSocketProvider');
  }
  return context;
}
