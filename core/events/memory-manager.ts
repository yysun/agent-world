/**
 * Memory Management Module
 * 
 * Handles agent memory operations, LLM call management, and chat title generation.
 * Provides functions for saving messages, resuming LLM after approval, and text response handling.
 * 
 * Features:
 * - Save incoming messages to agent memory with auto-save
 * - Resume LLM after approval with tool result in memory
 * - Handle text responses with auto-mention logic
 * - Reset LLM call count for human/world messages
 * - Generate chat titles from message content using LLM
 * 
 * Dependencies (Layer 4):
 * - types.ts (Layer 1)
 * - mention-logic.ts, approval-checker.ts (Layer 2)
 * - publishers.ts (Layer 3)
 * - utils.ts, logger.ts
 * - llm-manager.ts (runtime)
 * - storage (runtime)
 * 
 * Changes:
 * - 2025-01-09: Extracted from events.ts for modular architecture
 */

import type {
  World,
  Agent,
  WorldMessageEvent,
  AgentMessage,
  StorageAPI
} from '../types.js';
import { SenderType } from '../types.js';
import { generateId, determineSenderType, prepareMessagesForLLM } from '../utils.js';
import { parseMessageContent } from '../message-prep.js';
import { createCategoryLogger } from '../logger.js';
import { beginWorldActivity } from '../activity-tracker.js';
import { createStorageWithWrappers } from '../storage/storage-factory.js';
import { generateAgentResponse } from '../llm-manager.js';
import {
  shouldAutoMention,
  addAutoMention,
  hasAnyMentionAtBeginning
} from './mention-logic.js';
import { publishMessage, publishSSE, publishEvent, isStreamingEnabled } from './publishers.js';

const loggerMemory = createCategoryLogger('memory');
const loggerAgent = createCategoryLogger('agent');
const loggerTurnLimit = createCategoryLogger('turnlimit');
const loggerChatTitle = createCategoryLogger('chattitle');
const loggerAutoMention = createCategoryLogger('automention');

