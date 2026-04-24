/**
 * useChatEventSubscriptions Hook
 * Purpose:
 * - Encapsulate renderer global-log and chat-subscription side effects.
 *
 * Key Features:
 * - Registers global log listener independent of chat subscription state.
 * - Manages chat realtime subscription lifecycle and cleanup.
 * - Handles HITL queue ingestion and chat-title refresh triggers.
 *
 * Implementation Notes:
 * - Preserves prior App.tsx event behavior and cleanup ordering.
 * - Accepts state setters/callbacks via dependency injection.
 *
 * Recent Changes:
 * - 2026-04-24: Reconcile terminal tool events against the HITL queue and export a world-change reset helper so pending session indicators do not stay stale.
 * - 2026-04-23: Added a world-wide HITL-only subscription so sidebar pending indicators update for all chats while preserving selected-chat replay and streaming isolation.
 * - 2026-03-10: Updated streaming-state typing to include chat-scoped assistant SSE start/chunk
 *   propagation so selected-chat refreshes can retain live streaming rows.
 * - 2026-03-06: Ref-ified callback dependencies (onSessionSystemEvent, refreshSessions, resetActivityRuntimeState, onMainLogEvent, setHitlPromptQueue) so subscription effects only re-run on data-identity changes (world/session switch), not callback identity changes.
 * - 2026-03-06: Added app-level selected-chat system-event callback wiring for status-bar visibility while preserving title-refresh side effects.
 * - 2026-02-27: Global log listener now routes events only to logs-panel ingestion; chat message list is no longer mutated for realtime log events.
 * - 2026-02-27: Added app-level main log callback wiring so global log events can feed the logs panel independently of chat message rendering.
 * - 2026-02-26: Replaced chat-subscription lifecycle console traces with categorized renderer logger output controlled by env-derived log config.
 * - 2026-02-25: Added subscription lifecycle trace logs (subscribe/unsubscribe/HITL ingest) for resume timing diagnostics.
 * - 2026-02-24: Fixed subscription cycling: changed loadedWorld dependency to loadedWorld?.id
 *   so world metadata refreshes (HITL response, chat switch) no longer tear down and
 *   recreate the subscription, losing realtime events and working indicator state.
 * - 2026-02-24: Added exported HITL queue-ingestion helper for deterministic replay dedupe testing.
 *   Deferred HITL enqueue uses batched flush to avoid dropping prompts on multi-replay.
 * - 2026-02-24: Removed activityStateRef — activity-state.ts deleted as part of
 *   working-status simplification.
 * - 2026-02-22: Removed onSessionResponseStateChange, setPendingResponseSessionIds,
 *   setSessionActivity, setStatusText, setActiveStreamCount as part of status-registry
 *   migration (Phase 1).
 * - 2026-02-21: Extended tool-stream callback typing with optional command metadata for shell command labeling.
 * - 2026-02-21: Updated realtime stream typing to include optional tool name in tool-stream callbacks.
 * - 2026-02-20: Enforced options-only HITL parsing and queue ingestion.
 * - 2026-02-19: Extended activity-state typing with optional elapsed reset hook used by activity event transitions.
 * - 2026-02-17: Extracted from App.tsx during CC pass.
 */

import { Dispatch, MutableRefObject, SetStateAction, useEffect, useRef } from 'react';
import {
  createChatSubscriptionEventHandler,
  createGlobalLogEventHandler,
  type MainProcessLogEntry,
} from '../domain/chat-event-handlers';
import type { DesktopApi } from '../types/desktop-api';
import type { MessageLike } from '../domain/message-updates';
import { rendererLogger } from '../utils/logger';

type HitlOption = {
  id: string;
  label: string;
  description?: string;
};

type HitlPrompt = {
  requestId: string;
  chatId: string | null;
  toolCallId?: string;
  title: string;
  message: string;
  mode: 'option';
  options: HitlOption[];
  defaultOptionId?: string;
  metadata?: {
    refreshAfterDismiss?: boolean;
    kind?: string;
  };
};

type RealtimeState = {
  getActiveCount: () => number;
  endAllToolStreams: () => string[];
  handleStart: (messageId: string, agentName: string, chatId?: string | null) => void;
  handleChunk: (messageId: string, content: string, chatId?: string | null) => void;
  handleEnd: (messageId: string) => void;
  handleError: (messageId: string, errorMessage: string) => void;
  handleToolStreamStart: (messageId: string, agentName: string, streamType: 'stdout' | 'stderr', toolName?: string, command?: string) => void;
  handleToolStreamChunk: (messageId: string, content: string, streamType: 'stdout' | 'stderr', toolName?: string, command?: string) => void;
  handleToolStreamEnd: (messageId: string) => void;
  isActive: (messageId: string) => boolean;
  cleanup: () => void;
};

