/**
 * WebSocket Client for Agent World
 * 
 * Purpose: Reusable WebSocket client that works in both browser and Node.js
 * 
 * Features:
 * - Environment detection (browser vs Node.js)
 * - Connection lifecycle management (connect, disconnect, reconnect)
 * - Automatic reconnection with exponential backoff
 * - Heartbeat/ping-pong for connection health
 * - Event-based API for connection state changes
 * - Message queuing when offline
 * - Type-safe protocol (uses types from ws/types.ts)
 * 
 * Architecture:
 * - EventEmitter pattern for connection events
 * - State machine for connection lifecycle
 * - Browser: uses native WebSocket
 * - Node.js: uses 'ws' library
 * 
 * Usage:
 * ```typescript
 * import { WebSocketClient } from './ws-client.js';
 * 
 * const client = new WebSocketClient('ws://localhost:3001');
 * 
 * client.on('connected', () => console.log('Connected!'));
 * client.on('message', (msg) => console.log('Received:', msg));
 * client.on('error', (err) => console.error('Error:', err));
 * 
 * await client.connect();
 * 
 * client.subscribe('my-world', null, 'beginning');
 * client.enqueue('my-world', null, 'Hello agents!');
 * 
 * await client.disconnect();
 * ```
 * 
 * Changes:
 * - 2025-11-02: Initial creation - extracted from web SSE client patterns
 */

import type { WSMessage, WSMessageType, SubscriptionOptions, EnqueueOptions } from './types.js';

// Detect environment - simple check
// @ts-ignore - process may not exist in browser
const isNode = typeof process !== 'undefined' && process.versions?.node;

// Dynamic import for Node.js WebSocket will happen in connect()
let NodeWebSocket: any;

/**
 * Connection states
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/**
 * Event listener type
 */
export type EventListener = (...args: any[]) => void;

/**
 * WebSocket client configuration
 */
export interface WebSocketClientConfig {
  url: string;
  reconnectDelay?: number;      // Initial reconnect delay in ms (default: 1000)
  maxReconnectDelay?: number;   // Max reconnect delay in ms (default: 30000)
  reconnectBackoff?: number;    // Backoff multiplier (default: 1.5)
  heartbeatInterval?: number;   // Heartbeat interval in ms (default: 30000)
  autoReconnect?: boolean;      // Enable auto-reconnect (default: true)
}

/**
 * WebSocket client for Agent World
 */