// Storage wrapper instance - initialized lazily
let storageWrappers: StorageAPI | null = null;
async function getStorageWrappers(): Promise<StorageAPI> {
  if (!storageWrappers) {
    storageWrappers = await createStorageWithWrappers();
  }
  return storageWrappers!;
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
 * Resume LLM after approval response
 * Calls the LLM with the updated memory (including tool result) to continue execution
 */
export async function resumeLLMAfterApproval(world: World, agent: Agent, chatId?: string | null): Promise<void> {
  const completeActivity = beginWorldActivity(world, `agent:${agent.id}`);
  try {
    // Use the chatId from the approval message event, fallback to world.currentChatId
    const targetChatId = chatId !== undefined ? chatId : world.currentChatId;

    // Filter memory to current chat only
    const currentChatMessages = agent.memory.filter(m => m.chatId === targetChatId);

    loggerAgent.debug('Resuming LLM with approval result in memory', {
      agentId: agent.id,
      targetChatId,
      worldCurrentChatId: world.currentChatId,
      totalMemoryLength: agent.memory.length,
      currentChatLength: currentChatMessages.length,
      lastFewMessages: currentChatMessages.slice(-5).map(m => ({
        role: m.role,
        hasContent: !!m.content,
        hasToolCalls: !!m.tool_calls,
        toolCallId: m.tool_call_id
      }))
    });

    // Tool execution already happened before this function was called
    // The tool result is already in memory with the actual stdout/stderr
    // Now prepare messages for LLM - loads fresh data from storage

    // Prepare messages with system prompt and complete conversation history
    const messages = await prepareMessagesForLLM(
      world.id,
      agent,
      targetChatId ?? null
    );

    loggerAgent.debug('Calling LLM with memory after tool execution', {
      agentId: agent.id,
      targetChatId,
      preparedMessageCount: messages.length,
      systemMessagesInPrepared: messages.filter(m => m.role === 'system').length,
      userMessages: messages.filter(m => m.role === 'user').length,
      assistantMessages: messages.filter(m => m.role === 'assistant').length,
      toolMessages: messages.filter(m => m.role === 'tool').length,
      lastThreeMessages: messages.slice(-3).map(m => ({
        role: m.role,
        hasContent: !!m.content,
        contentPreview: m.content?.substring(0, 100),
        hasToolCalls: !!m.tool_calls,
        toolCallId: m.tool_call_id
      }))
    });

    // Increment LLM call count
    agent.llmCallCount++;
    agent.lastLLMCall = new Date();

    try {
      const storage = await getStorageWrappers();
      await storage.saveAgent(world.id, agent);
    } catch (error) {
      loggerAgent.error('Failed to save agent after LLM call increment', {
        agentId: agent.id,
        error: error instanceof Error ? error.message : error
      });
    }

    // Generate LLM response (streaming or non-streaming)
    let response: string | { type: string; originalMessage: any; approvalMessage: any };
    let messageId: string;

    let llmResponse: import('../types.js').LLMResponse;

    if (isStreamingEnabled()) {
      const { streamAgentResponse } = await import('../llm-manager.js');
      const result = await streamAgentResponse(world, agent, messages as any, publishSSE);
      llmResponse = result.response;
      messageId = result.messageId;
    } else {
      const { generateAgentResponse } = await import('../llm-manager.js');
      const result = await generateAgentResponse(world, agent, messages as any);
      llmResponse = result.response;
      messageId = result.messageId;
    }

    loggerAgent.debug('LLM response received after approval', {
      agentId: agent.id,
      responseType: llmResponse.type,
      hasContent: !!llmResponse.content,
      toolCallCount: llmResponse.tool_calls?.length || 0
    });

    if (llmResponse.type !== 'text' || !llmResponse.content) {
      loggerAgent.warn('LLM response after approval is not text or empty - no message will be published', {
        agentId: agent.id,
        responseType: llmResponse.type,
        hasContent: !!llmResponse.content,
        contentLength: llmResponse.content?.length || 0,
        hasToolCalls: !!llmResponse.tool_calls,
        toolCallCount: llmResponse.tool_calls?.length || 0
      });
      return;
    }

    const responseText = llmResponse.content;

    // Save response to agent memory with all required fields
    agent.memory.push({
      role: 'assistant',
      content: responseText,
      messageId,
      sender: agent.id,
      createdAt: new Date(),
      chatId: targetChatId,
      agentId: agent.id
    });

    try {
      const storage = await getStorageWrappers();
      await storage.saveAgent(world.id, agent);
      loggerMemory.debug('Agent response saved to memory after approval', {
        agentId: agent.id,
        messageId,
        memorySize: agent.memory.length
      });
    } catch (error) {
      loggerMemory.error('Failed to save agent response after approval', {
        agentId: agent.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Publish the response message
    publishMessage(world, responseText, agent.id, targetChatId, undefined);

    loggerAgent.debug('Agent response published after approval', {
      agentId: agent.id,
      messageId,
      responseLength: responseText.length
    });
  } catch (error) {
    loggerAgent.error('Failed to resume LLM after approval', {
      agentId: agent.id,
      error: error instanceof Error ? error.message : error
    });
    publishEvent(world, 'system', {
      message: `[Error] ${(error as Error).message}`,
      type: 'error'
    });
  } finally {
    completeActivity();
  }
}

/**
 * Handle text response from LLM (extracted for clarity)
 */
export async function handleTextResponse(
  world: World,
  agent: Agent,
  responseText: string,
  messageId: string,
  messageEvent: WorldMessageEvent
): Promise<void> {
  // Apply auto-mention logic if needed
  let finalResponse = responseText;
  if (shouldAutoMention(responseText, messageEvent.sender, agent.id)) {
    finalResponse = addAutoMention(responseText, messageEvent.sender);
    loggerAutoMention.debug('Auto-mention applied', {
      agentId: agent.id,
      originalSender: messageEvent.sender,
      responsePreview: finalResponse.substring(0, 100)
    });
  } else {
    loggerAutoMention.debug('Auto-mention not needed', {
      agentId: agent.id,
      hasAnyMention: hasAnyMentionAtBeginning(responseText)
    });
  }

  // Save response to agent memory with all required fields
  agent.memory.push({
    role: 'assistant',
    content: finalResponse,
    messageId,
    sender: agent.id,
    createdAt: new Date(),
    chatId: world.currentChatId || null,
    replyToMessageId: messageEvent.messageId,
    agentId: agent.id
  });

  try {
    const storage = await getStorageWrappers();
    await storage.saveAgent(world.id, agent);
    loggerMemory.debug('Agent response saved to memory', {
      agentId: agent.id,
      messageId,
      memorySize: agent.memory.length
    });
  } catch (error) {
    loggerMemory.error('Failed to save agent response', {
      agentId: agent.id,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Publish the response message
  publishMessage(world, finalResponse, agent.id, messageEvent.chatId, messageEvent.messageId);

  loggerAgent.debug('Agent response published', {
    agentId: agent.id,
    messageId,
    responseLength: finalResponse.length
  });
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
 * Generate chat title from message content with LLM support and fallback
 */
export async function generateChatTitleFromMessages(world: World, content: string): Promise<string> {
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

    const { response: titleResponse } = await generateAgentResponse(world, tempAgent, [userPrompt], undefined, true); // skipTools = true for title generation
    // Title generation should never return approval flow (skipTools=true), but add guard just in case
    title = typeof titleResponse === 'string' ? titleResponse : '';
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
