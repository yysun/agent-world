/**
 * WebSocket Server for Agent World
 *
 * Features:
 * - Stateful WebSocket connection management per client
 * - World subscription lifecycle with event listener management
 * - Uses stateless event handlers from ws-events.ts for command processing
 * - Connection-specific world state and event listener cleanup
 * - World refresh logic after command execution with state updates
 *
 * WebSocket Connection State:
 * - World subscription per connection with event listeners
 * - Automatic cleanup on disconnect to prevent memory leaks
 * - World refresh and re-subscription after modifications
 *
 * WebSocket Events:
 * - subscribe: Load world and setup event listeners for this connection
 * - unsubscribe: Clean up world subscription and listeners
 * - system/world/message: Use stateless handlers from ws-events.ts
 *
 * Architecture:
 * - ws.ts: Manages stateful connection and subscription lifecycle
 * - ws-events.ts: Provides stateless command execution and message publishing
 * - Clear separation between transport state and event logic
 * - Per-connection world state with proper cleanup
 *
 * Changes:
 * - Moved subscription/unsubscribe logic from ws-events.ts to ws.ts
 * - Added connection-specific world state management
 * - Integrated stateless event handlers for command processing
 * - Implemented world refresh with state synchronization
 */

import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { World } from '../core/types.js';
import { getWorld } from '../core/world-manager.js';
import { toKebabCase } from '../core/utils.js';

import {
  InboundMessageSchema,
  handleCommand,
  handleMessagePublish,
  sendSuccess,
  sendError,
  sendCommandResult,
  ClientConnection
} from './ws-events.js';

const ROOT_PATH = process.env.AGENT_WORLD_DATA_PATH || './data/worlds';

let wss: WebSocketServer;

export function getWebSocketStats() {
  return {
    connectedClients: wss?.clients?.size,
    isRunning: !!wss
  };
}

interface WorldSocket extends WebSocket {
  world?: World;
  worldEventListeners?: Map<string, (...args: any[]) => void>;
}

// Full message schema including subscribe/unsubscribe (handled here)
const FullMessageSchema = z.object({
  type: z.enum(["subscribe", "unsubscribe", "system", "world", "message"]),
  payload: z.object({
    worldName: z.string().optional(),
    message: z.string().optional(),
    sender: z.string().optional()
  })
});

// Adapter to make WebSocket compatible with ClientConnection interface
function createClientConnection(ws: WorldSocket): ClientConnection {
  return {
    send: (data: string) => ws.send(data),
    isOpen: ws.readyState === ws.OPEN
  };
}

// Clean up world subscription and event listeners
async function cleanupWorldSubscription(ws: WorldSocket): Promise<void> {
  if (ws.world && ws.worldEventListeners) {
    // Remove all event listeners
    for (const [eventName, listener] of ws.worldEventListeners) {
      ws.world.eventEmitter.off(eventName, listener);
    }
    ws.worldEventListeners.clear();
  }

  // Clear world reference
  ws.world = undefined;
  ws.worldEventListeners = undefined;
}

// Set up event listeners for world events
function setupWorldEventListeners(ws: WorldSocket, world: World): void {
  if (!ws.worldEventListeners) {
    ws.worldEventListeners = new Map();
  }

  const client = createClientConnection(ws);

  // Generic handler that forwards events to client with filtering
  const handler = (eventType: string) => (eventData: any) => {
    // Skip echoing user messages back to client
    // Only forward agent responses, system messages, and SSE events
    if (eventData.sender && (eventData.sender === 'HUMAN' || eventData.sender.startsWith('user'))) {
      return;
    }

    if (client.isOpen) {
      // Add the event type to the payload so client knows what kind of event this is
      client.send(JSON.stringify({
        ...eventData,
        eventType
      }));
    }
  };

  // List of event types to forward
  const eventTypes = ['system', 'world', 'message', 'sse'];

  // Set up listeners for all event types
  for (const eventType of eventTypes) {
    const eventHandler = handler(eventType);
    world.eventEmitter.on(eventType, eventHandler);
    ws.worldEventListeners.set(eventType, eventHandler);
  }
}

