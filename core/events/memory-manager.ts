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
 * - 2026-02-16: Added plain-text tool-intent fallback parser in continuation to synthesize executable `tool_calls` when providers return `Calling tool: ...` text.
 * - 2026-02-16: Max tool-hop guardrail now emits UI/tool errors and injects transient LLM context, then continues loop instead of returning.
 * - 2026-02-16: Removed plain-text tool-intent reminder/retry path; continuation now relies only on tool-call loop + hop guardrail.
 * - 2026-02-16: Empty/invalid continuation tool_calls now write a synthetic tool-error result back to memory before continuing the LLM loop.
 * - 2026-02-16: Added bounded retry when continuation returns empty/invalid `tool_calls` so agent loops do not stop silently.
 * - 2026-02-16: Added bounded retry when post-tool continuation returns empty text so tool loops (e.g., load_skill) do not stop silently.
 * - 2026-02-16: Added multi-hop tool continuation support when post-tool LLM responses contain additional tool_calls.
 * - 2026-02-15: Sanitized agent self-mentions in `handleTextResponse` before auto-mentioning to prevent `@self` prefixes.
 * - 2026-02-13: Added per-agent `autoReply` gate; disables sender auto-mention when set to false.
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
import {
  generateId,
  determineSenderType,
  prepareMessagesForLLM,
  getEnvValueFromText,
  getDefaultWorkingDirectory,
} from '../utils.js';
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
  hasAnyMentionAtBeginning,
  removeSelfMentions
} from './mention-logic.js';
import { publishMessage, publishMessageWithId, publishSSE, publishEvent, publishToolEvent, isStreamingEnabled } from './publishers.js';
import { logToolBridge } from './tool-bridge-logging.js';

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

function parseToolCallArguments(rawArguments: unknown): Record<string, any> {
  if (rawArguments == null) return {};

  if (typeof rawArguments === 'object' && !Array.isArray(rawArguments)) {
    return rawArguments as Record<string, any>;
  }

  if (typeof rawArguments !== 'string') {
    return {};
  }

  const trimmed = rawArguments.trim();
  if (!trimmed) return {};

  const parsed = JSON.parse(trimmed);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, any>;
  }

  return {};
}

function decodeControlTokens(value: string): string {
  return value.replace(/<ctrl(\d+)>/gi, (_match, codeRaw) => {
    const code = Number(codeRaw);
    if (!Number.isFinite(code)) return '';
    try {
      return String.fromCharCode(code);
    } catch {
      return '';
    }
  });
}

function parseLooseScalar(rawValue: string): unknown {
  const decoded = decodeControlTokens(String(rawValue || '').trim());
  if (!decoded) return '';

  if (
    (decoded.startsWith('"') && decoded.endsWith('"'))
    || (decoded.startsWith("'") && decoded.endsWith("'"))
  ) {
    return decoded.slice(1, -1);
  }

  if (/^(true|false)$/i.test(decoded)) {
    return decoded.toLowerCase() === 'true';
  }

  if (/^null$/i.test(decoded)) {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(decoded)) {
    return Number(decoded);
  }

  return decoded;
}

function splitTopLevelCommaSeparated(body: string): string[] {
  const parts: string[] = [];
  let buffer = '';
  let quote: '"' | "'" | null = null;
  let escapeNext = false;

  for (let index = 0; index < body.length; index += 1) {
    const current = body[index];

    if (escapeNext) {
      buffer += current;
      escapeNext = false;
      continue;
    }

    if (current === '\\') {
      buffer += current;
      escapeNext = true;
      continue;
    }

    if ((current === '"' || current === "'")) {
      if (!quote) {
        quote = current;
      } else if (quote === current) {
        quote = null;
      }
      buffer += current;
      continue;
    }

    if (current === ',' && !quote) {
      if (buffer.trim()) {
        parts.push(buffer.trim());
      }
      buffer = '';
      continue;
    }

    buffer += current;
  }

  if (buffer.trim()) {
    parts.push(buffer.trim());
  }

  return parts;
}

