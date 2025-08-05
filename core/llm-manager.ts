/**
 * LLM Manager Module - Browser-Safe LLM Integration with Configuration Injection
 *
 * Features:
 * - Browser-safe LLM integration using AI SDK with configuration injection
 * - Streaming responses with SSE events via World.eventEmitter specifically
 * - Support for all major LLM providers (OpenAI, Anthropic, Google, Azure, XAI, OpenAI-Compatible, Ollama)
 * - Agent activity tracking and token usage monitoring with automatic state persistence
 * - Error handling with SSE error events via world's eventEmitter and timeout management
 * - World-aware event publishing using world.eventEmitter for proper event isolation
 * - Conversation history support with message preparation and context management
 * - Global LLM call queue to ensure serialized execution (one LLM call at a time)
 * - Configuration injection from external sources (CLI/server) for browser compatibility
 *
 * Core Functions:
 * - streamAgentResponse: Streaming LLM calls with SSE events via world.eventEmitter (queued)
 * - generateAgentResponse: Non-streaming LLM calls with automatic state management (queued)
 * - loadLLMProvider: Provider loading logic using injected configuration
 * - getLLMQueueStatus: Monitor queue status for debugging and administration
 * - clearLLMQueue: Emergency queue clearing for administrative purposes
 *
 * Provider Support:
 * - OpenAI: GPT models with streaming and function calling support
 * - Anthropic: Claude models with conversation context and streaming
 * - Google: Gemini models with proper API key management
 * - Azure: OpenAI-compatible Azure endpoints with deployment management
 * - XAI: Grok models through OpenAI-compatible interface
 * - OpenAI-Compatible: Custom providers following OpenAI API standards
 * - Ollama: Local model support with custom base URL configuration
 *
 * LLM Queue Implementation:
 * - Global singleton queue prevents concurrent LLM calls across all agents and worlds
 * - FIFO (First In, First Out) processing ensures fair agent response ordering
 * - Maximum queue size of 100 items prevents memory overflow issues
 * - 2-minute timeout per LLM call prevents stuck queue conditions
 * - Queue status monitoring available for debugging and performance analysis
 * - Emergency clear function allows administrative queue reset when needed
 * - Proper error handling with promise rejection for failed calls
 * - Automatic queue processing with safety measures for edge cases
 *
 * Browser Safety Implementation:
 * - Zero process.env dependencies for browser compatibility
 * - Configuration injection via llm-config module
 * - All provider settings supplied externally by CLI/server components
 * - Type-safe configuration interfaces prevent runtime errors
 * - Clear error messages when configuration is missing
 *
 * Implementation Details:
 * - Uses AI SDK for LLM integration with consistent interfaces across providers
 * - Publishes SSE events via world.eventEmitter.emit('sse', event) for proper isolation
 * - Updates agent activity metrics and LLM call counts automatically
 * - Zero dependencies on Node.js environment variables or legacy event systems
 * - Complete provider support with externally injected configuration
 * - All events scoped to specific world instance preventing cross-world interference
 * - Full LLM provider support with configuration validation and error handling
 * - Timeout handling with configurable limits and proper error recovery
 * - Queue-based serialization prevents API rate limits and resource conflicts
 *
 * Recent Changes:
 * - Removed all process.env dependencies for browser compatibility
 * - Added configuration injection using llm-config module
 * - Updated loadLLMProvider to use injected configuration instead of environment variables
 * - Enhanced error handling for missing provider configuration
 * - Maintained all existing functionality while making module browser-safe
 * - Updated comment block to reflect browser-safe implementation
 */

