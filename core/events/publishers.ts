/**
 * Event Publishers - Event Emission Functions
 *
 * Purpose: Functions that emit events to World.eventEmitter
 * Features:
 * - Message publishing with chat session management
 * - SSE event publishing for streaming
 * - Tool event publishing for agent behaviors
 * - CRUD event publishing for configuration changes
 *
 * Implementation Notes:
 * - Uses parseMessageContent to preserve enhanced tool-result protocol support
 * - Emits events synchronously through world-scoped EventEmitter channels
 *
 * Recent Changes:
 * - 2026-02-13: Added chat-scoped tool-event propagation (`chatId`) so realtime tool updates remain session-isolated.
 * - 2026-02-11: Fixed publishSSE to include toolName and stream fields for tool-stream events
 * - 2026-02-08: Added core-level sender normalization for consistent user-role detection
 * - 2026-02-08: Removed legacy manual tool-result publishing helper from event API
 *
 * All functions emit events synchronously and return immediately
 */

import {
  World, WorldMessageEvent, WorldSSEEvent, WorldToolEvent, WorldSystemEvent, WorldCRUDEvent,
  EventType
} from '../types.js';
import { generateId } from '../utils.js';
import { parseMessageContent } from '../message-prep.js';
import { createCategoryLogger } from '../logger.js';

const loggerPublish = createCategoryLogger('events.publish');
const loggerMemory = createCategoryLogger('events.memory');

// Global streaming control
let globalStreamingEnabled = true;
export function enableStreaming(): void { globalStreamingEnabled = true; }
export function disableStreaming(): void { globalStreamingEnabled = false; }
export function isStreamingEnabled(): boolean { return globalStreamingEnabled; }

/**
 * Normalize sender values so role/persistence logic remains consistent across clients.
 * Examples:
 * - "HUMAN", "user", "User42" => "human"
 * - "SYSTEM" => "system"
 * - Agent IDs remain unchanged.
 */
export function normalizeSender(sender: string): string {
  const trimmed = String(sender ?? '').trim();
  if (!trimmed) return 'human';

  const lower = trimmed.toLowerCase();
  if (lower === 'human' || lower.startsWith('user')) return 'human';
  if (lower === 'system') return 'system';
  if (lower === 'world') return 'world';
  return trimmed;
}

/**
 * Publish CRUD event for agent, chat, or world configuration changes
 * Allows subscribed clients to receive real-time updates for all CRUD operations
 * 
 * Note: CRUD events are entity-level operations and don't belong to any specific chat,
 * so chatId is always null to avoid foreign key constraint issues.
 */
export function publishCRUDEvent(
  world: World,
  operation: 'create' | 'update' | 'delete',
  entityType: 'agent' | 'chat' | 'world',
  entityId: string,
  entityData?: any
): void {
  const event: WorldCRUDEvent = {
    operation,
    entityType,
    entityId,
    entityData: operation === 'delete' ? null : entityData,
    timestamp: new Date(),
    chatId: null  // CRUD events are entity-level, not chat-scoped
  };

  world.eventEmitter.emit(EventType.CRUD, event);

  loggerPublish.debug('CRUD event published', {
    worldId: world.id,
    operation,
    entityType,
    entityId
  });
}

/**
 * Publish event to a specific channel using World.eventEmitter
 */
export function publishEvent(world: World, type: string, content: any): void {
  const event: WorldSystemEvent = {
    content,
    timestamp: new Date(),
    messageId: generateId(),
    chatId: world.currentChatId || null
  };
  world.eventEmitter.emit(type, event);
}

/**
 * Message publishing using World.eventEmitter with chat session management
 * Parses enhanced string protocol and automatically prepends @mention if agentId detected
 * Returns the messageEvent so callers can access the generated messageId
 * 
 * @param chatId - Optional chat ID. If not provided, uses world.currentChatId
 * @param replyToMessageId - Optional parent message ID for threading
 */
