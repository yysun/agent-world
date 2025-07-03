//@ts-check
/**
 * WebSocket API Module - Real-time world communication with typed command system
 *
 * Features: Connection management with auto-reconnect, world subscription, typed WebSocket commands,
 * world/agent CRUD operations, promise-based async API with error handling,
 * request/response tracking with time-based IDs, unified message creation with type-specific handling,
 * SSE chunk grouping into single message blocks by agent and messageId, support for new eventType 
 * structure (eventType: 'sse', type: 'chunk'), backward compatibility with old SSE format,
 * connection status management, error handling and logging, auto-subscription on welcome messages,
 * proper streaming lifecycle (start, chunk, end, error), auto-scroll to bottom when messages are added or updated,
 * error messages added to conversation state with red left border styling
 *
 * Typed Command System: Uses structured CommandRequest/CommandResponse objects instead of string commands,
 * time-based request ID generation for tracking, type-safe command parameters replacing unsafe args arrays,
 * request/response correlation via WebSocket command-response events, comprehensive error handling with typed responses
 *
 * Implementation: Function-based module with subscription lifecycle management,
 * typed WebSocket command protocol for world/agent operations, comprehensive 
 * message event handlers for real-time communication, consolidated
 * connection management with built-in auto-reconnect functionality,
 * and error message integration into conversation flow
 *
 * Changes:
 * - Updated to use typed command system with CommandRequest/CommandResponse
 * - Replaced string-based commands with structured request objects
 * - Added request ID generation and tracking for commands
 * - Enhanced error handling with typed response validation
 * - Maintained backward compatibility with existing API interfaces
 * - Added command-response event handling for typed responses
 */



// State management
let ws = null;
let currentWorldSubscription = null;
let reconnectAttempts = 0;

// Configuration - WebSocket URL based on environment
const getWebSocketUrl = () => {
  // Check if running in development environment
  const isDevelopment = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.startsWith('192.168.');

  // Use environment-specific URL
  if (isDevelopment) {
    return `ws://localhost:3000/ws`;
  } else {
    // Production: use same host as the webpage with WebSocket protocol
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }
};

// Constants
const url = getWebSocketUrl();
const userId = 'user1';
const maxReconnectAttempts = 5;
const reconnectDelay = 1000;
const commandTimeout = 10000; // 10 seconds for command responses

// Typed command system utilities
const generateRequestId = () => {
  return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Pending requests tracking for command responses
const pendingRequests = new Map();

// Helper function to create typed command requests
const createCommandRequest = (type, params = {}) => {
  const requestId = generateRequestId();
  const timestamp = new Date().toISOString();

  const baseRequest = {
    id: requestId,
    type,
    timestamp
  };

  return { ...baseRequest, ...params };
};

// Connection functions
const connect = () => {
  const app = window["app"]
  try {
    ws = new WebSocket(url);
    ws.onopen = () => {
      reconnectAttempts = 0;
      app.run('handleConnectionStatus', 'connected');

    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle command responses first
        if (data.type === 'system' && data.payload?.eventType === 'command-response') {
          const response = data.payload.response;
          const requestId = response.requestId;

          if (pendingRequests.has(requestId)) {
            const { resolve, reject } = pendingRequests.get(requestId);
            pendingRequests.delete(requestId);

            if (response.success) {
              resolve(response);
            } else {
              reject(new Error(response.error || 'Command failed'));
            }
          }
          return; // Don't pass command responses to main message handler
        }

        // Handle other WebSocket messages
        app.run('handleWebSocketMessage', data);

      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      app.run('handleConnectionStatus', 'disconnected');

      if (reconnectAttempts < maxReconnectAttempts) {
        attemptReconnect();
      }
    };

    ws.onerror = (error) => {
      app.run('handleWebSocketError', error);
    };
  } catch (error) {
    app.run('handleWebSocketError', error);
  }
};

const disconnect = () => {
  if (ws) {
    ws.close();
    ws = null;
  }
};

const sendMessage = (message) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      return false;
    }
  } else {
    return false;
  }
};

const attemptReconnect = () => {
  if (reconnectAttempts < maxReconnectAttempts) {
    reconnectAttempts++;
    setTimeout(() => connect(), reconnectDelay * reconnectAttempts);
  }
};

// World subscription functions
const subscribeToWorld = (worldName) => {
  return new Promise((resolve, reject) => {
    if (!worldName) {
      reject(new Error('Cannot subscribe to empty world name'));
      return;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('WebSocket not connected'));
      return;
    }

    // Unsubscribe from current world first
    if (currentWorldSubscription) {
      unsubscribeFromWorld();
    }

    const timeout = setTimeout(() => reject(new Error('Subscription timeout')), 5000);
    const handleResponse = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Check for subscription success response
        if (data.type === 'success' && data.message && data.message.includes('subscribed to world')) {
          clearTimeout(timeout);
          ws.removeEventListener('message', handleResponse);
          currentWorldSubscription = worldName;

          // Return the world data with agents if available
          const worldData = data.data?.world;
          resolve(worldData || true);
        }
      } catch (error) {
        clearTimeout(timeout);
        ws.removeEventListener('message', handleResponse);
        reject(error);
      }
    };

    ws.addEventListener('message', handleResponse);

    const success = sendMessage({
      type: 'subscribe',
      payload: {
        worldName: worldName
      }
    });

    if (!success) {
      clearTimeout(timeout);
      ws.removeEventListener('message', handleResponse);
      reject(new Error('Failed to send subscription message'));
    }
  });
};

const unsubscribeFromWorld = () => {
  if (!currentWorldSubscription) {
    return true; // Already unsubscribed
  }

  const success = sendMessage({
    type: 'unsubscribe',
    payload: {}
  });

  if (success) {
    currentWorldSubscription = null;
  }

  return success;
};

