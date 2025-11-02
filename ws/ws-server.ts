/**
 * WebSocket Server - Async World Processing
 * 
 * Purpose: WebSocket server for handling async agent message processing with real-time updates
 * 
 * Features:
 * - WebSocket connections per world with authentication
 * - Real-time event streaming using event sequences
 * - Message queue integration for async processing
 * - Heartbeat monitoring and automatic reconnection
 * - Per-world client management
 * - Structured logging with ws.server category
 * 
 * Implementation:
 * - Express HTTP server with WebSocket upgrade
 * - ws library for WebSocket handling
 * - Event-driven architecture with EventStorage integration
 * - Queue-based message processing with status updates
 * - Pino-based structured logging
 * 
 * Changes:
 * - 2025-11-01: Initial WebSocket server implementation
 * - 2025-11-01: Replace console.log with structured logger
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { createCategoryLogger } from '../core/logger.js';
import type { EventStorage } from '../core/storage/eventStorage/types.js';
import type { QueueStorage } from '../core/storage/queue-storage.js';

const logger = createCategoryLogger('ws.server');

/**
 * WebSocket message types
 */
export type WSMessageType =
  | 'subscribe'      // Client subscribes to world events
  | 'unsubscribe'    // Client unsubscribes from world
  | 'message'        // Client sends message to world
  | 'event'          // Server sends event update to client
  | 'status'         // Server sends processing status update
  | 'error'          // Server sends error message
  | 'ping'           // Heartbeat ping
  | 'pong';          // Heartbeat pong

/**
 * WebSocket message structure
 */
export interface WSMessage {
  type: WSMessageType;
  worldId?: string;
  chatId?: string;
  messageId?: string;
  seq?: number;
  payload?: any;
  error?: string;
  timestamp?: number;
}

/**
 * Client connection info
 */
interface ClientConnection {
  ws: WebSocket;
  worldId: string | null;
  chatId: string | null;
  lastHeartbeat: number;
  subscribedSeq: number; // Last sequence number client has received
}

/**
 * WebSocket server configuration
 */
export interface WSServerConfig {
  port: number;
  eventStorage: EventStorage;
  queueStorage: QueueStorage;
  heartbeatInterval?: number; // ms between heartbeats (default 30000)
  heartbeatTimeout?: number;  // ms before considering client dead (default 60000)
}

/**
 * WebSocket server for async world processing
 */
