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
 * - System/world event routing for real-time refresh handling
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
 * Recent Changes:
 * - 2026-03-13: Preserved streamed assistant `reasoningContent` separately from answer text so reasoning-only chunks do not get dropped.
 * - 2026-03-12: Routed shell assistant stdout SSE (`start/chunk/end`) through the web tool-stream path, preserved
 *   shell command metadata for live tool rows, and finalized matching shell stream rows on terminal tool events.
 * - 2026-03-11: Forwarded tool-event `chatId` into AppRun handlers so chat-scoped HITL prompts survive switches without
 *   leaking across chats.
 * - 2026-03-11: Preserved optimistic user messages across assistant stream start so the web chat does not lose edit/delete affordances before the backend echo confirms the message ID.
 * - 2026-03-06: Removed runtime fallback to backend `currentChatId` from web SSE log filtering; active-chat routing now uses explicit UI selection only.
 * 
 * Created: 2025-10-25 - Initial SSE client implementation
 * Updated: 2026-02-27 - Enforced strict active-chat filtering for realtime log events (drop unscoped and mismatched logs when a chat is selected).
 * Updated: 2026-02-20 - Removed stale CRUD SSE routing branch to align with runtime event channels.
 * Updated: 2026-02-26 - Normalized object-shaped error details in log rendering to avoid "[object Object]" output.
 * Updated: 2026-02-26 - Suppressed redundant error-level log messages when equivalent stream error indicators are present.
 * Updated: 2026-02-11 - Enhanced error log display to include error details from log data
 * Updated: 2026-02-11 - Preserve tool_calls in handleStreamChunk for complete display
 * Updated: 2026-02-08 - Removed legacy manual tool-intervention request and tool-result submission helpers
 * Updated: 2026-02-08 - Added tool-stream event handler for shell command output streaming
 * Updated: 2026-02-13 - Added editChatMessage() SSE helper for core-managed message edit streaming
 */

import app from 'apprun';
import { apiRequest } from '../api';
import { createToolStreamState, finalizeToolStreamState } from '../domain/sse-streaming';
import type {
  SSEComponentState,
  StreamStartData,
  StreamChunkData,
  StreamEndData,
  StreamErrorData,
  ToolStreamData,
  ToolStreamEndData,
} from '../types';

// SSE data structure interfaces
interface SSEBaseData {
  type: string;
  data?: any;
  payload?: any;
  message?: string;
}

interface SSEStreamEvent {
  type: 'start' | 'chunk' | 'end' | 'error' | 'tool-start' | 'tool-progress' | 'tool-result' | 'tool-error' | 'tool-stream' | 'log';
  messageId?: string;
  sender?: string;
  agentName?: string;
  content?: string;
  reasoningContent?: string;
  accumulatedContent?: string;
  finalContent?: string;
  discard?: boolean;
  error?: string;
  stream?: 'stdout' | 'stderr';
  toolName?: string;
  chatId?: string;
  toolExecution?: any;
  tool_calls?: any[];
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
    chatId?: string;
    replyToMessageId?: string; // Threading: parent message reference
    createdAt?: string;
    worldName?: string;
    tool_calls?: any[];
    tool_call_id?: string;
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
  reasoningContent: string;
  sender: string;
  messageId: string;
  isStreaming: boolean;
}

interface StreamingState {
  activeMessages: Map<string, ActiveStreamMessage>;
  currentWorldName: string | null;
  toolExecutionMetadata: Map<string, {
    toolName: string;
    toolCallId: string;
    toolInput?: any;
    command?: string;
    chatId?: string;
  }>;
}

interface SendChatMessageOptions {
  sender?: string;
  chatId?: string;
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
  currentWorldName: null,
  toolExecutionMetadata: new Map(),
};

