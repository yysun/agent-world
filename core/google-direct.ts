/**
 * Google Direct Integration Module - Direct Google Generative AI SDK Integration
 *
 * Features:
 * - Direct Google Generative AI API integration
 * - Streaming and non-streaming responses (providers return data only)
 * - Function/tool calling support with MCP tool integration
 * - Proper error handling and retry logic
 * - Browser-safe configuration injection
 * - Clean separation: providers return data via callbacks, llm-manager handles events/storage
 * - Uses onChunk callback for streaming instead of direct event emission
 *
 * Implementation Details:
 * - Uses official @google/generative-ai package for reliable API access
 * - Converts AI SDK message format to Google Generative AI format
 * - Handles tool calling with proper tool result processing
 * - Streaming support with chunk-by-chunk processing
 * - Error handling with descriptive messages
 * - Configuration injection from llm-config module
 * - World-scoped event emission for proper isolation
 *
 * Recent Changes:
 * - 2025-11-08: Removed ALL event emission from provider (publishToolEvent, publishSSE)
 * - Streaming uses onChunk callback instead of publishSSE - llm-manager emits SSE events
 * - Provider is now completely event-free and storage-free
 * - Returns structured approval_flow object with both original and approval messages
 * - Pure data transformation and LLM API calls only
 * - Initial implementation with full Google Generative AI SDK integration
 * - Added streaming and non-streaming response handlers
 * - Implemented tool calling support with MCP tools
 * - Added validation and handling for tool calls with empty or missing names
 * - Added validation and handling for tool calls with empty or missing names
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { World, Agent, ChatMessage, AgentMessage, WorldSSEEvent } from './types.js';
import { getLLMProviderConfig, GoogleConfig } from './llm-config.js';
import { createCategoryLogger } from './logger.js';
import { generateId } from './utils.js';
import { filterAndHandleEmptyNamedFunctionCalls, generateFallbackId } from './tool-utils.js';

const logger = createCategoryLogger('llm.google');
const mcpLogger = createCategoryLogger('mcp.execution');

/**
 * Google client factory
 */
export function createGoogleClient(config: GoogleConfig): GoogleGenerativeAI {
  return new GoogleGenerativeAI(config.apiKey);
}

/**
 * Create Google model instance
 */
export function createGoogleModel(client: GoogleGenerativeAI, modelName: string, tools?: any[]): GenerativeModel {
  return client.getGenerativeModel({
    model: modelName,
    ...(tools && tools.length > 0 && { tools: [{ functionDeclarations: tools }] })
  });
}

/**
 * Convert AI SDK messages to Google format
 */
function convertMessagesToGoogle(messages: ChatMessage[]): { messages: any[], systemInstruction: string } {
  const googleMessages: any[] = [];
  let systemInstruction = '';

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = msg.content || '';
      continue;
    }

    if (msg.role === 'tool') {
      // Tool responses are handled as function responses in Google format
      googleMessages.push({
        role: 'function',
        parts: [{
          functionResponse: {
            name: msg.tool_call_id, // Use tool_call_id as the function name reference
            response: {
              result: msg.content
            }
          }
        }]
      });
      continue;
    }

    if (msg.role === 'assistant' && msg.tool_calls) {
      // Assistant message with function calls
      const parts: any[] = [];

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      msg.tool_calls.forEach(toolCall => {
        parts.push({
          functionCall: {
            name: toolCall.function.name,
            args: JSON.parse(toolCall.function.arguments || '{}')
          }
        });
      });

      googleMessages.push({
        role: 'model',
        parts
      });
      continue;
    }

    // Regular user/assistant messages
    googleMessages.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content || '' }]
    });
  }

  return { messages: googleMessages, systemInstruction };
}

/**
 * Convert MCP tools to Google format
 */
function convertMCPToolsToGoogle(mcpTools: Record<string, any>): any[] {
  return Object.entries(mcpTools).map(([name, tool]) => ({
    name,
    description: tool.description || '',
    parameters: tool.inputSchema || { type: 'object', properties: {} },
  }));
}

/**
 * Streaming Google response handler
 */
