/**
 * OpenAI Direct Integration Module - Pure Client (LLM Provider Refactoring Phase 2)
 *
 * Features:
 * - Direct OpenAI API integration bypassing AI SDK schema corruption bug
 * - Support for OpenAI, Azure OpenAI, and OpenAI-compatible providers
 * - Streaming and non-streaming responses returning LLMResponse
 * - Function/tool calling detection (NO execution)
 * - Proper error handling and retry logic
 * - Browser-safe configuration injection
 * - Pure client: only calls APIs and returns structured data
 *
 * Provider Support:
 * - OpenAI: Direct integration with OpenAI API
 * - Azure OpenAI: Direct integration with Azure OpenAI endpoints
 * - OpenAI-Compatible: Direct integration with custom OpenAI-compatible APIs
 * - XAI: Direct integration using OpenAI package with custom base URL
 * - Ollama: Direct integration using OpenAI package with Ollama's OpenAI-compatible endpoint
 *
 * Implementation Details:
 * - Uses official OpenAI package for reliable API access
 * - Converts AI SDK message format to OpenAI format
 * - Returns LLMResponse with type='text' or type='tool_calls'
 * - Streaming support with chunk-by-chunk processing via onChunk callback
 * - Error handling with descriptive messages
 * - Configuration injection from llm-config module
 * - NO event emission, NO storage, NO tool execution
 *
 * Recent Changes:
 * - 2026-02-27: Normalized overlong tool-call IDs to OpenAI's 40-char limit and preserved assistant/tool ID linkage in outbound message conversion.
 * - 2026-02-16: Fixed streaming tool-call chunk merge to preserve delayed tool `id`/`name` fields across deltas.
 * - 2026-02-13: Added abort-signal support for streaming and non-streaming calls to enable chat stop cancellation.
 * - 2026-02-07: Tool definitions now attached for all providers including Ollama
 * - 2025-11-09: Phase 2 - Removed ALL tool execution logic (~200 lines)
 * - Provider is now a pure client - only API calls and data transformation
 * - Returns LLMResponse interface with type discriminator
 * - Filters invalid tool calls (empty/missing names) and logs warnings
 * - Includes usage tracking (prompt_tokens, completion_tokens) for non-streaming
 * - 2025-11-08: Removed ALL event emission from provider (publishToolEvent, publishSSE)
 * - Streaming uses onChunk callback instead of publishSSE
 * - Initial implementation with full OpenAI package integration
 */

import OpenAI from 'openai';
import { World, Agent, ChatMessage, LLMResponse } from './types.js';
import { getLLMProviderConfig, OpenAIConfig, AzureConfig, OpenAICompatibleConfig, XAIConfig, OllamaConfig } from './llm-config.js';
import { createCategoryLogger } from './logger.js';
import { generateFallbackId } from './tool-utils.js';

const logger = createCategoryLogger('openai');
const mcpLogger = createCategoryLogger('mcp.execution');
const OPENAI_TOOL_CALL_ID_MAX_LENGTH = 40;

