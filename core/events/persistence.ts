/**
 * Events Persistence Module
 * 
 * Handles automatic event persistence to storage with metadata enrichment.
 * Provides setupEventPersistence function for World initialization.
 * 
 * Features:
 * - Message event persistence with enhanced metadata
 * - SSE event persistence (start/end only, skips chunks)
 * - Tool event persistence with validation
 * - System and CRUD event persistence
 * - Activity tracking event persistence
 * - Automatic metadata calculation (agent context, threading, tool calls)
 * - Error handling with graceful degradation
 * - Environment-based disable flag
 * - Uses world.eventStorage directly (no separate storage instance)
 * 
 * Dependencies (Layer 4):
 * - types.ts (Layer 1)
 * - utils.ts
 * - logger.ts
 * - storage (runtime)
 * 
 * Changes:
 * - 2025-11-09: Fixed event persistence - use world.eventStorage directly instead of creating separate instance
 * - 2025-01-09: Extracted from events.ts for modular architecture
 */

import type {
  World,
  WorldMessageEvent,
  WorldSSEEvent,
  WorldSystemEvent,
  WorldCRUDEvent
} from '../types.js';
import { EventType } from '../types.js';
import { createCategoryLogger } from '../logger.js';
import {
  calculateOwnerAgentIds,
  calculateRecipientAgentId,
  calculateMessageDirection,
  calculateIsMemoryOnly,
  calculateIsCrossAgentMessage
} from '../events-metadata.js';

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

  // Message event persistence
  const messageHandler = (event: WorldMessageEvent): void | Promise<void> => {
    loggerPublish.debug('Message event received for persistence', {
      worldId: world.id,
      messageId: event.messageId,
      sender: event.sender,
      chatId: event.chatId
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
      chatId: event.chatId || null,
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

    return persistEvent(eventData);
  };

  // SSE event handler - persist only start and end events, skip chunk events
  // Chunk events are for UI streaming only (high frequency, transient)
  // Start/end events provide metadata (tokens, latency, etc.)
  const sseHandler = (event: WorldSSEEvent): void | Promise<void> => {
    // Skip chunk events - they're transient UI updates
    if (event.type === 'chunk') {
      return;
    }

    // Persist start/end events for metadata tracking
    const eventData = {
      id: `${event.messageId}-sse-${event.type}`,
      worldId: world.id,
      chatId: world.currentChatId || null,
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

  // Tool event persistence (world channel)
  // Handles WorldToolEvent (tool execution) and WorldActivityEventPayload (activity tracking)
  const toolHandler = (event: any): void | Promise<void> => {
    // Check event type category
    const isActivityEvent = event.type && ['response-start', 'response-end', 'idle'].includes(event.type);
    const isToolEvent = event.type && ['tool-start', 'tool-result', 'tool-error', 'tool-progress'].includes(event.type);

    // OPTIMIZATION: Skip tool-progress events (high frequency status updates)
    // Keep tool-start (marks beginning), tool-result (final result), tool-error (failures)
    if (event.type === 'tool-progress') {
      return; // Skip - these are transient progress updates
    }

    // Validate required fields for tool events only
    if (isToolEvent) {
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

    // Generate unique ID for tool events by combining messageId with tool type
    // This prevents duplicate ID conflicts when multiple tool events (tool-start, tool-result, tool-error)
    // share the same messageId
    const eventId = isActivityEvent
      ? event.messageId  // Activity events already have unique messageIds
      : `${event.messageId}-tool-${event.type}`;  // Tool events need type suffix for uniqueness

    const eventData = {
      id: eventId,
      worldId: world.id,
      chatId: world.currentChatId || null, // Default to current chat
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

    return persistEvent(eventData);
  };

  // System event persistence
  const systemHandler = (event: WorldSystemEvent): void | Promise<void> => {
    const eventData = {
      id: event.messageId,
      worldId: world.id,
      chatId: event.chatId !== undefined ? event.chatId : (world.currentChatId || null), // Default to current chat
      type: 'system',
      payload: event.content,
      meta: {},
      createdAt: event.timestamp
    };

    return persistEvent(eventData);
  };

  // CRUD event persistence
  const crudHandler = (event: WorldCRUDEvent): void | Promise<void> => {
    const eventData = {
      id: `crud-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      worldId: world.id,
      chatId: event.chatId || null,
      type: 'crud',
      payload: {
        operation: event.operation,
        entityType: event.entityType,
        entityId: event.entityId,
        entityData: event.entityData,
        timestamp: event.timestamp
      },
      meta: {
        operation: event.operation,
        entityType: event.entityType,
        entityId: event.entityId
      },
      createdAt: event.timestamp
    };

    return persistEvent(eventData);
  };

  // Attach listeners
  world.eventEmitter.on('message', messageHandler);
  world.eventEmitter.on('sse', sseHandler);
  world.eventEmitter.on('world', toolHandler);
  world.eventEmitter.on('system', systemHandler);
  world.eventEmitter.on(EventType.CRUD, crudHandler);

  loggerPublish.debug('Event persistence setup complete', {
    worldId: world.id
  });

  // Return cleanup function
  return () => {
    world.eventEmitter.off('message', messageHandler);
    world.eventEmitter.off('sse', sseHandler);
    world.eventEmitter.off('world', toolHandler);
    world.eventEmitter.off('system', systemHandler);
    world.eventEmitter.off(EventType.CRUD, crudHandler);
    loggerPublish.debug('Event persistence listeners cleaned up', { worldId: world.id });
  };
}
