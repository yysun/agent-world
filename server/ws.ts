/**
 * WebSocket Server for Agent World
 * 
 * Features:
 * - Real-time WebSocket communication using core modules
 * - Connection management for WebSocket clients
 * - Real-time event broadcasting to WebSocket clients
 * - Message validation with Zod schemas
 * - World subscription management with new core architecture
 * 
 * WebSocket Events:
 * - subscribe: Subscribe to world events (checks world existence)
 * - unsubscribe: Unsubscribe from world events
 * - event: Send message to world using publishMessage
 * - welcome: Connection confirmation
 * - subscribed: Subscription confirmation
 * - unsubscribed: Unsubscription confirmation
 * - error: Error messages
 * 
 * Migration Changes:
 * - Updated to use core/ modules instead of src/
 * - Uses listWorlds() and getWorld() from world-manager
 * - Converts worldName to worldId using toKebabCase
 * - Uses publishMessage from world-events for messaging
 * - Removed dependency on legacy loadWorld and broadcastMessage functions
 */

import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { World } from '../core/types.js';

import { z } from 'zod';
import { listWorlds, getWorld, WorldInfo } from '../core/world-manager.js';
import { loadAllWorldsFromDisk } from '../core/world-storage.js';
import { publishMessage } from '../core/world-events.js';
import { toKebabCase } from '../core/utils.js';

// Zod validation schema for WebSocket messages
const WebSocketMessageSchema = z.object({
  type: z.enum(["event", "subscribe", "unsubscribe"]),
  payload: z.object({
    worldName: z.string().optional(),
    message: z.string().optional(),
    sender: z.string().optional()
  })
});

let wss: WebSocketServer;

export function getWebSocketStats() {
  return {
    connectedClients: wss?.clients?.size,
    isRunning: !!wss
  };
}
interface WorldSocket extends WebSocket {
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
              // Check if world exists
              const availableWorlds = await listWorlds();
              const worldExists = availableWorlds.some(world => world.name === worldName);
              if (!worldExists) {
                ws.send(JSON.stringify({
                  type: 'error',
                  error: 'World not found'
                }));
                return;
              }

              ws.send(JSON.stringify({
                type: 'subscribed',
                worldName,
                timestamp: new Date().toISOString()
              }));
            }
            break;

          case 'unsubscribe':

            ws.send(JSON.stringify({
              type: 'unsubscribed',
              timestamp: new Date().toISOString()
            }));
            break;

          case 'event':
            if (!worldName || !eventMessage) {
              ws.send(JSON.stringify({
                type: 'error',
                error: 'Event requires worldName and message'
              }));
              return;
            }

            // Check if world exists
            const availableWorlds = await listWorlds();
            const worldExists = availableWorlds.some(world => world.name === worldName);
            if (!worldExists) {
              ws.send(JSON.stringify({
                type: 'error',
                error: 'World not found'
              }));
              return;
            }

            // Get world and send message
            const worldId = toKebabCase(worldName);
            const world = await getWorld(worldId);
            if (!world) {
              ws.send(JSON.stringify({
                type: 'error',
                error: 'Failed to load world'
              }));
              return;
            }

            // Send message to world
            publishMessage(world, eventMessage, sender || 'HUMAN');
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
      console.log(`WebSocket client disconnected`);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error`, error);
    });
  });

  return wss;
}
