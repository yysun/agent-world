/**
 * WebSocket Server for Agent World
 *
 * Features:
 * - Real-time WebSocket communication using core modules
 * - World object subscription management with event emitters
 * - Connection management for WebSocket clients with world cleanup
 * - Simplified event broadcasting - forwards all world events with eventType added to payload
 * - Message validation with Zod schemas
 * - Modular command system with clear commands in separate command modules
 * - World subscription lifecycle management with automatic cleanup
 *
 * WebSocket Events:
 * - subscribe: Subscribe to world events (creates world object, attaches event listeners)
 * - unsubscribe: Unsubscribe from world events (cleans up world object and listeners)
 * - event: Send message to attached world object using publishMessage (supports commands with '/')
 * - system: Execute commands only (requires '/' prefix)
 * - world: Execute commands only (requires '/' prefix)
 * - message: Execute commands if starts with '/', otherwise publish message to world
 * - welcome: Connection confirmation (triggers auto-subscription on client)
 * - subscribed: Subscription confirmation
 * - unsubscribed: Unsubscription confirmation
 * - All world events: Forwarded with eventType field added (e.g., eventType: 'sse', type: 'chunk')
 * - error: Error messages
 *
 * Command Handling:
 * - All commands start with '/' and are routed through executeCommand()
 * - Commands requiring root path (getWorlds, addWorld, updateWorld) automatically get ROOT_PATH prepended
 * - Commands support world refresh after add/update operations
 * - Available commands: clear, getWorlds, getWorld, addWorld, updateWorld, addAgent, updateAgentConfig, updateAgentPrompt, updateAgentMemory
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
 * - Extracted command handling to modular server/commands/ structure
 * - Clear commands moved to server/commands/clear.ts for better organization
 * - Added helper function to automatically prepend ROOT_PATH to commands that require it
 * - Updated all executeCommand calls to use prepareCommandWithRootPath helper
 */

import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { World } from '../core/types.js';

import { z } from 'zod';
import { listWorlds, getWorld, WorldInfo } from '../core/world-manager.js';
import { publishMessage } from '../core/world-events.js';
import { toKebabCase } from '../core/utils.js';
import { executeCommand } from './commands/index.js';

const ROOT_PATH = process.env.AGENT_WORLD_DATA_PATH || './data/worlds';

// Helper function to add root path to commands that need it
function prepareCommandWithRootPath(message: string): string {
  const commandLine = message.slice(1).trim(); // Remove leading '/'
  if (!commandLine) return message;

  const parts = commandLine.split(/\s+/);
  const commandName = parts[0].toLowerCase();

  // Commands that require root path as first argument
  const commandsRequiringRootPath = ['getworlds', 'addworld', 'updateworld'];

  if (commandsRequiringRootPath.includes(commandName)) {
    // Insert ROOT_PATH as first argument
    const args = parts.slice(1);
    return `/${commandName} ${ROOT_PATH} ${args.join(' ')}`.trim();
  }

  return message;
}

// Zod validation schema for WebSocket messages
const WebSocketMessageSchema = z.object({
  type: z.enum(["event", "subscribe", "unsubscribe", "system", "world", "message"]),
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

            // Check for command messages (starting with '/')
            if (eventMessage && eventMessage.trim().startsWith('/')) {
              const preparedCommand = prepareCommandWithRootPath(eventMessage.trim());
              const result = await executeCommand(preparedCommand, worldSocket.world, ws);

              // Send command result
              ws.send(JSON.stringify(result));

              // Refresh world if needed
              if (result.refreshWorld) {
                try {
                  const worldId = toKebabCase(worldName);
                  const refreshedWorld = await getWorld(ROOT_PATH, worldId);
                  if (refreshedWorld) {
                    // Clean up existing world subscription
                    await cleanupWorldSubscription(worldSocket);

                    // Attach refreshed world
                    worldSocket.world = refreshedWorld;
                    worldSocket.worldEventListeners = new Map();

                    // Set up event listeners
                    setupWorldEventListeners(worldSocket, refreshedWorld);

                    ws.send(JSON.stringify({
                      type: 'subscribed',
                      worldName,
                      timestamp: new Date().toISOString()
                    }));
                  }
                } catch (error) {
                  console.error('Failed to refresh world:', error);
                }
              }

              return;
            }

            // Normalize user senders to 'HUMAN' for public messages that agents should respond to
            const normalizedSender = sender && sender.startsWith('user') ? 'HUMAN' : (sender || 'HUMAN');
            eventMessage && publishMessage(worldSocket.world, eventMessage, normalizedSender);

            break;

          case 'system':
          case 'world':
            // Always call executeCommand for system and world event types
            const sysWorldSocket = ws as WorldSocket;
            if (!sysWorldSocket.world || sysWorldSocket.world.name !== worldName) {
              ws.send(JSON.stringify({
                type: 'error',
                error: `${type} event requires valid world subscription`
              }));
              return;
            }

            if (eventMessage && eventMessage.trim().startsWith('/')) {
              const preparedCommand = prepareCommandWithRootPath(eventMessage.trim());
              const result = await executeCommand(preparedCommand, sysWorldSocket.world, ws);

              // Send command result
              ws.send(JSON.stringify(result));

              // Refresh world if needed
              if (result.refreshWorld) {
                try {
                  const worldId = toKebabCase(worldName);
                  const refreshedWorld = await getWorld(ROOT_PATH, worldId);
                  if (refreshedWorld) {
                    // Clean up existing world subscription
                    await cleanupWorldSubscription(sysWorldSocket);

                    // Attach refreshed world
                    sysWorldSocket.world = refreshedWorld;
                    sysWorldSocket.worldEventListeners = new Map();

                    // Set up event listeners
                    setupWorldEventListeners(sysWorldSocket, refreshedWorld);
                  }
                } catch (error) {
                  console.error('Failed to refresh world:', error);
                }
              }
            } else {
              ws.send(JSON.stringify({
                type: 'error',
                error: `${type} event requires command message starting with '/'`
              }));
            }

            break;

          case 'message':
            // Handle message type: commands if starts with '/', otherwise publish to world
            const messageWorldSocket = ws as WorldSocket;
            if (!messageWorldSocket.world || messageWorldSocket.world.name !== worldName) {
              ws.send(JSON.stringify({
                type: 'error',
                error: 'Message event requires valid world subscription'
              }));
              return;
            }

            if (eventMessage && eventMessage.trim().startsWith('/')) {
              // Handle as command
              const preparedCommand = prepareCommandWithRootPath(eventMessage.trim());
              const result = await executeCommand(preparedCommand, messageWorldSocket.world, ws);

              // Send command result
              ws.send(JSON.stringify(result));

              // Refresh world if needed
              if (result.refreshWorld) {
                try {
                  const worldId = toKebabCase(worldName);
                  const refreshedWorld = await getWorld(ROOT_PATH, worldId);
                  if (refreshedWorld) {
                    // Clean up existing world subscription
                    await cleanupWorldSubscription(messageWorldSocket);

                    // Attach refreshed world
                    messageWorldSocket.world = refreshedWorld;
                    messageWorldSocket.worldEventListeners = new Map();

                    // Set up event listeners
                    setupWorldEventListeners(messageWorldSocket, refreshedWorld);
                  }
                } catch (error) {
                  console.error('Failed to refresh world:', error);
                }
              }
            } else {
              // Handle as regular message - publish to world
              const msgNormalizedSender = sender && sender.startsWith('user') ? 'HUMAN' : (sender || 'HUMAN');
              eventMessage && publishMessage(messageWorldSocket.world, eventMessage, msgNormalizedSender);
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
