/**
 * WebSocket Server for Agent World
 *
 * Features:
 * - Stateful WebSocket connection management per client
 * - World subscription lifecycle with event listener management
 * - Uses stateless event handlers from ws-events.ts for command processing
 * - Connection-specific world state and event listener cleanup
 * - World refresh logic after command execution with state updates
 * - Comprehensive debug logging with Pino for WebSocket operations
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
 * Logging:
 * - Uses Pino for structured logging with debug/info/warn/error levels
 * - Logs connection/disconnection events with client information
 * - Tracks message flow (incoming/outgoing) with data content
 * - Monitors world subscription lifecycle and event forwarding
 * - Pretty printing in development, JSON in production
 * - Configurable log level via LOG_LEVEL environment variable
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
 * - Added comprehensive Pino logging for WebSocket operations and debugging
 */

import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import pino from 'pino';
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
} from '../commands/events.js';

const ROOT_PATH = process.env.AGENT_WORLD_DATA_PATH || './data/worlds';

// Create logger instance for WebSocket operations
const logger = pino({
  name: 'websocket',
  level: process.env.LOG_LEVEL || 'debug',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  } : undefined
});

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
    send: (data: string) => {
      logger.debug({ data }, '[WS OUT]');
      ws.send(data);
    },
    isOpen: ws.readyState === ws.OPEN
  };
}