function parseLooseObjectLiteral(rawObject: string): Record<string, unknown> | null {
  const decoded = decodeControlTokens(rawObject.trim());
  if (!decoded.startsWith('{') || !decoded.endsWith('}')) {
    return null;
  }

  const innerBody = decoded.slice(1, -1).trim();
  if (!innerBody) {
    return {};
  }

  const entries = splitTopLevelCommaSeparated(innerBody);
  const parsed: Record<string, unknown> = {};

  for (const entry of entries) {
    const separatorIndex = entry.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }

    const keyRaw = entry.slice(0, separatorIndex).trim();
    const valueRaw = entry.slice(separatorIndex + 1).trim();
    if (!keyRaw) continue;

    const normalizedKey = keyRaw.replace(/^['"]|['"]$/g, '').trim();
    if (!normalizedKey) continue;

    parsed[normalizedKey] = parseLooseScalar(valueRaw);
  }

  return parsed;
}

function parsePlainTextToolIntent(content: string): {
  toolName: string;
  toolArgs: Record<string, unknown>;
} | null {
  const normalized = String(content || '').trim();
  if (!normalized) return null;

  const match = normalized.match(/^calling\s+tool\s*:\s*([a-zA-Z0-9_\-]+)\s*(\{[\s\S]*\})?\s*$/i);
  if (!match) {
    return null;
  }

  const toolName = String(match[1] || '').trim();
  if (!toolName) {
    return null;
  }

  const rawArgs = String(match[2] || '').trim();
  if (!rawArgs) {
    return { toolName, toolArgs: {} };
  }

  try {
    const strictParsed = parseToolCallArguments(rawArgs);
    return { toolName, toolArgs: strictParsed };
  } catch {
    const looseParsed = parseLooseObjectLiteral(rawArgs);
    if (looseParsed && typeof looseParsed === 'object' && !Array.isArray(looseParsed)) {
      return { toolName, toolArgs: looseParsed };
    }
  }

  return { toolName, toolArgs: {} };
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
    hopCount?: number;
    emptyTextRetryCount?: number;
    emptyToolCallRetryCount?: number;
  }
): Promise<void> {
  const completeActivity = beginWorldActivity(world, `agent:${agent.id}`);
  try {
    let hopCount = options?.hopCount ?? 0;
    const maxToolHops = 50;
    const emptyTextRetryCount = options?.emptyTextRetryCount ?? 0;
    const maxEmptyTextRetries = 2;
    const emptyToolCallRetryCount = options?.emptyToolCallRetryCount ?? 0;
    const maxEmptyToolCallRetries = 2;
    let transientGuardrailError: string | undefined;

    if (hopCount > maxToolHops) {
      const guardrailErrorMessage = `[Error] Tool continuation exceeded ${maxToolHops} hops. Guardrail triggered; reporting error and continuing.`;
      const guardrailToolCallId = generateId();

      loggerAgent.error('Tool continuation hop limit reached; reporting error and continuing loop', {
        agentId: agent.id,
        chatId: chatId ?? world.currentChatId ?? null,
        hopCount,
        maxToolHops,
      });

      publishEvent(world, 'system', {
        message: guardrailErrorMessage,
        type: 'error',
      });

      publishToolEvent(world, {
        agentName: agent.id,
        type: 'tool-error',
        messageId: guardrailToolCallId,
        chatId: chatId ?? world.currentChatId ?? null,
        toolExecution: {
          toolName: '__tool_continuation_guardrail__',
          toolCallId: guardrailToolCallId,
          error: guardrailErrorMessage,
        },
      });

      logToolBridge('CONTINUE HOP_GUARDRAIL', {
        worldId: world.id,
        agentId: agent.id,
        chatId: chatId ?? world.currentChatId ?? null,
        hopCount,
        maxToolHops,
        guardrailToolCallId,
      });

      transientGuardrailError =
        `System error: tool continuation exceeded ${maxToolHops} hops and was guardrailed. Continue the task and avoid unnecessary additional tool calls.`;
      hopCount = 0;
    }

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

    const llmMessages = transientGuardrailError
      ? [
        ...messages,
        {
          role: 'user',
          content: transientGuardrailError,
        },
      ]
      : messages;

    loggerAgent.debug('Calling LLM with memory after tool execution', {
      agentId: agent.id,
      targetChatId,
      preparedMessageCount: llmMessages.length,
      systemMessagesInPrepared: llmMessages.filter(m => m.role === 'system').length,
      userMessages: llmMessages.filter(m => m.role === 'user').length,
      assistantMessages: llmMessages.filter(m => m.role === 'assistant').length,
      toolMessages: llmMessages.filter(m => m.role === 'tool').length,
      lastThreeMessages: llmMessages.slice(-3).map((m: any) => ({
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
        llmMessages as any,
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
        llmMessages as any,
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

    logToolBridge('LLM -> CONTINUE', {
      worldId: world.id,
      agentId: agent.id,
      chatId: targetChatId,
      responseType: llmResponse.type,
      hasContent: !!llmResponse.content,
      contentPreview: String(llmResponse.content || '').substring(0, 200),
      toolCallCount: Array.isArray(llmResponse.tool_calls) ? llmResponse.tool_calls.length : 0,
    });

    if (llmResponse.type === 'text' && typeof llmResponse.content === 'string' && llmResponse.content.trim()) {
      const parsedPlainTextToolIntent = parsePlainTextToolIntent(llmResponse.content);
      if (parsedPlainTextToolIntent) {
        const syntheticToolCallId = generateId();
        loggerAgent.warn('Continuation received plain-text tool intent; synthesizing tool_call fallback', {
          agentId: agent.id,
          chatId: targetChatId,
          toolName: parsedPlainTextToolIntent.toolName,
          syntheticToolCallId,
        });

        logToolBridge('CONTINUE PLAINTEXT_TOOL_INTENT_FALLBACK', {
          worldId: world.id,
          agentId: agent.id,
          chatId: targetChatId,
          toolName: parsedPlainTextToolIntent.toolName,
          toolArgs: parsedPlainTextToolIntent.toolArgs,
          syntheticToolCallId,
        });

        llmResponse = {
          type: 'tool_calls',
          content: llmResponse.content,
          tool_calls: [{
            id: syntheticToolCallId,
            type: 'function',
            function: {
              name: parsedPlainTextToolIntent.toolName,
              arguments: JSON.stringify(parsedPlainTextToolIntent.toolArgs || {}),
            },
          }],
          assistantMessage: {
            role: 'assistant',
            content: llmResponse.content,
            tool_calls: [{
              id: syntheticToolCallId,
              type: 'function',
              function: {
                name: parsedPlainTextToolIntent.toolName,
                arguments: JSON.stringify(parsedPlainTextToolIntent.toolArgs || {}),
              },
            }],
          },
        } as any;
      }
    }

    if (llmResponse.type === 'tool_calls') {
      const returnedToolCalls = Array.isArray(llmResponse.tool_calls) ? llmResponse.tool_calls : [];
      const validReturnedToolCalls = returnedToolCalls.filter((tc: any) => {
        const name = String(tc?.function?.name || '').trim();
        return name.length > 0;
      });
      const executableToolCalls = validReturnedToolCalls.slice(0, 1);

      if (returnedToolCalls.length > validReturnedToolCalls.length) {
        loggerAgent.warn('Continuation LLM returned invalid tool calls; dropping calls with empty names', {
          agentId: agent.id,
          returnedToolCallCount: returnedToolCalls.length,
          validToolCallCount: validReturnedToolCalls.length,
          emptyToolCallRetryCount,
          maxEmptyToolCallRetries,
        });
      }

      if (validReturnedToolCalls.length > executableToolCalls.length) {
        loggerAgent.warn('Continuation LLM returned multiple tool calls; processing first call only', {
          agentId: agent.id,
          returnedToolCallCount: validReturnedToolCalls.length,
          processedToolCallIds: executableToolCalls.map(tc => tc.id),
          droppedToolCallIds: validReturnedToolCalls.slice(1).map(tc => tc.id)
        });
      }

      const toolCall = executableToolCalls[0];
      if (!toolCall) {
        const firstInvalidToolCall = returnedToolCalls[0] as any;
        const toolCallId = String(firstInvalidToolCall?.id || generateId());
        const rawToolName = String(firstInvalidToolCall?.function?.name || '').trim();
        const fallbackToolName = rawToolName || '__invalid_tool_call__';
        const fallbackToolArguments = typeof firstInvalidToolCall?.function?.arguments === 'string'
          ? firstInvalidToolCall.function.arguments
          : '{}';
        const malformedToolErrorContent = rawToolName
          ? `Error executing tool: Invalid tool call payload for '${rawToolName}'`
          : 'Error executing tool: Invalid tool call payload - empty or missing tool name';

        loggerAgent.warn('Continuation returned tool_calls without executable tool; reporting tool error back to LLM context', {
          agentId: agent.id,
          messageId,
          targetChatId,
          emptyToolCallRetryCount,
          maxEmptyToolCallRetries,
          returnedToolCallCount: returnedToolCalls.length,
          toolCallId,
          fallbackToolName,
        });

        const assistantMalformedToolCallMessage: AgentMessage = {
          role: 'assistant',
          content: llmResponse.content || `Calling tool: ${fallbackToolName}`,
          sender: agent.id,
          createdAt: new Date(),
          chatId: targetChatId,
          messageId,
          tool_calls: [{
            id: toolCallId,
            type: 'function',
            function: {
              name: fallbackToolName,
              arguments: fallbackToolArguments,
            },
          }] as any,
          agentId: agent.id,
          toolCallStatus: {
            [toolCallId]: {
              complete: true,
              result: malformedToolErrorContent,
            },
          },
        };
        agent.memory.push(assistantMalformedToolCallMessage);

        const malformedToolCallEvent: WorldMessageEvent = {
          content: assistantMalformedToolCallMessage.content || '',
          sender: agent.id,
          timestamp: assistantMalformedToolCallMessage.createdAt || new Date(),
          messageId: assistantMalformedToolCallMessage.messageId!,
          chatId: assistantMalformedToolCallMessage.chatId,
        };
        (malformedToolCallEvent as any).role = 'assistant';
        (malformedToolCallEvent as any).tool_calls = assistantMalformedToolCallMessage.tool_calls;
        (malformedToolCallEvent as any).toolCallStatus = assistantMalformedToolCallMessage.toolCallStatus;
        world.eventEmitter.emit('message', malformedToolCallEvent);

        const malformedToolResultMessage: AgentMessage = {
          role: 'tool',
          content: malformedToolErrorContent,
          tool_call_id: toolCallId,
          sender: agent.id,
          createdAt: new Date(),
          chatId: targetChatId,
          messageId: generateId(),
          replyToMessageId: messageId,
          agentId: agent.id,
        };
        agent.memory.push(malformedToolResultMessage);

        publishToolEvent(world, {
          agentName: agent.id,
          type: 'tool-error',
          messageId: toolCallId,
          chatId: targetChatId,
          toolExecution: {
            toolName: fallbackToolName,
            toolCallId,
            input: fallbackToolArguments,
            error: malformedToolErrorContent,
          },
        });

        logToolBridge('CONTINUE TOOL_CALLS_INVALID', {
          worldId: world.id,
          agentId: agent.id,
          chatId: targetChatId,
          toolCallId,
          fallbackToolName,
          emptyToolCallRetryCount,
          maxEmptyToolCallRetries,
        });

        try {
          const storage = await getStorageWrappers();
          await storage.saveAgent(world.id, agent);
        } catch (error) {
          loggerMemory.error('Failed to save malformed continuation tool error context', {
            agentId: agent.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        if (emptyToolCallRetryCount < maxEmptyToolCallRetries) {
          throwIfMessageProcessingStopped(options?.abortSignal);
          await continueLLMAfterToolExecution(world, agent, targetChatId, {
            ...options,
            hopCount: hopCount + 1,
            emptyToolCallRetryCount: emptyToolCallRetryCount + 1,
          });
          return;
        }

        publishEvent(world, 'system', {
          message: '[Warning] Agent repeatedly returned invalid tool calls after tool execution. Please refine the prompt.',
          type: 'warning',
        });
        return;
      }

      const assistantToolCallMessage: AgentMessage = {
        role: 'assistant',
        content: llmResponse.content || `Calling tool: ${toolCall.function.name}`,
        sender: agent.id,
        createdAt: new Date(),
        chatId: targetChatId,
        messageId,
        tool_calls: executableToolCalls as any,
        agentId: agent.id,
        toolCallStatus: executableToolCalls.reduce((acc, tc) => {
          acc[tc.id] = { complete: false, result: null };
          return acc;
        }, {} as Record<string, { complete: boolean; result: any }>),
      };

      agent.memory.push(assistantToolCallMessage);

      try {
        const storage = await getStorageWrappers();
        await storage.saveAgent(world.id, agent);
      } catch (error) {
        loggerMemory.error('Failed to save assistant tool_call message during continuation', {
          agentId: agent.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const toolCallEvent: WorldMessageEvent = {
        content: assistantToolCallMessage.content || '',
        sender: agent.id,
        timestamp: assistantToolCallMessage.createdAt || new Date(),
        messageId: assistantToolCallMessage.messageId!,
        chatId: assistantToolCallMessage.chatId,
      };
      (toolCallEvent as any).role = 'assistant';
      (toolCallEvent as any).tool_calls = assistantToolCallMessage.tool_calls;
      (toolCallEvent as any).toolCallStatus = assistantToolCallMessage.toolCallStatus;
      world.eventEmitter.emit('message', toolCallEvent);

      const { getMCPToolsForWorld } = await import('../mcp-server-registry.js');
      const mcpTools = await getMCPToolsForWorld(world.id);
      const toolDef = mcpTools[toolCall.function.name];
      const trustedWorkingDirectory = String(
        getEnvValueFromText(world.variables, 'working_directory') || getDefaultWorkingDirectory()
      ).trim() || getDefaultWorkingDirectory();

      if (!toolDef) {
        const missingToolResult: AgentMessage = {
          role: 'tool',
          content: `Error executing tool: Tool not found: ${toolCall.function.name}`,
          tool_call_id: toolCall.id,
          sender: agent.id,
          createdAt: new Date(),
          chatId: targetChatId,
          messageId: generateId(),
          replyToMessageId: messageId,
          agentId: agent.id,
        };
        agent.memory.push(missingToolResult);

        if (assistantToolCallMessage.toolCallStatus) {
          assistantToolCallMessage.toolCallStatus[toolCall.id] = {
            complete: true,
            result: missingToolResult.content,
          };
        }

        publishToolEvent(world, {
          agentName: agent.id,
          type: 'tool-error',
          messageId: toolCall.id,
          chatId: targetChatId,
          toolExecution: {
            toolName: toolCall.function.name,
            toolCallId: toolCall.id,
            error: `Tool not found: ${toolCall.function.name}`,
          },
        });

        const storage = await getStorageWrappers();
        await storage.saveAgent(world.id, agent);
        await continueLLMAfterToolExecution(world, agent, targetChatId, {
          ...options,
          hopCount: hopCount + 1,
        });
        return;
      }

      let toolArgs: Record<string, any> = {};
      try {
        toolArgs = parseToolCallArguments(toolCall.function.arguments);
      } catch (parseError) {
        const parseErrorResult: AgentMessage = {
          role: 'tool',
          content: `Error executing tool: Invalid JSON in tool arguments: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          tool_call_id: toolCall.id,
          sender: agent.id,
          createdAt: new Date(),
          chatId: targetChatId,
          messageId: generateId(),
          replyToMessageId: messageId,
          agentId: agent.id,
        };
        agent.memory.push(parseErrorResult);

        if (assistantToolCallMessage.toolCallStatus) {
          assistantToolCallMessage.toolCallStatus[toolCall.id] = {
            complete: true,
            result: parseErrorResult.content,
          };
        }

        publishToolEvent(world, {
          agentName: agent.id,
          type: 'tool-error',
          messageId: toolCall.id,
          chatId: targetChatId,
          toolExecution: {
            toolName: toolCall.function.name,
            toolCallId: toolCall.id,
            error: parseError instanceof Error ? parseError.message : String(parseError),
          },
        });

        const storage = await getStorageWrappers();
        await storage.saveAgent(world.id, agent);
        await continueLLMAfterToolExecution(world, agent, targetChatId, {
          ...options,
          hopCount: hopCount + 1,
        });
        return;
      }

      publishToolEvent(world, {
        agentName: agent.id,
        type: 'tool-start',
        messageId: toolCall.id,
        chatId: targetChatId,
        toolExecution: {
          toolName: toolCall.function.name,
          toolCallId: toolCall.id,
          input: toolArgs,
          metadata: {
            isStreaming: isStreamingEnabled(),
          },
        },
      });

      try {
        const toolContext = {
          world,
          messages: agent.memory,
          toolCallId: toolCall.id,
          chatId: targetChatId,
          abortSignal: options?.abortSignal,
          workingDirectory: trustedWorkingDirectory,
        };

        const toolResult = await toolDef.execute(toolArgs, undefined, undefined, toolContext);
        const serializedToolResult = typeof toolResult === 'string'
          ? toolResult
          : JSON.stringify(toolResult) ?? String(toolResult);

        const toolResultMessage: AgentMessage = {
          role: 'tool',
          content: serializedToolResult,
          tool_call_id: toolCall.id,
          sender: agent.id,
          createdAt: new Date(),
          chatId: targetChatId,
          messageId: generateId(),
          replyToMessageId: messageId,
          agentId: agent.id,
        };
        agent.memory.push(toolResultMessage);

        if (assistantToolCallMessage.toolCallStatus) {
          assistantToolCallMessage.toolCallStatus[toolCall.id] = {
            complete: true,
            result: serializedToolResult,
          };
        }

        publishToolEvent(world, {
          agentName: agent.id,
          type: 'tool-result',
          messageId: toolCall.id,
          chatId: targetChatId,
          toolExecution: {
            toolName: toolCall.function.name,
            toolCallId: toolCall.id,
            input: toolArgs,
            result: serializedToolResult.slice(0, 4000),
            resultType: typeof toolResult === 'string'
              ? 'string'
              : Array.isArray(toolResult)
                ? 'array'
                : toolResult === null
                  ? 'null'
                  : 'object',
            resultSize: serializedToolResult.length,
          },
        });
      } catch (toolError) {
        const errorContent = `Error executing tool: ${toolError instanceof Error ? toolError.message : String(toolError)}`;
        const toolErrorMessage: AgentMessage = {
          role: 'tool',
          content: errorContent,
          tool_call_id: toolCall.id,
          sender: agent.id,
          createdAt: new Date(),
          chatId: targetChatId,
          messageId: generateId(),
          replyToMessageId: messageId,
          agentId: agent.id,
        };
        agent.memory.push(toolErrorMessage);

        if (assistantToolCallMessage.toolCallStatus) {
          assistantToolCallMessage.toolCallStatus[toolCall.id] = {
            complete: true,
            result: errorContent,
          };
        }

        publishToolEvent(world, {
          agentName: agent.id,
          type: 'tool-error',
          messageId: toolCall.id,
          chatId: targetChatId,
          toolExecution: {
            toolName: toolCall.function.name,
            toolCallId: toolCall.id,
            input: toolArgs,
            error: toolError instanceof Error ? toolError.message : String(toolError),
          },
        });
      }

      try {
        const storage = await getStorageWrappers();
        await storage.saveAgent(world.id, agent);
      } catch (error) {
        loggerMemory.error('Failed to save continuation tool result to memory', {
          agentId: agent.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      throwIfMessageProcessingStopped(options?.abortSignal);
      await continueLLMAfterToolExecution(world, agent, targetChatId, {
        ...options,
        hopCount: hopCount + 1,
      });
      return;
    }

    if (llmResponse.type !== 'text' || !llmResponse.content) {
      if (llmResponse.type === 'text' && !llmResponse.content && emptyTextRetryCount < maxEmptyTextRetries) {
        loggerAgent.warn('Post-tool continuation returned empty text; retrying continuation call', {
          agentId: agent.id,
          chatId: targetChatId,
          hopCount,
          emptyTextRetryCount,
          maxEmptyTextRetries,
        });

        logToolBridge('CONTINUE EMPTY_TEXT_RETRY', {
          worldId: world.id,
          agentId: agent.id,
          chatId: targetChatId,
          emptyTextRetryCount,
          maxEmptyTextRetries,
        });

        throwIfMessageProcessingStopped(options?.abortSignal);
        await continueLLMAfterToolExecution(world, agent, targetChatId, {
          ...options,
          emptyTextRetryCount: emptyTextRetryCount + 1,
        });
        return;
      }

      loggerAgent.warn('LLM response after tool execution is not text or empty - no message will be published', {
        agentId: agent.id,
        responseType: llmResponse.type,
        hasContent: !!llmResponse.content,
        contentLength: llmResponse.content?.length || 0,
        hasToolCalls: !!llmResponse.tool_calls,
        toolCallCount: llmResponse.tool_calls?.length || 0,
        emptyTextRetryCount,
        maxEmptyTextRetries,
      });

      if (llmResponse.type === 'text' && !llmResponse.content && emptyTextRetryCount >= maxEmptyTextRetries) {
        publishEvent(world, 'system', {
          message: '[Warning] Agent returned empty follow-up after tool execution. Please retry or refine the prompt.',
          type: 'warning'
        });

        logToolBridge('CONTINUE EMPTY_TEXT_STOP', {
          worldId: world.id,
          agentId: agent.id,
          chatId: targetChatId,
          emptyTextRetryCount,
          maxEmptyTextRetries,
        });
      }

      return;
    }

    const responseText = llmResponse.content;
    const sanitizedResponse = removeSelfMentions(responseText, agent.id);

    // Save response to agent memory with all required fields
    agent.memory.push({
      role: 'assistant',
      content: sanitizedResponse,
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
    publishMessageWithId(world, sanitizedResponse, agent.id, messageId, targetChatId, undefined);

    loggerAgent.debug('Agent response published after tool execution', {
      agentId: agent.id,
      messageId,
      responseLength: sanitizedResponse.length
    });
  } catch (error) {
    if (isMessageProcessingCanceledError(error) || options?.abortSignal?.aborted) {
      loggerAgent.info('Skipped continuation after stop request', {
        agentId: agent.id,
        chatId: chatId ?? world.currentChatId ?? null,
        error: error instanceof Error ? error.message : String(error)
      });

      logToolBridge('CONTINUE CANCELED', {
        worldId: world.id,
        agentId: agent.id,
        chatId: chatId ?? world.currentChatId ?? null,
        error: error instanceof Error ? error.message : String(error),
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

    logToolBridge('CONTINUE ERROR', {
      worldId: world.id,
      agentId: agent.id,
      chatId: chatId ?? world.currentChatId ?? null,
      error: error instanceof Error ? error.message : String(error),
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

  const sanitizedResponse = removeSelfMentions(responseText, agent.id);

  // Apply auto-mention logic if needed
  let finalResponse = sanitizedResponse;
  if (agent.autoReply !== false && shouldAutoMention(sanitizedResponse, messageEvent.sender, agent.id)) {
    finalResponse = addAutoMention(sanitizedResponse, messageEvent.sender);
    loggerAutoMention.debug('Auto-mention applied', {
      agentId: agent.id,
      originalSender: messageEvent.sender,
      responsePreview: finalResponse.substring(0, 100)
    });
  } else {
    loggerAutoMention.debug('Auto-mention not needed', {
      agentId: agent.id,
      autoReply: agent.autoReply !== false,
      hasAnyMention: hasAnyMentionAtBeginning(sanitizedResponse)
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
