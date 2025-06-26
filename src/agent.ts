/**
 * Simplified Function-Based Agent
 * 
 * Features:
 * - Function-based architecture with static imports
 * - LLM integration via llm.ts module
 * - Event-driven messaging via event-bus.ts
 * - Stateless turn limit detection (checks last 5 messages)
 * - Mention-based message routing (@name support)
 * - Agent memory persistence (memory.json per agent)
 * - Auto-mention replies and pass command support
 * 
 * Core Functions:
 * - processAgentMessage: Main message handling with LLM response generation
 * - shouldRespondToMessage: Response decision logic including turn limit check
 * - prepareMessagesForLLM: Convert to LLM chat format with history context
 * - saveMessagesToMemory: Persist conversation to agent memory files
 * 
 * Turn Limit Logic:
 * - Checks last 5 conversation messages in shouldRespondToMessage
 * - If all 5 are from agents (not HUMAN/system), sends turn limit message
 * - Prevents endless agent loops without maintaining state counters
 * - Turn limit messages are ignored by all agents to prevent loops
 */

import { v4 as uuidv4 } from 'uuid';
import { AgentMemory, Event, EventType, ChatMessage } from './types';
import { loadLLMProvider, streamChatWithLLM, ChatOptions, LLMConfig } from './llm';
import { publishSSE, publishMessageEvent, publishDebugEvent } from './event-bus';
import { agentLogger } from './logger';
import { getAgentConversationHistory, addToAgentMemory } from './world';

// Types moved to types.ts
import type { AgentConfig, MessageData } from './types';

/**
 * Main agent message processing function
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
    // Check if agent should respond to this message (includes turn limit check)
    if (!(await shouldRespondToMessage(agentConfig, messageData, worldName))) {
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
      if (getAgentConversationHistory) {
        conversationHistory = await getAgentConversationHistory(worldName || 'default', agentConfig.name, 10);
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
      publishDebugEvent(`[Pass Command] Agent ${agentConfig.name} passing control`, {
        agentName: agentConfig.name,
        worldName
      });

      // Replace response with @human redirect
      const passMessage = `@human ${agentConfig.name} is passing control to you`;

      // Publish pass message instead of original response
      await publishMessageEvent({
        content: passMessage,
        sender: 'system'
      });

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
        publishDebugEvent(`[Auto-Mention] Added @${messageData.sender} to ${agentConfig.name}`, {
          agentName: agentConfig.name,
          sender: messageData.sender
        });
      } else {
        publishDebugEvent(`[Auto-Mention] ${agentConfig.name} already has @${messageData.sender}`, {
          agentName: agentConfig.name,
          sender: messageData.sender
        });
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

    // Handle LLM streaming timeout gracefully
    if (errorMessage.includes('LLM streaming request timeout')) {
      publishDebugEvent(`[Timeout] Agent ${agentConfig.name} - LLM request timed out`, {
        agentName: agentConfig.name,
        error: 'timeout'
      });

      // Emit error SSE event with timeout indication
      await publishSSE({
        agentName: agentConfig.name,
        type: 'error',
        messageId: msgId,
        error: 'Request timed out'
      });

      // Return empty response instead of throwing
      return '';
    }

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
 * Extract @mentions from message content - returns only first valid mention
 */
function extractMentions(content: string): string[] {
  // Match @agentName pattern - must start with letter, then word characters, hyphens, underscores
  // Negative lookbehind to avoid @@mentions
  const mentionRegex = /(?<!@)@([a-zA-Z]\w*(?:[-_]\w*)*)/g;
  const allMentions: string[] = [];
  const skippedMentions: string[] = [];
  let firstValidMention: string | null = null;
  let match;

  // Collect all mentions for logging
  while ((match = mentionRegex.exec(content)) !== null) {
    const mention = match[1];
    // Skip malformed mentions (empty, just symbols)
    if (mention && mention.length > 0) {
      const lowerMention = mention.toLowerCase();
      allMentions.push(lowerMention);

      // Only keep the first valid mention
      if (firstValidMention === null) {
        firstValidMention = lowerMention;
      } else {
        skippedMentions.push(lowerMention);
      }
    }
  }

  // Build result array with first mention only
  const result = firstValidMention ? [firstValidMention] : [];

  // Enhanced debug logging
  if (allMentions.length === 0) {
    publishDebugEvent(`[Mention Detection] No mentions found`, {
      mentions: [],
      count: 0
    });
  } else if (allMentions.length === 1) {
    publishDebugEvent(`[Mention Detection] First mention: ${firstValidMention}`, {
      mentions: result,
      count: 1
    });
  } else {
    publishDebugEvent(`[Mention Detection] First mention: ${firstValidMention} (skipped: ${skippedMentions.join(', ')})`, {
      mentions: result,
      firstMention: firstValidMention,
      skippedMentions: skippedMentions,
      count: 1,
      totalFound: allMentions.length
    });
  }

  return result;
}