function normalizeToolInput(value: unknown): any {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function readShellCommand(toolInput: unknown): string {
  if (!toolInput || typeof toolInput !== 'object') {
    return '';
  }

  return String((toolInput as Record<string, unknown>).command || '').trim();
}

function toToolContent(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) {
    return '';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function upsertToolCompletionMessage<T extends SSEComponentState>(
  state: T,
  data: any,
  options?: {
    streamType?: 'stdout' | 'stderr';
    fallbackText?: string;
  }
): T {
  const { sender, chatId, toolExecution } = data || {};

  if (!toolExecution || !toolExecution.toolName) {
    return state;
  }

  const toolCallId = String(toolExecution.toolCallId || data?.messageId || '').trim();
  if (!toolCallId) {
    return state;
  }

  const normalizedInput = normalizeToolInput(toolExecution.input);
  const command = readShellCommand(normalizedInput);
  const contentSource = options?.streamType === 'stderr'
    ? (toolExecution.error ?? toolExecution.result ?? options?.fallbackText ?? '')
    : (toolExecution.result ?? toolExecution.preview ?? options?.fallbackText ?? '');
  const text = toToolContent(contentSource);
  const messages = [...(state.messages || [])];
  const existingIndex = messages.findIndex((message) => {
    const existingToolCallId = String((message as any)?.tool_call_id || (message as any)?.toolCallId || '').trim();
    return existingToolCallId === toolCallId && String((message as any)?.role || '').trim().toLowerCase() === 'tool';
  });

  const completionMessage = {
    id: `tool-complete-${toolCallId}`,
    type: 'tool',
    role: 'tool',
    sender: sender || 'tool',
    text,
    content: text,
    createdAt: new Date(),
    messageId: toolCallId,
    chatId,
    tool_call_id: toolCallId,
    toolName: String(toolExecution.toolName || '').trim() || 'unknown',
    toolInput: normalizedInput,
    command,
    toolCallId,
    toolExecution,
    isToolStreaming: false,
    ...(options?.streamType ? { streamType: options.streamType } : {}),
  } as any;

  if (existingIndex !== -1) {
    messages[existingIndex] = {
      ...messages[existingIndex],
      ...completionMessage,
      id: messages[existingIndex].id || completionMessage.id,
    };
  } else {
    messages.push(completionMessage);
  }

  return {
    ...state,
    messages,
    needScroll: true,
  };
}

function getShellAssistantToolCallId(messageId: string | undefined): string {
  const normalizedMessageId = String(messageId || '').trim();
  return normalizedMessageId.endsWith('-stdout')
    ? normalizedMessageId.slice(0, -'-stdout'.length)
    : normalizedMessageId;
}

function isShellAssistantStreamEvent(eventType: string, messageId: string | undefined, toolName: string | undefined): boolean {
  return String(toolName || '').trim() === 'shell_cmd'
    && ['start', 'chunk', 'end'].includes(String(eventType || '').trim().toLowerCase())
    && String(messageId || '').trim().endsWith('-stdout');
}

function getShellToolStreamTerminalMessageIds(toolCallId: string): string[] {
  const normalizedToolCallId = String(toolCallId || '').trim();
  if (!normalizedToolCallId) {
    return [];
  }

  return [normalizedToolCallId, `${normalizedToolCallId}-stdout`];
}

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

const normalizeLogEventPayload = (eventData: any) => {
  if (!eventData || typeof eventData !== 'object') {
    return null;
  }

  const source = eventData.logEvent && typeof eventData.logEvent === 'object'
    ? eventData.logEvent
    : eventData;

  const hasLogShape =
    typeof source.level === 'string' ||
    typeof source.category === 'string' ||
    typeof source.message === 'string';

  if (!hasLogShape) {
    return null;
  }

  return {
    level: source.level || 'info',
    category: source.category || 'unknown',
    message: source.message || '',
    timestamp: source.timestamp || new Date().toISOString(),
    data: source.data ?? null,
    messageId: source.messageId || eventData.messageId || `log-${Date.now()}`
  };
};

const normalizeErrorText = (value: unknown): string => {
  return String(value || '').trim().toLowerCase();
};

const formatErrorDetail = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value instanceof Error) {
    const message = String(value.message || '').trim();
    return message.length > 0 ? message : value.name || 'Error';
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message.trim();
    }
    if (typeof record.error === 'string' && record.error.trim()) {
      return record.error.trim();
    }
    try {
      return JSON.stringify(record);
    } catch {
      return String(record);
    }
  }
  return String(value);
};

