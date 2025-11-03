/**
 * useWebSocket Hook - Access WebSocket client and state
 * 
 * Purpose: Convenience hook for accessing WebSocket functionality
 * 
 * Features:
 * - Client instance access
 * - Connection state
 * - Error state
 * - Connect/disconnect methods
 * 
 * Usage:
 * ```tsx
 * function Component() {
 *   const { client, state, error } = useWebSocket();
 *   
 *   if (state !== 'connected') return <div>Connecting...</div>;
 *   // Use client...
 * }
 * ```
 * 
 * Changes:
 * - 2025-11-03: Initial hook implementation
 */

import { useWebSocketContext } from '@/lib/WebSocketContext';

export function useWebSocket() {
  return useWebSocketContext();
}
