/**
 * Renderer Chat Event Handlers
 * Purpose:
 * - Encapsulate chat/log realtime event routing logic used by App effects.
 *
 * Features:
 * - Global log event handler for status or message timeline updates
 * - Session-scoped realtime handler for message/sse/tool events
 * - Stream/activity synchronization helpers
 *
 * Implementation Notes:
 * - Handlers are generated from dependency injection for testability.
 * - Session filtering relies on canonical payload `worldId` and `chatId`.
 *
 * Recent Changes:
 * - 2026-02-12: Extracted App realtime event orchestration into domain module.
 */

import { createLogMessage, upsertMessageList } from './message-updates.js';

export function createGlobalLogEventHandler({
  loadedWorldId,
  selectedSessionId,
  setMessages,
  setStatusText
}) {
  return (payload) => {
    if (!payload || payload.type !== 'log') return;

    const logEvent = payload.logEvent;
    if (!logEvent) return;

    const hasActiveSession = Boolean(loadedWorldId && selectedSessionId);
    if (hasActiveSession) {
      setMessages((existing) => [...existing, createLogMessage(logEvent)]);
      return;
    }

    const category = String(logEvent?.category || 'system');
    const message = String(logEvent?.message || 'Unknown error');
    const level = String(logEvent?.level || '').toLowerCase();
    setStatusText(`${category} - ${message}`, level === 'error' ? 'error' : 'info');
  };
}

export function createChatSubscriptionEventHandler({
  subscriptionId,
  loadedWorldId,
  selectedSessionId,
  streamingStateRef,
  activityStateRef,
  setMessages,
  setActiveStreamCount
}) {
  const syncActiveStreamCount = () => {
    const streaming = streamingStateRef.current;
    if (!streaming) return;

    const count = streaming.getActiveCount();
    setActiveStreamCount(count);
    if (activityStateRef.current) {
      activityStateRef.current.setActiveStreamCount(count);
    }
  };

  const endAllToolStreams = () => {
    const streaming = streamingStateRef.current;
    if (!streaming) return;

    const endedIds = streaming.endAllToolStreams();
    if (endedIds.length > 0) {
      syncActiveStreamCount();
    }
  };

  return (payload) => {
    if (!payload) return;
    if (payload.subscriptionId && payload.subscriptionId !== subscriptionId) return;
    if (payload.worldId && payload.worldId !== loadedWorldId) return;

    if (payload.type === 'message') {
      const incomingMessage = payload.message;
      if (!incomingMessage) return;

      const incomingChatId = incomingMessage.chatId || payload.chatId || null;
      if (selectedSessionId && incomingChatId && incomingChatId !== selectedSessionId) return;

      setMessages((existing) => upsertMessageList(existing, {
        ...incomingMessage,
        isStreaming: false,
        isToolStreaming: false,
        streamType: undefined
      }));

      // Tool stream chunks can outlive their owning tool call in some flows.
      // Once assistant output is finalized, close any lingering tool stream state.
      if (String(incomingMessage.role || '').toLowerCase() === 'assistant') {
        endAllToolStreams();
      }
      return;
    }

    if (payload.type === 'sse') {
      const streamPayload = payload.sse;
      if (!streamPayload) return;

      const streamChatId = streamPayload.chatId || payload.chatId || null;
      if (selectedSessionId && streamChatId && streamChatId !== selectedSessionId) return;

      const eventType = String(streamPayload.eventType || '').toLowerCase();
      const messageId = streamPayload.messageId;
      if (!messageId) return;

      const streaming = streamingStateRef.current;
      if (!streaming) return;

      if (eventType === 'start') {
        endAllToolStreams();
        streaming.handleStart(messageId, streamPayload.agentName || 'assistant');
        syncActiveStreamCount();
      } else if (eventType === 'chunk') {
        streaming.handleChunk(messageId, streamPayload.content || '');
      } else if (eventType === 'end') {
        streaming.handleEnd(messageId);
        syncActiveStreamCount();
      } else if (eventType === 'error') {
        streaming.handleError(messageId, streamPayload.error || 'Stream error');
        syncActiveStreamCount();
      } else if (eventType === 'tool-stream') {
        const { content, stream } = streamPayload;
        if (!streaming.isActive(messageId)) {
          streaming.handleToolStreamStart(
            messageId,
            streamPayload.agentName || 'shell_cmd',
            stream || 'stdout'
          );
          syncActiveStreamCount();
        }
        streaming.handleToolStreamChunk(messageId, content || '', stream || 'stdout');
      }
      return;
    }

    if (payload.type === 'tool') {
      const toolPayload = payload.tool;
      if (!toolPayload) return;

      const activity = activityStateRef.current;
      if (!activity) return;

      const toolEventType = String(toolPayload.eventType || '').toLowerCase();
      const toolUseId = toolPayload.toolUseId;
      if (!toolUseId) return;

      if (toolEventType === 'tool-start') {
        activity.handleToolStart(toolUseId, toolPayload.toolName || 'unknown', toolPayload.toolInput);
      } else if (toolEventType === 'tool-result') {
        activity.handleToolResult(toolUseId, toolPayload.result || '');
        const streaming = streamingStateRef.current;
        if (streaming?.isActive(toolUseId)) {
          streaming.handleToolStreamEnd(toolUseId);
          syncActiveStreamCount();
        } else {
          endAllToolStreams();
        }
      } else if (toolEventType === 'tool-error') {
        activity.handleToolError(toolUseId, toolPayload.error || 'Tool error');
        const streaming = streamingStateRef.current;
        if (streaming?.isActive(toolUseId)) {
          streaming.handleToolStreamEnd(toolUseId);
          syncActiveStreamCount();
        } else {
          endAllToolStreams();
        }
      } else if (toolEventType === 'tool-progress') {
        activity.handleToolProgress(toolUseId, toolPayload.progress || '');
      }
    }
  };
}
