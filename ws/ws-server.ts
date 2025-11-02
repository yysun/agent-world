/**
 * WebSocket Server - Async World Processing
 * 
 * Purpose: WebSocket server for handling async agent message processing with real-time updates
 * 
 * Features:
 * - WebSocket connections per world with authentication
 * - Real-time event streaming using event sequences
 * - Real-time CRUD event broadcasting (agent/chat/world changes)
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
 * - CRUD event broadcasting for configuration changes
 * - Pino-based structured logging
 * 
 * Changes:
 * - 2025-11-02: Consolidate all events to consistent structure (SSE and message events both wrapped)
 * - 2025-11-02: Fix SSE event broadcasting - pass event data directly for SSE events (start, chunk, end, error, log)
 * - 2025-11-01: Add CRUD event broadcasting for agent/chat/world changes
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
  | 'command'        // Client sends CLI command
  | 'event'          // Server sends event update to client
  | 'crud'           // Server sends CRUD update to client (agent/chat/world changes)
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
      logger.info('✓ New client connected');
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
      ws.on('close', (code, reason) => {
        logger.info(`WebSocket closed`, { code, reason: reason?.toString(), hasClient: !!this.clients.get(ws) });
        this.handleDisconnect(ws);
      });

      // Handle errors
      ws.on('error', (error: Error) => {
        logger.error('WebSocket error:', { error: error.message, stack: error.stack });
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

      case 'command':
        await this.handleCommand(ws, message);
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

    logger.info(`✓ Client subscribed to world: ${message.worldId}`, { chatId: message.chatId });

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

    logger.info(`Client unsubscribing from world: ${client.worldId}`);

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
      logger.info(`Enqueuing message for world: ${message.worldId}`, {
        messageId: message.messageId,
        sender: message.payload?.sender,
        contentPreview: message.payload?.content?.substring(0, 30)
      });

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
   * Handle CLI command from client
   */
  private async handleCommand(ws: WebSocket, message: WSMessage): Promise<void> {
    try {
      const {
        createWorld, getWorld, listWorlds, deleteWorld,
        createAgent, getAgent, listAgents, deleteAgent,
        newChat, listChats, deleteChat,
        exportWorldToMarkdown
      } = await import('../core/index.js');

      const command = message.payload?.command;
      const params = message.payload?.params || {};
      const worldId = message.worldId;

      if (!command) {
        this.sendError(ws, 'No command specified');
        return;
      }

      let result: any = null;
      let responseMessage = '';

      // Execute command
      switch (command) {
        // World commands
        case 'create-world':
          result = await createWorld(params);
          responseMessage = `World '${params.name}' created successfully`;
          break;

        case 'get-world':
          result = await getWorld(worldId || params.worldId);
          if (result) {
            // Convert agents Map to array for JSON serialization
            result = {
              ...result,
              agents: result.agents ? Array.from(result.agents.values()) : [],
              chats: result.chats ? Array.from(result.chats.values()) : [],
              eventEmitter: undefined, // Remove non-serializable objects
              eventStorage: undefined,
              _eventPersistenceCleanup: undefined,
              _activityListenerCleanup: undefined
            };
          }
          responseMessage = result ? `World '${result.name}' retrieved` : 'World not found';
          break;

        case 'list-worlds':
          result = await listWorlds();
          responseMessage = `Found ${result.length} world(s)`;
          break;

        case 'delete-world':
          result = await deleteWorld(worldId || params.worldId);
          responseMessage = `World deleted`;
          break;

        // Agent commands
        case 'create-agent':
          if (!worldId) {
            this.sendError(ws, 'worldId required for create-agent');
            return;
          }
          result = await createAgent(worldId, params);
          responseMessage = `Agent '${params.name}' created successfully`;
          break;

        case 'get-agent':
          if (!worldId) {
            this.sendError(ws, 'worldId required for get-agent');
            return;
          }
          result = await getAgent(worldId, params.agentId);
          responseMessage = result ? `Agent '${result.name}' retrieved` : 'Agent not found';
          break;

        case 'list-agents':
          if (!worldId) {
            this.sendError(ws, 'worldId required for list-agents');
            return;
          }
          result = await listAgents(worldId);
          responseMessage = `Found ${result.length} agent(s)`;
          break;

        case 'delete-agent':
          if (!worldId) {
            this.sendError(ws, 'worldId required for delete-agent');
            return;
          }
          result = await deleteAgent(worldId, params.agentId);
          responseMessage = `Agent deleted`;
          break;

        // Chat commands
        case 'new-chat':
          if (!worldId) {
            this.sendError(ws, 'worldId required for new-chat');
            return;
          }
          result = await newChat(worldId);
          responseMessage = `Chat '${result.name}' created successfully`;
          break;

        case 'list-chats':
          if (!worldId) {
            this.sendError(ws, 'worldId required for list-chats');
            return;
          }
          result = await listChats(worldId);
          responseMessage = `Found ${result.length} chat(s)`;
          break;

        case 'delete-chat':
          if (!worldId) {
            this.sendError(ws, 'worldId required for delete-chat');
            return;
          }
          result = await deleteChat(worldId, params.chatId);
          responseMessage = `Chat deleted`;
          break;

        // Export command
        case 'export-world':
          if (!worldId) {
            this.sendError(ws, 'worldId required for export-world');
            return;
          }
          result = await exportWorldToMarkdown(worldId);
          responseMessage = `World exported (${result.length} characters)`;
          break;

        default:
          this.sendError(ws, `Unknown command: ${command}`);
          return;
      }

      // Send response
      this.send(ws, {
        type: 'status',
        worldId,
        payload: {
          status: 'success',
          command,
          message: responseMessage,
          data: result
        },
        timestamp: Date.now()
      });

      logger.info(`Command executed: ${command} for world: ${worldId || 'none'}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error('Error executing command:', {
        command: message.payload?.command,
        worldId: message.worldId,
        params: message.payload?.params,
        error: errorMessage,
        stack: errorStack
      });
      this.sendError(ws, `Command execution failed: ${errorMessage}`);
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

    logger.info(`Broadcasting ${event.type} event to ${subscribers.size} clients`, {
      worldId,
      chatId
    });

    // Wrap all events consistently with the same structure
    const message: WSMessage = {
      type: 'event',
      worldId,
      chatId: chatId ?? undefined,
      seq: event.seq ?? undefined,
      payload: {
        id: event.id,
        type: event.type,
        payload: event.payload || event, // For SSE events, payload is the event itself
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
   * Broadcast CRUD event to all subscribers of a world
   */
  public broadcastCRUDEvent(worldId: string, crudEvent: any): void {
    const subscribers = this.worldSubscriptions.get(worldId);
    if (!subscribers) return;

    const message: WSMessage = {
      type: 'crud',
      worldId,
      payload: crudEvent,
      timestamp: Date.now()
    };

    const messageStr = JSON.stringify(message);
    subscribers.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    });

    logger.debug(`Broadcast CRUD event to ${subscribers.size} subscribers`, {
      worldId,
      operation: crudEvent.operation,
      entityType: crudEvent.entityType,
      entityId: crudEvent.entityId
    });
  }  /**
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
