/**
 * Unified Events Module - World and Agent Event Functions
 *
 * Purpose: Event-driven message publishing, agent response processing, and memory persistence
 * 
 * Logging: Enable with LOG_EVENTS=debug or specific categories:
 * - LOG_EVENTS_PUBLISH, LOG_EVENTS_AGENT, LOG_EVENTS_RESPONSE, LOG_EVENTS_MEMORY
 * - LOG_EVENTS_AUTOMENTION, LOG_EVENTS_TURNLIMIT, LOG_EVENTS_CHATTITLE
 *
 * Core Features:
 * - Event publishing/subscription via World.eventEmitter with type safety
 * - Agent message filtering with mention detection and turn limits
 * - Auto-mention logic with loop prevention and world tags (<world>STOP|TO:a,b</world>)
 * - Message threading with replyToMessageId preservation
 * - Event persistence with automatic chatId defaulting to world.currentChatId
 * - Tool approval system with session/one-time approval tracking
 * - Chat title generation on world idle events
 *
 * Recent Changes (2025-11):
 * - Fixed approval response broadcast bug: Removed HUMAN check from shouldAutoMention to ensure
 *   agent responses to HUMAN approval messages include proper targeting mentions (@HUMAN),
 *   preventing unintended broadcast to all agents
 * - Consolidated redundant logging and streamlined approval checking
 * - Added tool_calls/tool_call_id persistence for approval messages
 * - Pre-generate message IDs for agent responses
 * - Fixed activity tracking to prevent premature idle signals
 */

import {
  World, Agent, WorldMessageEvent, WorldSSEEvent, WorldToolEvent, WorldSystemEvent, WorldCRUDEvent,
  AgentMessage, MessageData, SenderType, Chat, WorldChat, EventType
} from './types.js';
import { generateId } from './utils.js';
import { generateAgentResponse } from './llm-manager.js';
import { beginWorldActivity } from './activity-tracker.js';
import { type StorageAPI, createStorageWithWrappers } from './storage/storage-factory.js'
import { getWorldTurnLimit, extractMentions, extractParagraphBeginningMentions, determineSenderType, prepareMessagesForLLM } from './utils.js';
import { parseMessageContent } from './message-prep.js';
import { createCategoryLogger } from './logger.js';
import {
  calculateOwnerAgentIds,
  calculateRecipientAgentId,
  calculateIsMemoryOnly,
  calculateIsCrossAgentMessage,
  calculateMessageDirection,
  calculateThreadMetadata
} from './events-metadata.js';
import { createDefaultMessageMetadata } from './storage/eventStorage/validation.js';

// Function-specific loggers for granular debugging control
const loggerPublish = createCategoryLogger('events.publish');
const loggerAgent = createCategoryLogger('events.agent');
const loggerResponse = createCategoryLogger('events.response');
const loggerMemory = createCategoryLogger('events.memory');
const loggerAutoMention = createCategoryLogger('events.automention');
const loggerTurnLimit = createCategoryLogger('events.turnlimit');
const loggerChatTitle = createCategoryLogger('events.chattitle');

// Global streaming control
let globalStreamingEnabled = true;
export function enableStreaming(): void { globalStreamingEnabled = true; }
export function disableStreaming(): void { globalStreamingEnabled = false; }

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



