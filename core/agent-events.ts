/**
 * Agent Events Module - World-Aware Agent Message Processing and Subscriptions
 *
 * Features:
 * - Automatic agent subscription to World.eventEmitter messages
 * - Agent message processing logic with world-specific turn limits
 * - Message filtering and response logic using world context
 * - LLM streaming integration with world's eventEmitter SSE events
 * - World-specific event emitter usage (agents use their world's eventEmitter)
 *
 * Core Functions:
 * - subscribeAgentToMessages: Auto-subscribe agent to world messages
 * - processAgentMessage: Handle agent message processing with world context
 * - shouldAgentRespond: Message filtering logic with world-specific turn limits
 *
 * Implementation:
 * - Uses World.eventEmitter for all event operations
 * - Implements agent processing logic with world awareness
 * - Integrates with LLM manager using world context
 * - Supports configurable world-specific turn limits
 * - Zero dependencies on existing agent.ts or event systems
 * - All operations scoped to specific world instance
 */

import { World, Agent, AgentMessage, MessageData, SenderType, WorldMessageEvent } from './types';
import { subscribeToMessages, publishMessage, publishSSE } from './world-events';
import { saveAgentToDisk, loadAgentFromDisk } from './agent-storage';
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
async function saveIncomingMessageToMemory(
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
      console.warn(`Failed to auto-save memory for agent ${agent.id}:`, error);
    }
  } catch (error) {
    console.warn(`Could not save incoming message to memory for ${agent.id}:`, error);
  }
}

/**
 * Agent message processing logic (enhanced from src/agent.ts)
 */
async function processAgentMessage(
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
      const { saveAgentToDisk } = await import('./agent-storage');
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
      const { saveAgentMemoryToDisk } = await import('./agent-storage');
      await saveAgentMemoryToDisk(world.rootPath, world.id, agent.id, agent.memory);
    } catch (error) {
      console.warn(`Failed to auto-save memory for agent ${agent.id} after response:`, error);
    }

    // Check for pass command in response
    const passCommandRegex = /<world>pass<\/world>/i;
    if (passCommandRegex.test(response)) {
      // Replace response with @human redirect
      const passMessage = `@human ${agent.id} is passing control to you`;

      publishMessage(world, passMessage, 'system');
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
async function shouldAgentRespond(world: World, agent: Agent, messageEvent: WorldMessageEvent): Promise<boolean> {
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

  // Check turn limit based on LLM call count using world-specific turn limit
  const worldTurnLimit = getWorldTurnLimit(world);

  if (agent.llmCallCount >= worldTurnLimit) {
    // Send turn limit message with agentName as sender
    const turnLimitMessage = `@human Turn limit reached (${worldTurnLimit} LLM calls). Please take control of the conversation.`;

    publishMessage(world, turnLimitMessage, agent.id);

    return false; // Don't respond when turn limit is reached
  }

  // Reset LLM call count when receiving human or system messages
  const senderType = determineSenderType(messageEvent.sender);
  if (senderType === SenderType.HUMAN || senderType === SenderType.SYSTEM) {
    if (agent.llmCallCount > 0) {
      agent.llmCallCount = 0;

      // Auto-save agent state after turn limit reset
      try {
        const { saveAgentToDisk } = await import('./agent-storage');
        await saveAgentToDisk(world.rootPath, world.id, agent);
      } catch (error) {
        console.warn(`Failed to auto-save agent ${agent.id} after turn limit reset:`, error);
      }
    }
  }

  // Always respond to system messages (except turn limit messages handled above)
  if (!messageEvent.sender || messageEvent.sender === 'system') {
    return true;
  }

  // Extract @mentions from content
  const mentions = extractMentions(messageEvent.content);

  // For HUMAN/user messages
  if (messageEvent.sender === 'HUMAN' || messageEvent.sender === 'human') {
    // If no mentions at all, respond to all (public message)
    if (mentions.length === 0) {
      return true;
    }

    // If there are mentions, only respond if this agent is the first mention
    return mentions.length > 0 && mentions[0] === agent.name;
  }

  // For agent messages, only respond if this agent is the first mention
  return mentions.length > 0 && mentions[0] === agent.name;
}
