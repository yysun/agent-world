/**
 * Events Persistence Module
 *
 * Handles automatic event persistence to storage with metadata enrichment.
 * Also owns the single world-level listener per event channel (message, sse, world, system),
 * combining persistence with title-scheduling and activity-title logic in one handler each.
 *
 * Features:
 * - One combined `message` handler: persistence + no-activity title scheduling.
 * - One combined `world` handler: persistence + idle title generation.
 * - SSE event persistence (start/end only, skips chunks).
 * - System event persistence.
 * - Sets world._worldMessagesUnsubscriber and world._activityListenerCleanup so downstream
 *   idempotent wrappers (subscribeWorldToMessages, setupWorldActivityListener) don't add
 *   duplicate listeners.
 *
 * Dependencies (Layer 4):
 * - types.ts (Layer 1)
 * - chat-constants.ts
 * - events-metadata.ts
 * - title-scheduler.ts (Layer 4)
 * - logger.ts
 *
 * Changes:
 * - 2026-03-06: Required explicit `chatId` on persisted message/SSE/tool/activity/system events; unscoped events are now rejected instead of inheriting `world.currentChatId`.
 * - 2026-03-03: Combined world-level listeners to eliminate MaxListenersExceededWarning;
 *   title-scheduling and idle-activity logic moved here from subscribers.ts (Layer 6) via
 *   title-scheduler.ts (Layer 4) to respect module layering.
 * - 2026-02-26: Removed legacy replay-only HITL system-event filter.
 * - 2025-11-09: Fixed event persistence - use world.eventStorage directly.
 * - 2025-01-09: Extracted from events.ts for modular architecture.
 */

import type {
  World,
  WorldMessageEvent,
  WorldSSEEvent,
  WorldSystemEvent
} from '../types.js';
import { createCategoryLogger } from '../logger.js';
import {
  calculateOwnerAgentIds,
  calculateRecipientAgentId,
  calculateMessageDirection,
  calculateIsMemoryOnly,
  calculateIsCrossAgentMessage
} from '../events-metadata.js';
import { isDefaultChatTitle } from '../chat-constants.js';
import {
  isHumanSender,
  scheduleNoActivityTitleUpdate,
  runIdleTitleUpdate,
  clearWorldTitleTimers
} from './title-scheduler.js';

const loggerPublish = createCategoryLogger('publish');

/**
 * Setup automatic event persistence listeners on World event emitter.
 * Should be called once during World initialization.
 * 
 * Events are persisted synchronously/awaitable for reliability.
 * Failures are logged but don't block event emission.
 * Returns a cleanup function to remove listeners.
 * 
 * Environment variables:
 * - DISABLE_EVENT_PERSISTENCE=true: Skip all persistence
 */
