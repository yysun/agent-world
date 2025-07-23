/**
 * SSE Client - Server-Sent Events handler for Agent World
 * 
 * Features: Complete SSE streaming, message accumulation, error handling
 * Architecture: Direct AppRun event publishing with streaming state management
 * Replaces complex multi-module approach with unified solution
 * 
 * Changes:
 * - Converted to full TypeScript with proper interfaces
 * - Added type safety for all SSE data structures
 * - Enhanced AppRun integration with typed events
 * - Improved error handling with typed error responses
 * - Removed memorySize tracking for simplified agent management
 * - Consolidated to use messageCount only for agent activity tracking
 */

import app from 'apprun';
import { apiRequest } from './api';

// TypeScript interfaces for SSE data structures
interface SSEBaseData {
  type: string;
  data?: any;
  payload?: any;
  message?: string;
}

interface SSEStreamEvent {
  type: 'start' | 'chunk' | 'end' | 'error';
  messageId?: string;
  sender?: string;
  content?: string;
  accumulatedContent?: string;
  finalContent?: string;
  error?: string;
  worldName?: string;
}

interface SSEStreamingData extends SSEBaseData {
  type: 'sse';
  data: SSEStreamEvent;
}

interface SSEMessageData extends SSEBaseData {
  type: 'message';
  data: {
    type?: string;
    sender?: string;
    agentName?: string;
    content?: string;
    message?: string;
    createdAt?: string;
    worldName?: string;
  };
}

interface SSEErrorData extends SSEBaseData {
  type: 'error';
  message?: string;
}

interface SSEConnectionData extends SSEBaseData {
  type: 'connected';
  payload?: {
    worldName?: string;
  };
}

interface SSECompleteData extends SSEBaseData {
  type: 'complete';
  payload?: any;
}

type SSEData = SSEStreamingData | SSEMessageData | SSEErrorData | SSEConnectionData | SSECompleteData | SSEBaseData;

// Active streaming message interface
interface ActiveStreamMessage {
  content: string;
  sender: string;
  messageId: string;
  isStreaming: boolean;
}

// Streaming state interface
interface StreamingState {
  activeMessages: Map<string, ActiveStreamMessage>;
  currentWorldName: string | null;
}


const publishEvent = (eventType: string, data?: any): void => {
  if (app?.run) {
    app.run(eventType, data);
  } else {
    console.warn('AppRun app not available for event:', eventType);
  }
};

// Streaming state
let streamingState: StreamingState = {
  activeMessages: new Map(),
  currentWorldName: null
};

// Handle SSE data and convert to AppRun events
const handleSSEData = (data: SSEData): void => {
  if (!data || typeof data !== 'object') return;

  if (data.type === 'sse') {
    handleStreamingEvent(data as SSEStreamingData);
  } else if (data.type === 'message') {
    publishEvent('handleMessage', data);
  } else if (data.type === 'response') {
    // Response acknowledgment - just log, don't publish
  } else if (data.type === 'error') {
    publishEvent('handleError', { message: data.message || 'SSE error' });
  } else if (data.type === 'connected') {
    publishEvent('handleConnectionStatus', 'connected');
    streamingState.currentWorldName = (data as SSEConnectionData).payload?.worldName || null;
  } else if (data.type === 'complete') {
    publishEvent('handleComplete', data.payload);
  }
};

/**
 * Handle streaming SSE events (start, chunk, end, error)
 */
const handleStreamingEvent = (data: SSEStreamingData): void => {
  const eventData = data.data;
  if (!eventData) return;

  const messageId = eventData.messageId || 'default';
  const agentName = eventData.sender || 'Agent';

  switch (eventData.type) {
    case 'start':
      // Initialize streaming message
      streamingState.activeMessages.set(messageId, {
        content: '',
        sender: agentName,
        messageId: messageId,
        isStreaming: true
      });

      // Publish start event to AppRun
      publishEvent('handleStreamStart', {
        messageId,
        sender: agentName,
        worldName: eventData.worldName || streamingState.currentWorldName
      });
      break;

    case 'chunk':
      // Update streaming content
      const stream = streamingState.activeMessages.get(messageId);
      if (stream) {
        // Use accumulated content if available, otherwise append
        const newContent = eventData.accumulatedContent !== undefined
          ? eventData.accumulatedContent
          : stream.content + (eventData.content || '');

        stream.content = newContent;

        // Publish chunk event to AppRun
        publishEvent('handleStreamChunk', {
          messageId,
          sender: agentName,
          content: newContent,
          isAccumulated: eventData.accumulatedContent !== undefined,
          worldName: eventData.worldName || streamingState.currentWorldName
        });
      }
      break;

    case 'end':
      // Finalize streaming message
      const endStream = streamingState.activeMessages.get(messageId);
      if (endStream) {
        const finalContent = eventData.finalContent !== undefined
          ? eventData.finalContent
          : endStream.content;

        // Publish end event to AppRun
        publishEvent('handleStreamEnd', {
          messageId,
          sender: agentName,
          content: finalContent,
          worldName: eventData.worldName || streamingState.currentWorldName
        });

        // Clean up streaming state
        streamingState.activeMessages.delete(messageId);

        // If no more active messages, we can consider the streaming session complete
        if (streamingState.activeMessages.size === 0) {
          // Note: Don't cleanup the SSE connection here - let it close naturally
        }
      }
      break;

    case 'error':
      // Handle streaming error
      publishEvent('handleStreamError', {
        messageId,
        sender: agentName,
        error: eventData.error || 'Streaming error',
        worldName: eventData.worldName || streamingState.currentWorldName
      });

      // Clean up streaming state
      streamingState.activeMessages.delete(messageId);
      break;
  }
};

