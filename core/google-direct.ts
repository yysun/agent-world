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
 * - 2026-03-22: Added Gemini-safe tool schema normalization so Google function declarations strip unsupported `additionalProperties` fields before API calls.
 * - 2026-03-13: Switched world reasoning overrides to `default`/`none`, where `default` omits thinking config and `none` uses a zero-budget explicit override.
 * - 2026-03-12: Reclassified streaming abort logs as info-level cancellations to suppress expected stop/edit noise.
 * - 2026-02-15: Stopped replaying historical tool call/response parts as Google `functionCall`/`functionResponse` in conversation conversion to avoid 400 errors requiring `thought_signature` on replayed calls.
 * - 2026-02-13: Added transport-level AbortSignal wiring to Google SDK request options where supported.
 * - 2026-02-13: Added abort-signal checks for streaming and non-streaming execution paths.
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
import { getEnvValueFromText } from './utils.js';

const logger = createCategoryLogger('llm.google');
const mcpLogger = createCategoryLogger('mcp.execution');
type GoogleReasoningEffort = 'none' | 'low' | 'medium' | 'high';

function normalizeReasoningEffort(value: string | undefined): 'default' | GoogleReasoningEffort {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'none' || normalized === 'low' || normalized === 'high' || normalized === 'medium') {
    return normalized;
  }
  return 'default';
}

function buildGoogleThinkingConfig(world: World): { includeThoughts: true; thinkingBudget: number } | undefined {
  const effort = normalizeReasoningEffort(getEnvValueFromText(world.variables, 'reasoning_effort'));
  if (effort === 'default') {
    return undefined;
  }
  const budgets: Record<GoogleReasoningEffort, number> = {
    none: 0,
    low: 256,
    medium: 1024,
    high: 2048,
  };

  return {
    includeThoughts: true,
    thinkingBudget: budgets[effort],
  };
}

function isAbortLikeError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes('abort') || normalized.includes('canceled') || normalized.includes('cancelled');
}

function stripUnsupportedGoogleSchemaFields(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((item) => stripUnsupportedGoogleSchemaFields(item));
  }

  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const normalizedEntries = Object.entries(schema as Record<string, unknown>)
    .filter(([key]) => key !== 'additionalProperties')
    .map(([key, value]) => [key, stripUnsupportedGoogleSchemaFields(value)]);

  return Object.fromEntries(normalizedEntries);
}

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
      // Replay compatibility: avoid functionResponse replay because Gemini
      // expects metadata coupling with prior functionCall traces.
      // Keep tool outcomes as plain text context.
      if (!msg.content?.trim()) {
        continue;
      }
      googleMessages.push({
        role: 'user',
        parts: [{ text: `[Tool result]\n${msg.content}` }]
      });
      continue;
    }

    if (msg.role === 'assistant' && msg.tool_calls) {
      // Replay compatibility: do NOT replay historical functionCall parts.
      // Gemini may reject replayed calls without provider-issued thought_signature.
      const parts: any[] = [];

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      if (parts.length === 0) {
        parts.push({ text: '[Tool call history omitted for Google replay compatibility]' });
      }

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
    parameters: stripUnsupportedGoogleSchemaFields(
      tool.parameters || tool.inputSchema || { type: 'object', properties: {} }
    ),
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
  onChunk: (chunk: { content?: string; reasoningContent?: string }) => void,
  messageId: string,
  abortSignal?: AbortSignal
): Promise<LLMResponse> {
  const googleTools = Object.keys(mcpTools).length > 0 ? convertMCPToolsToGoogle(mcpTools) : undefined;
  const { messages: googleMessages, systemInstruction } = convertMessagesToGoogle(messages);

  const thinkingConfig = buildGoogleThinkingConfig(world);
  const generativeModel = client.getGenerativeModel({
    model,
    systemInstruction: systemInstruction || undefined,
    ...(googleTools && googleTools.length > 0 && { tools: [{ functionDeclarations: googleTools }] }),
    generationConfig: {
      temperature: agent.temperature,
      maxOutputTokens: agent.maxTokens,
      ...(thinkingConfig ? { thinkingConfig } : {}),
    } as any,
  });

  logger.debug(`Google Direct: Starting streaming request for agent=${agent.id}, model=${model}`, {
    messageCount: messages.length,
    hasTools: !!googleTools,
    toolCount: googleTools?.length || 0,
  });

  let fullResponse = '';
  let functionCalls: any[] = [];

  try {
    if (abortSignal?.aborted) {
      throw new DOMException('Google stream aborted before start', 'AbortError');
    }
    const result = await generativeModel.generateContentStream(
      { contents: googleMessages },
      abortSignal ? { signal: abortSignal } : undefined
    );

    for await (const chunk of result.stream) {
      if (abortSignal?.aborted) {
        throw new DOMException('Google stream aborted', 'AbortError');
      }
      const parts = Array.isArray(chunk.candidates?.[0]?.content?.parts)
        ? chunk.candidates[0].content.parts
        : [];
      if (parts.length > 0) {
        for (const part of parts) {
          if (typeof part?.text === 'string' && part.text.length > 0) {
            if ((part as any).thought === true) {
              onChunk({ reasoningContent: part.text });
            } else {
              fullResponse += part.text;
              onChunk({ content: part.text });
            }
          }
        }
      } else {
        const chunkText = chunk.text();
        if (chunkText) {
          fullResponse += chunkText;
          onChunk({ content: chunkText });
        }
      }

      // Check for function calls in the chunk
      if (parts.length > 0) {
        for (const part of parts) {
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
    if (abortSignal?.aborted || isAbortLikeError(error)) {
      logger.info(`Google Direct: Streaming canceled for agent=${agent.id}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

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
  world: World,
  abortSignal?: AbortSignal
): Promise<LLMResponse> {
  const googleTools = Object.keys(mcpTools).length > 0 ? convertMCPToolsToGoogle(mcpTools) : undefined;
  const { messages: googleMessages, systemInstruction } = convertMessagesToGoogle(messages);
  const thinkingConfig = buildGoogleThinkingConfig(world);

  const generativeModel = client.getGenerativeModel({
    model,
    systemInstruction: systemInstruction || undefined,
    ...(googleTools && googleTools.length > 0 && { tools: [{ functionDeclarations: googleTools }] }),
    generationConfig: {
      temperature: agent.temperature,
      maxOutputTokens: agent.maxTokens,
      ...(thinkingConfig ? { thinkingConfig } : {}),
    }
  });

  logger.debug(`Google Direct: Starting non-streaming request for agent=${agent.id}, model=${model}`, {
    messageCount: messages.length,
    hasTools: !!googleTools,
    toolCount: googleTools?.length || 0,
  });

  try {
    if (abortSignal?.aborted) {
      throw new DOMException('Google generation aborted before start', 'AbortError');
    }
    const result = await generativeModel.generateContent(
      { contents: googleMessages },
      abortSignal ? { signal: abortSignal } : undefined
    );
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