// Storage wrapper instance - initialized lazily
let storageWrappers: StorageAPI | null = null;
async function getStorageWrappers(): Promise<StorageAPI> {
  if (!storageWrappers) {
    storageWrappers = await createStorageWithWrappers();
  }
  return storageWrappers;
}

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
        // Preserve OpenAI protocol fields for tool calls and approvals
        role: (event as any).role,
        tool_calls: (event as any).tool_calls,
        tool_call_id: (event as any).tool_call_id
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

        // Tool Approval
        requiresApproval: (event as any).requiresApproval || false,
        approvalScope: null, // Set when approval is granted
        approvedAt: null,
        approvedBy: null,
        deniedAt: null,
        denialReason: null,

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

  // SSE event handler - persist only start and end events
  const sseHandler = (event: WorldSSEEvent): void | Promise<void> => {
    // Only persist start and end events, not chunk events
    if (event.type !== 'start' && event.type !== 'end') {
      return;
    }

    // Make ID unique by combining messageId with event type
    const eventData = {
      id: `${event.messageId}-sse-${event.type}`,
      worldId: world.id,
      chatId: world.currentChatId || null, // Default to current chat
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
  // Handles both WorldToolEvent (tool execution) and WorldActivityEventPayload (activity tracking)
  const toolHandler = (event: any): void | Promise<void> => {
    // Check if this is an activity event or tool event
    const isActivityEvent = event.type && ['response-start', 'response-end', 'idle'].includes(event.type);

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
        toolType: event.type
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

  // Parse enhanced string protocol to extract targetAgentId
  const { targetAgentId } = parseMessageContent(content, 'user');

  // Prepend @mention if agentId is present in enhanced protocol
  let finalContent = content;
  if (targetAgentId) {
    finalContent = `@${targetAgentId}, ${content}`;
    loggerMemory.debug('[publishMessage] Prepended @mention from enhanced protocol', {
      agentId: targetAgentId,
      messageId
    });
  }

  const messageEvent: WorldMessageEvent = {
    content: finalContent,
    sender,
    timestamp: new Date(),
    messageId,
    chatId: targetChatId,
    replyToMessageId
  };

  loggerMemory.debug('[publishMessage] Generated messageId', {
    messageId,
    sender,
    worldId: world.id,
    chatId: targetChatId,
    hasAgentId: !!targetAgentId,
    contentPreview: finalContent.substring(0, 50)
  });

  world.eventEmitter.emit('message', messageEvent);
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

export function subscribeToMessages(
  world: World,
  handler: (event: WorldMessageEvent) => void
): () => void {
  world.eventEmitter.on('message', handler);
  return () => world.eventEmitter.off('message', handler);
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

// Check if response has any mention at paragraph beginning (prevents auto-mention loops)
export function hasAnyMentionAtBeginning(response: string): boolean {
  if (!response?.trim()) return false;
  const result = extractParagraphBeginningMentions(response).length > 0;
  loggerAutoMention.debug('Checking for mentions at beginning', { response: response.substring(0, 100), hasMentions: result });
  return result;
}

// Remove all mentions from paragraph beginnings (including commas and spaces)
export function removeMentionsFromParagraphBeginnings(text: string, specificMention?: string): string {
  if (!text?.trim()) return text;

  const lines = text.split('\n');
  const processedLines = lines.map(line => {
    const trimmed = line.trimStart();
    let cleaned = trimmed;

    if (specificMention) {
      // For specific mentions, escape special regex characters and handle consecutive mentions
      const escapedMention = specificMention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Pattern to match @mention followed by optional comma/space combinations
      const mentionPattern = new RegExp(`^@${escapedMention}(?:[,\\s]+|$)`, 'gi');

      // Keep removing mentions from the beginning until no more are found
      while (mentionPattern.test(cleaned)) {
        cleaned = cleaned.replace(mentionPattern, '');
        mentionPattern.lastIndex = 0; // Reset regex for next iteration
      }
    } else {
      // For any mentions
      const mentionPattern = /^@\w+(?:[-_]\w+)*(?:[,\s]+|$)/;

      // Keep removing mentions from the beginning until no more are found
      while (mentionPattern.test(cleaned)) {
        cleaned = cleaned.replace(mentionPattern, '');
      }
    }

    const leadingWhitespace = line.match(/^(\s*)/)?.[1] || '';
    return leadingWhitespace + cleaned;
  });

  return processedLines.join('\n');
}

// Add auto-mention at beginning if no existing mentions (prevents loops)
// Supports world tags: <world>STOP|DONE|PASS</world> and <world>TO: a,b,c</world>
export function addAutoMention(response: string, sender: string): string {
  if (!response?.trim() || !sender) {
    return response;
  }

  loggerAutoMention.debug('Processing auto-mention', { sender, responseStart: response.substring(0, 100) });

  // Consolidated regex patterns for world tags (case insensitive)
  const worldTagPattern = /<world>(STOP|DONE|PASS|TO:\s*([^<]*))<\/world>/gi;
  let match;
  let processedResponse = response;

  while ((match = worldTagPattern.exec(response)) !== null) {
    const [fullMatch, action, toRecipients] = match;
    loggerAutoMention.debug('Found world tag', { action, toRecipients, fullMatch });

    // Remove the world tag from response
    processedResponse = processedResponse.replace(fullMatch, '');

    const upperAction = action.toUpperCase();
    if (upperAction === 'STOP' || upperAction === 'DONE' || upperAction === 'PASS') {
      // Stop tags prevent auto-mention and remove ALL mentions at beginning of paragraphs
      loggerAutoMention.debug('Processing STOP/DONE/PASS tag - removing mentions');
      const cleanResponse = processedResponse.trim();
      return removeMentionsFromParagraphBeginnings(cleanResponse).trim();
    } else if (upperAction.startsWith('TO:')) {
      // TO tag with recipients - also remove existing mentions
      const recipients = toRecipients?.split(',').map(name => name.trim()).filter(name => name) || [];
      loggerAutoMention.debug('Processing TO tag', { recipients });

      // Remove existing mentions from the response
      const cleanResponse = removeMentionsFromParagraphBeginnings(processedResponse.trim()).trim();

      if (recipients.length > 0) {
        const mentions = recipients.map(recipient => `@${recipient}`).join('\n');
        const result = `${mentions}\n\n${cleanResponse}`;
        loggerAutoMention.debug('Added TO tag mentions', { mentions, result: result.substring(0, 100) });
        return result;
      } else {
        // Empty TO tag - fall back to normal auto-mention behavior
        loggerAutoMention.debug('Empty TO tag - falling back to normal auto-mention');
        if (hasAnyMentionAtBeginning(cleanResponse)) {
          return cleanResponse;
        }
        return `@${sender} ${cleanResponse}`;
      }
    }
  }  // Existing logic: add auto-mention if no existing mentions at beginning
  if (hasAnyMentionAtBeginning(processedResponse)) {
    loggerAutoMention.debug('Response already has mentions at beginning - no auto-mention needed');
    return processedResponse;
  }

  const result = `@${sender} ${processedResponse.trim()}`;
  loggerAutoMention.debug('Added auto-mention', { sender, result: result.substring(0, 100) });
  return result;
}

// Get valid mentions excluding self-mentions (case-insensitive)
export function getValidMentions(response: string, agentId: string): string[] {
  if (!response?.trim() || !agentId) return [];
  return extractParagraphBeginningMentions(response)
    .filter(mention => mention.toLowerCase() !== agentId.toLowerCase());
}

// Determine if agent should auto-mention sender (no valid mentions in response)
// Auto-mention is used to target responses and prevent unintended broadcasting
export function shouldAutoMention(response: string, sender: string, agentId: string): boolean {
  if (!response?.trim() || !sender || !agentId) return false;
  if (determineSenderType(sender) === SenderType.HUMAN) return false;
  if (sender.toLowerCase() === agentId.toLowerCase()) return false;
  // Check if response already has valid mentions (excluding self)
  return getValidMentions(response, agentId).length === 0;
}

// Remove consecutive self-mentions from response beginning (case-insensitive)
export function removeSelfMentions(response: string, agentId: string): string {
  if (!response || !agentId) return response;

  const trimmedResponse = response.trim();
  if (!trimmedResponse) return response;

  loggerAutoMention.debug('Removing self-mentions', { agentId, responseStart: response.substring(0, 100) });

  // Use the helper function to remove self-mentions
  const result = removeMentionsFromParagraphBeginnings(trimmedResponse, agentId);

  loggerAutoMention.debug('Self-mention removal result', {
    agentId,
    before: trimmedResponse.substring(0, 100),
    after: result.substring(0, 100),
    changed: trimmedResponse !== result
  });

  // Preserve original leading whitespace
  const originalMatch = response.match(/^(\s*)/);
  const originalLeadingWhitespace = originalMatch ? originalMatch[1] : '';
  return originalLeadingWhitespace + result;
}/**
 * Agent subscription with automatic message processing
 */
export function subscribeAgentToMessages(world: World, agent: Agent): () => void {
  const handler = async (messageEvent: WorldMessageEvent) => {
    loggerAgent.debug('Agent received message', {
      agentId: agent.id,
      sender: messageEvent.sender,
      messageId: messageEvent.messageId
    });

    if (!messageEvent.messageId) {
      loggerAgent.error('Received message WITHOUT messageId', {
        agentId: agent.id,
        sender: messageEvent.sender,
        worldId: world.id
      });
    }

    // Check if this is an assistant message with tool_calls (approval request)
    // These need to be saved to agent memory even though they're from the agent
    const messageData = messageEvent as any;
    if (messageData.role === 'assistant' && messageData.tool_calls && messageEvent.sender === agent.id) {
      loggerMemory.debug('Saving approval request to agent memory', {
        agentId: agent.id,
        messageId: messageEvent.messageId,
        toolCalls: messageData.tool_calls.length
      });

      const approvalMessage: AgentMessage = {
        role: 'assistant',
        content: messageEvent.content || '',
        sender: agent.id,
        createdAt: messageEvent.timestamp,
        chatId: world.currentChatId || null,
        messageId: messageEvent.messageId,
        replyToMessageId: messageData.replyToMessageId,
        tool_calls: messageData.tool_calls,
        agentId: agent.id
      };

      agent.memory.push(approvalMessage);

      // Auto-save agent memory
      try {
        const storage = await getStorageWrappers();
        await storage.saveAgent(world.id, agent);
        loggerMemory.debug('Approval request saved to agent memory', {
          agentId: agent.id,
          messageId: messageEvent.messageId
        });
      } catch (error) {
        loggerMemory.error('Failed to save approval request to memory', {
          agentId: agent.id,
          error: error instanceof Error ? error.message : error
        });
      }

      return; // Don't process this message further
    }

    // Check if this is a tool result message (approval response)
    // These need to be saved to agent memory for persistence
    if (messageData.role === 'tool' && messageData.tool_call_id) {
      loggerMemory.debug('Saving approval response to agent memory', {
        agentId: agent.id,
        messageId: messageEvent.messageId,
        toolCallId: messageData.tool_call_id
      });

      const approvalResponse: AgentMessage = {
        role: 'tool',
        content: messageEvent.content || '',
        sender: messageEvent.sender || 'system',
        createdAt: messageEvent.timestamp,
        chatId: world.currentChatId || null,
        messageId: messageEvent.messageId,
        tool_call_id: messageData.tool_call_id,
        agentId: agent.id
      };

      agent.memory.push(approvalResponse);

      // Auto-save agent memory
      try {
        const storage = await getStorageWrappers();
        await storage.saveAgent(world.id, agent);
        loggerMemory.debug('Approval response saved to agent memory', {
          agentId: agent.id,
          messageId: messageEvent.messageId
        });
      } catch (error) {
        loggerMemory.error('Failed to save approval response to memory', {
          agentId: agent.id,
          error: error instanceof Error ? error.message : error
        });
      }

      return; // Don't process this message further
    }

    // Skip messages from this agent itself
    if (messageEvent.sender === agent.id) {
      loggerAgent.debug('Skipping own message in handler', { agentId: agent.id, sender: messageEvent.sender });
      return;
    }

    // Reset LLM call count if needed (for human/system messages)
    await resetLLMCallCountIfNeeded(world, agent, messageEvent);

    // Process message if agent should respond
    loggerResponse.debug('Checking if agent should respond', { agentId: agent.id, sender: messageEvent.sender });
    const shouldRespond = await shouldAgentRespond(world, agent, messageEvent);

    if (shouldRespond) {
      // Save incoming messages to agent memory only when they plan to respond
      await saveIncomingMessageToMemory(world, agent, messageEvent);

      loggerAgent.debug('Agent will respond - processing message', { agentId: agent.id, sender: messageEvent.sender });
      await processAgentMessage(world, agent, messageEvent);
    } else {
      loggerAgent.debug('Agent will NOT respond - skipping memory save and SSE publishing', {
        agentId: agent.id,
        sender: messageEvent.sender
      });
    }
  };

  return subscribeToMessages(world, handler);
}

/**
 * Save incoming message to agent memory with auto-save
 */
export async function saveIncomingMessageToMemory(
  world: World,
  agent: Agent,
  messageEvent: WorldMessageEvent
): Promise<void> {
  try {
    if (messageEvent.sender?.toLowerCase() === agent.id.toLowerCase()) return;

    if (!messageEvent.messageId) {
      loggerMemory.error('Message missing messageId', {
        agentId: agent.id,
        sender: messageEvent.sender,
        worldId: world.id
      });
    }

    if (!world.currentChatId) {
      loggerMemory.warn('Saving message without chatId', {
        agentId: agent.id,
        messageId: messageEvent.messageId
      });
    }

    // Parse message content to detect enhanced format (e.g., tool results)
    const { message: parsedMessage } = parseMessageContent(messageEvent.content, 'user');

    const userMessage: AgentMessage = {
      ...parsedMessage,
      sender: messageEvent.sender,
      createdAt: messageEvent.timestamp,
      chatId: world.currentChatId || null,
      messageId: messageEvent.messageId,
      replyToMessageId: messageEvent.replyToMessageId,
      agentId: agent.id
    };

    agent.memory.push(userMessage);

    try {
      const storage = await getStorageWrappers();
      await storage.saveAgent(world.id, agent);
      loggerMemory.debug('Agent saved successfully', {
        agentId: agent.id,
        messageId: messageEvent.messageId
      });
    } catch (error) {
      loggerMemory.error('Failed to auto-save memory', { agentId: agent.id, error: error instanceof Error ? error.message : error });
    }
  } catch (error) {
    loggerMemory.error('Could not save incoming message to memory', { agentId: agent.id, error: error instanceof Error ? error.message : error });
  }
}

/**
 * Agent message processing with LLM response generation and auto-mention logic
 */
export async function processAgentMessage(
  world: World,
  agent: Agent,
  messageEvent: WorldMessageEvent
): Promise<void> {
  const completeActivity = beginWorldActivity(world, `agent:${agent.id}`);
  try {
    // Load conversation history from storage for current chat (last 10 messages)
    // NOTE: Don't save incoming message yet to avoid duplication in prepareMessagesForLLM
    let conversationHistory: AgentMessage[] = [];
    try {
      const storage = await getStorageWrappers();
      const allMessages = await storage.getMemory(world.id, world.currentChatId);
      conversationHistory = allMessages.slice(-10); // Get last 10 messages for current chat
    } catch (error) {
      loggerMemory.error('Could not load conversation history from storage', { agentId: agent.id, chatId: world.currentChatId, error: error instanceof Error ? error.message : error });
    }

    // Prepare messages for LLM with history + current message
    const messageData: MessageData = {
      id: messageEvent.messageId || generateId(),
      name: 'message',
      sender: messageEvent.sender,
      content: messageEvent.content,
      payload: {}
    };
    const messages = prepareMessagesForLLM(agent, messageData, conversationHistory);

    // Note: Incoming message already saved in subscribeAgentToMessages handler

    // Increment LLM call count and save agent state
    agent.llmCallCount++;
    agent.lastLLMCall = new Date();

    try {
      const storage = await getStorageWrappers();
      await storage.saveAgent(world.id, agent);
    } catch (error) {
      loggerAgent.error('Failed to auto-save agent after LLM call increment', { agentId: agent.id, error: error instanceof Error ? error.message : error });
    }

    // Generate LLM response (streaming or non-streaming)
    let response: string;
    let messageId: string;

    if (globalStreamingEnabled) {
      const { streamAgentResponse } = await import('./llm-manager.js');
      const result = await streamAgentResponse(world, agent, messages, publishSSE);
      response = result.response;
      messageId = result.messageId; // Use the same messageId from streaming
    } else {
      const { generateAgentResponse } = await import('./llm-manager.js');
      response = await generateAgentResponse(world, agent, messages);
      messageId = generateId(); // Generate new ID for non-streaming
    }

    if (!response) {
      // Empty response could mean approval request was sent or actual error
      // For approval requests, this is normal behavior - just return silently
      loggerAgent.debug('LLM response is empty - could be approval request or error', { agentId: agent.id });
      return;
    }

    // Process auto-mention logic: remove self-mentions, then add auto-mention if needed
    let finalResponse = removeSelfMentions(response, agent.id);
    if (shouldAutoMention(finalResponse, messageEvent.sender, agent.id)) {
      finalResponse = addAutoMention(finalResponse, messageEvent.sender);
    }

    if (!messageEvent.messageId) {
      loggerMemory.error('messageEvent.messageId required for threading', {
        agentId: agent.id,
        sender: messageEvent.sender
      });
    }

    // Save final response to memory with pre-generated ID and parent link
    const assistantMessage: AgentMessage = {
      role: 'assistant',
      content: finalResponse,
      createdAt: new Date(),
      chatId: world.currentChatId || null,
      messageId: messageId,
      replyToMessageId: messageEvent.messageId, // Link to message we're replying to
      sender: agent.id, // Add sender field for consistency
      agentId: agent.id
    };

    // Validate threading before saving
    try {
      const { validateMessageThreading } = await import('./types.js');
      const validationContext = [...agent.memory, assistantMessage];
      validateMessageThreading(assistantMessage, validationContext);
    } catch (error) {
      loggerMemory.error('Threading validation failed', {
        agentId: agent.id,
        messageId: assistantMessage.messageId,
        error: error instanceof Error ? error.message : error
      });

      // Clear threading for critical errors (self-reference, circular, depth exceeded)
      if (error instanceof Error &&
        (error.message.includes('cannot reply to itself') ||
          error.message.includes('Circular reference detected') ||
          error.message.includes('Thread depth exceeds maximum'))) {
        loggerMemory.warn('Clearing threading due to critical error', {
          agentId: agent.id,
          error: error.message
        });
        assistantMessage.replyToMessageId = undefined;
      }
    }

    agent.memory.push(assistantMessage);

    // Publish final response with pre-generated messageId and threading info
    if (finalResponse && typeof finalResponse === 'string') {
      publishMessageWithId(world, finalResponse, agent.id, messageId, world.currentChatId, messageEvent.messageId);
    }

    // Auto-save memory after adding response (now with correct messageId)
    try {
      const storage = await getStorageWrappers();
      await storage.saveAgent(world.id, agent);
    } catch (error) {
      loggerMemory.error('Failed to auto-save memory after response', { agentId: agent.id, error: error instanceof Error ? error.message : error });
    }

  } catch (error) {
    loggerAgent.error('Agent failed to process message', { agentId: agent.id, error: error instanceof Error ? error.message : error });
    publishEvent(world, 'system', { message: `[Error] ${(error as Error).message}`, type: 'error' });
  }
  finally {
    completeActivity();
  }
}

/**
 * Reset LLM call count for human/world messages with persistence
 */
export async function resetLLMCallCountIfNeeded(
  world: World,
  agent: Agent,
  messageEvent: WorldMessageEvent
): Promise<void> {
  const senderType = determineSenderType(messageEvent.sender);

  if ((senderType === SenderType.HUMAN || senderType === SenderType.WORLD) && agent.llmCallCount > 0) {
    loggerTurnLimit.debug('Resetting LLM call count', { agentId: agent.id, oldCount: agent.llmCallCount });
    agent.llmCallCount = 0;

    try {
      const storage = await getStorageWrappers();
      await storage.saveAgent(world.id, agent);
    } catch (error) {
      loggerTurnLimit.warn('Failed to auto-save agent after turn limit reset', { agentId: agent.id, error: error instanceof Error ? error.message : error });
    }
  }
}

/**
 * Enhanced message filtering logic with turn limits and mention detection
 */
export async function shouldAgentRespond(world: World, agent: Agent, messageEvent: WorldMessageEvent): Promise<boolean> {
  // Never respond to own messages
  if (messageEvent.sender?.toLowerCase() === agent.id.toLowerCase()) {
    loggerResponse.debug('Skipping own message', { agentId: agent.id, sender: messageEvent.sender });
    return false;
  }

  const content = messageEvent.content || '';

  // Never respond to turn limit messages (prevents endless loops)
  if (content.includes('Turn limit reached')) {
    loggerTurnLimit.debug('Skipping turn limit message', { agentId: agent.id });
    return false;
  }

  // Check turn limit based on LLM call count
  const worldTurnLimit = getWorldTurnLimit(world);
  loggerTurnLimit.debug('Checking turn limit', { agentId: agent.id, llmCallCount: agent.llmCallCount, worldTurnLimit });

  if (agent.llmCallCount >= worldTurnLimit) {
    loggerTurnLimit.debug('Turn limit reached, sending turn limit message', { agentId: agent.id, llmCallCount: agent.llmCallCount, worldTurnLimit });
    const turnLimitMessage = `@human Turn limit reached (${worldTurnLimit} LLM calls). Please take control of the conversation.`;
    publishMessage(world, turnLimitMessage, agent.id);
    return false;
  }

  // Determine sender type for message handling logic
  const senderType = determineSenderType(messageEvent.sender);
  loggerResponse.debug('Determined sender type', { agentId: agent.id, sender: messageEvent.sender, senderType });

  // Never respond to system messages
  if (messageEvent.sender === 'system') {
    loggerResponse.debug('Skipping system message', { agentId: agent.id });
    return false;
  }

  // Always respond to world messages
  if (messageEvent.sender === 'world') {
    loggerResponse.debug('Responding to world message', { agentId: agent.id });
    return true;
  }

  const anyMentions = extractMentions(messageEvent.content);
  const mentions = extractParagraphBeginningMentions(messageEvent.content);
  loggerResponse.debug('Extracted mentions', { mentions, anyMentions });

  // For HUMAN messages
  if (senderType === SenderType.HUMAN) {
    if (mentions.length === 0) {
      if (anyMentions.length > 0) {
        loggerResponse.debug('Mentions exist but not at paragraph beginning', { agentId: agent.id });
        return false;
      }
      loggerResponse.debug('No mentions - public message', { agentId: agent.id });
      return true;
    }
    const shouldRespond = mentions.includes(agent.id.toLowerCase());
    loggerResponse.debug('HUMAN message mention check', { agentId: agent.id, shouldRespond });
    return shouldRespond;
  }

  // For agent messages, only respond if this agent has a paragraph-beginning mention
  const shouldRespond = mentions.includes(agent.id.toLowerCase());
  loggerResponse.debug('AGENT message mention check', { agentId: agent.id, shouldRespond });
  return shouldRespond;
}

/**
 * Subscribe world to messages with cleanup function
 */
export function subscribeWorldToMessages(world: World): () => void {
  return subscribeToMessages(world, async (_event: WorldMessageEvent) => {
    // No-op - title updates handled by setupWorldActivityListener on idle
  });
}

/**
 * Setup world activity listener for chat title updates
 * Triggers title generation when world becomes idle (pendingOperations === 0)
 */
export function setupWorldActivityListener(world: World): () => void {
  const handler = async (event: any) => {
    // Only update title when world becomes idle (all agents done)
    if (event.type === 'idle' && event.pendingOperations === 0) {
      try {
        if (!world.currentChatId) return;
        const chat = world.chats.get(world.currentChatId);
        if (!chat) return;
        // Only update if still default title
        if (chat.name === 'New Chat') {
          const title = await generateChatTitleFromMessages(world, '');
          if (title) {
            chat.name = title;
            const storage = await getStorageWrappers();
            await storage.updateChatData(world.id, world.currentChatId, { name: title });
            publishEvent(world, 'system', `chat-title-updated`);
          }
        }
      } catch (err) {
        loggerChatTitle.warn('Activity-based title update failed', { error: err instanceof Error ? err.message : err });
      }
    }
  };

  world.eventEmitter.on('world', handler);
  return () => world.eventEmitter.off('world', handler);
}

/**
 * Generate chat title from message content with LLM support and fallback
 */
async function generateChatTitleFromMessages(world: World, content: string): Promise<string> {
  loggerChatTitle.debug('Generating chat title', { worldId: world.id, contentStart: content.substring(0, 50) });

  let title = '';
  let messages: any[] = [];

  const maxLength = 100; // Max title length

  try {
    const firstAgent = Array.from(world.agents.values())[0];

    const storage = await getStorageWrappers();
    // Load messages for current chat only, not all messages
    messages = await storage.getMemory(world.id, world.currentChatId);
    if (content) messages.push({ role: 'user', content });

    loggerChatTitle.debug('Calling LLM for title generation', {
      messageCount: messages.length,
      provider: world.chatLLMProvider || firstAgent?.provider,
      model: world.chatLLMModel || firstAgent?.model
    });

    const tempAgent: any = {
      provider: world.chatLLMProvider || firstAgent?.provider || 'openai',
      model: world.chatLLMModel || firstAgent?.model || 'gpt-4',
      systemPrompt: 'You are a helpful assistant that turns conversations into concise titles.',
      maxTokens: 20,
    };

    const userPrompt = {
      role: 'user' as const,
      content: `Below is a conversation between a user and an assistant. Generate a short, punchy title (3–6 words) that captures its main topic.

${messages.filter(msg => msg.role !== 'tool').map(msg => `-${msg.role}: ${msg.content}`).join('\n')}
      `
    };

    title = await generateAgentResponse(world, tempAgent, [userPrompt], undefined, true); // skipTools = true for title generation
    loggerChatTitle.debug('LLM generated title', { rawTitle: title });

  } catch (error) {
    loggerChatTitle.warn('Failed to generate LLM title, using fallback', {
      error: error instanceof Error ? error.message : error
    });
  }

  if (!title) {
    // Fallback: use content if provided, otherwise extract from first user message
    title = content.trim();
    if (!title && messages?.length > 0) {
      const firstUserMsg = messages.find((msg: any) => msg.role === 'user');
      title = firstUserMsg?.content?.substring(0, 50) || 'Chat';
    }
    if (!title) title = 'Chat';
  }

  title = title.trim().replace(/^["']|["']$/g, ''); // Remove quotes
  title = title.replace(/[\n\r\*]+/g, ' '); // Replace newlines with spaces
  title = title.replace(/\s+/g, ' '); // Normalize whitespace

  // Truncate if too long
  if (title.length > maxLength) {
    title = title.substring(0, maxLength - 3) + '...';
  }

  loggerChatTitle.debug('Final processed title', { title, originalLength: title.length });

  return title;
}

/**
 * Check if a specific tool requires approval based on message history
 * This replaces the keyword-based heuristic approach with actual tool execution checking
 */
export async function checkToolApproval(
  world: World,
  toolName: string,
  toolArgs: any,
  message: string,
  messages: AgentMessage[]
): Promise<{
  needsApproval: boolean;
  canExecute: boolean;
  approvalRequest?: any;
  reason?: string;
}> {
  try {
    // Check for session-wide approval first
    const sessionApproval = findSessionApproval(messages, toolName);
    if (sessionApproval) {
      return {
        needsApproval: false,
        canExecute: true
      };
    }

    // Check for recent denial
    const recentDenial = findRecentDenial(messages, toolName);
    if (recentDenial) {
      return {
        needsApproval: false,
        canExecute: false,
        reason: 'Tool execution was recently denied'
      };
    }

    // Check for recent one-time approval
    const recentApproval = findRecentApproval(messages, toolName);
    if (recentApproval) {
      return {
        needsApproval: false,
        canExecute: true
      };
    }

    // No approval found - need to request approval
    return {
      needsApproval: true,
      canExecute: false,
      approvalRequest: {
        toolName,
        toolArgs,
        message,
        requestId: `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        options: ['deny', 'approve_once', 'approve_session']
      }
    };
  } catch (error) {
    loggerAgent.error('Error checking tool approval', {
      toolName,
      error: error instanceof Error ? error.message : error
    });
    return {
      needsApproval: true,
      canExecute: false,
      approvalRequest: {
        toolName,
        toolArgs,
        message,
        requestId: `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        options: ['deny', 'approve_once', 'approve_session']
      }
    };
  }
}

/**
 * Find session-wide approval for a tool in message history
 * @deprecated Use enhanced string protocol with tool results instead of text parsing
 */
export function findSessionApproval(messages: AgentMessage[], toolName: string): { decision: 'approve' | 'deny'; scope: 'session'; toolName: string } | undefined {
  loggerMemory.warn('DEPRECATED: findSessionApproval() uses text parsing. Migrate to enhanced string protocol with __type: "tool_result"', {
    toolName,
    hint: 'Send JSON.stringify({__type:"tool_result",tool_call_id:"...",content:"..."})'
  });

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.content && typeof msg.content === 'string') {
      const content = msg.content.toLowerCase();
      if ((content.includes('approve') && content.includes(toolName.toLowerCase()) && content.includes('session')) ||
        (content.includes(`approve_session`) && content.includes(toolName.toLowerCase()))) {
        return { decision: 'approve', scope: 'session', toolName };
      }
    }
  }
  return undefined;
}

/**
 * Find recent one-time approval for a tool in message history (within 5 minutes)
 * Also checks if the approval has been "consumed" by a subsequent tool execution
 * @deprecated Use enhanced string protocol with tool results instead of text parsing
 */
export function findRecentApproval(messages: AgentMessage[], toolName: string): { decision: 'approve' | 'deny'; scope: 'once'; toolName: string } | undefined {
  loggerMemory.warn('DEPRECATED: findRecentApproval() uses text parsing. Migrate to enhanced string protocol with __type: "tool_result"', {
    toolName,
    hint: 'Send JSON.stringify({__type:"tool_result",tool_call_id:"...",content:"..."})'
  });

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  let approvalIndex = -1;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.createdAt && msg.createdAt < fiveMinutesAgo) break;

    if (msg.content && typeof msg.content === 'string') {
      const content = msg.content.toLowerCase();
      if ((content.includes('approve') && content.includes(toolName.toLowerCase()) &&
        (content.includes('once') || (!content.includes('session')))) ||
        (content.includes(`approve_once`) && content.includes(toolName.toLowerCase()))) {
        approvalIndex = i;
        break;
      }
    }
  }

  if (approvalIndex === -1) return undefined;

  // Check if approval has been consumed by subsequent tool execution
  for (let i = approvalIndex + 1; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.content && typeof msg.content === 'string') {
      const content = msg.content.toLowerCase();
      if ((content.includes('tool') && content.includes(toolName.toLowerCase()) &&
        (content.includes('executed') || content.includes('completed') || content.includes('finished'))) ||
        (content.includes(toolName.toLowerCase()) && content.includes('successfully'))) {
        return undefined;
      }
    }
  }

  return { decision: 'approve', scope: 'once', toolName };
}

/**
 * Find recent denial for a tool in message history (within 5 minutes)
 */
export function findRecentDenial(messages: AgentMessage[], toolName: string): { decision: 'deny'; toolName: string } | undefined {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  // Look for recent denial
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.createdAt && msg.createdAt < fiveMinutesAgo) {
      break; // Stop if we've gone back more than 5 minutes
    }

    if (msg.content && typeof msg.content === 'string') {
      const content = msg.content.toLowerCase();
      if (content.includes('deny') && content.includes(toolName.toLowerCase())) {
        return { decision: 'deny', toolName };
      }
    }
  }
  return undefined;
}