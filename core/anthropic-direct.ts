/**
 * Anthropic Direct Integration Module - Direct Anthropic SDK Integration  
 *
 * Features:
 * - Direct Anthropic API integration bypassing AI SDK tool calling issues
 * - Streaming and non-streaming responses with SSE events
 * - Function/tool calling support with MCP tool integration
 * - Proper error handling and retry logic
 * - Browser-safe configuration injection
 * - World-aware event publishing using world.eventEmitter
 *
 * Implementation Details:
 * - Uses official @anthropic-ai/sdk package for reliable API access
 * - Converts AI SDK message format to Anthropic format
 * - Handles tool calling with proper tool result processing
 * - Streaming support with chunk-by-chunk processing
 * - Error handling with descriptive messages
 * - Configuration injection from llm-config module
 * - World-scoped event emission for proper isolation
 *
 * Recent Changes:
 * - Added 'end' event emission after streaming completion to signal CLI properly
 * - Added validation and handling for tool calls with empty or missing names
 */

import Anthropic from '@anthropic-ai/sdk';
import { World, Agent, ChatMessage, AgentMessage, WorldSSEEvent } from './types.js';
import { getLLMProviderConfig, AnthropicConfig } from './llm-config.js';
import { createCategoryLogger } from './logger.js';
import { generateId } from './utils.js';
import { filterAndHandleEmptyNamedFunctionCalls, generateFallbackId } from './tool-utils.js';
import { publishToolEvent, publishSSE } from './events.js';

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
 * Streaming Anthropic response handler
 */
