/**
 * WebSocket API Module - Real-time world communication and CRUD operations
 *
 * Features: Connection management, world subscription, WebSocket commands, 
 * world/agent CRUD operations, promise-based async API with error handling
 *
 * Implementation: Function-based module with subscription lifecycle management
 * and WebSocket command protocol for world/agent operations
 */

// State management
let ws = null;
let currentWorldSubscription = null;
let reconnectAttempts = 0;

// Constants
const url = `ws://localhost:3000/ws`;
const userId = 'user1';
const maxReconnectAttempts = 5;
const reconnectDelay = 1000;

// Connection functions
const connect = () => {
  try {
    ws = new WebSocket(url);
    ws.onopen = () => {
      reconnectAttempts = 0;
      app.run('handleConnectionStatus', 'connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        app.run('handleWebSocketMessage', data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      app.run('handleConnectionStatus', 'disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      app.run('handleWebSocketError', error);
    };
  } catch (error) {
    console.error('Error connecting to WebSocket:', error);
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
      app.run('handleWebSocketError', error);
      return false;
    }
  } else {
    console.warn('WebSocket not connected, cannot send message');
    return false;
  }
};

const attemptReconnect = () => {
  if (reconnectAttempts < maxReconnectAttempts) {
    reconnectAttempts++;
    console.log(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);
    setTimeout(() => connect(), reconnectDelay * reconnectAttempts);
  } else {
    console.error('Max reconnection attempts reached');
  }
};

// World subscription functions
const subscribeToWorld = (worldName) => {
  return new Promise((resolve, reject) => {
    if (!worldName) {
      console.warn('Cannot subscribe to empty world name');
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
          resolve(true);
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
    type: 'event',
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


// WebSocket command helper
function sendCommand(command, worldName = null) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('WebSocket not connected'));
      return;
    }

    const timeout = setTimeout(() => reject(new Error('Command timeout')), 5000);
    const handleResponse = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Only handle command response messages, ignore other WebSocket messages
        if (data.type === 'success' || data.type === 'error' ||
          (data.type === 'connected') || // Initial connection message
          (data.message && (data.message.includes('Command') || data.message.includes('Successfully')))) {
          clearTimeout(timeout);
          ws.removeEventListener('message', handleResponse);
          resolve(data);
        }
        // Ignore other message types (events, subscriptions, etc.)
      } catch (error) {
        clearTimeout(timeout);
        ws.removeEventListener('message', handleResponse);
        reject(error);
      }
    };

    ws.addEventListener('message', handleResponse);

    // Build payload - only include worldName if it's not null/undefined
    const payload = { message: command };
    const targetWorldName = worldName || currentWorldSubscription;
    if (targetWorldName) {
      payload.worldName = targetWorldName;
    }

    ws.send(JSON.stringify({
      type: 'system',
      payload: payload
    }));
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

// Auto-reconnect with exponential backoff
const setupAutoReconnect = () => {
  if (ws) {
    ws.onclose = () => {
      console.log('WebSocket disconnected');
      app.run('handleConnectionStatus', 'disconnected');

      if (reconnectAttempts < maxReconnectAttempts) {
        attemptReconnect();
      }
    };
  }
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
  setupAutoReconnect, // New auto-reconnect setup
  getCurrentWorldSubscription,
  sendCommand,
  getWorlds,
  getAgents,
  getAgent,
  createAgent,
  updateAgent
};


// World and Agent API Functions

async function getWorlds() {
  const response = await sendCommand('/getWorlds', null); // Pass null for global command
  if (response.type === 'success' && response.data) {
    return response.data; // Direct access - no double nesting
  }
  throw new Error(response.data?.error || 'Failed to get worlds');
}

async function getAgents(worldName) {
  const targetWorld = worldName || currentWorldSubscription;
  if (!targetWorld) {
    throw new Error('World name required or must be subscribed to a world');
  }

  const response = await sendCommand('/getWorld', targetWorld);
  if (response.type === 'success' && response.data?.agents) {
    return response.data.agents; // Direct access - no double nesting
  }
  throw new Error(response.data?.error || 'Failed to get agents');
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

  const response = await sendCommand(`/addAgent ${name} ${description}`, targetWorld);
  if (response.type === 'success' && response.data) {
    return response.data; // Direct access - no double nesting
  }
  throw new Error(response.data?.error || 'Failed to create agent');
}

async function updateAgent(worldName, agentName, updateData) {
  const targetWorld = worldName || currentWorldSubscription;
  if (!targetWorld) {
    throw new Error('World name required or must be subscribed to a world');
  }

  if (!agentName) {
    throw new Error('Agent name is required');
  }

  // Handle different update types
  if (updateData.config) {
    for (const [key, value] of Object.entries(updateData.config)) {
      const response = await sendCommand(`/updateAgentConfig ${agentName} ${key} ${value}`, targetWorld);
      if (response.type !== 'success') {
        throw new Error(response.data?.error || `Failed to update ${key}`);
      }
    }
  }

  if (updateData.prompt) {
    const response = await sendCommand(`/updateAgentPrompt ${agentName} ${updateData.prompt}`, targetWorld);
    if (response.type !== 'success') {
      throw new Error(response.data?.error || 'Failed to update prompt');
    }
  }

  if (updateData.memory) {
    const { action, role, message } = updateData.memory;
    const response = await sendCommand(`/updateAgentMemory ${agentName} ${action} ${role} ${message}`, targetWorld);
    if (response.type !== 'success') {
      throw new Error(response.data?.error || 'Failed to update memory');
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