function fnv1a32(input: string, reverse = false): number {
  let hash = 2166136261;
  if (reverse) {
    for (let i = input.length - 1; i >= 0; i -= 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  } else {
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

function shortenToolCallIdForOpenAI(rawId: string): string {
  const trimmed = rawId.trim();
  if (!trimmed) return '';
  if (trimmed.length <= OPENAI_TOOL_CALL_ID_MAX_LENGTH) return trimmed;

  const hash = `${fnv1a32(trimmed).toString(36)}${fnv1a32(trimmed, true).toString(36)}`.slice(0, 10);
  const prefixLength = Math.max(1, OPENAI_TOOL_CALL_ID_MAX_LENGTH - hash.length - 1);
  return `${trimmed.slice(0, prefixLength)}_${hash}`;
}

function collectHistoricalToolCallIds(messages: ChatMessage[]): string[] {
  const ids: string[] = [];
  for (const message of messages) {
    if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {
        ids.push(String((toolCall as any)?.id || ''));
      }
    }
    if (message.role === 'tool') {
      ids.push(String((message as any)?.tool_call_id || ''));
    }
  }
  return ids;
}

type OpenAIMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type OpenAIAssistantMessageParam = OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam;

function finalizePendingAssistantToolCalls(
  converted: OpenAIMessageParam[],
  pending: {
    assistantIndex: number;
    expectedIds: Set<string>;
    resolvedIds: Set<string>;
  }
): void {
  const assistantMessage = converted[pending.assistantIndex] as OpenAIAssistantMessageParam | undefined;
  if (!assistantMessage || assistantMessage.role !== 'assistant') {
    return;
  }

  const currentToolCalls = Array.isArray((assistantMessage as any).tool_calls)
    ? (assistantMessage as any).tool_calls
    : [];
  const resolvedToolCalls = currentToolCalls.filter((tc: any) => pending.resolvedIds.has(String(tc?.id || '')));

  if (resolvedToolCalls.length > 0) {
    (assistantMessage as any).tool_calls = resolvedToolCalls;
    return;
  }

  if (assistantMessage.content && String(assistantMessage.content).trim()) {
    delete (assistantMessage as any).tool_calls;
    return;
  }

  converted.splice(pending.assistantIndex, 1);
}

function createToolCallIdAllocator(seedIds: string[] = []): (originalId?: string) => string {
  const normalizedByOriginal = new Map<string, string>();
  const usedIds = new Set<string>();

  const reserveUnique = (candidate: string): string => {
    const safeCandidate = (candidate || generateFallbackId()).slice(0, OPENAI_TOOL_CALL_ID_MAX_LENGTH);
    if (!usedIds.has(safeCandidate)) {
      usedIds.add(safeCandidate);
      return safeCandidate;
    }

    let suffix = 1;
    while (true) {
      const suffixToken = `_${suffix.toString(36)}`;
      const nextCandidate = `${safeCandidate.slice(0, OPENAI_TOOL_CALL_ID_MAX_LENGTH - suffixToken.length)}${suffixToken}`;
      if (!usedIds.has(nextCandidate)) {
        usedIds.add(nextCandidate);
        return nextCandidate;
      }
      suffix += 1;
    }
  };

  const allocate = (originalId?: string): string => {
    const raw = typeof originalId === 'string' ? originalId.trim() : '';
    if (!raw) {
      return reserveUnique(shortenToolCallIdForOpenAI(generateFallbackId()));
    }

    const existing = normalizedByOriginal.get(raw);
    if (existing) return existing;

    const shortened = shortenToolCallIdForOpenAI(raw);
    const normalized = reserveUnique(shortened);
    normalizedByOriginal.set(raw, normalized);

    if (normalized !== raw) {
      logger.warn('OpenAI Direct: normalized tool_call id for API compatibility', {
        originalLength: raw.length,
        normalizedLength: normalized.length,
      });
    }

    return normalized;
  };

  for (const seedId of seedIds) {
    allocate(seedId);
  }

  return allocate;
}

/**
 * OpenAI client factory for standard OpenAI API
 */
export function createOpenAIClient(config: OpenAIConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
  });
}

/**
 * OpenAI client factory for Azure OpenAI
 */
export function createAzureOpenAIClient(config: AzureConfig): OpenAI {
  const endpoint = `https://${config.resourceName}.openai.azure.com`;
  const apiVersion = config.apiVersion || '2024-10-21-preview';

  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: `${endpoint}/openai/deployments/${config.deployment}`,
    defaultQuery: { 'api-version': apiVersion },
    defaultHeaders: {
      'api-key': config.apiKey,
    },
  });
}

/**
 * OpenAI client factory for OpenAI-compatible APIs
 */
export function createOpenAICompatibleClient(config: OpenAICompatibleConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
}

/**
 * OpenAI client factory for XAI
 */
export function createXAIClient(config: XAIConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: 'https://api.x.ai/v1',
  });
}

/**
 * OpenAI client factory for Ollama (OpenAI-compatible endpoint)
 */
