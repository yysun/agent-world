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
 * - 2026-02-13: Added system-event routing callback support so session metadata (chat titles) can refresh on realtime updates.
 * - 2026-02-13: Global log fallback now publishes via shared status-bar service so any module can surface footer status without App callback threading.
 * - 2026-02-13: Extended response-state callbacks to include tool lifecycle events for reliable stop-mode behavior during tool execution.
 * - 2026-02-13: Added session response-state callbacks so composer send/stop mode can follow realtime start/end lifecycle.
 * - 2026-02-12: Extracted App realtime event orchestration into domain module.
 */

import { createLogMessage, upsertMessageList } from './message-updates.js';
import { publishStatusBarStatus } from './status-bar.js';

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
    const emitStatus = typeof setStatusText === 'function' ? setStatusText : publishStatusBarStatus;
    emitStatus(`${category} - ${message}`, level === 'error' ? 'error' : 'info');
  };
}

export function createChatSubscriptionEventHandler({
  subscriptionId,
  loadedWorldId,
  selectedSessionId,
  streamingStateRef,
  activityStateRef,
  setMessages,
  setActiveStreamCount,
  onSessionResponseStateChange,
  onSessionActivityUpdate,
  onSessionSystemEvent
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
        if (typeof onSessionResponseStateChange === 'function' && incomingChatId) {
          onSessionResponseStateChange(incomingChatId, false);
        }
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
        if (typeof onSessionResponseStateChange === 'function' && streamChatId) {
          onSessionResponseStateChange(streamChatId, true);
        }
        endAllToolStreams();
        streaming.handleStart(messageId, streamPayload.agentName || 'assistant');
        syncActiveStreamCount();
      } else if (eventType === 'chunk') {
        streaming.handleChunk(messageId, streamPayload.content || '');
      } else if (eventType === 'end') {
        if (typeof onSessionResponseStateChange === 'function' && streamChatId) {
          onSessionResponseStateChange(streamChatId, false);
        }
        streaming.handleEnd(messageId);
        syncActiveStreamCount();
      } else if (eventType === 'error') {
        if (typeof onSessionResponseStateChange === 'function' && streamChatId) {
          onSessionResponseStateChange(streamChatId, false);
        }
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
      const toolChatId = payload.chatId || toolPayload.chatId || null;
      if (selectedSessionId && toolChatId && toolChatId !== selectedSessionId) return;

      const activity = activityStateRef.current;
      if (!activity) return;

      const toolEventType = String(toolPayload.eventType || '').toLowerCase();
      const toolUseId = toolPayload.toolUseId;
      if (!toolUseId) return;

      if (toolEventType === 'tool-start') {
        if (typeof onSessionResponseStateChange === 'function' && toolChatId) {
          onSessionResponseStateChange(toolChatId, true);
        }
        activity.handleToolStart(toolUseId, toolPayload.toolName || 'unknown', toolPayload.toolInput);
      } else if (toolEventType === 'tool-result') {
        if (typeof onSessionResponseStateChange === 'function' && toolChatId) {
          onSessionResponseStateChange(toolChatId, false);
        }
        activity.handleToolResult(toolUseId, toolPayload.result || '');
        const streaming = streamingStateRef.current;
        if (streaming?.isActive(toolUseId)) {
          streaming.handleToolStreamEnd(toolUseId);
          syncActiveStreamCount();
        } else {
          endAllToolStreams();
        }
      } else if (toolEventType === 'tool-error') {
        if (typeof onSessionResponseStateChange === 'function' && toolChatId) {
          onSessionResponseStateChange(toolChatId, false);
        }
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

    if (payload.type === 'activity') {
      const activityPayload = payload.activity;
      if (!activityPayload) return;

      const activityChatId = payload.chatId || null;
      if (selectedSessionId && activityChatId && activityChatId !== selectedSessionId) return;

      if (typeof onSessionActivityUpdate === 'function') {
        onSessionActivityUpdate({
          eventType: String(activityPayload.eventType || ''),
          pendingOperations: Number(activityPayload.pendingOperations) || 0,
          activityId: Number(activityPayload.activityId) || 0,
          source: activityPayload.source || null,
          activeSources: Array.isArray(activityPayload.activeSources) ? activityPayload.activeSources : []
        });
      }
    }

    if (payload.type === 'system') {
      const systemPayload = payload.system;
      if (!systemPayload) return;

      const systemChatId = payload.chatId || systemPayload.chatId || null;
      if (selectedSessionId && systemChatId && systemChatId !== selectedSessionId) return;

      if (typeof onSessionSystemEvent === 'function') {
        onSessionSystemEvent({
          eventType: String(systemPayload.eventType || ''),
          chatId: systemChatId,
          messageId: systemPayload.messageId || null,
          createdAt: systemPayload.createdAt || null,
          content: systemPayload.content
        });
      }
    }
  };
}
