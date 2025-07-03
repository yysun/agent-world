/**
 * WebSocket Server for Agent World
 *
 * Features:
 * - Stateful WebSocket connection management per client
 * - World subscription lifecycle with centralized commands layer integration
 * - Typed command system with request/response tracking
 * - Connection-specific world state and event listener cleanup
 * - World refresh logic after command execution with state updates
 * - Comprehensive debug logging with Pino for WebSocket operations
 *
 * WebSocket Connection State:
 * - World subscription per connection using commands layer subscribeWorld()
 * - Automatic cleanup on disconnect to prevent memory leaks
 * - World refresh and re-subscription after modifications
 * - No direct core layer calls - all through commands layer
 *
 * WebSocket Events:
 * - subscribe: Use commands layer subscribeWorld() with ClientConnection
 * - unsubscribe: Clean up world subscription through commands layer
 * - system: Process typed commands with request/response tracking
 * - world: Global and world-specific typed commands
 * - message: User messages published to world event system
 *
 * Typed Command System:
 * - Legacy command string parsing to typed CommandRequest objects
 * - Time-based request ID generation for tracking
 * - Structured CommandResponse with success/error handling
 * - Type-safe command parameters replacing unsafe args arrays
 * - Request/response correlation via WebSocket command-response events
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
 * - ws.ts: Manages stateful connection and implements ClientConnection interface
 * - commands/commands.ts: Provides typed command processing with request/response
 * - commands/types.ts: Defines typed command unions and interfaces
 * - commands/events.ts: Provides centralized world subscription and event handling
 * - Clear separation between transport state and business logic
 * - Per-connection world state with proper cleanup through commands layer
 *
 * Changes:
 * - Integrated typed command system with CommandRequest/CommandResponse
 * - Replaced unsafe args array processing with structured parameters
 * - Added legacy command string parsing to typed requests
 * - Implemented request/response tracking with time-based IDs
 * - Enhanced error handling with typed responses
 * - Maintained backward compatibility with existing WebSocket protocol
 */

import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import pino from 'pino';
import { World, LLMProvider } from '../core/types.js';

import {
  sendSuccess,
  sendError,
  sendCommandResult,
  ClientConnection,
  subscribeWorld,
  getWorld,
  SimpleCommandResponse,
  generateRequestId,
  processWSCommand
} from '../commands/subscription.js';
import {
  listWorlds,
  getWorld as getCoreWorld,
  createWorld,
  updateWorld
} from '../core/world-manager.js';
import { toKebabCase } from '../core/utils.js';

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
  subscription?: any; // WorldSubscription from commands layer
  world?: World;
}

// Full message schema including subscribe/unsubscribe and command-request/command-response
const FullMessageSchema = z.object({
  type: z.enum(["subscribe", "unsubscribe", "system", "world", "message"]),
  payload: z.object({
    worldName: z.string().optional(),
    message: z.string().optional(),
    sender: z.string().optional(),
    eventType: z.string().optional(),
    request: z.any().optional(), // CommandRequest for command-request
    response: z.any().optional() // CommandResponse for command-response  
  })
});

// Adapter to make WebSocket compatible with ClientConnection interface
function createClientConnection(ws: WorldSocket): ClientConnection {
  return {
    send: (data: string) => {
      logger.debug({ data }, '[WS OUT]');
      ws.send(data);
    },
    isOpen: ws.readyState === ws.OPEN,
    onWorldEvent: (eventType: string, eventData: any) => {
      // Skip echoing user messages back to client
      // Only forward agent responses, system messages, and SSE events
      if (eventData.sender && (eventData.sender === 'HUMAN' || eventData.sender.startsWith('user'))) {
        logger.debug('Skipping echo of user message', { eventType, sender: eventData.sender });
        return;
      }

      if (ws.readyState === ws.OPEN) {
        const eventPayload = {
          ...eventData,
          eventType
        };

        logger.debug({
          eventType,
          sender: eventData.sender,
          world: ws.world?.name,
          payload: eventPayload
        }, 'Forwarding world event to client');

        const message = JSON.stringify(eventPayload);
        logger.debug({ data: message }, '[WS OUT]');
        ws.send(message);
      }
    },
    onError: (error: string) => {
      logger.error('World subscription error', { error });
      if (ws.readyState === ws.OPEN) {
        const errorMessage = JSON.stringify({
          type: 'error',
          error: error,
          timestamp: new Date().toISOString()
        });
        logger.debug({ data: errorMessage }, '[WS OUT]');
        ws.send(errorMessage);
      }
    }
  };
}