export async function streamAnthropicResponse(
  client: Anthropic,
  model: string,
  messages: ChatMessage[],
  agent: Agent,
  mcpTools: Record<string, any>,
  world: World,
  publishSSE: (world: World, data: Partial<WorldSSEEvent>) => void,
  messageId: string
): Promise<string> {
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
          publishSSE(world, {
            agentName: agent.id,
            type: 'chunk',
            content: textDelta,
            messageId,
          });
        }
      } else if (chunk.type === 'content_block_start') {
        if (chunk.content_block.type === 'tool_use') {
          toolUses.push(chunk.content_block);
        }
      }
    }

    // Process tool calls if any
    // NOTE: Do NOT emit 'end' event yet if there are tool calls - it will be emitted after tool execution
    if (toolUses.length > 0) {
      // Normalize toolUses to function call format for filtering
      const functionCalls = toolUses.map(toolUse => ({
        id: toolUse.id,
        type: 'function' as const,
        function: {
          name: toolUse.name,
          arguments: JSON.stringify(toolUse.input),
        },
      }));

      // Filter and handle function calls with empty or missing names
      const { validCalls, toolResults: emptyNameToolResults } = filterAndHandleEmptyNamedFunctionCalls(
        functionCalls,
        world,
        agent,
        messageId
      );

      const sequenceId = generateId();
      mcpLogger.debug(`MCP tool call sequence starting (Anthropic streaming)`, {
        sequenceId,
        agentId: agent.id,
        messageId,
        toolCount: validCalls.length,
        toolNames: validCalls.map(fc => fc.function!.name!)
      });

      // Add assistant message with tool uses (include all calls, even invalid ones)
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: fullResponse || '',
        tool_calls: functionCalls,
      };

      // Execute tool calls and get results
      const toolResults: ChatMessage[] = [...emptyNameToolResults];

      for (let i = 0; i < validCalls.length; i++) {
        const toolCall = validCalls[i];
        const toolUse = { id: toolCall.id!, name: toolCall.function!.name!, input: JSON.parse(toolCall.function!.arguments || '{}') };
        const startTime = performance.now();

        try {
          const tool = mcpTools[toolUse.name];
          if (tool && tool.execute) {
            // Publish tool start event to world channel (agent behavioral event)
            publishToolEvent(world, {
              agentName: agent.id,
              type: 'tool-start',
              messageId,
              toolExecution: {
                toolName: toolUse.name,
                toolCallId: toolUse.id,
                sequenceId,
                input: JSON.stringify(toolUse.input)
              }
            });

            mcpLogger.debug(`MCP tool execution starting (Anthropic streaming)`, {
              sequenceId,
              toolIndex: i,
              toolName: toolUse.name,
              toolUseId: toolUse.id,
              agentId: agent.id,
              messageId,
              argsPresent: !!toolUse.input
            });

            const result = await tool.execute(toolUse.input, sequenceId, `anthropic-streaming-${messageId}`, {
              world,
              worldId: world.id,
              chatId: world.currentChatId ?? null,
              agentId: agent.id,
              messages: messages
            });
            const duration = performance.now() - startTime;

            // Check if tool execution returned stop processing marker (e.g., for approval)
            if (result && typeof result === 'object' && result._stopProcessing) {
              mcpLogger.debug(`Tool execution stopped - approval required (Anthropic streaming)`, {
                sequenceId,
                toolIndex: i,
                toolName: toolUse.name,
                agentId: agent.id,
                messageId
              });

              // Approval request was already published as message event by wrapToolWithValidation
              // Just end the streaming to signal completion
              publishSSE(world, {
                agentName: agent.id,
                type: 'end',
                messageId
              });

              return '';
            }

            const resultString = JSON.stringify(result);

            mcpLogger.debug(`MCP tool execution completed (Anthropic streaming)`, {
              sequenceId,
              toolIndex: i,
              toolName: toolUse.name,
              toolUseId: toolUse.id,
              agentId: agent.id,
              messageId,
              status: 'success',
              duration: Math.round(duration * 100) / 100,
              resultSize: resultString.length,
              resultPreview: resultString.slice(0, 200) + (resultString.length > 200 ? '...' : '')
            });

            // Publish tool result event to world channel (agent behavioral event)
            publishToolEvent(world, {
              agentName: agent.id,
              type: 'tool-result',
              messageId,
              toolExecution: {
                toolName: toolUse.name,
                toolCallId: toolUse.id,
                sequenceId,
                duration: Math.round(duration * 100) / 100,
                input: JSON.stringify(toolUse.input),
                result: result,
                resultType: typeof result as any,
                resultSize: resultString.length
              }
            });

            toolResults.push({
              role: 'tool',
              content: resultString,
              tool_call_id: toolUse.id,
            });
          }
        } catch (error) {
          const duration = performance.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Let ApprovalRequiredException bubble up to llm-manager
          throw error;

          mcpLogger.error(`MCP tool execution failed (Anthropic streaming): ${errorMessage}`, {
            sequenceId,
            toolIndex: i,
            toolName: toolUse.name,
            toolUseId: toolUse.id,
            agentId: agent.id,
            messageId,
            status: 'error',
            duration: Math.round(duration * 100) / 100,
            error: errorMessage
          });

          // Publish tool error event to world channel (agent behavioral event)
          publishToolEvent(world, {
            agentName: agent.id,
            type: 'tool-error',
            messageId,
            toolExecution: {
              toolName: toolUse.name,
              toolCallId: toolUse.id,
              sequenceId,
              error: errorMessage,
              duration: Math.round(duration * 100) / 100
            }
          });

          toolResults.push({
            role: 'tool',
            content: `Error: ${errorMessage}`,
            tool_call_id: toolUse.id,
          });
        }
      }

      mcpLogger.debug(`MCP tool call sequence completed (Anthropic streaming)`, {
        sequenceId,
        agentId: agent.id,
        messageId,
        toolCount: toolUses.length,
        successCount: toolResults.filter(tr => !tr.content.startsWith('Error:')).length,
        errorCount: toolResults.filter(tr => tr.content.startsWith('Error:')).length
      });

      // If we have tool results, make another request to get the final response
      if (toolResults.length > 0) {
        const followUpMessages = [...messages, assistantMessage, ...toolResults];

        // Use streaming for the follow-up response to ensure it gets displayed
        const followUpResponse = await streamAnthropicResponse(
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

    // Emit 'end' event only when there are no tool calls (if there are tool calls, the recursive call will emit the 'end' event)
    publishSSE(world, {
      agentName: agent.id,
      type: 'end',
      messageId,
    });

    logger.debug(`Anthropic Direct: Completed streaming request for agent=${agent.id}, responseLength=${fullResponse.length}`);
    return fullResponse;

  } catch (error) {
    logger.error(`Anthropic Direct: Streaming error for agent=${agent.id}:`, error);
    throw error;
  }
}

/**
 * Non-streaming Anthropic response handler
 */
