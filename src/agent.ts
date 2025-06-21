/*
 * Simplified Function-Based Agent - Combines AIAgent and BaseAgent
 * 
 * Features:
 * - Function-based architecture (no classes or inheritance)
 * - Uses existing llm.ts module for all LLM operations
 * - Uses existing event-bus.ts module for all event handling
 * - Uses function-based storage.ts module for persistence
 * - Simple memory management with JSON persistence
 * - Mention-based message filtering for loop prevention
 * - Direct LLM response generation without fallbacks
 * - Basic agent configuration and lifecycle management
 * 
 * Logic:
 * - processAgentMessage: Main function for handling agent messages
 * - Uses storage.ts functions directly for memory persistence
 * - shouldRespondToMessage: Mention-based filtering logic
 * - extractMentions: Parse @mentions from message content
 * - Direct integration with llm.ts, event-bus.ts and storage.ts modules
 * - No complex state management, monitoring, or tool systems
 * 
 * Changes:
 * - Initial implementation combining AIAgent and BaseAgent functionality
 * - Removed class-based architecture in favor of pure functions
 * - Eliminated tool system, fallback logic, and monitoring complexity
 * - Uses existing modules instead of duplicating LLM/event functionality
 * - Simple memory structure with conversation history only
 * - Maintains core functionality: message handling, LLM integration, memory
 * - UPDATED: Migrated from class-based FileStorage to function-based storage.ts
 * - REMOVED: Local loadAgentMemory/saveAgentMemory functions in favor of imports
 * - SIMPLIFIED: Function signatures by removing storage parameter dependency
 */

import { v4 as uuidv4 } from 'uuid';
import { AgentMemory, Event, EventType } from './types';
import { loadLLMProvider, chatWithLLM, ChatOptions, LLMConfig } from './llm';
import { publishSSE, publishMessage } from './event-bus';
import { loadAgentMemory as loadMemory, saveAgentMemory as saveMemory } from './storage';
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
  messageId?: string
): Promise<string> {
  const msgId = messageId || uuidv4();

  try {
    // Load agent memory
    const loadedMemory = await loadMemory(agentConfig.id);
    const memory: AgentMemory = loadedMemory || {
      agentId: agentConfig.id,
      conversationHistory: [],
      lastActivity: new Date().toISOString(),
      facts: {}
    };

    // Check if agent should respond to this message
    if (!shouldRespondToMessage(agentConfig, messageData)) {
      agentLogger.debug({
        agentId: agentConfig.id,
        messageId: msgId,
        sender: messageData.sender
      }, 'Agent skipping message (not mentioned or from self)');
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

    // Build system prompt
    const systemPrompt = buildSystemPrompt(agentConfig, memory);

    // Build user prompt with context
    const userPrompt = buildUserPrompt(messageData, memory);

    // Generate response using LLM
    const chatOptions: ChatOptions = {
      temperature: agentConfig.temperature,
      maxTokens: agentConfig.maxTokens,
      agentId: agentConfig.id,
      agentName: agentConfig.name
    };

    const response = await chatWithLLM(
      provider,
      systemPrompt,
      userPrompt,
      chatOptions
    );

    // Update memory with new conversation
    if (!memory.conversationHistory) {
      memory.conversationHistory = [];
    }

    // Add input message
    memory.conversationHistory.push({
      id: messageData.id,
      type: EventType.MESSAGE,
      timestamp: new Date().toISOString(),
      payload: {
        content: messageData.content || messageData.payload?.content || '',
        sender: messageData.sender || 'unknown',
        messageId: messageData.id
      }
    });

    // Add response message  
    memory.conversationHistory.push({
      id: msgId,
      type: EventType.MESSAGE,
      timestamp: new Date().toISOString(),
      payload: {
        content: response,
        sender: agentConfig.id,
        messageId: msgId
      }
    });

    // Keep only last 20 messages to prevent memory bloat
    if (memory.conversationHistory.length > 20) {
      memory.conversationHistory = memory.conversationHistory.slice(-20);
    }

    memory.lastActivity = new Date().toISOString();

    // Save updated memory
    await saveMemory(agentConfig.id, memory);

    // Publish response message
    await publishMessage({
      name: 'agent-response',
      payload: {
        content: response,
        agentId: agentConfig.id,
        agentName: agentConfig.name,
        inResponseTo: messageData.id
      },
      id: msgId,
      sender: agentConfig.id
    });

    agentLogger.info({
      agentId: agentConfig.id,
      messageId: msgId,
      responseLength: response.length
    }, 'Agent message processed successfully');

    return response;

  } catch (error) {
    agentLogger.error({
      agentId: agentConfig.id,
      messageId: msgId,
      error
    }, 'Agent message processing failed');

    // Emit error SSE event
    await publishSSE({
      agentId: agentConfig.id,
      type: 'error',
      messageId: msgId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    throw error;
  }
}

/**
 * Check if agent should respond to a message (mention-based filtering)
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

  // Always respond to direct messages or system messages
  if (!messageData.sender || messageData.sender === 'system') {
    return true;
  }

  // For agent messages, only respond if mentioned
  if (messageData.sender && messageData.sender !== 'human') {
    return isMentioned(agentConfig, content);
  }

  // For human messages, respond if no mentions or if mentioned
  const mentions = extractMentions(content);
  return mentions.length === 0 || isMentioned(agentConfig, content);
}

/**
 * Extract mentions from message content
 */
export function extractMentions(content: string): string[] {
  const mentionRegex = /@(\w+)/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1].toLowerCase());
  }

  return mentions;
}

/**
 * Check if agent is mentioned in content
 */
export function isMentioned(agentConfig: AgentConfig, content: string): boolean {
  const mentions = extractMentions(content);
  const agentName = agentConfig.name.toLowerCase();
  const agentId = agentConfig.id.toLowerCase();

  return mentions.some(mention =>
    mention === agentName ||
    mention === agentId ||
    agentId.includes(mention) // Support partial ID matching
  );
}

/**
 * Build system prompt for the agent
 */
function buildSystemPrompt(agentConfig: AgentConfig, memory: AgentMemory): string {
  let prompt = `You are ${agentConfig.name}, an AI agent.`;

  if (agentConfig.personality) {
    prompt += `\n\nPersonality: ${agentConfig.personality}`;
  }

  if (agentConfig.instructions) {
    prompt += `\n\nInstructions: ${agentConfig.instructions}`;
  }

  // Add recent conversation context
  if (memory.conversationHistory && memory.conversationHistory.length > 0) {
    const recentMessages = memory.conversationHistory.slice(-5);
    prompt += `\n\nRecent conversation context:`;
    recentMessages.forEach(msg => {
      const sender = msg.payload?.sender || 'unknown';
      const content = msg.payload?.content || '';
      prompt += `\n- ${sender}: ${content}`;
    });
  }

  prompt += `\n\nRespond naturally and conversationally. Be helpful and engaging.`;

  return prompt;
}

/**
 * Build user prompt from message data
 */
function buildUserPrompt(messageData: MessageData, memory: AgentMemory): string {
  const content = messageData.content || messageData.payload?.content || '';
  const sender = messageData.sender || 'unknown';

  return `${sender}: ${content}`;
}
