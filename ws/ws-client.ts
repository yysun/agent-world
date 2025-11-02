/**
 * WebSocket Client Library
 * 
 * Purpose: Universal TypeScript client for connecting to Agent World WebSocket server
 * Works in both Node.js and browser environments
 * 
 * Features:
 * - Environment detection (browser vs Node.js)
 * - Promise-based connection management
 * - Automatic reconnection with exponential backoff
 * - Event subscription with sequence tracking
 * - Message sending with queue integration
 * - Typed message and event handlers
 * - Connection state management
 * - Heartbeat/ping-pong for connection health
 * 
 * Usage:
 * ```typescript
 * const client = createWSClient('ws://localhost:3001');
 * // or
 * const client = new AgentWorldWSClient({ url: 'ws://localhost:3001' });
 * 
 * await client.connect();
 * 
 * client.on('event', (event) => {
 *   console.log('Received event:', event);
 * });
 * 
 * await client.subscribe('my-world', 'chat-123');
 * await client.sendMessage('my-world', 'Hello!', 'chat-123');
 * ```
 * 
 * Changes:
 * - 2025-11-02: Consolidated from ws/client.ts - now works in both Node.js and browser
 * - 2025-11-02: Changed ConnectionState from enum to string union type for browser compatibility
 * - 2025-11-02: Removed compatibility wrappers (enqueue, executeCommand, ping) - TUI updated to use direct methods
 * - 2025-11-02: Added cross-platform event handlers (addEventListener for browser, on() for Node.js)
 * - 2025-11-02: Updated handleMessage to accept both Buffer (Node.js) and string (browser)
 * - 2025-11-02: Exported as WebSocketClient for consistency across codebase
 * - 2025-11-01: Initial WebSocket client implementation
 */

import { EventEmitter } from 'events';

// Environment detection
// @ts-ignore - process may not exist in browser
const isNode = typeof process !== 'undefined' && process?.versions?.node;

// Dynamic import for Node.js WebSocket
let NodeWebSocket: any;

/**
 * WebSocket message types
 */
export type WSClientMessage =
  | { type: 'subscribe'; worldId: string; chatId?: string; fromSeq?: number }
  | { type: 'unsubscribe'; worldId: string; chatId?: string }
  | { type: 'message'; worldId: string; messageId: string; chatId?: string; payload: any }
  | { type: 'command'; worldId?: string; payload: any }
  | { type: 'ping' };

export type WSServerMessage =
  | { type: 'event'; worldId: string; chatId?: string; seq?: number; payload: any; timestamp: number }
  | { type: 'status'; worldId?: string; messageId?: string; payload: any; timestamp: number }
  | { type: 'error'; error: string; timestamp: number }
  | { type: 'pong'; timestamp: number };

/**
 * Connection state
 */
/**
 * Connection states
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'closing';

/**
 * Client configuration
 */
export interface WSClientConfig {
  url: string;
  autoReconnect?: boolean;
  reconnectDelay?: number;      // Initial delay in ms (default 1000)
  maxReconnectDelay?: number;   // Max delay in ms (default 30000)
  reconnectBackoff?: number;    // Backoff multiplier (default 1.5)
  pingInterval?: number;        // Ping interval in ms (default 30000)
}

/**
 * Subscription info
 */
interface Subscription {
  worldId: string;
  chatId?: string;
  lastSeq: number;
}

/**
 * Agent World WebSocket Client
 */
export class AgentWorldWSClient extends EventEmitter {
  private config: Required<WSClientConfig>;
  private ws?: any; // WebSocket type (browser or Node.js)
  private connectPromise?: Promise<void>;
  private connectResolve?: () => void;
  private connectReject?: (error: Error) => void;
  private state: ConnectionState = 'disconnected';
  private subscriptions: Map<string, Subscription> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout | number;
  private pingTimer?: NodeJS.Timeout | number;

  constructor(config: string | WSClientConfig) {
    super();

    if (typeof config === 'string') {
      this.config = {
        url: config,
        autoReconnect: true,
        reconnectDelay: 1000,
        maxReconnectDelay: 30000,
        reconnectBackoff: 1.5,
        pingInterval: 30000
      };
    } else {
      this.config = {
        autoReconnect: config.autoReconnect ?? true,
        reconnectDelay: config.reconnectDelay ?? 1000,
        maxReconnectDelay: config.maxReconnectDelay ?? 30000,
        reconnectBackoff: config.reconnectBackoff ?? 1.5,
        pingInterval: config.pingInterval ?? 30000,
        ...config
      };
    }
  }

