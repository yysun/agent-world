/**
 * Anthropic Direct Integration Module - Pure Client (LLM Provider Refactoring Phase 3)
 *
 * Features:
 * - Direct Anthropic API integration bypassing AI SDK tool calling issues
 * - Streaming and non-streaming responses returning LLMResponse
 * - Function/tool calling detection (NO execution)
 * - Proper error handling and retry logic
 * - Browser-safe configuration injection
 * - Pure client: only calls APIs and returns structured data
 *
 * Implementation Details:
 * - Uses official @anthropic-ai/sdk package for reliable API access
 * - Converts AI SDK message format to Anthropic format
 * - Returns LLMResponse with type='text' or type='tool_calls'
 * - Streaming support with chunk-by-chunk processing via onChunk callback
 * - Error handling with descriptive messages
 * - Configuration injection from llm-config module
 * - NO event emission, NO storage, NO tool execution
 *
 * Recent Changes:
 * - 2025-11-09: Phase 3 - Removed ALL tool execution logic (~200 lines)
 * - Provider is now a pure client - only API calls and data transformation
 * - Returns LLMResponse interface with type discriminator
 * - Filters invalid tool calls (empty/missing names) and logs warnings
 * - Includes usage tracking (input_tokens, output_tokens) for non-streaming
 * - 2025-11-08: Removed ALL event emission from provider
 * - Streaming uses onChunk callback instead of direct SSE emission
 */

import Anthropic from '@anthropic-ai/sdk';
import { World, Agent, ChatMessage, LLMResponse } from './types.js';
import { getLLMProviderConfig, AnthropicConfig } from './llm-config.js';
import { createCategoryLogger } from './logger.js';

const logger = createCategoryLogger('anthropic');
const mcpLogger = createCategoryLogger('mcp.execution');

/**
 * Anthropic client factory
 */
export function createAnthropicClient(config: AnthropicConfig): Anthropic {
  return new Anthropic({
    apiKey: config.apiKey,
  });
}

/**
 * Convert AI SDK messages to Anthropic format
 */
function convertMessagesToAnthropic(messages: ChatMessage[]): Anthropic.Messages.MessageParam[] {
  return messages
    .filter(msg => msg.role !== 'system') // System prompt handled separately
    .map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: msg.tool_call_id || '',
              content: msg.content || '',
            },
          ],
        };
      }

      if (msg.role === 'assistant' && msg.tool_calls) {
        const content: any[] = [];

        if (msg.content) {
          content.push({
            type: 'text',
            text: msg.content,
          });
        }

        msg.tool_calls.forEach(toolCall => {
          content.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.function.name,
            input: JSON.parse(toolCall.function.arguments || '{}'),
          });
        });

        return {
          role: 'assistant' as const,
          content,
        };
      }

      return {
        role: msg.role as 'user' | 'assistant',
        content: msg.content || '',
      };
    });
}

/**
 * Convert MCP tools to Anthropic format
 */
function convertMCPToolsToAnthropic(mcpTools: Record<string, any>): Anthropic.Messages.Tool[] {
  return Object.entries(mcpTools).map(([name, tool]) => ({
    name,
    description: tool.description || '',
    input_schema: tool.inputSchema || { type: 'object', properties: {} },
  }));
}

/**
 * Extract system prompt from messages
 */
function extractSystemPrompt(messages: ChatMessage[]): string {
  const systemMessage = messages.find(msg => msg.role === 'system');
  return systemMessage?.content || 'You are a helpful assistant.';
}

/**
 * Streaming Anthropic response handler - Pure client (no tool execution)
 * Returns LLMResponse with type='text' or type='tool_calls'
 */