// Clean up world subscription and event listeners
async function cleanupWorldSubscription(ws: WorldSocket): Promise<void> {
  if (ws.world && ws.worldEventListeners) {
    logger.debug('Cleaning up world subscription', {
      world: ws.world.name,
      listenerCount: ws.worldEventListeners.size
    });

    // Remove all event listeners
    for (const [eventName, listener] of ws.worldEventListeners) {
      ws.world.eventEmitter.off(eventName, listener);
    }
    ws.worldEventListeners.clear();

    logger.debug('World subscription cleanup completed', { world: ws.world.name });
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

  logger.debug('Setting up world event listeners', { world: world.name });

  const client = createClientConnection(ws);

  // Generic handler that forwards events to client with filtering
  const handler = (eventType: string) => (eventData: any) => {
    // Skip echoing user messages back to client
    // Only forward agent responses, system messages, and SSE events
    if (eventData.sender && (eventData.sender === 'HUMAN' || eventData.sender.startsWith('user'))) {
      logger.debug('Skipping echo of user message', { eventType, sender: eventData.sender });
      return;
    }

    if (client.isOpen) {
      const eventPayload = {
        ...eventData,
        eventType
      };

      logger.debug({
        eventType,
        sender: eventData.sender,
        world: world.name,
        payload: eventPayload
      }, 'Forwarding world event to client');

      client.send(JSON.stringify(eventPayload));
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

  logger.info('World event listeners setup completed', {
    world: world.name,
    eventTypeCount: eventTypes.length
  });
}

// Refresh world subscription after command execution
async function refreshWorldSubscription(ws: WorldSocket, worldName: string): Promise<void> {
  try {
    logger.debug('Refreshing world subscription', { worldName });

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

      logger.info('World subscription refreshed successfully', { worldName, worldId });
    } else {
      logger.warn('Failed to load refreshed world', { worldName, worldId });
    }
  } catch (error) {
    logger.error('Failed to refresh world subscription', {
      worldName,
      error: error instanceof Error ? error.message : error
    });
  }
}

// Handle subscribe event
async function handleSubscribe(ws: WorldSocket, worldName: string): Promise<void> {
  const client = createClientConnection(ws);

  logger.debug('Handling world subscription', { worldName });

  // Load and attach world to client
  const worldId = toKebabCase(worldName);
  const world = await getWorld(ROOT_PATH, worldId);
  if (!world) {
    logger.warn('Failed to load world for subscription', { worldName, worldId });
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
  logger.info('World subscription successful', { worldName, worldId });
}

// Handle unsubscribe event
async function handleUnsubscribe(ws: WorldSocket): Promise<void> {
  const client = createClientConnection(ws);

  logger.debug('Handling world unsubscription', {
    currentWorld: ws.world?.name || 'none'
  });

  // Clean up world subscription
  await cleanupWorldSubscription(ws);

  sendSuccess(client, 'Successfully unsubscribed from world');
  logger.info('World unsubscription successful');
}

export function createWebSocketServer(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req) => {
    const clientAddress = req.socket.remoteAddress;
    logger.info('WebSocket client connected', { clientAddress });

    // Send connected message
    const connectMessage = JSON.stringify({
      type: 'connected',
      timestamp: new Date().toISOString()
    });
    logger.debug({ data: connectMessage }, '[WS OUT]');
    ws.send(connectMessage);

    ws.on('message', async (data: Buffer) => {
      try {
        const rawMessage = data.toString();
        logger.debug({ data: rawMessage }, '[WS IN]');

        const message = JSON.parse(rawMessage);
        const validation = FullMessageSchema.safeParse(message);

        if (!validation.success) {
          logger.warn('Invalid message format received', {
            errors: validation.error.issues,
            rawMessage
          });

          const errorMessage = JSON.stringify({
            type: 'error',
            error: 'Invalid message format',
            details: validation.error.issues
          });
          logger.debug({ data: errorMessage }, '[WS OUT]');
          ws.send(errorMessage);
          return;
        }

        const { type, payload } = validation.data;
        const { worldName, message: eventMessage, sender } = payload;
        const worldSocket = ws as WorldSocket;
        const client = createClientConnection(worldSocket);

        logger.debug('Processing WebSocket message', {
          type,
          worldName,
          hasMessage: !!eventMessage,
          sender,
          currentWorld: worldSocket.world?.name || 'none'
        });

        switch (type) {
          case 'subscribe':
            if (worldName) {
              logger.debug('Processing subscribe request', { worldName });
              await handleSubscribe(worldSocket, worldName);
            } else {
              logger.warn('Subscribe request missing worldName');
            }
            break;

          case 'unsubscribe':
            logger.debug('Processing unsubscribe request');
            await handleUnsubscribe(worldSocket);
            break;

          case 'system':
          case 'world':
            if (eventMessage && eventMessage.trim().startsWith('/')) {
              // Check if this is a global command that doesn't require world subscription
              const commandName = eventMessage.trim().slice(1).split(/\s+/)[0].toLowerCase();
              const globalCommands = ['getworlds', 'addworld'];

              logger.debug('Processing command', { type, commandName, isGlobal: globalCommands.includes(commandName) });

              if (globalCommands.includes(commandName)) {
                // Execute global command without world context
                logger.debug('Executing global command', { commandName });
                const result = await handleCommand(null, eventMessage, ROOT_PATH);
                sendCommandResult(client, result);
              } else {
                // Regular world-specific command - requires world subscription
                if (worldName && worldSocket.world) {
                  if (worldSocket.world.name !== worldName) {
                    logger.warn('World name mismatch', {
                      requestedWorld: worldName,
                      subscribedWorld: worldSocket.world.name
                    });
                    sendError(client, `${type} event requires valid world subscription`);
                    break;
                  }

                  logger.debug('Executing world command', { commandName, world: worldName });
                  const result = await handleCommand(worldSocket.world, eventMessage, ROOT_PATH);
                  sendCommandResult(client, result);

                  // Refresh world if needed
                  if (result.refreshWorld) {
                    logger.debug('Refreshing world after command', { commandName, world: worldName });
                    await refreshWorldSubscription(worldSocket, worldName);
                  }
                } else {
                  logger.warn('Command requires world subscription', {
                    commandName,
                    hasWorldName: !!worldName,
                    hasWorldSubscription: !!worldSocket.world
                  });
                  sendError(client, `${type} event requires valid world subscription for command: ${commandName}`);
                }
              }
            } else {
              logger.warn('System/World event requires command', { type, hasMessage: !!eventMessage });
              sendError(client, `${type} event requires command message starting with '/'`);
            }
            break;

          case 'message':
            if (worldName && eventMessage && worldSocket.world) {
              if (worldSocket.world.name !== worldName) {
                logger.warn('Message event world mismatch', {
                  requestedWorld: worldName,
                  subscribedWorld: worldSocket.world.name
                });
                sendError(client, 'Message event requires valid world subscription');
                break;
              }

              if (eventMessage.trim().startsWith('/')) {
                // Handle as command
                logger.debug('Processing message as command', { world: worldName });
                const result = await handleCommand(worldSocket.world, eventMessage, ROOT_PATH);
                sendCommandResult(client, result);

                // Refresh world if needed
                if (result.refreshWorld) {
                  await refreshWorldSubscription(worldSocket, worldName);
                }
              } else {
                // Handle as regular message - publish to world
                logger.debug('Publishing message to world', {
                  world: worldName,
                  sender: sender || 'unknown'
                });
                handleMessagePublish(worldSocket.world, eventMessage, sender);
              }
            } else {
              logger.warn('Message event missing requirements', {
                hasWorldName: !!worldName,
                hasMessage: !!eventMessage,
                hasWorldSubscription: !!worldSocket.world
              });
            }
            break;

          default:
            logger.warn('Unknown message type received', { type });
            const unknownTypeMessage = JSON.stringify({
              type: 'error',
              error: 'Unknown message type'
            });
            logger.debug({ data: unknownTypeMessage }, '[WS OUT]');
            ws.send(unknownTypeMessage);
        }
      } catch (error) {
        logger.error('WebSocket message processing error', {
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined
        });

        const errorMessage = JSON.stringify({
          type: 'error',
          error: 'Failed to process message'
        });
        logger.debug({ data: errorMessage }, '[WS OUT]');
        ws.send(errorMessage);
      }
    });

    ws.on('close', async () => {
      logger.info('WebSocket client disconnected', { clientAddress });
      // Clean up world subscription on disconnect
      await cleanupWorldSubscription(ws as WorldSocket);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket connection error', {
        clientAddress,
        error: error instanceof Error ? error.message : error
      });
    });
  });

  return wss;
}