  /**
   * Connect to WebSocket server
   */
  public async connect(): Promise<void> {
    if (this.state === 'connected') {
      return;
    }

    if (this.state === 'connecting' && this.connectPromise) {
      return this.connectPromise;
    }

    this.state = 'connecting';
    this.emit('connecting');

    this.connectPromise = new Promise<void>(async (resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;

      try {
        // Load Node.js WebSocket if needed
        if (isNode && !NodeWebSocket) {
          try {
            // @ts-ignore - dynamic import
            const wsModule = await import('ws');
            NodeWebSocket = wsModule.default || wsModule;
          } catch (e) {
            throw new Error('ws module not available. Install with: npm install ws');
          }
        }

        // Create WebSocket instance (browser or Node.js)
        const WebSocketConstructor = isNode && NodeWebSocket ? NodeWebSocket : (globalThis as any).WebSocket;
        if (!WebSocketConstructor) {
          throw new Error('WebSocket not available in this environment');
        }

        this.ws = new WebSocketConstructor(this.config.url);

        const connectionTimeout = setTimeout(() => {
          if (this.state === 'connecting') {
            this.ws?.close();
            reject(new Error('Connection timeout'));
          }
        }, 10000);

        // Use event handlers compatible with both environments
        const handleOpen = () => {
          clearTimeout(connectionTimeout);
          this.state = 'connected';
          this.reconnectAttempts = 0;
          this.startPing();
          this.emit('connected');
          resolve();
        };

        const handleError = (error: any) => {
          clearTimeout(connectionTimeout);
          const err = new Error(`WebSocket error: ${error.message || 'Connection failed'}`);
          this.emit('error', err);
          if (this.state === 'connecting') {
            reject(err);
          }
        };

        const handleMessage = (event: any) => {
          this.handleMessage(event.data || event);
        };

        const handleClose = () => {
          this.handleClose();
        };

        // Attach handlers (works for both browser and Node.js WebSocket)
        if (this.ws.addEventListener) {
          // Browser WebSocket
          this.ws.addEventListener('open', handleOpen);
          this.ws.addEventListener('error', handleError);
          this.ws.addEventListener('message', handleMessage);
          this.ws.addEventListener('close', handleClose);
        } else {
          // Node.js WebSocket
          this.ws.on('open', handleOpen);
          this.ws.on('error', handleError);
          this.ws.on('message', handleMessage);
          this.ws.on('close', handleClose);
        }
      } catch (error) {
        reject(error);
      }
    });

    return this.connectPromise;
  }

  /**
   * Disconnect from server
   */
  public async disconnect(): Promise<void> {
    if (this.state === 'disconnected') {
      return;
    }

    // Stop reconnection attempts
    this.stopReconnect();

    // Unsubscribe from all worlds
    for (const worldId of this.subscriptions.keys()) {
      try {
        // Send unsubscribe message but don't wait for response during disconnect
        const message: WSClientMessage = {
          type: 'unsubscribe',
          worldId
        };
        if (this.state === 'connected') {
          this.send(message);
        }
      } catch (error) {
        // Ignore unsubscribe errors during disconnect
      }
    }
    this.subscriptions.clear();

    // Close the WebSocket connection
    this.state = 'closing';
    this.stopPing();

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    this.state = 'disconnected';
    this.emit('disconnected');
  }

