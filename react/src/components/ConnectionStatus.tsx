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
 * - shadcn Badge component integration
 * 
 * Implementation:
 * - Uses shadcn Badge component for consistent design
 * - Shows all connection states including closing
 * - Can be placed in header or sidebar
 * 
 * Changes:
 * - 2025-11-04: Updated with shadcn Badge component
 * - 2025-11-03: Created for Phase 5 (new component, not in Next.js)
 * - 2025-11-03: Added 'closing' state to match ConnectionState type
 */

import type { ConnectionState } from '@/lib/ws-client';
import { Badge } from '@/components/ui/badge';

interface ConnectionStatusProps {
  state: ConnectionState;
  className?: string;
}

export default function ConnectionStatus({ state, className = '' }: ConnectionStatusProps) {
  const getStatusIndicator = () => {
    switch (state) {
      case 'connected':
        return { color: 'bg-green-500', pulse: false };
      case 'connecting':
      case 'reconnecting':
        return { color: 'bg-yellow-500', pulse: true };
      case 'closing':
      case 'disconnected':
        return { color: 'bg-red-500', pulse: false };
      default:
        return { color: 'bg-gray-500', pulse: false };
    }
  };

  const getBadgeVariant = () => {
    switch (state) {
      case 'connected':
        return 'default';
      case 'connecting':
      case 'reconnecting':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const { color, pulse } = getStatusIndicator();

  return (
    <Badge variant={getBadgeVariant()} className={`gap-2 ${className}`}>
      <div className={`w-2 h-2 rounded-full ${color} ${pulse ? 'animate-pulse' : ''}`} />
      <span className="capitalize">{state}</span>
    </Badge>
  );
}