export async function streamGoogleResponse(
  client: GoogleGenerativeAI,
  model: string,
  messages: ChatMessage[],
  agent: Agent,
  mcpTools: Record<string, any>,
  world: World,
  onChunk: (content: string) => void,
  messageId: string
): Promise<string | { type: string; originalMessage: any; approvalMessage: any }> {
  const googleTools = Object.keys(mcpTools).length > 0 ? convertMCPToolsToGoogle(mcpTools) : undefined;
  const { messages: googleMessages, systemInstruction } = convertMessagesToGoogle(messages);

  const generativeModel = client.getGenerativeModel({
    model,
    systemInstruction: systemInstruction || undefined,
    ...(googleTools && googleTools.length > 0 && { tools: [{ functionDeclarations: googleTools }] })
  });

  logger.debug(`Google Direct: Starting streaming request for agent=${agent.id}, model=${model}`, {
    messageCount: messages.length,
    hasTools: !!googleTools,
    toolCount: googleTools?.length || 0,
  });

  let fullResponse = '';
  let functionCalls: any[] = [];

  try {
    const result = await generativeModel.generateContentStream({ contents: googleMessages });

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        fullResponse += chunkText;
        onChunk(chunkText);
      }

      // Check for function calls in the chunk
      if (chunk.candidates?.[0]?.content?.parts) {
        for (const part of chunk.candidates[0].content.parts) {
          if (part.functionCall) {
            functionCalls.push({
              id: generateId(),
              type: 'function',
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args || {}),
              },
            });
          }
        }
      }
    }

    // Process function calls if any
    // NOTE: Do NOT emit 'end' event yet if there are tool calls - it will be emitted after tool execution
    if (functionCalls.length > 0) {
      // Filter and handle function calls with empty or missing names
      const { validCalls, toolResults: emptyNameToolResults } = filterAndHandleEmptyNamedFunctionCalls(
        functionCalls,
        world,
        agent,
        messageId
      );

      const sequenceId = generateId();
      mcpLogger.debug(`MCP tool call sequence starting (Google streaming)`, {
        sequenceId,
        agentId: agent.id,
        messageId,
        toolCount: validCalls.length,
        toolNames: validCalls.map(fc => fc.function!.name!)
      });

      // Add assistant message with function calls (include all calls, even invalid ones)
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: fullResponse || '',
        tool_calls: functionCalls,
      };

      // Execute function calls and get results
      const toolResults: ChatMessage[] = [...emptyNameToolResults];

      for (let i = 0; i < validCalls.length; i++) {
        const functionCall = validCalls[i];
        const startTime = performance.now();

        try {
          const tool = mcpTools[functionCall.function!.name!];
          if (tool && tool.execute) {
            mcpLogger.debug(`MCP tool execution starting (Google streaming)`, {
              sequenceId,
              toolIndex: i,
              toolName: functionCall.function!.name!,
              toolCallId: functionCall.id!,
              agentId: agent.id,
              messageId,
              argsPresent: !!functionCall.function!.arguments
            });

            const args = JSON.parse(functionCall.function!.arguments || '{}');
            const result = await tool.execute(args, sequenceId, `google-streaming-${messageId}`, {
              world,
              worldId: world.id,
              chatId: world.currentChatId ?? null,
              agentId: agent.id,
              messages: messages
            });
            const duration = performance.now() - startTime;

            // Check if tool execution returned stop processing marker (e.g., for approval)
            if (result && typeof result === 'object' && result._stopProcessing) {
              mcpLogger.debug(`Tool execution stopped - approval required (Google streaming)`, {
                sequenceId,
                toolIndex: i,
                toolName: functionCall.name,
                agentId: agent.id,
                messageId
              });

              // Return structured object with BOTH original and approval messages
              // Upper layer (events.ts) will handle storage and event emission
              return {
                type: 'approval_flow',
                originalMessage: {
                  role: 'assistant' as const,
                  content: fullResponse,
                  tool_calls: functionCalls as any // Original tool calls (e.g., shell_cmd)
                },
                approvalMessage: result._approvalMessage
              };
            }

            const resultString = JSON.stringify(result);

            mcpLogger.debug(`MCP tool execution completed (Google streaming)`, {
              sequenceId,
              toolIndex: i,
              toolName: functionCall.function!.name!,
              toolCallId: functionCall.id!,
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
              tool_call_id: functionCall.id!,
            });
          }
        } catch (error) {
          // Let ApprovalRequiredException bubble up to llm-manager
          throw error;
        }
      }

      mcpLogger.debug(`MCP tool call sequence completed (Google streaming)`, {
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
        const followUpResponse = await streamGoogleResponse(
          client,
          model,
          followUpMessages,
          agent,
          {}, // Do not include tools for follow-up to prevent infinite recursion
          world,
          onChunk,
          messageId
        );
        return followUpResponse;
      }
    }

    logger.debug(`Google Direct: Completed streaming request for agent=${agent.id}, responseLength=${fullResponse.length}`);
    return fullResponse;

  } catch (error) {
    logger.error(`Google Direct: Streaming error for agent=${agent.id}:`, error);
    throw error;
  }
}

/**
 * Non-streaming Google response handler
 */