const sendWorldEvent = (worldName, message, sender = 'user1') => {
  return sendMessage({
    type: 'message',
    payload: {
      worldName: worldName,
      message: message,
      sender: sender
    }
  });
};

const getCurrentWorldSubscription = () => currentWorldSubscription;

// Utilities and export
const isConnected = () => ws && ws.readyState === WebSocket.OPEN;

const getConnectionState = () => {
  if (!ws) return 'disconnected';
  switch (ws.readyState) {
    case WebSocket.CONNECTING: return 'connecting';
    case WebSocket.OPEN: return 'connected';
    case WebSocket.CLOSING: return 'closing';
    case WebSocket.CLOSED: return 'disconnected';
    default: return 'unknown';
  }
};


// Typed command sender
function sendTypedCommand(request) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('WebSocket not connected'));
      return;
    }

    const timeout = setTimeout(() => {
      pendingRequests.delete(request.id);
      reject(new Error('Command timeout'));
    }, commandTimeout); // Use configurable timeout

    // Store the promise handlers for this request
    pendingRequests.set(request.id, {
      resolve: (response) => {
        clearTimeout(timeout);
        resolve(response);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    });

    // Send the command request
    const message = {
      type: 'system',
      payload: {
        eventType: 'command-request',
        request
      }
    };

    const success = sendMessage(message);
    if (!success) {
      pendingRequests.delete(request.id);
      clearTimeout(timeout);
      reject(new Error('Failed to send command request'));
    }
  });
}


// WebSocket-based chat functionality (replaces SSE from api.js)
const sendChatMessage = (worldName, message, sender = 'user1') => {
  return sendWorldEvent(worldName, message, sender);
};

// Enhanced connection management
const ensureConnection = async (maxRetries = 3) => {
  if (isConnected()) return true;

  for (let i = 0; i < maxRetries; i++) {
    connect();
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (isConnected()) return true;
  }

  throw new Error('Failed to establish WebSocket connection');
};

export default {
  connect,
  disconnect,
  attemptReconnect,
  sendMessage,
  isConnected,
  getConnectionState,
  subscribeToWorld,
  unsubscribeFromWorld,
  sendWorldEvent,
  sendChatMessage, // New chat function
  ensureConnection, // New connection helper
  getCurrentWorldSubscription,
  sendTypedCommand, // New typed command function
  getWorlds,
  getAgents,
  getAgent,
  createAgent,
  updateAgent,

};


// World and Agent API Functions

async function getWorlds() {
  const request = createCommandRequest('getWorlds');
  const response = await sendTypedCommand(request);

  if (response.success && response.data) {
    return response.data;
  }
  throw new Error(response.error || 'Failed to get worlds');
}

async function getAgents(worldName) {
  const targetWorld = worldName || currentWorldSubscription;
  if (!targetWorld) {
    throw new Error('World name required or must be subscribed to a world');
  }

  const request = createCommandRequest('getWorld', { worldName: targetWorld });
  const response = await sendTypedCommand(request);

  if (response.success && response.data?.agents) {
    return response.data.agents;
  }
  throw new Error(response.error || 'Failed to get agents');
}

async function getAgent(worldName, agentName) {
  const agents = await getAgents(worldName);
  const agent = agents.find(a => a.name === agentName);
  if (!agent) {
    throw new Error(`Agent '${agentName}' not found`);
  }
  return agent;
}

async function createAgent(worldName, agentData) {
  const targetWorld = worldName || currentWorldSubscription;
  if (!targetWorld) {
    throw new Error('World name required or must be subscribed to a world');
  }

  const { name, description } = agentData;
  if (!name || !description) {
    throw new Error('Agent name and description are required');
  }

  const request = createCommandRequest('createAgent', {
    worldName: targetWorld,
    name,
    description
  });

  const response = await sendTypedCommand(request);

  if (response.success && response.data) {
    return response.data;
  }
  throw new Error(response.error || 'Failed to create agent');
}

async function updateAgent(worldName, agentName, updateData) {
  const targetWorld = worldName || currentWorldSubscription;
  if (!targetWorld) {
    throw new Error('World name required or must be subscribed to a world');
  }

  if (!agentName) {
    throw new Error('Agent name is required');
  }

  // Handle different update types with typed commands
  if (updateData.config) {
    for (const [key, value] of Object.entries(updateData.config)) {
      const request = createCommandRequest('updateAgentConfig', {
        worldName: targetWorld,
        agentName,
        config: { [key]: value }
      });

      const response = await sendTypedCommand(request);
      if (!response.success) {
        throw new Error(response.error || `Failed to update ${key}`);
      }
    }
  }

  if (updateData.prompt) {
    const request = createCommandRequest('updateAgentPrompt', {
      worldName: targetWorld,
      agentName,
      systemPrompt: updateData.prompt
    });

    const response = await sendTypedCommand(request);
    if (!response.success) {
      throw new Error(response.error || 'Failed to update prompt');
    }
  }

  if (updateData.memory) {
    const { action, role, message } = updateData.memory;
    const request = createCommandRequest('updateAgentMemory', {
      worldName: targetWorld,
      agentName,
      action,
      message: action === 'add' ? { role, content: message } : undefined
    });

    const response = await sendTypedCommand(request);
    if (!response.success) {
      throw new Error(response.error || 'Failed to update memory');
    }
  }

  return await getAgent(targetWorld, agentName);
}


export {
  getWorlds,
  getAgents,
  getAgent,
  createAgent,
  updateAgent,
  sendChatMessage, // Export new chat function
  ensureConnection, // Export connection helper
};