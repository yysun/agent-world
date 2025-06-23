/**
 * Simplified Function-Based Agent - Combines AIAgent and BaseAgent
 * 
 * Features:
 * - Function-based architecture (no classes or inheritance)
 * - Uses existing llm.ts module for all LLM operations
 * - Uses existing event-bus.ts module for all event handling
 * - Simplified mention-based message filtering for loop prevention
 * - Direct LLM response generation with conversation history context
 * - Agent memory persistence in separate memory.json files per agent
 * - Basic agent configuration and lifecycle management
 * - Support for both @name and @id mention detection
 * 
 * Recent Changes:
 * - Updated message filtering to work with new flat event payload structure
 * - Added support for both @name and @id mentions in shouldRespondToMessage
 * - Changed sender recognition from "CLI" to "HUMAN"
 * - Updated event publishing to use MessageEventPayload type
 * - Improved mention detection with case-insensitive matching
 * - Fixed agent response publishing with proper flat payload structure
 * 
 * Logic:
 * - processAgentMessage: Main function for handling agent messages with memory
 * - shouldRespondToMessage: Simple mention-based filtering logic with @name and @id support
 * - buildPrompt: Unified prompt building with conversation history context
 * - Direct integration with llm.ts and event-bus.ts modules
 * - Memory stored separately in data/worlds/{world}/agents/{agent}/memory.json
 * - Conversation history included in LLM context for contextual responses
 * 
 * Changes:
 * - Initial implementation combining AIAgent and BaseAgent functionality
 * - Removed class-based architecture in favor of pure functions
 * - Eliminated tool system, fallback logic, and monitoring complexity
 * - Uses existing modules instead of duplicating LLM/event functionality
 * - Maintains core functionality: message handling, LLM integration
 * - SIMPLIFIED: Mention detection to basic @name matching
 * - MERGED: buildSystemPrompt and buildUserPrompt into single buildPrompt function
 * - IMPLEMENTED: Agent memory/history system with separate file storage
 * - ENHANCED: LLM context includes conversation history for better responses
 * - STREAMLINED: Response message publishing and processing
 */

import { v4 as uuidv4 } from 'uuid';
import { AgentMemory, Event, EventType } from './types';
import { loadLLMProvider, streamChatWithLLM, ChatOptions, LLMConfig } from './llm';
import { publishSSE, publishMessageEvent } from './event-bus';
import { agentLogger } from './logger';

// Types moved to types.ts
import type { AgentConfig, MessageData } from './types';

/**
 * Main agent message processing function
 * Combines functionality from AIAgent and BaseAgent
 */