type UseChatEventSubscriptionsArgs = {
  api: DesktopApi;
  loadedWorld: { id?: string } | null;
  selectedSessionId: string | null;
  sessions: Array<{ id?: string | null; hasPendingHitlPrompt?: boolean }>;
  setMessages: Dispatch<SetStateAction<MessageLike[]>>;
  chatSubscriptionCounter: MutableRefObject<number>;
  streamingStateRef: MutableRefObject<RealtimeState | null>;
  refreshSessions: (worldId: string, preferredSessionId?: string | null) => Promise<void>;
  resetActivityRuntimeState: () => void;
  setHitlPromptQueue: Dispatch<SetStateAction<HitlPrompt[]>>;
  onMainLogEvent?: (entry: MainProcessLogEntry) => void;
  onSessionSystemEvent?: (event: SessionSystemEventPayload) => void;
};

export type SessionSystemEventPayload = {
  eventType?: string | null;
  chatId?: string | null;
  messageId?: string | null;
  createdAt?: string | null;
  content?: unknown;
};

export function forwardSessionSystemEvent(args: {
  loadedWorldId: string | null | undefined;
  refreshSessions: (worldId: string, preferredSessionId?: string | null) => Promise<void>;
  onSessionSystemEvent?: (event: SessionSystemEventPayload) => void;
  systemEvent: SessionSystemEventPayload;
}): void {
  const {
    loadedWorldId,
    refreshSessions,
    onSessionSystemEvent,
    systemEvent,
  } = args;

  if (!loadedWorldId) return;

  const eventType = String(systemEvent?.eventType || '').trim();
  const targetChatId = String(systemEvent?.chatId || '').trim() || null;
  if (!targetChatId) return;
  if (eventType === 'chat-title-updated') {
    refreshSessions(loadedWorldId, targetChatId).catch(() => { });
  }

  if (typeof onSessionSystemEvent === 'function') {
    onSessionSystemEvent(systemEvent);
  }
}

export function enqueueHitlPromptFromToolEvent(
  existing: HitlPrompt[],
  payload: any,
): HitlPrompt[] {
  const toolPayload = payload?.tool && typeof payload.tool === 'object'
    ? (payload.tool as Record<string, unknown>)
    : null;
  const eventType = String(toolPayload?.eventType || '').trim().toLowerCase();
  const toolUseId = String(toolPayload?.toolUseId || '').trim();
  const payloadChatId = String(payload?.chatId || '').trim() || null;

  if (eventType === 'tool-result' || eventType === 'tool-error') {
    if (!toolUseId || !payloadChatId) {
      return existing;
    }

    return existing.filter((entry) => {
      const entryChatId = String(entry?.chatId || '').trim() || null;
      if (entryChatId !== payloadChatId) {
        return true;
      }

      const entryToolCallId = String(entry?.toolCallId || '').trim();
      const entryRequestId = String(entry?.requestId || '').trim();
      return entryToolCallId !== toolUseId && entryRequestId !== toolUseId;
    });
  }

  if (eventType !== 'tool-progress') {
    return existing;
  }

  const toolMetadata = toolPayload?.metadata && typeof toolPayload.metadata === 'object'
    ? (toolPayload.metadata as Record<string, unknown>)
    : null;
  const content = toolMetadata?.hitlPrompt && typeof toolMetadata.hitlPrompt === 'object'
    ? (toolMetadata.hitlPrompt as Record<string, unknown>)
    : null;
  const requestId = String(content?.requestId || '').trim();
  if (!requestId) {
    return existing;
  }

  if (existing.some((entry) => entry.requestId === requestId)) {
    return existing;
  }

  const options = Array.isArray(content?.options)
    ? content.options
      .map((option) => ({
        id: String(option?.id || '').trim(),
        label: String(option?.label || '').trim(),
        description: option?.description ? String(option.description) : ''
      }))
      .filter((option) => option.id && option.label)
    : [];
  if (options.length === 0) {
    return existing;
  }

  const promptMetadata = content?.metadata && typeof content.metadata === 'object'
    ? (content.metadata as Record<string, unknown>)
    : null;

  const promptChatId = String(content?.chatId || payload?.chatId || '').trim() || null;
  if (!promptChatId) {
    return existing;
  }

  const promptToolCallId = String(content?.toolCallId || toolUseId || '').trim();

  return [
    ...existing,
    {
      requestId,
      chatId: promptChatId,
      ...(promptToolCallId ? { toolCallId: promptToolCallId } : {}),
      title: String(content?.title || 'Approval required').trim() || 'Approval required',
      message: String(content?.message || '').trim(),
      mode: 'option',
      options,
      ...(typeof content?.defaultOptionId === 'string' ? { defaultOptionId: String(content.defaultOptionId) } : {}),
      metadata: {
        refreshAfterDismiss: promptMetadata?.refreshAfterDismiss === true,
        kind: typeof promptMetadata?.kind === 'string' ? promptMetadata.kind : undefined,
      },
    }
  ];
}

