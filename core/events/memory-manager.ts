/**
 * Memory Management Module
 * 
 * Handles agent memory operations, LLM call management, and chat title generation.
 * Provides functions for saving messages, continuing LLM after tool execution, and text response handling.
 * 
 * Features:
 * - Save incoming messages to agent memory with auto-save
 * - Continue LLM execution after tool results (auto-execution flow)
 * - Handle text responses with auto-mention logic
 * - Reset LLM call count for human/world messages
 * - Generate chat titles from message content using LLM
 * 
 * Dependencies (Layer 4):
 * - types.ts (Layer 1)
 * - mention-logic.ts (Layer 2)
 * - publishers.ts (Layer 3)
 * - utils.ts, logger.ts
 * - llm-manager.ts (runtime)
 * - storage (runtime)
 * 
 * Changes:
 * - 2026-02-13: Hardened title output normalization with markdown/prefix stripping and low-quality fallback hierarchy.
 * - 2026-02-13: Canceled title-generation calls now exit without fallback renaming.
 * - 2026-02-13: Added deterministic chat-title prompt shaping (role filtering, de-duplication, bounded window).
 * - 2026-02-13: Made chat-title generation explicitly chat-scoped by requiring target `chatId`.
 * - 2026-02-13: Title generation LLM calls now use chat-scoped queue context for cancellation alignment.
 * - 2026-02-13: Added abort-signal guards so stop requests prevent post-tool LLM continuation and suppress cancellation noise.
 * - 2026-02-13: Passed explicit `chatId` through LLM calls for chat-scoped stop cancellation support.
 * - 2026-02-08: Removed stale manual tool-intervention terminology from comments and transient types
 * - 2026-02-06: Renamed resumeLLMAfterManualDecision to continueLLMAfterToolExecution
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
  isMessageProcessingCanceledError,
  throwIfMessageProcessingStopped
} from '../message-processing-control.js';
import {
  shouldAutoMention,
  addAutoMention,
  hasAnyMentionAtBeginning
} from './mention-logic.js';
import { publishMessage, publishMessageWithId, publishSSE, publishEvent, isStreamingEnabled } from './publishers.js';

const loggerMemory = createCategoryLogger('memory');
const loggerAgent = createCategoryLogger('agent');
const loggerTurnLimit = createCategoryLogger('turnlimit');
const loggerChatTitle = createCategoryLogger('chattitle');
const loggerAutoMention = createCategoryLogger('automention');
const TITLE_PROMPT_MAX_TURNS = 24;
const TITLE_PROMPT_MAX_CHARS_PER_TURN = 240;

// Storage wrapper instance - initialized lazily
let storageWrappers: StorageAPI | null = null;
async function getStorageWrappers(): Promise<StorageAPI> {
  if (!storageWrappers) {
    storageWrappers = await createStorageWithWrappers();
  }
  return storageWrappers!;
}

type TitlePromptMessage = {
  role: 'user' | 'assistant';
  content: string;
};
const GENERIC_TITLES = new Set([
  'chat',
  'new chat',
  'conversation',
  'untitled',
  'title',
  'assistant chat',
  'user chat',
  'chat title'
]);

function normalizeTitlePromptText(content: string): string {
  return content
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clipTitlePromptText(content: string): string {
  if (content.length <= TITLE_PROMPT_MAX_CHARS_PER_TURN) {
    return content;
  }
  return `${content.substring(0, TITLE_PROMPT_MAX_CHARS_PER_TURN - 3)}...`;
}

function buildTitlePromptMessages(messages: AgentMessage[]): TitlePromptMessage[] {
  const dedupKeys = new Set<string>();
  const filtered: TitlePromptMessage[] = [];

  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') {
      continue;
    }
    if (typeof message.content !== 'string') {
      continue;
    }

    const normalized = normalizeTitlePromptText(message.content);
    if (!normalized) {
      continue;
    }

    const clipped = clipTitlePromptText(normalized);
    const dedupKey = message.messageId
      ? `id:${message.messageId}`
      : `${message.role}:${clipped.toLowerCase()}`;
    if (dedupKeys.has(dedupKey)) {
      continue;
    }

    dedupKeys.add(dedupKey);
    filtered.push({
      role: message.role,
      content: clipped
    });
  }

  return filtered.slice(-TITLE_PROMPT_MAX_TURNS);
}

function sanitizeGeneratedTitle(rawTitle: string): string {
  const firstLine = String(rawTitle || '').split(/\r?\n/).find((line) => line.trim()) || '';

  let title = firstLine
    .trim()
    .replace(/^#+\s*/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^title\s*[:\-]\s*/i, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[\r\n\*`_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  title = title.replace(/[.!?]+$/g, '').trim();
  return title;
}

function isLowQualityTitle(title: string): boolean {
  if (!title) return true;
  const normalized = title.trim().toLowerCase();
  if (!normalized) return true;
  if (GENERIC_TITLES.has(normalized)) return true;
  if (normalized.length < 3) return true;
  return false;
}

function pickFallbackTitle(content: string, promptMessages: TitlePromptMessage[]): string {
  const contentCandidate = sanitizeGeneratedTitle(content);
  if (!isLowQualityTitle(contentCandidate)) {
    return contentCandidate;
  }

  for (const message of promptMessages) {
    if (message.role !== 'user') continue;
    const candidate = sanitizeGeneratedTitle(message.content);
    if (!isLowQualityTitle(candidate)) {
      return candidate;
    }
  }

  return 'Chat Session';
}

function isTitleGenerationCanceledError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  if (error instanceof Error) {
    const message = error.message || '';
    if (message.includes('LLM call canceled for world')) return true;
    if (message.includes('LLM call canceled for agent')) return true;
    if (message.includes('Message processing canceled by user')) return true;
    return false;
  }
  return false;
}

/**
 * Save incoming message to agent memory with auto-save
 * Uses explicit chatId from the message event for concurrency-safe saving
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

    // Derive chatId from the message event for concurrency-safe processing
    // This ensures messages stay bound to their originating session
    const targetChatId = messageEvent.chatId ?? world.currentChatId ?? null;

    if (!targetChatId) {
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
      chatId: targetChatId,
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
 * Continue LLM execution after tool execution
 * Calls the LLM with the updated memory (including tool result) to continue the execution loop
 * Used for auto-execution flow where tools are executed automatically
 */
export async function continueLLMAfterToolExecution(
  world: World,
  agent: Agent,
  chatId?: string | null,
  options?: {
    abortSignal?: AbortSignal;
  }
): Promise<void> {
  const completeActivity = beginWorldActivity(world, `agent:${agent.id}`);
  try {
    throwIfMessageProcessingStopped(options?.abortSignal);

    // Use explicit chatId when provided, fallback to world.currentChatId.
    const targetChatId = chatId !== undefined ? chatId : world.currentChatId;

    // Filter memory to current chat only
    const currentChatMessages = agent.memory.filter(m => m.chatId === targetChatId);

    loggerAgent.debug('Continuing LLM execution with tool result in memory', {
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
    throwIfMessageProcessingStopped(options?.abortSignal);

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
    let messageId: string;

    let llmResponse: import('../types.js').LLMResponse;

    // Create a wrapped publishSSE that captures the targetChatId for concurrency-safe event routing
    // This ensures SSE events stay bound to the originating session during tool continuation
    const publishSSEWithChatId = (w: import('../types.js').World, data: Partial<import('../types.js').WorldSSEEvent>) => {
      publishSSE(w, { ...data, chatId: targetChatId });
    };

    if (isStreamingEnabled()) {
      const { streamAgentResponse } = await import('../llm-manager.js');
      const result = await streamAgentResponse(
        world,
        agent,
        messages as any,
        publishSSEWithChatId,
        targetChatId ?? null,
        options?.abortSignal
      );
      llmResponse = result.response;
      messageId = result.messageId;
    } else {
      const { generateAgentResponse } = await import('../llm-manager.js');
      const result = await generateAgentResponse(
        world,
        agent,
        messages as any,
        undefined,
        false,
        targetChatId ?? null,
        options?.abortSignal
      );
      llmResponse = result.response;
      messageId = result.messageId;
    }
    throwIfMessageProcessingStopped(options?.abortSignal);

    loggerAgent.debug('LLM response received after tool execution', {
      agentId: agent.id,
      responseType: llmResponse.type,
      hasContent: !!llmResponse.content,
      toolCallCount: llmResponse.tool_calls?.length || 0
    });

    if (llmResponse.type !== 'text' || !llmResponse.content) {
      loggerAgent.warn('LLM response after tool execution is not text or empty - no message will be published', {
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
      loggerMemory.debug('Agent response saved to memory after tool execution', {
        agentId: agent.id,
        messageId,
        memorySize: agent.memory.length
      });
    } catch (error) {
      loggerMemory.error('Failed to save agent response after tool execution', {
        agentId: agent.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Publish the response message using the same messageId from streaming
    publishMessageWithId(world, responseText, agent.id, messageId, targetChatId, undefined);

    loggerAgent.debug('Agent response published after tool execution', {
      agentId: agent.id,
      messageId,
      responseLength: responseText.length
    });
  } catch (error) {
    if (isMessageProcessingCanceledError(error) || options?.abortSignal?.aborted) {
      loggerAgent.info('Skipped continuation after stop request', {
        agentId: agent.id,
        chatId: chatId ?? world.currentChatId ?? null,
        error: error instanceof Error ? error.message : String(error)
      });
      return;
    }

    loggerAgent.error('Failed to continue LLM after tool execution', {
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
 * @param chatId - Explicit chat ID for concurrency-safe processing. If not provided, uses messageEvent.chatId or world.currentChatId.
 */
export async function handleTextResponse(
  world: World,
  agent: Agent,
  responseText: string,
  messageId: string,
  messageEvent: WorldMessageEvent,
  chatId?: string | null
): Promise<void> {
  // Derive target chatId: explicit parameter > message event > world.currentChatId
  const targetChatId = chatId !== undefined ? chatId : (messageEvent.chatId ?? world.currentChatId ?? null);

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
    chatId: targetChatId,
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

  // Publish the response message using the same messageId from streaming
  publishMessageWithId(world, finalResponse, agent.id, messageId, targetChatId, messageEvent.messageId);

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
export async function generateChatTitleFromMessages(
  world: World,
  content: string,
  targetChatId: string | null
): Promise<string> {
  loggerChatTitle.debug('Generating chat title', {
    worldId: world.id,
    targetChatId,
    contentStart: content.substring(0, 50)
  });

  let title = '';
  let messages: AgentMessage[] = [];
  let promptMessages: TitlePromptMessage[] = [];
  let titleGenerationCanceled = false;

  const maxLength = 100; // Max title length

  try {
    const firstAgent = Array.from(world.agents.values())[0];

    const storage = await getStorageWrappers();
    // Load messages for the target chat only, not all messages.
    messages = targetChatId ? await storage.getMemory(world.id, targetChatId) : [];
    if (content) {
      messages.push({ role: 'user', content } as AgentMessage);
    }
    promptMessages = buildTitlePromptMessages(messages);

    loggerChatTitle.debug('Calling LLM for title generation', {
      messageCount: messages.length,
      promptMessageCount: promptMessages.length,
      targetChatId,
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

${promptMessages.map(msg => `-${msg.role}: ${msg.content}`).join('\n')}
      `
    };

    const { response: titleResponse } = await generateAgentResponse(
      world,
      tempAgent,
      [userPrompt],
      undefined,
      true,
      targetChatId
    ); // skipTools = true for title generation
    // Title generation should return plain text when skipTools=true; keep a guard for safety.
    title = typeof titleResponse === 'string' ? titleResponse : '';
    loggerChatTitle.debug('LLM generated title', { rawTitle: title });

  } catch (error) {
    if (isTitleGenerationCanceledError(error)) {
      titleGenerationCanceled = true;
      loggerChatTitle.info('Title generation canceled', {
        worldId: world.id,
        targetChatId,
        error: error instanceof Error ? error.message : error
      });
    } else {
      loggerChatTitle.warn('Failed to generate LLM title, using fallback', {
        error: error instanceof Error ? error.message : error
      });
    }
  }

  if (titleGenerationCanceled) {
    return '';
  }

  title = sanitizeGeneratedTitle(title);

  if (isLowQualityTitle(title)) {
    title = pickFallbackTitle(content, promptMessages);
  }

  title = sanitizeGeneratedTitle(title);

  // Truncate if too long
  if (title.length > maxLength) {
    title = title.substring(0, maxLength - 3) + '...';
  }

  loggerChatTitle.debug('Final processed title', { title, originalLength: title.length });

  return title;
}