export async function processAgentMessage(
  agentConfig: AgentConfig,
  messageData: MessageData,
  messageId?: string,
  worldId?: string
): Promise<string> {
  const msgId = messageId || uuidv4();

  // Ensure agent has an ID
  if (!agentConfig.id) {
    throw new Error('Agent config must have an ID for processing messages');
  }

  try {
    // Check if agent should respond to this message
    if (!shouldRespondToMessage(agentConfig, messageData)) {
      // agentLogger.debug({
      //   agentId: agentConfig.id,
      //   messageId: msgId,
      //   sender: messageData.sender
      // }, 'Agent skipping message (not mentioned or from self)');
      return '';
    }

    // Load LLM provider
    const llmConfig: LLMConfig = {
      provider: agentConfig.provider,
      model: agentConfig.model,
      apiKey: agentConfig.apiKey,
      baseUrl: agentConfig.baseUrl,
      temperature: agentConfig.temperature,
      maxTokens: agentConfig.maxTokens,
      ollamaBaseUrl: agentConfig.ollamaBaseUrl,
      azureEndpoint: agentConfig.azureEndpoint,
      azureApiVersion: agentConfig.azureApiVersion,
      azureDeployment: agentConfig.azureDeployment
    };

    const provider = loadLLMProvider(llmConfig);

    // Load conversation history for context (import function from world.ts)
    const { getAgentConversationHistory, addToAgentMemory } = await import('./world');
    const conversationHistory = await getAgentConversationHistory(worldId || 'default', agentConfig.id!, 10);

    // Build complete prompt with history
    const prompt = buildPrompt(agentConfig, messageData, conversationHistory);

    // Generate response using LLM
    const chatOptions: ChatOptions = {
      temperature: agentConfig.temperature,
      maxTokens: agentConfig.maxTokens,
      agentId: agentConfig.id,
      agentName: agentConfig.name
    };

    const response = await streamChatWithLLM(
      provider,
      prompt,
      '', // No separate user prompt - everything is in system prompt
      msgId,
      chatOptions
    );

    // Add the current message and response to agent memory
    await addToAgentMemory(worldId || 'default', agentConfig.id!, {
      type: 'incoming',
      sender: messageData.sender,
      content: messageData.content || messageData.payload?.content || '',
      messageId: msgId
    });

    await addToAgentMemory(worldId || 'default', agentConfig.id!, {
      type: 'outgoing',
      sender: agentConfig.id,
      content: response,
      messageId: msgId,
      inResponseTo: messageData.id
    });

    // Note: Using memory persistence to separate memory.json files

    // Publish response message
    await publishMessageEvent({
      content: response,
      sender: agentConfig.id || 'agent'
    });

    // agentLogger.info({
    //   agentId: agentConfig.id,
    //   messageId: msgId,
    //   responseLength: response.length
    // }, 'Agent message processed successfully');

    return response;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    agentLogger.error({
      agentId: agentConfig.id!,
      messageId: msgId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    }, 'Agent message processing failed');

    // Also log to console for immediate visibility
    console.error(`Agent ${agentConfig.name} (${agentConfig.id}) failed to process message:`, errorMessage);

    // Emit error SSE event
    await publishSSE({
      agentId: agentConfig.id!,
      type: 'error',
      messageId: msgId,
      error: errorMessage
    });

    throw error;
  }
}

/**
 * Check if agent should respond to a message (simplified)
 */
export function shouldRespondToMessage(
  agentConfig: AgentConfig,
  messageData: MessageData
): boolean {
  // Never respond to own messages
  if (messageData.sender === agentConfig.id) {
    return false;
  }

  const content = messageData.content || messageData.payload?.content || '';

  // Always respond to system messages
  if (!messageData.sender || messageData.sender === 'system') {
    return true;
  }

  // For HUMAN/user messages, respond to all or check basic @name/@id mentions
  if (messageData.sender === 'HUMAN' || messageData.sender === 'human') {
    // Simple check for @name or @id mention
    const agentName = agentConfig.name.toLowerCase();
    const agentId = agentConfig.id?.toLowerCase() || '';
    const contentLower = content.toLowerCase();
    const hasNameMention = contentLower.includes(`@${agentName}`);
    const hasIdMention = agentId && contentLower.includes(`@${agentId}`);

    // If no mentions at all, respond to all (broadcast)
    if (!content.includes('@')) {
      return true;
    }

    // If there are mentions, only respond if this agent is mentioned (by name or ID)
    return hasNameMention || hasIdMention;
  }

  // For agent messages, only respond if mentioned
  const agentName = agentConfig.name.toLowerCase();
  return content.toLowerCase().includes(`@${agentName}`);
}

/**
 * Build complete prompt for the agent with conversation history
 */
function buildPrompt(agentConfig: AgentConfig, messageData: MessageData, conversationHistory: any[] = []): string {
  let prompt = agentConfig.systemPrompt || `You are ${agentConfig.name}, an AI agent.`;

  // Add conversation history for context
  if (conversationHistory.length > 0) {
    prompt += `\n\nRecent conversation history:`;
    conversationHistory.forEach((msg, index) => {
      const sender = msg.sender || 'unknown';
      const content = msg.content || msg.payload?.content || '';
      prompt += `\n${sender}: ${content}`;
    });
  }

  prompt += `\n\nRespond naturally and conversationally. Be helpful and engaging.`;

  // Add the current message
  const content = messageData.content || messageData.payload?.content || '';
  const sender = messageData.sender || 'unknown';
  prompt += `\n\nCurrent message: ${sender}: ${content}`;

  return prompt;
}
