


/**
 * Unified Events Module - World and Agent Event Functions
 *
 * Features:
 * - Direct World.eventEmitter event publishing and subscription with type safety
 * - Agent subscription and message processing logic with world context
 * - Natural event isolation per World instance ensuring no cross-world interference
 * - Zero dependencies on existing event systems or complex abstractions
 * - Type-safe event handling with proper interfaces and validation
 * - High-level message broadcasting with sender attribution and timestamping
 * - Fixed auto-mention functionality with proper self-mention removal order
 * - Preserved newline handling in LLM streaming responses for proper formatting
 * - Decoupled SSE publishing: publishSSE is now passed as a callback to llm-manager to avoid circular dependency
 *
 * Core Functions:
 * World Events:
 * - publishMessage: Emit message events to World.eventEmitter with automatic ID generation
 * - subscribeToMessages: Subscribe to World.eventEmitter message events with cleanup
 * - publishSSE: Emit SSE events for streaming responses with structured data
 * - subscribeToSSE: Subscribe to SSE streaming events with proper typing
 *
 * Agent Events:
 * - subscribeAgentToMessages: Auto-subscribe agent to world messages with filtering and reset logic
 * - resetLLMCallCountIfNeeded: Reset LLM call count for human/system messages with agent state persistence
 * - processAgentMessage: Handle agent message processing with world context and memory persistence
 * - shouldAgentRespond: Message filtering logic with world-specific turn limits and mention detection
 * - saveIncomingMessageToMemory: Passive memory storage independent of LLM processing
 * - shouldAutoMention: Determine if agent should auto-mention sender (fixed bug for all sender types)
 * - getValidMentions: Get all paragraph beginning mentions excluding self-mentions
 * - isSenderMentionedAtBeginning: Check if specific sender is mentioned at paragraph beginning
 *
 * Auto-Mention Logic (Enhanced to Prevent Loops):
 * - Step 1: Remove self-mentions from response beginning (prevents agent self-mention)
 * - Step 2: Add auto-mention for sender only if NO valid mentions exist at paragraph beginnings
 * - Fixed bug: Auto-mention all valid senders (human or agent), not just agents
 * - Fixed bug: Only skip auto-mention if ANY valid mentions exist at paragraph beginnings (excluding self)
 * - Uses extractParagraphBeginningMentions for consistent mention detection
 * - Prevents agent loops (e.g., @gm->@pro->@gm) by checking for ANY mention at beginning
 * - Allows redirections (e.g., @gm->@con) by preserving explicit mentions
 * - Handles case-insensitive matching while preserving original case
 * - Ensures published message matches stored memory content
 * - Preserves original formatting including newlines and whitespace structure
 *
 * Event Structure:
 * - Message Events: WorldMessageEvent with content, sender, timestamp, and messageId
 * - SSE Events: WorldSSEEvent with agentName, type, content, error, and usage data
 * - Automatic timestamp generation and unique ID assignment for all events
 * - Structured event data ensuring consistency across all event consumers
 *
 * Implementation Details:
 * - Uses World.eventEmitter.emit() and .on() directly for maximum performance
 * - No abstraction layers or complex providers reducing complexity and overhead
 * - Events are naturally scoped to World instance preventing event leakage
 * - Ready for agent subscription and LLM integration with consistent interfaces
 * - Subscription functions return cleanup callbacks for proper memory management
 * - All events include timestamps and unique IDs for debugging and tracing
 * - Newline preservation in LLM responses maintains proper text formatting
 * - LLM call count reset happens before shouldAgentRespond for accurate turn limit checking
 * - Agent state persistence ensures turn count resets are saved to disk immediately
 * - LLM call count is saved to disk after every LLM call and memory save operation
 */

import {
  World, Agent, WorldMessageEvent, WorldSSEEvent, WorldSystemEvent,
  AgentMessage, MessageData, SenderType, ChatData
} from './types.js';
import { generateId } from './utils.js';

let globalStreamingEnabled = true;
export function enableStreaming(): void {
  globalStreamingEnabled = true;
}

export function disableStreaming(): void {
  globalStreamingEnabled = false;
}

// Create events category logger - initialized when module loads
import { createCategoryLogger } from './logger.js';
const logger = createCategoryLogger('events');