/**
 * Check if agent should respond to a message (enhanced with turn limit check)
 */
export async function shouldRespondToMessage(
  agentConfig: AgentConfig,
  messageData: MessageData,
  worldName?: string
): Promise<boolean> {
  // Never respond to own messages
  if (messageData.sender === agentConfig.name) {
    return false;
  }

  const content = messageData.content || messageData.payload?.content || '';
  const agentName = agentConfig.name.toLowerCase();

  // Never respond to turn limit messages (prevents endless loops)
  if (content.includes('Turn limit reached')) {
    publishDebugEvent(`[Turn Limit] ${agentName} ignoring turn limit message`, {
      agentName,
      sender: messageData.sender
    });
    return false;
  }

  // Check turn limit by examining last 5 messages from conversation history
  if (worldName) {
    try {
      if (getAgentConversationHistory) {
        const recentHistory = await getAgentConversationHistory(worldName, agentConfig.name, 5);

        // Check if last 5 messages are all from agents (not HUMAN/human/system)
        if (recentHistory.length >= 5) {
          const lastFiveMessages = recentHistory.slice(-5);
          const allFromAgents = lastFiveMessages.every(msg => {
            const sender = msg.name || 'unknown';
            return sender !== 'HUMAN' && sender !== 'human' && sender !== 'system';
          });

          if (allFromAgents) {
            publishDebugEvent(`[Turn Limit] ${agentConfig.name} detected 5 consecutive agent messages`, {
              agentName: agentConfig.name,
              worldName,
              lastFiveSenders: lastFiveMessages.map(msg => msg.name || 'unknown')
            });

            // Send turn limit message with this agent's name as sender
            await publishMessageEvent({
              content: '@human Turn limit reached (5 consecutive agent messages). Please take control of the conversation.',
              sender: agentConfig.name
            });

            return false; // Don't respond when turn limit is reached
          }
        }
      }
    } catch (error) {
      console.warn('Could not check turn limit:', error);
    }
  }

  // Always respond to system messages (except turn limit messages handled above)
  if (!messageData.sender || messageData.sender === 'system') {
    return true;
  }

  // Extract @mentions from content
  const mentions = extractMentions(content);

  // For HUMAN/user messages
  if (messageData.sender === 'HUMAN' || messageData.sender === 'human') {
    // If no mentions at all, respond to all (public message)
    if (mentions.length === 0) {
      publishDebugEvent(`[Message Routing] Public message - ${agentName} will respond`, {
        agentName,
        messageType: 'public'
      });
      return true;
    }

    // If there are mentions, only respond if this agent is the first mention
    const isFirstMention = mentions.length > 0 && mentions[0] === agentName;
    publishDebugEvent(`[Message Routing] Private message - ${agentName} ${isFirstMention ? 'will' : 'will not'} respond${isFirstMention ? ' (first mention)' : mentions.length > 0 ? ` (first mention: ${mentions[0]})` : ''}`, {
      agentName,
      messageType: 'private',
      shouldRespond: isFirstMention,
      firstMention: mentions[0] || null
    });
    return isFirstMention;
  }

  // For agent messages, only respond if this agent is the first mention
  const isFirstMention = mentions.length > 0 && mentions[0] === agentName;
  publishDebugEvent(`[Message Routing] Agent message - ${agentName} ${isFirstMention ? 'will' : 'will not'} respond${isFirstMention ? ' (first mention)' : mentions.length > 0 ? ` (first mention: ${mentions[0]})` : ''}`, {
    agentName,
    messageType: 'agent',
    shouldRespond: isFirstMention,
    firstMention: mentions[0] || null
  });
  return isFirstMention;
}

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

    if (!addToAgentMemory) {
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
      await addToAgentMemory(worldName, agentName, userMessageToSave);
    }

    // Add the assistant response
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: assistantResponse,
      timestamp: currentTimestamp
    };

    // Use agent name for memory storage
    await addToAgentMemory(worldName, agentName, assistantMessage);
  } catch (error) {
    console.warn(`Could not save messages to memory: ${error}`);
  }
}