import { generateText, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { World, Agent, AgentMessage, LLMProvider, WorldSSEEvent, ChatMessage } from './types.js';

import { generateId } from './utils.js';
import { createCategoryLogger } from './logger.js';
const logger = createCategoryLogger('llm');
import { getLLMProviderConfig } from './llm-config.js';

// LLM Integration Utilities

function stripCustomFields(message: AgentMessage): ChatMessage {
  const { sender, ...llmMessage } = message;
  return llmMessage;
}

function stripCustomFieldsFromMessages(messages: AgentMessage[]): ChatMessage[] {
  return messages.map(stripCustomFields);
}


/**
 * Global LLM call queue to ensure serialized execution
 */
interface QueuedLLMCall {
  id: string;
  agentId: string;
  worldId: string;
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

class LLMQueue {
  private queue: QueuedLLMCall[] = [];
  private processing = false;
  private maxQueueSize = 100; // Prevent memory issues
  private processingTimeoutMs = 120000; // 2 minute max processing time per call

  async add<T>(agentId: string, worldId: string, task: () => Promise<T>): Promise<T> {
    // Prevent queue overflow
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error(`LLM queue is full (${this.maxQueueSize} items). Please try again later.`);
    }

    logger.debug(`LLMQueue: Adding task for agent=${agentId}, world=${worldId}. Queue length before add: ${this.queue.length}`);
    return new Promise<T>((resolve, reject) => {
      const queueItem: QueuedLLMCall = {
        id: generateId(),
        agentId,
        worldId,
        execute: task,
        resolve,
        reject
      };

      this.queue.push(queueItem);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    logger.debug(`LLMQueue: Starting queue processing. Queue length: ${this.queue.length}`);
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;

      try {
        logger.debug(`LLMQueue: Processing task for agent=${item.agentId}, world=${item.worldId}, queueItemId=${item.id}`);
        // Add processing timeout to prevent stuck queue
        const processPromise = item.execute();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`LLM call timeout after ${this.processingTimeoutMs}ms for agent ${item.agentId}`));
          }, this.processingTimeoutMs);
        });

        const result = await Promise.race([processPromise, timeoutPromise]);
        item.resolve(result);
        logger.debug(`LLMQueue: Finished processing task for agent=${item.agentId}, world=${item.worldId}, queueItemId=${item.id}`);
      } catch (error) {
        logger.error('LLM queue error', { agentId: item.agentId, error: error instanceof Error ? error.message : error });
        item.reject(error);
      }
    }

    this.processing = false;
    logger.debug('LLMQueue: Queue processing complete.');
  }

  getQueueStatus(): {
    queueLength: number;
    processing: boolean;
    nextAgent?: string;
    nextWorld?: string;
    maxQueueSize: number;
  } {
    const next = this.queue[0];
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      nextAgent: next?.agentId,
      nextWorld: next?.worldId,
      maxQueueSize: this.maxQueueSize
    };
  }

  // Emergency method to clear stuck queue (for debugging/admin use)
  clearQueue(): number {
    const count = this.queue.length;

    // Reject all pending promises
    for (const item of this.queue) {
      item.reject(new Error('Queue cleared by administrator'));
    }

    this.queue = [];
    this.processing = false;

    return count;
  }
}

// Global singleton queue instance
const llmQueue = new LLMQueue();

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
 * Streaming agent response with SSE events via world's eventEmitter (queued)
 */
export async function streamAgentResponse(
  world: World,
  agent: Agent,
  messages: AgentMessage[],
  publishSSE: (world: World, data: Partial<WorldSSEEvent>) => void
): Promise<string> {
  // Queue the LLM call to ensure serialized execution
  return llmQueue.add(agent.id, world.id, async () => {
    return await executeStreamAgentResponse(world, agent, messages, publishSSE);
  });
}

/**
 * Internal streaming implementation (executed within queue)
 */
async function executeStreamAgentResponse(
  world: World,
  agent: Agent,
  messages: AgentMessage[],
  publishSSE: (world: World, data: Partial<WorldSSEEvent>) => void
): Promise<string> {
  const messageId = generateId();

  try {
    // Publish SSE start event via world's eventEmitter
    publishSSE(world, {
      agentName: agent.id,
      type: 'start',
      messageId
    });

    logger.debug(`LLM: Starting streaming response for agent=${agent.id}, world=${world.id}, messageId=${messageId}`);

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
      logger.debug(`LLM: Streaming chunk for agent=${agent.id}, world=${world.id}, messageId=${messageId}, chunkLength=${chunk.length}`);
    }

    // Publish SSE end event via world's eventEmitter
    publishSSE(world, {
      agentName: agent.id,
      type: 'end',
      messageId,
      // Add usage information if available
    });

    logger.debug(`LLM: Finished streaming response for agent=${agent.id}, world=${world.id}, messageId=${messageId}`);

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

    logger.error(`LLM: Error during streaming response for agent=${agent.id}, world=${world.id}, messageId=${messageId}, error=${(error as Error).message}`);

    throw error;
  }
}

