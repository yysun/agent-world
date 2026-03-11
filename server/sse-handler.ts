/**
 * SSE Event Handler - Reusable Server-Sent Events Logic
 *
 * Purpose: Centralized SSE streaming logic for world events
 *
 * Features:
 * - Sets up SSE response headers and connection
 * - Wires world event listeners (MESSAGE, SSE, SYSTEM, WORLD)
 * - Handles world activity state tracking (response-start, idle)
 * - Forwards tool events (tool-start, tool-result, tool-error, tool-progress) as SSE events
 * - Automatic stream completion when world becomes idle
 * - Timeout fallback (60s) if world never becomes idle
 * - Proper cleanup on client disconnect or stream end
 *
 * Event Routing:
 * - 'world' channel carries both WorldActivityEvent and WorldToolEvent types
 * - WorldActivityEvent (response-start, idle, response-end) → manages stream lifecycle
 * - WorldToolEvent (tool-start, tool-result, tool-error, tool-progress) → forwarded as SSE events
 *
 * Usage:
 * ```typescript
 * const handler = createSSEHandler(req, res, world, 'chat');
 * 
 * // Publish your event (message, tool result, etc.)
 * publishMessage(world, message, sender);
 * 
 * // Optional: Send custom event
 * handler.sendSSE({ type: 'custom', data: {...} });
 * ```
 *
 * Created: 2025-11-10 - Extracted from api.ts for reusability
 * Updated: 2026-03-01 - Skip synthesis for 'edit' context to prevent duplicate "From human" messages after message edits.
 * Updated: 2026-03-11 - Exposed a readiness promise so chat/edit dispatch waits until SSE listeners are attached, preventing the web client from missing the initial user-message echo.
 * Updated: 2026-03-11 - Replaced optional-call resolution of the readiness promise with an explicit helper to satisfy
 *   strict TypeScript control-flow analysis in the build config.
 * Updated: 2026-02-27 - Scoped realtime log forwarding by world/chat to prevent cross-chat log leakage in chat-scoped streams.
 * Updated: 2026-02-26 - Added realtime log-stream forwarding (`type: 'log'`) to SSE clients to align web error visibility with Electron.
 * Updated: 2026-02-20 - Removed stale legacy event-channel SSE forwarding from this handler.
 * Updated: 2026-02-21 - Refresh fallback timeout on shell assistant-stream SSE activity (`start`/`chunk`/`end` + `toolName='shell_cmd'`) as well as legacy `tool-stream`.
 * Updated: 2026-02-11 - Extended fallback timeout on tool-stream events to prevent premature timeout
 * Updated: 2026-02-08 - Removed manual tool-intervention SSE commentary and kept generic tool_call forwarding
 * Updated: 2025-11-10 - Added tool event forwarding to SSE channel
 */

import { Request, Response } from 'express';
import {
  addLogStreamCallback,
  createCategoryLogger,
  World,
  EventType,
  getMemory,
  listPendingHitlPromptEventsFromMessages
} from '../core/index.js';

const loggerStream = createCategoryLogger('api.stream');

// Timeout constants for streaming (fallback only)
const STREAM_TIMEOUT_NO_EVENTS_MS = 15000;
const STREAM_IDLE_CLOSE_DELAY_MS = 2000;
// Event payload types
interface MessageEventPayload {
  sender: string;
  content: string;
  timestamp?: Date;
  messageId: string;
  chatId?: string | null;
  replyToMessageId?: string;
  role?: string;
  tool_calls?: any[];
  [key: string]: any;
}

interface SSEEventPayload {
  type: string;
  agentName?: string;
  chatId?: string | null;
  [key: string]: any;
}

interface SystemEventPayload {
  message?: string;
  content?: string;
  chatId?: string | null;
  [key: string]: any;
}

interface WorldActivityPayload {
  type?: string;
  state?: string;
  pendingOperations?: number;
  activityId?: number;
  timestamp?: string;
  source?: string;
  [key: string]: any;
}

interface LogStreamEventPayload {
  level?: string;
  category?: string;
  message?: string;
  timestamp?: string;
  data?: any;
  messageId?: string;
  chatId?: string | null;
  worldId?: string;
}

export interface SSEHandler {
  /**
   * Resolves once synthesis has finished and live listeners are attached.
   */
  ready: Promise<void>;

  /**
   * Send a Server-Sent Event to the client
   * @param data - Data object to send (will be JSON stringified)
   */
  sendSSE: (data: any) => void;

  /**
   * Manually end the SSE response
   */
  endResponse: () => void;

  /**
   * Check if the response has ended
   */
  isEnded: () => boolean;
}