export function createOllamaClient(config: OllamaConfig): OpenAI {
  return new OpenAI({
    apiKey: 'ollama', // Required but unused for local Ollama
    baseURL: config.baseUrl,
  });
}
function convertMessagesToOpenAI(messages: ChatMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const allocateToolCallId = createToolCallIdAllocator(collectHistoricalToolCallIds(messages));
  const converted: OpenAIMessageParam[] = [];
  let pendingAssistant: {
    assistantIndex: number;
    expectedIds: Set<string>;
    resolvedIds: Set<string>;
  } | null = null;

  const closePendingAssistant = () => {
    if (!pendingAssistant) return;
    finalizePendingAssistantToolCalls(converted, pendingAssistant);
    pendingAssistant = null;
  };

  for (const message of messages) {
    if (pendingAssistant && message.role === 'tool') {
      const toolCallId = allocateToolCallId(message.tool_call_id);
      if (
        pendingAssistant.expectedIds.has(toolCallId)
        && !pendingAssistant.resolvedIds.has(toolCallId)
      ) {
        converted.push({
          role: 'tool',
          content: message.content,
          tool_call_id: toolCallId,
        });
        pendingAssistant.resolvedIds.add(toolCallId);

        if (pendingAssistant.resolvedIds.size === pendingAssistant.expectedIds.size) {
          pendingAssistant = null;
        }
      } else {
        logger.debug('OpenAI Direct: dropping unexpected tool message during conversion', {
          toolCallId,
        });
      }
      continue;
    }

    if (pendingAssistant && message.role !== 'tool') {
      closePendingAssistant();
    }

    switch (message.role) {
      case 'system':
        converted.push({
          role: 'system',
          content: message.content,
        });
        break;
      case 'user':
        converted.push({
          role: 'user',
          content: message.content,
        });
        break;
      case 'assistant': {
        const mappedToolCalls = Array.isArray(message.tool_calls)
          ? message.tool_calls.map((toolCall: any) => ({
            ...toolCall,
            id: allocateToolCallId(toolCall?.id),
          }))
          : [];

        const assistantMessage: OpenAIAssistantMessageParam = {
          role: 'assistant',
          content: message.content,
          ...(mappedToolCalls.length > 0 ? { tool_calls: mappedToolCalls as any } : {}),
        };
        converted.push(assistantMessage);

        if (mappedToolCalls.length > 0) {
          pendingAssistant = {
            assistantIndex: converted.length - 1,
            expectedIds: new Set(mappedToolCalls.map((tc: any) => String(tc.id))),
            resolvedIds: new Set<string>(),
          };
        }
        break;
      }
      case 'tool':
        logger.debug('OpenAI Direct: dropping orphaned tool message during conversion', {
          toolCallId: message.tool_call_id,
        });
        break;
      default:
        throw new Error(`Unsupported message role: ${(message as any).role}`);
    }
  }

  closePendingAssistant();
  return converted;
}

/**
 * Convert MCP tools from AI SDK format to OpenAI format
 */
function convertMCPToolsToOpenAI(mcpTools: Record<string, any>): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return Object.entries(mcpTools).map(([name, tool]) => ({
    type: 'function',
    function: {
      name,
      description: tool.description || '',
      parameters: tool.parameters || {},
    },
  }));
}

function shouldAttachTools(_provider: Agent['provider']): boolean {
  return true;
}

/**
 * Streaming OpenAI response handler - Pure client (no tool execution)
 * Returns LLMResponse with type='text' or type='tool_calls'
 */