export class WebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private listeners: Map<string, Set<EventListener>> = new Map();
  private messageQueue: WSMessage[] = [];
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private reconnectDelay: number;
  private maxReconnectDelay: number;
  private reconnectBackoff: number;
  private heartbeatInterval: number;
  private autoReconnect: boolean;
  private currentReconnectDelay: number;

  constructor(config: string | WebSocketClientConfig) {
    if (typeof config === 'string') {
      this.url = config;
      this.reconnectDelay = 1000;
      this.maxReconnectDelay = 30000;
      this.reconnectBackoff = 1.5;
      this.heartbeatInterval = 30000;
      this.autoReconnect = true;
    } else {
      this.url = config.url;
      this.reconnectDelay = config.reconnectDelay ?? 1000;
      this.maxReconnectDelay = config.maxReconnectDelay ?? 30000;
      this.reconnectBackoff = config.reconnectBackoff ?? 1.5;
      this.heartbeatInterval = config.heartbeatInterval ?? 30000;
      this.autoReconnect = config.autoReconnect ?? true;
    }
    this.currentReconnectDelay = this.reconnectDelay;
  }

  // ========================================
  // EVENT EMITTER METHODS
  // ========================================

  /**
   * Register event listener
   */
  public on(event: string, listener: EventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  /**
   * Unregister event listener
   */
  public off(event: string, listener: EventListener): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Emit event to listeners
   */
  private emit(event: string, ...args: any[]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  // ========================================
  // CONNECTION LIFECYCLE
  // ========================================

  /**
   * Connect to WebSocket server
   */
  public async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.setState('connecting');
    this.emit('connecting');

    try {
      // Load Node.js WebSocket if needed
      if (isNode && !NodeWebSocket) {
        try {
          // @ts-ignore - dynamic import may fail in browser
          const wsModule = await import('ws');
          NodeWebSocket = wsModule.WebSocket;
        } catch (e) {
          throw new Error('ws module not available in Node.js environment. Install with: npm install ws');
        }
      }

      // Create WebSocket instance
      const WebSocketConstructor = isNode && NodeWebSocket ? NodeWebSocket : WebSocket;
      const ws = new WebSocketConstructor(this.url) as WebSocket;
      this.ws = ws;

      // Setup event handlers
      // @ts-ignore - ws is guaranteed non-null here
      ws.onopen = this.handleOpen.bind(this);
      // @ts-ignore
      ws.onmessage = this.handleMessage.bind(this);
      // @ts-ignore
      ws.onerror = this.handleError.bind(this);
      // @ts-ignore
      ws.onclose = this.handleClose.bind(this);

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const openHandler = () => {
          this.off('connected', openHandler);
          this.off('error', errorHandler);
          resolve();
        };
        const errorHandler = (error: any) => {
          this.off('connected', openHandler);
          this.off('error', errorHandler);
          reject(error);
        };
        this.on('connected', openHandler);
        this.on('error', errorHandler);
      });
    } catch (error) {
      this.setState('error');
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  public async disconnect(): Promise<void> {
    this.autoReconnect = false;
    this.clearTimers();

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.ws.close();
    }

    this.setState('disconnected');
    this.ws = null;
  }

  /**
   * Get current connection state
   */
  public getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  // ========================================
  // MESSAGE SENDING
  // ========================================

  /**
   * Send message to server
   */
  public send(message: WSMessage): void {
    if (!this.isConnected()) {
      this.messageQueue.push(message);
      return;
    }

    try {
      this.ws!.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send message:', error);
      this.messageQueue.push(message);
    }
  }

  /**
   * Subscribe to world events
   */
  public subscribe(worldId: string, chatId: string | null, replayFrom: 'beginning' | number = 'beginning'): void {
    this.send({
      type: 'subscribe',
      worldId,
      chatId: chatId ?? undefined,
      payload: { replayFrom },
      timestamp: Date.now()
    });
  }

  /**
   * Unsubscribe from world events
   */
  public unsubscribe(worldId: string, chatId?: string | null): void {
    this.send({
      type: 'unsubscribe',
      worldId,
      chatId: chatId ?? undefined,
      timestamp: Date.now()
    });
  }

  /**
   * Enqueue message for processing
   */
  public enqueue(worldId: string, chatId: string | null, content: string, sender: string = 'user'): void {
    this.send({
      type: 'message',
      worldId,
      chatId: chatId ?? undefined,
      payload: { content, sender },
      timestamp: Date.now()
    });
  }

  /**
   * Execute CLI command
   */
  public executeCommand(worldId: string, command: string): void {
    this.send({
      type: 'command',
      worldId,
      payload: { command },
      timestamp: Date.now()
    });
  }

  /**
   * Send ping (heartbeat)
   */
  public ping(): void {
    this.send({
      type: 'ping',
      timestamp: Date.now()
    });
  }

  // ========================================
  // EVENT HANDLERS
  // ========================================

  /**
   * Handle connection open
   */
  private handleOpen(): void {
    this.setState('connected');
    this.currentReconnectDelay = this.reconnectDelay; // Reset reconnect delay
    this.emit('connected');

    // Flush message queue
    this.flushMessageQueue();

    // Start heartbeat
    this.startHeartbeat();
  }

  /**
   * Handle incoming message
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message: WSMessage = JSON.parse(event.data as string);

      // Handle pong
      if (message.type === 'pong') {
        return;
      }

      // Emit message event
      this.emit('message', message);

      // Emit type-specific events
      if (message.type === 'event') {
        this.emit('event', message.payload);
      } else if (message.type === 'crud') {
        this.emit('crud', message.payload);
      } else if (message.type === 'status') {
        this.emit('status', message.payload);
      } else if (message.type === 'error') {
        this.emit('error', new Error(message.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
      this.emit('error', error);
    }
  }

  /**
   * Handle connection error
   */
  private handleError(event: Event): void {
    console.error('WebSocket error:', event);
    this.emit('error', event);
  }

  /**
   * Handle connection close
   */
  private handleClose(event: CloseEvent): void {
    this.clearTimers();
    this.setState('disconnected');
    this.emit('disconnected', event.code, event.reason);

    // Attempt reconnection if enabled
    if (this.autoReconnect) {
      this.scheduleReconnect();
    }
  }

  // ========================================
  // RECONNECTION LOGIC
  // ========================================

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.setState('reconnecting');
    this.emit('reconnecting', this.currentReconnectDelay);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect().catch(() => {
        // Increase delay for next attempt
        this.currentReconnectDelay = Math.min(
          this.currentReconnectDelay * this.reconnectBackoff,
          this.maxReconnectDelay
        );
      });
    }, this.currentReconnectDelay);
  }

  // ========================================
  // HEARTBEAT
  // ========================================

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.ping();
      }
    }, this.heartbeatInterval);
  }

  /**
   * Clear heartbeat timer
   */
  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Set connection state
   */
  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('stateChange', state);
    }
  }

  /**
   * Flush queued messages
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift()!;
      this.send(message);
    }
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.clearHeartbeat();
  }
}
