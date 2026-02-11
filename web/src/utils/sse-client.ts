/**
 * SSE Client Utilities - Server-Sent Events Management
 * 
 * Purpose: Manage SSE connections for real-time streaming responses
 * 
 * Features:
 * - SSE connection management with cleanup
 * - Event parsing and routing via AppRun
 * - Streaming message state management
 * - Tool execution event handling (start, progress, result, error)
 * - Log event processing with error detail extraction
 * - Shell command output streaming (stdout/stderr) with real-time display
 * - Tool call data preservation in streaming chunks
 * 
 * Implementation:
 * - Uses fetch API with ReadableStream for SSE
 * - Publishes events via app.run() for AppRun integration
 * - Maintains active streaming messages Map
 * - Accumulates chunks for smooth streaming display
 * - Streams shell command output with stdout/stderr distinction
 * - Preserves tool_calls metadata for complete tool call display with parameters
 * - Extracts error details from log data for better error visibility in UI
 * 
 * Created: 2025-10-25 - Initial SSE client implementation
 * Updated: 2026-02-11 - Enhanced error log display to include error details from log data
 * Updated: 2026-02-11 - Preserve tool_calls in handleStreamChunk for complete display
 * Updated: 2026-02-08 - Removed legacy manual tool-intervention request and tool-result submission helpers
 * Updated: 2026-02-08 - Added tool-stream event handler for shell command output streaming
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
    messageId?: string;
    replyToMessageId?: string; // Threading: parent message reference
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

interface SSEWorldData extends SSEBaseData {
  type: 'world';
  data?: {
    state?: string;
    pendingOperations?: number;
    activityId?: number;
    timestamp?: string;
    source?: string;
  };
}

type SSEData =
  | SSEStreamingData
  | SSEMessageData
  | SSEErrorData
  | SSEConnectionData
  | SSECompleteData
  | SSEWorldData
  | SSEBaseData;

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

interface SendChatMessageOptions {
  sender?: string;
  historyMessages?: Array<Record<string, any>>;
  onMessage?: (data: SSEData) => void;
  onError?: (error: Error) => void;
  onComplete?: (data: any) => void;
}


// Utility functions
const publishEvent = (eventName: string, data?: any): void => {
  app.run(eventName, data);
};

// Global streaming state
let streamingState: StreamingState = {
  activeMessages: new Map(),
  currentWorldName: null
};

// Main SSE data handler - routes events to appropriate processors
const handleSSEData = (data: SSEData): void => {
  if (!data || typeof data !== 'object') {
    return;
  }

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
    case 'world':
      publishEvent('handleWorldActivity', data.data ?? data.payload ?? data);
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
        const toolCalls = eventData.tool_calls;

        publishEvent('handleStreamChunk', {
          messageId,
          sender: agentName,
          content: newContent,
          isAccumulated: eventData.accumulatedContent !== undefined,
          worldName: eventData.worldName || streamingState.currentWorldName,
          tool_calls: toolCalls
        });

      }
      break;

    // PHASE 2.2 ENHANCEMENT: Tool-specific event handlers
    case 'tool-start':
      // Debug: Check if toolExecution is missing
      if (!eventData.toolExecution) {
        console.warn('tool-start event missing toolExecution:', { eventData, messageId, agentName });
      }
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
      // Debug: Check if toolExecution is missing
      if (!eventData.toolExecution) {
        console.warn('tool-result event missing toolExecution:', { eventData, messageId, agentName });
      }
      publishEvent('handleToolResult', {
        messageId,
        sender: agentName,
        toolExecution: eventData.toolExecution,
        worldName: eventData.worldName || streamingState.currentWorldName
      });
      break;

    case 'tool-error':
      // Debug: Check if toolExecution is missing
      if (!eventData.toolExecution) {
        console.warn('tool-error event missing toolExecution:', { eventData, messageId, agentName });
      }
      publishEvent('handleToolError', {
        messageId,
        sender: agentName,
        toolExecution: eventData.toolExecution,
        worldName: eventData.worldName || streamingState.currentWorldName
      });
      break;

    case 'tool-stream':
      // Handle streaming shell command output (stdout/stderr)
      const toolStream = streamingState.activeMessages.get(messageId);
      if (toolStream) {
        // Accumulate content for this stream
        const newContent = eventData.accumulatedContent !== undefined
          ? eventData.accumulatedContent
          : toolStream.content + (eventData.content || '');

        toolStream.content = newContent;

        // Publish tool stream event with stream type metadata
        publishEvent('handleToolStream', {
          messageId,
          agentName,
          content: newContent,
          stream: eventData.stream || 'stdout',
          accumulatedContent: newContent,
          worldName: eventData.worldName || streamingState.currentWorldName
        });

        console.log('[tool-stream] Accumulated output:', {
          messageId,
          stream: eventData.stream,
          chunkLength: eventData.content?.length,
          totalLength: newContent.length
        });
      } else {
        // Create new stream if not exists (tool started without tool-start event)
        streamingState.activeMessages.set(messageId, {
          content: eventData.content || '',
          sender: agentName,
          messageId: messageId,
          isStreaming: true
        });

        publishEvent('handleToolStream', {
          messageId,
          agentName,
          content: eventData.content || '',
          stream: eventData.stream || 'stdout',
          accumulatedContent: eventData.content || '',
          worldName: eventData.worldName || streamingState.currentWorldName
        });

        console.log('[tool-stream] Started new stream:', {
          messageId,
          stream: eventData.stream,
          contentLength: eventData.content?.length
        });
      }
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

    // Note: memory-only events are no longer sent via SSE as per requirements
    // Memory-only messages are handled internally without frontend notification

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
 * Send a chat message to a world via SSE streaming
 * 
 * @param worldName - Name of the world to send message to
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
  senderOrOptions?: string | SendChatMessageOptions,
  legacyOnMessage?: (data: SSEData) => void,
  legacyOnError?: (error: Error) => void,
  legacyOnComplete?: (data: any) => void
): Promise<() => void> {
  let sender = 'HUMAN';
  let historyMessages: Array<Record<string, any>> | undefined;
  let onMessage = legacyOnMessage;
  let onError = legacyOnError;
  let onComplete = legacyOnComplete;

  if (typeof senderOrOptions === 'string') {
    sender = senderOrOptions;
  } else if (senderOrOptions === undefined) {
    sender = 'HUMAN';
  } else {
    sender = senderOrOptions.sender ?? 'HUMAN';
    historyMessages = senderOrOptions.historyMessages;
    onMessage = senderOrOptions.onMessage ?? onMessage;
    onError = senderOrOptions.onError ?? onError;
    onComplete = senderOrOptions.onComplete ?? onComplete;
  }

  if (!worldName || !message?.trim()) {
    throw new Error('World name and non-empty message are required');
  }

  streamingState.currentWorldName = worldName;

  const requestPayload: Record<string, any> = { message, sender };
  if (historyMessages && historyMessages.length > 0) {
    requestPayload.messages = historyMessages;
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/messages`, {
    method: 'POST',
    body: JSON.stringify(requestPayload),
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
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '' || !line.startsWith('data: ')) continue; try {
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
  const newState = { ...state, needScroll: true };
  return newState;
};

// Update streaming message content
export const handleStreamChunk = <T extends SSEComponentState>(state: T, data: StreamChunkData): T => {
  const { messageId, sender, content, tool_calls } = data;
  const messages = [...(state.messages || [])];
  const activeStreamMessageId = (state as any).activeStreamMessageId ?? messageId;

  // Find and update the streaming message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].isStreaming && (messages[i].messageId === messageId || messages[i].messageId === activeStreamMessageId)) {
      messages[i] = {
        ...messages[i],
        text: content || '',
        createdAt: new Date(),
        // Preserve tool_calls if present
        ...(tool_calls && { tool_calls })
      };

      return {
        ...state,
        messages,
        activeStreamMessageId,
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
      messageId: activeStreamMessageId,
      // Include tool_calls if present
      ...(tool_calls && { tool_calls })
    }],
    activeStreamMessageId,
    needScroll: true
  };
};

// Finalize streaming message
export const handleStreamEnd = <T extends SSEComponentState>(state: T, data: StreamEndData): T => {
  const activeStreamMessageId = (state as any).activeStreamMessageId;
  const targetId = activeStreamMessageId ?? data.messageId;

  state.messages = state.messages.filter(msg => msg.messageId !== targetId);
  return { ...state, activeStreamMessageId: undefined, needScroll: false };
};

// Handle streaming errors
export const handleStreamError = <T extends SSEComponentState>(state: T, data: StreamErrorData): T => {
  const { messageId, sender, error } = data;
  const activeStreamMessageId = (state as any).activeStreamMessageId;
  const targetMessageId = activeStreamMessageId ?? messageId;

  let foundMatch = false;
  const messages = (state.messages || []).map(msg => {
    if (msg.isStreaming &&
      (msg.messageId === targetMessageId ||
        (!messageId && msg.sender === sender && msg.type === 'agent-stream'))) {
      foundMatch = true;
      return {
        ...msg,
        isStreaming: false,
        hasError: true,
        errorMessage: error
      };
    }
    return msg;
  });

  const nextMessages = foundMatch ? messages : [
    ...(state.messages || []),
    {
      id: `stream-error-${Date.now()}`,
      sender: sender || 'System',
      text: '',
      isStreaming: false,
      hasError: true,
      errorMessage: error,
      messageId: targetMessageId,
      type: 'error'
    } as any
  ];

  return {
    ...state,
    messages: nextMessages,
    activeStreamMessageId: undefined,
    isWaiting: false
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

  // For error-level logs, include error details from logEvent.data if available
  let displayText = logEvent.message;
  if (logEvent.level === 'error' && logEvent.data) {
    // Extract error message from data (could be in data.error, data.message, etc.)
    const errorDetail = logEvent.data.error || logEvent.data.message || logEvent.data.errorMessage;
    if (errorDetail) {
      displayText = `${logEvent.message}: ${errorDetail}`;
    }
  }

  const logMessage = {
    id: uniqueId,
    sender: 'system',
    text: displayText,
    createdAt: new Date(logEvent.timestamp),
    type: 'log',
    logEvent: logEvent,
    isLogExpanded: false,
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

  // Validate toolExecution data
  if (!toolExecution || !toolExecution.toolName) {
    console.warn('handleToolStart: Missing or invalid toolExecution data', { data, toolExecution });
    return state;
  }

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
    activeStreamMessageId: messageId,
    needScroll: true
  };
};

export const handleToolProgress = <T extends SSEComponentState>(state: T, data: any): T => {
  const { messageId, sender, toolExecution } = data;

  // Validate toolExecution data
  if (!toolExecution || !toolExecution.toolName) {
    console.warn('handleToolProgress: Missing or invalid toolExecution data', { data, toolExecution });
    return state;
  }

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
    activeStreamMessageId: (state as any).activeStreamMessageId ?? messageId,
    needScroll: true
  };
};

export const handleToolResult = <T extends SSEComponentState>(state: T, data: any): T => {
  const { messageId, sender, toolExecution } = data;

  // Validate toolExecution data
  if (!toolExecution || !toolExecution.toolName) {
    console.warn('handleToolResult: Missing or invalid toolExecution data', { data, toolExecution });
    return state;
  }

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
    activeStreamMessageId: (state as any).activeStreamMessageId ?? messageId,
    needScroll: true
  };
};

export const handleToolError = <T extends SSEComponentState>(state: T, data: any): T => {
  const { messageId, sender, toolExecution } = data;

  // Validate toolExecution data
  if (!toolExecution || !toolExecution.toolName) {
    console.warn('handleToolError: Missing or invalid toolExecution data', { data, toolExecution });
    return state;
  }

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
      activeStreamMessageId: (state as any).activeStreamMessageId ?? messageId,
      needScroll: true
    };
  }

  return {
    ...state,
    messages,
    activeStreamMessageId: (state as any).activeStreamMessageId ?? messageId,
    needScroll: true
  };
};

// Note: handleMemoryOnlyMessage function removed
// Memory-only messages are no longer sent via SSE as per requirements
// They are handled internally in the backend without frontend notification

/**
 * Handle tool stream chunk - Update tool message with streaming output
 */
export const handleToolStream = <T extends SSEComponentState>(state: T, data: any): T => {
  const { messageId, agentName, content, stream } = data;

  // Import domain function to maintain separation of concerns
  const { createToolStreamState } = require('../domain/sse-streaming');

  return createToolStreamState(state, {
    messageId,
    agentName,
    content,
    stream: stream || 'stdout'
  });
};
