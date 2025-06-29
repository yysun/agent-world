/**
 * Stateful WebSocket Server for Agent World
 * 
 * Features:
 * - Real-time WebSocket communication with stateful world management
 * - Per-connection world instance creation and lifecycle management
 * - Connection state tracking for LLM streaming
 * - World instance isolation between connections
 * - Automatic cleanup on disconnect
 * 
 * WebSocket Events:
 * - connect: Create world instance and subscribe to world events
 * - event: Send message to world using publishMessage
 * - welcome: Connection confirmation with world instance created
 * - message: Real-time event broadcasting from world
 * - error: Error messages
 * 
 * Architecture:
 * - Each WebSocket connection gets its own World instance
 * - World instances are isolated and cleaned up on disconnect
 * - LLM streaming state tracked per connection
 * - Uses core/ modules for world management
 */

import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { World } from '../core/types.js';

import { z } from 'zod';
import { listWorlds, getWorld, createWorld, WorldInfo } from '../core/world-manager.js';
import { publishMessage, subscribeToMessages } from '../core/world-events.js';
import { toKebabCase } from '../core/utils.js';

const ROOT_PATH = process.env.AGENT_WORLD_DATA_PATH || './data/worlds';

// Zod validation schema for WebSocket messages
const WebSocketMessageSchema = z.object({
  type: z.enum(["connect", "event"]),
  payload: z.object({
    worldName: z.string(),
    message: z.string().optional(),
    sender: z.string().optional()
  })
});

// Extended WebSocket interface to track connection state
interface StatefulWebSocket extends WebSocket {
  worldInstance?: World;
  worldName?: string;
  connectionId?: string;
  unsubscribeFromWorld?: () => void;
}

// Connection tracking
const connections = new Map<string, StatefulWebSocket>();
let connectionCounter = 0;

let wss: WebSocketServer;

export function getWebSocketStats() {
  return {
    connectedClients: wss?.clients?.size || 0,
    activeConnections: connections.size,
    isRunning: !!wss
  };
}

/**
 * Create or get world instance for connection
 */
async function createWorldInstanceForConnection(worldName: string): Promise<World> {
  const worldId = toKebabCase(worldName);

  // Try to get existing world
  let world = await getWorld(ROOT_PATH, worldId);

  // If world doesn't exist, create it
  if (!world) {
    world = await createWorld(ROOT_PATH, { name: worldName });
  }

  return world;
}

/**
 * Clean up connection state
 */
function cleanupConnection(connectionId: string, ws: StatefulWebSocket) {
  // Unsubscribe from world events
  if (ws.unsubscribeFromWorld) {
    ws.unsubscribeFromWorld();
  }

  // Remove from connections map
  connections.delete(connectionId);

  console.log(`Connection ${connectionId} cleaned up. Active connections: ${connections.size}`);
}

export function createWebSocketServer(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: StatefulWebSocket, req) => {
    // Generate unique connection ID
    const connectionId = `conn_${++connectionCounter}_${Date.now()}`;
    ws.connectionId = connectionId;
    connections.set(connectionId, ws);

    console.log(`WebSocket client connected: ${req.socket.remoteAddress} (${connectionId})`);

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'welcome',
      connectionId: connectionId,
      timestamp: new Date().toISOString()
    }));

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        const validation = WebSocketMessageSchema.safeParse(message);

        if (!validation.success) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Invalid message format',
            details: validation.error.issues
          }));
          return;
        }

        const { type, payload } = validation.data;
        const { worldName, message: eventMessage, sender } = payload;

        switch (type) {
          case 'connect':
            try {
              // Create world instance for this connection
              const worldInstance = await createWorldInstanceForConnection(worldName);
              ws.worldInstance = worldInstance;
              ws.worldName = worldName;

              // Subscribe to world events for real-time streaming
              const unsubscribe = subscribeToMessages(worldInstance, (event) => {
                try {
                  ws.send(JSON.stringify({
                    type: 'message',
                    payload: event,
                    worldName: worldName,
                    connectionId: connectionId
                  }));
                } catch (error) {
                  console.error('Error sending world event to client:', error);
                }
              });

              ws.unsubscribeFromWorld = unsubscribe;

              // Send connection confirmation
              ws.send(JSON.stringify({
                type: 'connected',
                worldName: worldName,
                connectionId: connectionId,
                timestamp: new Date().toISOString()
              }));

              console.log(`Connection ${connectionId} connected to world: ${worldName}`);
            } catch (error) {
              console.error('Error connecting to world:', error);
              ws.send(JSON.stringify({
                type: 'error',
                error: 'Failed to connect to world',
                details: error instanceof Error ? error.message : 'Unknown error'
              }));
            }
            break;

          case 'event':
            if (!ws.worldInstance) {
              ws.send(JSON.stringify({
                type: 'error',
                error: 'Not connected to a world. Send connect message first.'
              }));
              return;
            }

            if (!eventMessage) {
              ws.send(JSON.stringify({
                type: 'error',
                error: 'Event requires message'
              }));
              return;
            }

            try {
              // Send message to the world instance
              publishMessage(ws.worldInstance, eventMessage, sender || 'HUMAN');
            } catch (error) {
              console.error('Error publishing message to world:', error);
              ws.send(JSON.stringify({
                type: 'error',
                error: 'Failed to send message to world'
              }));
            }
            break;

          default:
            ws.send(JSON.stringify({
              type: 'error',
              error: 'Unknown message type'
            }));
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Failed to process message'
        }));
      }
    });

    ws.on('close', () => {
      console.log(`WebSocket client disconnected: ${connectionId}`);
      cleanupConnection(connectionId, ws);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${connectionId}:`, error);
      cleanupConnection(connectionId, ws);
    });
  });

  return wss;
}
