/*
 * Message Broker Module for Agent World Frontend
 * 
 * Features:
 * - Unified communication interface for both static and server modes
 * - Mode detection and automatic routing
 * - WebSocket connection management for server mode
 * - Local Core bundle integration for static mode
 * - Message validation and error handling
 * - Connection state management and recovery
 * 
 * Implementation:
 * - ES module format for browser compatibility
 * - Supports both static (local core) and server (WebSocket) operation modes
 * - Automatic fallback and error recovery mechanisms
 * - Event-driven architecture for real-time communication
 * - JSON message format with type validation
 * 
 * Changes:
 * - Initial implementation for Phase 4.1 Message Broker Design
 * - Unified message interface with mode detection
 * - Basic message validation and error handling
 * - WebSocket connection management foundation
 * - Local Core bundle integration preparation
 */

// Message types for validation
const MESSAGE_TYPES = {
  // Agent operations
  AGENT_CREATE: 'agent_create',
  AGENT_UPDATE: 'agent_update',
  AGENT_DELETE: 'agent_delete',
  AGENT_LIST: 'agent_list',
  AGENT_GET: 'agent_get',

  // World operations
  WORLD_CREATE: 'world_create',
  WORLD_UPDATE: 'world_update',
  WORLD_DELETE: 'world_delete',
  WORLD_LIST: 'world_list',
  WORLD_GET: 'world_get',
  WORLD_SELECT: 'world_select',

  // Communication
  CHAT_MESSAGE: 'chat_message',
  AGENT_MESSAGE: 'agent_message',

  // System
  STATUS: 'status',
  ERROR: 'error',
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe'
};

// Operation modes
const OPERATION_MODES = {
  STATIC: 'static',   // Local Core bundle mode
  SERVER: 'server'    // WebSocket server mode
};

// Connection states
const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
};

/**
 * Unified Message Broker for Agent World Communication
 * 
 * Provides abstraction layer between UI and backend communication,
 * supporting both static (local core) and server (WebSocket) modes.
 */
class MessageBroker {
  constructor() {
    this.mode = OPERATION_MODES.STATIC; // Default to static mode
    this.connectionState = CONNECTION_STATES.DISCONNECTED;
    this.websocket = null;
    this.coreBundle = null;
    this.eventListeners = new Map();
    this.messageQueue = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;

    // Bind methods
    this.handleWebSocketMessage = this.handleWebSocketMessage.bind(this);
    this.handleWebSocketOpen = this.handleWebSocketOpen.bind(this);
    this.handleWebSocketClose = this.handleWebSocketClose.bind(this);
    this.handleWebSocketError = this.handleWebSocketError.bind(this);
  }

  /**
   * Initialize the message broker with configuration
   */
  async init(config = {}) {
    try {
      this.mode = this.detectOperationMode(config);

      if (this.mode === OPERATION_MODES.SERVER) {
        await this.initServerMode(config);
      } else {
        await this.initStaticMode(config);
      }

      console.log(`Message Broker initialized in ${this.mode} mode`);
      this.emit('broker_ready', { mode: this.mode });

    } catch (error) {
      console.error('Failed to initialize message broker:', error);
      this.connectionState = CONNECTION_STATES.ERROR;
      this.emit('broker_error', { error: error.message });
      throw error;
    }
  }

  /**
   * Detect operation mode based on configuration and environment
   */
  detectOperationMode(config) {
    // Allow explicit mode setting
    if (config.mode && Object.values(OPERATION_MODES).includes(config.mode)) {
      return config.mode;
    }

    // Check if we're in a development environment with server available
    if (config.serverUrl || config.websocketUrl) {
      return OPERATION_MODES.SERVER;
    }

    // Check if Core bundle is available for static mode
    if (window.AgentWorldCore || config.coreBundle) {
      return OPERATION_MODES.STATIC;
    }

    // Default to static mode
    return OPERATION_MODES.STATIC;
  }