  /**
   * Subscribe to world events
   */
  public async subscribe(worldId: string, chatId?: string | null, fromSeq?: number): Promise<void> {
    await this.ensureConnected();

    const chatIdOrUndefined = chatId ?? undefined;
    const subKey = this.makeSubscriptionKey(worldId, chatIdOrUndefined);
    const message: WSClientMessage = {
      type: 'subscribe',
      worldId,
      chatId: chatIdOrUndefined,
      fromSeq
    };

    this.send(message);

    // Track subscription
    this.subscriptions.set(subKey, {
      worldId,
      chatId: chatIdOrUndefined,
      lastSeq: fromSeq ?? 0
    });

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Subscribe timeout'));
      }, 5000);

      const statusHandler = (status: any) => {
        if (status.payload?.status === 'subscribed' && status.worldId === worldId) {
          clearTimeout(timeout);
          this.off('status', statusHandler);
          resolve();
        }
      };

      this.on('status', statusHandler);
    });
  }

  /**
   * Unsubscribe from world events
   */
  public async unsubscribe(worldId: string, chatId?: string | null): Promise<void> {
    await this.ensureConnected();

    const chatIdOrUndefined = chatId ?? undefined;
    const subKey = this.makeSubscriptionKey(worldId, chatIdOrUndefined);
    const message: WSClientMessage = {
      type: 'unsubscribe',
      worldId,
      chatId: chatIdOrUndefined
    };

    this.send(message);
    this.subscriptions.delete(subKey);

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Unsubscribe timeout'));
      }, 5000); // 5 second timeout

      const statusHandler = (status: any) => {
        if (status.payload?.status === 'unsubscribed' && status.worldId === worldId) {
          clearTimeout(timeout);
          this.off('status', statusHandler);
          resolve();
        }
      };

      this.on('status', statusHandler);
    });
  }

  /**
   * Send message to world (enqueue for processing)
   */
  public async sendMessage(worldId: string, content: string, chatId?: string, sender: string = 'human', priority: number = 0): Promise<string> {
    await this.ensureConnected();

    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const message: WSClientMessage = {
      type: 'message',
      worldId,
      messageId,
      chatId,
      payload: {
        content,
        sender,
        priority
      }
    };

    this.send(message);

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Send message timeout'));
      }, 5000);

      const statusHandler = (status: any) => {
        if (status.messageId === messageId && status.payload?.status === 'queued') {
          clearTimeout(timeout);
          this.off('status', statusHandler);
          resolve(messageId);
        }
      };

      this.on('status', statusHandler);
    });
  }

  /**
   * Send command to server (execute immediately)
   */
  public async sendCommand(worldId: string | undefined, command: string, params: any = {}): Promise<any> {
    await this.ensureConnected();

    const message: WSClientMessage = {
      type: 'command' as const,
      worldId,
      payload: {
        command,
        params
      }
    };

    this.send(message);

    return new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Command timeout'));
      }, 10000);

      const statusHandler = (status: any) => {
        if (status.payload?.command === command) {
          clearTimeout(timeout);
          this.off('status', statusHandler);

          if (status.payload.status === 'success') {
            resolve(status.payload.data);
          } else {
            reject(new Error(status.payload.message || 'Command failed'));
          }
        }
      };

      const errorHandler = (error: any) => {
        clearTimeout(timeout);
        this.off('status', statusHandler);
        this.off('error', errorHandler);
        reject(new Error(error.error || 'Command error'));
      };

      this.on('status', statusHandler);
      this.on('error', errorHandler);
    });
  }

  /**
   * Get current connection state
   */
  public getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get current subscriptions
   */
  public getSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Handle incoming message from server
   */
  private async handleMessage(data: any): Promise<void> {
    // Handle both Buffer (Node.js) and string (browser)
    const messageStr = typeof data === 'string' ? data : data.toString();
    const message: WSServerMessage = JSON.parse(messageStr);

    switch (message.type) {
      case 'event':
        // Update last received sequence
        if (message.seq !== undefined) {
          const subKey = this.makeSubscriptionKey(message.worldId, message.chatId);
          const sub = this.subscriptions.get(subKey);
          if (sub && message.seq > sub.lastSeq) {
            sub.lastSeq = message.seq;
          }
        }
        this.emit('event', message);
        break;

      case 'status':
        this.emit('status', message);
        break;

      case 'error':
        this.emit('server-error', new Error(message.error));
        break;

      case 'pong':
        // Heartbeat response
        break;
    }
  }

  /**
   * Handle connection close
   */
  private handleClose(): void {
    const wasConnected = this.state === 'connected';
    this.state = 'disconnected';
    this.stopPing();
    this.emit('disconnected');

    if (wasConnected && this.config.autoReconnect) {
      this.scheduleReconnect();
    }
  }

  /**
   * Reconnect with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.state !== 'disconnected') {
      return;
    }

    this.state = 'reconnecting';
    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(this.config.reconnectBackoff, this.reconnectAttempts),
      this.config.maxReconnectDelay
    );

    this.reconnectAttempts++;
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
        // Resubscribe to all previous subscriptions
        for (const sub of this.subscriptions.values()) {
          await this.subscribe(sub.worldId, sub.chatId, sub.lastSeq);
        }
      } catch (error) {
        // Reconnect will be attempted again on close
      }
    }, delay);
  }

  /**
   * Stop reconnection attempts
   */
  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  /**
   * Start ping interval
   */
  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.state === 'connected') {
        this.send({ type: 'ping' });
      }
    }, this.config.pingInterval);
  }

  /**
   * Stop ping interval
   */
  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  /**
   * Send message to server
   */
  private send(message: WSClientMessage): void {
    if (this.ws && this.state === 'connected') {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Ensure client is connected
   */
  private async ensureConnected(): Promise<void> {
    if (this.state === 'connected') {
      return;
    }

    if (this.state === 'connecting' && this.connectPromise) {
      return this.connectPromise;
    }

    return this.connect();
  }

  /**
   * Make subscription key
   */
  private makeSubscriptionKey(worldId: string, chatId?: string): string {
    return chatId ? `${worldId}:${chatId}` : `${worldId}:*`;
  }
}

/**
 * Create WebSocket client instance
 */
export function createWSClient(config: string | WSClientConfig): AgentWorldWSClient {
  return new AgentWorldWSClient(config);
}

// Export with simpler name
export { AgentWorldWSClient as WebSocketClient };
export type { WSClientConfig as WebSocketClientConfig };
