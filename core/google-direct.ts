/**
 * Google Direct Integration Module - Pure Client (LLM Provider Refactoring Phase 4)
 *
 * Features:
 * - Direct Google Generative AI API integration
 * - Streaming and non-streaming responses returning LLMResponse
 * - Function/tool calling detection (NO execution)
 * - Proper error handling and retry logic
 * - Browser-safe configuration injection
 * - Pure client: only calls APIs and returns structured data
 *
 * Implementation Details:
 * - Uses official @google/generative-ai package for reliable API access
 * - Converts AI SDK message format to Google Generative AI format
 * - Returns LLMResponse with type='text' or type='tool_calls'
 * - Streaming support with chunk-by-chunk processing via onChunk callback
 * - Error handling with descriptive messages
 * - Configuration injection from llm-config module
 * - NO event emission, NO storage, NO tool execution
 *
 * Recent Changes:
 * - 2025-11-09: Phase 4 - Removed ALL tool execution logic (~200 lines)
 * - Provider is now a pure client - only API calls and data transformation
 * - Returns LLMResponse interface with type discriminator
 * - Filters invalid function calls (empty/missing names) and logs warnings
 * - Note: Google API doesn't provide usage information in response
 * - 2025-11-08: Removed ALL event emission from provider
 * - Streaming uses onChunk callback instead of direct SSE emission
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { World, Agent, ChatMessage, LLMResponse } from './types.js';
import { getLLMProviderConfig, GoogleConfig } from './llm-config.js';
import { createCategoryLogger } from './logger.js';
import { generateId } from './utils.js';

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
 * Streaming Google response handler - Pure client (no tool execution)
 * Returns LLMResponse with type='text' or type='tool_calls'
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
): Promise<LLMResponse> {
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

    // Return LLMResponse based on whether we have function calls or text
    if (functionCalls.length > 0) {
      // Filter out invalid function calls (empty or missing names)
      const validCalls = functionCalls.filter(
        fc => fc.function?.name && fc.function.name.trim() !== ''
      );

      const invalidCount = functionCalls.length - validCalls.length;
      if (invalidCount > 0) {
        logger.warn(`Google Direct: Filtered ${invalidCount} invalid function calls (streaming)`, {
          agentId: agent.id,
          totalCalls: functionCalls.length
        });
      }

      logger.debug(`Google Direct: Completed streaming request with function calls for agent=${agent.id}`, {
        toolCount: validCalls.length,
        toolNames: validCalls.map(fc => fc.function?.name)
      });

      return {
        type: 'tool_calls',
        content: fullResponse,
        tool_calls: validCalls,
        assistantMessage: {
          role: 'assistant',
          content: fullResponse || '',
          tool_calls: validCalls,
        },
        usage: undefined, // Google streaming doesn't provide usage in final chunk
      };
    }

    logger.debug(`Google Direct: Completed streaming request for agent=${agent.id}, responseLength=${fullResponse.length}`);
    return {
      type: 'text',
      content: fullResponse,
      assistantMessage: {
        role: 'assistant',
        content: fullResponse,
      },
      usage: undefined, // Google streaming doesn't provide usage in final chunk
    };

  } catch (error) {
    logger.error(`Google Direct: Streaming error for agent=${agent.id}:`, error);
    throw error;
  }
}

/**
 * Non-streaming Google response handler - Pure client (no tool execution)
 * Returns LLMResponse with type='text' or type='tool_calls'
 */
export async function generateGoogleResponse(
  client: GoogleGenerativeAI,
  model: string,
  messages: ChatMessage[],
  agent: Agent,
  mcpTools: Record<string, any>,
  world: World
): Promise<LLMResponse> {
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

    // Return LLMResponse based on whether we have function calls or text
    if (functionCalls.length > 0) {
      // Filter out invalid function calls (empty or missing names)
      const validCalls = functionCalls.filter(
        fc => fc.function?.name && fc.function.name.trim() !== ''
      );

      const invalidCount = functionCalls.length - validCalls.length;
      if (invalidCount > 0) {
        logger.warn(`Google Direct: Filtered ${invalidCount} invalid function calls (non-streaming)`, {
          agentId: agent.id,
          totalCalls: functionCalls.length
        });
      }

      logger.debug(`Google Direct: Completed non-streaming request with function calls for agent=${agent.id}`, {
        toolCount: validCalls.length,
        toolNames: validCalls.map(fc => fc.function?.name)
      });

      return {
        type: 'tool_calls',
        content: content,
        tool_calls: validCalls,
        assistantMessage: {
          role: 'assistant',
          content: content,
          tool_calls: validCalls,
        },
        usage: undefined, // Google doesn't provide usage information in response
      };
    }

    logger.debug(`Google Direct: Completed non-streaming request for agent=${agent.id}, responseLength=${content.length}`);
    return {
      type: 'text',
      content: content,
      assistantMessage: {
        role: 'assistant',
        content: content,
      },
      usage: undefined, // Google doesn't provide usage information in response
    };

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