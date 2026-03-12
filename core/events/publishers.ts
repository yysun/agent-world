/**
 * Event Publishers - Event Emission Functions
 *
 * Purpose: Functions that emit events to World.eventEmitter
 * Features:
 * - Message publishing with chat session management
 * - SSE event publishing for streaming
 * - Tool event publishing for agent behaviors
 *
 * Implementation Notes:
 * - Uses parseMessageContent to preserve enhanced tool-result protocol support
 * - Emits events synchronously through world-scoped EventEmitter channels
 *
 * Recent Changes:
 * - 2026-03-06: Required explicit `chatId` for message/system/SSE/tool publication; removed `world.currentChatId` fallback from event emitters.
 * - 2026-02-13: Added optional explicit `chatId` override for `publishEvent` to preserve session context across async flows.
 * - 2026-02-13: Added chat-scoped tool-event propagation (`chatId`) so realtime tool updates remain session-isolated.
 * - 2026-02-11: Fixed publishSSE to include toolName and stream fields for tool-stream events
 * - 2026-02-08: Added core-level sender normalization for consistent user-role detection
 * - 2026-02-08: Removed legacy manual tool-result publishing helper from event API
 *
 * All functions emit events synchronously and return immediately
 */

import {
  World, WorldMessageEvent, WorldSSEEvent, WorldToolEvent, WorldSystemEvent,
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

function resolveRequiredChatId(
  chatId: string | null | undefined,
  callsite: 'publishEvent' | 'publishMessage' | 'publishMessageWithId' | 'publishSSE' | 'publishToolEvent'
) {
  const explicitChatId = typeof chatId === 'string' ? chatId.trim() : '';
  if (explicitChatId) return explicitChatId;

  throw new Error(`${callsite}: explicit chatId is required.`);
}

function buildWorldMessageEvent(params: {
  content: string;
  sender: string;
  messageId: string;
  chatId: string;
  replyToMessageId?: string;
}): WorldMessageEvent {
  const normalizedSender = normalizeSender(params.sender);
  const { message: parsedMsg } = parseMessageContent(params.content, 'user');

  let role: string | undefined;
  if (parsedMsg.role === 'tool') {
    role = 'tool';
  } else if (normalizedSender === 'human' || normalizedSender.startsWith('user')) {
    role = 'user';
  } else if (normalizedSender === 'system' || normalizedSender === 'world') {
    role = normalizedSender;
  } else {
    role = parsedMsg.role === 'assistant' ? 'assistant' : 'assistant';
  }

  return {
    content: params.content,
    sender: normalizedSender,
    timestamp: new Date(),
    messageId: params.messageId,
    chatId: params.chatId,
    replyToMessageId: params.replyToMessageId,
    ...(role ? { role } : {}),
    ...(Array.isArray((parsedMsg as any).tool_calls) ? { tool_calls: (parsedMsg as any).tool_calls } : {}),
    ...(typeof (parsedMsg as any).tool_call_id === 'string' && (parsedMsg as any).tool_call_id.trim()
      ? { tool_call_id: (parsedMsg as any).tool_call_id.trim() }
      : {}),
  };
}

/**
 * Publish event to a specific channel using World.eventEmitter
 */
export function publishEvent(world: World, type: string, content: any, chatId: string): void {
  const targetChatId = resolveRequiredChatId(chatId, 'publishEvent');
  const event: WorldSystemEvent = {
    content,
    timestamp: new Date(),
    messageId: generateId(),
    chatId: targetChatId
  };
  world.eventEmitter.emit(type, event);
}

/**
 * Message publishing using World.eventEmitter with chat session management
 * Parses enhanced string protocol and automatically prepends @mention if agentId detected
 * Returns the messageEvent so callers can access the generated messageId
 * 
 * @param chatId - Explicit chat ID for concurrency-safe routing
 * @param replyToMessageId - Optional parent message ID for threading
 */
export function publishMessage(world: World, content: string, sender: string, chatId: string, replyToMessageId?: string): WorldMessageEvent {
  const messageId = generateId();
  const targetChatId = resolveRequiredChatId(chatId, 'publishMessage');
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

  const messageEvent = buildWorldMessageEvent({
    content: finalContent,
    sender: normalizedSender,
    messageId,
    chatId: targetChatId,
    replyToMessageId,
  });

  loggerMemory.debug('[publishMessage] Generated messageId', {
    messageId,
    sender: normalizedSender,
    role: messageEvent.role,
    worldId: world.id,
    chatId: targetChatId,
    hasAgentId: !!targetAgentId,
    contentPreview: finalContent.substring(0, 50)
  });

  loggerMemory.debug('[publishMessage] Emitting message event', {
    messageId,
    sender: normalizedSender,
    role: messageEvent.role,
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
 * @param chatId - Explicit chat ID for concurrency-safe routing
 * @param replyToMessageId - Optional parent message ID for threading
 */
export function publishMessageWithId(world: World, content: string, sender: string, messageId: string, chatId: string, replyToMessageId?: string): WorldMessageEvent {
  const targetChatId = resolveRequiredChatId(chatId, 'publishMessageWithId');
  const messageEvent = buildWorldMessageEvent({
    content,
    sender,
    messageId,
    chatId: targetChatId,
    replyToMessageId,
  });
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
export function publishSSE(world: World, data: Partial<WorldSSEEvent> & { chatId: string }): void {
  const targetChatId = resolveRequiredChatId(data.chatId, 'publishSSE');
  const sseEvent: WorldSSEEvent = {
    agentName: data.agentName!,
    type: data.type!,
    content: data.content,
    error: data.error,
    messageId: data.messageId || generateId(),
    chatId: targetChatId,
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
export function publishToolEvent(world: World, data: Partial<WorldToolEvent> & { chatId: string }): void {
  const targetChatId = resolveRequiredChatId(data.chatId, 'publishToolEvent');
  const toolEvent: WorldToolEvent = {
    agentName: data.agentName!,
    type: data.type!,
    messageId: data.messageId || generateId(),
    chatId: targetChatId,
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
