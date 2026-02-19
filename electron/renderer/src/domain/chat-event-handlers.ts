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
 * - 2026-02-19: Reset elapsed activity timer on idle→active session-activity transition so new agent work starts from 0s.
 * - 2026-02-16: Added defensive SSE end/error handling when `messageId` is missing by clearing response state and ending lingering streams.
 * - 2026-02-16: Added selected-session fallback for unscoped SSE/tool completion events so waiting indicators clear when `chatId` is omitted.
 * - 2026-02-16: Added assistant-message inference from sender when `role` is missing so response-state clears reliably for backend messages published without explicit role.
 * - 2026-02-13: Enhanced log-derived status text to include structured error details (error/message/toolCallId) instead of generic category-message only.
 * - 2026-02-13: Added system-event routing callback support so session metadata (chat titles) can refresh on realtime updates.
 * - 2026-02-13: Global log fallback now publishes via shared status-bar service so any module can surface footer status without App callback threading.
 * - 2026-02-13: Extended response-state callbacks to include tool lifecycle events for reliable stop-mode behavior during tool execution.
 * - 2026-02-13: Added session response-state callbacks so composer send/stop mode can follow realtime start/end lifecycle.
 * - 2026-02-12: Extracted App realtime event orchestration into domain module.
 * - 2026-02-17: Migrated module from JS to TS with typed payload and dependency interfaces.
 */

import { createLogMessage, upsertMessageList, type MessageLike } from './message-updates';
import { publishStatusBarStatus } from './status-bar';

interface BasePayload {
  type?: string;
  subscriptionId?: string;
  worldId?: string;
  chatId?: string | null;
  [key: string]: unknown;
}

interface RealtimeRefs {
  current: {
    getActiveCount: () => number;
    endAllToolStreams: () => string[];
    handleStart: (messageId: string, agentName: string) => void;
    handleChunk: (messageId: string, content: string) => void;
    handleEnd: (messageId: string) => void;
    handleError: (messageId: string, errorMessage: string) => void;
    handleToolStreamStart: (messageId: string, agentName: string, streamType: 'stdout' | 'stderr') => void;
    handleToolStreamChunk: (messageId: string, content: string, streamType: 'stdout' | 'stderr') => void;
    handleToolStreamEnd: (messageId: string) => void;
    isActive: (messageId: string) => boolean;
  } | null;
}

interface ActivityRefs {
  current: {
    setActiveStreamCount: (count: number) => void;
    handleToolStart: (toolUseId: string, toolName: string, toolInput?: Record<string, unknown>) => void;
    handleToolResult: (toolUseId: string, result: string) => void;
    handleToolError: (toolUseId: string, error: string) => void;
    handleToolProgress: (toolUseId: string, progress: string) => void;
    resetElapsed?: () => void;
  } | null;
}

interface ChatHandlerOptions {
  subscriptionId: string;
  loadedWorldId: string | null | undefined;
  selectedSessionId: string | null | undefined;
  streamingStateRef: RealtimeRefs;
  activityStateRef: ActivityRefs;
  setMessages: (updater: (existing: MessageLike[]) => MessageLike[]) => void;
  setActiveStreamCount: (count: number) => void;
  onSessionResponseStateChange?: (chatId: string, isActive: boolean) => void;
  onSessionActivityUpdate?: (activity: {
    eventType: string;
    pendingOperations: number;
    activityId: number;
    source: string | null;
    activeSources: string[];
  }) => void;
  onSessionSystemEvent?: (event: {
    eventType: string;
    chatId: string | null;
    messageId: string | null;
    createdAt: string | null;
    content: unknown;
  }) => void;
}

function isAssistantLikeMessage(message: Record<string, unknown> | null | undefined) {
  if (!message) return false;

  const role = String(message.role || '').toLowerCase().trim();
  if (role === 'assistant') return true;
  if (role === 'user' || role === 'tool' || role === 'system') return false;

  const sender = String(message.sender || '').toLowerCase().trim();
  if (!sender) return false;
  if (sender === 'human' || sender === 'system' || sender === 'world') return false;
  if (sender.startsWith('user')) return false;

  return true;
}

function buildLogStatusText(logEvent: Record<string, unknown> | null | undefined) {
  const category = String(logEvent?.category || 'system');
  const baseMessage = String(logEvent?.message || 'Unknown error');
  const data = logEvent?.data && typeof logEvent.data === 'object'
    ? (logEvent.data as Record<string, unknown>)
    : null;

  if (!data) {
    return `${category} - ${baseMessage}`;
  }

  const detailParts: string[] = [];
  const detailText = data.error || data.errorMessage || data.message;
  if (detailText) {
    detailParts.push(String(detailText));
  }
  if (data.toolCallId) {
    detailParts.push(`toolCallId=${String(data.toolCallId)}`);
  }
  if (data.agentId) {
    detailParts.push(`agent=${String(data.agentId)}`);
  }

  if (detailParts.length === 0) {
    return `${category} - ${baseMessage}`;
  }

  return `${category} - ${baseMessage}: ${detailParts.join(' | ')}`;
}

