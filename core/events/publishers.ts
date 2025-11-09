/**
 * Event Publishers - Event Emission Functions
 *
 * Purpose: Functions that emit events to World.eventEmitter
 * Features:
 * - Message publishing with chat session management
 * - Tool result publishing with structured API
 * - SSE event publishing for streaming
 * - Tool event publishing for agent behaviors
 * - CRUD event publishing for configuration changes
 * - Approval request publishing (legacy)
 *
 * All functions emit events synchronously and return immediately
 */

import {
  World, WorldMessageEvent, WorldSSEEvent, WorldToolEvent, WorldSystemEvent, WorldCRUDEvent,
  EventType, ToolResultData
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
 * Publish CRUD event for agent, chat, or world configuration changes
 * Allows subscribed clients to receive real-time updates for all CRUD operations
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
    chatId: world.currentChatId ?? null
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

  loggerMemory.debug('[publishMessage] ENTRY', {
    sender,
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
  } else if (sender === 'human' || sender.startsWith('user')) {
    role = 'user';
  } else {
    // Agent senders get role 'assistant'
    role = 'assistant';
  }

  const messageEvent: WorldMessageEvent & { role?: string; tool_calls?: any } = {
    content: finalContent,
    sender,
    role,
    timestamp: new Date(),
    messageId,
    chatId: targetChatId,
    replyToMessageId
  };

  loggerMemory.debug('[publishMessage] Generated messageId', {
    messageId,
    sender,
    role,
    worldId: world.id,
    chatId: targetChatId,
    hasAgentId: !!targetAgentId,
    contentPreview: finalContent.substring(0, 50)
  });

  loggerMemory.debug('[publishMessage] Emitting message event', {
    messageId,
    sender,
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
  const messageEvent: WorldMessageEvent = {
    content,
    sender,
    timestamp: new Date(),
    messageId,
    chatId: targetChatId,
    replyToMessageId
  };
  world.eventEmitter.emit('message', messageEvent);
  return messageEvent;
}

/**
 * Publish a tool result message using structured API
 * Constructs a proper role='tool' message using enhanced string protocol and publishes via publishMessage()
 * 
 * This is the primary API for approval responses and tool results.
 * Uses the __type: 'tool_result' enhanced protocol which is automatically parsed by parseMessageContent()
 * and converted to OpenAI role='tool' format.
 * 
 * @param world - World instance
 * @param agentId - Target agent ID
 * @param data - Tool result data (decision, scope, tool_call_id, etc.)
 * @returns WorldMessageEvent with generated messageId
 * 
 * @example
 * publishToolResult(world, 'assistant-1', {
 *   tool_call_id: 'call_123',
 *   decision: 'approve',
 *   scope: 'session',
 *   toolName: 'shell_cmd',
 *   toolArgs: { command: 'ls -la' },
 *   workingDirectory: '/home/user'
 * });
 */
export function publishToolResult(world: World, agentId: string, data: ToolResultData): WorldMessageEvent {
  const enhancedMessage = JSON.stringify({
    __type: 'tool_result',
    tool_call_id: data.tool_call_id,
    agentId: agentId,
    content: JSON.stringify({
      decision: data.decision,
      scope: data.scope,
      toolName: data.toolName,
      toolArgs: data.toolArgs,
      workingDirectory: data.workingDirectory
    })
  });
  return publishMessage(world, enhancedMessage, 'human');
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
    usage: data.usage,
    logEvent: data.logEvent
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
    toolExecution: data.toolExecution!
  };
  world.eventEmitter.emit('world', toolEvent);
}

/**
 * Publish approval request event
 * Used when a tool requires approval before execution
 * Note: This function is legacy - approval requests now use direct message events
 * with OpenAI tool call protocol (see tool-utils.ts)
 */
export function publishApprovalRequest(world: World, approvalRequest: any, agentId: string, messageId: string): void {
  const approvalEvent = {
    type: 'approval_request',
    agentId,
    messageId,
    approvalRequest,
    timestamp: new Date().toISOString()
  };
  // Emit as approval event for legacy compatibility
  world.eventEmitter.emit('approval', approvalEvent);
  // Note: SSE events are for streaming only, not for tool messages
  // Approval requests should use message events with OpenAI tool call format
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
