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
 * - 2026-02-21: Extended tool-stream callback typing with optional command metadata for shell command labeling.
 * - 2026-02-21: Updated realtime stream typing to include optional tool name in tool-stream callbacks.
 * - 2026-02-20: Enforced options-only HITL parsing and queue ingestion.
 * - 2026-02-19: Extended activity-state typing with optional elapsed reset hook used by activity event transitions.
 * - 2026-02-17: Extracted from App.tsx during CC pass.
 */

import { Dispatch, MutableRefObject, SetStateAction, useEffect } from 'react';
import {
  createChatSubscriptionEventHandler,
  createGlobalLogEventHandler,
} from '../domain/chat-event-handlers';
import { safeMessage } from '../domain/desktop-api';
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

type ActivityState = {
  setActiveStreamCount: (count: number) => void;
  handleToolStart: (toolUseId: string, toolName: string, toolInput?: Record<string, unknown>) => void;
  handleToolResult: (toolUseId: string, result: string) => void;
  handleToolError: (toolUseId: string, error: string) => void;
  handleToolProgress: (toolUseId: string, progress: string) => void;
  resetElapsed?: () => void;
  cleanup: () => void;
};

type UseChatEventSubscriptionsArgs = {
  api: DesktopApi;
  loadedWorld: { id?: string } | null;
  selectedSessionId: string | null;
  setMessages: Dispatch<SetStateAction<MessageLike[]>>;
  chatSubscriptionCounter: MutableRefObject<number>;
  streamingStateRef: MutableRefObject<RealtimeState | null>;
  activityStateRef: MutableRefObject<ActivityState | null>;
  setActiveStreamCount: Dispatch<SetStateAction<number>>;
  setPendingResponseSessionIds: Dispatch<SetStateAction<Set<string>>>;
  setSessionActivity: Dispatch<SetStateAction<{
    eventType: string;
    pendingOperations: number;
    activityId: number;
    source: string | null;
    activeSources: string[];
  }>>;
  refreshSessions: (worldId: string, preferredSessionId?: string | null) => Promise<void>;
  setStatusText: (text: string, kind?: string) => void;
  resetActivityRuntimeState: () => void;
  setHitlPromptQueue: Dispatch<SetStateAction<HitlPrompt[]>>;
};

export function useChatEventSubscriptions({
  api,
  loadedWorld,
  selectedSessionId,
  setMessages,
  chatSubscriptionCounter,
  streamingStateRef,
  activityStateRef,
  setActiveStreamCount,
  setPendingResponseSessionIds,
  setSessionActivity,
  refreshSessions,
  setStatusText,
  resetActivityRuntimeState,
  setHitlPromptQueue,
}: UseChatEventSubscriptionsArgs) {
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

  useEffect(() => {
    if (!loadedWorld?.id || !selectedSessionId) {
      return undefined;
    }

    const subscriptionId = `chat-${Date.now()}-${chatSubscriptionCounter.current++}`;
    let disposed = false;
    const removeListener = api.onChatEvent(createChatSubscriptionEventHandler({
      subscriptionId,
      loadedWorldId: loadedWorld.id,
      selectedSessionId,
      streamingStateRef,
      activityStateRef,
      setMessages,
      setActiveStreamCount,
      onSessionResponseStateChange: (chatId, isActive) => {
        if (!chatId) return;
        setPendingResponseSessionIds((existing: Set<string>) => {
          const next = new Set(existing);
          if (isActive) {
            next.add(chatId);
          } else {
            next.delete(chatId);
          }
          return next;
        });
      },
      onSessionActivityUpdate: (activity) => {
        setSessionActivity(activity);
      },
      onSessionSystemEvent: (systemEvent) => {
        if (!loadedWorld?.id) return;
        const eventType = String(systemEvent?.eventType || '').trim();
        if (eventType === 'chat-title-updated') {
          const targetChatId = String(systemEvent?.chatId || selectedSessionId || '').trim() || null;
          refreshSessions(loadedWorld.id, targetChatId).catch(() => { });
          return;
        }
        if (eventType !== 'hitl-option-request') {
          return;
        }

        const content = systemEvent?.content && typeof systemEvent.content === 'object'
          ? (systemEvent.content as Record<string, unknown>)
          : null;
        const requestId = String(content?.requestId || '').trim();
        if (!requestId) {
          return;
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
          return;
        }

        setHitlPromptQueue((existing) => {
          if (existing.some((entry) => entry.requestId === requestId)) {
            return existing;
          }
          const metadata = content?.metadata && typeof content.metadata === 'object'
            ? (content.metadata as Record<string, unknown>)
            : null;
          return [
            ...existing,
            {
              requestId,
              chatId: systemEvent?.chatId || selectedSessionId || null,
              title: String(content?.title || 'Approval required').trim() || 'Approval required',
              message: String(content?.message || '').trim(),
              mode: 'option',
              options,
              ...(typeof content?.defaultOptionId === 'string' ? { defaultOptionId: String(content.defaultOptionId) } : {}),
              metadata: {
                refreshAfterDismiss: metadata?.refreshAfterDismiss === true,
                kind: typeof metadata?.kind === 'string' ? metadata.kind : undefined,
              },
            }
          ];
        });
      }
    }));

    api.subscribeChatEvents(loadedWorld.id, selectedSessionId, subscriptionId).catch((error: unknown) => {
      if (!disposed) {
        setStatusText(safeMessage(error, 'Failed to subscribe to chat updates.'), 'error');
      }
    });

    return () => {
      disposed = true;
      removeListener();
      api.unsubscribeChatEvents(subscriptionId).catch(() => { });
      if (streamingStateRef.current) {
        streamingStateRef.current.cleanup();
      }
      if (activityStateRef.current) {
        activityStateRef.current.cleanup();
      }
      resetActivityRuntimeState();
    };
  }, [
    activityStateRef,
    api,
    chatSubscriptionCounter,
    loadedWorld,
    refreshSessions,
    resetActivityRuntimeState,
    selectedSessionId,
    setActiveStreamCount,
    setHitlPromptQueue,
    setMessages,
    setPendingResponseSessionIds,
    setSessionActivity,
    setStatusText,
    streamingStateRef,
  ]);
}
