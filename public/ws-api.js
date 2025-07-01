/**
 * WebSocket API Module - Real-time world communication, CRUD operations, and message handling
 *
 * Features: Connection management with auto-reconnect, world subscription, WebSocket commands, 
 * world/agent CRUD operations, promise-based async API with error handling,
 * unified message creation with type-specific handling, SSE chunk grouping 
 * into single message blocks by agent and messageId, support for new eventType 
 * structure (eventType: 'sse', type: 'chunk'), backward compatibility with old 
 * SSE format, connection status management, error handling and logging, 
 * auto-subscription on welcome messages, proper streaming lifecycle 
 * (start, chunk, end, error), auto-scroll to bottom when messages are added or updated
 *
 * Implementation: Function-based module with subscription lifecycle management,
 * WebSocket command protocol for world/agent operations, comprehensive 
 * message event handlers for real-time communication, and consolidated
 * connection management with built-in auto-reconnect functionality
 *
 * Changes:
 * - Merged ws-message.js functionality into ws-api.js
 * - Consolidated WebSocket event handlers to remove redundancy
 * - Enhanced agent-based message grouping with messageId tracking
 * - Improved SSE event type handling (start, chunk, end, error)
 * - Added error state handling for streaming messages
 * - Maintains backward compatibility with old message format
 * - Added auto-scroll functionality for real-time message updates
 * - Integrated auto-reconnect directly into connection management
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

      if (reconnectAttempts < maxReconnectAttempts) {
        attemptReconnect();
      }
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


// Message Event Handlers (from ws-message.js)

// Handle SSE events with new eventType structure
const handleSSEEvent = (state, messageData) => {
  const messageId = messageData.messageId || messageData.id;
  const agentName = messageData.agentName || messageData.sender || 'Agent';
  const chunk = messageData.content || messageData.chunk || messageData.message || '';
  const sseType = messageData.type; // 'start', 'chunk', 'end', 'error'

  switch (sseType) {
    case 'start':
      // Create new streaming message block
      return {
        ...state,
        messages: [...state.messages, {
          id: Date.now() + Math.random(),
          type: 'agent-stream',
          sender: agentName,
          text: '',
          timestamp: messageData.timestamp || new Date().toISOString(),
          worldName: messageData.worldName || state.worldName,
          isStreaming: true,
          messageId: messageId
        }],
        needScroll: true
      };

    case 'chunk':
      // Find existing streaming message for this agent/messageId
      const existingIndex = state.messages.findLastIndex(msg =>
        msg.isStreaming &&
        msg.sender === agentName &&
        (msg.messageId === messageId || (!messageId && msg.type === 'agent-stream'))
      );

      if (existingIndex !== -1) {
        // Update existing message with accumulated content
        const updatedMessages = [...state.messages];
        updatedMessages[existingIndex] = {
          ...updatedMessages[existingIndex],
          text: updatedMessages[existingIndex].text + chunk,
          timestamp: messageData.timestamp || new Date().toISOString()
        };

        return { ...state, messages: updatedMessages, needScroll: true };
      } else {
        // Create new streaming message block if none exists
        return {
          ...state,
          messages: [...state.messages, {
            id: Date.now() + Math.random(),
            type: 'agent-stream',
            sender: agentName,
            text: chunk,
            timestamp: messageData.timestamp || new Date().toISOString(),
            worldName: messageData.worldName || state.worldName,
            isStreaming: true,
            messageId: messageId
          }],
          needScroll: true
        };
      }

    case 'end':
      // Mark streaming as complete for the message block
      const updatedMessages = state.messages.map(msg =>
        msg.isStreaming &&
          msg.sender === agentName &&
          (msg.messageId === messageId || (!messageId && msg.type === 'agent-stream'))
          ? { ...msg, isStreaming: false }
          : msg
      );

      return { ...state, messages: updatedMessages };

    case 'error':
      console.error('SSE error for agent:', agentName, messageData.error);
      // Mark streaming as complete and add error indicator
      const errorUpdatedMessages = state.messages.map(msg =>
        msg.isStreaming &&
          msg.sender === agentName &&
          (msg.messageId === messageId || (!messageId && msg.type === 'agent-stream'))
          ? { ...msg, isStreaming: false, hasError: true, errorMessage: messageData.error }
          : msg
      );

      return { ...state, messages: errorUpdatedMessages };

    default:
      console.warn('Unknown SSE type:', sseType);
      return state;
  }
};

const handleWebSocketMessage = (state, messageData) => {
  const createMessage = (type, content) => ({
    id: Date.now() + Math.random(),
    type,
    sender: messageData.sender || messageData.agentName || type,
    text: content || messageData.message || messageData.content || JSON.stringify(messageData),
    timestamp: messageData.timestamp || new Date().toISOString(),
    worldName: messageData.worldName || state.worldName,
    ...(type === 'sse' && { isStreaming: true })
  });

  // Check if this is an SSE event first (new structure with eventType)
  if (messageData.eventType === 'sse') {
    return handleSSEEvent(state, messageData);
  }

  switch (messageData.type) {
    case 'system':
    case 'world':
    case 'message':
      return {
        ...state,
        messages: [...state.messages, createMessage(messageData.type)],
        needScroll: true
      };

    case 'sse':
      // Backward compatibility for old SSE format
      return handleSSEEvent(state, messageData);

    case 'error':
      console.error('WebSocket error:', messageData.error);
      return { ...state, wsError: messageData.error };

    case 'success':
      // Command response - don't add to messages, just log for debugging
      console.log('Command response:', messageData);
      return state;

    case 'connected':
      // Initial connection message
      return { ...state, connectionStatus: 'connected' };

    case 'welcome':
      if (state.worldName && isConnected()) {
        subscribeToWorld(state.worldName);
      }
      return { ...state, connectionStatus: 'connected' };

    default:
      console.warn('Unknown WebSocket message type:', messageData.type, messageData);
      return state;
  }
};

const handleConnectionStatus = (state, status) => {
  return {
    ...state,
    connectionStatus: status,
    wsError: status === 'error' ? state.wsError : null
  };
};

const handleWebSocketError = (state, error) => {
  console.error('WebSocket error:', error);
  return {
    ...state,
    connectionStatus: 'error',
    wsError: error.message || 'WebSocket connection error'
  };
};

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
  sendCommand,
  getWorlds,
  getAgents,
  getAgent,
  createAgent,
  updateAgent,
  // Message handling functions
  handleWebSocketMessage,
  handleConnectionStatus,
  handleWebSocketError,
  handleSSEEvent
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
  // Message handling functions
  handleWebSocketMessage,
  handleConnectionStatus,
  handleWebSocketError,
  handleSSEEvent
};