// Helper function to send command response via WebSocket
function sendCommandResponse(client: ClientConnection, response: SimpleCommandResponse): void {
  const message = {
    type: 'system',
    payload: {
      eventType: 'command-response',
      response
    }
  };
  client.send(JSON.stringify(message));
}

// Helper function to parse legacy command string to typed request
function parseCommandToRequest(commandString: string, worldName?: string): any {
  const trimmed = commandString.trim();
  if (!trimmed.startsWith('/')) return null;

  const parts = trimmed.slice(1).split(/\s+/);
  const commandType = parts[0].toLowerCase();
  const args = parts.slice(1);

  const requestId = generateRequestId();
  const timestamp = new Date().toISOString();

  switch (commandType) {
    case 'getworlds':
      return {
        id: requestId,
        type: 'getWorlds',
        timestamp
      };

    case 'getworld':
      if (!worldName) return null;
      return {
        id: requestId,
        type: 'getWorld',
        worldName,
        timestamp
      };

    case 'createworld':
    case 'addworld':
      if (args.length === 0) return null;
      return {
        id: requestId,
        type: 'createWorld',
        name: args[0],
        description: args.slice(1).join(' ') || undefined,
        timestamp
      };

    case 'updateworld':
      if (!worldName || args.length < 2) return null;
      const updateType = args[0].toLowerCase();
      const updateValue = args.slice(1).join(' ');

      let updates: any = {};
      if (updateType === 'name') updates.name = updateValue;
      else if (updateType === 'description') updates.description = updateValue;
      else if (updateType === 'turnlimit') updates.turnLimit = parseInt(updateValue);
      else return null;

      return {
        id: requestId,
        type: 'updateWorld',
        worldName,
        updates,
        timestamp
      };

    case 'createagent':
    case 'addagent':
      if (!worldName || args.length === 0) return null;
      return {
        id: requestId,
        type: 'createAgent',
        worldName,
        name: args[0],
        description: args.slice(1).join(' ') || undefined,
        timestamp
      };

    case 'updateagentconfig':
      if (!worldName || args.length < 3) return null;
      const agentName = args[0];
      const configType = args[1].toLowerCase();
      const configValue = args[2];

      let config: any = {};
      if (configType === 'model') config.model = configValue;
      else if (configType === 'provider') config.provider = configValue;
      else if (configType === 'status') config.status = configValue;
      else return null;

      return {
        id: requestId,
        type: 'updateAgentConfig',
        worldName,
        agentName,
        config,
        timestamp
      };

    case 'updateagentprompt':
      if (!worldName || args.length < 2) return null;
      return {
        id: requestId,
        type: 'updateAgentPrompt',
        worldName,
        agentName: args[0],
        systemPrompt: args.slice(1).join(' '),
        timestamp
      };

    case 'updateagentmemory':
      if (!worldName || args.length < 2) return null;
      const agentNameMem = args[0];
      const action = args[1].toLowerCase();

      if (action === 'clear') {
        return {
          id: requestId,
          type: 'updateAgentMemory',
          worldName,
          agentName: agentNameMem,
          action: 'clear',
          timestamp
        };
      } else if (action === 'add' && args.length >= 4) {
        const role = args[2].toLowerCase() as 'user' | 'assistant' | 'system';
        const content = args.slice(3).join(' ');
        return {
          id: requestId,
          type: 'updateAgentMemory',
          worldName,
          agentName: agentNameMem,
          action: 'add',
          message: { role, content },
          timestamp
        };
      }
      return null;

    case 'clear':
    case 'clearagentmemory':
      if (!worldName) return null;
      return {
        id: requestId,
        type: 'clearAgentMemory',
        worldName,
        agentName: args.length > 0 ? args[0] : undefined,
        timestamp
      };

    default:
      return null;
  }
}

