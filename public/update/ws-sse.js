/**
 * WebSocket Message Event Handlers
 *
 * Features:
 * - Unified message creation with type-specific handling
 * - SSE chunk grouping into single message blocks by agent and messageId
 * - Support for new eventType structure (eventType: 'sse', type: 'chunk')
 * - Backward compatibility with old SSE format
 * - Connection status management
 * - Error handling and logging
 * - Auto-subscription on welcome messages
 * - Proper streaming lifecycle (start, chunk, end, error)
 * - Auto-scroll to bottom when messages are added or updated
 * - Success response handling with nested system message display
 * - Error response handling within success messages for command failures
 *
 * Changes:
 * - Added handleSSEEvent function for new WebSocket server structure
 * - Enhanced agent-based message grouping with messageId tracking
 * - Improved SSE event type handling (start, chunk, end, error)
 * - Added error state handling for streaming messages
 * - Maintains backward compatibility with old message format
 * - Added auto-scroll functionality for real-time message updates
 * - Enhanced success response handling to display nested system messages
 * - Added error message handling within success responses for command failures
 */

import wsApi from '../ws-api.js';

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

      // Look for existing streaming message by messageId first, then by agent name
      let existingIndex = state.messages.findLastIndex(msg =>
        msg.isStreaming &&
        msg.messageId === messageId
      );

      // If no message found by messageId, look for the last streaming message from this agent
      if (existingIndex === -1) {
        existingIndex = state.messages.findLastIndex(msg =>
          msg.isStreaming &&
          msg.sender === agentName &&
          msg.type === 'agent-stream'
        );
      }

      if (existingIndex !== -1) {
        // Update existing message with accumulated content
        const updatedMessages = [...state.messages];
        const currentText = updatedMessages[existingIndex].text || '';
        updatedMessages[existingIndex] = {
          ...updatedMessages[existingIndex],
          text: currentText + chunk,
          timestamp: messageData.timestamp || new Date().toISOString(),
          messageId: messageId // Ensure messageId is set
        };

        return { ...state, messages: updatedMessages, needScroll: true };
      } else {
        // Create new streaming message block if none exists (handles missing 'start' event)

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
      return state;
  }
};

export const handleWebSocketMessage = (state, messageData) => {
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
      return { ...state, wsError: messageData.error };

    case 'success':
      // Command response - check if there's a data field with content to display
      if (messageData.data) {
        if (messageData.data.type === 'system' && messageData.data.content) {
          return {
            ...state,
            messages: [...state.messages, createMessage('system', messageData.data.content)],
            needScroll: true
          };
        } else if (messageData.data.type === 'error' && messageData.data.error) {
          return {
            ...state,
            messages: [...state.messages, createMessage('error', messageData.data.error)],
            needScroll: true
          };
        }
      }
      // Otherwise don't add to messages
      return state;

    case 'connected':
      // Initial connection message
      return { ...state, connectionStatus: 'connected' };

    case 'welcome':
      if (state.worldName && wsApi.isConnected()) {
        wsApi.subscribeToWorld(state.worldName);
      }
      return { ...state, connectionStatus: 'connected' };

    default:
      return state;
  }
};

export const handleConnectionStatus = (state, status) => {
  return {
    ...state,
    connectionStatus: status,
    wsError: status === 'error' ? state.wsError : null
  };
};

export const handleWebSocketError = (state, error) => {
  return {
    ...state,
    connectionStatus: 'error',
    wsError: error.message || 'WebSocket connection error'
  };
};
