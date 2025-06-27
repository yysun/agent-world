/**
 * WebSocket Server - Real-time Communication Server
 *
 * Features:
 * - WebSocket server setup and lifecycle management
 * - Connection handling and authentication
 * - Message parsing and routing
 * - Error handling and logging
 * - Health checks and monitoring
 *
 * Server Flow:
 * 1. Client connects -> Generate user ID and session
 * 2. Register connection and setup message handling
 * 3. Route messages to appropriate handlers
 * 4. Handle disconnection and cleanup
 *
 * Core Functions:
 * - createWebSocketServer: Initialize WebSocket server
 * - handleConnection: Process new WebSocket connections
 * - handleMessage: Parse and route WebSocket messages
 * - handleDisconnection: Clean up on client disconnect
 * - startHealthChecks: Monitor connection health
 *
 * Implementation:
 * - Uses ws library for WebSocket server
 * - Integrates with Express server
 * - Provides comprehensive error handling
 * - Supports connection health monitoring
 * - Manages connection lifecycle
 */

import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import {
  WebSocketMessage,
  isClientMessage,
  WebSocketError,
  WebSocketErrorCode,
  ClientMessageType,
  ServerMessageType
} from './websocket-types';
import {
  createUserSession,
  deleteUserSession,
  cleanupInactiveSessions
} from '../src/user-manager';
import {
  registerConnection,
  unregisterConnection,
  getConnection,
  cleanupInactiveConnections,
  getServerStats,
  sendToConnection
} from './websocket-manager';
import { routeMessage } from './websocket-handlers';
import { trackEvent } from './websocket-events';

// WebSocket server instance
let wsServer: WebSocketServer | null = null;

// Health check interval
let healthCheckInterval: NodeJS.Timeout | null = null;

// Server configuration
interface WebSocketServerConfig {
  port?: number;
  host?: string;
  path?: string;
  heartbeatInterval?: number;
  sessionCleanupInterval?: number;
}

/**
 * Create and configure WebSocket server
 */
export function createWebSocketServer(config: WebSocketServerConfig = {}): WebSocketServer {
  const {
    port = 3001,
    host = 'localhost',
    path = '/ws',
    heartbeatInterval = 30000, // 30 seconds
    sessionCleanupInterval = 300000 // 5 minutes
  } = config;

  // Create WebSocket server
  wsServer = new WebSocketServer({
    port,
    host,
    path
  });

  console.log(`🔌 WebSocket server created on ws://${host}:${port}${path}`);

  // Handle new connections
  wsServer.on('connection', (websocket: WebSocket, request: IncomingMessage) => {
    handleConnection(websocket, request);
  });

  // Handle server errors
  wsServer.on('error', (error: Error) => {
    console.error('WebSocket server error:', error);
  });

  // Start health checks
  startHealthChecks(heartbeatInterval, sessionCleanupInterval);

  return wsServer;
}

/**
 * Attach WebSocket server to existing HTTP server
 */
export function attachWebSocketServer(
  httpServer: any,
  config: Omit<WebSocketServerConfig, 'port' | 'host'> = {}
): WebSocketServer {
  const {
    path = '/ws',
    heartbeatInterval = 30000,
    sessionCleanupInterval = 300000
  } = config;

  // Create WebSocket server attached to HTTP server
  wsServer = new WebSocketServer({
    server: httpServer,
    path
  });

  console.log(`🔌 WebSocket server attached to HTTP server at ${path}`);

  // Handle new connections
  wsServer.on('connection', (websocket: WebSocket, request: IncomingMessage) => {
    handleConnection(websocket, request);
  });

  // Handle server errors
  wsServer.on('error', (error: Error) => {
    console.error('WebSocket server error:', error);
  });

  // Start health checks
  startHealthChecks(heartbeatInterval, sessionCleanupInterval);

  return wsServer;
}

/**
 * Handle new WebSocket connection
 */
function handleConnection(websocket: WebSocket, request: IncomingMessage): void {
  // Generate anonymous user ID
  const userId = `anon_${uuidv4()}`;

  // Create user session (will be updated when user selects world)
  let sessionId: string;

  createUserSession(userId, 'default-world', 'temp-world', { persistent: false })
    .then(session => {
      sessionId = session.sessionId;

      // Register WebSocket connection
      const clientId = registerConnection(websocket, userId, sessionId);

      console.log(`👤 New WebSocket connection: ${clientId} (user: ${userId})`);

      // Send welcome message
      const welcomeMessage = {
        id: uuidv4(),
        type: ServerMessageType.STATUS,
        timestamp: new Date().toISOString(),
        payload: {
          type: 'connected' as const,
          message: 'Connected to Agent World WebSocket server',
          data: {
            clientId,
            userId,
            serverTime: new Date().toISOString()
          }
        }
      };

      sendToConnection(clientId, welcomeMessage);

      // Handle incoming messages
      websocket.on('message', (data: Buffer | string) => {
        handleMessage(clientId, data);
      });

      // Handle connection close
      websocket.on('close', (code: number, reason: Buffer) => {
        handleDisconnection(clientId, code, reason.toString());
      });

      // Handle WebSocket errors
      websocket.on('error', (error: Error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
        handleDisconnection(clientId, 1006, 'Connection error');
      });

      // Handle ping/pong for connection health
      websocket.on('ping', () => {
        websocket.pong();
      });

      websocket.on('pong', () => {
        // Update connection activity
        getConnection(clientId);
      });

    })
    .catch(error => {
      console.error('Failed to create user session for new connection:', error);
      websocket.close(1011, 'Failed to initialize session');
    });
}

