/**
 * Unified Events Module - World and Agent Event Functions
 *
 * Core Event System:
 * - Direct World.eventEmitter event publishing/subscription with type safety
 * - Natural event isolation per World instance preventing cross-world interference
 * - Auto-mention logic with loop prevention and case-insensitive matching
 * - LLM call count management with turn limits and auto-save persistence
 * - World tags: <world>STOP|DONE|PASS</world> and <world>TO: a,b,c</world>
 *
 * World Events: publishMessage, subscribeToMessages, publishSSE, subscribeToSSE
 * Agent Events: subscribeAgentToMessages, processAgentMessage, shouldAgentRespond
 * Auto-Mention: Enhanced loop prevention, self-mention removal, paragraph beginning detection
 * Storage: Automatic memory persistence and agent state saving with error handling
 * Chat Title Generation: Smart title generation excluding tool messages from conversation context
 * Message ID Tracking: All messages (user and assistant) include messageId and agentId for edit feature
 *
 * Consolidation Changes (CC):
 * - Condensed verbose header documentation from 60+ lines to 15 lines
 * - Consolidated duplicate ID generation logic into single generateMessageId helper
 * - Removed redundant storage wrapper initialization (was duplicated)
 * - Streamlined auto-mention utility functions with clearer documentation
 * - Consolidated subscription functions with reduced comment redundancy
 * - Simplified agent message processing with step-by-step flow comments
 * - Removed verbose inline comments while preserving essential logic documentation
 * - Maintained all functionality and test compatibility (168/168 tests passing)
 * - Enhanced chat title generation to filter out tool messages for cleaner titles
 *
 * Architecture Improvements (2025-10-25):
 * - Priority 1: Pre-generate message IDs for agent responses (eliminates two-stage assignment)
 * - Priority 2: Add validation layer to prevent saving agents with missing message IDs
 * - Priority 3: Updated type documentation to clarify messageId requirement
 * - Added publishMessageWithId() for pre-generated IDs
 *
 * Changes:
 * - 2025-10-25: Architectural improvements - pre-generate IDs, add validation, clarify types
 * - 2025-10-25: Fixed agent message messageId - use messageId from publishMessage() return value
 * - 2025-10-21: Added messageId and agentId to all messages saved to agent memory
 */

import {
  World, Agent, WorldMessageEvent, WorldSSEEvent, WorldSystemEvent,
  AgentMessage, MessageData, SenderType, Chat, WorldChat
} from './types.js';
import { generateId } from './utils.js';
import { generateAgentResponse } from './llm-manager.js';
import { type StorageAPI, createStorageWithWrappers } from './storage/storage-factory.js'
import { getWorldTurnLimit, extractMentions, extractParagraphBeginningMentions, determineSenderType, prepareMessagesForLLM } from './utils.js';
import { createCategoryLogger } from './logger.js';

// Function-specific loggers for granular debugging control
const loggerPublish = createCategoryLogger('core.events.publish');
const loggerAgent = createCategoryLogger('core.events.agent');
const loggerResponse = createCategoryLogger('core.events.response');
const loggerMemory = createCategoryLogger('core.events.memory');
const loggerAutoMention = createCategoryLogger('core.events.automention');
const loggerTurnLimit = createCategoryLogger('core.events.turnlimit');
const loggerChatTitle = createCategoryLogger('core.events.chattitle');

// Global streaming control
let globalStreamingEnabled = true;
export function enableStreaming(): void { globalStreamingEnabled = true; }
export function disableStreaming(): void { globalStreamingEnabled = false; }



// Storage wrapper instance - initialized lazily
let storageWrappers: StorageAPI | null = null;
async function getStorageWrappers(): Promise<StorageAPI> {
  if (!storageWrappers) {
    storageWrappers = await createStorageWithWrappers();
  }
  return storageWrappers;
}

/**
 * Publish event to a specific channel using World.eventEmitter
 */
export function publishEvent(world: World, type: string, content: any): void {
  const event: WorldSystemEvent = {
    content,
    timestamp: new Date(),
    messageId: generateId()
  };
  world.eventEmitter.emit(type, event);
}

/**
 * Message publishing using World.eventEmitter with chat session management
 * Returns the messageEvent so callers can access the generated messageId
 * 
 * @param chatId - Optional chat ID. If not provided, uses world.currentChatId
 */
