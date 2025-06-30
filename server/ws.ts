/**
 * WebSocket Server for Agent World
 *
 * Features:
 * - Real-time WebSocket communication using core modules
 * - World object subscription management with event emitters
 * - Connection management for WebSocket clients with world cleanup
 * - Simplified event broadcasting - forwards all world events with eventType added to payload
 * - Message validation with Zod schemas
 * - Memory clearing commands: /clear (all agents) and /clear <name> (specific agent)
 * - World subscription lifecycle management with automatic cleanup
 *
 * WebSocket Events:
 * - subscribe: Subscribe to world events (creates world object, attaches event listeners)
 * - unsubscribe: Unsubscribe from world events (cleans up world object and listeners)
 * - event: Send message to attached world object using publishMessage
 * - welcome: Connection confirmation (triggers auto-subscription on client)
 * - subscribed: Subscription confirmation
 * - unsubscribed: Unsubscription confirmation
 * - All world events: Forwarded with eventType field added (e.g., eventType: 'sse', type: 'chunk')
 * - error: Error messages
 *
 * Special Commands:
 * - /clear: Clear memory for all agents in the world
 * - /clear <agentName>: Clear memory for specific agent
 *
 * World Subscription System:
 * - Each WebSocket connection can have one world object attached
 * - World objects are created/loaded on subscription and cleaned up on unsubscribe/disconnect
 * - Generic event listener forwards all events from world.eventEmitter to WebSocket clients
 * - Proper cleanup prevents memory leaks from orphaned world objects
 * - Uses existing world-events system for message publishing
 *
 * Migration Changes:
 * - Updated to use core/ modules instead of src/
 * - Uses listWorlds() and getWorld() from world-manager
 * - Converts worldName to worldId using toKebabCase
 * - Uses publishMessage from world-events for messaging
 * - Extended WorldSocket interface to track world references and event listeners
 * - Implements comprehensive cleanup lifecycle management
 * - Simplified event forwarding with generic handler
 * - Added memory clearing functionality with /clear commands
 */

import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { World } from '../core/types.js';

import { z } from 'zod';
import { listWorlds, getWorld, WorldInfo } from '../core/world-manager.js';
import { publishMessage } from '../core/world-events.js';
import { toKebabCase } from '../core/utils.js';

const ROOT_PATH = process.env.AGENT_WORLD_DATA_PATH || './data/worlds';

// Zod validation schema for WebSocket messages
const WebSocketMessageSchema = z.object({
  type: z.enum(["event", "subscribe", "unsubscribe"]),
  payload: z.object({
    worldName: z.string().optional(),
    message: z.string().optional(),
    sender: z.string().optional()
  })
});

// Helper functions for world subscription management
async function cleanupWorldSubscription(ws: WorldSocket) {
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

function setupWorldEventListeners(ws: WorldSocket, world: World) {
  if (!ws.worldEventListeners) {
    ws.worldEventListeners = new Map();
  }

  // Generic handler that forwards events to WebSocket with filtering
  const handler = (eventType: string) => (eventData: any) => {
    // Skip echoing user messages back to WebSocket
    // Only forward agent responses, system messages, and SSE events
    if (eventData.sender && (eventData.sender === 'HUMAN' || eventData.sender.startsWith('user'))) {
      return;
    }

    if (ws.readyState === ws.OPEN) {
      // Add the event type to the payload so client knows what kind of event this is
      ws.send(JSON.stringify({
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

export function createWebSocketServer(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req) => {

    console.log(`WebSocket client connected: ${req.socket.remoteAddress}`);

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'welcome',
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
          case 'subscribe':
            if (worldName) {
              // Load and attach world to WebSocket
              const worldId = toKebabCase(worldName);
              const world = await getWorld(ROOT_PATH, worldId);
              if (!world) {
                ws.send(JSON.stringify({
                  type: 'error',
                  error: 'Failed to load world'
                }));
                return;
              }

              // Clean up existing world subscription if any
              await cleanupWorldSubscription(ws as WorldSocket);

              // Attach world to WebSocket
              (ws as WorldSocket).world = world;
              (ws as WorldSocket).worldEventListeners = new Map();

              // Set up event listeners
              setupWorldEventListeners(ws as WorldSocket, world);

              ws.send(JSON.stringify({
                type: 'subscribed',
                worldName,
                timestamp: new Date().toISOString()
              }));
            }
            break;

          case 'unsubscribe':
            // Clean up world subscription
            await cleanupWorldSubscription(ws as WorldSocket);

            ws.send(JSON.stringify({
              type: 'unsubscribed',
              timestamp: new Date().toISOString()
            }));
            break;

          case 'event':
            // Use attached world object if available
            const worldSocket = ws as WorldSocket;
            if (!worldSocket.world || worldSocket.world.name !== worldName) {
              ws.send(JSON.stringify({
                type: 'error',
                error: 'Event requires worldName and message'
              }));
              return;
            }

            // Check for special commands
            if (eventMessage) {
              // Handle /clear command to clear all agent memories
              if (eventMessage.trim() === '/clear') {
                try {
                  const agents = Array.from(worldSocket.world.agents.values());
                  const clearPromises = agents.map(agent => worldSocket.world!.clearAgentMemory(agent.name));
                  await Promise.all(clearPromises);

                  ws.send(JSON.stringify({
                    type: 'system',
                    content: `Cleared memory for all ${agents.length} agents in ${worldSocket.world.name}`,
                    timestamp: new Date().toISOString()
                  }));
                  return;
                } catch (error) {
                  ws.send(JSON.stringify({
                    type: 'error',
                    error: 'Failed to clear agent memories'
                  }));
                  return;
                }
              }

              // Handle /clear <name> command to clear specific agent memory
              const clearMatch = eventMessage.trim().match(/^\/clear\s+(.+)$/);
              if (clearMatch) {
                const agentName = clearMatch[1].trim();
                try {
                  await worldSocket.world.clearAgentMemory(agentName);

                  ws.send(JSON.stringify({
                    type: 'system',
                    content: `Cleared memory for agent: ${agentName}`,
                    timestamp: new Date().toISOString()
                  }));
                  return;
                } catch (error) {
                  ws.send(JSON.stringify({
                    type: 'error',
                    error: `Failed to clear memory for agent: ${agentName}`
                  }));
                  return;
                }
              }
            }

            // Normalize user senders to 'HUMAN' for public messages that agents should respond to
            const normalizedSender = sender && sender.startsWith('user') ? 'HUMAN' : (sender || 'HUMAN');

            eventMessage && publishMessage(worldSocket.world, eventMessage, normalizedSender);

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
