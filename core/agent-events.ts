/**
 * Agent Events Module - World-Aware Agent Message Processing and Subscriptions
 *
 * Features:
 * - Automatic agent subscription to World.eventEmitter messages with passive memory
 * - Agent message processing logic with world-specific turn limits and LLM call tracking
 * - Message filtering and response logic using world context and first-mention-only system
 * - LLM streaming integration with world's eventEmitter SSE events and error handling
 * - World-specific event emitter usage ensuring proper event isolation
 * - Pass command detection with proper memory persistence and control handoff
 * - Auto-mention logic for agent-to-agent conversations with sender type detection
 *
 * Core Functions:
 * - subscribeAgentToMessages: Auto-subscribe agent to world messages with filtering
 * - processAgentMessage: Handle agent message processing with world context and memory persistence
 * - shouldAgentRespond: Message filtering logic with world-specific turn limits and mention detection
 * - saveIncomingMessageToMemory: Passive memory storage independent of LLM processing
 *
 * Implementation Details:
 * - Uses World.eventEmitter for all event operations ensuring proper isolation
 * - Implements agent processing logic with world awareness and turn limit management
 * - Integrates with LLM manager using world context for SSE streaming events
 * - Supports configurable world-specific turn limits with automatic reset on human messages
 * - Zero dependencies on existing agent.ts or legacy event systems
 * - All operations scoped to specific world instance with proper memory persistence
 * - Case-insensitive mention detection with first-mention-only response logic
 * - Pass command handling preserves original response in memory while redirecting control
 *
 * Recent Changes:
 * - Fixed sender type detection to use determineSenderType() consistently
 * - Enhanced pass command handling to preserve original LLM response in memory
 * - Improved comment documentation with implementation details and change history
 */

import { World, Agent, AgentMessage, MessageData, SenderType, WorldMessageEvent } from './types';
import { subscribeToMessages, publishMessage, publishSSE } from './world-events';
import { saveAgentToDisk, loadAgentFromDisk, saveAgentMemoryToDisk } from './agent-storage';
import { streamAgentResponse } from './llm-manager';
import {
  getWorldTurnLimit,
  extractMentions,
  determineSenderType,
  messageDataToAgentMessage,
  prepareMessagesForLLM,
  generateId
} from './utils';

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
      await saveAgentMemoryToDisk(world.rootPath, world.id, agent.id, agent.memory);
    } catch (error) {
      console.warn(`Failed to auto-save memory for agent ${agent.id}:`, error);
    }
  } catch (error) {
    console.warn(`Could not save incoming message to memory for ${agent.id}:`, error);
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
      console.warn(`Could not load conversation history for ${agent.id}:`, error);
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
      await saveAgentToDisk(world.rootPath, world.id, agent);
    } catch (error) {
      console.warn(`Failed to auto-save agent ${agent.id} after LLM call increment:`, error);
    }

    // Call LLM for response with streaming
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
      await saveAgentMemoryToDisk(world.rootPath, world.id, agent.id, agent.memory);
    } catch (error) {
      console.warn(`Failed to auto-save memory for agent ${agent.id} after response:`, error);
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

    // Publish agent response
    if (finalResponse && typeof finalResponse === 'string') {
      publishMessage(world, finalResponse, agent.id);
    }

  } catch (error) {
    console.error(`Agent ${agent.id} failed to process message:`, error);

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
        await saveAgentToDisk(world.rootPath, world.id, agent);
      } catch (error) {
        console.warn(`Failed to auto-save agent ${agent.id} after turn limit reset:`, error);
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

  // Extract @mentions from content
  const mentions = extractMentions(messageEvent.content);

  // For HUMAN/user messages
  if (senderType === SenderType.HUMAN) {
    // If no mentions at all, respond to all (public message)
    if (mentions.length === 0) {
      return true;
    }

    // If there are mentions, only respond if this agent is the first mention
    return mentions.length > 0 && mentions[0] === agent.id.toLowerCase();
  }

  // For agent messages, only respond if this agent is the first mention
  return mentions.length > 0 && mentions[0] === agent.id.toLowerCase();
}