export async function generateAnthropicResponse(
  client: Anthropic,
  model: string,
  messages: ChatMessage[],
  agent: Agent,
  mcpTools: Record<string, any>,
  world: World
): Promise<string> {
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

    // Handle tool calls if any
    if (toolUses.length > 0) {
      // Normalize toolUses to function call format for filtering
      const functionCalls = toolUses.map(toolUse => ({
        id: toolUse.id,
        type: 'function' as const,
        function: {
          name: toolUse.name,
          arguments: JSON.stringify(toolUse.input),
        },
      }));

      // Filter out function calls with empty or missing names (non-streaming - no SSE events)
      const validFunctionCalls = functionCalls.filter(fc => fc.function?.name && fc.function.name.trim() !== '');
      const invalidFunctionCalls = functionCalls.filter(fc => !fc.function?.name || fc.function.name.trim() === '');

      const sequenceId = generateId();
      mcpLogger.debug(`MCP tool call sequence starting (Anthropic non-streaming)`, {
        sequenceId,
        agentId: agent.id,
        toolCount: validFunctionCalls.length,
        invalidToolCount: invalidFunctionCalls.length,
        toolNames: validFunctionCalls.map(fc => fc.function.name)
      });

      // Execute tool calls
      const toolResults: ChatMessage[] = [];

      // Add tool results for invalid calls (empty or missing names)
      for (const invalidCall of invalidFunctionCalls) {
        const toolCallId = invalidCall.id || generateFallbackId();
        toolResults.push({
          role: 'tool',
          content: `Error: Malformed tool call - empty or missing tool name. Tool call ID: ${toolCallId}`,
          tool_call_id: toolCallId,
        });
      }

      for (let i = 0; i < validFunctionCalls.length; i++) {
        const toolCall = validFunctionCalls[i];
        const toolUse = { id: toolCall.id, name: toolCall.function.name, input: JSON.parse(toolCall.function.arguments || '{}') };
        const startTime = performance.now();

        try {
          const tool = mcpTools[toolUse.name];
          if (tool && tool.execute) {
            mcpLogger.debug(`MCP tool execution starting (Anthropic non-streaming)`, {
              sequenceId,
              toolIndex: i,
              toolName: toolUse.name,
              toolUseId: toolUse.id,
              agentId: agent.id,
              argsPresent: !!toolUse.input
            });

            const result = await tool.execute(toolUse.input, sequenceId, `anthropic-non-streaming-${agent.id}`, {
              world,
              worldId: world.id,
              chatId: world.currentChatId ?? null,
              agentId: agent.id,
              messages: messages
            });
            const duration = performance.now() - startTime;

            // Check if tool execution returned stop processing marker (e.g., for approval)
            if (result && typeof result === 'object' && result._stopProcessing) {
              mcpLogger.debug(`Tool execution stopped - approval required (Anthropic non-streaming)`, {
                sequenceId,
                toolIndex: i,
                toolName: toolUse.name,
                agentId: agent.id
              });

              // Return the approval message from wrapToolWithValidation
              return result._approvalMessage;
            }

            const resultString = JSON.stringify(result);

            mcpLogger.debug(`MCP tool execution completed (Anthropic non-streaming)`, {
              sequenceId,
              toolIndex: i,
              toolName: toolUse.name,
              toolUseId: toolUse.id,
              agentId: agent.id,
              status: 'success',
              duration: Math.round(duration * 100) / 100,
              resultSize: resultString.length,
              resultPreview: resultString.slice(0, 200) + (resultString.length > 200 ? '...' : '')
            });

            toolResults.push({
              role: 'tool',
              content: resultString,
              tool_call_id: toolUse.id,
            });
          }
        } catch (error) {
          const duration = performance.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Let ApprovalRequiredException bubble up to llm-manager
          throw error;

          mcpLogger.error(`MCP tool execution failed (Anthropic non-streaming): ${errorMessage}`, {
            sequenceId,
            toolIndex: i,
            toolName: toolUse.name,
            toolUseId: toolUse.id,
            agentId: agent.id,
            status: 'error',
            duration: Math.round(duration * 100) / 100,
            error: errorMessage
          });

          toolResults.push({
            role: 'tool',
            content: `Error: ${errorMessage}`,
            tool_call_id: toolUse.id,
          });
        }
      }

      mcpLogger.debug(`MCP tool call sequence completed (Anthropic non-streaming)`, {
        sequenceId,
        agentId: agent.id,
        toolCount: validFunctionCalls.length,
        successCount: toolResults.filter(tr => !tr.content.startsWith('Error:')).length,
        errorCount: toolResults.filter(tr => tr.content.startsWith('Error:')).length
      });

      // If we have tool results, make another request to get the final response
      if (toolResults.length > 0) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: content,
          tool_calls: functionCalls,
        };

        const followUpMessages = [...messages, assistantMessage, ...toolResults];
        const followUpResponse = await generateAnthropicResponse(client, model, followUpMessages, agent, mcpTools, world);
        return followUpResponse;
      }
    }

    logger.debug(`Anthropic Direct: Completed non-streaming request for agent=${agent.id}, responseLength=${content.length}`);
    return content;

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