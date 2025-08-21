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
 * - Ollama: Direct integration using OpenAI package with Ollama's OpenAI-compatible endpoint
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
 * - Consolidated MCP tool logging under LOG_LLM_MCP category
 * - Added comprehensive tool execution tracking with performance metrics
 * - Implemented tool call sequence tracking and dependency relationships
 * - Enhanced logging with result content analysis and execution status
 * - Fixed MCP tool result display: Follow-up responses now stream properly to UI
 */

import OpenAI from 'openai';
import { World, Agent, ChatMessage, WorldSSEEvent } from './types.js';
import { getLLMProviderConfig, OpenAIConfig, AzureConfig, OpenAICompatibleConfig, XAIConfig, OllamaConfig } from './llm-config.js';
import { createCategoryLogger } from './logger.js';
import { generateId } from './utils.js';

const logger = createCategoryLogger('openai-direct');
const mcpLogger = createCategoryLogger('llm.mcp');

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
      const sequenceId = generateId();
      mcpLogger.debug(`MCP tool call sequence starting (streaming)`, {
        sequenceId,
        agentId: agent.id,
        messageId,
        toolCount: functionCalls.length,
        toolNames: functionCalls.map(fc => fc.function.name)
      });

      // Add assistant message with tool calls
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: fullResponse || '',
        tool_calls: functionCalls,
      };

      // Execute function calls and get results
      const toolResults: ChatMessage[] = [];
      for (let i = 0; i < functionCalls.length; i++) {
        const toolCall = functionCalls[i];
        const startTime = performance.now();

        try {
          const tool = mcpTools[toolCall.function.name];
          if (tool && tool.execute) {
            mcpLogger.debug(`MCP tool execution starting (streaming)`, {
              sequenceId,
              toolIndex: i,
              toolName: toolCall.function.name,
              toolCallId: toolCall.id,
              agentId: agent.id,
              messageId,
              argsPresent: !!toolCall.function.arguments
            });

            let args: any = {};
            try {
              args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
            } catch (err) {
              const parseErr = err instanceof Error ? err.message : String(err);
              mcpLogger.error(`MCP tool arguments parse error (streaming): ${parseErr}`, {
                sequenceId,
                toolIndex: i,
                toolName: toolCall.function.name,
                toolCallId: toolCall.id,
                agentId: agent.id,
                messageId
              });

              toolResults.push({
                role: 'tool',
                content: `Error: Tool arguments parse error: ${parseErr}`,
                tool_call_id: toolCall.id,
              });
              // Skip executing this tool due to parse error
              continue;
            }

            const result = await tool.execute(args, sequenceId, `streaming-${messageId}`);
            const duration = performance.now() - startTime;
            const resultString = JSON.stringify(result);

            mcpLogger.debug(`MCP tool execution completed (streaming)`, {
              sequenceId,
              toolIndex: i,
              toolName: toolCall.function.name,
              toolCallId: toolCall.id,
              agentId: agent.id,
              messageId,
              status: 'success',
              duration: Math.round(duration * 100) / 100,
              resultSize: resultString.length,
              resultPreview: resultString.slice(0, 200) + (resultString.length > 200 ? '...' : '')
            });

            toolResults.push({
              role: 'tool',
              content: resultString,
              tool_call_id: toolCall.id,
            });
          }
        } catch (error) {
          const duration = performance.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);

          mcpLogger.error(`MCP tool execution failed (streaming): ${errorMessage}`, {
            sequenceId,
            toolIndex: i,
            toolName: toolCall.function.name,
            toolCallId: toolCall.id,
            agentId: agent.id,
            messageId,
            status: 'error',
            duration: Math.round(duration * 100) / 100,
            error: errorMessage,
            errorStack: error instanceof Error ? error.stack : undefined
          });

          toolResults.push({
            role: 'tool',
            content: `Error: ${(error as Error).message}`,
            tool_call_id: toolCall.id,
          });
        }
      }

      mcpLogger.debug(`MCP tool call sequence completed (streaming)`, {
        sequenceId,
        agentId: agent.id,
        messageId,
        toolCount: functionCalls.length,
        successCount: toolResults.filter(tr => !tr.content.startsWith('Error:')).length,
        errorCount: toolResults.filter(tr => tr.content.startsWith('Error:')).length
      });

      // If we have tool results, make another request to get the final response
      if (toolResults.length > 0) {
        const followUpMessages = [...messages, assistantMessage, ...toolResults];

        // Use streaming for the follow-up response to ensure it gets displayed
        const followUpResponse = await streamOpenAIResponse(
          client,
          model,
          followUpMessages,
          agent,
          {}, // Do not include tools for follow-up to prevent infinite recursion
          world,
          publishSSE,
          messageId
        );
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
      const sequenceId = generateId();
      mcpLogger.debug(`MCP tool call sequence starting (non-streaming)`, {
        sequenceId,
        agentId: agent.id,
        toolCount: message.tool_calls.length,
        toolNames: message.tool_calls.map(tc => tc.function.name)
      });

      // Execute function calls
      const toolResults: ChatMessage[] = [];
      for (let i = 0; i < message.tool_calls.length; i++) {
        const toolCall = message.tool_calls[i];
        const startTime = performance.now();

        try {
          const tool = mcpTools[toolCall.function.name];
          if (tool && tool.execute) {
            mcpLogger.debug(`MCP tool execution starting (non-streaming)`, {
              sequenceId,
              toolIndex: i,
              toolName: toolCall.function.name,
              toolCallId: toolCall.id,
              agentId: agent.id,
              argsPresent: !!toolCall.function.arguments
            });

            let args: any = {};
            try {
              args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
            } catch (err) {
              const parseErr = err instanceof Error ? err.message : String(err);
              mcpLogger.error(`MCP tool arguments parse error (non-streaming): ${parseErr}`, {
                sequenceId,
                toolIndex: i,
                toolName: toolCall.function.name,
                toolCallId: toolCall.id,
                agentId: agent.id
              });

              toolResults.push({
                role: 'tool',
                content: `Error: Tool arguments parse error: ${parseErr}`,
                tool_call_id: toolCall.id,
              });
              // Skip executing this tool due to parse error
              continue;
            }

            const result = await tool.execute(args, sequenceId, `non-streaming-${agent.id}`);
            const duration = performance.now() - startTime;
            const resultString = JSON.stringify(result);

            mcpLogger.debug(`MCP tool execution completed (non-streaming)`, {
              sequenceId,
              toolIndex: i,
              toolName: toolCall.function.name,
              toolCallId: toolCall.id,
              agentId: agent.id,
              status: 'success',
              duration: Math.round(duration * 100) / 100,
              resultSize: resultString.length,
              resultPreview: resultString.slice(0, 200) + (resultString.length > 200 ? '...' : '')
            });

            toolResults.push({
              role: 'tool',
              content: resultString,
              tool_call_id: toolCall.id,
            });
          }
        } catch (error) {
          const duration = performance.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);

          mcpLogger.error(`MCP tool execution failed (non-streaming): ${errorMessage}`, {
            sequenceId,
            toolIndex: i,
            toolName: toolCall.function.name,
            toolCallId: toolCall.id,
            agentId: agent.id,
            status: 'error',
            duration: Math.round(duration * 100) / 100,
            error: errorMessage,
            errorStack: error instanceof Error ? error.stack : undefined
          });

          toolResults.push({
            role: 'tool',
            content: `Error: ${(error as Error).message}`,
            tool_call_id: toolCall.id,
          });
        }
      }

      mcpLogger.debug(`MCP tool call sequence completed (non-streaming)`, {
        sequenceId,
        agentId: agent.id,
        toolCount: message.tool_calls.length,
        successCount: toolResults.filter(tr => !tr.content.startsWith('Error:')).length,
        errorCount: toolResults.filter(tr => tr.content.startsWith('Error:')).length
      });

      // If we have tool results, make another request to get the final response
      if (toolResults.length > 0) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: content,
          tool_calls: message.tool_calls,
        };

        const followUpMessages = [...messages, assistantMessage, ...toolResults];
        const followUpResponse = await generateOpenAIResponse(client, model, followUpMessages, agent, mcpTools);
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
    case 'ollama':
      return createOllamaClient(config);
    default:
      throw new Error(`Unsupported OpenAI provider type: ${providerType}`);
  }
}