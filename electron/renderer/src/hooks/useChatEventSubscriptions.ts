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
} from '../domain/chat-event-handlers';
import type { DesktopApi } from '../types/desktop-api';
import type { MessageLike } from '../domain/message-updates';

type HitlOption = {
  id: string;
  label: string;
  description?: string;
};

type HitlPrompt = {
  requestId: string;
  chatId: string | null;
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
  handleStart: (messageId: string, agentName: string) => void;
  handleChunk: (messageId: string, content: string) => void;
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
  setMessages: Dispatch<SetStateAction<MessageLike[]>>;
  chatSubscriptionCounter: MutableRefObject<number>;
  streamingStateRef: MutableRefObject<RealtimeState | null>;
  refreshSessions: (worldId: string, preferredSessionId?: string | null) => Promise<void>;
  resetActivityRuntimeState: () => void;
  setHitlPromptQueue: Dispatch<SetStateAction<HitlPrompt[]>>;
};

type SessionSystemEventPayload = {
  eventType?: string | null;
  chatId?: string | null;
  content?: unknown;
};

export function enqueueHitlPromptFromToolEvent(
  existing: HitlPrompt[],
  payload: any,
  fallbackChatId: string | null
): HitlPrompt[] {
  const toolPayload = payload?.tool && typeof payload.tool === 'object'
    ? (payload.tool as Record<string, unknown>)
    : null;
  const eventType = String(toolPayload?.eventType || '').trim().toLowerCase();
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

  return [
    ...existing,
    {
      requestId,
      chatId: String(content?.chatId || payload?.chatId || fallbackChatId || '').trim() || null,
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

export function useChatEventSubscriptions({
  api,
  loadedWorld,
  selectedSessionId,
  setMessages,
  chatSubscriptionCounter,
  streamingStateRef,
  refreshSessions,
  resetActivityRuntimeState,
  setHitlPromptQueue,
}: UseChatEventSubscriptionsArgs) {
  const pendingHitlEventsRef = useRef<Array<{ payload: any; fallbackChatId: string | null }>>([]);
  const pendingHitlFlushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const removeListener = api.onChatEvent(createGlobalLogEventHandler({
      loadedWorldId: loadedWorld?.id,
      selectedSessionId,
      setMessages
    }));

    return () => {
      removeListener();
    };
  }, [api, loadedWorld?.id, selectedSessionId, setMessages]);

  const loadedWorldId = loadedWorld?.id;

  useEffect(() => {
    if (!loadedWorldId || !selectedSessionId) {
      return undefined;
    }

    const subscriptionId = `chat-${Date.now()}-${chatSubscriptionCounter.current++}`;
    const chatEventHandler = createChatSubscriptionEventHandler({
      subscriptionId,
      loadedWorldId,
      selectedSessionId,
      streamingStateRef,
      setMessages,
      onSessionSystemEvent: (systemEvent) => {
        if (!loadedWorldId) return;
        const eventType = String(systemEvent?.eventType || '').trim();
        if (eventType === 'chat-title-updated') {
          const targetChatId = String(systemEvent?.chatId || selectedSessionId || '').trim() || null;
          refreshSessions(loadedWorldId, targetChatId).catch(() => { });
          return;
        }
      }
    });

    const removeListener = api.onChatEvent((payload: any) => {
      chatEventHandler(payload);

      if (payload?.subscriptionId && payload.subscriptionId !== subscriptionId) {
        return;
      }
      if (payload?.worldId && payload.worldId !== loadedWorldId) {
        return;
      }

      pendingHitlEventsRef.current.push({ payload, fallbackChatId: selectedSessionId });
      if (pendingHitlFlushTimerRef.current === null) {
        pendingHitlFlushTimerRef.current = window.setTimeout(() => {
          const batch = pendingHitlEventsRef.current.splice(0);
          pendingHitlFlushTimerRef.current = null;
          if (batch.length === 0) return;
          setHitlPromptQueue((existing) => {
            let queue = existing;
            for (const entry of batch) {
              queue = enqueueHitlPromptFromToolEvent(queue, entry.payload, entry.fallbackChatId);
            }
            return queue;
          });
        }, 0);
      }
    });

    api.subscribeChatEvents(loadedWorldId, selectedSessionId, subscriptionId).catch(() => { });

    return () => {
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
      resetActivityRuntimeState();
    };
  }, [
    api,
    chatSubscriptionCounter,
    loadedWorldId,
    refreshSessions,
    resetActivityRuntimeState,
    selectedSessionId,
    setHitlPromptQueue,
    setMessages,
    streamingStateRef,
  ]);
}