/**
 * Handle incoming WebSocket message
 */
function handleMessage(clientId: string, data: Buffer | string): void {
  try {
    // Parse message
    const messageText = data.toString();
    let message: any;

    try {
      message = JSON.parse(messageText);
    } catch (parseError) {
      console.error(`Invalid JSON from client ${clientId}:`, parseError);
      sendError(clientId, WebSocketErrorCode.INVALID_MESSAGE, 'Invalid JSON format');
      return;
    }

    // Validate message structure
    if (!isClientMessage(message)) {
      console.error(`Invalid message structure from client ${clientId}:`, message);
      sendError(clientId, WebSocketErrorCode.INVALID_MESSAGE, 'Invalid message structure');
      return;
    }

    // Track event for statistics
    trackEvent('global', message.type);

    // Route message to appropriate handler
    routeMessage(clientId, message as WebSocketMessage)
      .catch(error => {
        console.error(`Error handling message ${message.type} from client ${clientId}:`, error);

        if (error instanceof WebSocketError) {
          sendError(clientId, error.code, error.message, error.details);
        } else {
          sendError(clientId, WebSocketErrorCode.SERVER_ERROR, 'Internal server error');
        }
      });

  } catch (error) {
    console.error(`Unexpected error handling message from client ${clientId}:`, error);
    sendError(clientId, WebSocketErrorCode.SERVER_ERROR, 'Unexpected server error');
  }
}

/**
 * Handle WebSocket disconnection
 */
function handleDisconnection(clientId: string, code: number, reason: string): void {
  console.log(`🔌 WebSocket disconnected: ${clientId} (code: ${code}, reason: ${reason})`);

  const connection = getConnection(clientId);
  if (connection) {
    // Clean up user session if not persistent
    if (!connection.isPersistent) {
      deleteUserSession(connection.sessionId, true)
        .catch(error => {
          console.error(`Error cleaning up session for ${clientId}:`, error);
        });
    }
  }

  // Unregister connection
  unregisterConnection(clientId);
}

/**
 * Send error message to client
 */
function sendError(
  clientId: string,
  code: WebSocketErrorCode,
  message: string,
  details?: any
): void {
  const errorMessage = {
    id: uuidv4(),
    type: ServerMessageType.ERROR,
    timestamp: new Date().toISOString(),
    payload: {
      code,
      message,
      details
    }
  };

  sendToConnection(clientId, errorMessage);
}

/**
 * Start health checks and cleanup tasks
 */
function startHealthChecks(
  heartbeatInterval: number,
  sessionCleanupInterval: number
): void {
  // Stop existing health checks
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  // Start periodic health checks
  healthCheckInterval = setInterval(() => {
    try {
      // Clean up inactive connections
      const cleanedConnections = cleanupInactiveConnections();
      if (cleanedConnections > 0) {
        console.log(`🧹 Cleaned up ${cleanedConnections} inactive WebSocket connections`);
      }

      // Clean up inactive sessions
      cleanupInactiveSessions()
        .then(cleanedSessions => {
          if (cleanedSessions > 0) {
            console.log(`🧹 Cleaned up ${cleanedSessions} inactive user sessions`);
          }
        })
        .catch(error => {
          console.error('Error cleaning up inactive sessions:', error);
        });

      // Log server statistics
      const stats = getServerStats();
      console.log(`📊 WebSocket Stats: ${stats.activeConnections} connections, ${stats.activeSessions} sessions, uptime: ${stats.uptime}s`);

    } catch (error) {
      console.error('Error during health check:', error);
    }
  }, Math.min(heartbeatInterval, sessionCleanupInterval));
}

/**
 * Stop WebSocket server
 */
export function stopWebSocketServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!wsServer) {
      resolve();
      return;
    }

    // Stop health checks
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
    }

    // Close server
    wsServer.close((error) => {
      if (error) {
        console.error('Error stopping WebSocket server:', error);
        reject(error);
      } else {
        console.log('🔌 WebSocket server stopped');
        wsServer = null;
        resolve();
      }
    });
  });
}

/**
 * Get WebSocket server instance
 */
export function getWebSocketServer(): WebSocketServer | null {
  return wsServer;
}

/**
 * Check if WebSocket server is running
 */
export function isWebSocketServerRunning(): boolean {
  return wsServer !== null;
}

/**
 * Broadcast message to all connected clients
 */
export function broadcastToAllClients(message: any): number {
  if (!wsServer) {
    return 0;
  }

  let sentCount = 0;
  const messageString = JSON.stringify(message);

  wsServer.clients.forEach(websocket => {
    if (websocket.readyState === WebSocket.OPEN) {
      try {
        websocket.send(messageString);
        sentCount++;
      } catch (error) {
        console.error('Error broadcasting to client:', error);
      }
    }
  });

  return sentCount;
}

/**
 * Get server health information
 */
export function getServerHealth() {
  const stats = getServerStats();
  const isRunning = isWebSocketServerRunning();

  return {
    isRunning,
    ...stats,
    healthCheckActive: healthCheckInterval !== null,
    serverInstance: wsServer ? 'active' : 'inactive'
  };
}
