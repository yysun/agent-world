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

// Enhanced message schema to support Message Broker
const MessageBrokerSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.record(z.any()),
  timestamp: z.string()
});

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

/**
 * Handle Message Broker messages 
 */
async function handleMessageBrokerMessage(
  ws: StatefulWebSocket,
  message: { id: string; type: string; data: any; timestamp: string },
  connectionId: string
) {
  const { id, type, data } = message;

  try {
    let result;

    switch (type) {
      case 'agent_list':
        // Mock agent list for now - this would integrate with core agent management
        result = [
          { id: 'agent-1', name: 'Assistant Agent 1', type: 'assistant', status: 'active' },
          { id: 'agent-2', name: 'Assistant Agent 2', type: 'assistant', status: 'active' }
        ];
        break;

      case 'agent_get':
        const agentId = data.id;
        result = {
          id: agentId,
          name: `Agent ${agentId}`,
          type: 'assistant',
          status: 'active',
          memory: `Memory for ${agentId}`
        };
        break;

      case 'world_list':
        let worlds = await listWorlds(ROOT_PATH);

        // Auto-create default world if none exist (like CLI behavior)
        if (!worlds || worlds.length === 0) {
          try {
            console.log('No worlds found, creating default world...');
            const defaultWorld = await createWorld(ROOT_PATH, {
              name: 'Default World',
              description: 'Default world for Agent interactions'
            });

            // Convert World to WorldInfo format
            const defaultWorldInfo: WorldInfo = {
              id: defaultWorld.id,
              name: defaultWorld.name,
              description: defaultWorld.description,
              turnLimit: defaultWorld.turnLimit,
              agentCount: defaultWorld.agents.size
            };

            worlds = [defaultWorldInfo];
            console.log('Default world created successfully');
          } catch (error) {
            console.error('Failed to create default world:', error);
            worlds = [];
          }
        }

        result = worlds.map(world => ({
          id: world.id,
          name: world.name,
          agentCount: world.agentCount,
          description: world.description,
          turnLimit: world.turnLimit
        }));
        break;

      case 'world_get':
        const worldId = data.id;
        const world = await getWorld(ROOT_PATH, worldId);
        result = world ? {
          id: world.id,
          name: world.name,
          description: world.description,
          turnLimit: world.turnLimit,
          agents: Array.from(world.agents.keys()) // Convert Map keys to array
        } : null;
        break;

      case 'world_create':
        const newWorld = await createWorld(ROOT_PATH, {
          name: data.name || 'New World',
          ...data
        });
        result = {
          id: newWorld.id,
          name: newWorld.name,
          created: new Date().toISOString()
        };
        break;

      case 'chat_message':
        // Handle chat message through existing world system
        if (!ws.worldInstance) {
          throw new Error('No world connected. Connect to a world first.');
        }

        publishMessage(
          ws.worldInstance,
          data.message || 'Hello from Message Broker',
          data.sender || 'HUMAN'
        );

        result = {
          messageId: `msg-${Date.now()}`,
          sent: true,
          message: data.message,
          sender: data.sender || 'HUMAN'
        };
        break;

      default:
        throw new Error(`Unsupported message type: ${type}`);
    }

    // Send success response
    ws.send(JSON.stringify({
      requestId: id,
      type: 'response',
      data: result,
      timestamp: new Date().toISOString()
    }));

  } catch (error) {
    // Send error response
    ws.send(JSON.stringify({
      requestId: id,
      type: 'response',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }));
  }
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

        // Check if it's a Message Broker message
        const brokerValidation = MessageBrokerSchema.safeParse(message);
        if (brokerValidation.success) {
          await handleMessageBrokerMessage(ws, brokerValidation.data, connectionId);
          return;
        }

        // Fall back to legacy WebSocket message format
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