export function publishMessage(world: World, content: string, sender: string, chatId?: string | null, replyToMessageId?: string): WorldMessageEvent {
  const messageId = generateId();
  const targetChatId = chatId !== undefined ? chatId : world.currentChatId;
  const normalizedSender = normalizeSender(sender);

  loggerMemory.debug('[publishMessage] ENTRY', {
    sender,
    normalizedSender,
    chatId,
    contentPreview: content.substring(0, 200),
    messageId
  });

  // Parse enhanced string protocol to extract targetAgentId
  const { message: parsedMsg, targetAgentId } = parseMessageContent(content, 'user');

  loggerMemory.debug('[publishMessage] After parseMessageContent', {
    parsedRole: parsedMsg.role,
    targetAgentId,
    toolCallId: parsedMsg.role === 'tool' ? (parsedMsg as any).tool_call_id : undefined
  });

  // For tool messages, don't prepend @mention - send the parsed content directly
  let finalContent = content;
  if (targetAgentId && parsedMsg.role === 'tool') {
    // Tool messages: Use the tool_call_id to route, not @mentions
    // Keep the enhanced protocol format for agent handler to parse
    loggerMemory.debug('[publishMessage] Tool result message detected', {
      agentId: targetAgentId,
      toolCallId: parsedMsg.tool_call_id,
      messageId
    });
  } else if (targetAgentId) {
    // Regular messages: Prepend @mention
    finalContent = `@${targetAgentId}, ${content}`;
    loggerMemory.debug('[publishMessage] Prepended @mention from enhanced protocol', {
      agentId: targetAgentId,
      messageId
    });
  }

  // Determine role based on sender and message type
  let role: string;
  if (parsedMsg.role === 'tool') {
    role = 'tool';
  } else if (normalizedSender === 'human' || normalizedSender.startsWith('user')) {
    role = 'user';
  } else {
    // Agent senders get role 'assistant'
    role = 'assistant';
  }

  const messageEvent: WorldMessageEvent & { role?: string; tool_calls?: any } = {
    content: finalContent,
    sender: normalizedSender,
    role,
    timestamp: new Date(),
    messageId,
    chatId: targetChatId,
    replyToMessageId
  };

  loggerMemory.debug('[publishMessage] Generated messageId', {
    messageId,
    sender: normalizedSender,
    role,
    worldId: world.id,
    chatId: targetChatId,
    hasAgentId: !!targetAgentId,
    contentPreview: finalContent.substring(0, 50)
  });

  loggerMemory.debug('[publishMessage] Emitting message event', {
    messageId,
    sender: normalizedSender,
    role,
    chatId: targetChatId,
    contentPreview: finalContent.substring(0, 100)
  });

  world.eventEmitter.emit('message', messageEvent);

  loggerMemory.debug('[publishMessage] Message event emitted', { messageId });

  return messageEvent;
}

/**
 * Message publishing with pre-generated messageId
 * Used when messageId needs to be known before publishing (e.g., for agent responses)
 * 
 * @param chatId - Optional chat ID. If not provided, uses world.currentChatId
 * @param replyToMessageId - Optional parent message ID for threading
 */
export function publishMessageWithId(world: World, content: string, sender: string, messageId: string, chatId?: string | null, replyToMessageId?: string): WorldMessageEvent {
  const targetChatId = chatId !== undefined ? chatId : world.currentChatId;
  const normalizedSender = normalizeSender(sender);
  const messageEvent: WorldMessageEvent = {
    content,
    sender: normalizedSender,
    timestamp: new Date(),
    messageId,
    chatId: targetChatId,
    replyToMessageId
  };
  world.eventEmitter.emit('message', messageEvent);
  return messageEvent;
}

/**
 * Subscribe to message events
 */
export function subscribeToMessages(
  world: World,
  handler: (event: WorldMessageEvent) => void | Promise<void>
): () => void {
  // Wrap async handlers to catch and log errors
  // This ensures async operations complete even if errors occur
  const wrappedHandler = (event: WorldMessageEvent) => {
    try {
      const result = handler(event);
      if (result instanceof Promise) {
        result.catch(error => {
          loggerPublish.error('Async message handler error', {
            worldId: world.id,
            messageId: event.messageId,
            sender: event.sender,
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined
          });
        });
      }
    } catch (error) {
      loggerPublish.error('Sync message handler error', {
        worldId: world.id,
        messageId: event.messageId,
        sender: event.sender,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  };
  world.eventEmitter.on('message', wrappedHandler);
  return () => world.eventEmitter.off('message', wrappedHandler);
}

/**
 * SSE events using World.eventEmitter (for LLM streaming)
 */
export function publishSSE(world: World, data: Partial<WorldSSEEvent>): void {
  const sseEvent: WorldSSEEvent = {
    agentName: data.agentName!,
    type: data.type!,
    content: data.content,
    error: data.error,
    messageId: data.messageId || generateId(),
    chatId: data.chatId !== undefined ? data.chatId : (world.currentChatId ?? null),
    usage: data.usage,
    logEvent: data.logEvent,
    tool_calls: data.tool_calls,
    toolName: data.toolName,
    stream: data.stream
  };
  world.eventEmitter.emit('sse', sseEvent);
}

/**
 * Tool events using World.eventEmitter (for agent behavioral events)
 */
export function publishToolEvent(world: World, data: Partial<WorldToolEvent>): void {
  const toolEvent: WorldToolEvent = {
    agentName: data.agentName!,
    type: data.type!,
    messageId: data.messageId || generateId(),
    chatId: data.chatId !== undefined ? data.chatId : (world.currentChatId ?? null),
    toolExecution: data.toolExecution!
  };
  world.eventEmitter.emit('world', toolEvent);
}

/**
 * SSE subscription using World.eventEmitter
 */
export function subscribeToSSE(
  world: World,
  handler: (event: WorldSSEEvent) => void
): () => void {
  world.eventEmitter.on('sse', handler);
  return () => world.eventEmitter.off('sse', handler);
}
