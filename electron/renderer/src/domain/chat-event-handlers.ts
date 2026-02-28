/**
 * Renderer Chat Event Handlers
 * Purpose:
 * - Encapsulate chat/log realtime event routing logic used by App effects.
 *
 * Features:
 * - Global log event handler for right-panel diagnostics stream updates
 * - Session-scoped realtime handler for message/sse/tool events
 * - Stream synchronization helpers
 *
 * Implementation Notes:
 * - Handlers are generated from dependency injection for testability.
 * - Session filtering relies on canonical payload `worldId` and `chatId`.
 *
 * Recent Changes:
 * - 2026-02-27: Stopped injecting realtime `type='log'` events into chat message timelines; logs are routed to the dedicated logs panel stream only.
 * - 2026-02-27: Added unified main-process log callback support so logs are available in the right-panel diagnostics view even when no chat is selected.
 * - 2026-02-26: Suppressed redundant error-level log rows when equivalent stream errors are already shown inline on message cards.
 * - 2026-02-24: Removed ActivityRefs/activityStateRef and syncActiveStreamCount —
 *   activity-state.ts deleted as part of working-status simplification.
 * - 2026-02-22: Added activity event handler (response-end/idle) as authoritative
 *   "all done" signal to clear stale streaming state and reset working indicator.
 * - 2026-02-21: Backfilled tool-stream row metadata on late `tool-start` events so shell cards still resolve command/tool labels even when stream chunks arrive first.
 * - 2026-02-21: Derived shell command labels for tool-stream rows from `tool-start` input (`toolUseId -> command`) and forwarded command metadata into streaming state.
 * - 2026-02-21: Forwarded SSE `toolName` into tool-stream state so tool streaming cards can render tool-specific running labels.
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

import { upsertMessageList, type MessageLike } from './message-updates';
import { clearChatAgents, updateRegistry } from './status-registry';
import { applyEventToRegistry } from './status-updater';

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
    handleToolStreamStart: (messageId: string, agentName: string, streamType: 'stdout' | 'stderr', toolName?: string, command?: string) => void;
    handleToolStreamChunk: (messageId: string, content: string, streamType: 'stdout' | 'stderr', toolName?: string, command?: string) => void;
    handleToolStreamEnd: (messageId: string) => void;
    isActive: (messageId: string) => boolean;
    cleanup: () => void;
  } | null;
}

interface ChatHandlerOptions {
  subscriptionId: string;
  loadedWorldId: string | null | undefined;
  selectedSessionId: string | null | undefined;
  streamingStateRef: RealtimeRefs;
  setMessages: (updater: (existing: MessageLike[]) => MessageLike[]) => void;
  onSessionSystemEvent?: (event: {
    eventType: string;
    chatId: string | null;
    messageId: string | null;
    createdAt: string | null;
    content: unknown;
  }) => void;
}

export interface MainProcessLogEntry {
  process: 'main';
  level: string;
  category: string;
  message: string;
  timestamp: string;
  data?: unknown;
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


export function createGlobalLogEventHandler({
  onMainLogEvent,
}: {
  onMainLogEvent?: (entry: MainProcessLogEntry) => void;
}) {
  return (payload: BasePayload & { logEvent?: Record<string, unknown> }) => {
    if (!payload || payload.type !== 'log') return;

    const logEvent = payload.logEvent;
    if (!logEvent) return;
    if (typeof onMainLogEvent === 'function') {
      onMainLogEvent({
        process: 'main',
        level: String(logEvent.level || '').trim().toLowerCase() || 'info',
        category: String(logEvent.category || '').trim() || 'main',
        message: String(logEvent.message || '').trim() || '(empty log message)',
        timestamp: String(logEvent.timestamp || '').trim() || new Date().toISOString(),
        ...(logEvent.data !== undefined ? { data: logEvent.data } : {}),
      });
    }
  };
}

export function createChatSubscriptionEventHandler({
  subscriptionId,
  loadedWorldId,
  selectedSessionId,
  streamingStateRef,
  setMessages,
  onSessionSystemEvent,
}: ChatHandlerOptions) {
  const toolCommandByUseId = new Map<string, string>();

  const ensureToolStreamMessageChatId = (messageId: string, chatId: string | null) => {
    const normalizedMessageId = String(messageId || '').trim();
    const normalizedChatId = String(chatId || '').trim();
    if (!normalizedMessageId || !normalizedChatId) return;

    setMessages((existing) => {
      const index = existing.findIndex(
        (message) => String(message?.messageId || '').trim() === normalizedMessageId
      );
      if (index < 0) return existing;

      const currentChatId = String(existing[index]?.chatId || '').trim();
      if (currentChatId === normalizedChatId) return existing;

      const next = [...existing];
      next[index] = {
        ...next[index],
        chatId: normalizedChatId,
      };
      return next;
    });
  };

  const endAllToolStreams = () => {
    const streaming = streamingStateRef.current;
    if (!streaming) return;
    streaming.endAllToolStreams();
  };

  const endResponseStreamByMessage = (incomingMessage: Record<string, unknown>) => {
    const streaming = streamingStateRef.current;
    if (!streaming) return;
    if (typeof streaming.isActive !== 'function' || typeof streaming.handleEnd !== 'function') return;

    const candidateIds = [
      String(incomingMessage.messageId || '').trim(),
      String(incomingMessage.id || '').trim(),
    ].filter(Boolean);

    for (const candidateId of candidateIds) {
      if (!streaming.isActive(candidateId)) continue;
      streaming.handleEnd(candidateId);
      break;
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
        if (!incomingChatId && isAssistantLikeMessage(incomingMessage)) {
          endResponseStreamByMessage(incomingMessage);
          endAllToolStreams();
        }
        return;
      }

      // End streaming state BEFORE upserting the final message so that
      // onStreamUpdate (re-sets isStreaming:true) + onStreamEnd (removes isStreaming:true
      // entries) fire first, then the upsert adds the message with isStreaming:false.
      if (isAssistantLikeMessage(incomingMessage)) {
        endResponseStreamByMessage(incomingMessage);
        endAllToolStreams();
      }

      setMessages((existing) => upsertMessageList(existing, {
        ...incomingMessage,
        isStreaming: false,
        isToolStreaming: false,
        streamType: undefined,
      }));

      return;
    }

    if (payload.type === 'sse') {
      const streamPayload = payload.sse as Record<string, unknown> | undefined;
      if (!streamPayload) return;

      const streamChatId = String(streamPayload.chatId || payload.chatId || '').trim() || null;
      if (selectedSessionId && streamChatId && streamChatId !== selectedSessionId) return;

      const eventType = String(streamPayload.eventType || '').toLowerCase();
      const messageId = streamPayload.messageId ? String(streamPayload.messageId) : '';
      const streaming = streamingStateRef.current;
      if (!streaming) return;
      const toolName = String(streamPayload.toolName || '').trim() || 'shell_cmd';
      const isShellStdoutSSE = (
        toolName === 'shell_cmd'
        && messageId.endsWith('-stdout')
        && (eventType === 'start' || eventType === 'chunk' || eventType === 'end')
      );
      const shellStdoutToolUseId = isShellStdoutSSE
        ? messageId.slice(0, -'-stdout'.length)
        : '';
      const shellCommand = toolCommandByUseId.get(shellStdoutToolUseId || messageId);

      const sseAgentName = String(streamPayload.agentName || '').trim() || null;
      const sseChatId = streamChatId || selectedSessionId || null;

      if (!messageId) {
        if (eventType === 'end' || eventType === 'error') {
          endAllToolStreams();
          if (sseAgentName && loadedWorldId && sseChatId) {
            updateRegistry((r) => applyEventToRegistry(r, loadedWorldId, sseChatId, sseAgentName, 'sse', eventType));
          }
        }
        return;
      }

      if (eventType === 'start') {
        if (isShellStdoutSSE) {
          streaming.handleToolStreamStart(
            messageId,
            String(streamPayload.agentName || 'shell_cmd'),
            'stdout',
            'shell_cmd',
            shellCommand,
          );
          ensureToolStreamMessageChatId(messageId, sseChatId);
        } else {
          endAllToolStreams();
          streaming.handleStart(messageId, String(streamPayload.agentName || 'assistant'));
        }
        if (sseAgentName && loadedWorldId && sseChatId) {
          updateRegistry((r) => applyEventToRegistry(r, loadedWorldId, sseChatId, sseAgentName, 'sse', 'start'));
        }
      } else if (eventType === 'chunk') {
        if (isShellStdoutSSE) {
          const content = String(streamPayload.content || '');
          if (!streaming.isActive(messageId)) {
            streaming.handleToolStreamStart(
              messageId,
              String(streamPayload.agentName || 'shell_cmd'),
              'stdout',
              'shell_cmd',
              shellCommand,
            );
            ensureToolStreamMessageChatId(messageId, sseChatId);
          }
          streaming.handleToolStreamChunk(messageId, content, 'stdout', 'shell_cmd', shellCommand);
          ensureToolStreamMessageChatId(messageId, sseChatId);
        } else {
          streaming.handleChunk(messageId, String(streamPayload.content || ''));
        }
      } else if (eventType === 'end') {
        if (isShellStdoutSSE) {
          streaming.handleToolStreamEnd(messageId);
        } else {
          streaming.handleEnd(messageId);
        }
        if (sseAgentName && loadedWorldId && sseChatId) {
          updateRegistry((r) => applyEventToRegistry(r, loadedWorldId, sseChatId, sseAgentName, 'sse', 'end'));
        }
      } else if (eventType === 'error') {
        streaming.handleError(messageId, String(streamPayload.error || 'Stream error'));
        if (sseAgentName && loadedWorldId && sseChatId) {
          updateRegistry((r) => applyEventToRegistry(r, loadedWorldId, sseChatId, sseAgentName, 'sse', 'error'));
        }
      } else if (eventType === 'tool-stream') {
        const content = String(streamPayload.content || '');
        const stream = String(streamPayload.stream || 'stdout') === 'stderr' ? 'stderr' : 'stdout';
        const toolName = String(streamPayload.toolName || 'shell_cmd').trim() || 'shell_cmd';
        const command = toolCommandByUseId.get(messageId);
        if (!streaming.isActive(messageId)) {
          streaming.handleToolStreamStart(
            messageId,
            String(streamPayload.agentName || 'shell_cmd'),
            stream,
            toolName,
            command,
          );
          ensureToolStreamMessageChatId(messageId, sseChatId);
        }
        streaming.handleToolStreamChunk(messageId, content, stream, toolName, command);
        ensureToolStreamMessageChatId(messageId, sseChatId);
      }
      return;
    }

    if (payload.type === 'tool') {
      const toolPayload = payload.tool as Record<string, unknown> | undefined;
      if (!toolPayload) return;
      const toolChatId = String(payload.chatId || toolPayload.chatId || '').trim() || null;
      if (selectedSessionId && toolChatId && toolChatId !== selectedSessionId) return;

      const toolEventType = String(toolPayload.eventType || '').toLowerCase();
      const toolUseId = String(toolPayload.toolUseId || '').trim();
      if (!toolUseId) return;

      const toolAgentName = String(toolPayload.agentName || toolPayload.agentId || '').trim() || null;
      const toolChatIdResolved = toolChatId || selectedSessionId || null;

      if (toolEventType === 'tool-start') {
        const toolName = String(toolPayload.toolName || 'unknown');
        const toolInput = (toolPayload.toolInput as Record<string, unknown> | undefined) || undefined;
        const command = typeof toolInput?.command === 'string' ? toolInput.command.trim() : '';
        if (command) {
          toolCommandByUseId.set(toolUseId, command);

          // Stream chunks can occasionally arrive before tool-start metadata.
          // Backfill command/tool label onto an already-created tool stream row.
          setMessages((existing) => {
            const index = existing.findIndex(
              (message) => String(message?.messageId || '').trim() === toolUseId
            );
            if (index < 0) return existing;
            const next = [...existing];
            next[index] = {
              ...next[index],
              ...(toolName ? { toolName } : {}),
              command
            };
            return next;
          });
        }
        if (toolAgentName && loadedWorldId && toolChatIdResolved) {
          updateRegistry((r) => applyEventToRegistry(r, loadedWorldId, toolChatIdResolved, toolAgentName, 'tool', 'tool-start'));
        }
      } else if (toolEventType === 'tool-result') {
        const toolName = String(toolPayload.toolName || 'unknown').trim() || 'unknown';
        const content = toToolContent(toolPayload.result);
        setMessages((existing) => upsertMessageList(existing, {
          id: toolUseId,
          messageId: toolUseId,
          role: 'tool',
          sender: String(toolPayload.agentName || toolPayload.agentId || toolName || 'tool').trim() || 'tool',
          toolName,
          content,
          chatId: toolChatIdResolved,
          createdAt: String(toolPayload.createdAt || new Date().toISOString()),
          isToolStreaming: false,
          streamType: undefined,
        }));
        toolCommandByUseId.delete(toolUseId);
        const streaming = streamingStateRef.current;
        if (streaming?.isActive(toolUseId)) {
          streaming.handleToolStreamEnd(toolUseId);
        }
        endAllToolStreams();
        if (toolAgentName && loadedWorldId && toolChatIdResolved) {
          updateRegistry((r) => applyEventToRegistry(r, loadedWorldId, toolChatIdResolved, toolAgentName, 'tool', 'tool-result'));
        }
      } else if (toolEventType === 'tool-error') {
        const toolName = String(toolPayload.toolName || 'unknown').trim() || 'unknown';
        const content = toToolContent(toolPayload.error || 'Tool execution failed');
        setMessages((existing) => upsertMessageList(existing, {
          id: toolUseId,
          messageId: toolUseId,
          role: 'tool',
          sender: String(toolPayload.agentName || toolPayload.agentId || toolName || 'tool').trim() || 'tool',
          toolName,
          content,
          chatId: toolChatIdResolved,
          createdAt: String(toolPayload.createdAt || new Date().toISOString()),
          isToolStreaming: false,
          streamType: 'stderr',
        }));
        toolCommandByUseId.delete(toolUseId);
        const streaming = streamingStateRef.current;
        if (streaming?.isActive(toolUseId)) {
          streaming.handleToolStreamEnd(toolUseId);
        }
        endAllToolStreams();
        if (toolAgentName && loadedWorldId && toolChatIdResolved) {
          updateRegistry((r) => applyEventToRegistry(r, loadedWorldId, toolChatIdResolved, toolAgentName, 'tool', 'tool-error'));
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

    // Activity events drive the working indicator, mirroring the web app's
    // pendingOperations-based approach:
    // - response-start with pending > 0 → set agents to working
    // - response-end with pending === 0 / idle → clear agents (all done)
    if (payload.type === 'activity') {
      const activityPayload = payload.activity as Record<string, unknown> | undefined;
      if (!activityPayload) return;

      const activityChatId = String(payload.chatId || activityPayload.chatId || '').trim() || null;
      // Allow unscoped (no chatId) activity events through; only filter explicit mismatches.
      if (selectedSessionId && activityChatId && activityChatId !== selectedSessionId) return;

      const activityEventType = String(activityPayload.eventType || '').toLowerCase();
      const pendingOps = Number(activityPayload.pendingOperations ?? -1);
      const isAllDone = (activityEventType === 'response-end' && pendingOps === 0)
        || activityEventType === 'idle';
      const isResponseStart = activityEventType === 'response-start' && pendingOps > 0;

      if (isResponseStart) {
        // Agent(s) started working — set registry to working so the indicator shows.
        // Use activeSources (agent names) or fall back to source (single agent name).
        if (!loadedWorldId) return;
        const targetChatId = activityChatId || selectedSessionId || null;
        if (!targetChatId) return;

        const activeSources = Array.isArray(activityPayload.activeSources)
          ? (activityPayload.activeSources as unknown[])
            .map((s) => String(s || '').trim())
            .filter(Boolean)
          : [];
        const source = String(activityPayload.source || '').trim();
        const agentNames = activeSources.length > 0 ? activeSources : source ? [source] : [];

        if (agentNames.length > 0) {
          updateRegistry((r) => {
            let reg = r;
            for (const name of agentNames) {
              reg = applyEventToRegistry(reg, loadedWorldId, targetChatId, name, 'sse', 'start');
            }
            return reg;
          });
        }
        return;
      }

      if (!isAllDone) return;

      // Flush and clear all active streams without firing per-stream callbacks that
      // might re-tag a just-upserted final message as streaming.
      const streaming = streamingStateRef.current;
      if (streaming) {
        streaming.cleanup();
      }

      // Remove any remaining streaming placeholders left by the cleanup above.
      setMessages((existing) => existing.filter(
        (msg) => msg.isStreaming !== true && msg.isToolStreaming !== true
      ));

      // Reset registry so the working indicator clears.
      if (loadedWorldId) {
        const targetChatId = activityChatId || selectedSessionId || null;
        if (targetChatId) {
          updateRegistry((r) => clearChatAgents(r, loadedWorldId, targetChatId));
        }
      }
    }
  };
}