export class AgentWorldWSServer {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private clients: Map<WebSocket, ClientConnection> = new Map();
  private worldSubscriptions: Map<string, Set<WebSocket>> = new Map();
  private config: Required<WSServerConfig>;
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(config: WSServerConfig) {
    this.config = {
      ...config,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      heartbeatTimeout: config.heartbeatTimeout ?? 60000
    };

    // Create Express app
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        connections: this.clients.size,
        worlds: this.worldSubscriptions.size
      });
    });

    // Create HTTP server
    this.server = createServer(this.app);

    // Create WebSocket server
    this.wss = new WebSocketServer({ server: this.server });
    this.setupWebSocketHandlers();
    this.startHeartbeat();
  }

  /**
   * Setup WebSocket connection handlers
   */
  private setupWebSocketHandlers(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      logger.debug('New WebSocket connection');

      // Initialize client connection
      const client: ClientConnection = {
        ws,
        worldId: null,
        chatId: null,
        lastHeartbeat: Date.now(),
        subscribedSeq: 0
      };
      this.clients.set(ws, client);

      // Handle incoming messages
      ws.on('message', async (data: Buffer) => {
        try {
          const message: WSMessage = JSON.parse(data.toString());
          await this.handleClientMessage(ws, message);
        } catch (error) {
          this.sendError(ws, 'Invalid message format');
        }
      });

      // Handle connection close
      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      // Handle errors
      ws.on('error', (error: Error) => {
        logger.error('WebSocket error:', error);
        this.handleDisconnect(ws);
      });
    });
  }

  /**
   * Handle incoming client message
   */
  private async handleClientMessage(ws: WebSocket, message: WSMessage): Promise<void> {
    const client = this.clients.get(ws);
    if (!client) return;

    switch (message.type) {
      case 'subscribe':
        await this.handleSubscribe(ws, message);
        break;

      case 'unsubscribe':
        this.handleUnsubscribe(ws, message);
        break;

      case 'message':
        await this.handleMessage(ws, message);
        break;

      case 'ping':
        client.lastHeartbeat = Date.now();
        this.send(ws, { type: 'pong', timestamp: Date.now() });
        break;

      default:
        this.sendError(ws, `Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle subscribe request
   */
  private async handleSubscribe(ws: WebSocket, message: WSMessage): Promise<void> {
    const client = this.clients.get(ws);
    if (!client || !message.worldId) {
      this.sendError(ws, 'Invalid subscribe request');
      return;
    }

    // Update client info
    client.worldId = message.worldId;
    client.chatId = message.chatId ?? null;

    // Get latest sequence number for this world/chat
    const latestSeq = await this.config.eventStorage.getLatestSeq(
      message.worldId,
      message.chatId ?? null
    );
    client.subscribedSeq = message.seq ?? latestSeq;

    // Add to world subscriptions
    if (!this.worldSubscriptions.has(message.worldId)) {
      this.worldSubscriptions.set(message.worldId, new Set());
    }
    this.worldSubscriptions.get(message.worldId)!.add(ws);

    // Send subscription confirmation
    this.send(ws, {
      type: 'status',
      worldId: message.worldId,
      chatId: client.chatId ?? undefined,
      payload: {
        status: 'subscribed',
        seq: client.subscribedSeq
      },
      timestamp: Date.now()
    });

    // Send any missed events if client provided a seq number
    if (message.seq !== undefined && message.seq < latestSeq) {
      await this.sendMissedEvents(ws, message.worldId, message.chatId ?? null, message.seq, latestSeq);
    }

    logger.info(`Client subscribed to world: ${message.worldId}, chat: ${message.chatId ?? 'all'}, seq: ${client.subscribedSeq}`);
  }

  /**
   * Send events that client missed (for reconnection)
   */
  private async sendMissedEvents(
    ws: WebSocket,
    worldId: string,
    chatId: string | null,
    fromSeq: number,
    toSeq: number
  ): Promise<void> {
    try {
      const events = await this.config.eventStorage.getEventRange(worldId, chatId, fromSeq, toSeq);

      for (const event of events) {
        this.send(ws, {
          type: 'event',
          worldId: event.worldId,
          chatId: event.chatId ?? undefined,
          seq: event.seq ?? undefined,
          payload: {
            id: event.id,
            type: event.type,
            payload: event.payload,
            meta: event.meta,
            createdAt: event.createdAt
          },
          timestamp: Date.now()
        });
      }

      logger.info(`Sent ${events.length} missed events to client (seq ${fromSeq}-${toSeq})`);
    } catch (error) {
      logger.error('Error sending missed events:', error);
      this.sendError(ws, 'Failed to retrieve missed events');
    }
  }

  /**
   * Handle unsubscribe request
   */
  private handleUnsubscribe(ws: WebSocket, message: WSMessage): void {
    const client = this.clients.get(ws);
    if (!client || !client.worldId) return;

    // Remove from world subscriptions
    const subscribers = this.worldSubscriptions.get(client.worldId);
    if (subscribers) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        this.worldSubscriptions.delete(client.worldId);
      }
    }

    // Clear client world info
    client.worldId = null;
    client.chatId = null;

    this.send(ws, {
      type: 'status',
      payload: { status: 'unsubscribed' },
      timestamp: Date.now()
    });

    logger.debug('Client unsubscribed');
  }

  /**
   * Handle incoming message from client
   */
  private async handleMessage(ws: WebSocket, message: WSMessage): Promise<void> {
    const client = this.clients.get(ws);
    if (!client || !message.worldId || !message.messageId) {
      this.sendError(ws, 'Invalid message request');
      return;
    }

    try {
      // Enqueue message for processing
      await this.config.queueStorage.enqueue({
        worldId: message.worldId,
        messageId: message.messageId,
        content: message.payload?.content ?? '',
        sender: message.payload?.sender ?? 'human',
        chatId: message.chatId,
        priority: message.payload?.priority ?? 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      // Send acknowledgment
      this.send(ws, {
        type: 'status',
        worldId: message.worldId,
        messageId: message.messageId,
        payload: { status: 'queued' },
        timestamp: Date.now()
      });

      logger.info(`Message queued: ${message.messageId} for world: ${message.worldId}`);
    } catch (error) {
      logger.error('Error enqueueing message:', error);
      this.sendError(ws, 'Failed to queue message');
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (client && client.worldId) {
      const subscribers = this.worldSubscriptions.get(client.worldId);
      if (subscribers) {
        subscribers.delete(ws);
        if (subscribers.size === 0) {
          this.worldSubscriptions.delete(client.worldId);
        }
      }
    }

    this.clients.delete(ws);
    logger.debug('Client disconnected');
  }

  /**
   * Send message to client
   */
  private send(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send error to client
   */
  private sendError(ws: WebSocket, error: string): void {
    this.send(ws, {
      type: 'error',
      error,
      timestamp: Date.now()
    });
  }

  /**
   * Broadcast event to all subscribers of a world
   */
  public broadcastEvent(worldId: string, chatId: string | null, event: any): void {
    const subscribers = this.worldSubscriptions.get(worldId);
    if (!subscribers || subscribers.size === 0) return;

    const message: WSMessage = {
      type: 'event',
      worldId,
      chatId: chatId ?? undefined,
      seq: event.seq ?? undefined,
      payload: {
        id: event.id,
        type: event.type,
        payload: event.payload,
        meta: event.meta,
        createdAt: event.createdAt
      },
      timestamp: Date.now()
    };

    for (const ws of subscribers) {
      const client = this.clients.get(ws);
      if (client && (!chatId || !client.chatId || client.chatId === chatId)) {
        this.send(ws, message);
        if (event.seq) {
          client.subscribedSeq = event.seq;
        }
      }
    }
  }

  /**
   * Broadcast processing status update
   */
  public broadcastStatus(worldId: string, messageId: string, status: string, error?: string): void {
    const subscribers = this.worldSubscriptions.get(worldId);
    if (!subscribers || subscribers.size === 0) return;

    const message: WSMessage = {
      type: 'status',
      worldId,
      messageId,
      payload: { status, error },
      timestamp: Date.now()
    };

    for (const ws of subscribers) {
      this.send(ws, message);
    }
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();

      for (const [ws, client] of this.clients.entries()) {
        // Check if client is still alive
        if (now - client.lastHeartbeat > this.config.heartbeatTimeout) {
          logger.warn('Client heartbeat timeout, closing connection');
          ws.terminate();
          this.handleDisconnect(ws);
        } else {
          // Send ping
          this.send(ws, { type: 'ping', timestamp: now });
        }
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Start the server
   */
  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.config.port, () => {
        logger.info(`WebSocket server listening on port ${this.config.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  public async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Close all client connections
    for (const ws of this.clients.keys()) {
      ws.close();
    }

    // Close WebSocket server
    await new Promise<void>((resolve) => {
      this.wss.close(() => resolve());
    });

    // Close HTTP server
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });

    logger.info('WebSocket server stopped');
  }
}
