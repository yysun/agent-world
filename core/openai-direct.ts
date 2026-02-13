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
 * - 2026-02-13: Added abort-signal support for streaming and non-streaming calls to enable chat stop cancellation.
 * - 2026-02-10: Added env-flagged Ollama tool attachment support via ENABLE_OLLAMA_TOOLS
 * - 2026-02-07: Disabled tool definitions for Ollama provider requests
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
  return messages.map(message => {
    switch (message.role) {
      case 'system':
        return {
          role: 'system',
          content: message.content,
        };
      case 'user':
        return {
          role: 'user',
          content: message.content,
        };
      case 'assistant':
        return {
          role: 'assistant',
          content: message.content,
          ...(message.tool_calls && { tool_calls: message.tool_calls }),
        };
      case 'tool':
        return {
          role: 'tool',
          content: message.content,
          tool_call_id: message.tool_call_id!,
        };
      default:
        throw new Error(`Unsupported message role: ${(message as any).role}`);
    }
  });
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

function isTruthyEnvValue(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function shouldAttachTools(provider: Agent['provider']): boolean {
  if (provider !== 'ollama') {
    return true;
  }

  // Ollama frequently behaves better without OpenAI-style tool definitions attached.
  // Opt-in override: ENABLE_OLLAMA_TOOLS=true|1|yes|on
  return isTruthyEnvValue(process.env.ENABLE_OLLAMA_TOOLS);
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

      const toolCallsFormatted = validCalls.map(fc => ({
        id: fc.id!,
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

      const toolCallsFormatted = validToolCalls.map(tc => {
        const funcCall = tc as OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall;
        return {
          id: tc.id,
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