export function shouldResetHitlQueueForWorldChange(
  previousWorldId: string | null | undefined,
  nextWorldId: string | null | undefined,
): boolean {
  const previous = String(previousWorldId || '').trim() || null;
  const next = String(nextWorldId || '').trim() || null;
  return previous !== null && previous !== next;
}

export function useChatEventSubscriptions({
  api,
  loadedWorld,
  selectedSessionId,
  sessions,
  setMessages,
  chatSubscriptionCounter,
  streamingStateRef,
  refreshSessions,
  resetActivityRuntimeState,
  setHitlPromptQueue,
  onMainLogEvent,
  onSessionSystemEvent,
}: UseChatEventSubscriptionsArgs) {
  const pendingHitlEventsRef = useRef<any[]>([]);
  const pendingHitlFlushTimerRef = useRef<number | null>(null);
  const globalPendingHitlEventsRef = useRef<any[]>([]);
  const globalPendingHitlFlushTimerRef = useRef<number | null>(null);

  // Stable refs for callback-type dependencies so subscription effects never
  // re-run solely because a callback identity changed between renders.
  const onMainLogEventRef = useRef(onMainLogEvent);
  onMainLogEventRef.current = onMainLogEvent;
  const onSessionSystemEventRef = useRef(onSessionSystemEvent);
  onSessionSystemEventRef.current = onSessionSystemEvent;
  const refreshSessionsRef = useRef(refreshSessions);
  refreshSessionsRef.current = refreshSessions;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const resetActivityRef = useRef(resetActivityRuntimeState);
  resetActivityRef.current = resetActivityRuntimeState;
  const setHitlPromptQueueRef = useRef(setHitlPromptQueue);
  setHitlPromptQueueRef.current = setHitlPromptQueue;

  useEffect(() => {
    const removeListener = api.onChatEvent(createGlobalLogEventHandler({
      onMainLogEvent: (entry) => onMainLogEventRef.current?.(entry),
    }));

    return () => {
      removeListener();
    };
  }, [api]);

  const loadedWorldId = loadedWorld?.id;

  useEffect(() => {
    if (!loadedWorldId || !selectedSessionId) {
      return undefined;
    }

    const subscriptionId = `chat-${Date.now()}-${chatSubscriptionCounter.current++}`;
    rendererLogger.debug('electron.renderer.subscription', 'Chat subscription setup started', {
      worldId: loadedWorldId,
      chatId: selectedSessionId,
      subscriptionId
    });
    const chatEventHandler = createChatSubscriptionEventHandler({
      subscriptionId,
      loadedWorldId,
      selectedSessionId,
      streamingStateRef,
      setMessages,
      onSessionSystemEvent: (systemEvent) => {
        forwardSessionSystemEvent({
          loadedWorldId,
          refreshSessions: refreshSessionsRef.current,
          onSessionSystemEvent: onSessionSystemEventRef.current,
          systemEvent,
        });
      }
    });

    const removeListener = api.onChatEvent((payload: any) => {
      chatEventHandler(payload);

      if (payload?.type !== 'tool') {
        return;
      }

      if (payload?.subscriptionId && payload.subscriptionId !== subscriptionId) {
        return;
      }
      if (payload?.worldId && payload.worldId !== loadedWorldId) {
        return;
      }

      pendingHitlEventsRef.current.push(payload);
      if (pendingHitlFlushTimerRef.current === null) {
        pendingHitlFlushTimerRef.current = window.setTimeout(() => {
          const batch = pendingHitlEventsRef.current.splice(0);
          pendingHitlFlushTimerRef.current = null;
          if (batch.length === 0) return;
          rendererLogger.debug('electron.renderer.subscription', 'Ingesting HITL prompt batch from realtime events', {
            worldId: loadedWorldId,
            chatId: selectedSessionId,
            eventCount: batch.length,
            subscriptionId
          });
          setHitlPromptQueueRef.current((existing) => {
            let queue = existing;
            for (const entry of batch) {
              queue = enqueueHitlPromptFromToolEvent(queue, entry);
            }
            return queue;
          });
        }, 0);
      }
    });

    api.subscribeChatEvents(loadedWorldId, selectedSessionId, subscriptionId).catch(() => { });
    rendererLogger.debug('electron.renderer.subscription', 'Chat subscription request dispatched', {
      worldId: loadedWorldId,
      chatId: selectedSessionId,
      subscriptionId
    });

    return () => {
      rendererLogger.debug('electron.renderer.subscription', 'Chat subscription teardown started', {
        worldId: loadedWorldId,
        chatId: selectedSessionId,
        subscriptionId
      });
      removeListener();
      api.unsubscribeChatEvents(subscriptionId).catch(() => { });
      if (streamingStateRef.current) {
        streamingStateRef.current.cleanup();
      }
      if (pendingHitlFlushTimerRef.current !== null) {
        clearTimeout(pendingHitlFlushTimerRef.current);
        pendingHitlFlushTimerRef.current = null;
      }
      pendingHitlEventsRef.current = [];
      resetActivityRef.current();
    };
  }, [
    api,
    chatSubscriptionCounter,
    loadedWorldId,
    selectedSessionId,
    setMessages,
    streamingStateRef,
  ]);

  useEffect(() => {
    if (!loadedWorldId) {
      return undefined;
    }

    const subscriptionId = `hitl-all-${Date.now()}-${chatSubscriptionCounter.current++}`;
    rendererLogger.debug('electron.renderer.subscription', 'All-chat HITL subscription setup started', {
      worldId: loadedWorldId,
      subscriptionId
    });

    const removeListener = api.onChatEvent((payload: any) => {
      if (payload?.type !== 'tool') {
        return;
      }
      if (payload?.subscriptionId && payload.subscriptionId !== subscriptionId) {
        return;
      }
      if (payload?.worldId && payload.worldId !== loadedWorldId) {
        return;
      }

      globalPendingHitlEventsRef.current.push(payload);
      if (globalPendingHitlFlushTimerRef.current === null) {
        globalPendingHitlFlushTimerRef.current = window.setTimeout(() => {
          const batch = globalPendingHitlEventsRef.current.splice(0);
          globalPendingHitlFlushTimerRef.current = null;
          if (batch.length === 0) return;
          rendererLogger.debug('electron.renderer.subscription', 'Ingesting all-chat HITL prompt batch from realtime events', {
            worldId: loadedWorldId,
            eventCount: batch.length,
            subscriptionId
          });
          const refreshChatIds = new Set<string>();
          setHitlPromptQueueRef.current((existing) => {
            let queue = existing;
            for (const entry of batch) {
              queue = enqueueHitlPromptFromToolEvent(queue, entry);
            }

            for (const entry of batch) {
              const toolPayload = entry?.tool && typeof entry.tool === 'object'
                ? (entry.tool as Record<string, unknown>)
                : null;
              const eventType = String(toolPayload?.eventType || '').trim().toLowerCase();
              const chatId = String(entry?.chatId || '').trim();
              if (!chatId || (eventType !== 'tool-result' && eventType !== 'tool-error')) {
                continue;
              }

              const queueHadPendingState = existing.some((prompt) => String(prompt?.chatId || '').trim() === chatId);
              const queueHasPendingState = queue.some((prompt) => String(prompt?.chatId || '').trim() === chatId);
              const sessionHasPendingState = sessionsRef.current.some((session) => (
                String(session?.id || '').trim() === chatId
                && session?.hasPendingHitlPrompt === true
              ));
              if (queueHadPendingState || queueHasPendingState || sessionHasPendingState) {
                refreshChatIds.add(chatId);
              }
            }

            return queue;
          });
          for (const chatId of refreshChatIds) {
            refreshSessionsRef.current(loadedWorldId, chatId).catch(() => { });
          }
        }, 0);
      }
    });

    api.subscribeChatEvents(loadedWorldId, '', subscriptionId).catch(() => { });
    rendererLogger.debug('electron.renderer.subscription', 'All-chat HITL subscription request dispatched', {
      worldId: loadedWorldId,
      subscriptionId
    });

    return () => {
      rendererLogger.debug('electron.renderer.subscription', 'All-chat HITL subscription teardown started', {
        worldId: loadedWorldId,
        subscriptionId
      });
      removeListener();
      api.unsubscribeChatEvents(subscriptionId).catch(() => { });
      if (globalPendingHitlFlushTimerRef.current !== null) {
        clearTimeout(globalPendingHitlFlushTimerRef.current);
        globalPendingHitlFlushTimerRef.current = null;
      }
      globalPendingHitlEventsRef.current = [];
    };
  }, [
    api,
    chatSubscriptionCounter,
    loadedWorldId,
  ]);
}