const extractErrorDetailFromLogEvent = (logEvent: any): string | null => {
  if (!logEvent || typeof logEvent !== 'object') {
    return null;
  }
  const data = logEvent.data && typeof logEvent.data === 'object' ? logEvent.data : null;
  if (!data) {
    return null;
  }
  const firstArg = Array.isArray(data.args) ? data.args[0] : null;
  const candidate =
    data.error ||
    data.errorMessage ||
    (typeof data.message === 'string' && data.message !== logEvent.message ? data.message : null) ||
    firstArg?.error ||
    firstArg?.errorMessage ||
    firstArg?.message ||
    null;
  return formatErrorDetail(candidate);
};

const shouldSuppressLogForExistingStreamError = (state: SSEComponentState, logEvent: any): boolean => {
  if (normalizeErrorText(logEvent?.level) !== 'error') {
    return false;
  }

  const logDetail = normalizeErrorText(extractErrorDetailFromLogEvent(logEvent) || logEvent?.message);
  if (!logDetail) {
    return false;
  }

  return (state.messages || []).some((message: any) => {
    if (!message?.hasError) {
      return false;
    }
    const streamError = normalizeErrorText(message.errorMessage || message.text);
    if (!streamError) {
      return false;
    }
    return logDetail.includes(streamError) || streamError.includes(logDetail);
  });
};

const shouldRemoveRedundantErrorLogMessage = (message: any, streamErrorText: string): boolean => {
  if (!message?.logEvent || normalizeErrorText(message.logEvent.level) !== 'error') {
    return false;
  }
  const logDetail = normalizeErrorText(extractErrorDetailFromLogEvent(message.logEvent) || message.logEvent?.message);
  if (!logDetail || !streamErrorText) {
    return false;
  }
  return logDetail.includes(streamErrorText) || streamErrorText.includes(logDetail);
};

/**
 * Process streaming SSE events and manage message state
 */