/**
 * Send chat message with SSE streaming (unified function)
 * @param {string} worldName - Name of the world
 * @param {string} message - Message to send
 * @param {string} sender - Sender identifier
 * @param {Function} [onMessage] - Optional callback for messages (for chat-demo.html compatibility)
 * @param {Function} [onError] - Optional callback for errors (for chat-demo.html compatibility)
 * @param {Function} [onComplete] - Optional callback for completion (for chat-demo.html compatibility)
 * @returns {Promise<Function>} Cleanup function
 */
export async function sendChatMessage(
  worldName: string,
  message: string,
  sender: string = 'HUMAN',
  onMessage?: (data: SSEData) => void,
  onError?: (error: Error) => void,
  onComplete?: (data: any) => void
): Promise<() => void> {
  if (!worldName || !message) {
    throw new Error('World name and message are required');
  }

  if (!message.trim()) {
    throw new Error('Message cannot be empty');
  }

  // Set current world context
  streamingState.currentWorldName = worldName;

  const requestBody = { message, sender };

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/chat`, {
    method: 'POST',
    body: JSON.stringify(requestBody),
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let isActive = true;

  const cleanup = (): void => {
    if (isActive) {
      isActive = false;
      try {
        reader.cancel();
      } catch (error) {
        console.warn('Error canceling SSE reader:', error);
      }
    }
  };

  // Process SSE stream (this was missing in api.js!)
  const processStream = async (): Promise<void> => {
    try {
      while (isActive) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;

          if (line.startsWith('data: ')) {
            try {
              const dataContent = line.slice(6).trim();
              if (dataContent === '') continue;

              const data: SSEData = JSON.parse(dataContent);

              // Process SSE data
              handleSSEData(data);

              // Also call optional callbacks for backward compatibility (chat-demo.html)
              if (onMessage) {
                onMessage(data);
              }

              // Handle completion - but don't terminate immediately
              // The stream should continue until we get streaming end events
              if (data.type === 'complete') {
                // Call completion callback if provided
                if (onComplete) {
                  onComplete(data.payload || data);
                }
              }

            } catch (error) {
              console.error('Error parsing SSE data:', error);
              const errorObj = { message: 'Failed to parse SSE data' };
              publishEvent('handleError', errorObj);

              // Call error callback if provided
              if (onError) {
                onError(new Error(errorObj.message));
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('SSE stream error:', error);
      const errorObj = { message: (error as Error).message || 'SSE stream error' };
      publishEvent('handleError', errorObj);

      // Call error callback if provided
      if (onError) {
        onError(error as Error);
      }
    } finally {
      cleanup();
    }
  };

  // Start processing stream
  processStream();

  return cleanup;
}

// TypeScript interfaces for AppRun state and event data
interface StreamStartData {
  messageId: string;
  sender: string;
  worldName?: string;
}

interface StreamChunkData {
  messageId: string;
  sender: string;
  content: string;
  isAccumulated: boolean;
  worldName?: string;
}

interface StreamEndData {
  messageId: string;
  sender: string;
  content: string;
  worldName?: string;
}

interface StreamErrorData {
  messageId: string;
  sender: string;
  error: string;
  worldName?: string;
}

interface MessageData {
  data?: {
    type?: string;
    sender?: string;
    agentName?: string;
    content?: string;
    message?: string;
    createdAt?: string;
    worldName?: string;
  };
}

interface ErrorData {
  message: string;
}

// Base state interface for AppRun components using SSE
export interface SSEComponentState {
  messages: Array<{
    id: number | string;
    type: string;
    sender: string;
    text: string;
    createdAt: string;
    worldName?: string;
    isStreaming?: boolean;
    streamComplete?: boolean;
    hasError?: boolean;
    errorMessage?: string;
    messageId?: string;
  }>;
  worldName?: string;
  connectionStatus?: string;
  wsError?: string | null;
  needScroll?: boolean;
}

/**
 * AppRun event handlers for SSE events
 * These are the same handlers that home.js needs in its update object
 */

// Handle streaming start events
export const handleStreamStart = <T extends SSEComponentState>(state: T, data: StreamStartData): T => {
  const { messageId, sender, worldName } = data;

  return {
    ...state,
    messages: [...(state.messages || []), {
      id: Date.now() + Math.random(),
      type: 'agent-stream',
      sender: sender || 'Agent',
      text: '',
      createdAt: new Date().toISOString(),
      worldName: worldName || state.worldName,
      isStreaming: true,
      messageId: messageId
    }],
    needScroll: true
  };
};

// Handle streaming chunk events
export const handleStreamChunk = <T extends SSEComponentState>(state: T, data: StreamChunkData): T => {
  const { messageId, sender, content, isAccumulated } = data;
  const messages = [...(state.messages || [])];

  // Find the streaming message to update
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].isStreaming &&
      (messages[i].messageId === messageId ||
        (!messageId && messages[i].sender === sender && messages[i].type === 'agent-stream'))) {

      // Update with content
      messages[i] = {
        ...messages[i],
        text: content || '',
        createdAt: new Date().toISOString()
      };

      return {
        ...state,
        messages,
        needScroll: true
      };
    }
  }

  // If no streaming message found, create new one
  return {
    ...state,
    messages: [...messages, {
      id: Date.now() + Math.random(),
      type: 'agent-stream',
      sender: sender || 'Agent',
      text: content || '',
      createdAt: new Date().toISOString(),
      worldName: data.worldName || state.worldName,
      isStreaming: true,
      messageId: messageId
    }],
    needScroll: true
  };
};

// Handle streaming end events
export const handleStreamEnd = <T extends SSEComponentState>(state: T, data: StreamEndData): T => {
  const { messageId, sender, content } = data;

  // Filter out the streaming message to prevent duplication
  const messages = (state.messages || []).filter(msg => {
    // Remove the streaming message that matches the messageId or sender
    if (msg.isStreaming &&
      (msg.messageId === messageId ||
        (!messageId && msg.sender === sender && msg.type === 'agent-stream'))) {
      return false; // Remove this message
    }
    return true; // Keep all other messages
  });

  return {
    ...state,
    messages
  };
};

// Handle streaming error events
export const handleStreamError = <T extends SSEComponentState>(state: T, data: StreamErrorData): T => {
  const { messageId, sender, error } = data;

  const messages = (state.messages || []).map(msg => {
    if (msg.isStreaming &&
      (msg.messageId === messageId ||
        (!messageId && msg.sender === sender && msg.type === 'agent-stream'))) {
      return {
        ...msg,
        isStreaming: false,
        hasError: true,
        errorMessage: error
      };
    }
    return msg;
  });

  return {
    ...state,
    messages
  };
};

// Handle regular messages
export const handleMessage = <T extends SSEComponentState>(state: T, data: MessageData): T => {
  const messageData = data.data || {};
  const newMessage = {
    id: Date.now() + Math.random(),
    type: messageData.type || 'message',
    sender: messageData.sender || messageData.agentName || 'Agent',
    text: messageData.content || messageData.message || '',
    createdAt: messageData.createdAt || new Date().toISOString(),
    worldName: messageData.worldName || state.worldName
  };

  return {
    ...state,
    messages: [...(state.messages || []), newMessage],
    needScroll: true
  };
};

// Handle connection status changes
export const handleConnectionStatus = <T extends SSEComponentState>(state: T, status: string): T => {
  return {
    ...state,
    connectionStatus: status,
    wsError: status === 'error' ? state.wsError : null
  };
};

// Handle errors
export const handleError = <T extends SSEComponentState>(state: T, error: ErrorData): T => {
  const errorMessage = error.message || 'SSE error';

  // Add error message to conversation
  const errorMsg = {
    id: Date.now() + Math.random(),
    type: 'error',
    sender: 'System',
    text: errorMessage,
    createdAt: new Date().toISOString(),
    worldName: state.worldName,
    hasError: true
  };

  return {
    ...state,
    wsError: errorMessage,
    messages: [...(state.messages || []), errorMsg],
    needScroll: true
  };
};

// Handle completion
export const handleComplete = <T extends SSEComponentState>(state: T, payload: any): T => {
  return {
    ...state,
    connectionStatus: 'completed'
  };
};
