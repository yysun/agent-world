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
 * Updated: 2025-11-10 - Added tool event forwarding to SSE channel
 */

import { Request, Response } from 'express';
import { createCategoryLogger, World, EventType } from '../core/index.js';

const loggerStream = createCategoryLogger('api.stream');

// Timeout constants for streaming (fallback only)
const STREAM_TIMEOUT_NO_EVENTS_MS = 15000;

// Event payload types
interface MessageEventPayload {
  sender: string;
  content: string;
  timestamp?: Date;
  messageId: string;
  replyToMessageId?: string;
  role?: string;
  tool_calls?: any[];
  [key: string]: any;
}

interface SSEEventPayload {
  type: string;
  agentName?: string;
  [key: string]: any;
}

interface SystemEventPayload {
  message?: string;
  content?: string;
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

export interface SSEHandler {
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
  context: string = 'sse'
): SSEHandler {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
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

  // Attach direct listeners to world.eventEmitter
  const worldListener = (eventData: any) => {
    // Check if this is a tool event (tool-start, tool-result, tool-error, tool-progress)
    const isToolEvent = eventData?.type && ['tool-start', 'tool-result', 'tool-error', 'tool-progress'].includes(eventData.type);

    if (isToolEvent) {
      // Forward tool events as SSE events for frontend consumption
      sendSSE({
        type: EventType.SSE,
        data: {
          type: eventData.type,
          messageId: eventData.messageId,
          agentName: eventData.agentName,
          toolExecution: eventData.toolExecution
        }
      });
      return;
    }

    // Handle world activity events for stream completion
    if (eventData?.type === 'response-start') {
      awaitingWorldIdle = true;
      loggerStream.debug(`[${context}] World processing started`, {
        activityId: eventData.activityId,
        source: eventData.source
      });
    } else if (eventData?.type === 'idle' && awaitingWorldIdle) {
      loggerStream.debug(`[${context}] World idle detected, ending stream`, {
        activityId: eventData.activityId
      });
      // Stream all pending events, then end
      sendSSE({ type: EventType.WORLD, data: eventData });
      // Give a small delay for any final events to be sent
      setTimeout(() => {
        endResponse();
      }, 500);
      return;
    }

    sendSSE({ type: EventType.WORLD, data: eventData });
  };
  world.eventEmitter.on(EventType.WORLD, worldListener);
  listeners.set(EventType.WORLD, worldListener);

  const messageListener = (eventData: MessageEventPayload) => {
    // Enhance message event data with structured format
    // CRITICAL: replyToMessageId must be included for frontend threading display
    // CRITICAL: tool_calls must be included for approval request handling (OpenAI protocol)
    const messageData = {
      type: 'message',
      sender: eventData.sender,
      content: eventData.content,
      messageId: eventData.messageId,
      replyToMessageId: eventData.replyToMessageId,
      createdAt: eventData.timestamp || new Date().toISOString(),
      role: eventData.role,
      tool_calls: eventData.tool_calls
    };
    sendSSE({ type: EventType.MESSAGE, data: messageData });
  };
  world.eventEmitter.on(EventType.MESSAGE, messageListener);
  listeners.set(EventType.MESSAGE, messageListener);

  const sseListener = (eventData: SSEEventPayload) => {
    sendSSE({ type: EventType.SSE, data: eventData });
  };
  world.eventEmitter.on(EventType.SSE, sseListener);
  listeners.set(EventType.SSE, sseListener);

  const systemListener = (eventData: SystemEventPayload) => {
    sendSSE({ type: EventType.SYSTEM, data: eventData });
  };
  world.eventEmitter.on(EventType.SYSTEM, systemListener);
  listeners.set(EventType.SYSTEM, systemListener);

  // Cleanup function to remove all listeners
  const cleanupListeners = () => {
    for (const [eventType, listener] of listeners.entries()) {
      world.eventEmitter.removeListener(eventType, listener);
    }
    listeners.clear();
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
    sendSSE,
    endResponse,
    isEnded: () => isResponseEnded
  };
}
