/**
 * LLM Manager Module - LLM Integration with World-Specific EventEmitter SSE Events
 *
 * Features:
 * - LLM integration using AI SDK without existing event dependencies
 * - Streaming responses with SSE events via World.eventEmitter specifically
 * - Support for all LLM providers (OpenAI, Anthropic, Google, Azure, XAI, OpenAI-Compatible, Ollama)
 * - Agent activity tracking and token usage
 * - Error handling with SSE error events via world's eventEmitter
 * - World-aware event publishing (uses world.eventEmitter, not global events)
 *
 * Core Functions:
 * - streamAgentResponse: Streaming LLM calls with SSE events via world.eventEmitter
 * - generateAgentResponse: Non-streaming LLM calls
 * - loadLLMProvider: Provider loading logic
 *
 * Implementation:
 * - Uses AI SDK for LLM integration
 * - Publishes SSE events via world.eventEmitter.emit('sse', event)
 * - Updates agent activity metrics
 * - Zero dependencies on existing llm.ts
 * - Complete provider support extraction
 * - All events scoped to specific world instance
 * - Full LLM provider support matching src/llm.ts
 */

import { generateText, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { World, Agent, AgentMessage, LLMProvider, stripCustomFieldsFromMessages, WorldSSEEvent } from './types.js';
import { publishSSE } from './world-events.js';
import { generateId } from './utils.js';

/**
 * LLM configuration interface
 */
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

/**
 * Streaming agent response with SSE events via world's eventEmitter
 */
export async function streamAgentResponse(
  world: World,
  agent: Agent,
  messages: AgentMessage[]
): Promise<string> {
  const messageId = generateId();

  try {
    // Publish SSE start event via world's eventEmitter
    publishSSE(world, {
      agentName: agent.id,
      type: 'start',
      messageId
    });

    // Load LLM provider
    const model = loadLLMProvider(agent);

    // Convert messages for LLM (strip custom fields)
    const llmMessages = stripCustomFieldsFromMessages(messages);

    // Stream response with timeout handling
    const timeoutMs = 30000; // 30 second timeout

    const streamPromise = streamText({
      model,
      messages: llmMessages,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens
    });

    // Add timeout wrapper
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('LLM streaming request timeout')), timeoutMs);
    });

    const { textStream } = await Promise.race([streamPromise, timeoutPromise]);

    let fullResponse = '';

    // Stream chunks and emit SSE events via world's eventEmitter
    for await (const chunk of textStream) {
      fullResponse += chunk;

      publishSSE(world, {
        agentName: agent.id,
        type: 'chunk',
        content: chunk,
        messageId
      });
    }

    // Publish SSE end event via world's eventEmitter
    publishSSE(world, {
      agentName: agent.id,
      type: 'end',
      messageId,
      // Add usage information if available
    });

    // Update agent activity
    agent.lastActive = new Date();

    return fullResponse;

  } catch (error) {
    // Publish SSE error event via world's eventEmitter
    publishSSE(world, {
      agentName: agent.id,
      type: 'error',
      error: (error as Error).message,
      messageId
    });

    throw error;
  }
}

/**
 * Non-streaming LLM call
 */
export async function generateAgentResponse(
  agent: Agent,
  messages: AgentMessage[]
): Promise<string> {
  const model = loadLLMProvider(agent);
  const llmMessages = stripCustomFieldsFromMessages(messages);

  const { text } = await generateText({
    model,
    messages: llmMessages,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens
  });

  // Update agent activity
  agent.lastActive = new Date();
  agent.llmCallCount++;
  agent.lastLLMCall = new Date();

  return text;
}

/**
 * LLM provider loading (extracted from existing llm.ts)
 */
function loadLLMProvider(agent: Agent): any {
  switch (agent.provider) {
    case LLMProvider.OPENAI:
      return createOpenAI({
        apiKey: agent.apiKey || process.env.OPENAI_API_KEY || ''
      })(agent.model);

    case LLMProvider.ANTHROPIC:
      return createAnthropic({
        apiKey: agent.apiKey || process.env.ANTHROPIC_API_KEY || ''
      })(agent.model);

    case LLMProvider.AZURE:
      return createOpenAI({
        apiKey: agent.apiKey || process.env.AZURE_OPENAI_API_KEY || '',
        baseURL: `${agent.azureEndpoint}/openai/deployments/${agent.azureDeployment}`
      })(agent.model);

    case LLMProvider.GOOGLE:
      return createGoogleGenerativeAI({
        apiKey: agent.apiKey || process.env.GOOGLE_API_KEY || ''
      })(agent.model);

    case LLMProvider.XAI:
      return createOpenAI({
        apiKey: agent.apiKey || process.env.XAI_API_KEY || '',
        baseURL: 'https://api.x.ai/v1'
      })(agent.model);

    case LLMProvider.OPENAI_COMPATIBLE:
      return createOpenAICompatible({
        name: 'custom-provider',
        apiKey: agent.apiKey || process.env.OPENAI_COMPATIBLE_API_KEY || '',
        baseURL: agent.baseUrl || process.env.OPENAI_COMPATIBLE_BASE_URL || ''
      })(agent.model);

    case LLMProvider.OLLAMA:
      return createOllama({
        baseURL: agent.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434/api'
      })(agent.model);

    default:
      throw new Error(`Unsupported LLM provider: ${agent.provider}`);
  }
}