// Clean up world subscription and event listeners
async function cleanupWorldSubscription(ws: WorldSocket): Promise<void> {
  if (ws.subscription) {
    logger.debug('Cleaning up world subscription', {
      world: ws.world?.name
    });

    await ws.subscription.unsubscribe();
    logger.debug('World subscription cleanup completed', { world: ws.world?.name });
  }

  // Clear world reference
  ws.world = undefined;
  ws.subscription = undefined;
}

// World event listeners now handled in commands layer
// Legacy function removed - logic moved to commands/events.ts

// Refresh world subscription after command execution
async function refreshWorldSubscription(ws: WorldSocket, worldName: string): Promise<void> {
  try {
    logger.debug('Refreshing world subscription', { worldName });

    // Clean up existing world subscription
    await cleanupWorldSubscription(ws);

    // Create WebSocket client connection
    const client = createClientConnection(ws);

    // Re-subscribe using commands layer
    const subscription = await subscribeWorld(worldName, ROOT_PATH, client);
    if (subscription) {
      ws.subscription = subscription;
      ws.world = subscription.world;

      sendSuccess(client, 'World subscription refreshed', { worldName });
      logger.info('World subscription refreshed successfully', { worldName });
    } else {
      logger.warn('Failed to load refreshed world', { worldName });
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

  // Clean up existing world subscription if any
  await cleanupWorldSubscription(ws);

  // Subscribe using commands layer
  const subscription = await subscribeWorld(worldName, ROOT_PATH, client);
  if (subscription) {
    ws.subscription = subscription;
    ws.world = subscription.world;

    sendSuccess(client, 'Successfully subscribed to world', { worldName });
    logger.info('World subscription successful', { worldName });
  } else {
    logger.warn('Failed to load world for subscription', { worldName });
    sendError(client, 'Failed to load world');
  }
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
        const { worldName, message: eventMessage, sender, eventType, request } = payload;
        const worldSocket = ws as WorldSocket;
        const client = createClientConnection(worldSocket);

        logger.debug('Processing WebSocket message', {
          type,
          worldName,
          hasMessage: !!eventMessage,
          hasRequest: !!request,
          eventType,
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
            // Handle both new typed command system and legacy string commands
            if (eventType === 'command-request' && request) {
              // New typed command system
              logger.debug('Processing typed command request', {
                commandType: request.type,
                requestId: request.id
              });

              const response = await processWSCommand(request.type, request, worldSocket.world || null, ROOT_PATH);
              sendCommandResponse(client, response);

              // Refresh world if needed for world-specific commands
              if (response.success && worldName && response.type && ['updateWorld', 'createAgent', 'updateAgentConfig', 'updateAgentPrompt', 'updateAgentMemory', 'clearAgentMemory'].includes(response.type)) {
                logger.debug('Refreshing world after typed command', { commandType: request.type, world: worldName });
                await refreshWorldSubscription(worldSocket, worldName);
              }
            } else if (eventMessage && eventMessage.trim().startsWith('/')) {
              // Legacy string command system (for backward compatibility)
              logger.debug('Processing legacy system command', { eventMessage });

              // Special handling for getWorld command - add worldName from payload  
              let processedMessage = eventMessage;
              const commandName = eventMessage.trim().slice(1).split(/\s+/)[0].toLowerCase();
              if (commandName === 'getworld' && worldName) {
                processedMessage = `/getWorld ${worldName}`;
                logger.debug('Modified getWorld command', { original: eventMessage, modified: processedMessage });
              }

              // Convert legacy command to typed request
              const legacyRequest = parseCommandToRequest(processedMessage, worldName);
              if (legacyRequest) {
                const response = await processWSCommand(legacyRequest.type, legacyRequest, worldSocket.world || null, ROOT_PATH);
                sendCommandResponse(client, response);

                // Refresh world if needed for world-specific commands
                if (response.success && worldName && response.type && ['updateWorld', 'createAgent', 'updateAgentConfig', 'updateAgentPrompt', 'updateAgentMemory', 'clearAgentMemory'].includes(response.type)) {
                  logger.debug('Refreshing world after legacy command', { commandName, world: worldName });
                  await refreshWorldSubscription(worldSocket, worldName);
                }
              } else {
                sendError(client, `Failed to parse legacy system command: ${eventMessage}`);
              }
            } else {
              logger.warn('System event requires either command-request or command message starting with /', {
                hasMessage: !!eventMessage,
                hasRequest: !!request,
                eventType
              });
              sendError(client, 'System events require either command-request with request object or command message starting with /');
            }
            break;

          case 'world':
            if (eventMessage && eventMessage.trim().startsWith('/')) {
              // World events require world subscription for non-global commands
              const commandName = eventMessage.trim().slice(1).split(/\s+/)[0].toLowerCase();
              const globalCommands = ['getworlds', 'addworld', 'getworld'];

              if (globalCommands.includes(commandName)) {
                // Global commands can be executed without world subscription
                logger.debug('Processing global command via world event', { commandName });

                let processedMessage = eventMessage;
                if (commandName === 'getworld' && worldName) {
                  processedMessage = `/getWorld ${worldName}`;
                  logger.debug('Modified getWorld command', { original: eventMessage, modified: processedMessage });
                }

                // Convert legacy command to typed request
                const request = parseCommandToRequest(processedMessage, worldName);
                if (request) {
                  const response = await processWSCommand(request.type, request, null, ROOT_PATH);
                  sendCommandResponse(client, response);
                } else {
                  sendError(client, `Failed to parse world command: ${eventMessage}`);
                }
              } else {
                // World-specific commands require world subscription
                if (worldName && worldSocket.world) {
                  if (worldSocket.world.name !== worldName) {
                    logger.warn('World name mismatch', {
                      requestedWorld: worldName,
                      subscribedWorld: worldSocket.world.name
                    });
                    sendError(client, 'World event requires valid world subscription');
                    break;
                  }

                  logger.debug('Processing world-specific command', { commandName, world: worldName });

                  // Convert legacy command to typed request
                  const request = parseCommandToRequest(eventMessage, worldName);
                  if (request) {
                    const response = await processWSCommand(request.type, request, worldSocket.world, ROOT_PATH);
                    sendCommandResponse(client, response);

                    // Refresh world if needed
                    if (response.success && response.type && ['updateWorld', 'createAgent', 'updateAgentConfig', 'updateAgentPrompt', 'updateAgentMemory', 'clearAgentMemory'].includes(response.type)) {
                      logger.debug('Refreshing world after world command', { commandName, world: worldName });
                      await refreshWorldSubscription(worldSocket, worldName);
                    }
                  } else {
                    sendError(client, `Failed to parse world command: ${eventMessage}`);
                  }
                } else {
                  logger.warn('World command requires world subscription', {
                    commandName,
                    hasWorldName: !!worldName,
                    hasWorldSubscription: !!worldSocket.world
                  });
                  sendError(client, `World event requires valid world subscription for command: ${commandName}`);
                }
              }
            } else {
              logger.warn('World event requires command', { hasMessage: !!eventMessage });
              sendError(client, 'World events require command message starting with /');
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

              // Message events cannot contain commands - this is the breaking change
              if (eventMessage.trim().startsWith('/')) {
                logger.warn('Message event contains invalid command', {
                  message: eventMessage,
                  world: worldName
                });
                sendError(client, 'Message events cannot contain commands. Use system events for commands.');
                break;
              }

              // Process as user message only
              logger.debug('Processing user message', {
                world: worldName,
                sender: sender || 'WebSocket',
                messageLength: eventMessage.length
              });

              // User messages are published to the world, not processed as commands
              try {
                if (!worldSocket.world.eventEmitter) {
                  sendError(client, 'World eventEmitter not initialized');
                  break;
                }

                // Publish message to world
                worldSocket.world.eventEmitter.emit('new-message', {
                  content: eventMessage,
                  sender: sender || 'WebSocket',
                  timestamp: new Date(),
                  metadata: { source: 'websocket' }
                });

                // Send success confirmation but don't echo the message back
                logger.debug('Message published to world successfully', { world: worldName });
              } catch (error) {
                logger.error('Failed to publish message to world', {
                  error: error instanceof Error ? error.message : error,
                  world: worldName
                });
                sendError(client, 'Failed to send message to world');
              }
            } else {
              logger.warn('Message event missing requirements', {
                hasWorldName: !!worldName,
                hasMessage: !!eventMessage,
                hasWorldSubscription: !!worldSocket.world,
                worldName,
                messageLength: eventMessage?.length || 0,
                currentWorldName: worldSocket.world?.name || 'none'
              });
              sendError(client, 'Message event requires world subscription and message content');
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