/**
 * Create and configure an SSE handler for streaming world events
 * 
 * @param req - Express request object
 * @param res - Express response object
 * @param world - World instance to listen to
 * @param context - Context label for logging (e.g., 'chat', 'tool-result')
 * @returns SSEHandler interface with sendSSE, endResponse, and isEnded methods
 */
export function createSSEHandler(
  req: Request,
  res: Response,
  world: World,
  context: string = 'sse',
  scopedChatId?: string | null
): SSEHandler {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let idleCloseTimer: ReturnType<typeof setTimeout> | undefined;
  let hasReceivedEvents = false;
  let isResponseEnded = false;
  let lastEventTime = Date.now();
  let awaitingWorldIdle = false;

  const startTimeoutFallback = (): void => {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (isResponseEnded) return;

    // Fallback timeout - only used if world never becomes idle
    timeoutTimer = setTimeout(() => {
      if (!isResponseEnded) {
        const timeSinceLastEvent = Date.now() - lastEventTime;
        loggerStream.debug(`[${context}] Streaming timeout fallback triggered: timeSinceLastEvent=${timeSinceLastEvent}ms, awaitingWorldIdle=${awaitingWorldIdle}`);

        if (!hasReceivedEvents && timeSinceLastEvent >= STREAM_TIMEOUT_NO_EVENTS_MS) {
          loggerStream.debug(`[${context}] Ending stream: no events received within ${STREAM_TIMEOUT_NO_EVENTS_MS}ms`);
          endResponse();
        } else if (timeSinceLastEvent >= 60000) {
          // 60 second absolute timeout as fallback
          loggerStream.debug(`[${context}] Ending stream: absolute timeout (60s) reached`);
          endResponse();
        }
      }
    }, 60000);
  };

  const endResponse = (): void => {
    if (isResponseEnded) return;
    isResponseEnded = true;

    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = undefined;
    }

    if (idleCloseTimer) {
      clearTimeout(idleCloseTimer);
      idleCloseTimer = undefined;
    }

    loggerStream.debug(`[${context}] Ending SSE response. Stats: events=${hasReceivedEvents}, awaitingWorldIdle=${awaitingWorldIdle}`);

    try {
      if (!res.destroyed) {
        res.end();
      }
    } catch (error) {
      loggerStream.debug(`[${context}] Error ending response (likely already closed):`, error);
    }
  };

  const sendSSE = (data: any) => {
    if (isResponseEnded || res.destroyed) return;

    try {
      const jsonData = typeof data === 'string' ? data : JSON.stringify(data);
      res.write(`data: ${jsonData}\n\n`);
      hasReceivedEvents = true;
      lastEventTime = Date.now();
    } catch (error) {
      loggerStream.debug(`[${context}] Error writing SSE data:`, error);
      endResponse();
    }
  };

  const listeners = new Map<string, (...args: any[]) => void>();
  const normalizedScopedChatId = scopedChatId === undefined ? undefined : (scopedChatId === null ? null : String(scopedChatId));
  const isChatEventInScope = (eventChatId: unknown, includeUnscopedWhenScoped: boolean = false): boolean => {
    if (normalizedScopedChatId === undefined) return true;
    if (eventChatId === undefined) return includeUnscopedWhenScoped;
    const normalizedEventChatId = eventChatId === null ? null : String(eventChatId);
    return normalizedEventChatId === normalizedScopedChatId;
  };

  // Track already-sent ids to avoid double-emitting synthesized -> live events
  const sentMessageIds = new Set<string>();
  const sentToolCallIds = new Set<string>();
  let resolveReady: (() => void) | null = null;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  const markReady = (): void => {
    if (!resolveReady) {
      return;
    }
    const resolve = resolveReady;
    resolveReady = null;
    resolve();
  };

  // Attach direct listeners to world.eventEmitter (defined inside attach to allow synth-before-attach)
  const worldListener = (eventData: any) => {
    // Check if this is a tool event (tool-start, tool-result, tool-error, tool-progress)
    const isToolEvent = eventData?.type && ['tool-start', 'tool-result', 'tool-error', 'tool-progress'].includes(eventData.type);

    if (isToolEvent) {
      if (!isChatEventInScope(eventData?.chatId, false)) {
        return;
      }
      // Forward tool events as SSE events for frontend consumption
      sendSSE({
        type: EventType.SSE,
        data: {
          type: eventData.type,
          messageId: eventData.messageId,
          agentName: eventData.agentName,
          toolExecution: eventData.toolExecution,
          chatId: eventData.chatId
        }
      });
      return;
    }

    // Handle world activity events for stream completion
    if (eventData?.type === 'response-start') {
      if (idleCloseTimer) {
        clearTimeout(idleCloseTimer);
        idleCloseTimer = undefined;
      }
      awaitingWorldIdle = true;
      loggerStream.debug(`[${context}] World processing started`, {
        activityId: eventData.activityId,
        source: eventData.source
      });
    } else if (eventData?.type === 'idle' && awaitingWorldIdle) {
      loggerStream.debug(`[${context}] World idle detected, ending stream`, {
        activityId: eventData.activityId
      });
      sendSSE({ type: EventType.WORLD, data: eventData });
      awaitingWorldIdle = false;

      if (idleCloseTimer) {
        clearTimeout(idleCloseTimer);
      }

      idleCloseTimer = setTimeout(() => {
        // If no new response-start arrived during the grace window,
        // treat this idle as final and close the stream.
        if (!awaitingWorldIdle) {
          endResponse();
        }
      }, STREAM_IDLE_CLOSE_DELAY_MS);
      return;
    }

    if (isChatEventInScope(eventData?.chatId, true)) {
      sendSSE({ type: EventType.WORLD, data: eventData });
    }
  };

  const messageListener = (eventData: MessageEventPayload) => {
    if (!isChatEventInScope(eventData?.chatId, false)) {
      return;
    }
    // Enhance message event data with structured format
    // CRITICAL: replyToMessageId must be included for frontend threading display
    // Include tool_calls to preserve complete assistant tool-call context on the client.
    const messageData = {
      type: 'message',
      sender: eventData.sender,
      content: eventData.content,
      messageId: eventData.messageId,
      chatId: eventData.chatId,
      replyToMessageId: eventData.replyToMessageId,
      createdAt: eventData.timestamp || new Date().toISOString(),
      role: eventData.role,
      tool_calls: eventData.tool_calls
    };
    sendSSE({ type: EventType.MESSAGE, data: messageData });
  };

  const sseListener = (eventData: SSEEventPayload) => {
    if (!isChatEventInScope(eventData?.chatId, false)) {
      return;
    }
    // Extend fallback timeout for long-running shell stream activity.
    const isLegacyToolStream = eventData.type === 'tool-stream';
    const isShellAssistantStream = eventData.toolName === 'shell_cmd' &&
      (eventData.type === 'start' || eventData.type === 'chunk' || eventData.type === 'end');
    if (isLegacyToolStream || isShellAssistantStream) {
      startTimeoutFallback();
    }
    sendSSE({ type: EventType.SSE, data: eventData });
  };

  const systemListener = (eventData: SystemEventPayload) => {
    if (!isChatEventInScope(eventData?.chatId, true)) {
      return;
    }
    sendSSE({ type: EventType.SYSTEM, data: eventData });
  };

  // Mirror Electron's global log forwarding pattern:
  // stream backend logger events as SSE `type: 'log'` payloads during the active request.
  const logListener = (logEvent: LogStreamEventPayload) => {
    const logData = logEvent?.data && typeof logEvent.data === 'object' ? logEvent.data : null;
    const logWorldId =
      (typeof logEvent?.worldId === 'string' && logEvent.worldId.trim()) ? logEvent.worldId.trim()
        : (typeof (logData as any)?.worldId === 'string' && String((logData as any).worldId).trim())
          ? String((logData as any).worldId).trim()
          : undefined;
    if (logWorldId && logWorldId !== world.id) {
      return;
    }

    const logChatId =
      (typeof logEvent?.chatId === 'string' && logEvent.chatId.trim()) ? logEvent.chatId.trim()
        : (logEvent?.chatId === null ? null
          : (typeof logData?.chatId === 'string' && logData.chatId.trim()) ? logData.chatId.trim()
            : (logData?.chatId === null ? null : undefined));
    if (!isChatEventInScope(logChatId, false)) {
      return;
    }

    sendSSE({
      type: EventType.SSE,
      data: {
        type: 'log',
        chatId: logChatId,
        messageId: logEvent?.messageId || `log-${Date.now()}`,
        logEvent: {
          level: logEvent?.level || 'info',
          category: logEvent?.category || 'unknown',
          message: logEvent?.message || '',
          timestamp: logEvent?.timestamp || new Date().toISOString(),
          data: logData ?? null,
          messageId: logEvent?.messageId || `log-${Date.now()}`,
          chatId: logChatId
        }
      }
    });
  };

  let unsubscribeLogStream: (() => void) | null = null;

  // NOTE: listeners are attached after an initial synthesis step below to avoid race
  // where core resume emits events before the client has subscribed.
  async function attachListeners() {
    world.eventEmitter.on(EventType.WORLD, worldListener);
    listeners.set(EventType.WORLD, worldListener);

    world.eventEmitter.on(EventType.MESSAGE, messageListener);
    listeners.set(EventType.MESSAGE, messageListener);

    world.eventEmitter.on(EventType.SSE, sseListener);
    listeners.set(EventType.SSE, sseListener);

    world.eventEmitter.on(EventType.SYSTEM, systemListener);
    listeners.set(EventType.SYSTEM, systemListener);

    unsubscribeLogStream = addLogStreamCallback(logListener);
  }

  // Synthesis: use persisted memory as the source of truth to restore UI state
  (async () => {
    try {
      // Skip synthesis for edit operations: the edit flow removes old messages and immediately
      // publishes a fresh user message via publishMessage, so synthesizing the pre-edit last
      // user message would cause a duplicate "From human" message in the UI.
      if (context === 'edit') {
        return;
      }

      if (!normalizedScopedChatId) {
        return;
      }

      // Try to read canonical chat memory using public core helper
      const memory = await getMemory(world.id, normalizedScopedChatId);
      if (Array.isArray(memory) && memory.length > 0) {
        // Send the most recent user message if the last message is a user message
        const lastMessage = memory[memory.length - 1];
        if (lastMessage && lastMessage.messageId) {
          // Mark as sent to avoid double-emitting when live listeners arrive
          sentMessageIds.add(String(lastMessage.messageId));

          if (lastMessage.role === 'user') {
            const messageData = {
              type: 'message',
              sender: lastMessage.sender,
              content: lastMessage.content,
              messageId: lastMessage.messageId,
              chatId: lastMessage.chatId,
              replyToMessageId: lastMessage.replyToMessageId,
              createdAt: lastMessage.createdAt || new Date().toISOString(),
              role: lastMessage.role,
              tool_calls: lastMessage.tool_calls
            };
            sendSSE({ type: EventType.MESSAGE, data: messageData });
          } else if (lastMessage.role === 'assistant' && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
            // Detect unresolved tool calls by scanning persisted memory for completed tool messages
            const completedToolCallIds = new Set<string>();
            for (const m of memory) {
              if (m.role === 'tool' && typeof m.tool_call_id === 'string') {
                completedToolCallIds.add(String(m.tool_call_id));
              }
            }

            for (const tc of lastMessage.tool_calls) {
              const toolCallId = String((tc as any)?.id || '').trim();
              const toolName = String((tc as any)?.function?.name || '').trim();
              if (!toolCallId || completedToolCallIds.has(toolCallId)) continue;
              // Synthesize a tool-start event so the UI can show pending work / HITL
              sentToolCallIds.add(toolCallId);
              sendSSE({
                type: EventType.SSE,
                data: {
                  type: 'tool-start',
                  messageId: toolCallId,
                  agentName: lastMessage.agentId || undefined,
                  chatId: lastMessage.chatId,
                  toolExecution: {
                    toolName,
                    toolCallId,
                    input: (tc as any)?.function?.arguments || {}
                  }
                }
              });
            }
          }

          // Also synthesize any pending HITL prompts derived from memory
          try {
            const pendingHitl = listPendingHitlPromptEventsFromMessages(memory || [], normalizedScopedChatId === undefined ? null : normalizedScopedChatId as any);
            for (const h of pendingHitl) {
              sendSSE({ type: EventType.SYSTEM, data: h });
            }
          } catch (hitlErr) {
            loggerStream.debug(`[${context}] failed to synthesize HITL prompts:`, hitlErr);
          }
        }
      }
    } catch (error) {
      loggerStream.debug(`[${context}] failed to synthesize persisted state:`, error);
    } finally {
      // Attach live listeners after synthesis to avoid race where resume emits before client subscribed
      attachListeners();
      markReady();
    }
  })();

  // Cleanup function to remove all listeners
  const cleanupListeners = () => {
    for (const [eventType, listener] of listeners.entries()) {
      world.eventEmitter.removeListener(eventType, listener);
    }
    listeners.clear();
    if (unsubscribeLogStream) {
      unsubscribeLogStream();
      unsubscribeLogStream = null;
    }
  };

  // Handle client disconnect
  req.on('close', () => {
    loggerStream.debug(`[${context}] Client disconnected, cleaning up`);
    cleanupListeners();
    endResponse();
  });

  // Start the fallback timeout
  startTimeoutFallback();

  return {
    ready,
    sendSSE,
    endResponse,
    isEnded: () => isResponseEnded
  };
}
