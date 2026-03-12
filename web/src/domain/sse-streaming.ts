/**
 * SSE Streaming Domain Module - Server-Sent Events Logic
 * 
 * Features:
 * - Stream lifecycle state management (start, chunk, end, error)
 * - Active agent tracking during streaming
 * - Error handling
 * - Tool stream chunk accumulation for shell command output
 * 
 * Note: isWaiting (spinner) is controlled by world events (pending count),
 * not by stream events, to avoid race conditions.
 * 
 * Pure functions for state transitions.
 * 
 * Created: 2025-10-26 - Phase 2: Domain Module Extraction
 * Updated: 2025-11-11 - Removed isWaiting control from stream events
 * Updated: 2026-02-08 - Added createToolStreamState for shell command streaming
 * Updated: 2026-03-12 - Added tool-stream metadata propagation and terminal cleanup helpers for live web shell rows.
 */

import type { WorldComponentState } from '../types';

/**
 * Streaming State Interface
 * Encapsulates SSE streaming state
 */
export interface StreamingState {
  activeAgent: any | null;
  isWaiting: boolean;
  needScroll: boolean;
  error: string | null;
}

/**
 * Create state for stream start
 * Sets active agent (isWaiting controlled by world events)
 */
export function createStreamStartState(
  state: WorldComponentState,
  agentName: string
): WorldComponentState {
  const activeAgent = state.world?.agents.find(a => a.name === agentName);

  return {
    ...state,
    activeAgent: activeAgent || null,
    needScroll: true
  };
}

/**
 * Create state for stream chunk received
 * Maintains scroll flag
 */
export function createStreamChunkState(
  state: WorldComponentState
): WorldComponentState {
  return {
    ...state,
    needScroll: true
  };
}

/**
 * Create state for stream end
 * Clears active agent (isWaiting controlled by world events)
 */
export function createStreamEndState(
  state: WorldComponentState
): WorldComponentState {
  return {
    ...state,
    activeAgent: null,
    needScroll: true
  };
}

/**
 * Create state for stream error
 * Clears streaming state and sets error message
 */
export function createStreamErrorState(
  state: WorldComponentState,
  errorMessage: string
): WorldComponentState {
  return {
    ...state,
    activeAgent: null,
    isWaiting: false,
    isSending: false,
    error: errorMessage
  };
}

/**
 * Check if currently streaming
 */
export function isStreaming(state: StreamingState): boolean {
  return state.isWaiting && state.activeAgent !== null;
}

/**
 * Get active agent name if streaming
 */
export function getActiveAgentName(state: StreamingState): string | null {
  return state.activeAgent?.name || null;
}

/**
 * Create state for tool stream chunk received
 * Accumulates streaming tool output (stdout/stderr) in real-time
 * 
 * @param state - Current component state
 * @param data - Tool stream data with content and stream type
 * @returns Updated state with accumulated tool output
 */
export function createToolStreamState(
  state: WorldComponentState,
  data: {
    messageId: string;
    agentName: string;
    content: string;
    stream: 'stdout' | 'stderr';
    chatId?: string;
    toolName?: string;
    toolInput?: any;
    command?: string;
    toolCallId?: string;
  }
): WorldComponentState {
  const { messageId, agentName, content, stream, chatId, toolName, toolInput, command, toolCallId } = data;
  const messages = [...(state.messages || [])];

  // Find existing tool message (created by handleToolStart or previous stream chunk)
  const toolMessageIndex = messages.findIndex(msg =>
    msg.messageId === messageId && msg.isToolEvent
  );

  if (toolMessageIndex !== -1) {
    // Update existing tool message with accumulated output
    messages[toolMessageIndex] = {
      ...messages[toolMessageIndex],
      text: content,
      streamType: stream,
      isToolStreaming: true,
      toolEventType: 'progress',
      chatId: chatId ?? messages[toolMessageIndex].chatId,
      toolName: toolName || messages[toolMessageIndex].toolName,
      toolInput: toolInput ?? messages[toolMessageIndex].toolInput,
      command: command || messages[toolMessageIndex].command,
      toolCallId: toolCallId || messages[toolMessageIndex].toolCallId,
    };
  } else {
    // Create new tool message if not found (streaming without tool-start)
    messages.push({
      id: `tool-stream-${messageId}`,
      sender: agentName,
      text: content,
      isToolEvent: true,
      isToolStreaming: true,
      streamType: stream,
      toolEventType: 'progress',
      messageId: messageId,
      chatId,
      toolName,
      toolInput,
      command,
      toolCallId,
      createdAt: new Date(),
      type: 'tool-stream'
    } as any);
  }

  return {
    ...state,
    messages,
    needScroll: true
  };
}

export function finalizeToolStreamState(
  state: WorldComponentState,
  messageIds: string[]
): WorldComponentState {
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return state;
  }

  const targetIds = new Set(messageIds.map((messageId) => String(messageId || '').trim()).filter(Boolean));
  if (targetIds.size === 0) {
    return state;
  }

  const messages = (state.messages || []).map((message) => {
    const messageId = String(message.messageId || '').trim();
    if (!message.isToolEvent || !message.isToolStreaming || !targetIds.has(messageId)) {
      return message;
    }

    return {
      ...message,
      isToolStreaming: false,
      toolEventType: 'result',
    };
  });

  return {
    ...state,
    messages,
  };
}