export async function streamOpenAIResponse(
  client: OpenAI,
  model: string,
  messages: ChatMessage[],
  agent: Agent,
  mcpTools: Record<string, any>,
  world: World,
  onChunk: (content: string) => void,
  messageId: string,
  abortSignal?: AbortSignal
): Promise<LLMResponse> {
  const openaiMessages = convertMessagesToOpenAI(messages);
  const openaiTools =
    shouldAttachTools(agent.provider) && Object.keys(mcpTools).length > 0
      ? convertMCPToolsToOpenAI(mcpTools)
      : undefined;

  const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
    model,
    messages: openaiMessages,
    stream: true,
    temperature: agent.temperature,
    max_completion_tokens: agent.maxTokens,
    ...(openaiTools && { tools: openaiTools }),
  };

  logger.debug(`OpenAI Direct: Starting streaming request for agent=${agent.id}, model=${model}`, {
    messageCount: messages.length,
    hasTools: !!openaiTools,
    toolCount: openaiTools?.length || 0,
  });

  const stream = await client.chat.completions.create(
    requestParams,
    abortSignal ? { signal: abortSignal } : undefined
  );
  let fullResponse = '';
  let functionCalls: any[] = [];

  try {
    for await (const chunk of stream) {
      if (abortSignal?.aborted) {
        throw new DOMException('OpenAI stream aborted', 'AbortError');
      }
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        fullResponse += delta.content;
        onChunk(delta.content);
      }

      // Handle function calls
      if (delta?.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          if (toolCall.index !== undefined) {
            if (!functionCalls[toolCall.index]) {
              functionCalls[toolCall.index] = {
                id: toolCall.id,
                type: 'function',
                function: { name: toolCall.function?.name || '', arguments: '' },
              };
            }

            if (!functionCalls[toolCall.index].id && toolCall.id) {
              functionCalls[toolCall.index].id = toolCall.id;
            }

            if (
              toolCall.function?.name
              && toolCall.function.name.trim() !== ''
              && !functionCalls[toolCall.index].function.name
            ) {
              functionCalls[toolCall.index].function.name = toolCall.function.name;
            }

            if (toolCall.function?.arguments) {
              functionCalls[toolCall.index].function.arguments += toolCall.function.arguments;
            }
          }
        }
      }
    }

    // Return LLMResponse based on whether we have tool calls or text
    if (functionCalls.length > 0) {
      // Filter out invalid tool calls (empty or missing names)
      const validCalls = functionCalls.filter(
        fc => fc.function?.name && fc.function.name.trim() !== ''
      );
      const invalidCalls = functionCalls.filter(
        fc => !fc.function?.name || fc.function.name.trim() === ''
      );

      if (invalidCalls.length > 0) {
        logger.warn(`OpenAI Direct: Filtered ${invalidCalls.length} invalid tool calls (streaming)`, {
          agentId: agent.id,
          invalidCallIds: invalidCalls.map(fc => fc.id || 'no-id')
        });
      }

      logger.debug(`OpenAI Direct: Completed streaming request with tool calls for agent=${agent.id}`, {
        toolCount: validCalls.length,
        toolNames: validCalls.map(fc => fc.function?.name)
      });
      const allocateToolCallId = createToolCallIdAllocator();

      const toolCallsFormatted = validCalls.map(fc => ({
        id: allocateToolCallId(fc.id),
        type: 'function' as const,
        function: {
          name: fc.function!.name!,
          arguments: fc.function!.arguments || '{}',
        },
      }));

      return {
        type: 'tool_calls',
        content: fullResponse,
        tool_calls: toolCallsFormatted,
        assistantMessage: {
          role: 'assistant',
          content: fullResponse || '',
          tool_calls: toolCallsFormatted,
        },
        usage: undefined, // OpenAI streaming doesn't provide usage in final chunk
      };
    }

    logger.debug(`OpenAI Direct: Completed streaming request for agent=${agent.id}, responseLength=${fullResponse.length}`);
    return {
      type: 'text',
      content: fullResponse,
      assistantMessage: {
        role: 'assistant',
        content: fullResponse,
      },
      usage: undefined, // OpenAI streaming doesn't provide usage in final chunk
    };

  } catch (error) {
    logger.error(`OpenAI Direct: Streaming error for agent=${agent.id}:`, error);
    throw error;
  }
}

/**
 * Non-streaming OpenAI response handler - Pure client (no tool execution)
 * Returns LLMResponse with type='text' or type='tool_calls'
 */