/**
 * Non-streaming LLM call (queued)
 */
export async function generateAgentResponse(
  world: World,
  agent: Agent,
  messages: AgentMessage[],
  _publishSSE?: (world: World, data: Partial<WorldSSEEvent>) => void
): Promise<string> {
  // Queue the LLM call to ensure serialized execution
  return llmQueue.add(agent.id, world.id, async () => {
    return await executeGenerateAgentResponse(world, agent, messages);
  });
}

/**
 * Internal generation implementation (executed within queue)
 */
async function executeGenerateAgentResponse(
  world: World,
  agent: Agent,
  messages: AgentMessage[]
): Promise<string> {
  const model = loadLLMProvider(agent);
  const llmMessages = stripCustomFieldsFromMessages(messages);

  logger.debug(`LLM: Starting non-streaming response for agent=${agent.id}, world=${world.id}`);
  try {
    const { text } = await generateText({
      model,
      messages: llmMessages,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens
    });

    // Update agent activity and LLM call count
    agent.lastActive = new Date();
    agent.llmCallCount++;
    agent.lastLLMCall = new Date();

    logger.debug(`LLM: Finished non-streaming response for agent=${agent.id}, world=${world.id}`);
    return text;
  } catch (error) {
    logger.error(`LLM: Error during non-streaming response for agent=${agent.id}, world=${world.id}, error=${(error as Error).message}`);
    throw error;
  }
}

/**
 * Get current LLM queue status for monitoring and debugging
 */
export function getLLMQueueStatus(): {
  queueLength: number;
  processing: boolean;
  nextAgent?: string;
  nextWorld?: string;
  maxQueueSize: number;
} {
  return llmQueue.getQueueStatus();
}

/**
 * Emergency function to clear the LLM queue (for debugging/admin use)
 * Returns the number of items that were cleared
 */
export function clearLLMQueue(): number {
  return llmQueue.clearQueue();
}

/**
 * LLM provider loading with configuration injection (browser-safe)
 */
function loadLLMProvider(agent: Agent): any {
  switch (agent.provider) {
    case LLMProvider.OPENAI: {
      const config = getLLMProviderConfig(LLMProvider.OPENAI);
      return createOpenAI({
        apiKey: config.apiKey
      })(agent.model);
    }

    case LLMProvider.ANTHROPIC: {
      const config = getLLMProviderConfig(LLMProvider.ANTHROPIC);
      return createAnthropic({
        apiKey: config.apiKey
      })(agent.model);
    }

    case LLMProvider.AZURE: {
      const config = getLLMProviderConfig(LLMProvider.AZURE);
      return createOpenAI({
        apiKey: config.apiKey,
        baseURL: `${config.endpoint}/openai/deployments/${config.deployment}`
      })(agent.model);
    }

    case LLMProvider.GOOGLE: {
      const config = getLLMProviderConfig(LLMProvider.GOOGLE);
      return createGoogleGenerativeAI({
        apiKey: config.apiKey
      })(agent.model);
    }

    case LLMProvider.XAI: {
      const config = getLLMProviderConfig(LLMProvider.XAI);
      return createOpenAI({
        apiKey: config.apiKey,
        baseURL: 'https://api.x.ai/v1'
      })(agent.model);
    }

    case LLMProvider.OPENAI_COMPATIBLE: {
      const config = getLLMProviderConfig(LLMProvider.OPENAI_COMPATIBLE);
      return createOpenAICompatible({
        name: 'custom-provider',
        apiKey: config.apiKey,
        baseURL: config.baseUrl
      })(agent.model);
    }

    case LLMProvider.OLLAMA: {
      const config = getLLMProviderConfig(LLMProvider.OLLAMA);
      return createOllama({
        baseURL: config.baseUrl
      })(agent.model);
    }

    default:
      logger.error(`Unsupported LLM provider: ${agent.provider}`);
      throw new Error(`Unsupported LLM provider: ${agent.provider}`);
  }
}
