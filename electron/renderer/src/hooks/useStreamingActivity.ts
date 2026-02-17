/**
 * useStreamingActivity Hook
 * Purpose:
 * - Manage renderer streaming/activity runtime state and lifecycle wiring.
 *
 * Key Features:
 * - Owns streaming refs and activity refs used by chat subscriptions.
 * - Initializes stream/activity managers with message/tool/busy callbacks.
 * - Exposes state and reset helper for world/session lifecycle cleanup.
 *
 * Implementation Notes:
 * - Preserves prior App.jsx behavior for message upserts and tool-stream updates.
 * - Keeps manager setup/teardown centralized in one hook.
 *
 * Recent Changes:
 * - 2026-02-17: Extracted streaming/activity lifecycle from `App.jsx` during Phase 3.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createStreamingState } from '../streaming-state';
import { createActivityState } from '../activity-state';
import { upsertMessageList } from '../domain/message-updates';

function createIdleSessionActivity() {
  return {
    eventType: 'idle',
    pendingOperations: 0,
    activityId: 0,
    source: null,
    activeSources: []
  };
}

export function useStreamingActivity({ setMessages }) {
  const streamingStateRef = useRef(null);
  const activityStateRef = useRef(null);

  const [isBusy, setIsBusy] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [activeTools, setActiveTools] = useState([]);
  const [activeStreamCount, setActiveStreamCount] = useState(0);
  const [sessionActivity, setSessionActivity] = useState(createIdleSessionActivity);

  useEffect(() => {
    streamingStateRef.current = createStreamingState({
      onStreamStart: (entry) => {
        setMessages((existing) => upsertMessageList(existing, {
          id: entry.messageId,
          messageId: entry.messageId,
          role: 'assistant',
          sender: entry.agentName,
          content: '',
          createdAt: entry.createdAt,
          isStreaming: true
        }));
      },
      onStreamUpdate: (messageId, content) => {
        setMessages((existing) => {
          const index = existing.findIndex((message) => String(message.messageId || '') === String(messageId));
          if (index < 0) return existing;
          const next = [...existing];
          next[index] = { ...next[index], content };
          return next;
        });
      },
      onStreamEnd: (messageId) => {
        setMessages((existing) => {
          const index = existing.findIndex((message) => String(message.messageId || '') === String(messageId));
          if (index < 0) return existing;
          const next = [...existing];
          next[index] = { ...next[index], isStreaming: false };
          return next;
        });
      },
      onStreamError: (messageId, errorMessage) => {
        setMessages((existing) => {
          const index = existing.findIndex((message) => String(message.messageId || '') === String(messageId));
          if (index < 0) return existing;
          const next = [...existing];
          next[index] = { ...next[index], isStreaming: false, hasError: true, errorMessage };
          return next;
        });
      },
      onToolStreamStart: (entry) => {
        setMessages((existing) => upsertMessageList(existing, {
          id: entry.messageId,
          messageId: entry.messageId,
          role: 'tool',
          sender: entry.agentName || 'shell_cmd',
          content: '',
          createdAt: entry.createdAt,
          isToolStreaming: true,
          streamType: entry.streamType
        }));
      },
      onToolStreamUpdate: (messageId, content, streamType) => {
        setMessages((existing) => {
          const index = existing.findIndex((message) => String(message.messageId || '') === String(messageId));
          if (index < 0) return existing;
          const next = [...existing];
          next[index] = { ...next[index], content, streamType };
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

  useEffect(() => {
    activityStateRef.current = createActivityState({
      onToolStart: (entry) => {
        setActiveTools((tools) => [...tools, entry]);
      },
      onToolResult: (toolUseId) => {
        setActiveTools((tools) => tools.filter((tool) => tool.toolUseId !== toolUseId));
      },
      onToolError: (toolUseId) => {
        setActiveTools((tools) => tools.filter((tool) => tool.toolUseId !== toolUseId));
      },
      onToolProgress: (toolUseId, progress) => {
        setActiveTools((tools) => tools.map((tool) =>
          tool.toolUseId === toolUseId ? { ...tool, progress } : tool
        ));
      },
      onElapsedUpdate: (ms) => {
        setElapsedMs(ms);
      },
      onBusyChange: (busy) => {
        setIsBusy(busy);
      }
    });

    return () => {
      if (activityStateRef.current) {
        activityStateRef.current.cleanup();
      }
    };
  }, []);

  const resetActivityRuntimeState = useCallback(() => {
    setActiveStreamCount(0);
    setActiveTools([]);
    setIsBusy(false);
    setSessionActivity(createIdleSessionActivity());
  }, []);

  return {
    streamingStateRef,
    activityStateRef,
    isBusy,
    setIsBusy,
    elapsedMs,
    activeTools,
    setActiveTools,
    activeStreamCount,
    setActiveStreamCount,
    sessionActivity,
    setSessionActivity,
    resetActivityRuntimeState,
  };
}