export function setupEventPersistence(world: World): () => void {
  if (process.env.DISABLE_EVENT_PERSISTENCE === 'true') {
    loggerPublish.debug('Event persistence disabled by environment', { worldId: world.id });
    return () => { }; // Return no-op cleanup
  }

  if (!world.eventStorage) {
    loggerPublish.debug('Event storage not configured - events will not be persisted', { worldId: world.id });
    return () => { }; // Return no-op cleanup
  }

  const storage = world.eventStorage;

  // Helper to handle async persistence
  const persistEvent = async (eventData: any) => {
    try {
      await storage.saveEvent(eventData);
    } catch (error) {
      loggerPublish.error('Failed to persist event', {
        worldId: world.id,
        eventId: eventData.id,
        eventType: eventData.type,
        error: error instanceof Error ? error.message : error
      });
    }
  };

  // Combined message handler: persistence + no-activity title scheduling
  const messageHandler = async (event: WorldMessageEvent): Promise<void> => {
    const targetChatId = typeof event.chatId === 'string' ? event.chatId.trim() : '';
    if (!targetChatId) {
      loggerPublish.error('Message event missing required chatId', {
        worldId: world.id,
        messageId: event.messageId,
        sender: event.sender,
      });
      return;
    }

    loggerPublish.debug('Message event received for persistence', {
      worldId: world.id,
      messageId: event.messageId,
      sender: event.sender,
      chatId: targetChatId
    });

    // Calculate enhanced metadata using helper functions
    const ownerAgentIds = calculateOwnerAgentIds(world, event);
    const recipientAgentId = calculateRecipientAgentId(world, event);
    const messageDirection = calculateMessageDirection(world, event);
    const isMemoryOnly = calculateIsMemoryOnly(world, event);
    const isCrossAgentMessage = calculateIsCrossAgentMessage(world, event);
    const isHumanMessage = event.sender === 'human' || event.sender === 'user';

    // Calculate thread metadata (requires loading messages for accurate depth calculation)
    // For now, use simplified version - can enhance later with full message history
    const threadMetadata = event.replyToMessageId
      ? { threadRootId: event.replyToMessageId, threadDepth: 1, isReply: true }
      : { threadRootId: null, threadDepth: 0, isReply: false };

    // Get tool call information if present
    const hasToolCalls = !!((event as any).tool_calls?.length);
    const toolCallCount = (event as any).tool_calls?.length || 0;

    const eventData = {
      id: event.messageId,
      worldId: world.id,
      chatId: targetChatId,
      type: 'message',
      payload: {
        content: event.content,
        sender: event.sender,
        replyToMessageId: event.replyToMessageId,
        // Preserve OpenAI protocol fields for tool calls.
        role: (event as any).role,
        tool_calls: (event as any).tool_calls,
        tool_call_id: (event as any).tool_call_id,
        // NEW: Include tool call completion status
        toolCallStatus: (event as any).toolCallStatus
      },
      meta: {
        // Core fields
        sender: event.sender,
        chatId: event.chatId || null,

        // Agent Context
        ownerAgentIds,
        recipientAgentId,
        originalSender: null, // Will be set for cross-agent forwarding in future
        deliveredToAgents: ownerAgentIds, // Same as owner for now

        // Message Classification
        messageDirection,
        isMemoryOnly,
        isCrossAgentMessage,
        isHumanMessage,

        // Threading
        threadRootId: threadMetadata.threadRootId,
        threadDepth: threadMetadata.threadDepth,
        isReply: threadMetadata.isReply,
        hasReplies: false, // Will be updated async in future

        // Performance (for agent messages with LLM usage)
        llmTokensInput: (event as any).usage?.inputTokens || null,
        llmTokensOutput: (event as any).usage?.outputTokens || null,
        llmLatency: null, // Can be calculated from SSE start/end events
        llmProvider: null, // Not available in message event
        llmModel: null,

        // UI State
        hasToolCalls,
        toolCallCount
      },
      createdAt: event.timestamp
    };

    await persistEvent(eventData);

    // Title scheduling: debounce on human messages while chat title is still default
    if (isHumanSender(event.sender)) {
      const chat = world.chats.get(targetChatId);
      if (chat && isDefaultChatTitle(chat.name)) {
        scheduleNoActivityTitleUpdate(world, targetChatId, event.content || '');
      }
    }
  };

  // SSE event handler - persist only start and end events, skip chunk events
  // Chunk events are for UI streaming only (high frequency, transient)
  // Start/end events provide metadata (tokens, latency, etc.)
  const sseHandler = (event: WorldSSEEvent): void | Promise<void> => {
    // Skip chunk events - they're transient UI updates
    if (event.type === 'chunk') {
      return;
    }

    const targetChatId = typeof event.chatId === 'string' ? event.chatId.trim() : '';
    if (!targetChatId) {
      loggerPublish.error('SSE event missing required chatId', {
        worldId: world.id,
        eventType: event.type,
        messageId: event.messageId,
        agentName: event.agentName,
      });
      return;
    }

    // Persist start/end events for metadata tracking
    const eventData = {
      id: `${event.messageId}-sse-${event.type}`,
      worldId: world.id,
      chatId: targetChatId,
      type: 'sse',
      payload: {
        agentName: event.agentName,
        type: event.type,
        content: event.content,
        error: event.error,
        usage: event.usage,
        logEvent: event.logEvent
      },
      meta: {
        agentName: event.agentName,
        sseType: event.type
      },
      createdAt: new Date()
    };

    return persistEvent(eventData);
  };

  // Combined world-channel handler: persistence + idle title generation
  // Handles WorldToolEvent (tool execution) and WorldActivityEventPayload (activity tracking)
  const toolHandler = async (event: any): Promise<void> => {
    // Check event type category
    const isActivityEvent = event.type && ['response-start', 'response-end', 'idle'].includes(event.type);
    const isToolEvent = event.type && ['tool-start', 'tool-result', 'tool-error', 'tool-progress'].includes(event.type);
    const targetChatId = typeof event?.chatId === 'string' ? event.chatId.trim() : '';

    // OPTIMIZATION: Skip tool-progress events (high frequency status updates)
    // Keep tool-start (marks beginning), tool-result (final result), tool-error (failures)
    if (event.type === 'tool-progress') {
      return; // Skip - these are transient progress updates
    }

    // Validate required fields for tool events only
    if (isToolEvent) {
      if (!targetChatId) {
        loggerPublish.error('Tool event missing required chatId', {
          worldId: world.id,
          eventType: event.type,
          messageId: event.messageId,
          agentName: event.agentName,
        });
        return;
      }
      if (!event.messageId) {
        loggerPublish.error('Tool event missing required messageId', {
          worldId: world.id,
          eventType: event.type,
          agentName: event.agentName
        });
        return; // Skip persistence for invalid events
      }
      if (!event.agentName) {
        loggerPublish.error('Tool event missing required agentName', {
          worldId: world.id,
          eventType: event.type,
          messageId: event.messageId
        });
        return; // Skip persistence for invalid events
      }
    }

    if (isActivityEvent && !targetChatId) {
      loggerPublish.error('Activity event missing required chatId', {
        worldId: world.id,
        eventType: event.type,
        messageId: event.messageId,
        source: event.source,
      });
      return;
    }

    // Generate unique ID for tool events by combining messageId with tool type
    // This prevents duplicate ID conflicts when multiple tool events (tool-start, tool-result, tool-error)
    // share the same messageId
    const eventId = isActivityEvent
      ? event.messageId  // Activity events already have unique messageIds
      : `${event.messageId}-tool-${event.type}`;  // Tool events need type suffix for uniqueness

    const eventData = {
      id: eventId,
      worldId: world.id,
      chatId: targetChatId,
      type: isActivityEvent ? 'world' : 'tool',
      payload: isActivityEvent ? {
        activityType: event.type,
        pendingOperations: event.pendingOperations,
        activityId: event.activityId,
        source: event.source,
        activeSources: event.activeSources,
        timestamp: event.timestamp
      } : {
        agentName: event.agentName,
        type: event.type,
        toolExecution: event.toolExecution
      },
      meta: isActivityEvent ? {
        activityType: event.type,
        source: event.source
      } : {
        agentName: event.agentName,
        toolType: event.type,
        // Required metadata for tool events
        ownerAgentId: event.agentName,
        triggeredByMessageId: event.messageId,
        executionDuration: event.toolExecution?.duration ?? 0,
        resultSize: event.toolExecution?.resultSize ?? 0
      },
      createdAt: isActivityEvent ? new Date(event.timestamp) : new Date()
    };

    await persistEvent(eventData);

    // Idle title generation runs after persisting the activity event
    if (isActivityEvent) {
      await runIdleTitleUpdate(world, event);
    }
  };

  // System event persistence
  const systemHandler = (event: WorldSystemEvent): void | Promise<void> => {
    const targetChatId = typeof event.chatId === 'string' ? event.chatId.trim() : '';
    if (!targetChatId) {
      loggerPublish.error('System event missing required chatId', {
        worldId: world.id,
        messageId: event.messageId,
      });
      return;
    }

    const eventData = {
      id: event.messageId,
      worldId: world.id,
      chatId: targetChatId,
      type: 'system',
      payload: event.content,
      meta: {},
      createdAt: event.timestamp
    };

    return persistEvent(eventData);
  };

  // Attach listeners — one per channel; this is the sole world-level infrastructure subscriber
  world.eventEmitter.on('message', messageHandler);
  world.eventEmitter.on('sse', sseHandler);
  world.eventEmitter.on('world', toolHandler);
  world.eventEmitter.on('system', systemHandler);

  const cleanup = () => {
    world.eventEmitter.off('message', messageHandler);
    world.eventEmitter.off('sse', sseHandler);
    world.eventEmitter.off('world', toolHandler);
    world.eventEmitter.off('system', systemHandler);
    clearWorldTitleTimers(world.id);
    // Clear idempotent handles so downstream wrappers can re-register if needed after cleanup
    world._worldMessagesUnsubscriber = undefined;
    world._activityListenerCleanup = undefined;
    loggerPublish.debug('Event persistence listeners cleaned up', { worldId: world.id });
  };

  // Store cleanup ref in all three slots so the idempotent wrappers
  // (subscribeWorldToMessages, setupWorldActivityListener) short-circuit instead of
  // adding duplicate listeners on the same world.
  world._worldMessagesUnsubscriber = cleanup;
  world._activityListenerCleanup = cleanup;

  loggerPublish.debug('Event persistence setup complete', {
    worldId: world.id
  });

  return cleanup;
}
