/**
 * OpenAI Direct Integration Module - Direct OpenAI Package Integration
 *
 * Features:
 * - Direct OpenAI API integration bypassing AI SDK schema corruption bug
 * - Support for OpenAI, Azure OpenAI, and OpenAI-compatible providers
 * - Streaming and non-streaming responses with SSE events
 * - Function/tool calling support with MCP tool integration
 * - Proper error handling and retry logic
 * - Browser-safe configuration injection
 * - World-aware event publishing using world.eventEmitter
 *
 * Provider Support:
 * - OpenAI: Direct integration with OpenAI API
 * - Azure OpenAI: Direct integration with Azure OpenAI endpoints
 * - OpenAI-Compatible: Direct integration with custom OpenAI-compatible APIs
 * - XAI: Direct integration using OpenAI package with custom base URL
 *
 * Implementation Details:
 * - Uses official OpenAI package for reliable API access
 * - Converts AI SDK message format to OpenAI format
 * - Handles function calling with proper tool result processing
 * - Streaming support with chunk-by-chunk processing
 * - Error handling with descriptive messages
 * - Configuration injection from llm-config module
 * - World-scoped event emission for proper isolation
 *
 * Recent Changes:
 * - Initial implementation with full OpenAI package integration
 * - Added streaming and non-streaming response handlers
 * - Implemented function calling support with MCP tools
 * - Added configuration injection for browser compatibility
 * - Created OpenAI client factory functions for all supported providers
 */

import OpenAI from 'openai';
import { World, Agent, ChatMessage, WorldSSEEvent } from './types.js';
import { getLLMProviderConfig, OpenAIConfig, AzureConfig, OpenAICompatibleConfig, XAIConfig } from './llm-config.js';
import { createCategoryLogger } from './logger.js';
import { generateId } from './utils.js';

const logger = createCategoryLogger('openai-direct');

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
 * Convert AI SDK message format to OpenAI format
 */
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

/**
 * Streaming OpenAI response handler
 */
export async function streamOpenAIResponse(
  client: OpenAI,
  model: string,
  messages: ChatMessage[],
  agent: Agent,
  mcpTools: Record<string, any>,
  world: World,
  publishSSE: (world: World, data: Partial<WorldSSEEvent>) => void,
  messageId: string
): Promise<string> {
  const openaiMessages = convertMessagesToOpenAI(messages);
  const openaiTools = Object.keys(mcpTools).length > 0 ? convertMCPToolsToOpenAI(mcpTools) : undefined;

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

  const stream = await client.chat.completions.create(requestParams);
  let fullResponse = '';
  let functionCalls: any[] = [];

  try {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      
      if (delta?.content) {
        fullResponse += delta.content;
        publishSSE(world, {
          agentName: agent.id,
          type: 'chunk',
          content: delta.content,
          messageId,
        });
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

    // Process function calls if any
    if (functionCalls.length > 0) {
      logger.debug(`OpenAI Direct: Processing ${functionCalls.length} function calls for agent=${agent.id}`);
      
      // Add assistant message with tool calls
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: fullResponse || '',
        tool_calls: functionCalls,
      };

      // Execute function calls and get results
      const toolResults: ChatMessage[] = [];
      for (const toolCall of functionCalls) {
        try {
          const tool = mcpTools[toolCall.function.name];
          if (tool && tool.execute) {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await tool.execute(args);
            
            toolResults.push({
              role: 'tool',
              content: JSON.stringify(result),
              tool_call_id: toolCall.id,
            });
          }
        } catch (error) {
          logger.error(`OpenAI Direct: Function call error for ${toolCall.function.name}:`, error);
          toolResults.push({
            role: 'tool',
            content: `Error: ${(error as Error).message}`,
            tool_call_id: toolCall.id,
          });
        }
      }

      // If we have tool results, make another request to get the final response
      if (toolResults.length > 0) {
        const followUpMessages = [...messages, assistantMessage, ...toolResults];
        const followUpResponse = await generateOpenAIResponse(client, model, followUpMessages, agent, {});
        return followUpResponse;
      }
    }

    logger.debug(`OpenAI Direct: Completed streaming request for agent=${agent.id}, responseLength=${fullResponse.length}`);
    return fullResponse;

  } catch (error) {
    logger.error(`OpenAI Direct: Streaming error for agent=${agent.id}:`, error);
    throw error;
  }
}

/**
 * Non-streaming OpenAI response handler
 */
export async function generateOpenAIResponse(
  client: OpenAI,
  model: string,
  messages: ChatMessage[],
  agent: Agent,
  mcpTools: Record<string, any>
): Promise<string> {
  const openaiMessages = convertMessagesToOpenAI(messages);
  const openaiTools = Object.keys(mcpTools).length > 0 ? convertMCPToolsToOpenAI(mcpTools) : undefined;

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
    const response = await client.chat.completions.create(requestParams);
    const message = response.choices[0]?.message;

    if (!message) {
      throw new Error('No response message received from OpenAI');
    }

    let content = message.content || '';

    // Handle function calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      logger.debug(`OpenAI Direct: Processing ${message.tool_calls.length} function calls for agent=${agent.id}`);

      // Execute function calls
      const toolResults: ChatMessage[] = [];
      for (const toolCall of message.tool_calls) {
        try {
          const tool = mcpTools[toolCall.function.name];
          if (tool && tool.execute) {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await tool.execute(args);
            
            toolResults.push({
              role: 'tool',
              content: JSON.stringify(result),
              tool_call_id: toolCall.id,
            });
          }
        } catch (error) {
          logger.error(`OpenAI Direct: Function call error for ${toolCall.function.name}:`, error);
          toolResults.push({
            role: 'tool',
            content: `Error: ${(error as Error).message}`,
            tool_call_id: toolCall.id,
          });
        }
      }

      // If we have tool results, make another request to get the final response
      if (toolResults.length > 0) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: content,
          tool_calls: message.tool_calls,
        };

        const followUpMessages = [...messages, assistantMessage, ...toolResults];
        const followUpResponse = await generateOpenAIResponse(client, model, followUpMessages, agent, {});
        return followUpResponse;
      }
    }

    logger.debug(`OpenAI Direct: Completed non-streaming request for agent=${agent.id}, responseLength=${content.length}`);
    return content;

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
    default:
      throw new Error(`Unsupported OpenAI provider type: ${providerType}`);
  }
}