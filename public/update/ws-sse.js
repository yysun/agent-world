/**
 * Message Event Handlers - Now supporting both WebSocket (legacy) and REST + SSE
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
 * - Safe state handling with fallbacks for undefined properties
 * - **NEW**: REST API + SSE handlers for migration from WebSocket
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
 * - Fixed TypeError: state.messages is not iterable by adding safe state fallbacks
 * - Added proper null/undefined checks for state.messages and state.worldName
 * - **MIGRATION**: Added REST API compatible handlers (handleRestMessage, handleRestError)
 * - Removed WebSocket dependency from this module
 */

// Handle SSE events with new eventType structure
const handleSSEEvent = (state, messageData) => {
  // Ensure state has required properties with fallbacks
  const safeState = {
    ...state,
    messages: state.messages || [],
    worldName: state.worldName || null
  };

  const messageId = messageData.messageId || messageData.id;
  const agentName = messageData.agentName || messageData.sender || 'Agent';
  const chunk = messageData.content || messageData.chunk || messageData.message || '';
  const sseType = messageData.type; // 'start', 'chunk', 'end', 'error'


  switch (sseType) {
    case 'start':
      // Create new streaming message block
      return {
        ...safeState,
        messages: [...safeState.messages, {
          id: Date.now() + Math.random(),
          type: 'agent-stream',
          sender: agentName,
          text: '',
          timestamp: messageData.timestamp || new Date().toISOString(),
          worldName: messageData.worldName || safeState.worldName,
          isStreaming: true,
          messageId: messageId
        }],
        needScroll: true
      };

    case 'chunk':
      // Find existing streaming message for this agent/messageId

      // Look for existing streaming message by messageId first, then by agent name
      let existingIndex = safeState.messages.findLastIndex(msg =>
        msg.isStreaming &&
        msg.messageId === messageId
      );

      // If no message found by messageId, look for the last streaming message from this agent
      if (existingIndex === -1) {
        existingIndex = safeState.messages.findLastIndex(msg =>
          msg.isStreaming &&
          msg.sender === agentName &&
          msg.type === 'agent-stream'
        );
      }

      if (existingIndex !== -1) {
        // Update existing message with accumulated content
        const updatedMessages = [...safeState.messages];
        const currentText = updatedMessages[existingIndex].text || '';
        updatedMessages[existingIndex] = {
          ...updatedMessages[existingIndex],
          text: currentText + chunk,
          timestamp: messageData.timestamp || new Date().toISOString(),
          messageId: messageId // Ensure messageId is set
        };

        return { ...safeState, messages: updatedMessages, needScroll: true };
      } else {
        // Create new streaming message block if none exists (handles missing 'start' event)

        return {
          ...safeState,
          messages: [...safeState.messages, {
            id: Date.now() + Math.random(),
            type: 'agent-stream',
            sender: agentName,
            text: chunk,
            timestamp: messageData.timestamp || new Date().toISOString(),
            worldName: messageData.worldName || safeState.worldName,
            isStreaming: true,
            messageId: messageId
          }],
          needScroll: true
        };
      }

    case 'end':
      // Mark streaming as complete for the message block
      const updatedMessages = safeState.messages.map(msg =>
        msg.isStreaming &&
          msg.sender === agentName &&
          (msg.messageId === messageId || (!messageId && msg.type === 'agent-stream'))
          ? { ...msg, isStreaming: false }
          : msg
      );

      return { ...safeState, messages: updatedMessages };

    case 'error':
      // Mark streaming as complete and add error indicator
      const errorUpdatedMessages = safeState.messages.map(msg =>
        msg.isStreaming &&
          msg.sender === agentName &&
          (msg.messageId === messageId || (!messageId && msg.type === 'agent-stream'))
          ? { ...msg, isStreaming: false, hasError: true, errorMessage: messageData.error }
          : msg
      );

      return { ...safeState, messages: errorUpdatedMessages };

    default:
      return safeState;
  }
};

export const handleWebSocketMessage = (state, messageData) => {
  // Ensure state has required properties with fallbacks
  const safeState = {
    ...state,
    messages: state.messages || [],
    worldName: state.worldName || null
  };

  const createMessage = (type, content) => ({
    id: Date.now() + Math.random(),
    type,
    sender: messageData.sender || messageData.agentName || type,
    text: content || messageData.message || messageData.content || JSON.stringify(messageData),
    timestamp: messageData.timestamp || new Date().toISOString(),
    worldName: messageData.worldName || safeState.worldName,
    ...(type === 'sse' && { isStreaming: true })
  });

  // Check if this is an SSE event first (new structure with eventType)
  if (messageData.eventType === 'sse') {
    return handleSSEEvent(safeState, messageData);
  }

  switch (messageData.type) {
    case 'system':
    case 'world':
    case 'message':

      return {
        ...safeState,
        messages: [...safeState.messages, createMessage(messageData.type)],
        needScroll: true
      };

    case 'sse':
      // Backward compatibility for old SSE format
      return handleSSEEvent(safeState, messageData);

    case 'error':
      return { ...safeState, wsError: messageData.error };

    case 'success':
      // Command response - check if there's a data field with content to display
      if (messageData.data) {
        if (messageData.data.type === 'system' && messageData.data.content) {
          return {
            ...safeState,
            messages: [...safeState.messages, createMessage('system', messageData.data.content)],
            needScroll: true
          };
        } else if (messageData.data.type === 'error' && messageData.data.error) {
          return {
            ...safeState,
            messages: [...safeState.messages, createMessage('error', messageData.data.error)],
            needScroll: true
          };
        }
      }
      // Otherwise don't add to messages
      return safeState;

    case 'connected':
      // Initial connection message
      return { ...safeState, connectionStatus: 'connected' };

    case 'welcome':
      // No longer need WebSocket subscription for REST + SSE architecture
      return { ...safeState, connectionStatus: 'connected' };

    default:
      return safeState;
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

// REST API compatible handlers (adapted from WebSocket handlers)
export const handleRestMessage = (state, data) => {
  // Ensure state has required properties with fallbacks
  const safeState = {
    ...state,
    messages: state.messages || [],
    worldName: state.worldName || null
  };

  // Handle SSE messages from REST API
  if (data.type === 'sse') {
    return handleSSEEvent(safeState, data.payload);
  } else if (data.type === 'message') {
    // Handle regular messages
    const messageData = data.payload;
    const newMessage = {
      id: Date.now() + Math.random(),
      type: messageData.type || 'message',
      sender: messageData.sender || messageData.agentName || 'Agent',
      text: messageData.content || messageData.message || '',
      timestamp: messageData.timestamp || new Date().toISOString(),
      worldName: messageData.worldName || safeState.worldName
    };

    return {
      ...safeState,
      messages: [...safeState.messages, newMessage],
      needScroll: true
    };
  }

  return safeState;
};

export const handleRestError = (state, error) => {
  const errorMessage = error.message || 'REST API error';

  // Add error message to conversation
  const errorMsg = {
    id: Date.now() + Math.random(),
    type: 'error',
    sender: 'System',
    text: errorMessage,
    timestamp: new Date().toISOString(),
    worldName: state.worldName,
    hasError: true
  };

  return {
    ...state,
    wsError: errorMessage,
    messages: [...state.messages, errorMsg],
    needScroll: true
  };
};
