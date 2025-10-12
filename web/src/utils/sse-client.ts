/**
 * SSE Client - Server-Sent Events handler for real-time chat streaming
 * 
 * Features:
 * - Complete SSE streaming with message accumulation and error handling
 * - Direct AppRun event publishing for real-time UI updates
 * - Type-safe interfaces with consolidated streaming state management
 */

import app from 'apprun';
import { apiRequest } from '../api';
import type {
  SSEComponentState,
  StreamStartData,
  StreamChunkData,
  StreamEndData,
  StreamErrorData,
} from '../types';

// SSE data structure interfaces
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
  payload?: { worldName?: string; };
}

interface SSECompleteData extends SSEBaseData {
  type: 'complete';
  payload?: any;
}

type SSEData = SSEStreamingData | SSEMessageData | SSEErrorData | SSEConnectionData | SSECompleteData | SSEBaseData;

// Streaming state management
interface ActiveStreamMessage {
  content: string;
  sender: string;
  messageId: string;
  isStreaming: boolean;
}

interface StreamingState {
  activeMessages: Map<string, ActiveStreamMessage>;
  currentWorldName: string | null;
}


// Utility functions
const publishEvent = (eventType: string, data?: any): void => {
  if (app?.run) {
    app.run(eventType, data);
  } else {
    console.warn('AppRun app not available for event:', eventType);
  }
};

// Global streaming state
let streamingState: StreamingState = {
  activeMessages: new Map(),
  currentWorldName: null
};

// Main SSE data handler - routes events to appropriate processors
const handleSSEData = (data: SSEData): void => {
  if (!data || typeof data !== 'object') return;

  switch (data.type) {
    case 'sse':
      handleStreamingEvent(data.data);
      break;
    case 'system':
      publishEvent('handleSystemEvent', data.data);
      break;
    case 'message':
      publishEvent('handleMessageEvent', data.data);
      break;
    case 'error':
      publishEvent('handleError', { message: data.message || 'SSE error' });
      break;
  }
};

/**
 * Process streaming SSE events and manage message state
 */
const handleStreamingEvent = (data: SSEStreamingData): void => {
  const eventData = data as any;
  if (!eventData) return;
  const messageId = eventData.messageId;
  const agentName = eventData.agentName;

  switch (eventData.type) {
    case 'start':
      streamingState.activeMessages.set(messageId, {
        content: '',
        sender: agentName,
        messageId: messageId,
        isStreaming: true
      });

      publishEvent('handleStreamStart', {
        messageId,
        sender: agentName,
        worldName: eventData.worldName || streamingState.currentWorldName
      });
      break;

    case 'chunk':
      const stream = streamingState.activeMessages.get(messageId);
      if (stream) {
        const newContent = eventData.accumulatedContent !== undefined
          ? eventData.accumulatedContent
          : stream.content + (eventData.content || '');

        stream.content = newContent;

        publishEvent('handleStreamChunk', {
          messageId,
          sender: agentName,
          content: newContent,
          isAccumulated: eventData.accumulatedContent !== undefined,
          worldName: eventData.worldName || streamingState.currentWorldName
        });
      }
      break;

    // PHASE 2.2 ENHANCEMENT: Tool-specific event handlers
    case 'tool-start':
      publishEvent('handleToolStart', {
        messageId,
        sender: agentName,
        toolExecution: eventData.toolExecution,
        worldName: eventData.worldName || streamingState.currentWorldName
      });
      break;

    case 'tool-progress':
      publishEvent('handleToolProgress', {
        messageId,
        sender: agentName,
        toolExecution: eventData.toolExecution,
        worldName: eventData.worldName || streamingState.currentWorldName
      });
      break;

    case 'tool-result':
      publishEvent('handleToolResult', {
        messageId,
        sender: agentName,
        toolExecution: eventData.toolExecution,
        worldName: eventData.worldName || streamingState.currentWorldName
      });
      break;

    case 'tool-error':
      publishEvent('handleToolError', {
        messageId,
        sender: agentName,
        toolExecution: eventData.toolExecution,
        worldName: eventData.worldName || streamingState.currentWorldName
      });
      break;

    case 'end':
      const endStream = streamingState.activeMessages.get(messageId);
      if (endStream) {
        const finalContent = eventData.finalContent !== undefined
          ? eventData.finalContent
          : endStream.content;

        publishEvent('handleStreamEnd', {
          messageId,
          sender: agentName,
          content: finalContent,
          worldName: eventData.worldName || streamingState.currentWorldName
        });

        streamingState.activeMessages.delete(messageId);
      }
      break;

    case 'error':
      publishEvent('handleStreamError', {
        messageId,
        sender: agentName,
        error: eventData.error || 'Streaming error',
        worldName: eventData.worldName || streamingState.currentWorldName
      });

      streamingState.activeMessages.delete(messageId);
      break;

    case 'log':
      // Handle log events from the server - ensure they're always processed
      publishEvent('handleLogEvent', {
        messageId: eventData.messageId,
        logEvent: eventData.logEvent,
        worldName: eventData.worldName || streamingState.currentWorldName
      });
      break;
  }
};