/**
 * Auto-save chat history message counts when enabled
 */
let chatDataAutosaveEnabled = true;

export function enableChatDataAutosave(): void {
  chatDataAutosaveEnabled = true;
}

export function disableChatDataAutosave(): void {
  chatDataAutosaveEnabled = false;
}

/**
 * Update active chat message counts for autosave
 */
async function updateActiveChatMessageCounts(world: World): Promise<void> {
  if (!chatDataAutosaveEnabled) return;

  try {
    // Get current chats using storage API
    const chats = await world.storage.listChats(world.id);

    // Find the most recently updated chat (likely the active one)
    if (chats.length > 0) {
      const activeChat = chats.reduce((latest: ChatData, chat: ChatData) =>
        new Date(chat.updatedAt) > new Date(latest.updatedAt) ? chat : latest
      );

      // Calculate total message count across all agents
      let totalMessages = 0;
      for (const [, agent] of world.agents) {
        totalMessages += agent.memory?.length || 0;
      }

      // Update the active chat's message count if it has changed
      if (activeChat.messageCount !== totalMessages) {
        await world.storage.updateChatData(world.id, activeChat.id, {
          messageCount: totalMessages
        });

        logger.debug('Auto-updated chat message count', {
          chatId: activeChat.id,
          oldCount: activeChat.messageCount,
          newCount: totalMessages
        });
      }
    }
  } catch (error) {
    logger.debug('Chat autosave failed', { error: error instanceof Error ? error.message : error });
    // Don't throw - autosave failures shouldn't break the main flow
  }
}

/**
 * Generate chat title from agent messages in world memory
 * Follows requirement: "automatically generate a chat title (e.g., using the first message or content analysis)"
 */
