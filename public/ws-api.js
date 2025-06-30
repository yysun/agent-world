/**
 * WebSocket API Module - Real-time world communication and subscription management
 *
 * Features:
 * - Connection management with automatic reconnection
 * - World subscription system with proper cleanup
 * - JSON message protocol and event routing
 * - AppRun integration via callbacks
 *
 * Implementation: Function-based module with automatic unsubscribe/subscribe
 * flow for world switching and bidirectional event handling.
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
  if (!worldName) {
    console.warn('Cannot subscribe to empty world name');
    return false;
  }

  // Unsubscribe from current world first
  if (currentWorldSubscription) {
    unsubscribeFromWorld();
  }

  const success = sendMessage({
    type: 'subscribe',
    payload: {
      worldName: worldName
    }
  });

  if (success) {
    currentWorldSubscription = worldName;
  }

  return success;
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
  getCurrentWorldSubscription
};
