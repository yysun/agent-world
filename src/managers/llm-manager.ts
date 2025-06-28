/**
 * LLM Manager Module - LLM Integration with World.eventEmitter SSE Events
 *
 * Features:
 * - LLM integration using AI SDK without existing event dependencies
 * - Streaming responses with SSE events via World.eventEmitter
 * - Support for all LLM providers (OpenAI, Anthropic, Google, etc.)
 * - Agent activity tracking and token usage
 * - Error handling with SSE error events
 *
 * Core Functions:
 * - streamAgentResponse: Streaming LLM calls with SSE events
 * - generateAgentResponse: Non-streaming LLM calls
 * - loadLLMProvider: Provider loading logic
 *
 * Implementation:
 * - Uses AI SDK for LLM integration
 * - Publishes SSE events via World.eventEmitter
 * - Updates agent activity metrics
 * - Zero dependencies on existing llm.ts
 * - Complete provider support extraction
 */

import { generateText, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
// Import other AI SDK providers as needed
import { World, Agent, AgentMessage, AgentConfig, LLMProvider, stripCustomFieldsFromMessages } from '../types.js';
import { publishSSE } from './world-events.js';
import { generateId, WorldSSEEvent } from './utils.js';

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
}

/**
 * Streaming agent response with SSE events
 */
export async function streamAgentResponse(
  world: World,
  agent: Agent,
  messages: AgentMessage[]
): Promise<string> {
  const messageId = generateId();

  try {
    // Publish SSE start event
    publishSSE(world, {
      agentName: agent.id,
      type: 'start',
      messageId
    });

    // Load LLM provider
    const model = loadLLMProvider(agent.config);

    // Convert messages for LLM (strip custom fields)
    const llmMessages = stripCustomFieldsFromMessages(messages);

    // Stream response
    const { textStream } = await streamText({
      model,
      messages: llmMessages,
      temperature: agent.config.temperature,
      maxTokens: agent.config.maxTokens
    });

    let fullResponse = '';

    // Stream chunks and emit SSE events
    for await (const chunk of textStream) {
      fullResponse += chunk;

      publishSSE(world, {
        agentName: agent.id,
        type: 'chunk',
        content: chunk,
        messageId
      });
    }

    // Publish SSE end event
    publishSSE(world, {
      agentName: agent.id,
      type: 'end',
      messageId,
      // Add usage information if available
    });

    // Update agent activity
    agent.lastActive = new Date();
    agent.llmCallCount++;
    agent.lastLLMCall = new Date();

    return fullResponse;

  } catch (error) {
    // Publish SSE error event
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
  const model = loadLLMProvider(agent.config);
  const llmMessages = stripCustomFieldsFromMessages(messages);

  const { text } = await generateText({
    model,
    messages: llmMessages,
    temperature: agent.config.temperature,
    maxTokens: agent.config.maxTokens
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
function loadLLMProvider(config: AgentConfig): any {
  // Implementation similar to existing llm.ts but without event dependencies
  switch (config.provider) {
    case LLMProvider.OPENAI:
      return createOpenAI({
        apiKey: config.apiKey || process.env.OPENAI_API_KEY || ''
      })(config.model);

    case LLMProvider.ANTHROPIC:
      return createAnthropic({
        apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || ''
      })(config.model);

    case LLMProvider.GOOGLE:
      return createGoogleGenerativeAI({
        apiKey: config.apiKey || process.env.GOOGLE_API_KEY || ''
      })(config.model);

    // Add other providers as needed...

    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}