const handleStreamingEvent = (data: SSEStreamingData): void => {
  const eventData = data as any;
  if (!eventData) return;
  const messageId = eventData.messageId;
  const agentName = eventData.agentName;
  const eventType = String(eventData.type || '').trim().toLowerCase();
  const toolName = String(eventData.toolName || eventData.toolExecution?.toolName || '').trim();
  const isShellAssistantStream = isShellAssistantStreamEvent(eventType, messageId, toolName);
  const shellToolCallId = isShellAssistantStream ? getShellAssistantToolCallId(messageId) : '';
  const shellToolMetadata = shellToolCallId
    ? streamingState.toolExecutionMetadata.get(shellToolCallId)
    : null;

  switch (eventType) {
    case 'start':
      if (isShellAssistantStream) {
        if (endStream || eventData.discard === true) {
          const finalContent = eventData.finalContent !== undefined
            ? eventData.finalContent
            : endStream?.content || '';
          sender: agentName,
            messageId: streamKey,
              isStreaming: true
        });
        publishEvent('handleToolStream', {
          discard: eventData.discard === true,
          messageId: streamKey,
          agentName,

          if(endStream) {
            streamingState.activeMessages.delete(messageId);
          }
        }
          chatId: eventData.chatId ?? shellToolMetadata?.chatId,
          accumulatedContent: '',
          toolName: 'shell_cmd',
          toolInput: shellToolMetadata?.toolInput,
          command: shellToolMetadata?.command,
          toolCallId: shellToolCallId,
          worldName: eventData.worldName || streamingState.currentWorldName
        } satisfies ToolStreamData);
      break;
  }

  streamingState.activeMessages.set(messageId, {
    content: '',
    reasoningContent: '',
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
if (isShellAssistantStream) {
  const streamKey = String(messageId || '').trim();
  const stream = streamingState.activeMessages.get(streamKey);
  const newContent = eventData.accumulatedContent !== undefined
    ? eventData.accumulatedContent
    : (stream?.content || '') + (eventData.content || '');

  streamingState.activeMessages.set(streamKey, {
    content: newContent,
    sender: agentName,
    messageId: streamKey,
    isStreaming: true
  });

  publishEvent('handleToolStream', {
    messageId: streamKey,
    agentName,
    chatId: eventData.chatId ?? shellToolMetadata?.chatId,
    content: newContent,
    stream: 'stdout',
    accumulatedContent: newContent,
    toolName: 'shell_cmd',
    toolInput: shellToolMetadata?.toolInput,
    command: shellToolMetadata?.command,
    toolCallId: shellToolCallId,
    worldName: eventData.worldName || streamingState.currentWorldName
  } satisfies ToolStreamData);
  break;
}

const stream = streamingState.activeMessages.get(messageId);
if (stream) {
  const newContent = eventData.accumulatedContent !== undefined
    ? eventData.accumulatedContent
    : stream.content + (eventData.content || '');
  const newReasoningContent = stream.reasoningContent + (eventData.reasoningContent || '');

  stream.content = newContent;
  stream.reasoningContent = newReasoningContent;
  const toolCalls = eventData.tool_calls;

  publishEvent('handleStreamChunk', {
    messageId,
    sender: agentName,
    content: newContent,
    reasoningContent: newReasoningContent || undefined,
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
if (eventData.toolExecution?.toolCallId) {
  const normalizedToolInput = normalizeToolInput(eventData.toolExecution.input);
  streamingState.toolExecutionMetadata.set(String(eventData.toolExecution.toolCallId), {
    toolName: String(eventData.toolExecution.toolName || '').trim() || 'unknown',
    toolCallId: String(eventData.toolExecution.toolCallId),
    toolInput: normalizedToolInput,
    command: readShellCommand(normalizedToolInput),
    chatId: eventData.chatId,
  });
}
publishEvent('handleToolStart', {
  messageId,
  sender: agentName,
  chatId: eventData.chatId,
  toolExecution: eventData.toolExecution,
  worldName: eventData.worldName || streamingState.currentWorldName
});
break;

    case 'tool-progress':
publishEvent('handleToolProgress', {
  messageId,
  sender: agentName,
  chatId: eventData.chatId,
  toolExecution: eventData.toolExecution,
  worldName: eventData.worldName || streamingState.currentWorldName
});
break;

    case 'tool-result':
// Debug: Check if toolExecution is missing
if (!eventData.toolExecution) {
  console.warn('tool-result event missing toolExecution:', { eventData, messageId, agentName });
}
if (eventData.toolExecution?.toolCallId) {
  publishEvent('handleToolStreamEnd', {
    messageIds: getShellToolStreamTerminalMessageIds(String(eventData.toolExecution.toolCallId)),
    chatId: eventData.chatId,
  } satisfies ToolStreamEndData);
  streamingState.toolExecutionMetadata.delete(String(eventData.toolExecution.toolCallId));
  streamingState.activeMessages.delete(String(eventData.toolExecution.toolCallId));
  streamingState.activeMessages.delete(`${String(eventData.toolExecution.toolCallId)}-stdout`);
}
publishEvent('handleToolResult', {
  messageId,
  sender: agentName,
  chatId: eventData.chatId,
  toolExecution: eventData.toolExecution,
  worldName: eventData.worldName || streamingState.currentWorldName
});
break;

    case 'tool-error':
// Debug: Check if toolExecution is missing
if (!eventData.toolExecution) {
  console.warn('tool-error event missing toolExecution:', { eventData, messageId, agentName });
}
if (eventData.toolExecution?.toolCallId) {
  publishEvent('handleToolStreamEnd', {
    messageIds: getShellToolStreamTerminalMessageIds(String(eventData.toolExecution.toolCallId)),
    chatId: eventData.chatId,
  } satisfies ToolStreamEndData);
  streamingState.toolExecutionMetadata.delete(String(eventData.toolExecution.toolCallId));
  streamingState.activeMessages.delete(String(eventData.toolExecution.toolCallId));
  streamingState.activeMessages.delete(`${String(eventData.toolExecution.toolCallId)}-stdout`);
}
publishEvent('handleToolError', {
  messageId,
  sender: agentName,
  chatId: eventData.chatId,
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
    chatId: eventData.chatId ?? streamingState.toolExecutionMetadata.get(String(messageId || '').trim())?.chatId,
    content: newContent,
    stream: eventData.stream || 'stdout',
    accumulatedContent: newContent,
    toolName: toolName || streamingState.toolExecutionMetadata.get(String(messageId || '').trim())?.toolName,
    toolInput: streamingState.toolExecutionMetadata.get(String(messageId || '').trim())?.toolInput,
    command: streamingState.toolExecutionMetadata.get(String(messageId || '').trim())?.command,
    toolCallId: String(messageId || '').trim() || undefined,
    worldName: eventData.worldName || streamingState.currentWorldName
  } satisfies ToolStreamData);

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
    chatId: eventData.chatId ?? streamingState.toolExecutionMetadata.get(String(messageId || '').trim())?.chatId,
    content: eventData.content || '',
    stream: eventData.stream || 'stdout',
    accumulatedContent: eventData.content || '',
    toolName: toolName || streamingState.toolExecutionMetadata.get(String(messageId || '').trim())?.toolName,
    toolInput: streamingState.toolExecutionMetadata.get(String(messageId || '').trim())?.toolInput,
    command: streamingState.toolExecutionMetadata.get(String(messageId || '').trim())?.command,
    toolCallId: String(messageId || '').trim() || undefined,
    worldName: eventData.worldName || streamingState.currentWorldName
  } satisfies ToolStreamData);

  console.log('[tool-stream] Started new stream:', {
    messageId,
    stream: eventData.stream,
    contentLength: eventData.content?.length
  });
}
break;

    case 'end':
if (isShellAssistantStream) {
  publishEvent('handleToolStreamEnd', {
    messageIds: [String(messageId || '').trim()],
    chatId: eventData.chatId,
  } satisfies ToolStreamEndData);
  streamingState.activeMessages.delete(String(messageId || '').trim());
  break;
}

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
const normalizedLogEvent = normalizeLogEventPayload(eventData);
if (!normalizedLogEvent) {
  return;
}
publishEvent('handleLogEvent', {
  messageId: normalizedLogEvent.messageId,
  chatId: eventData.chatId ?? (normalizedLogEvent as any).chatId ?? null,
  logEvent: normalizedLogEvent,
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
  let chatId: string | undefined;
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
    chatId = senderOrOptions.chatId;
    historyMessages = senderOrOptions.historyMessages;
    onMessage = senderOrOptions.onMessage ?? onMessage;
    onError = senderOrOptions.onError ?? onError;
    onComplete = senderOrOptions.onComplete ?? onComplete;
  }

  if (!worldName || !message?.trim()) {
    throw new Error('World name and non-empty message are required');
  }

  const requestPayload: Record<string, any> = { message, sender };
  if (chatId) {
    requestPayload.chatId = chatId;
  }
  if (historyMessages && historyMessages.length > 0) {
    requestPayload.messages = historyMessages;
  }

  return streamSSERequest(
    worldName,
    `/worlds/${encodeURIComponent(worldName)}/messages`,
    {
      method: 'POST',
      requestPayload,
      onMessage,
      onError,
      onComplete
    }
  );
}

/**
 * Edit a user message using core-managed backend flow with SSE streaming:
 * remove target chain, resubmit edited content, then stream follow-up events.
 */
export async function editChatMessage(
  worldName: string,
  messageId: string,
  newContent: string,
  chatId: string,
  options?: { awaitCompletion?: boolean },
  onMessage?: (data: SSEData) => void,
  onError?: (error: Error) => void,
  onComplete?: (data: any) => void
): Promise<() => void> {
  if (!worldName || !messageId || !chatId || !newContent?.trim()) {
    throw new Error('World name, message ID, chat ID, and new content are required');
  }

  return streamSSERequest(
    worldName,
    `/worlds/${encodeURIComponent(worldName)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: 'PUT',
      requestPayload: {
        chatId,
        newContent,
        stream: true
      },
      onMessage,
      onError,
      onComplete,
      awaitCompletion: options?.awaitCompletion ?? false
    }
  );
}

type StreamSSERequestOptions = {
  method: 'POST' | 'PUT';
  requestPayload: Record<string, any>;
  onMessage?: (data: SSEData) => void;
  onError?: (error: Error) => void;
  onComplete?: (data: any) => void;
  awaitCompletion?: boolean;
};

async function streamSSERequest(
  worldName: string,
  endpoint: string,
  options: StreamSSERequestOptions
): Promise<() => void> {
  streamingState.currentWorldName = worldName;

  const response = await apiRequest(endpoint, {
    method: options.method,
    body: JSON.stringify(options.requestPayload),
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
  let settleCompletion: ((value: void) => void) | null = null;
  let rejectCompletion: ((reason?: any) => void) | null = null;
  const completionPromise = options.awaitCompletion
    ? new Promise<void>((resolve, reject) => {
      settleCompletion = resolve;
      rejectCompletion = reject;
    })
    : null;

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
            if (options.awaitCompletion && data.type === 'error') {
              const error = new Error(data.message || 'Failed to edit message');
              options.onError?.(error);
              rejectCompletion?.(error);
              cleanup();
              return;
            }

            handleSSEData(data);

            options.onMessage?.(data);
            if (data.type === 'complete') {
              options.onComplete?.(data.payload || data);
              settleCompletion?.();
            }
          } catch (error) {
            console.error('Error parsing SSE data:', error);
            const errorObj = { message: 'Failed to parse SSE data' };
            publishEvent('handleError', errorObj);
            options.onError?.(new Error(errorObj.message));
            rejectCompletion?.(new Error(errorObj.message));
          }
        }
      }
    } catch (error) {
      console.error('SSE stream error:', error);
      const errorObj = { message: (error as Error).message || 'SSE stream error' };
      publishEvent('handleError', errorObj);
      options.onError?.(error as Error);
      rejectCompletion?.(error as Error);
    } finally {
      cleanup();
    }
  };

  processStream();

  if (completionPromise) {
    await completionPromise;
  }

  return cleanup;
}

/**
 * AppRun event handlers for SSE streaming events
 * These handlers manage UI state updates during streaming
 */

// Initialize streaming message display
export const handleStreamStart = <T extends SSEComponentState>(state: T, data: StreamStartData): T => {
  const { messageId, sender } = data;
  const messages = [...(state.messages || []), {
    id: messageId,
    sender: sender,
    text: '...',
    isStreaming: true,
    messageId: messageId,
    createdAt: new Date(),
  } as any];
  const newState = { ...state, messages, needScroll: true };
  return newState;
};

// Update streaming message content
export const handleStreamChunk = <T extends SSEComponentState>(state: T, data: StreamChunkData): T => {
  const { messageId, sender, content, reasoningContent, tool_calls } = data;
  const messages = [...(state.messages || [])];
  const activeStreamMessageId = (state as any).activeStreamMessageId ?? messageId;

  // Find and update the streaming message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].isStreaming && (messages[i].messageId === messageId || messages[i].messageId === activeStreamMessageId)) {
      messages[i] = {
        ...messages[i],
        text: content || '',
        reasoningContent: reasoningContent || '',
        createdAt: messages[i].createdAt || new Date(),
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
      id: activeStreamMessageId,
      sender: sender,
      text: content || '',
      reasoningContent: reasoningContent || '',
      isStreaming: true,
      messageId: activeStreamMessageId,
      createdAt: new Date(),
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
  if (data.discard === true) {
    return {
      ...state,
      messages: (state.messages || []).filter((message) => message.messageId !== targetId),
      activeStreamMessageId: undefined,
      needScroll: false,
    };
  }

  const messages = (state.messages || []).map((message) => {
    if (!(message.isStreaming && message.messageId === targetId)) {
      return message;
    }

    const reasoningText = String((message as any)?.reasoningContent || '').trim();
    const startedAt = message.createdAt instanceof Date ? message.createdAt.getTime() : new Date(message.createdAt).getTime();
    const finalizedDurationMs = reasoningText && Number.isFinite(startedAt)
      ? Math.max(0, Date.now() - startedAt)
      : (message as any).reasoningDurationMs;

    return {
      ...message,
      isStreaming: false,
      text: data.content || message.text || '',
      ...(reasoningText ? { reasoningDurationMs: finalizedDurationMs } : {}),
    };
  });

  return { ...state, messages, activeStreamMessageId: undefined, needScroll: false };
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

  const normalizedStreamError = normalizeErrorText(error);
  const filteredMessages = normalizedStreamError
    ? nextMessages.filter((message) => !shouldRemoveRedundantErrorLogMessage(message, normalizedStreamError))
    : nextMessages;

  return {
    ...state,
    messages: filteredMessages,
    activeStreamMessageId: undefined,
    isWaiting: false
  };
};

// Handle log events from server
export const handleLogEvent = <T extends SSEComponentState>(state: T, data: any): T => {
  const logEvent = data?.logEvent ?? normalizeLogEventPayload(data);
  if (!logEvent) return state;
  if (shouldSuppressLogForExistingStreamError(state, logEvent)) {
    return state;
  }

  const stateAny = state as any;
  const activeChatId = stateAny.currentChat?.id || null;
  const incomingChatId = data?.chatId ?? null;
  if (activeChatId && (!incomingChatId || incomingChatId !== activeChatId)) {
    return state;
  }

  // Console.log all log messages from server for debugging
  console.log(`[${logEvent.level.toUpperCase()}] ${logEvent.category}: ${logEvent.message}`, {
    timestamp: logEvent.timestamp,
    data: logEvent.data,
    messageId: logEvent.messageId,
    fullLogEvent: logEvent
  });

  return state;
};

// PHASE 2.2 ENHANCEMENT: Tool execution event handlers
export const handleToolStart = <T extends SSEComponentState>(state: T, data: any): T => {
  const { messageId, sender, toolExecution } = data;

  // Validate toolExecution data
  if (!toolExecution || !toolExecution.toolName) {
    console.warn('handleToolStart: Missing or invalid toolExecution data', { data, toolExecution });
    return state;
  }

  if (toolExecution.toolName === 'shell_cmd') {
    const normalizedInput = normalizeToolInput(toolExecution.input);
    const command = readShellCommand(normalizedInput);
    const shellMessageIds = getShellToolStreamTerminalMessageIds(String(toolExecution.toolCallId || messageId));
    const messages = (state.messages || []).map((message: any) => {
      const candidateId = String(message?.messageId || '').trim();
      if (!message?.isToolEvent || !shellMessageIds.includes(candidateId)) {
        return message;
      }

      return {
        ...message,
        chatId: data.chatId ?? message.chatId,
        toolName: 'shell_cmd',
        toolInput: normalizedInput,
        command: command || message.command,
        toolCallId: String(toolExecution.toolCallId || message.toolCallId || ''),
      };
    });

    return {
      ...state,
      messages,
      needScroll: true
    };
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

  if (toolExecution.toolName === 'shell_cmd') {
    const stateWithEndedStream = handleToolStreamEnd(state, {
      messageIds: getShellToolStreamTerminalMessageIds(String(toolExecution.toolCallId || messageId))
    });
    return upsertToolCompletionMessage(stateWithEndedStream, data);
  }

  // Update existing tool message to show completion
  const messages = [...(state.messages || [])];
  const toolMessageIndex = messages.findIndex(msg =>
    msg.messageId === `${messageId}-tool-${toolExecution.toolCallId}` && msg.isToolEvent
  );

  if (toolMessageIndex !== -1) {
    const previewSource = toolExecution.preview !== undefined ? toolExecution.preview : toolExecution.result;
    const resultPreview = typeof previewSource === 'string'
      ? previewSource.slice(0, 100)
      : JSON.stringify(previewSource).slice(0, 100);

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

  if (toolExecution.toolName === 'shell_cmd') {
    const stateWithEndedStream = handleToolStreamEnd(state, {
      messageIds: getShellToolStreamTerminalMessageIds(String(toolExecution.toolCallId || messageId))
    });
    return upsertToolCompletionMessage(stateWithEndedStream, data, {
      streamType: 'stderr',
      fallbackText: toolExecution.error || 'Tool execution failed',
    });
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
      needScroll: true
    };
  }

  return {
    ...state,
    messages,
    needScroll: true
  };
};

// Note: handleMemoryOnlyMessage function removed
// Memory-only messages are no longer sent via SSE as per requirements
// They are handled internally in the backend without frontend notification

/**
 * Handle tool stream chunk - Update tool message with streaming output
 */
export const handleToolStream = <T extends SSEComponentState>(state: T, data: ToolStreamData): T => {
  const { messageId, agentName, content, stream, chatId, toolName, toolInput, command, toolCallId } = data;

  return createToolStreamState(state, {
    messageId,
    agentName,
    content,
    stream: stream || 'stdout',
    chatId,
    toolName,
    toolInput,
    command,
    toolCallId,
  });
};

export const handleToolStreamEnd = <T extends SSEComponentState>(state: T, data: ToolStreamEndData): T => {
  return finalizeToolStreamState(state, data.messageIds || []);
};
