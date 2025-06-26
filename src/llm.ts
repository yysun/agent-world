/*
 * Simplified LLM Wrapper
 * 
 * Features:
 * - Function-based LLM provider loading and chat functionality
 * - Direct LLM provider initialization without fallbacks
 * - Streaming chat with SSE events (extracted from LLMQueue)
 * - Non-streaming chat for simple use cases
 * - Timeout handling with proper cleanup
 * - Single request utility functions
 * - Comprehensive error handling with structured logging
 * 
 * Logic:
 * - Extract provider initialization from agent.ts
 * - Extract core streaming functionality from LLMQueue.ts
 * - Provide both streaming and non-streaming interfaces
 * - Maintain SSE event structure for frontend compatibility
 * - Direct function calls without queue complexity
 * - Preserve timeout handling to prevent hanging processes
 * 
 * Changes:
 * - Initial implementation extracting LLM functionality
 * - Removed queue management complexity from LLMQueue
 * - Preserved excellent streaming and SSE event handling
 * - Function-based architecture for simplicity
 * - Direct provider loading without fallback mechanisms
 */

import { generateText, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { v4 as uuidv4 } from 'uuid';
import { LLMProvider, ChatMessage } from './types';
import { publishSSE } from './event-bus';
import { agentLogger } from './logger';

// Configuration interfaces
export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  // Provider-specific options
  ollamaBaseUrl?: string;
  azureEndpoint?: string;
  azureApiVersion?: string;
  azureDeployment?: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  agentName?: string;
}

// Core LLM provider loading function
export function loadLLMProvider(config: LLMConfig): any {
  switch (config.provider) {
    case LLMProvider.OPENAI:
      return createOpenAI({
        apiKey: config.apiKey || process.env.OPENAI_API_KEY || ''
      })(config.model);

    case LLMProvider.ANTHROPIC:
      return createAnthropic({
        apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || ''
      })(config.model);

    case LLMProvider.AZURE:
      return createOpenAI({
        apiKey: config.apiKey || process.env.AZURE_OPENAI_API_KEY || '',
        baseURL: `${config.azureEndpoint}/openai/deployments/${config.azureDeployment}`
      })(config.model);

    case LLMProvider.GOOGLE:
      return createGoogleGenerativeAI({
        apiKey: config.apiKey || process.env.GOOGLE_API_KEY || ''
      })(config.model);

    case LLMProvider.XAI:
      return createOpenAI({
        apiKey: config.apiKey || process.env.XAI_API_KEY || '',
        baseURL: 'https://api.x.ai/v1'
      })(config.model);

    case LLMProvider.OPENAI_COMPATIBLE:
      return createOpenAICompatible({
        name: 'custom-provider',
        apiKey: config.apiKey || process.env.OPENAI_COMPATIBLE_API_KEY || '',
        baseURL: config.baseUrl || process.env.OPENAI_COMPATIBLE_BASE_URL || ''
      })(config.model);

    case LLMProvider.OLLAMA:
      return createOllama({
        baseURL: config.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434/api'
      })(config.model);

    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}

// Direct chat function (non-streaming)
export async function chatWithLLM(
  provider: any,
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  try {
    const { text } = await generateText({
      model: provider,
      messages: messages,
      temperature: options.temperature || 0.7,
      maxTokens: options.maxTokens || 1000,
    });

    return text;
  } catch (error) {
    agentLogger.error({
      agentName: options.agentName,
      error
    }, 'Direct LLM chat failed');
    throw error;
  }
}

// Streaming chat with SSE events (extracted from LLMQueue)
export async function streamChatWithLLM(
  provider: any,
  messages: ChatMessage[],
  messageId: string,
  options: ChatOptions = {}
): Promise<string> {
  // Set timeout for the entire request (from LLMQueue)
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`LLM streaming request timeout`));
    }, 30000); // 30 second timeout
  });

  try {
    // Emit SSE start event
    await publishSSE({
      agentName: options.agentName || 'unknown',
      type: 'start',
      messageId: messageId,
      content: ''
    });

    // Create the streaming request
    const streamPromise = handleStreamingRequest(
      provider,
      messages,
      messageId,
      options
    );

    // Race between timeout and actual processing (from LLMQueue)
    const result = await Promise.race([streamPromise, timeoutPromise]);
    return result;

  } catch (error) {
    agentLogger.error({
      agentName: options.agentName,
      messageId,
      error
    }, 'LLM streaming request failed');

    // Emit SSE error event
    await publishSSE({
      agentName: options.agentName || 'unknown',
      type: 'error',
      messageId: messageId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    throw error;
  } finally {
    // Always clear timeout to prevent hanging (from LLMQueue)
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

// Core streaming implementation (extracted from LLMQueue.handleStreamingRequest)
async function handleStreamingRequest(
  provider: any,
  messages: ChatMessage[],
  messageId: string,
  options: ChatOptions = {}
): Promise<string> {
  let fullResponse = '';

  try {
    // Generate response using streaming AI (from LLMQueue)
    const result = await streamText({
      model: provider,
      messages: messages,
      temperature: options.temperature || 0.7,
      maxTokens: options.maxTokens || 1000,
    });

    // Stream the response and emit SSE events (from LLMQueue)
    for await (const textPart of result.textStream) {
      fullResponse += textPart;

      // Emit SSE chunk event
      await publishSSE({
        agentName: options.agentName || 'unknown',
        type: 'chunk',
        messageId: messageId,
        content: textPart
      });
    }

    // Get final usage information
    const usage = await result.usage;

    // Emit SSE end event with token usage (from LLMQueue)
    await publishSSE({
      agentName: options.agentName || 'unknown',
      type: 'end',
      messageId: messageId,
      content: fullResponse,
      usage: usage ? {
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        totalTokens: usage.totalTokens
      } : undefined
    });

    return fullResponse;

  } catch (error) {
    agentLogger.error({
      agentName: options.agentName,
      messageId,
      error
    }, 'Streaming error in LLM request');
    throw error;
  }
}

// Single request convenience function
export async function singleRequest(
  config: LLMConfig,
  messages: ChatMessage[]
): Promise<string> {
  const provider = loadLLMProvider(config);
  return await chatWithLLM(provider, messages, {
    temperature: config.temperature,
    maxTokens: config.maxTokens
  });
}
