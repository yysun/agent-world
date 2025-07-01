/**
 * WebSocket Server for Agent World
 *
 * Features:
 * - Real-time WebSocket communication using transport-agnostic event handling
 * - Delegates all event handling logic to ws-events.ts module
 * - WebSocket adapter that implements ClientConnection interface
 * - Simple message routing to event handlers with proper error handling
 * - Connection lifecycle management with automatic cleanup
 *
 * WebSocket Events:
 * - All event types handled by ws-events.ts module
 * - subscribe: Subscribe to world events
 * - unsubscribe: Unsubscribe from world events  
 * - event: Send message or execute commands
 * - system: Execute commands only
 * - world: Execute commands only
 * - message: Execute commands or publish messages
 *
 * Architecture:
 * - Uses ws-events.ts for transport-agnostic event handling
 * - ClientConnection adapter bridges WebSocket and generic interface
 * - Minimal WebSocket-specific code focused on connection management
 * - Event handlers manage world objects and command execution
 * - Automatic world state synchronization between client and WebSocket
 *
 * Changes:
 * - Extracted all event handling logic to ws-events.ts
 * - Simplified to use transport-agnostic event handlers
 * - Removed duplicate validation, command handling, and world management
 * - Added ClientConnection adapter for WebSocket compatibility
 * - Maintained backward compatibility with existing WebSocket API
 */

import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { World } from '../core/types.js';

import {
  MessageSchema,
  handleSubscribe,
  handleUnsubscribe,
  handleEvent,
  handleSystemOrWorld,
  handleMessage,
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

// Adapter to make WebSocket compatible with ClientConnection interface
function createClientConnection(ws: WorldSocket): ClientConnection {
  return {
    send: (data: string) => ws.send(data),
    isOpen: ws.readyState === ws.OPEN,
    world: ws.world,
    worldEventListeners: ws.worldEventListeners
  };
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
        const validation = MessageSchema.safeParse(message);

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
        const client = createClientConnection(ws as WorldSocket);

        switch (type) {
          case 'subscribe':
            if (worldName) {
              await handleSubscribe(client, worldName);
              // Update the WebSocket with the attached world
              (ws as WorldSocket).world = client.world;
              (ws as WorldSocket).worldEventListeners = client.worldEventListeners;
            }
            break;

          case 'unsubscribe':
            await handleUnsubscribe(client);
            // Clear the WebSocket references
            (ws as WorldSocket).world = client.world;
            (ws as WorldSocket).worldEventListeners = client.worldEventListeners;
            break;

          case 'event':
            if (worldName && eventMessage) {
              await handleEvent(client, worldName, eventMessage, sender);
              // Update the WebSocket with any world changes
              (ws as WorldSocket).world = client.world;
              (ws as WorldSocket).worldEventListeners = client.worldEventListeners;
            }
            break;

          case 'system':
          case 'world':
            if (worldName && eventMessage) {
              await handleSystemOrWorld(client, type, worldName, eventMessage);
              // Update the WebSocket with any world changes
              (ws as WorldSocket).world = client.world;
              (ws as WorldSocket).worldEventListeners = client.worldEventListeners;
            }
            break;

          case 'message':
            if (worldName && eventMessage) {
              await handleMessage(client, worldName, eventMessage, sender);
              // Update the WebSocket with any world changes
              (ws as WorldSocket).world = client.world;
              (ws as WorldSocket).worldEventListeners = client.worldEventListeners;
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
      const client = createClientConnection(ws as WorldSocket);
      await handleUnsubscribe(client);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error`, error);
    });
  });

  return wss;
}