export async function streamAnthropicResponse(
  client: Anthropic,
  model: string,
  messages: ChatMessage[],
  agent: Agent,
  mcpTools: Record<string, any>,
  world: World,
  onChunk: (content: string) => void,
  messageId: string
): Promise<LLMResponse> {
  const anthropicMessages = convertMessagesToAnthropic(messages);
  const anthropicTools = Object.keys(mcpTools).length > 0 ? convertMCPToolsToAnthropic(mcpTools) : undefined;
  const systemPrompt = extractSystemPrompt(messages);

  const requestParams: Anthropic.Messages.MessageCreateParamsStreaming = {
    model,
    messages: anthropicMessages,
    system: systemPrompt,
    stream: true,
    temperature: agent.temperature,
    max_tokens: agent.maxTokens || 4096,
    ...(anthropicTools && { tools: anthropicTools }),
  };

  logger.debug(`Anthropic Direct: Starting streaming request for agent=${agent.id}, model=${model}`, {
    messageCount: messages.length,
    hasTools: !!anthropicTools,
    toolCount: anthropicTools?.length || 0,
  });

  const stream = await client.messages.create(requestParams);
  let fullResponse = '';
  let toolUses: any[] = [];

  try {
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta') {
        if (chunk.delta.type === 'text_delta') {
          const textDelta = chunk.delta.text;
          fullResponse += textDelta;
          onChunk(textDelta);
        }
      } else if (chunk.type === 'content_block_start') {
        if (chunk.content_block.type === 'tool_use') {
          toolUses.push(chunk.content_block);
        }
      }
    }

    // Return LLMResponse based on whether we have tool calls or text
    if (toolUses.length > 0) {
      // Normalize toolUses to function call format
      const toolCalls = toolUses
        .filter(tu => tu.name && tu.name.trim() !== '')
        .map(toolUse => ({
          id: toolUse.id,
          type: 'function' as const,
          function: {
            name: toolUse.name,
            arguments: JSON.stringify(toolUse.input),
          },
        }));

      const invalidCount = toolUses.length - toolCalls.length;
      if (invalidCount > 0) {
        logger.warn(`Anthropic Direct: Filtered ${invalidCount} invalid tool calls (streaming)`, {
          agentId: agent.id,
          totalToolUses: toolUses.length
        });
      }

      logger.debug(`Anthropic Direct: Completed streaming request with tool calls for agent=${agent.id}`, {
        toolCount: toolCalls.length,
        toolNames: toolCalls.map(tc => tc.function.name)
      });

      return {
        type: 'tool_calls',
        content: fullResponse,
        tool_calls: toolCalls,
        assistantMessage: {
          role: 'assistant',
          content: fullResponse || '',
          tool_calls: toolCalls,
        },
        usage: undefined, // Anthropic streaming doesn't provide usage in final chunk
      };
    }

    logger.debug(`Anthropic Direct: Completed streaming request for agent=${agent.id}, responseLength=${fullResponse.length}`);
    return {
      type: 'text',
      content: fullResponse,
      assistantMessage: {
        role: 'assistant',
        content: fullResponse,
      },
      usage: undefined, // Anthropic streaming doesn't provide usage in final chunk
    };

  } catch (error) {
    logger.error(`Anthropic Direct: Streaming error for agent=${agent.id}:`, error);
    throw error;
  }
}

/**
 * Non-streaming Anthropic response handler - Pure client (no tool execution)
 * Returns LLMResponse with type='text' or type='tool_calls'
 */
export async function generateAnthropicResponse(
  client: Anthropic,
  model: string,
  messages: ChatMessage[],
  agent: Agent,
  mcpTools: Record<string, any>,
  world: World
): Promise<LLMResponse> {
  const anthropicMessages = convertMessagesToAnthropic(messages);
  const anthropicTools = Object.keys(mcpTools).length > 0 ? convertMCPToolsToAnthropic(mcpTools) : undefined;
  const systemPrompt = extractSystemPrompt(messages);

  const requestParams: Anthropic.Messages.MessageCreateParamsNonStreaming = {
    model,
    messages: anthropicMessages,
    system: systemPrompt,
    temperature: agent.temperature,
    max_tokens: agent.maxTokens || 4096,
    ...(anthropicTools && { tools: anthropicTools }),
  };

  logger.debug(`Anthropic Direct: Starting non-streaming request for agent=${agent.id}, model=${model}`, {
    messageCount: messages.length,
    hasTools: !!anthropicTools,
    toolCount: anthropicTools?.length || 0,
  });

  try {
    const response = await client.messages.create(requestParams);

    let content = '';
    let toolUses: any[] = [];

    // Extract content and tool uses from response
    response.content.forEach(block => {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolUses.push(block);
      }
    });

    // Return LLMResponse based on whether we have tool calls or text
    if (toolUses.length > 0) {
      // Normalize toolUses to function call format
      const toolCalls = toolUses
        .filter(tu => tu.name && tu.name.trim() !== '')
        .map(toolUse => ({
          id: toolUse.id,
          type: 'function' as const,
          function: {
            name: toolUse.name,
            arguments: JSON.stringify(toolUse.input),
          },
        }));

      const invalidCount = toolUses.length - toolCalls.length;
      if (invalidCount > 0) {
        logger.warn(`Anthropic Direct: Filtered ${invalidCount} invalid tool calls (non-streaming)`, {
          agentId: agent.id,
          totalToolUses: toolUses.length
        });
      }

      logger.debug(`Anthropic Direct: Completed non-streaming request with tool calls for agent=${agent.id}`, {
        toolCount: toolCalls.length,
        toolNames: toolCalls.map(tc => tc.function.name)
      });

      return {
        type: 'tool_calls',
        content: content,
        tool_calls: toolCalls,
        assistantMessage: {
          role: 'assistant',
          content: content,
          tool_calls: toolCalls,
        },
        usage: response.usage ? {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        } : undefined,
      };
    }

    logger.debug(`Anthropic Direct: Completed non-streaming request for agent=${agent.id}, responseLength=${content.length}`);
    return {
      type: 'text',
      content: content,
      assistantMessage: {
        role: 'assistant',
        content: content,
      },
      usage: response.usage ? {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      } : undefined,
    };

  } catch (error) {
    logger.error(`Anthropic Direct: Generation error for agent=${agent.id}:`, error);
    throw error;
  }
}

/**
 * Factory function to create Anthropic client for agent
 */
export function createAnthropicClientForAgent(agent: Agent): Anthropic {
  const config = getLLMProviderConfig(agent.provider) as AnthropicConfig;
  return createAnthropicClient(config);
}