export function createGlobalLogEventHandler({
  loadedWorldId,
  selectedSessionId,
  setMessages,
  setStatusText,
}: {
  loadedWorldId: string | null | undefined;
  selectedSessionId: string | null | undefined;
  setMessages: (updater: (existing: MessageLike[]) => MessageLike[]) => void;
  setStatusText?: (text: string, kind: 'info' | 'error' | 'success') => void;
}) {
  return (payload: BasePayload & { logEvent?: Record<string, unknown> }) => {
    if (!payload || payload.type !== 'log') return;

    const logEvent = payload.logEvent;
    if (!logEvent) return;

    const hasActiveSession = Boolean(loadedWorldId && selectedSessionId);
    if (hasActiveSession) {
      setMessages((existing) => [...existing, createLogMessage(logEvent)]);
      return;
    }

    const statusText = buildLogStatusText(logEvent);
    const level = String(logEvent?.level || '').toLowerCase();
    const emitStatus = typeof setStatusText === 'function' ? setStatusText : publishStatusBarStatus;
    emitStatus(statusText, level === 'error' ? 'error' : 'info');
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
  onSessionSystemEvent,
}: ChatHandlerOptions) {
  let lastActivityPendingOperations = 0;

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

  return (payload: BasePayload) => {
    if (!payload) return;
    if (payload.subscriptionId && payload.subscriptionId !== subscriptionId) return;
    if (payload.worldId && payload.worldId !== loadedWorldId) return;

    if (payload.type === 'message') {
      const incomingMessage = payload.message as Record<string, unknown> | undefined;
      if (!incomingMessage) return;

      const incomingChatId = String(incomingMessage.chatId || payload.chatId || '').trim() || null;
      if (selectedSessionId && incomingChatId !== selectedSessionId) {
        if (
          !incomingChatId
          && isAssistantLikeMessage(incomingMessage)
          && typeof onSessionResponseStateChange === 'function'
        ) {
          onSessionResponseStateChange(selectedSessionId, false);
          endAllToolStreams();
        }
        return;
      }

      setMessages((existing) => upsertMessageList(existing, {
        ...incomingMessage,
        isStreaming: false,
        isToolStreaming: false,
        streamType: undefined,
      }));

      if (isAssistantLikeMessage(incomingMessage)) {
        if (typeof onSessionResponseStateChange === 'function' && incomingChatId) {
          onSessionResponseStateChange(incomingChatId, false);
        }
        endAllToolStreams();
      }
      return;
    }

    if (payload.type === 'sse') {
      const streamPayload = payload.sse as Record<string, unknown> | undefined;
      if (!streamPayload) return;

      const streamChatId = String(streamPayload.chatId || payload.chatId || '').trim() || null;
      if (selectedSessionId && streamChatId && streamChatId !== selectedSessionId) return;
      const responseChatId = streamChatId || selectedSessionId || null;

      const eventType = String(streamPayload.eventType || '').toLowerCase();
      const messageId = streamPayload.messageId ? String(streamPayload.messageId) : '';
      const streaming = streamingStateRef.current;
      if (!streaming) return;

      if (!messageId) {
        if (eventType === 'end' || eventType === 'error') {
          if (typeof onSessionResponseStateChange === 'function' && responseChatId) {
            onSessionResponseStateChange(responseChatId, false);
          }
          endAllToolStreams();
          syncActiveStreamCount();
        }
        return;
      }

      if (eventType === 'start') {
        if (typeof onSessionResponseStateChange === 'function' && responseChatId) {
          onSessionResponseStateChange(responseChatId, true);
        }
        endAllToolStreams();
        streaming.handleStart(messageId, String(streamPayload.agentName || 'assistant'));
        syncActiveStreamCount();
      } else if (eventType === 'chunk') {
        streaming.handleChunk(messageId, String(streamPayload.content || ''));
      } else if (eventType === 'end') {
        if (typeof onSessionResponseStateChange === 'function' && responseChatId) {
          onSessionResponseStateChange(responseChatId, false);
        }
        streaming.handleEnd(messageId);
        syncActiveStreamCount();
      } else if (eventType === 'error') {
        if (typeof onSessionResponseStateChange === 'function' && responseChatId) {
          onSessionResponseStateChange(responseChatId, false);
        }
        streaming.handleError(messageId, String(streamPayload.error || 'Stream error'));
        syncActiveStreamCount();
      } else if (eventType === 'tool-stream') {
        const content = String(streamPayload.content || '');
        const stream = String(streamPayload.stream || 'stdout') === 'stderr' ? 'stderr' : 'stdout';
        if (!streaming.isActive(messageId)) {
          streaming.handleToolStreamStart(
            messageId,
            String(streamPayload.agentName || 'shell_cmd'),
            stream,
          );
          syncActiveStreamCount();
        }
        streaming.handleToolStreamChunk(messageId, content, stream);
      }
      return;
    }

    if (payload.type === 'tool') {
      const toolPayload = payload.tool as Record<string, unknown> | undefined;
      if (!toolPayload) return;
      const toolChatId = String(payload.chatId || toolPayload.chatId || '').trim() || null;
      if (selectedSessionId && toolChatId && toolChatId !== selectedSessionId) return;
      const responseChatId = toolChatId || selectedSessionId || null;

      const activity = activityStateRef.current;
      if (!activity) return;

      const toolEventType = String(toolPayload.eventType || '').toLowerCase();
      const toolUseId = String(toolPayload.toolUseId || '').trim();
      if (!toolUseId) return;

      if (toolEventType === 'tool-start') {
        if (typeof onSessionResponseStateChange === 'function' && responseChatId) {
          onSessionResponseStateChange(responseChatId, true);
        }
        activity.handleToolStart(
          toolUseId,
          String(toolPayload.toolName || 'unknown'),
          (toolPayload.toolInput as Record<string, unknown> | undefined) || undefined,
        );
      } else if (toolEventType === 'tool-result') {
        if (typeof onSessionResponseStateChange === 'function' && responseChatId) {
          onSessionResponseStateChange(responseChatId, false);
        }
        activity.handleToolResult(toolUseId, String(toolPayload.result || ''));
        const streaming = streamingStateRef.current;
        if (streaming?.isActive(toolUseId)) {
          streaming.handleToolStreamEnd(toolUseId);
          syncActiveStreamCount();
        } else {
          endAllToolStreams();
        }
      } else if (toolEventType === 'tool-error') {
        if (typeof onSessionResponseStateChange === 'function' && responseChatId) {
          onSessionResponseStateChange(responseChatId, false);
        }
        activity.handleToolError(toolUseId, String(toolPayload.error || 'Tool error'));
        const streaming = streamingStateRef.current;
        if (streaming?.isActive(toolUseId)) {
          streaming.handleToolStreamEnd(toolUseId);
          syncActiveStreamCount();
        } else {
          endAllToolStreams();
        }
      } else if (toolEventType === 'tool-progress') {
        activity.handleToolProgress(toolUseId, String(toolPayload.progress || ''));
      }
    }

    if (payload.type === 'activity') {
      const activityPayload = payload.activity as Record<string, unknown> | undefined;
      if (!activityPayload) return;

      const activityChatId = String(payload.chatId || '').trim() || null;
      if (selectedSessionId && activityChatId && activityChatId !== selectedSessionId) return;

      if (typeof onSessionActivityUpdate === 'function') {
        onSessionActivityUpdate({
          eventType: String(activityPayload.eventType || ''),
          pendingOperations: Number(activityPayload.pendingOperations) || 0,
          activityId: Number(activityPayload.activityId) || 0,
          source: activityPayload.source ? String(activityPayload.source) : null,
          activeSources: Array.isArray(activityPayload.activeSources)
            ? activityPayload.activeSources.map((source) => String(source))
            : [],
        });
      }

      const pendingOperations = Number(activityPayload.pendingOperations) || 0;
      if (pendingOperations > 0 && lastActivityPendingOperations <= 0) {
        activityStateRef.current?.resetElapsed?.();
      }
      lastActivityPendingOperations = pendingOperations;

      if (typeof onSessionResponseStateChange === 'function') {
        if (pendingOperations <= 0) {
          const responseChatId = activityChatId || selectedSessionId || null;
          if (responseChatId) {
            onSessionResponseStateChange(responseChatId, false);
          }
        }
      }
    }

    if (payload.type === 'system') {
      const systemPayload = payload.system as Record<string, unknown> | undefined;
      if (!systemPayload) return;

      const systemChatId = String(payload.chatId || systemPayload.chatId || '').trim() || null;
      if (selectedSessionId && systemChatId !== selectedSessionId) return;

      if (typeof onSessionSystemEvent === 'function') {
        onSessionSystemEvent({
          eventType: String(systemPayload.eventType || ''),
          chatId: systemChatId,
          messageId: systemPayload.messageId ? String(systemPayload.messageId) : null,
          createdAt: systemPayload.createdAt ? String(systemPayload.createdAt) : null,
          content: systemPayload.content,
        });
      }
    }
  };
}
