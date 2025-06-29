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
 * - Function-based ES module format for browser compatibility
 * - Supports both static (local core) and server (WebSocket) operation modes
 * - Automatic fallback and error recovery mechanisms
 * - Event-driven architecture for real-time communication
 * - JSON message format with type validation
 * 
 * Changes:
 * - Converted from class-based to function-based architecture
 * - Static import of core.js bundle
 * - Simplified API with functional approach
 */

// Static import of Core bundle for static mode
import * as CoreBundle from './core.js';

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

// Module state
let state = {
  mode: OPERATION_MODES.STATIC,
  connectionState: CONNECTION_STATES.DISCONNECTED,
  websocket: null,
  coreBundle: CoreBundle,
  eventListeners: new Map(),
  messageQueue: [],
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
  reconnectDelay: 1000
};

/**
 * Detect operation mode based on configuration and environment
 */
function detectOperationMode(config) {
  // Allow explicit mode setting
  if (config.mode && Object.values(OPERATION_MODES).includes(config.mode)) {
    return config.mode;
  }

  // Check if Core bundle is available for static mode (preferred)
  if (CoreBundle || config.coreBundle !== false) {
    return OPERATION_MODES.STATIC;
  }

  // Check if we're in a development environment with server available
  if (config.serverUrl || config.websocketUrl) {
    return OPERATION_MODES.SERVER;
  }

  // Default to static mode (Core bundle already imported)
  return OPERATION_MODES.STATIC;
}

/**
 * Initialize the message broker with configuration
 */
async function init(config = {}) {
  try {
    state.mode = detectOperationMode(config);

    if (state.mode === OPERATION_MODES.SERVER) {
      await initServerMode(config);
    } else {
      await initStaticMode(config);
    }

    console.log(`Message Broker initialized in ${state.mode} mode`);
    emit('broker_ready', { mode: state.mode });

  } catch (error) {
    console.error('Failed to initialize message broker:', error);
    state.connectionState = CONNECTION_STATES.ERROR;
    emit('broker_error', { error: error.message });
    throw error;
  }
}

/**
 * Initialize server mode with WebSocket connection
 */
