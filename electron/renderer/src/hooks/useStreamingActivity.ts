/**
 * useStreamingActivity Hook
 * Purpose:
 * - Manage renderer streaming runtime state and lifecycle wiring.
 *
 * Key Features:
 * - Owns streaming ref used by chat subscriptions.
 * - Initializes stream manager with message/tool-stream callbacks.
 * - Exposes reset helper for world/session lifecycle cleanup.
 *
 * Implementation Notes:
 * - Preserves prior App.jsx behavior for message upserts and tool-stream updates.
 * - Keeps manager setup/teardown centralized in one hook.
 *
 * Recent Changes:
 * - 2026-03-13: Preserved assistant `reasoningContent` on live rows so reasoning-only chunks can render before final answer text arrives.
 * - 2026-03-10: Preserve assistant streaming `chatId` on live rows so selected-chat refresh
 *   reconciliation retains in-progress stream content instead of dropping it until the final message lands.
 * - 2026-02-26: Added stream-error fallback message creation and redundant error-log cleanup so errors render inline without duplicate log rows.
 * - 2026-02-24: Removed activityStateRef entirely — activity-state.ts deleted
 *   as part of working-status simplification (all callbacks were no-ops).
 * - 2026-02-22: Removed isBusy, elapsedMs, activeTools, activeStreamCount, sessionActivity
 *   states and their callbacks as part of status-registry migration (Phase 1).
 * - 2026-02-21: Propagated tool-stream command metadata into renderer messages so shell tool cards can display `Running command: <name>`.
 * - 2026-02-21: Propagated tool-stream `toolName` into renderer messages so tool-running headers can resolve specific tool labels.
 * - 2026-02-20: Restored web-aligned assistant placeholder lifecycle (start placeholder, chunk updates, end removes placeholder).
 * - 2026-02-19: Prevented empty assistant cards by creating stream messages on first chunk instead of stream start.
 * - 2026-02-17: Extracted streaming/activity lifecycle from `App.jsx` during Phase 3.
 */

import { useCallback, useEffect, useRef } from 'react';
import { createStreamingState } from '../streaming-state';
import { removeRedundantErrorLogMessages, upsertMessageList } from '../domain/message-updates';

export function useStreamingActivity({ setMessages }) {
  const streamingStateRef = useRef(null);

  useEffect(() => {
    streamingStateRef.current = createStreamingState({
      onStreamStart: () => {
        // No-op: the message card is created on the first chunk (onStreamUpdate)
        // so no empty placeholder appears while waiting for content.
      },
      onStreamUpdate: (entry) => {
        setMessages((existing) => {
          const messageId = String(entry.messageId || '');
          const index = existing.findIndex((message) => String(message.messageId || '') === messageId);
          if (index < 0) {
            return upsertMessageList(existing, {
              id: messageId,
              messageId,
              role: 'assistant',
              sender: entry.agentName,
              chatId: entry.chatId || null,
              content: entry.content,
              reasoningContent: entry.reasoningContent,
              createdAt: entry.createdAt,
              isStreaming: true
            });
          }
          const next = [...existing];
          next[index] = {
            ...next[index],
            sender: entry.agentName,
            chatId: next[index]?.chatId || entry.chatId || null,
            content: entry.content,
            reasoningContent: entry.reasoningContent,
            isStreaming: true
          };
          return next;
        });
      },
      onStreamEnd: (messageId) => {
        setMessages((existing) => {
          const normalizedId = String(messageId || '');
          return existing.filter((message) => {
            const sameMessageId = String(message.messageId || '') === normalizedId;
            return !(sameMessageId && message.isStreaming === true);
          });
        });
      },
      onStreamError: (messageId, errorMessage) => {
        setMessages((existing) => {
          const index = existing.findIndex((message) => String(message.messageId || '') === String(messageId));
          if (index < 0) {
            const fallbackMessageId = String(messageId || `stream-error-${Date.now()}`);
            const nextWithFallback = upsertMessageList(existing, {
              id: fallbackMessageId,
              messageId: fallbackMessageId,
              role: 'system',
              sender: 'system',
              content: '',
              createdAt: new Date().toISOString(),
              type: 'error',
              isStreaming: false,
              hasError: true,
              errorMessage,
            });
            return removeRedundantErrorLogMessages(nextWithFallback, errorMessage);
          }
          const next = [...existing];
          next[index] = { ...next[index], isStreaming: false, hasError: true, errorMessage };
          return removeRedundantErrorLogMessages(next, errorMessage);
        });
      },
      onToolStreamStart: (entry) => {
        setMessages((existing) => upsertMessageList(existing, {
          id: entry.messageId,
          messageId: entry.messageId,
          role: 'tool',
          sender: entry.agentName || 'shell_cmd',
          toolName: entry.toolName || entry.agentName || 'shell_cmd',
          command: entry.command || '',
          content: '',
          createdAt: entry.createdAt,
          isToolStreaming: true,
          streamType: entry.streamType
        }));
      },
      onToolStreamUpdate: (messageId, content, streamType, toolName, command) => {
        setMessages((existing) => {
          const index = existing.findIndex((message) => String(message.messageId || '') === String(messageId));
          if (index < 0) return existing;
          const next = [...existing];
          next[index] = {
            ...next[index],
            content,
            streamType,
            ...(toolName ? { toolName } : {}),
            ...(command ? { command } : {})
          };
          return next;
        });
      },
      onToolStreamEnd: (messageId) => {
        setMessages((existing) => {
          const index = existing.findIndex((message) => String(message.messageId || '') === String(messageId));
          if (index < 0) return existing;
          const next = [...existing];
          next[index] = { ...next[index], isToolStreaming: false, streamType: undefined };
          return next;
        });
      }
    });

    return () => {
      if (streamingStateRef.current) {
        streamingStateRef.current.cleanup();
      }
    };
  }, [setMessages]);

  const resetActivityRuntimeState = useCallback(() => {
    // streaming ref is cleaned up by the subscription effect on chat switch
  }, []);

  return {
    streamingStateRef,
    resetActivityRuntimeState,
  };
}
