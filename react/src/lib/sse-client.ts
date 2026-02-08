/**
 * SSE Client Utilities - Server-Sent Events Management for React
 * 
 * Source: Enhanced from web/src frontend SSE handling
 * Adapted for: React 19.2.0
 * 
 * Features:
 * - SSE connection management with cleanup
 * - Comprehensive event parsing (stream, message, world, log, tool approval, tool streaming)
 * - Streaming message state management
 * - Error handling and recovery
 * - Shell command output streaming (stdout/stderr) support
 * 
 * Implementation:
 * - Uses fetch API with ReadableStream for SSE
 * - Returns cleanup function for connection management
 * - Processes SSE data events with callbacks
 * 
 * Changes:
 * - 2026-02-08: Added tool-stream event handling for shell command output streaming
 * - 2026-02-07: Matched chat request flow with web/src/utils/sse-client.ts (payload/headers/options parsing)
 * - 2025-11-12: Enhanced with world events, log messages, tool approval events
 * - 2025-11-12: Created for React frontend refactoring from WebSocket to REST API
 */

import { apiRequest } from './api';
import type { StreamStartData, StreamChunkData, StreamEndData, StreamErrorData, ToolStreamData, LogEvent, WorldEvent, ApprovalRequest } from '../types';

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
  onToolStream?: (data: ToolStreamData) => void;
  onMessage?: (data: SSEMessageData['data']) => void;
  onLogMessage?: (data: LogEvent) => void;
  onWorldEvent?: (data: WorldEvent) => void;
  onToolApprovalRequest?: (data: ApprovalRequest) => void;
  onError?: (error: Error) => void;
  onComplete?: (data: any) => void;
}

interface SendChatMessageOptions {
  sender?: string;
  historyMessages?: Array<Record<string, any>>;
  callbacks?: SSECallbacks;
  onMessage?: (data: SSEData) => void;
  onError?: (error: Error) => void;
  onComplete?: (data: any) => void;
}

/**
 * Send a chat message to a world via SSE streaming
 * 
 * @param worldName - Name of the world to send message to
 * @param message - Message content to send
 * @param senderOrOptions - Sender string or options object (web-compatible)
 * @param legacyOnMessage - Legacy callback support for raw SSE data
 * @param legacyOnError - Legacy callback support for stream errors
 * @param legacyOnComplete - Legacy callback support for completion event
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
  let callbacks: SSECallbacks = {};
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
    callbacks = senderOrOptions.callbacks ?? {};
    onMessage = senderOrOptions.onMessage ?? onMessage;
    onError = senderOrOptions.onError ?? onError;
    onComplete = senderOrOptions.onComplete ?? onComplete;
  }

  if (!worldName || !message?.trim()) {
    throw new Error('World name and non-empty message are required');
  }

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
          if (line.trim() === '' || !line.startsWith('data: ')) continue;

          try {
            const dataContent = line.slice(6).trim();
            if (dataContent === '') continue;

            const data: SSEData = JSON.parse(dataContent);
            handleSSEData(data, callbacks);
            onMessage?.(data);
            if (data.type === 'complete') {
              onComplete?.((data as SSECompleteData).payload || data);
            }

          } catch (error) {
            console.error('Error parsing SSE data:', error);
            callbacks.onError?.(new Error('Failed to parse SSE data'));
            onError?.(new Error('Failed to parse SSE data'));
          }
        }
      }
    } catch (error) {
      console.error('SSE stream error:', error);
      callbacks.onError?.(error as Error);
      onError?.(error as Error);
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
    case 'tool-stream':
      handleToolStreamEvent(data as any, callbacks);
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

/**
 * Process tool stream events (shell command output)
 */
function handleToolStreamEvent(eventData: any, callbacks: SSECallbacks): void {
  if (!eventData) return;

  callbacks.onToolStream?.({
    messageId: eventData.messageId || '',
    agentName: eventData.agentName || eventData.sender || '',
    content: eventData.accumulatedContent || eventData.content || '',
    stream: eventData.stream || 'stdout',
    accumulatedContent: eventData.accumulatedContent,
    worldName: eventData.worldName
  });
}

export default {
  sendChatMessage,
};
