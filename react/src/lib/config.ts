/**
 * Configuration - Environment variables and app settings
 * 
 * Purpose: Centralized configuration for the React frontend
 * 
 * Features:
 * - WebSocket URL from environment
 * - Fallback defaults for development
 * 
 * Usage:
 * ```typescript
 * import { WS_URL } from '@/lib/config';
 * const client = new WebSocketClient(WS_URL);
 * ```
 */

export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