  /**
   * Initialize server mode with WebSocket connection
   */
  async initServerMode(config) {
    const wsUrl = config.websocketUrl || 'ws://localhost:3000/ws';

    return new Promise((resolve, reject) => {
      try {
        this.connectionState = CONNECTION_STATES.CONNECTING;
        this.websocket = new WebSocket(wsUrl);

        this.websocket.onopen = () => {
          this.handleWebSocketOpen();
          resolve();
        };

        this.websocket.onmessage = this.handleWebSocketMessage;
        this.websocket.onclose = this.handleWebSocketClose;
        this.websocket.onerror = (error) => {
          this.handleWebSocketError(error);
          reject(new Error(`WebSocket connection failed: ${error.message || 'Unknown error'}`));
        };

        // Connection timeout
        setTimeout(() => {
          if (this.connectionState === CONNECTION_STATES.CONNECTING) {
            this.websocket.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Initialize static mode with local Core bundle
   */
  async initStaticMode(config) {
    try {
      // Try to load Core bundle if not already available
      if (!window.AgentWorldCore && config.coreBundle) {
        await this.loadCoreBundle(config.coreBundle);
      }

      this.coreBundle = window.AgentWorldCore;

      if (!this.coreBundle) {
        throw new Error('Core bundle not available for static mode');
      }

      this.connectionState = CONNECTION_STATES.CONNECTED;

    } catch (error) {
      console.error('Failed to initialize static mode:', error);
      throw error;
    }
  }

  /**
   * Load Core bundle dynamically
   */
  async loadCoreBundle(bundlePath) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = bundlePath;
      script.type = 'module';

      script.onload = () => {
        resolve();
      };

      script.onerror = () => {
        reject(new Error(`Failed to load Core bundle from ${bundlePath}`));
      };

      document.head.appendChild(script);
    });
  }

  /**
   * Send message through appropriate channel based on operation mode
   */
  async sendMessage(type, data = {}) {
    try {
      // Validate message
      const validatedMessage = this.validateMessage(type, data);

      if (this.mode === OPERATION_MODES.SERVER) {
        return await this.sendWebSocketMessage(validatedMessage);
      } else {
        return await this.sendCoreMessage(validatedMessage);
      }

    } catch (error) {
      console.error('Failed to send message:', error);
      this.emit('message_error', { error: error.message, type, data });
      throw error;
    }
  }

  /**
   * Validate message format and type
   */
  validateMessage(type, data) {
    if (!type || typeof type !== 'string') {
      throw new Error('Message type is required and must be a string');
    }

    if (!Object.values(MESSAGE_TYPES).includes(type)) {
      throw new Error(`Invalid message type: ${type}`);
    }

    return {
      id: this.generateMessageId(),
      type,
      data: data || {},
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Send message via WebSocket (server mode)
   */
  async sendWebSocketMessage(message) {
    if (this.connectionState !== CONNECTION_STATES.CONNECTED) {
      throw new Error(`Cannot send message: WebSocket not connected (state: ${this.connectionState})`);
    }

    return new Promise((resolve, reject) => {
      try {
        // Add response handler for this specific message
        const responseHandler = (event) => {
          const response = JSON.parse(event.data);
          if (response.requestId === message.id) {
            this.websocket.removeEventListener('message', responseHandler);
            if (response.error) {
              reject(new Error(response.error));
            } else {
              resolve(response);
            }
          }
        };

        this.websocket.addEventListener('message', responseHandler);
        this.websocket.send(JSON.stringify(message));

        // Message timeout
        setTimeout(() => {
          this.websocket.removeEventListener('message', responseHandler);
          reject(new Error('Message timeout'));
        }, 30000);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send message via Core bundle (static mode)
   */
  async sendCoreMessage(message) {
    if (!this.coreBundle) {
      throw new Error('Core bundle not available');
    }

    try {
      // Route message to appropriate Core bundle method
      const result = await this.routeCoreMessage(message);

      return {
        id: this.generateMessageId(),
        requestId: message.id,
        type: 'response',
        data: result,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      throw new Error(`Core bundle error: ${error.message}`);
    }
  }

  /**
   * Route message to appropriate Core bundle method
   */
  async routeCoreMessage(message) {
    const { type, data } = message;

    switch (type) {
      case MESSAGE_TYPES.AGENT_LIST:
        return await this.coreBundle.listAgents(data);

      case MESSAGE_TYPES.AGENT_GET:
        return await this.coreBundle.getAgent(data.id);

      case MESSAGE_TYPES.AGENT_CREATE:
        return await this.coreBundle.createAgent(data);

      case MESSAGE_TYPES.AGENT_UPDATE:
        return await this.coreBundle.updateAgent(data.id, data);

      case MESSAGE_TYPES.AGENT_DELETE:
        return await this.coreBundle.deleteAgent(data.id);

      case MESSAGE_TYPES.WORLD_LIST:
        return await this.coreBundle.listWorlds(data);

      case MESSAGE_TYPES.WORLD_GET:
        return await this.coreBundle.getWorld(data.id);

      case MESSAGE_TYPES.WORLD_CREATE:
        return await this.coreBundle.createWorld(data);

      case MESSAGE_TYPES.WORLD_UPDATE:
        return await this.coreBundle.updateWorld(data.id, data);

      case MESSAGE_TYPES.WORLD_DELETE:
        return await this.coreBundle.deleteWorld(data.id);

      case MESSAGE_TYPES.CHAT_MESSAGE:
        return await this.coreBundle.sendMessage(data);

      default:
        throw new Error(`Unsupported message type for Core bundle: ${type}`);
    }
  }

  /**
   * WebSocket event handlers
   */
  handleWebSocketOpen() {
    this.connectionState = CONNECTION_STATES.CONNECTED;
    this.reconnectAttempts = 0;

    // Process queued messages
    this.processMessageQueue();

    this.emit('connection_open', { mode: this.mode });
  }

  handleWebSocketMessage(event) {
    try {
      const message = JSON.parse(event.data);
      this.emit('message_received', message);

    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
      this.emit('message_error', { error: error.message });
    }
  }

  handleWebSocketClose(event) {
    this.connectionState = CONNECTION_STATES.DISCONNECTED;
    this.emit('connection_closed', { code: event.code, reason: event.reason });

    // Attempt reconnection if not manually closed
    if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.attemptReconnection();
    }
  }

  handleWebSocketError(error) {
    this.connectionState = CONNECTION_STATES.ERROR;
    console.error('WebSocket error:', error);
    this.emit('connection_error', { error: error.message || 'WebSocket error' });
  }

  /**
   * Attempt WebSocket reconnection
   */
  attemptReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.connectionState = CONNECTION_STATES.RECONNECTING;
    this.reconnectAttempts++;

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      console.log(`Attempting reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      this.initServerMode({ websocketUrl: this.websocket.url });
    }, delay);
  }

  /**
   * Process queued messages after connection
   */
  processMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.websocket.send(JSON.stringify(message));
    }
  }

  /**
   * Event handling
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Utility methods
   */
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getConnectionState() {
    return this.connectionState;
  }

  getOperationMode() {
    return this.mode;
  }

  /**
   * Disconnect and cleanup
   */
  disconnect() {
    if (this.websocket) {
      this.websocket.close(1000, 'Manual disconnect');
      this.websocket = null;
    }

    this.connectionState = CONNECTION_STATES.DISCONNECTED;
    this.eventListeners.clear();
    this.messageQueue.length = 0;
  }
}

// Export constants and class
export {
  MessageBroker,
  MESSAGE_TYPES,
  OPERATION_MODES,
  CONNECTION_STATES
};

// Default export for easier importing
export default MessageBroker;