/**
 * Send chat message with SSE streaming response
 * @param worldName - Target world name
 * @param message - Message content to send
 * @param sender - Message sender identifier (default: 'HUMAN')
 * @param onMessage - Optional callback for legacy compatibility
 * @param onError - Optional error callback for legacy compatibility
 * @param onComplete - Optional completion callback for legacy compatibility
 * @returns Cleanup function to cancel the stream
 */
export async function sendChatMessage(
  worldName: string,
  message: string,
  sender: string = 'HUMAN',
  onMessage?: (data: SSEData) => void,
  onError?: (error: Error) => void,
  onComplete?: (data: any) => void
): Promise<() => void> {
  if (!worldName || !message?.trim()) {
    throw new Error('World name and non-empty message are required');
  }

  streamingState.currentWorldName = worldName;

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message, sender }),
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

  // Process SSE stream
  const processStream = async (): Promise<void> => {
    try {
      while (isActive) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '' || !line.startsWith('data: ')) continue;

          try {
            const dataContent = line.slice(6).trim();
            if (dataContent === '') continue;

            const data: SSEData = JSON.parse(dataContent);

            handleSSEData(data);

            // Legacy callback support
            onMessage?.(data);
            if (data.type === 'complete') {
              onComplete?.(data.payload || data);
            }

          } catch (error) {
            console.error('Error parsing SSE data:', error);
            const errorObj = { message: 'Failed to parse SSE data' };
            publishEvent('handleError', errorObj);
            onError?.(new Error(errorObj.message));
          }
        }
      }
    } catch (error) {
      console.error('SSE stream error:', error);
      const errorObj = { message: (error as Error).message || 'SSE stream error' };
      publishEvent('handleError', errorObj);
      onError?.(error as Error);
    } finally {
      cleanup();
    }
  };

  processStream();
  return cleanup;
}

/**
 * AppRun event handlers for SSE streaming events
 * These handlers manage UI state updates during streaming
 */

// Initialize streaming message display
export const handleStreamStart = <T extends SSEComponentState>(state: T, data: StreamStartData): T => {
  const { messageId, sender } = data;
  state.messages = state.messages.filter(msg => !msg.userEntered);
  state.messages.push({
    sender: sender,
    text: '...',
    isStreaming: true,
    messageId: messageId,
  } as any);
  const newState = { ...state, needScroll: true, isWaiting: false };
  return newState;
};

// Update streaming message content
export const handleStreamChunk = <T extends SSEComponentState>(state: T, data: StreamChunkData): T => {
  const { messageId, sender, content } = data;
  const messages = [...(state.messages || [])];

  // Find and update the streaming message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].isStreaming && messages[i].messageId === messageId) {
      messages[i] = {
        ...messages[i],
        text: content || '',
        createdAt: new Date()
      };

      return {
        ...state,
        messages,
        needScroll: true
      };
    }
  }

  // Create new streaming message if not found
  return {
    ...state,
    messages: [...messages, {
      sender: sender,
      text: content || '',
      isStreaming: true,
      messageId: messageId
    }],
    needScroll: true
  };
};

// Finalize streaming message
export const handleStreamEnd = <T extends SSEComponentState>(state: T, data: StreamEndData): T => {
  state.messages = state.messages.filter(msg => msg.messageId !== data.messageId);
  return { ...state, needScroll: false };
};

// Handle streaming errors
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

