/**
 * ConnectionStatus Component - Display WebSocket connection status
 * 
 * Purpose: Visual indicator for WebSocket connection state
 * 
 * Features:
 * - Color-coded status indicator (green/yellow/red)
 * - Text label showing current state
 * - Animated pulse for connecting/reconnecting states
 * - Compact design for header placement
 * 
 * Implementation:
 * - Uses Tailwind CSS for styling
 * - Shows all connection states including closing
 * - Can be placed in header or sidebar
 * 
 * Changes:
 * - 2025-11-03: Created for Phase 5 (new component, not in Next.js)
 * - 2025-11-03: Added 'closing' state to match ConnectionState type
 */

import type { ConnectionState } from '@/lib/ws-client';

interface ConnectionStatusProps {
  state: ConnectionState;
  className?: string;
}

export default function ConnectionStatus({ state, className = '' }: ConnectionStatusProps) {
  const getStatusColor = () => {
    switch (state) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
      case 'reconnecting':
        return 'bg-yellow-500 animate-pulse';
      case 'closing':
      case 'disconnected':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
      <span className="text-sm text-muted-foreground capitalize">{state}</span>
    </div>
  );
}
