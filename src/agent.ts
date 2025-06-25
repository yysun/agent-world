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
 * - Updated to use LLM chat message schema consistently
 * - Fixed memory saving to include all conversation messages (user, assistant, tool) but exclude system messages
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
import { AgentMemory, Event, EventType, ChatMessage } from './types';
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
  worldName?: string
): Promise<string> {
  const msgId = messageId || uuidv4();

  // Ensure agent has a name
  if (!agentConfig.name) {
    throw new Error('Agent config must have a name for processing messages');
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

    // Load conversation history for context
    let conversationHistory: any[] = [];
    try {
      const worldModule = await import('./world');
      if (worldModule.getAgentConversationHistory) {
        conversationHistory = await worldModule.getAgentConversationHistory(worldName || 'default', agentConfig.name, 10);
      }
    } catch (error) {
      console.warn(`Could not load conversation history: ${error}`);
    }

    // Prepare messages for LLM (including system prompt, history, and current message)
    const messages = prepareMessagesForLLM(agentConfig, messageData, conversationHistory);

    // Generate response using LLM
    const chatOptions: ChatOptions = {
      temperature: agentConfig.temperature,
      maxTokens: agentConfig.maxTokens,
      agentName: agentConfig.name
    };

    const response = await streamChatWithLLM(
      provider,
      messages,
      msgId,
      chatOptions
    );

    // Save all new messages to memory (system, user, assistant, tool messages)
    await saveMessagesToMemory(worldName || 'default', agentConfig.name, messages, response);

    // Check for pass command in response
    const passCommandRegex = /<world>pass<\/world>/i;
    if (passCommandRegex.test(response)) {
      console.log(`[Pass Command] Agent ${agentConfig.name} is passing control to human`);

      // Replace response with @human redirect
      const passMessage = `@human ${agentConfig.name} is passing control to you`;

      // Publish pass message instead of original response
      await publishMessageEvent({
        content: passMessage,
        sender: 'system'
      });

      // Reset turn counter (import dynamically to avoid circular dependency)
      try {
        const worldModule = await import('./world');
        worldModule.resetTurnCounter(worldName || 'default');
      } catch (error) {
        console.warn('Could not reset turn counter:', error);
      }

      return passMessage;
    }

    // Auto-add @mention when replying to other agents
    let finalResponse = response;
    if (messageData.sender &&
      messageData.sender !== 'HUMAN' &&
      messageData.sender !== 'human' &&
      messageData.sender !== 'system' &&
      messageData.sender !== agentConfig.name) {
      // Check if response already contains @mention for the sender
      const senderMention = `@${messageData.sender}`;
      if (!finalResponse.toLowerCase().includes(senderMention.toLowerCase())) {
        finalResponse = `${senderMention} ${finalResponse}`;
        console.log(`[Auto-Mention] Added @${messageData.sender} to ${agentConfig.name}'s response`);
      } else {
        console.log(`[Auto-Mention] ${agentConfig.name}'s response already contains @${messageData.sender}`);
      }
    }

    // Publish response message
    await publishMessageEvent({
      content: finalResponse,
      sender: agentConfig.name
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
      agentName: agentConfig.name,
      messageId: msgId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    }, 'Agent message processing failed');

    // Also log to console for immediate visibility
    console.error(`Agent ${agentConfig.name} failed to process message:`, errorMessage);

    // Emit error SSE event
    await publishSSE({
      agentName: agentConfig.name,
      type: 'error',
      messageId: msgId,
      error: errorMessage
    });

    throw error;
  }
}

/**
 * Extract @mentions from message content
 */
function extractMentions(content: string): string[] {
  // Match @agentName pattern - must start with letter, then word characters, hyphens, underscores
  // Negative lookbehind to avoid @@mentions
  const mentionRegex = /(?<!@)@([a-zA-Z]\w*(?:[-_]\w*)*)/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    const mention = match[1];
    // Skip malformed mentions (empty, just symbols)
    if (mention && mention.length > 0) {
      mentions.push(mention.toLowerCase());
    }
  }

  console.log(`[Mention Detection] Found mentions: [${mentions.join(', ')}] in: "${content}"`);
  return mentions;
}