// Handle log events from server
export const handleLogEvent = <T extends SSEComponentState>(state: T, data: any): T => {
  const { logEvent } = data;
  if (!logEvent) return state;

  // Console.log all log messages from server for debugging
  console.log(`[${logEvent.level.toUpperCase()}] ${logEvent.category}: ${logEvent.message}`, {
    timestamp: logEvent.timestamp,
    data: logEvent.data,
    messageId: logEvent.messageId,
    fullLogEvent: logEvent
  });

  // Generate unique ID to avoid duplicates
  const uniqueId = `log-${logEvent.messageId || Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const logMessage = {
    id: uniqueId,
    sender: 'system',
    text: logEvent.message,
    createdAt: new Date(logEvent.timestamp),
    type: 'log',
    logEvent: logEvent,
    // Ensure log messages are always displayed
    messageId: uniqueId,
    worldName: data.worldName || streamingState.currentWorldName
  } as any;

  return {
    ...state,
    messages: [...(state.messages || []), logMessage],
    needScroll: true  // Auto-scroll to new log messages
  };
};

// PHASE 2.2 ENHANCEMENT: Tool execution event handlers
export const handleToolStart = <T extends SSEComponentState>(state: T, data: any): T => {
  const { messageId, sender, toolExecution } = data;

  // Add tool start indicator message
  const toolStartMessage = {
    sender: sender,
    text: `🔧 Starting ${toolExecution.toolName}...`,
    isToolEvent: true,
    toolEventType: 'start',
    toolExecution: toolExecution,
    messageId: `${messageId}-tool-${toolExecution.toolCallId}`,
    createdAt: new Date(),
    type: 'tool-start'
  } as any;

  return {
    ...state,
    messages: [...(state.messages || []), toolStartMessage],
    needScroll: true,
    isWaiting: false
  };
};

export const handleToolProgress = <T extends SSEComponentState>(state: T, data: any): T => {
  const { messageId, sender, toolExecution } = data;

  // Update existing tool start message to show progress
  const messages = [...(state.messages || [])];
  const toolMessageIndex = messages.findIndex(msg =>
    msg.messageId === `${messageId}-tool-${toolExecution.toolCallId}` && msg.toolEventType === 'start'
  );

  if (toolMessageIndex !== -1) {
    messages[toolMessageIndex] = {
      ...messages[toolMessageIndex],
      text: `⚙️ Executing ${toolExecution.toolName}...`,
      toolEventType: 'progress',
      toolExecution: toolExecution
    };
  }

  return {
    ...state,
    messages,
    needScroll: true,
    isWaiting: false
  };
};

export const handleToolResult = <T extends SSEComponentState>(state: T, data: any): T => {
  const { messageId, sender, toolExecution } = data;

  // Update existing tool message to show completion
  const messages = [...(state.messages || [])];
  const toolMessageIndex = messages.findIndex(msg =>
    msg.messageId === `${messageId}-tool-${toolExecution.toolCallId}` && msg.isToolEvent
  );

  if (toolMessageIndex !== -1) {
    const resultPreview = typeof toolExecution.result === 'string'
      ? toolExecution.result.slice(0, 100)
      : JSON.stringify(toolExecution.result).slice(0, 100);

    messages[toolMessageIndex] = {
      ...messages[toolMessageIndex],
      text: `✅ ${toolExecution.toolName} completed (${toolExecution.duration}ms)`,
      toolEventType: 'result',
      toolExecution: toolExecution,
      expandable: true,
      resultPreview: resultPreview.length < 100 ? resultPreview : resultPreview + '...'
    };
  }

  return {
    ...state,
    messages,
    needScroll: true,
    isWaiting: false
  };
};

export const handleToolError = <T extends SSEComponentState>(state: T, data: any): T => {
  const { messageId, sender, toolExecution } = data;

  // Update existing tool message to show error
  const messages = [...(state.messages || [])];
  const toolMessageIndex = messages.findIndex(msg =>
    msg.messageId === `${messageId}-tool-${toolExecution.toolCallId}` && msg.isToolEvent
  );

  if (toolMessageIndex !== -1) {
    messages[toolMessageIndex] = {
      ...messages[toolMessageIndex],
      text: `❌ ${toolExecution.toolName} failed: ${toolExecution.error}`,
      toolEventType: 'error',
      toolExecution: toolExecution,
      hasError: true
    };
  } else {
    // Create new error message if tool start message not found
    const toolErrorMessage = {
      sender: sender,
      text: `❌ Tool ${toolExecution.toolName} failed: ${toolExecution.error}`,
      isToolEvent: true,
      toolEventType: 'error',
      toolExecution: toolExecution,
      messageId: `${messageId}-tool-error-${toolExecution.toolCallId}`,
      createdAt: new Date(),
      type: 'tool-error',
      hasError: true
    } as any;

    return {
      ...state,
      messages: [...messages, toolErrorMessage],
      needScroll: true,
      isWaiting: false
    };
  }

  return {
    ...state,
    messages,
    needScroll: true,
    isWaiting: false
  };
};
