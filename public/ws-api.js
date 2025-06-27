/**
 * WebSocket API Module
 * 
 * Features:
 * - WebSocket connection management with automatic reconnection
 * - JSON message protocol with error handling
 * - Connection lifecycle and state management
 * 
 * Implementation:
 * - Function-based approach using native WebSocket API
 * - Event-driven messaging through app.run callbacks
 */

// WebSocket state
let ws = null;
const url = `ws://localhost:3000/ws`;
const userId = 'user1';
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 1000;

// Core connection functions
const connect = () => {
  try {
    ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectAttempts = 0;
      app.run('handleConnectionStatus', 'connected');
      send({
        type: 'user_connect',
        userId: userId,
        timestamp: new Date().toISOString()
      });
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

const send = (message) => {
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

const sendChatMessage = (worldName, message) => {
  return send({
    type: 'chat_message',
    worldName: worldName,
    userId: userId,
    message: message,
    timestamp: new Date().toISOString()
  });
};

// Utility functions
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

// Export API
export default {
  connect,
  disconnect,
  attemptReconnect,
  send,
  sendChatMessage,
  isConnected,
  getConnectionState
};