export async function generateGoogleResponse(
  client: GoogleGenerativeAI,
  model: string,
  messages: ChatMessage[],
  agent: Agent,
  mcpTools: Record<string, any>,
  world: World
): Promise<string | { type: string; originalMessage: any; approvalMessage: any }> {
  const googleTools = Object.keys(mcpTools).length > 0 ? convertMCPToolsToGoogle(mcpTools) : undefined;
  const { messages: googleMessages, systemInstruction } = convertMessagesToGoogle(messages);

  const generativeModel = client.getGenerativeModel({
    model,
    systemInstruction: systemInstruction || undefined,
    ...(googleTools && googleTools.length > 0 && { tools: [{ functionDeclarations: googleTools }] }),
    generationConfig: {
      temperature: agent.temperature,
      maxOutputTokens: agent.maxTokens,
    }
  });

  logger.debug(`Google Direct: Starting non-streaming request for agent=${agent.id}, model=${model}`, {
    messageCount: messages.length,
    hasTools: !!googleTools,
    toolCount: googleTools?.length || 0,
  });

  try {
    const result = await generativeModel.generateContent({ contents: googleMessages });
    const response = result.response;

    let content = response.text() || '';
    let functionCalls: any[] = [];

    // Check for function calls in the response
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.functionCall) {
          functionCalls.push({
            id: generateId(),
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {}),
            },
          });
        }
      }
    }

    // Handle function calls if any
    if (functionCalls.length > 0) {
      // Filter out function calls with empty or missing names (non-streaming - no SSE events)
      const validFunctionCalls = functionCalls.filter(fc => fc.function?.name && fc.function.name.trim() !== '');
      const invalidFunctionCalls = functionCalls.filter(fc => !fc.function?.name || fc.function.name.trim() === '');

      const sequenceId = generateId();
      mcpLogger.debug(`MCP tool call sequence starting (Google non-streaming)`, {
        sequenceId,
        agentId: agent.id,
        toolCount: validFunctionCalls.length,
        invalidToolCount: invalidFunctionCalls.length,
        toolNames: validFunctionCalls.map(fc => fc.function.name)
      });

      // Execute function calls
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
        const functionCall = validFunctionCalls[i];
        const startTime = performance.now();

        try {
          const tool = mcpTools[functionCall.function.name];
          if (tool && tool.execute) {
            mcpLogger.debug(`MCP tool execution starting (Google non-streaming)`, {
              sequenceId,
              toolIndex: i,
              toolName: functionCall.function.name,
              toolCallId: functionCall.id,
              agentId: agent.id,
              argsPresent: !!functionCall.function.arguments
            });

            const args = JSON.parse(functionCall.function!.arguments || '{}');
            const result = await tool.execute(args, sequenceId, `google-non-streaming-${agent.id}`, {
              world,
              worldId: world.id,
              chatId: world.currentChatId ?? null,
              agentId: agent.id,
              messages: messages
            });
            const duration = performance.now() - startTime;

            // Check if tool execution returned stop processing marker (e.g., for approval)
            if (result && typeof result === 'object' && result._stopProcessing) {
              mcpLogger.debug(`Tool execution stopped - approval required (Google non-streaming)`, {
                sequenceId,
                toolIndex: i,
                toolName: functionCall.name,
                agentId: agent.id
              });

              // Return structured object with BOTH original and approval messages
              // Upper layer (events.ts) will handle storage and event emission
              return {
                type: 'approval_flow',
                originalMessage: {
                  role: 'assistant' as const,
                  content: content,
                  tool_calls: message.candidates[0].content.parts.filter((p: any) => p.functionCall).map((p: any) => ({
                    id: generateId(),
                    type: 'function' as const,
                    function: {
                      name: p.functionCall.name,
                      arguments: JSON.stringify(p.functionCall.args)
                    }
                  })) as any // Original tool calls (e.g., shell_cmd)
                },
                approvalMessage: result._approvalMessage
              };
            }

            const resultString = JSON.stringify(result);

            mcpLogger.debug(`MCP tool execution completed (Google non-streaming)`, {
              sequenceId,
              toolIndex: i,
              toolName: functionCall.function.name,
              toolCallId: functionCall.id,
              agentId: agent.id,
              status: 'success',
              duration: Math.round(duration * 100) / 100,
              resultSize: resultString.length,
              resultPreview: resultString.slice(0, 200) + (resultString.length > 200 ? '...' : '')
            });

            toolResults.push({
              role: 'tool',
              content: resultString,
              tool_call_id: functionCall.id,
            });
          }
        } catch (error) {
          // Let ApprovalRequiredException bubble up to llm-manager
          throw error;
        }
      }

      mcpLogger.debug(`MCP tool call sequence completed (Google non-streaming)`, {
        sequenceId,
        agentId: agent.id,
        toolCount: functionCalls.length,
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
        const followUpResponse = await generateGoogleResponse(client, model, followUpMessages, agent, mcpTools, world);
        return followUpResponse;
      }
    }

    logger.debug(`Google Direct: Completed non-streaming request for agent=${agent.id}, responseLength=${content.length}`);
    return content;

  } catch (error) {
    logger.error(`Google Direct: Generation error for agent=${agent.id}:`, error);
    throw error;
  }
}

/**
 * Factory function to create Google client for agent
 */
export function createGoogleClientForAgent(agent: Agent): GoogleGenerativeAI {
  const config = getLLMProviderConfig(agent.provider) as GoogleConfig;
  return createGoogleClient(config);
}