/**
 * Check if agent should respond to a message (enhanced)
 */
export function shouldRespondToMessage(
  agentConfig: AgentConfig,
  messageData: MessageData
): boolean {
  // Never respond to own messages
  if (messageData.sender === agentConfig.name) {
    return false;
  }

  const content = messageData.content || messageData.payload?.content || '';
  const agentName = agentConfig.name.toLowerCase();

  // Always respond to system messages
  if (!messageData.sender || messageData.sender === 'system') {
    return true;
  }

  // Extract @mentions from content
  const mentions = extractMentions(content);

  // For HUMAN/user messages
  if (messageData.sender === 'HUMAN' || messageData.sender === 'human') {
    // If no mentions at all, respond to all (public message)
    if (mentions.length === 0) {
      console.log(`[Message Routing] Public message from ${messageData.sender} - ${agentName} will respond`);
      return true;
    }

    // If there are mentions, only respond if this agent is mentioned by name
    const shouldRespond = mentions.includes(agentName);
    console.log(`[Message Routing] Private message from ${messageData.sender} - ${agentName} ${shouldRespond ? 'will' : 'will not'} respond`);
    return shouldRespond;
  }

  // For agent messages, only respond if explicitly mentioned
  const shouldRespond = mentions.includes(agentName);
  console.log(`[Message Routing] Agent message from ${messageData.sender} - ${agentName} ${shouldRespond ? 'will' : 'will not'} respond`);
  return shouldRespond;
}

/**
 * Build complete prompt for the agent with conversation history
 */
/**
 * Prepare messages array for LLM using standard chat message format
 */
function prepareMessagesForLLM(agentConfig: AgentConfig, messageData: MessageData, conversationHistory: ChatMessage[] = []): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // Add system message if available
  if (agentConfig.systemPrompt) {
    messages.push({
      role: 'system',
      content: agentConfig.systemPrompt
    });
  }

  // Add conversation history (already in LLM format)
  messages.push(...conversationHistory);

  // Add current message as user input
  const content = messageData.content || messageData.payload?.content || '';
  const sender = messageData.sender || 'user';

  messages.push({
    role: 'user',
    content: content,
    name: sender !== 'user' ? sender : undefined
  });

  return messages;
}

/**
 * Build prompt for LLM (legacy function - kept for compatibility)
 * @deprecated Use prepareMessagesForLLM instead
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

/**
 * Save new conversation messages to agent memory
 * Saves only the new user message and assistant response - excludes system messages and history
 */
async function saveMessagesToMemory(
  worldName: string,
  agentName: string,
  messages: ChatMessage[],
  assistantResponse: string
): Promise<void> {
  try {
    const currentTimestamp = new Date().toISOString();

    // Find the last user message (the new message we're responding to)
    // This is the most recent non-system message in the messages array
    const newUserMessage = messages.filter(msg => msg.role !== 'system').slice(-1)[0];

    const worldModule = await import('./world');
    if (!worldModule.addToAgentMemory) {
      console.warn('addToAgentMemory function not available');
      return;
    }

    if (newUserMessage) {
      // Save the new user message with timestamp
      const userMessageToSave: ChatMessage = {
        ...newUserMessage,
        timestamp: currentTimestamp
      };

      // Use agent name for memory storage
      await worldModule.addToAgentMemory(worldName, agentName, userMessageToSave);
    }

    // Add the assistant response
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: assistantResponse,
      timestamp: currentTimestamp
    };

    // Use agent name for memory storage
    await worldModule.addToAgentMemory(worldName, agentName, assistantMessage);
  } catch (error) {
    console.warn(`Could not save messages to memory: ${error}`);
  }
}
