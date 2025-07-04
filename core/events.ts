import { createCategoryLogger } from './logger';

// Create events category logger
const logger = createCategoryLogger('events');

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
 *
 * Core Functions:
 * World Events:
 * - publishMessage: Emit message events to World.eventEmitter with automatic ID generation
 * - subscribeToMessages: Subscribe to World.eventEmitter message events with cleanup
 * - publishSSE: Emit SSE events for streaming responses with structured data
 * - subscribeToSSE: Subscribe to SSE streaming events with proper typing
 * - broadcastToWorld: High-level message broadcasting with default sender handling
 *
 * Agent Events:
 * - subscribeAgentToMessages: Auto-subscribe agent to world messages with filtering
 * - processAgentMessage: Handle agent message processing with world context and memory persistence
 * - shouldAgentRespond: Message filtering logic with world-specific turn limits and mention detection
 * - saveIncomingMessageToMemory: Passive memory storage independent of LLM processing
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
 */

import { World, Agent, WorldMessageEvent, WorldSSEEvent, AgentMessage, MessageData, SenderType } from './types.js';
import { generateId } from './utils.js';

// World Events Functions (from world-events.ts)

/**
 * Message publishing using World.eventEmitter
 */
export function publishMessage(world: World, content: string, sender: string): void {
  const messageEvent: WorldMessageEvent = {
    content,
    sender,
    timestamp: new Date(),
    messageId: generateId()
  };
  world.eventEmitter.emit('message', messageEvent);
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

/**
 * Broadcast message to all agents in world
 */
export function broadcastToWorld(world: World, message: string, sender?: string): void {
  publishMessage(world, message, sender || 'HUMAN');
}

// Agent Events Functions (from agent-events.ts)

// Import additional dependencies for agent events
import {
  getWorldTurnLimit,
  extractMentions,
  extractParagraphBeginningMentions,
  determineSenderType,
  messageDataToAgentMessage,
  prepareMessagesForLLM
} from './utils.js';

/**
 * Agent subscription with automatic processing
 */
export function subscribeAgentToMessages(world: World, agent: Agent): () => void {
  const handler = async (messageEvent: WorldMessageEvent) => {
    // Skip messages from this agent itself
    if (messageEvent.sender === agent.id) return;

    // Automatic message processing
    if (await shouldAgentRespond(world, agent, messageEvent)) {
      await processAgentMessage(world, agent, messageEvent);
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

    // Create user message for memory storage
    const userMessage: AgentMessage = {
      role: 'user',
      content: messageEvent.content,
      sender: messageEvent.sender,
      createdAt: messageEvent.timestamp
    };

    // Add to agent memory
    agent.memory.push(userMessage);

    // Auto-save memory to disk
    try {
      const { saveAgentMemoryToDisk } = await import('./agent-storage');
      await saveAgentMemoryToDisk(world.rootPath, world.id, agent.id, agent.memory);
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
      const { saveAgentConfigToDisk } = await import('./agent-storage');
      await saveAgentConfigToDisk(world.rootPath, world.id, agent);
    } catch (error) {
      logger.warn('Failed to auto-save agent after LLM call increment', { agentId: agent.id, error: error instanceof Error ? error.message : error });
    }

    // Call LLM for response with streaming
    const { streamAgentResponse } = await import('./llm-manager');
    const response = await streamAgentResponse(world, agent, messages);

    // Add response to memory
    const assistantMessage: AgentMessage = {
      role: 'assistant',
      content: response,
      createdAt: new Date()
    };

    agent.memory.push(assistantMessage);

    // Auto-save memory after adding assistant response
    try {
      const { saveAgentMemoryToDisk } = await import('./agent-storage');
      await saveAgentMemoryToDisk(world.rootPath, world.id, agent.id, agent.memory);
    } catch (error) {
      logger.warn('Failed to auto-save memory after response', { agentId: agent.id, error: error instanceof Error ? error.message : error });
    }

    // Check for pass command in response
    const passCommandRegex = /<world>pass<\/world>/i;
    if (passCommandRegex.test(response)) {
      // Publish pass command redirect message
      const passMessage = `@human ${agent.id} is passing control to you`;
      publishMessage(world, passMessage, 'system');

      // Note: The original LLM response is already saved to memory above
      // This ensures the pass command response is preserved in agent memory
      return;
    }

    // Auto-add @mention when replying to other agents (only for agent-to-agent replies)
    let finalResponse = response;
    if (messageEvent.sender && typeof messageEvent.sender === 'string' &&
      messageEvent.sender.toLowerCase() !== agent.id.toLowerCase()) {

      const senderType = determineSenderType(messageEvent.sender);

      // Only auto-mention when replying to agents (not humans or system)
      if (senderType === SenderType.AGENT && finalResponse && typeof finalResponse === 'string') {
        // Check if response already contains @mention for the sender
        const senderMention = `@${messageEvent.sender}`;
        if (!finalResponse.toLowerCase().includes(senderMention.toLowerCase())) {
          finalResponse = `${senderMention} ${finalResponse}`;
        }
      }
    }

    // Remove self-mentions from response (agents should not mention themselves)
    if (finalResponse && typeof finalResponse === 'string') {
      const selfMention = `@${agent.id}`;
      const selfMentionRegex = new RegExp(`@${agent.id}\\b`, 'gi');
      finalResponse = finalResponse.replace(selfMentionRegex, '').trim();

      // Clean up any resulting double spaces or line breaks
      finalResponse = finalResponse.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    }

    // Publish agent response
    if (finalResponse && typeof finalResponse === 'string') {
      publishMessage(world, finalResponse, agent.id);
    }

  } catch (error) {
    logger.error('Agent failed to process message', { agentId: agent.id, error: error instanceof Error ? error.message : error });

    // Publish error event via world's eventEmitter
    publishSSE(world, {
      agentName: agent.id,
      type: 'error',
      error: (error as Error).message,
      messageId
    });
  }
}

/**
 * Enhanced message filtering logic (matches src/agent.ts shouldRespondToMessage)
 */
export async function shouldAgentRespond(world: World, agent: Agent, messageEvent: WorldMessageEvent): Promise<boolean> {
  // Never respond to own messages
  if (messageEvent.sender?.toLowerCase() === agent.id.toLowerCase()) {
    return false;
  }

  const content = messageEvent.content || '';
  const agentName = agent.id.toLowerCase();

  // Never respond to turn limit messages (prevents endless loops)
  if (content.includes('Turn limit reached')) {
    return false;
  }

  // Reset LLM call count when receiving human or system messages (MUST happen before turn limit check)
  const senderType = determineSenderType(messageEvent.sender);
  if (senderType === SenderType.HUMAN || senderType === SenderType.SYSTEM) {
    if (agent.llmCallCount > 0) {
      agent.llmCallCount = 0;

      // Auto-save agent state after turn limit reset
      try {
        const { saveAgentConfigToDisk } = await import('./agent-storage');
        await saveAgentConfigToDisk(world.rootPath, world.id, agent);
      } catch (error) {
        logger.warn('Failed to auto-save agent after turn limit reset', { agentId: agent.id, error: error instanceof Error ? error.message : error });
      }
    }
  }

  // Check turn limit based on LLM call count using world-specific turn limit
  const worldTurnLimit = getWorldTurnLimit(world);

  if (agent.llmCallCount >= worldTurnLimit) {
    // Send turn limit message with agentName as sender
    const turnLimitMessage = `@human Turn limit reached (${worldTurnLimit} LLM calls). Please take control of the conversation.`;

    publishMessage(world, turnLimitMessage, agent.id);

    return false; // Don't respond when turn limit is reached
  }

  // Always respond to system messages (except turn limit messages handled above)
  if (!messageEvent.sender || messageEvent.sender === 'system') {
    return true;
  }

  // Extract @mentions that appear at paragraph beginnings only
  const mentions = extractParagraphBeginningMentions(messageEvent.content);

  // For HUMAN/user messages
  if (senderType === SenderType.HUMAN) {
    // If no paragraph-beginning mentions, check for any mentions at all
    if (mentions.length === 0) {
      // If there are no paragraph-beginning mentions but there are mentions elsewhere,
      // treat as public message (no response)
      const anyMentions = extractMentions(messageEvent.content);
      if (anyMentions.length > 0) {
        return false; // Has mentions but not at paragraph beginning
      }
      return true; // No mentions at all - public message
    }

    // If there are paragraph-beginning mentions, respond if this agent is mentioned
    return mentions.includes(agent.id.toLowerCase());
  }

  // For agent messages, only respond if this agent has a paragraph-beginning mention
  return mentions.includes(agent.id.toLowerCase());
}