async function initServerMode(config) {
  const wsUrl = config.websocketUrl || 'ws://localhost:3000/ws';

  return new Promise((resolve, reject) => {
    try {
      state.connectionState = CONNECTION_STATES.CONNECTING;
      state.websocket = new WebSocket(wsUrl);

      state.websocket.onopen = () => {
        handleWebSocketOpen();
        resolve();
      };

      state.websocket.onmessage = handleWebSocketMessage;
      state.websocket.onclose = handleWebSocketClose;
      state.websocket.onerror = (error) => {
        handleWebSocketError(error);
        reject(new Error(`WebSocket connection failed: ${error.message || 'Unknown error'}`));
      };

      // Connection timeout
      setTimeout(() => {
        if (state.connectionState === CONNECTION_STATES.CONNECTING) {
          state.websocket.close();
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
async function initStaticMode(config) {
  try {
    // Core bundle is already imported statically
    state.coreBundle = CoreBundle;

    if (!state.coreBundle) {
      throw new Error('Core bundle not available for static mode');
    }

    state.connectionState = CONNECTION_STATES.CONNECTED;
    console.log('Static mode initialized with Core bundle');

  } catch (error) {
    console.error('Failed to initialize static mode:', error);
    throw error;
  }
}

/**
 * Send message through appropriate channel based on operation mode
 */
async function sendMessage(type, data = {}) {
  try {
    // Validate message
    const validatedMessage = validateMessage(type, data);

    if (state.mode === OPERATION_MODES.SERVER) {
      return await sendWebSocketMessage(validatedMessage);
    } else {
      return await sendCoreMessage(validatedMessage);
    }

  } catch (error) {
    console.error('Failed to send message:', error);
    emit('message_error', { error: error.message, type, data });
    throw error;
  }
}

/**
 * Validate message format and type
 */
function validateMessage(type, data) {
  if (!type || typeof type !== 'string') {
    throw new Error('Message type is required and must be a string');
  }

  if (!Object.values(MESSAGE_TYPES).includes(type)) {
    throw new Error(`Invalid message type: ${type}`);
  }

  return {
    id: generateMessageId(),
    type,
    data: data || {},
    timestamp: new Date().toISOString()
  };
}

/**
 * Send message via WebSocket (server mode)
 */
async function sendWebSocketMessage(message) {
  if (state.connectionState !== CONNECTION_STATES.CONNECTED) {
    throw new Error(`Cannot send message: WebSocket not connected (state: ${state.connectionState})`);
  }

  return new Promise((resolve, reject) => {
    try {
      // Add response handler for this specific message
      const responseHandler = (event) => {
        const response = JSON.parse(event.data);
        if (response.requestId === message.id) {
          state.websocket.removeEventListener('message', responseHandler);
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        }
      };

      state.websocket.addEventListener('message', responseHandler);
      state.websocket.send(JSON.stringify(message));

      // Message timeout
      setTimeout(() => {
        state.websocket.removeEventListener('message', responseHandler);
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
async function sendCoreMessage(message) {
  if (!state.coreBundle) {
    throw new Error('Core bundle not available');
  }

  try {
    // Route message to appropriate Core bundle method
    const result = await routeCoreMessage(message);

    return {
      id: generateMessageId(),
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
async function routeCoreMessage(message) {
  const { type, data } = message;

  switch (type) {
    case MESSAGE_TYPES.AGENT_LIST:
      return await state.coreBundle.listAgents(data.worldName);

    case MESSAGE_TYPES.AGENT_GET:
      return await state.coreBundle.getAgent(data.worldName, data.agentName || data.id);

    case MESSAGE_TYPES.AGENT_CREATE:
      return await state.coreBundle.createAgent({
        worldName: data.worldName,
        name: data.name,
        systemPrompt: data.systemPrompt,
        ...data
      });

    case MESSAGE_TYPES.AGENT_UPDATE:
      return await state.coreBundle.updateAgent(data.worldName, data.id || data.name, {
        systemPrompt: data.systemPrompt,
        ...data
      });

    case MESSAGE_TYPES.AGENT_DELETE:
      return await state.coreBundle.deleteAgent(data.worldName, data.id || data.name);

    case MESSAGE_TYPES.WORLD_LIST:
      return await state.coreBundle.listWorlds();

    case MESSAGE_TYPES.WORLD_GET:
      return await state.coreBundle.getWorld(data.name || data.id);

    case MESSAGE_TYPES.WORLD_CREATE:
      return await state.coreBundle.createWorld({
        name: data.name,
        description: data.description,
        ...data
      });

    case MESSAGE_TYPES.WORLD_UPDATE:
      return await state.coreBundle.updateWorld(data.name || data.id, {
        description: data.description,
        ...data
      });

    case MESSAGE_TYPES.WORLD_DELETE:
      return await state.coreBundle.deleteWorld(data.name || data.id);

    case MESSAGE_TYPES.CHAT_MESSAGE:
      // For static mode, we'll need to handle chat differently
      // This is a placeholder - actual chat functionality would need agent communication
      console.log('Chat message in static mode:', data);
      return { message: 'Chat functionality not implemented in static mode yet' };

    case MESSAGE_TYPES.SUBSCRIBE:
    case MESSAGE_TYPES.UNSUBSCRIBE:
      // These are no-ops in static mode since there's no real-time communication
      return { status: 'ok', message: `${type} is not needed in static mode` };

    default:
      throw new Error(`Unsupported message type for Core bundle: ${type}`);
  }
}

/**
 * WebSocket event handlers
 */
function handleWebSocketOpen() {
  state.connectionState = CONNECTION_STATES.CONNECTED;
  state.reconnectAttempts = 0;

  // Process queued messages
  processMessageQueue();

  emit('connection_open', { mode: state.mode });
}

function handleWebSocketMessage(event) {
  try {
    const message = JSON.parse(event.data);
    emit('message_received', message);

  } catch (error) {
    console.error('Failed to parse WebSocket message:', error);
    emit('message_error', { error: error.message });
  }
}

function handleWebSocketClose(event) {
  state.connectionState = CONNECTION_STATES.DISCONNECTED;
  emit('connection_closed', { code: event.code, reason: event.reason });

  // Attempt reconnection if not manually closed
  if (event.code !== 1000 && state.reconnectAttempts < state.maxReconnectAttempts) {
    attemptReconnection();
  }
}

function handleWebSocketError(error) {
  state.connectionState = CONNECTION_STATES.ERROR;
  console.error('WebSocket error:', error);
  emit('connection_error', { error: error.message || 'WebSocket error' });
}

/**
 * Attempt WebSocket reconnection
 */
function attemptReconnection() {
  if (state.reconnectAttempts >= state.maxReconnectAttempts) {
    console.error('Max reconnection attempts reached');
    return;
  }

  state.connectionState = CONNECTION_STATES.RECONNECTING;
  state.reconnectAttempts++;

  const delay = state.reconnectDelay * Math.pow(2, state.reconnectAttempts - 1);

  setTimeout(() => {
    console.log(`Attempting reconnection (${state.reconnectAttempts}/${state.maxReconnectAttempts})...`);
    initServerMode({ websocketUrl: state.websocket.url });
  }, delay);
}

/**
 * Process queued messages after connection
 */
function processMessageQueue() {
  while (state.messageQueue.length > 0) {
    const message = state.messageQueue.shift();
    state.websocket.send(JSON.stringify(message));
  }
}

/**
 * Event handling
 */
function on(event, callback) {
  if (!state.eventListeners.has(event)) {
    state.eventListeners.set(event, []);
  }
  state.eventListeners.get(event).push(callback);
}

function off(event, callback) {
  if (state.eventListeners.has(event)) {
    const listeners = state.eventListeners.get(event);
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }
}

function emit(event, data) {
  if (state.eventListeners.has(event)) {
    state.eventListeners.get(event).forEach(callback => {
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
function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getConnectionState() {
  return state.connectionState;
}

function getOperationMode() {
  return state.mode;
}

/**
 * Disconnect and cleanup
 */
function disconnect() {
  if (state.websocket) {
    state.websocket.close(1000, 'Manual disconnect');
    state.websocket = null;
  }

  state.connectionState = CONNECTION_STATES.DISCONNECTED;
  state.eventListeners.clear();
  state.messageQueue.length = 0;
}

// Export constants and functions
export {
  // Core functions
  init,
  sendMessage,
  on,
  off,
  emit,
  disconnect,
  getConnectionState,
  getOperationMode,

  // Constants
  MESSAGE_TYPES,
  OPERATION_MODES,
  CONNECTION_STATES
};

// Create a simple object interface for easier migration
const MessageBroker = {
  init,
  sendMessage,
  on,
  off,
  emit,
  disconnect,
  getConnectionState,
  getOperationMode
};

// Default export for easier importing
export default MessageBroker;
