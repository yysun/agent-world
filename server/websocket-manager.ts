/**
 * WebSocket Connection Manager - Connection Lifecycle and Registry
 *
 * Features:
 * - WebSocket connection registry and lifecycle management
 * - Client ID generation and validation
 * - Connection heartbeat and health monitoring
 * - Session mapping and cleanup
 * - Real-time connection statistics
 *
 * Connection Lifecycle:
 * 1. Client connects -> Generate client ID
 * 2. Register connection with user session
 * 3. Handle message routing and subscriptions
 * 4. Monitor connection health with ping/pong
 * 5. Clean up on disconnect
 *
 * Core Functions:
 * - registerConnection: Add new WebSocket connection
 * - unregisterConnection: Remove and cleanup connection
 * - getConnection: Retrieve connection by client ID
 * - broadcastToWorld: Send message to all clients in world
 * - getConnectionStats: Get real-time statistics
 *
 * Implementation:
 * - Uses Map for fast connection lookup
 * - Integrates with user-manager for session tracking
 * - Handles graceful disconnection and cleanup
 * - Provides connection health monitoring
 * - Supports per-world message broadcasting
 */

import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
import {
  ClientConnection,
  ConnectionState,
  ConnectionHealth,
  WebSocketServerStats,
  WebSocketError,
  WebSocketErrorCode
} from './websocket-types';
import {
  getUserSessionById,
  incrementConnectionCount,
  decrementConnectionCount
} from '../src/user-manager';

// Connection registry
const connections = new Map<string, ClientConnection>();
const connectionsByUserId = new Map<string, Set<string>>();
const connectionsByWorld = new Map<string, Set<string>>();

// Server statistics
let serverStartTime = Date.now();
let totalConnectionsCount = 0;
let messagesProcessedCount = 0;

/**
 * Register a new WebSocket connection
 */
export function registerConnection(
  websocket: WebSocket,
  userId: string,
  sessionId: string
): string {
  const clientId = uuidv4();
  const now = new Date();

  // Create connection object
  const connection: ClientConnection = {
    clientId,
    userId,
    sessionId,
    connectedAt: now,
    lastActivity: now,
    subscriptions: [],
    isPersistent: false,
    websocket
  };

  // Register connection
  connections.set(clientId, connection);

  // Track by user ID
  if (!connectionsByUserId.has(userId)) {
    connectionsByUserId.set(userId, new Set());
  }
  connectionsByUserId.get(userId)!.add(clientId);

  // Update session connection count
  incrementConnectionCount(sessionId);

  // Update statistics
  totalConnectionsCount++;

  console.log(`WebSocket connection registered: ${clientId} for user ${userId}`);

  return clientId;
}

/**
 * Unregister a WebSocket connection
 */
export function unregisterConnection(clientId: string): void {
  const connection = connections.get(clientId);
  if (!connection) {
    return; // Connection not found
  }

  try {
    // Clean up subscriptions
    connection.subscriptions.forEach(unsubscribe => {
      try {
        unsubscribe();
      } catch (error) {
        console.error('Error cleaning up subscription:', error);
      }
    });

    // Remove from world tracking
    if (connection.worldName) {
      const worldConnections = connectionsByWorld.get(connection.worldName);
      if (worldConnections) {
        worldConnections.delete(clientId);
        if (worldConnections.size === 0) {
          connectionsByWorld.delete(connection.worldName);
        }
      }
    }

    // Remove from user tracking
    const userConnections = connectionsByUserId.get(connection.userId);
    if (userConnections) {
      userConnections.delete(clientId);
      if (userConnections.size === 0) {
        connectionsByUserId.delete(connection.userId);
      }
    }

    // Update session connection count
    decrementConnectionCount(connection.sessionId);

    // Remove from main registry
    connections.delete(clientId);

    console.log(`WebSocket connection unregistered: ${clientId}`);

  } catch (error) {
    console.error(`Error unregistering connection ${clientId}:`, error);
  }
}

/**
 * Get connection by client ID
 */
export function getConnection(clientId: string): ClientConnection | null {
  const connection = connections.get(clientId);
  if (connection) {
    // Update last activity
    connection.lastActivity = new Date();
    return connection;
  }
  return null;
}

/**
 * Update connection with world information
 */
export function updateConnectionWorld(
  clientId: string,
  worldName: string,
  templateName: string,
  isPersistent: boolean = false
): boolean {
  const connection = connections.get(clientId);
  if (!connection) {
    return false;
  }

  // Remove from old world tracking
  if (connection.worldName) {
    const oldWorldConnections = connectionsByWorld.get(connection.worldName);
    if (oldWorldConnections) {
      oldWorldConnections.delete(clientId);
      if (oldWorldConnections.size === 0) {
        connectionsByWorld.delete(connection.worldName);
      }
    }
  }

  // Update connection
  connection.worldName = worldName;
  connection.templateName = templateName;
  connection.isPersistent = isPersistent;
  connection.lastActivity = new Date();

  // Add to new world tracking
  if (!connectionsByWorld.has(worldName)) {
    connectionsByWorld.set(worldName, new Set());
  }
  connectionsByWorld.get(worldName)!.add(clientId);

  return true;
}

/**
 * Get all connections for a user
 */
export function getUserConnections(userId: string): ClientConnection[] {
  const userConnectionIds = connectionsByUserId.get(userId);
  if (!userConnectionIds) {
    return [];
  }

  return Array.from(userConnectionIds)
    .map(id => connections.get(id))
    .filter(Boolean) as ClientConnection[];
}

