/**
 * SSE Client Utilities - Server-Sent Events Management for React
 * 
 * Source: Enhanced from web/src frontend SSE handling
 * Adapted for: React 19.2.0
 * 
 * Features:
 * - SSE connection management with cleanup
 * - Comprehensive event parsing (stream, message, world, log, tool approval)
 * - Streaming message state management
 * - Error handling and recovery
 * 
 * Implementation:
 * - Uses fetch API with ReadableStream for SSE
 * - Returns cleanup function for connection management
 * - Processes SSE data events with callbacks
 * 
 * Changes:
 * - 2025-11-12: Enhanced with world events, log messages, tool approval events
 * - 2025-11-12: Created for React frontend refactoring from WebSocket to REST API
 */

import { sendMessage as apiSendMessage } from './api';
import type { StreamStartData, StreamChunkData, StreamEndData, StreamErrorData, LogEvent, WorldEvent, ApprovalRequest } from '../types';

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
    replyToMessageId?: string;
    createdAt?: string;
    worldName?: string;
  };
}

interface SSELogData extends SSEBaseData {
  type: 'log:message';
  data: LogEvent;
}

interface SSEWorldEventData extends SSEBaseData {
  type: 'world:event';
  data: WorldEvent;
}

interface SSEToolApprovalData extends SSEBaseData {
  type: 'tool:approval:request';
  data: ApprovalRequest;
}

interface SSEErrorData extends SSEBaseData {
  type: 'error';
  message?: string;
}

interface SSECompleteData extends SSEBaseData {
  type: 'complete';
  payload?: any;
}

type SSEData =
  | SSEStreamingData
  | SSEMessageData
  | SSELogData
  | SSEWorldEventData
  | SSEToolApprovalData
  | SSEErrorData
  | SSECompleteData
  | SSEBaseData;

// Callback types
export interface SSECallbacks {
  onStreamStart?: (data: StreamStartData) => void;
  onStreamChunk?: (data: StreamChunkData) => void;
  onStreamEnd?: (data: StreamEndData) => void;
  onStreamError?: (data: StreamErrorData) => void;
  onMessage?: (data: SSEMessageData['data']) => void;
  onLogMessage?: (data: LogEvent) => void;
  onWorldEvent?: (data: WorldEvent) => void;
  onToolApprovalRequest?: (data: ApprovalRequest) => void;
  onError?: (error: Error) => void;
  onComplete?: (data: any) => void;
}

/**
 * Send a chat message to a world via SSE streaming
 * 
 * @param worldName - Name of the world to send message to
 * @param message - Message content to send
 * @param sender - Message sender identifier (default: 'human')
 * @param callbacks - Callback functions for SSE events
 * @returns Cleanup function to cancel the stream
 */
export async function sendChatMessage(
  worldName: string,
  message: string,
  sender: string = 'human',
  callbacks: SSECallbacks = {}
): Promise<() => void> {
  if (!worldName || !message?.trim()) {
    throw new Error('World name and non-empty message are required');
  }

  const response = await apiSendMessage(worldName, message, sender);

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
          if (line.trim() === '' || !line.startsWith('data: ')) continue;

          try {
            const dataContent = line.slice(6).trim();
            if (dataContent === '') continue;

            const data: SSEData = JSON.parse(dataContent);
            handleSSEData(data, callbacks);

          } catch (error) {
            console.error('Error parsing SSE data:', error);
            callbacks.onError?.(new Error('Failed to parse SSE data'));
          }
        }
      }
    } catch (error) {
      console.error('SSE stream error:', error);
      callbacks.onError?.(error as Error);
    } finally {
      cleanup();
    }
  };

  processStream();
  return cleanup;
}

/**
 * Handle SSE data and route to appropriate callbacks
 */
function handleSSEData(data: SSEData, callbacks: SSECallbacks): void {
  if (!data || typeof data !== 'object') {
    return;
  }

  switch (data.type) {
    case 'sse':
      handleStreamingEvent((data as SSEStreamingData).data, callbacks);
      break;
    case 'message':
      callbacks.onMessage?.((data as SSEMessageData).data);
      break;
    case 'log:message':
      callbacks.onLogMessage?.((data as SSELogData).data);
      break;
    case 'world:event':
      callbacks.onWorldEvent?.((data as SSEWorldEventData).data);
      break;
    case 'tool:approval:request':
      callbacks.onToolApprovalRequest?.((data as SSEToolApprovalData).data);
      break;
    case 'error':
      callbacks.onError?.(new Error((data as SSEErrorData).message || 'SSE error'));
      break;
    case 'complete':
      callbacks.onComplete?.((data as SSECompleteData).payload || data);
      break;
  }
}

/**
 * Process streaming SSE events
 */
function handleStreamingEvent(eventData: SSEStreamEvent, callbacks: SSECallbacks): void {
  if (!eventData) return;

  const messageId = eventData.messageId || '';
  const sender = eventData.sender || '';

  switch (eventData.type) {
    case 'start':
      callbacks.onStreamStart?.({ messageId, sender, worldName: eventData.worldName });
      break;

    case 'chunk':
      const content = eventData.accumulatedContent || eventData.content || '';
      callbacks.onStreamChunk?.({
        messageId,
        sender,
        content,
        isAccumulated: Boolean(eventData.accumulatedContent),
        worldName: eventData.worldName
      });
      break;

    case 'end':
      const finalContent = eventData.finalContent || '';
      callbacks.onStreamEnd?.({ messageId, sender, content: finalContent, worldName: eventData.worldName });
      break;

    case 'error':
      const error = eventData.error || 'Streaming error';
      callbacks.onStreamError?.({ messageId, sender, error, worldName: eventData.worldName });
      break;
  }
}

export default {
  sendChatMessage,
};
