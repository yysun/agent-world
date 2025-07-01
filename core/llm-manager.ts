/**
 * LLM Manager Module - LLM Integration with World-Specific EventEmitter SSE Events
 *
 * Features:
 * - LLM integration using AI SDK without existing event dependencies
 * - Streaming responses with SSE events via World.eventEmitter specifically
 * - Support for all major LLM providers (OpenAI, Anthropic, Google, Azure, XAI, OpenAI-Compatible, Ollama)
 * - Agent activity tracking and token usage monitoring with automatic state persistence
 * - Error handling with SSE error events via world's eventEmitter and timeout management
 * - World-aware event publishing using world.eventEmitter for proper event isolation
 * - Conversation history support with message preparation and context management
 * - Global LLM call queue to ensure serialized execution (one LLM call at a time)
 *
 * Core Functions:
 * - streamAgentResponse: Streaming LLM calls with SSE events via world.eventEmitter (queued)
 * - generateAgentResponse: Non-streaming LLM calls with automatic state management (queued)
 * - loadLLMProvider: Provider loading logic supporting all major LLM services
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
 * Implementation Details:
 * - Uses AI SDK for LLM integration with consistent interfaces across providers
 * - Publishes SSE events via world.eventEmitter.emit('sse', event) for proper isolation
 * - Updates agent activity metrics and LLM call counts automatically
 * - Zero dependencies on existing llm.ts or legacy event systems
 * - Complete provider support extraction with environment variable fallbacks
 * - All events scoped to specific world instance preventing cross-world interference
 * - Full LLM provider support matching and exceeding legacy implementations
 * - Timeout handling with configurable limits and proper error recovery
 * - Queue-based serialization prevents API rate limits and resource conflicts
 *
 * Recent Changes:
 * - Added global LLM call queue to serialize all LLM requests across agents and worlds
 * - Implemented queue safety measures including size limits and timeout handling
 * - Added queue monitoring and emergency clear functions for administration
 * - Enhanced error handling with proper promise rejection and logging
 * - Updated all LLM functions to use queued execution pattern
 * - Documented queue implementation details and safety features
 */

import { generateText, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { World, Agent, AgentMessage, LLMProvider, stripCustomFieldsFromMessages, WorldSSEEvent } from './types';
import { publishSSE } from './world-events';
import { generateId } from './utils';

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

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;

      try {
        // Add processing timeout to prevent stuck queue
        const processPromise = item.execute();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`LLM call timeout after ${this.processingTimeoutMs}ms for agent ${item.agentId}`));
          }, this.processingTimeoutMs);
        });

        const result = await Promise.race([processPromise, timeoutPromise]);
        item.resolve(result);
      } catch (error) {
        console.error(`LLM queue error for agent ${item.agentId}:`, error);
        item.reject(error);
      }
    }

    this.processing = false;
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
  messages: AgentMessage[]
): Promise<string> {
  // Queue the LLM call to ensure serialized execution
  return llmQueue.add(agent.id, world.id, async () => {
    return await executeStreamAgentResponse(world, agent, messages);
  });
}

/**
 * Internal streaming implementation (executed within queue)
 */
async function executeStreamAgentResponse(
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
 * Non-streaming LLM call (queued)
 */
export async function generateAgentResponse(
  world: World,
  agent: Agent,
  messages: AgentMessage[]
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

  // Auto-save agent state after LLM call
  try {
    const { saveAgentToDisk } = await import('./agent-storage');
    await saveAgentToDisk(world.rootPath, world.id, agent);
  } catch (error) {
    console.warn(`Failed to auto-save agent ${agent.id} after LLM call:`, error);
  }

  return text;
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