/**
 * Get all connections for a world
 */
export function getWorldConnections(worldName: string): ClientConnection[] {
  const worldConnectionIds = connectionsByWorld.get(worldName);
  if (!worldConnectionIds) {
    return [];
  }

  return Array.from(worldConnectionIds)
    .map(id => connections.get(id))
    .filter(Boolean) as ClientConnection[];
}

/**
 * Broadcast message to all connections in a world
 */
export function broadcastToWorld(worldName: string, message: any): number {
  const worldConnections = getWorldConnections(worldName);
  let sentCount = 0;

  for (const connection of worldConnections) {
    try {
      if (connection.websocket.readyState === WebSocket.OPEN) {
        connection.websocket.send(JSON.stringify(message));
        connection.lastActivity = new Date();
        sentCount++;
      }
    } catch (error) {
      console.error(`Error broadcasting to connection ${connection.clientId}:`, error);
    }
  }

  return sentCount;
}

/**
 * Send message to specific connection
 */
export function sendToConnection(clientId: string, message: any): boolean {
  const connection = connections.get(clientId);
  if (!connection) {
    return false;
  }

  try {
    if (connection.websocket.readyState === WebSocket.OPEN) {
      connection.websocket.send(JSON.stringify(message));
      connection.lastActivity = new Date();
      return true;
    }
  } catch (error) {
    console.error(`Error sending to connection ${clientId}:`, error);
  }

  return false;
}

/**
 * Add subscription to connection
 */
export function addSubscription(clientId: string, unsubscribe: () => void): boolean {
  const connection = connections.get(clientId);
  if (!connection) {
    return false;
  }

  connection.subscriptions.push(unsubscribe);
  return true;
}

/**
 * Get connection health information
 */
export function getConnectionHealth(clientId: string): ConnectionHealth | null {
  const connection = connections.get(clientId);
  if (!connection) {
    return null;
  }

  const now = new Date();
  const connected = connection.websocket.readyState === WebSocket.OPEN;

  return {
    clientId,
    userId: connection.userId,
    state: connected ? ConnectionState.CONNECTED : ConnectionState.DISCONNECTED,
    lastPing: connection.lastActivity, // Using lastActivity as ping time
    lastPong: connection.lastActivity,
    latency: 0, // Would need actual ping/pong implementation
    connected
  };
}

/**
 * Clean up inactive connections
 */
export function cleanupInactiveConnections(maxIdleTime: number = 5 * 60 * 1000): number {
  const now = new Date();
  const connectionsToClose: string[] = [];

  for (const [clientId, connection] of connections) {
    const idleTime = now.getTime() - connection.lastActivity.getTime();
    const isInactive = idleTime > maxIdleTime;
    const isClosed = connection.websocket.readyState !== WebSocket.OPEN;

    if (isInactive || isClosed) {
      connectionsToClose.push(clientId);
    }
  }

  // Close and unregister inactive connections
  for (const clientId of connectionsToClose) {
    const connection = connections.get(clientId);
    if (connection) {
      try {
        if (connection.websocket.readyState === WebSocket.OPEN) {
          connection.websocket.close();
        }
      } catch (error) {
        console.error(`Error closing connection ${clientId}:`, error);
      }
      unregisterConnection(clientId);
    }
  }

  return connectionsToClose.length;
}

/**
 * Get WebSocket server statistics
 */
export function getServerStats(): WebSocketServerStats {
  const now = Date.now();
  const uptime = Math.floor((now - serverStartTime) / 1000);
  const activeConnections = connections.size;
  const activeSessions = new Set(Array.from(connections.values()).map(c => c.sessionId)).size;
  const activeWorlds = connectionsByWorld.size;

  // Calculate messages per second (rough approximation)
  const messagesPerSecond = uptime > 0 ? Math.round(messagesProcessedCount / uptime) : 0;

  return {
    totalConnections: totalConnectionsCount,
    activeConnections,
    totalSessions: activeSessions,
    activeSessions,
    totalWorlds: activeWorlds,
    messagesPerSecond,
    uptime
  };
}

/**
 * Increment message counter for statistics
 */
export function incrementMessageCount(): void {
  messagesProcessedCount++;
}

/**
 * Get all active connections
 */
export function getAllConnections(): ClientConnection[] {
  return Array.from(connections.values());
}

/**
 * Check if user has any active connections
 */
export function hasActiveConnections(userId: string): boolean {
  const userConnections = connectionsByUserId.get(userId);
  if (!userConnections || userConnections.size === 0) {
    return false;
  }

  // Check if any connections are actually open
  for (const clientId of userConnections) {
    const connection = connections.get(clientId);
    if (connection && connection.websocket.readyState === WebSocket.OPEN) {
      return true;
    }
  }

  return false;
}

/**
 * Reset server statistics (for testing)
 * @internal
 */
export function _resetStatsForTesting(): void {
  serverStartTime = Date.now();
  totalConnectionsCount = 0;
  messagesProcessedCount = 0;
}

/**
 * Clear all connections (for testing)
 * @internal
 */
export function _clearAllConnectionsForTesting(): void {
  // Close all WebSocket connections
  for (const connection of connections.values()) {
    try {
      if (connection.websocket.readyState === WebSocket.OPEN) {
        connection.websocket.close();
      }
    } catch (error) {
      // Ignore errors during testing cleanup
    }
  }

  // Clear all registries
  connections.clear();
  connectionsByUserId.clear();
  connectionsByWorld.clear();

  // Reset stats
  _resetStatsForTesting();
}