function generateChatTitleFromWorldMessages(world: World): string {
  // Collect all agent messages from world memory
  const allAgentMessages: { sender: string; content: string; createdAt: Date }[] = [];

  for (const [, agent] of world.agents) {
    if (agent.memory && Array.isArray(agent.memory)) {
      agent.memory.forEach(msg => {
        if (msg.role === 'assistant' && msg.content && msg.content.trim().length > 10) {
          allAgentMessages.push({
            sender: agent.id,
            content: msg.content,
            createdAt: msg.createdAt instanceof Date ? msg.createdAt : new Date(msg.createdAt || Date.now())
          });
        }
      });
    }
  }

  // Sort by timestamp to get first agent message
  allAgentMessages.sort((a, b) => {
    const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
    const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
    return timeA - timeB;
  });

  if (allAgentMessages.length === 0) {
    return 'New Chat';
  }

  const firstMessage = allAgentMessages[0];
  let content = firstMessage.content.trim();

  // Remove common prefixes and formatting (same logic as web chatUtils)
  content = content
    .replace(/^(Hello|Hi|Hey)[,!.]?\s*/i, '')
    .replace(/^I\s+(am|'m)\s+/i, '')
    .replace(/^(Let me|I'll|I will)\s+/i, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold markdown
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic markdown
    .replace(/[#]+\s*/, '') // Remove headers
    .trim();

  // Split into words and take first 10
  const words = content.split(/\s+/).slice(0, 10);

  // Create title
  let title = words.join(' ');

  // If too long, try to find a natural break point
  if (title.length > 50) {
    const sentences = title.split(/[.!?]/);
    if (sentences[0] && sentences[0].length <= 50) {
      title = sentences[0].trim();
    } else {
      // Fallback to first 6 words if still too long
      title = words.slice(0, 6).join(' ');
    }
  }

  // Clean up ending punctuation if it's mid-sentence
  title = title.replace(/[,;:]$/, '');

  // Add ellipsis if we truncated
  if (words.length > 6 || content.split(/\s+/).length > words.length) {
    title += '...';
  }

  return title || 'New Chat';
}

/**
 * Handle chat session messages based on sender type
 * Implements new chat session logic:
 * - Human messages: update chat title
 * - Agent messages: save the chat
 */
async function handleChatSessionMessage(world: World, messageEvent: WorldMessageEvent): Promise<void> {
  try {
    const { sender } = messageEvent;
    const isHumanMessage = sender === 'HUMAN' || sender === 'human';
    const isAgentMessage = sender !== 'HUMAN' && sender !== 'human' && sender !== 'system' && sender !== 'world';

    if (isHumanMessage) {
      // Human message should update the chat title
      await updateChatTitle(world, messageEvent);
    } else if (isAgentMessage) {
      // Agent message should save the chat
      await saveChatState(world, messageEvent);
    }
  } catch (error) {
    logger.warn('Chat session message handling failed', {
      worldId: world.id,
      currentChatId: world.currentChatId,
      error: error instanceof Error ? error.message : error
    });
  }
}

/**
 * Update chat title based on human message content
 */
async function updateChatTitle(world: World, messageEvent: WorldMessageEvent): Promise<void> {
  if (!world.currentChatId) return;

  try {
    // Generate title from the human message content
    const title = generateTitleFromContent(messageEvent.content);

    // Update the chat with new title
    const updatedChat = await world.storage.updateChatData(world.id, world.currentChatId, {
      name: title,
      messageCount: await getCurrentMessageCount(world)
    });

    if (updatedChat) {
      logger.debug('Updated chat title from human message', {
        worldId: world.id,
        chatId: world.currentChatId,
        newTitle: title
      });

      // Publish chat-updated system event to frontend
      publishEvent(world, 'system', {
        worldId: world.id,
        chatId: world.currentChatId,
        type: 'chat-title-updated'
      });
    }
  } catch (error) {
    logger.warn('Failed to update chat title', {
      worldId: world.id,
      chatId: world.currentChatId,
      error: error instanceof Error ? error.message : error
    });
  }
}

/**
 * Save current chat state when agent responds
 */
async function saveChatState(world: World, messageEvent: WorldMessageEvent): Promise<void> {
  if (!world.currentChatId) return;

  try {
    // Create world chat snapshot
    const worldChat = await world.createWorldChat();

    // Save the complete chat state
    await world.storage.saveWorldChat(world.id, world.currentChatId, worldChat);

    // Update chat metadata
    const messageCount = await getCurrentMessageCount(world);
    await world.storage.updateChatData(world.id, world.currentChatId, {
      messageCount: messageCount
    });

    logger.debug('Saved chat state from agent message', {
      worldId: world.id,
      chatId: world.currentChatId,
      agentSender: messageEvent.sender,
      messageCount: messageCount
    });

    // Publish chat-updated system event to frontend
    publishEvent(world, 'system', {
      worldId: world.id,
      chatId: world.currentChatId,
      type: 'chat-saved'
    });

  } catch (error) {
    logger.warn('Failed to save chat state', {
      worldId: world.id,
      chatId: world.currentChatId,
      error: error instanceof Error ? error.message : error
    });
  }
}

/**
 * Generate a title from message content (simplified version)
 */
function generateTitleFromContent(content: string): string {
  if (!content || content.trim().length === 0) {
    return 'New Chat';
  }

  // Clean and truncate content for title
  let title = content.trim()
    .replace(/^(Hello|Hi|Hey)[,!.]?\s*/i, '')
    .replace(/^I\s+(am|'m)\s+/i, '')
    .replace(/^(Let me|I'll|I will)\s+/i, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold markdown
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic markdown
    .replace(/[#]+\s*/, '') // Remove headers
    .trim();

  // Split into words and take first 8
  const words = title.split(/\s+/).slice(0, 8);
  title = words.join(' ');

  // If too long, try to find a natural break point
  if (title.length > 50) {
    const sentences = title.split(/[.!?]/);
    if (sentences[0] && sentences[0].length <= 50) {
      title = sentences[0].trim();
    } else {
      title = words.slice(0, 5).join(' ');
    }
  }

  // Clean up ending punctuation if it's mid-sentence
  title = title.replace(/[,;:]$/, '');

  // Add ellipsis if we truncated
  if (words.length > 5 || content.split(/\s+/).length > words.length) {
    title += '...';
  }

  return title || 'New Chat';
}

/**
 * Get current total message count across all agents
 */
async function getCurrentMessageCount(world: World): Promise<number> {
  let totalMessages = 0;
  for (const [, agent] of world.agents) {
    if (agent.memory && Array.isArray(agent.memory)) {
      totalMessages += agent.memory.length;
    }
  }
  return totalMessages;
}

/**
 * Publish event to a specific channel using World.eventEmitter
 * This new function enables separation of event types: 'system', 'message', 'sse'
 * @param world - World instance
 * @param type - Event type/channel ('system', 'message', 'sse')
 * @param content - Event content (can be string or object)
 */
export function publishEvent(world: World, type: string, content: any): void {
  const event: WorldSystemEvent = {
    content,
    timestamp: new Date(),
    messageId: generateId()
  };

  // Emit to the specified channel/type
  world.eventEmitter.emit(type, event);
}

/**
 * Message publishing using World.eventEmitter
 * Now includes chat session management based on currentChatId state
 */
export function publishMessage(world: World, content: string, sender: string): void {
  const messageEvent: WorldMessageEvent = {
    content,
    sender,
    timestamp: new Date(),
    messageId: generateId()
  };

  // Emit the message event first
  world.eventEmitter.emit('message', messageEvent);

  // Handle chat session mode based on currentChatId
  if (world.currentChatId) {
    // Session mode is ON - handle different sender types
    setTimeout(async () => {
      try {
        await handleChatSessionMessage(world, messageEvent);
      } catch (error) {
        logger.debug('Chat session message handling failed', {
          error: error instanceof Error ? error.message : error
        });
      }
    }, 100); // Small delay to allow message processing to complete
  }
  // When currentChatId is null, session mode is OFF - no automatic chat operations
}

/**
 * Subscribe to events from a specific channel using World.eventEmitter
 * @param world - World instance
 * @param type - Event type/channel to subscribe to
 * @param handler - Event handler function
 * @returns Cleanup function to unsubscribe
 */
export function subscribeToEvents(
  world: World,
  type: string,
  handler: (event: any) => void
): () => void {
  world.eventEmitter.on(type, handler);
  return () => world.eventEmitter.off(type, handler);
}

/**
 * Message subscription using World.eventEmitter
 */
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



// Agent Events Functions (from agent-events.ts)

// Import additional dependencies for agent events
import { getWorldTurnLimit, extractMentions, extractParagraphBeginningMentions, determineSenderType, prepareMessagesForLLM } from './utils.js';

/**
 * Auto-mention utility functions for processAgentMessage
 */

/**
 * Check if response already has ANY mention at the beginning using extractParagraphBeginningMentions logic
 * This prevents auto-mention loops by detecting any existing mention, not just the sender's
 */
export function hasAnyMentionAtBeginning(response: string): boolean {
  if (!response) return false;

  // Use original response to preserve newlines, only check if it's effectively empty
  if (!response.trim()) return false;

  const mentions = extractParagraphBeginningMentions(response);
  return mentions.length > 0;
}

/**
 * Add auto-mention at the beginning of response, preserving case if found elsewhere
 * Modified to check for ANY mention at beginning to prevent loops
 */
export function addAutoMention(response: string, sender: string): string {
  if (!response || !sender) return response;

  // Check if effectively empty (only whitespace)
  if (!response.trim()) return response;

  // Check if already has ANY mention at beginning (prevents loops)
  if (hasAnyMentionAtBeginning(response)) {
    return response;
  }

  // Trim the response and prepend @sender
  const trimmedResponse = response.trim();
  return `@${sender} ${trimmedResponse}`;
}

/**
 * Get all valid mentions at the beginning of every paragraph, excluding self-mentions
 * This is used to determine if auto-mention should be added
 */
export function getValidMentions(response: string, agentId: string): string[] {
  if (!response || !agentId) return [];

  // Use original response to preserve newlines, only check if it's effectively empty
  if (!response.trim()) return [];

  // Get all mentions at paragraph beginnings
  const allMentions = extractParagraphBeginningMentions(response);

  // Filter out self-mentions (case-insensitive)
  const validMentions = allMentions.filter(mention =>
    mention.toLowerCase() !== agentId.toLowerCase()
  );

  return validMentions;
}

/**
 * Check if the specific sender is mentioned at the beginning of the response
 * This is more specific than hasAnyMentionAtBeginning - only checks for the sender
 */
export function isSenderMentionedAtBeginning(response: string, sender: string): boolean {
  if (!response || !sender) return false;

  // Use original response to preserve newlines, only check if it's effectively empty
  if (!response.trim()) return false;

  // Get all mentions at paragraph beginnings
  const mentions = extractParagraphBeginningMentions(response);

  // Check if the specific sender is mentioned at the beginning (case-insensitive)
  return mentions.some(mention => mention.toLowerCase() === sender.toLowerCase());
}

/**
 * Determine if agent should auto-mention the sender based on message context
 * Fixed bug: Should auto-mention sender regardless of sender type (human or agent)
 * Fixed bug: Only add auto-mention if NO valid mentions exist at paragraph beginnings
 */
export function shouldAutoMention(
  response: string,
  sender: string,
  agentId: string
): boolean {
  if (!response || !sender || !agentId) return false;

  // Don't auto-mention if response is effectively empty
  if (!response.trim()) return false;

  // Don't auto-mention self
  if (sender.toLowerCase() === agentId.toLowerCase()) return false;

  // Don't auto-mention human senders
  if (determineSenderType(sender) === SenderType.HUMAN) return false;

  // Don't auto-mention if there are any valid mentions at paragraph beginnings
  const validMentions = getValidMentions(response, agentId);
  if (validMentions.length > 0) return false;

  // Auto-mention for agent senders only
  return true;
}

/**
 * Remove all consecutive self-mentions from response beginning (case-insensitive)
 */
export function removeSelfMentions(response: string, agentId: string): string {
  if (!response || !agentId) return response;

  const trimmedResponse = response.trim();
  if (!trimmedResponse) return response;

  // Remove all consecutive @agentId mentions from beginning (case-insensitive)
  const selfMentionPattern = new RegExp(`^(@${agentId}\\s*)+`, 'gi');
  const cleaned = trimmedResponse.replace(selfMentionPattern, '');

  // If the cleaned response is empty, return original response to preserve formatting
  if (!cleaned.trim()) return response;

  // Preserve original leading whitespace structure by finding where content starts
  const originalMatch = response.match(/^(\s*)/);
  const originalLeadingWhitespace = originalMatch ? originalMatch[1] : '';

  // Return cleaned content with original leading whitespace preserved
  return originalLeadingWhitespace + cleaned.trim();
}

/**
 * Agent subscription with automatic processing
 */
export function subscribeAgentToMessages(world: World, agent: Agent): () => void {
  logger.debug('Subscribing agent to messages', { agentId: agent.id, worldId: world.id });

  const handler = async (messageEvent: WorldMessageEvent) => {
    logger.debug('Agent received message event', {
      agentId: agent.id,
      sender: messageEvent.sender,
      content: messageEvent.content,
      messageId: messageEvent.messageId
    });

    // Skip messages from this agent itself
    if (messageEvent.sender === agent.id) {
      logger.debug('Skipping own message in handler', { agentId: agent.id, sender: messageEvent.sender });
      return;
    }

    // Reset LLM call count if needed (for human/system messages)
    await resetLLMCallCountIfNeeded(world, agent, messageEvent);

    // Automatic message processing
    logger.debug('Checking if agent should respond', { agentId: agent.id, sender: messageEvent.sender });
    if (await shouldAgentRespond(world, agent, messageEvent)) {
      logger.debug('Agent will respond - processing message', { agentId: agent.id, sender: messageEvent.sender });
      await processAgentMessage(world, agent, messageEvent);
    } else {
      logger.debug('Agent will NOT respond', { agentId: agent.id, sender: messageEvent.sender });
    }
  };

  return subscribeToMessages(world, handler);
}

/**
 * Save incoming message to agent memory (independent of LLM processing)
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

    // System messages are now saved to memory (do not skip)

    // Create user message for memory storage
    const userMessage: AgentMessage = {
      role: 'user',
      content: messageEvent.content,
      sender: messageEvent.sender,
      createdAt: messageEvent.timestamp
    };

    // Add to agent memory
    agent.memory.push(userMessage);

    // Auto-save memory using storage factory (database or disk)
    try {
      await world.storage.saveAgent(world.id, agent);

      // Auto-update chat history message counts
      await updateActiveChatMessageCounts(world);
    } catch (error) {
      logger.warn('Failed to auto-save memory', { agentId: agent.id, error: error instanceof Error ? error.message : error });
    }
  } catch (error) {
    logger.warn('Could not save incoming message to memory', { agentId: agent.id, error: error instanceof Error ? error.message : error });
  }
}

/**
 * Agent message processing logic (enhanced from src/agent.ts)
 */
export async function processAgentMessage(
  world: World,
  agent: Agent,
  messageEvent: WorldMessageEvent
): Promise<void> {
  const messageId = generateId();

  try {

    // Always save incoming message to memory (regardless of response decision)
    await saveIncomingMessageToMemory(world, agent, messageEvent);

    // Load conversation history for context (last 10 messages)
    let conversationHistory: AgentMessage[] = [];
    try {
      // Get last 10 messages from agent memory
      conversationHistory = agent.memory.slice(-10);
    } catch (error) {
      logger.warn('Could not load conversation history', { agentId: agent.id, error: error instanceof Error ? error.message : error });
    }

    // Create MessageData for compatibility with utility functions
    const messageData: MessageData = {
      id: messageId,
      name: 'message',
      sender: messageEvent.sender,
      content: messageEvent.content,
      payload: {}
    };

    // Prepare messages for LLM (including system prompt, history, and current message)
    const messages = prepareMessagesForLLM(agent, messageData, conversationHistory);

    // Increment LLM call count before making the call
    agent.llmCallCount++;
    agent.lastLLMCall = new Date();

    // Auto-save agent state after LLM call count increment
    try {
      await world.storage.saveAgent(world.id, agent);
    } catch (error) {
      logger.warn('Failed to auto-save agent after LLM call increment', { agentId: agent.id, error: error instanceof Error ? error.message : error });
    }

    let response: string;
    if (globalStreamingEnabled) {
      const { streamAgentResponse } = await import('./llm-manager.js');
      response = await streamAgentResponse(world, agent, messages, publishSSE);
    } else {
      const { generateAgentResponse } = await import('./llm-manager.js');
      response = await generateAgentResponse(world, agent, messages);
    }

    if (!response) {
      logger.error('LLM response is empty', { agentId: agent.id });
      publishEvent(world, 'system', { message: `[Error] LLM response is empty`, type: 'error' });
      return;
    }

    // Process auto-mention logic with new requirements
    let finalResponse = response;

    // Step 1: Remove self-mentions first (safety measure)
    if (finalResponse && typeof finalResponse === 'string') {
      finalResponse = removeSelfMentions(finalResponse, agent.id);
    }

    // Step 2: Auto-mention processing (fixed bug - should auto-mention all valid senders)
    if (shouldAutoMention(finalResponse, messageEvent.sender, agent.id)) {
      finalResponse = addAutoMention(finalResponse, messageEvent.sender);
    }

    // Step 3: Save final response to memory (after all processing)
    const assistantMessage: AgentMessage = {
      role: 'assistant',
      content: finalResponse,
      createdAt: new Date()
    };

    agent.memory.push(assistantMessage);

    // Auto-save memory after adding final response
    try {
      await world.storage.saveAgent(world.id, agent);

      // Auto-update chat history message counts
      await updateActiveChatMessageCounts(world);
    } catch (error) {
      logger.warn('Failed to auto-save memory after response', { agentId: agent.id, error: error instanceof Error ? error.message : error });
    }

    // Step 4: Publish final response
    if (finalResponse && typeof finalResponse === 'string') {
      publishMessage(world, finalResponse, agent.id);
    }

  } catch (error) {
    logger.error('Agent failed to process message', { agentId: agent.id, error: error instanceof Error ? error.message : error });
    publishEvent(world, 'system', { message: `[Error] ${(error as Error).message}`, type: 'error' });
  }
}

/**
 * Reset LLM call count for human and world messages with agent state persistence
 * This should be called before shouldAgentRespond to ensure proper turn limit checking
 */
export async function resetLLMCallCountIfNeeded(
  world: World,
  agent: Agent,
  messageEvent: WorldMessageEvent
): Promise<void> {
  const senderType = determineSenderType(messageEvent.sender);
  // logger.debug('Checking if LLM call count reset needed', {
  //   agentId: agent.id,
  //   sender: messageEvent.sender,
  //   senderType,
  //   currentCallCount: agent.llmCallCount
  // });

  if (senderType === SenderType.HUMAN || senderType === SenderType.WORLD) {
    if (agent.llmCallCount > 0) {
      logger.debug('Resetting LLM call count', { agentId: agent.id, oldCount: agent.llmCallCount });
      agent.llmCallCount = 0;

      // Auto-save agent state after turn limit reset
      try {
        await world.storage.saveAgent(world.id, agent);
      } catch (error) {
        logger.warn('Failed to auto-save agent after turn limit reset', { agentId: agent.id, error: error instanceof Error ? error.message : error });
      }
    }
  }
}

/**
 * Enhanced message filtering logic (matches src/agent.ts shouldRespondToMessage)
 */
export async function shouldAgentRespond(world: World, agent: Agent, messageEvent: WorldMessageEvent): Promise<boolean> {
  // logger.debug('shouldAgentRespond called ==============================================', {
  //   agentId: agent.id,
  //   sender: messageEvent.sender,
  //   content: messageEvent.content,
  //   llmCallCount: agent.llmCallCount
  // });

  // Never respond to own messages
  if (messageEvent.sender?.toLowerCase() === agent.id.toLowerCase()) {
    logger.debug('Skipping own message', { agentId: agent.id, sender: messageEvent.sender });
    return false;
  }

  const content = messageEvent.content || '';
  const agentName = agent.id.toLowerCase();

  // Never respond to turn limit messages (prevents endless loops)
  if (content.includes('Turn limit reached')) {
    logger.debug('Skipping turn limit message', { agentId: agent.id });
    return false;
  }

  // Check turn limit based on LLM call count using world-specific turn limit
  const worldTurnLimit = getWorldTurnLimit(world);
  logger.debug('Checking turn limit', { agentId: agent.id, llmCallCount: agent.llmCallCount, worldTurnLimit });

  if (agent.llmCallCount >= worldTurnLimit) {
    logger.debug('Turn limit reached, sending turn limit message', { agentId: agent.id, llmCallCount: agent.llmCallCount, worldTurnLimit });
    // Send turn limit message with agentName as sender
    const turnLimitMessage = `@human Turn limit reached (${worldTurnLimit} LLM calls). Please take control of the conversation.`;

    publishMessage(world, turnLimitMessage, agent.id);

    return false; // Don't respond when turn limit is reached
  }

  // Determine sender type for message handling logic
  const senderType = determineSenderType(messageEvent.sender);
  logger.debug('Determined sender type', { agentId: agent.id, sender: messageEvent.sender, senderType });

  // Never respond to system messages (only used for error handling now)
  if (messageEvent.sender === 'system') {
    logger.debug('Skipping system message', { agentId: agent.id });
    return false;
  }

  // Always respond to world messages (except turn limit messages handled above)
  if (messageEvent.sender === 'world') {
    logger.debug('Responding to world message', { agentId: agent.id });
    return true;
  }

  const anyMentions = extractMentions(messageEvent.content);

  // Extract @mentions that appear at paragraph beginnings only
  const mentions = extractParagraphBeginningMentions(messageEvent.content);
  logger.debug('Extracted paragraph beginning mentions', { mentions, anyMentions });

  // For HUMAN/user messages
  if (senderType === SenderType.HUMAN) {
    logger.debug('Processing HUMAN message logic', { agentId: agent.id });
    // If no paragraph-beginning mentions, check if there are any mentions at all
    if (mentions.length === 0) {
      // If there are ANY mentions anywhere but none at paragraph beginnings, don't respond
      if (anyMentions.length > 0) {
        logger.debug('Has mentions but not at paragraph beginning - not responding', { agentId: agent.id, anyMentions });
        return false;
      } else {
        logger.debug('No agent mentions anywhere - responding as public message', { agentId: agent.id });
        return true;
      }
    } else {
      const shouldRespond = mentions.includes(agent.id.toLowerCase());
      logger.debug('Agent mentioned at paragraph beginning - responding to message', { agentId: agent.id, mentions, shouldRespond });
      return shouldRespond;
    }
  }

  // For agent messages, only respond if this agent has a paragraph-beginning mention
  logger.debug('Processing AGENT message logic', { agentId: agent.id });
  const shouldRespond = mentions.includes(agent.id.toLowerCase());
  logger.debug('AGENT message - should respond: ' + shouldRespond);
  return shouldRespond;
}