// Refresh world subscription after command execution
async function refreshWorldSubscription(ws: WorldSocket, worldName: string): Promise<void> {
  try {
    const worldId = toKebabCase(worldName);
    const refreshedWorld = await getWorld(ROOT_PATH, worldId);
    if (refreshedWorld) {
      // Clean up existing world subscription
      await cleanupWorldSubscription(ws);

      // Attach refreshed world
      ws.world = refreshedWorld;
      ws.worldEventListeners = new Map();

      // Set up event listeners
      setupWorldEventListeners(ws, refreshedWorld);

      const client = createClientConnection(ws);
      sendSuccess(client, 'World subscription refreshed', { worldName });
    }
  } catch (error) {
    console.error('Failed to refresh world:', error);
  }
}

// Handle subscribe event
async function handleSubscribe(ws: WorldSocket, worldName: string): Promise<void> {
  const client = createClientConnection(ws);

  // Load and attach world to client
  const worldId = toKebabCase(worldName);
  const world = await getWorld(ROOT_PATH, worldId);
  if (!world) {
    sendError(client, 'Failed to load world');
    return;
  }

  // Clean up existing world subscription if any
  await cleanupWorldSubscription(ws);

  // Attach world to WebSocket
  ws.world = world;
  ws.worldEventListeners = new Map();

  // Set up event listeners
  setupWorldEventListeners(ws, world);

  sendSuccess(client, 'Successfully subscribed to world', { worldName });
}

// Handle unsubscribe event
async function handleUnsubscribe(ws: WorldSocket): Promise<void> {
  const client = createClientConnection(ws);

  // Clean up world subscription
  await cleanupWorldSubscription(ws);

  sendSuccess(client, 'Successfully unsubscribed from world');
}

export function createWebSocketServer(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req) => {

    console.log(`WebSocket client connected: ${req.socket.remoteAddress}`);

    // Send connected message
    ws.send(JSON.stringify({
      type: 'connected',
      timestamp: new Date().toISOString()
    }));

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        const validation = FullMessageSchema.safeParse(message);

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
        const worldSocket = ws as WorldSocket;
        const client = createClientConnection(worldSocket);

        switch (type) {
          case 'subscribe':
            if (worldName) {
              await handleSubscribe(worldSocket, worldName);
            }
            break;

          case 'unsubscribe':
            await handleUnsubscribe(worldSocket);
            break;

          case 'system':
          case 'world':
            if (eventMessage && eventMessage.trim().startsWith('/')) {
              // Check if this is a global command that doesn't require world subscription
              const commandName = eventMessage.trim().slice(1).split(/\s+/)[0].toLowerCase();
              const globalCommands = ['getworlds', 'addworld'];

              if (globalCommands.includes(commandName)) {
                // Execute global command without world context
                const result = await handleCommand(null, eventMessage, ROOT_PATH);
                sendCommandResult(client, result);
              } else {
                // Regular world-specific command - requires world subscription
                if (worldName && worldSocket.world) {
                  if (worldSocket.world.name !== worldName) {
                    sendError(client, `${type} event requires valid world subscription`);
                    break;
                  }

                  const result = await handleCommand(worldSocket.world, eventMessage, ROOT_PATH);
                  sendCommandResult(client, result);

                  // Refresh world if needed
                  if (result.refreshWorld) {
                    await refreshWorldSubscription(worldSocket, worldName);
                  }
                } else {
                  sendError(client, `${type} event requires valid world subscription for command: ${commandName}`);
                }
              }
            } else {
              sendError(client, `${type} event requires command message starting with '/'`);
            }
            break;

          case 'message':
            if (worldName && eventMessage && worldSocket.world) {
              if (worldSocket.world.name !== worldName) {
                sendError(client, 'Message event requires valid world subscription');
                break;
              }

              if (eventMessage.trim().startsWith('/')) {
                // Handle as command
                const result = await handleCommand(worldSocket.world, eventMessage, ROOT_PATH);
                sendCommandResult(client, result);

                // Refresh world if needed
                if (result.refreshWorld) {
                  await refreshWorldSubscription(worldSocket, worldName);
                }
              } else {
                // Handle as regular message - publish to world
                handleMessagePublish(worldSocket.world, eventMessage, sender);
              }
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

    ws.on('close', async () => {
      console.log(`WebSocket client disconnected`);
      // Clean up world subscription on disconnect
      await cleanupWorldSubscription(ws as WorldSocket);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error`, error);
    });
  });

  return wss;
}