export async function generateOpenAIResponse(
  client: OpenAI,
  model: string,
  messages: ChatMessage[],
  agent: Agent,
  mcpTools: Record<string, any>,
  world: World,
  abortSignal?: AbortSignal
): Promise<LLMResponse> {
  const openaiMessages = convertMessagesToOpenAI(messages);
  const openaiTools =
    shouldAttachTools(agent.provider) && Object.keys(mcpTools).length > 0
      ? convertMCPToolsToOpenAI(mcpTools)
      : undefined;

  const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model,
    messages: openaiMessages,
    temperature: agent.temperature,
    max_completion_tokens: agent.maxTokens,
    ...(openaiTools && { tools: openaiTools }),
  };

  logger.debug(`OpenAI Direct: Starting non-streaming request for agent=${agent.id}, model=${model}`, {
    messageCount: messages.length,
    hasTools: !!openaiTools,
    toolCount: openaiTools?.length || 0,
  });

  try {
    const response = await client.chat.completions.create(
      requestParams,
      abortSignal ? { signal: abortSignal } : undefined
    );
    const message = response.choices[0]?.message;

    if (!message) {
      throw new Error('No response message received from OpenAI');
    }

    let content = message.content || '';

    // Return LLMResponse based on whether we have tool calls or text
    if (message.tool_calls && message.tool_calls.length > 0) {
      // Filter out invalid tool calls (empty or missing names)
      const validToolCalls = message.tool_calls.filter(
        tc => tc.type === 'function' && tc.function?.name && tc.function.name.trim() !== ''
      );
      const invalidToolCalls = message.tool_calls.filter(
        tc => tc.type !== 'function' || !tc.function?.name || tc.function.name.trim() === ''
      );

      if (invalidToolCalls.length > 0) {
        logger.warn(`OpenAI Direct: Filtered ${invalidToolCalls.length} invalid tool calls (non-streaming)`, {
          agentId: agent.id,
          invalidCallIds: invalidToolCalls.map(tc => tc.id || 'no-id')
        });
      }

      logger.debug(`OpenAI Direct: Completed non-streaming request with tool calls for agent=${agent.id}`, {
        toolCount: validToolCalls.length,
        toolNames: validToolCalls.map(tc => tc.type === 'function' ? tc.function.name : 'unknown')
      });
      const allocateToolCallId = createToolCallIdAllocator();

      const toolCallsFormatted = validToolCalls.map(tc => {
        const funcCall = tc as OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall;
        return {
          id: allocateToolCallId(tc.id),
          type: 'function' as const,
          function: {
            name: funcCall.function.name,
            arguments: funcCall.function.arguments || '{}',
          },
        };
      });

      return {
        type: 'tool_calls',
        content: content,
        tool_calls: toolCallsFormatted,
        assistantMessage: {
          role: 'assistant',
          content: content,
          tool_calls: toolCallsFormatted,
        },
        usage: response.usage ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        } : undefined,
      };
    }

    logger.debug(`OpenAI Direct: Completed non-streaming request for agent=${agent.id}, responseLength=${content.length}`);
    return {
      type: 'text',
      content: content,
      assistantMessage: {
        role: 'assistant',
        content: content,
      },
      usage: response.usage ? {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
      } : undefined,
    };

  } catch (error) {
    logger.error(`OpenAI Direct: Generation error for agent=${agent.id}:`, error);
    throw error;
  }
}

/**
 * Factory function to create appropriate OpenAI client based on provider type
 */
export function createClientForProvider(providerType: string, config: any): OpenAI {
  switch (providerType) {
    case 'openai':
      return createOpenAIClient(config);
    case 'azure':
      return createAzureOpenAIClient(config);
    case 'openai-compatible':
      return createOpenAICompatibleClient(config);
    case 'xai':
      return createXAIClient(config);
    case 'ollama':
      return createOllamaClient(config);
    default:
      throw new Error(`Unsupported OpenAI provider type: ${providerType}`);
  }
}