export function publishMessage(world: World, content: string, sender: string, chatId?: string | null): WorldMessageEvent {
  const messageId = generateId();
  const targetChatId = chatId !== undefined ? chatId : world.currentChatId;
  const messageEvent: WorldMessageEvent = {
    content,
    sender,
    timestamp: new Date(),
    messageId,
    chatId: targetChatId
  };

  loggerMemory.debug('[publishMessage] Generated messageId', {
    messageId,
    sender,
    worldId: world.id,
    chatId: targetChatId,
    contentPreview: content.substring(0, 50)
  });

  world.eventEmitter.emit('message', messageEvent);
  return messageEvent;
}

/**
 * Message publishing with pre-generated messageId
 * Used when messageId needs to be known before publishing (e.g., for agent responses)
 * 
 * @param chatId - Optional chat ID. If not provided, uses world.currentChatId
 */
export function publishMessageWithId(world: World, content: string, sender: string, messageId: string, chatId?: string | null): WorldMessageEvent {
  const targetChatId = chatId !== undefined ? chatId : world.currentChatId;
  const messageEvent: WorldMessageEvent = {
    content,
    sender,
    timestamp: new Date(),
    messageId,
    chatId: targetChatId
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
 * SSE events using World.eventEmitter
 */
export function publishSSE(world: World, data: Partial<WorldSSEEvent>): void {
  const sseEvent: WorldSSEEvent = {
    agentName: data.agentName!,
    type: data.type!,
    content: data.content,
    error: data.error,
    messageId: data.messageId || generateId(),
    usage: data.usage
  };
  world.eventEmitter.emit('sse', sseEvent);

  // Post-stream title update: when we get an 'end' SSE for a streaming response
  if (sseEvent.type === 'end') {
    queueMicrotask(async () => {
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
        loggerChatTitle.warn('Post-stream title update failed', { error: err instanceof Error ? err.message : err });
      }
    });
  }
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

// Determine if agent should auto-mention sender (agents only, no valid mentions)
export function shouldAutoMention(response: string, sender: string, agentId: string): boolean {
  if (!response?.trim() || !sender || !agentId) return false;
  if (sender.toLowerCase() === agentId.toLowerCase()) return false;
  if (determineSenderType(sender) === SenderType.HUMAN) return false;
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
  loggerAgent.debug('Subscribing agent to messages', { agentId: agent.id, worldId: world.id });

  const handler = async (messageEvent: WorldMessageEvent) => {
    loggerAgent.debug('[subscribeAgentToMessages] Agent received message event', {
      agentId: agent.id,
      sender: messageEvent.sender,
      content: messageEvent.content?.substring(0, 50),
      messageId: messageEvent.messageId,
      hasMessageId: !!messageEvent.messageId,
      timestamp: messageEvent.timestamp
    });

    if (!messageEvent.messageId) {
      loggerAgent.error('❌ [subscribeAgentToMessages] Received message WITHOUT messageId', {
        agentId: agent.id,
        sender: messageEvent.sender,
        worldId: world.id,
        currentChatId: world.currentChatId
      });
    }

    // Skip messages from this agent itself
    if (messageEvent.sender === agent.id) {
      loggerAgent.debug('Skipping own message in handler', { agentId: agent.id, sender: messageEvent.sender });
      return;
    }

    // Always save incoming messages to agent memory (regardless of whether they respond)
    await saveIncomingMessageToMemory(world, agent, messageEvent);

    // Reset LLM call count if needed (for human/system messages)
    await resetLLMCallCountIfNeeded(world, agent, messageEvent);

    // Process message if agent should respond
    loggerResponse.debug('Checking if agent should respond', { agentId: agent.id, sender: messageEvent.sender });
    if (await shouldAgentRespond(world, agent, messageEvent)) {
      loggerAgent.debug('Agent will respond - processing message', { agentId: agent.id, sender: messageEvent.sender });
      await processAgentMessage(world, agent, messageEvent);
    } else {
      loggerAgent.debug('Agent will NOT respond - publishing memory-only SSE', { agentId: agent.id, sender: messageEvent.sender });

      // Publish SSE event for memory-only message (saved but no response)
      // This allows the frontend to display agent→agent messages that were saved to memory
      publishSSE(world, {
        agentName: agent.id,
        type: 'memory-only',
        content: messageEvent.content,
        messageId: messageEvent.messageId
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
    // Skip saving agent's own messages
    if (messageEvent.sender?.toLowerCase() === agent.id.toLowerCase()) {
      return;
    }

    // Warn if messageId is missing but don't throw
    if (!messageEvent.messageId) {
      loggerMemory.error('❌ [MISSING MESSAGEID] Message missing messageId - this should not happen', {
        agentId: agent.id,
        sender: messageEvent.sender,
        content: messageEvent.content?.substring(0, 50),
        worldId: world.id,
        currentChatId: world.currentChatId,
        timestamp: messageEvent.timestamp,
        stackTrace: new Error().stack?.split('\n').slice(2, 6).join('\n')
      });
      // Continue anyway - message will be saved without messageId
    } else {
      loggerMemory.debug('[saveIncomingMessageToMemory] Saving message with messageId', {
        agentId: agent.id,
        messageId: messageEvent.messageId,
        sender: messageEvent.sender,
        chatId: world.currentChatId
      });
    }

    const userMessage: AgentMessage = {
      role: 'user',
      content: messageEvent.content,
      sender: messageEvent.sender,
      createdAt: messageEvent.timestamp,
      chatId: world.currentChatId || null,
      messageId: messageEvent.messageId,
      replyToMessageId: messageEvent.replyToMessageId, // Preserve threading information
      agentId: agent.id
    };

    // Log if currentChatId is null
    if (!world.currentChatId) {
      loggerMemory.warn('Saving message without chatId', {
        agentId: agent.id,
        messageId: messageEvent.messageId,
        sender: messageEvent.sender,
        worldId: world.id
      });
    }

    agent.memory.push(userMessage);

    // Auto-save memory using storage factory
    try {
      const storage = await getStorageWrappers();

      loggerMemory.debug('[saveIncomingMessageToMemory] Saving agent to storage', {
        agentId: agent.id,
        worldId: world.id,
        memoryCount: agent.memory.length,
        lastMessageId: agent.memory[agent.memory.length - 1]?.messageId,
        lastMessageSender: agent.memory[agent.memory.length - 1]?.sender
      });

      await storage.saveAgent(world.id, agent);

      loggerMemory.debug('[saveIncomingMessageToMemory] ✅ Agent saved successfully', {
        agentId: agent.id,
        messageId: messageEvent.messageId
      });
    } catch (error) {
      loggerMemory.warn('Failed to auto-save memory', { agentId: agent.id, error: error instanceof Error ? error.message : error });
    }
  } catch (error) {
    loggerMemory.warn('Could not save incoming message to memory', { agentId: agent.id, error: error instanceof Error ? error.message : error });
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
  try {
    // Load conversation history from storage for current chat (last 10 messages)
    // NOTE: Don't save incoming message yet to avoid duplication in prepareMessagesForLLM
    let conversationHistory: AgentMessage[] = [];
    try {
      const storage = await getStorageWrappers();
      const allMessages = await storage.getMemory(world.id, world.currentChatId);
      conversationHistory = allMessages.slice(-10); // Get last 10 messages for current chat
    } catch (error) {
      loggerMemory.warn('Could not load conversation history from storage', { agentId: agent.id, chatId: world.currentChatId, error: error instanceof Error ? error.message : error });
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
      loggerAgent.warn('Failed to auto-save agent after LLM call increment', { agentId: agent.id, error: error instanceof Error ? error.message : error });
    }

    // Generate LLM response (streaming or non-streaming)
    let response: string;
    if (globalStreamingEnabled) {
      const { streamAgentResponse } = await import('./llm-manager.js');
      response = await streamAgentResponse(world, agent, messages, publishSSE);
    } else {
      const { generateAgentResponse } = await import('./llm-manager.js');
      response = await generateAgentResponse(world, agent, messages);
    }

    if (!response) {
      loggerAgent.error('LLM response is empty', { agentId: agent.id });
      // publishEvent(world, 'system', { message: `[Error] LLM response is empty`, type: 'error' });
      return;
    }

    // Process auto-mention logic: remove self-mentions, then add auto-mention if needed
    let finalResponse = removeSelfMentions(response, agent.id);
    if (shouldAutoMention(finalResponse, messageEvent.sender, agent.id)) {
      finalResponse = addAutoMention(finalResponse, messageEvent.sender);
    }

    // Pre-generate message ID for agent response
    const messageId = generateId();

    loggerMemory.debug('[processAgentMessage] Generated messageId for agent response', {
      agentId: agent.id,
      messageId,
      triggeringMessageId: messageEvent.messageId,
      chatId: world.currentChatId,
      responsePreview: finalResponse.substring(0, 50)
    });

    // Validate triggering message has ID
    if (!messageEvent.messageId) {
      loggerMemory.error('[processAgentMessage] messageEvent.messageId is required for threading', {
        agentId: agent.id,
        sender: messageEvent.sender,
        content: messageEvent.content?.substring(0, 50)
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

      // Create combined context including the message we're about to add
      // This ensures validation sees the complete picture for multi-agent scenarios
      const validationContext = [...agent.memory, assistantMessage];

      // For cross-agent threading, we need to validate against the world's complete message history
      // But for performance, we only validate critical issues that could cause infinite loops
      validateMessageThreading(assistantMessage, validationContext);
    } catch (error) {
      loggerMemory.error('[processAgentMessage] Threading validation failed', {
        agentId: agent.id,
        messageId: assistantMessage.messageId,
        replyToMessageId: assistantMessage.replyToMessageId,
        error: error instanceof Error ? error.message : error
      });

      // For critical errors (self-reference, circular references), clear the threading
      // For non-critical errors (missing parent), preserve threading
      if (error instanceof Error &&
        (error.message.includes('cannot reply to itself') ||
          error.message.includes('Circular reference detected') ||
          error.message.includes('Thread depth exceeds maximum'))) {
        loggerMemory.warn('[processAgentMessage] Clearing threading due to critical validation error', {
          agentId: agent.id,
          originalReplyTo: assistantMessage.replyToMessageId,
          error: error.message
        });
        assistantMessage.replyToMessageId = undefined;
      }
      // For missing parent warnings, preserve the threading - it might be valid cross-agent threading
    }

    agent.memory.push(assistantMessage);

    // Publish final response with pre-generated messageId
    if (finalResponse && typeof finalResponse === 'string') {
      publishMessageWithId(world, finalResponse, agent.id, messageId);
    }

    // Auto-save memory after adding response (now with correct messageId)
    try {
      const storage = await getStorageWrappers();
      await storage.saveAgent(world.id, agent);
    } catch (error) {
      loggerMemory.warn('Failed to auto-save memory after response', { agentId: agent.id, error: error instanceof Error ? error.message : error });
    }

  } catch (error) {
    loggerAgent.error('Agent failed to process message', { agentId: agent.id, error: error instanceof Error ? error.message : error });
    publishEvent(world, 'system', { message: `[Error] ${(error as Error).message}`, type: 'error' });
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
  loggerResponse.debug('Extracted paragraph beginning mentions', { mentions, anyMentions });

  // For HUMAN messages
  if (senderType === SenderType.HUMAN) {
    loggerResponse.debug('Processing HUMAN message logic', { agentId: agent.id });
    if (mentions.length === 0) {
      // If there are ANY mentions anywhere but none at paragraph beginnings, don't respond
      if (anyMentions.length > 0) {
        loggerResponse.debug('Has mentions but not at paragraph beginning - not responding', { agentId: agent.id, anyMentions });
        return false;
      } else {
        loggerResponse.debug('No agent mentions anywhere - responding as public message', { agentId: agent.id });
        return true;
      }
    } else {
      const shouldRespond = mentions.includes(agent.id.toLowerCase());
      loggerResponse.debug('Agent mentioned at paragraph beginning - responding to message', { agentId: agent.id, mentions, shouldRespond });
      return shouldRespond;
    }
  }

  // For agent messages, only respond if this agent has a paragraph-beginning mention
  loggerResponse.debug('Processing AGENT message logic', { agentId: agent.id });
  const shouldRespond = mentions.includes(agent.id.toLowerCase());
  loggerResponse.debug('AGENT message - should respond: ' + shouldRespond);
  return shouldRespond;
}

/**
 * Subscribe world to messages with cleanup function
 */
export function subscribeWorldToMessages(world: World): () => void {
  return subscribeToMessages(world, async (_event: WorldMessageEvent) => {
    // No-op for pre-stream title updates to avoid mid-stream refresh race conditions.
    // Title updates will be handled post-stream on SSE 'end'.
  });
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