/**
 * LLM Manager Module - Pure Orchestration Layer (LLM Provider Refactoring Phase 5)
 *
 * Features:
 * - Browser-safe LLM integration using direct provider SDKs (OpenAI, Anthropic, Google)
 * - Streaming responses with SSE events via World.eventEmitter specifically
 * - Support for all major LLM providers (OpenAI, Anthropic, Google, Azure, XAI, OpenAI-Compatible, Ollama)
 * - Agent activity tracking and token usage monitoring with automatic state persistence
 * - Error handling with SSE error events via world's eventEmitter and timeout management
 * - World-aware event publishing using world.eventEmitter for proper event isolation
 * - Conversation history support with message preparation and context management
 * - Global LLM call queue to ensure serialized execution (one LLM call at a time)
 * - Configuration injection from external sources (CLI/server) for browser compatibility
 * - Automatic MCP tool integration for worlds with mcpConfig
 * - All providers return LLMResponse with unified structure
 * - Granular function-based logging for detailed debugging control
 *
 * Core Functions:
 * - streamAgentResponse: Streaming LLM calls with SSE events via world.eventEmitter (queued)
 * - generateAgentResponse: Non-streaming LLM calls with automatic state management (queued)
 * - loadLLMProvider: Provider loading logic using injected configuration
 * - getLLMQueueStatus: Monitor queue status for debugging and administration
 * - clearLLMQueue: Emergency queue clearing for administrative purposes
 *
 * Provider Support:
 * - OpenAI: Direct OpenAI package integration (bypasses AI SDK bug)
 * - Azure: Direct OpenAI package integration with Azure endpoints (bypasses AI SDK bug)
 * - OpenAI-Compatible: Direct OpenAI package integration (bypasses AI SDK bug)
 * - XAI: Direct OpenAI package integration with XAI endpoints (bypasses AI SDK bug)
 * - Ollama: Direct OpenAI package integration with OpenAI-compatible endpoint (better function calling)
 * - Anthropic: Direct Anthropic SDK integration (improved tool calling support)
 * - Google: Direct Google Generative AI SDK integration (improved tool calling support)
 *
 * Granular Logging Categories:
 * - llm.queue: Queue operations (add, process, complete, errors)
 * - llm.streaming: Streaming response operations (start, chunks, finish, errors)
 * - llm.generation: Non-streaming response operations (start, finish, errors)
 * - llm.provider: Provider loading, configuration, and validation
 * - llm.mcp: Comprehensive MCP tool integration and execution tracking
 * - llm.util: Utility functions and helper operations
 * 
 * Environment Variable Control:
 * - LOG_LLM_QUEUE=debug: Enable queue operation debugging
 * - LOG_LLM_STREAMING=debug: Enable streaming operation debugging
 * - LOG_LLM_GENERATION=debug: Enable generation operation debugging
 * - LOG_LLM_PROVIDER=debug: Enable provider operation debugging
 * - LOG_LLM_MCP=debug: Enable comprehensive MCP tool debugging (consolidates all MCP logging)
 * - LOG_LLM_UTIL=debug: Enable utility function debugging
 *
 * MCP Tool Logging Features (LOG_LLM_MCP=debug):
 * - Tool call sequence tracking with unique sequence IDs
 * - Tool execution performance metrics (duration in milliseconds)
 * - Tool result content analysis (size, type, preview)
 * - Tool call success/failure status with detailed error information
 * - Tool call dependencies and parent-child relationships
 * - Tool argument validation and presence checking
 * - Streaming vs non-streaming execution path differentiation
 * - Complete tool call lifecycle from start to completion
 * - Server-side tool execution via direct MCP server registry calls
 * - AI SDK tool conversion execution tracking
 * - Tool result processing and content type identification
 *
 * LLM Queue Implementation:
 * - Global singleton queue prevents concurrent LLM calls across all agents and worlds
 * - FIFO (First In, First Out) processing ensures fair agent response ordering
 * - Maximum queue size of 100 items prevents memory overflow issues
 * - 15-minute timeout per LLM call supports long-running tool executions (configurable)
 * - Warning logs at 50% timeout threshold for debugging long-running operations
 * - Queue status monitoring available for debugging and performance analysis
 * - Emergency clear function allows administrative queue reset when needed
 * - Proper error handling with promise rejection for failed calls
 * - Automatic queue processing with safety measures for edge cases
 * - Timeout cleanup on promise resolution prevents resource leaks and Jest hanging
 * - Configurable timeout via setProcessingTimeout() for different use cases
 *
 * Browser Safety Implementation:
 * - Zero process.env dependencies for browser compatibility
 * - Configuration injection via llm-config module
 * - All provider settings supplied externally by CLI/server components
 * - Type-safe configuration interfaces prevent runtime errors
 * - Clear error messages when configuration is missing
 *
 * Implementation Details:
 * - Uses direct OpenAI package for OpenAI providers to avoid AI SDK schema corruption bug
 * - Uses direct Anthropic SDK for Anthropic provider to fix tool calling issues
 * - Uses direct Google Generative AI SDK for Google provider to fix tool calling issues
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
 * - 2026-02-13: Reclassified stop-triggered aborts as cancellation/info logs (not errors) in queue and non-streaming paths.
 * - 2026-02-13: Added merged external+queue abort-signal support so chat stop requests can cancel follow-up continuation calls.
 * - 2026-02-13: Added chat-scoped LLM cancellation controls so Electron stop requests can abort active and queued calls by `worldId` + `chatId`.
 * - 2026-02-08: Removed stale manual tool-intervention terminology from internal comments
 * - 2025-11-09: Phase 5 - Updated to expect LLMResponse from all providers
 * - Removed old manual tool decision return type handling
 * - All providers now return unified LLMResponse interface with type discriminator
 * - Updated logging to handle LLMResponse structure (type, content, tool_calls)
 * - Providers are now pure clients - no tool execution, only API calls
 * - NO type checking for string vs object - always LLMResponse
 * - Tool orchestration will be handled by events.ts (Phase 6)
 * - Simplified tool usage guidance: minimal system prompt patch for tool availability
 * - Increased LLM queue timeout from 2 minutes to 15 minutes for long-running tool executions
 * - Replaced AI SDK with direct OpenAI, Anthropic, and Google integrations
 * - Implemented granular function-based logging for detailed debugging control
 * - Tool-specific guidance moved to individual tool descriptions (proper separation)
 */

import { World, Agent, AgentMessage, LLMProvider, WorldSSEEvent, ChatMessage, LLMResponse } from './types.js';
import { getMCPToolsForWorld } from './mcp-server-registry.js';
import { filterClientSideMessages } from './message-prep.js';
import {
  createClientForProvider,
  streamOpenAIResponse,
  generateOpenAIResponse
} from './openai-direct.js';
import {
  createAnthropicClientForAgent,
  streamAnthropicResponse,
  generateAnthropicResponse
} from './anthropic-direct.js';
import {
  createGoogleClientForAgent,
  streamGoogleResponse,
  generateGoogleResponse
} from './google-direct.js';

import { generateId } from './utils.js';
import { createCategoryLogger } from './logger.js';
import { createStorageWithWrappers } from './storage/storage-factory.js';
import type { StorageAPI } from './storage/storage-factory.js';
// Granular function-specific loggers for detailed debugging control
const loggerQueue = createCategoryLogger('llm.queue');
const loggerStreaming = createCategoryLogger('llm.streaming');
const loggerGeneration = createCategoryLogger('llm.generation');
const loggerProvider = createCategoryLogger('llm.provider');
const loggerMCP = createCategoryLogger('llm.mcp');
const loggerUtil = createCategoryLogger('llm.util');
import { getLLMProviderConfig } from './llm-config.js';

// LLM Integration Utilities

function stripCustomFields(message: AgentMessage): ChatMessage {
  const { sender, chatId, ...llmMessage } = message;
  loggerUtil.trace('Stripped custom fields from message', { originalFields: ['sender', 'chatId'], remainingKeys: Object.keys(llmMessage) });
  return llmMessage;
}

function stripCustomFieldsFromMessages(messages: AgentMessage[]): ChatMessage[] {
  loggerUtil.debug(`Stripping custom fields from ${messages.length} messages`);

  // First, filter out client-side tool request wrappers and orphaned tool results.
  const filteredMessages = filterClientSideMessages(messages);

  loggerUtil.debug(`Filtered to ${filteredMessages.length} messages (removed ${messages.length - filteredMessages.length} client-side messages)`);

  // Then strip custom fields
  return filteredMessages.map(stripCustomFields);
}

/**
 * Append tool usage guidance to system message when tools are available
 * Returns a new array with updated system message (doesn't mutate original)
 */
function appendToolRulesToSystemMessage(messages: AgentMessage[], hasMCPTools: boolean): AgentMessage[] {
  if (!hasMCPTools || messages.length === 0 || messages[0].role !== 'system') {
    return messages;
  }

  const systemMessage = messages[0];
  // Simple guidance: Only use tools when user explicitly requests an action
  const toolRules = '\n\nYou have access to tools. Use them only when the user explicitly requests an action.';

  return [
    { ...systemMessage, content: systemMessage.content + toolRules },
    ...messages.slice(1)
  ];
}

// Storage wrapper for tool-execution follow-up handling
let storageWrappersPromise: Promise<StorageAPI> | null = null;

async function getStorageWrappers(): Promise<StorageAPI> {
  if (!storageWrappersPromise) {
    storageWrappersPromise = createStorageWithWrappers();
  }
  return storageWrappersPromise;
}

/**
 * Global LLM call queue to ensure serialized execution
 */
interface QueuedLLMCall {
  id: string;
  agentId: string;
  worldId: string;
  chatId: string | null;
  abortController: AbortController;
  execute: (signal: AbortSignal) => Promise<any>;
  canceled: boolean;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

function normalizeChatId(chatId: string | null | undefined): string {
  if (chatId == null) return '__none__';
  return String(chatId);
}

class LLMQueue {
  private queue: QueuedLLMCall[] = [];
  private processing = false;
  private activeItem: QueuedLLMCall | null = null;
  private maxQueueSize = 100; // Prevent memory issues
  private processingTimeoutMs = 900000; // 15 minute max processing time per call (for long-running tools)

  async add<T>(
    agentId: string,
    worldId: string,
    chatId: string | null,
    task: (signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    // Prevent queue overflow
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error(`LLM queue is full (${this.maxQueueSize} items). Please try again later.`);
    }

    loggerQueue.debug(
      `LLMQueue: Adding task for agent=${agentId}, world=${worldId}, chat=${normalizeChatId(chatId)}. Queue length before add: ${this.queue.length}`
    );
    return new Promise<T>((resolve, reject) => {
      const queueItem: QueuedLLMCall = {
        id: generateId(),
        agentId,
        worldId,
        chatId,
        abortController: new AbortController(),
        canceled: false,
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

    loggerQueue.debug(`LLMQueue: Starting queue processing. Queue length: ${this.queue.length}`);
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      if (item.canceled) {
        continue;
      }

      try {
        this.activeItem = item;
        const taskStartTime = Date.now();
        loggerQueue.debug(
          `LLMQueue: Processing task for agent=${item.agentId}, world=${item.worldId}, chat=${normalizeChatId(item.chatId)}, queueItemId=${item.id}`
        );
        // Add processing timeout to prevent stuck queue
        const processPromise = item.execute(item.abortController.signal);

        // Store timeout ID so we can cancel it if process completes first
        let timeoutId: NodeJS.Timeout;
        let warningTimeoutId: NodeJS.Timeout;

        // Warn if processing takes more than 50% of timeout
        const warningThreshold = this.processingTimeoutMs * 0.5;
        warningTimeoutId = setTimeout(() => {
          const elapsed = Date.now() - taskStartTime;
          loggerQueue.warn(`LLM task is taking longer than expected`, {
            agentId: item.agentId,
            worldId: item.worldId,
            elapsed,
            timeoutMs: this.processingTimeoutMs,
            percentComplete: Math.round((elapsed / this.processingTimeoutMs) * 100)
          });
        }, warningThreshold);

        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`LLM call timeout after ${this.processingTimeoutMs}ms for agent ${item.agentId}`));
          }, this.processingTimeoutMs);
        });

        const result = await Promise.race([processPromise, timeoutPromise]);

        // Clear both timeouts to prevent Jest from hanging
        clearTimeout(timeoutId!);
        clearTimeout(warningTimeoutId!);

        item.resolve(result);
        loggerQueue.debug(`LLMQueue: Finished processing task for agent=${item.agentId}, world=${item.worldId}, queueItemId=${item.id}`);
      } catch (error) {
        const wasCanceled = item.canceled || item.abortController.signal.aborted || isAbortError(error);
        if (wasCanceled) {
          loggerQueue.info('LLM queue call canceled', {
            agentId: item.agentId,
            worldId: item.worldId,
            chatId: normalizeChatId(item.chatId),
            queueItemId: item.id,
            reason: error instanceof Error ? error.message : String(error)
          });
        } else {
          loggerQueue.error('LLM queue error', {
            agentId: item.agentId,
            worldId: item.worldId,
            chatId: normalizeChatId(item.chatId),
            queueItemId: item.id,
            error: error instanceof Error ? error.message : error
          });
        }
        item.reject(error);
      } finally {
        this.activeItem = null;
      }
    }

    this.processing = false;
    loggerQueue.debug('LLMQueue: Queue processing complete.');
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
    const clearedCount = this.queue.length;
    for (const item of this.queue) {
      item.canceled = true;
      item.abortController.abort();
      item.reject(new Error('LLM queue item canceled by queue clear.'));
    }
    this.queue.length = 0;
    loggerQueue.info('LLM queue cleared', { clearedCount });
    return clearedCount;
  }

  cancelByChat(worldId: string, chatId: string | null): { canceledPending: number; abortedActive: number } {
    const targetChatId = normalizeChatId(chatId);
    let canceledPending = 0;
    let abortedActive = 0;

    this.queue = this.queue.filter((item) => {
      const matchesWorld = item.worldId === worldId;
      const matchesChat = normalizeChatId(item.chatId) === targetChatId;
      if (!matchesWorld || !matchesChat) {
        return true;
      }

      item.canceled = true;
      item.abortController.abort();
      item.reject(new Error(`LLM call canceled for world '${worldId}' chat '${targetChatId}'.`));
      canceledPending += 1;
      return false;
    });

    if (this.activeItem) {
      const matchesWorld = this.activeItem.worldId === worldId;
      const matchesChat = normalizeChatId(this.activeItem.chatId) === targetChatId;
      if (matchesWorld && matchesChat && !this.activeItem.abortController.signal.aborted) {
        this.activeItem.abortController.abort();
        abortedActive = 1;
      }
    }

    return { canceledPending, abortedActive };
  }

  // Set processing timeout (useful for testing or adjusting for long-running operations)
  setProcessingTimeout(timeoutMs: number): void {
    if (timeoutMs < 1000) {
      throw new Error('Processing timeout must be at least 1000ms');
    }
    this.processingTimeoutMs = timeoutMs;
    loggerQueue.info('LLM queue processing timeout updated', { timeoutMs });
  }

  // Get current processing timeout
  getProcessingTimeout(): number {
    return this.processingTimeoutMs;
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
}

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes('abort');
}

function createCombinedAbortSignal(
  first?: AbortSignal,
  second?: AbortSignal
): { signal?: AbortSignal; dispose: () => void } {
  const signals = [first, second].filter((value): value is AbortSignal => Boolean(value));
  if (signals.length === 0) {
    return { signal: undefined, dispose: () => { } };
  }
  if (signals.length === 1) {
    return { signal: signals[0], dispose: () => { } };
  }

  const controller = new AbortController();
  const onAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', onAbort);
  }

  const dispose = () => {
    for (const signal of signals) {
      signal.removeEventListener('abort', onAbort);
    }
  };

  return { signal: controller.signal, dispose };
}

/**
 * Streaming agent response with SSE events via world's eventEmitter (queued)
 */
export async function streamAgentResponse(
  world: World,
  agent: Agent,
  messages: AgentMessage[],
  publishSSE: (world: World, data: Partial<WorldSSEEvent>) => void,
  chatId: string | null = null,
  abortSignal?: AbortSignal
): Promise<{ response: LLMResponse; messageId: string }> {
  if (abortSignal?.aborted) {
    throw new DOMException(`LLM call aborted before queue for agent ${agent.id}`, 'AbortError');
  }

  // Queue the LLM call to ensure serialized execution
  return llmQueue.add(agent.id, world.id, chatId, async (queueAbortSignal) => {
    const { signal: mergedAbortSignal, dispose } = createCombinedAbortSignal(queueAbortSignal, abortSignal);
    try {
      if (mergedAbortSignal?.aborted) {
        throw new DOMException(`LLM call aborted before execution for agent ${agent.id}`, 'AbortError');
      }
      return await executeStreamAgentResponse(world, agent, messages, publishSSE, mergedAbortSignal);
    } finally {
      dispose();
    }
  });
}

/**
 * Internal streaming implementation (executed within queue)
 */
async function executeStreamAgentResponse(
  world: World,
  agent: Agent,
  messages: AgentMessage[],
  publishSSE: (world: World, data: Partial<WorldSSEEvent>) => void,
  abortSignal?: AbortSignal
): Promise<{ response: LLMResponse; messageId: string }> {
  const messageId = generateId();

  try {
    if (abortSignal?.aborted) {
      throw new DOMException('LLM call aborted before start', 'AbortError');
    }

    // Publish SSE start event via world's eventEmitter
    publishSSE(world, {
      agentName: agent.id,
      type: 'start',
      messageId
    });

    loggerStreaming.debug(`LLM: Starting streaming response for agent=${agent.id}, world=${world.id}, messageId=${messageId}`);

    // Convert messages for LLM (strip custom fields)
    // Note: Client-side filtering already done by utils.ts prepareMessagesForLLM
    let preparedMessages = stripCustomFieldsFromMessages(messages);

    // Get MCP tools for this world
    const mcpTools = await getMCPToolsForWorld(world.id);
    const hasMCPTools = Object.keys(mcpTools).length > 0;

    // Add tool usage instructions to system message when tools are available
    preparedMessages = appendToolRulesToSystemMessage(preparedMessages, hasMCPTools);

    if (hasMCPTools) {
      loggerMCP.debug(`LLM: Including ${Object.keys(mcpTools).length} MCP tools for agent=${agent.id}, world=${world.id}`);

      // Debug: Log complete tool definitions being sent to LLM
      for (const [toolKey, toolDef] of Object.entries(mcpTools)) {
        loggerMCP.debug(`LLM: Tool definition for ${toolKey}`, {
          toolName: toolKey,
          description: toolDef.description,
          parameters: JSON.stringify(toolDef.parameters, null, 2),
          hasExecuteFunction: typeof toolDef.execute === 'function'
        });
      }
    }

    // Use direct OpenAI integration for OpenAI providers
    if (isOpenAIProvider(agent.provider)) {
      const client = createOpenAIClientForAgent(agent);
      const response = await streamOpenAIResponse(
        client,
        agent.model,
        preparedMessages,
        agent,
        mcpTools,
        world,
        (content: string) => publishSSE(world, { agentName: agent.id, type: 'chunk', content, messageId }),
        messageId,
        abortSignal
      );

      // Emit end event after streaming completes
      publishSSE(world, { agentName: agent.id, type: 'end', messageId });

      return { response, messageId };
    }

    // Use direct Anthropic integration for Anthropic provider
    if (isAnthropicProvider(agent.provider)) {
      const client = createAnthropicClientForAgent(agent);
      const response = await streamAnthropicResponse(
        client,
        agent.model,
        preparedMessages,
        agent,
        mcpTools,
        world,
        (content: string) => publishSSE(world, { agentName: agent.id, type: 'chunk', content, messageId }),
        messageId,
        abortSignal
      );

      // Emit end event after streaming completes
      publishSSE(world, { agentName: agent.id, type: 'end', messageId });

      return { response, messageId };
    }

    // Use direct Google integration for Google provider
    if (isGoogleProvider(agent.provider)) {
      const client = createGoogleClientForAgent(agent);
      const response = await streamGoogleResponse(
        client,
        agent.model,
        preparedMessages,
        agent,
        mcpTools,
        world,
        (content: string) => publishSSE(world, { agentName: agent.id, type: 'chunk', content, messageId }),
        messageId,
        abortSignal
      );

      // Emit end event after streaming completes
      publishSSE(world, { agentName: agent.id, type: 'end', messageId });

      return { response, messageId };
    }

    // All providers now use direct integrations - no AI SDK needed
    throw new Error(`Unsupported provider: ${agent.provider}. All providers should use direct integrations.`);

  } catch (error) {
    if (isAbortError(error) || abortSignal?.aborted) {
      publishSSE(world, {
        agentName: agent.id,
        type: 'end',
        messageId
      });

      loggerStreaming.info(
        `LLM: Streaming response canceled for agent=${agent.id}, world=${world.id}, messageId=${messageId}`
      );
      throw new Error(`LLM call canceled for agent ${agent.id}`);
    }

    // Publish SSE error event via world's eventEmitter
    publishSSE(world, {
      agentName: agent.id,
      type: 'error',
      error: (error as Error).message,
      messageId
    });

    loggerStreaming.error(`LLM: Error during streaming response for agent=${agent.id}, world=${world.id}, messageId=${messageId}, error=${(error as Error).message}`);

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
  _publishSSE?: (world: World, data: Partial<WorldSSEEvent>) => void,
  skipTools?: boolean,
  chatId: string | null = null,
  abortSignal?: AbortSignal
): Promise<{ response: LLMResponse; messageId: string }> {
  if (abortSignal?.aborted) {
    throw new DOMException(`LLM call aborted before queue for agent ${agent.id}`, 'AbortError');
  }

  // Queue the LLM call to ensure serialized execution
  return llmQueue.add(agent.id, world.id, chatId, async (queueAbortSignal) => {
    const { signal: mergedAbortSignal, dispose } = createCombinedAbortSignal(queueAbortSignal, abortSignal);
    try {
      if (mergedAbortSignal?.aborted) {
        throw new DOMException(`LLM call aborted before execution for agent ${agent.id}`, 'AbortError');
      }
      return await executeGenerateAgentResponse(world, agent, messages, skipTools, mergedAbortSignal);
    } finally {
      dispose();
    }
  });
}

/**
 * Internal generation implementation (executed within queue)
 */
async function executeGenerateAgentResponse(
  world: World,
  agent: Agent,
  messages: AgentMessage[],
  skipTools?: boolean,
  abortSignal?: AbortSignal
): Promise<{ response: LLMResponse; messageId: string }> {
  if (abortSignal?.aborted) {
    throw new DOMException('LLM call aborted before start', 'AbortError');
  }
  const messageId = generateId();
  // Convert messages for LLM (strip custom fields)
  // Note: Client-side filtering already done by utils.ts prepareMessagesForLLM
  let preparedMessages = stripCustomFieldsFromMessages(messages);

  // Get MCP tools for this world (skip if requested, e.g., for title generation)
  const mcpTools = skipTools ? {} : await getMCPToolsForWorld(world.id);
  const hasMCPTools = Object.keys(mcpTools).length > 0;

  // Add tool usage instructions to system message when tools are available
  preparedMessages = appendToolRulesToSystemMessage(preparedMessages, hasMCPTools);

  if (hasMCPTools) {
    loggerMCP.debug(`LLM: Including ${Object.keys(mcpTools).length} MCP tools for agent=${agent.id}, world=${world.id}`);

    // Debug: Log complete tool definitions being sent to LLM
    for (const [toolKey, toolDef] of Object.entries(mcpTools)) {
      loggerMCP.debug(`LLM: Tool definition for ${toolKey}`, {
        toolName: toolKey,
        description: toolDef.description,
        parameters: JSON.stringify(toolDef.parameters, null, 2),
        hasExecuteFunction: typeof toolDef.execute === 'function'
      });
    }
  }

  loggerGeneration.debug(`LLM: Starting non-streaming response for agent=${agent.id}, world=${world.id}`, {
    messageCount: preparedMessages.length,
    allMessages: preparedMessages.map(m => ({
      role: m.role,
      hasContent: !!m.content,
      contentPreview: m.content?.substring(0, 50),
      hasToolCalls: !!(m as any).tool_calls,
      toolCallId: (m as any).tool_call_id,
      messageId: (m as any).messageId,
      agentId: (m as any).agentId
    }))
  });

  try {
    // Use direct OpenAI integration for OpenAI providers
    if (isOpenAIProvider(agent.provider)) {
      const client = createOpenAIClientForAgent(agent);
      const response = await generateOpenAIResponse(
        client,
        agent.model,
        preparedMessages,
        agent,
        mcpTools,
        world,
        abortSignal
      );

      // Update agent activity and LLM call count
      agent.lastActive = new Date();
      agent.llmCallCount++;
      agent.lastLLMCall = new Date();

      loggerGeneration.debug(`LLM: Finished non-streaming OpenAI response for agent=${agent.id}, world=${world.id}`, {
        responseType: response.type,
        contentLength: response.content?.length || 0,
        hasToolCalls: response.type === 'tool_calls',
        toolCallCount: response.tool_calls?.length || 0,
        messageId
      });
      return { response, messageId };
    }

    // Use direct Anthropic integration for Anthropic provider
    if (isAnthropicProvider(agent.provider)) {
      const client = createAnthropicClientForAgent(agent);
      const response = await generateAnthropicResponse(
        client,
        agent.model,
        preparedMessages,
        agent,
        mcpTools,
        world,
        abortSignal
      );

      // Update agent activity and LLM call count
      agent.lastActive = new Date();
      agent.llmCallCount++;
      agent.lastLLMCall = new Date();

      loggerGeneration.debug(`LLM: Finished non-streaming Anthropic response for agent=${agent.id}, world=${world.id}`, {
        responseType: response.type,
        contentLength: response.content?.length || 0,
        hasToolCalls: response.type === 'tool_calls',
        toolCallCount: response.tool_calls?.length || 0,
        messageId
      });
      return { response, messageId };
    }

    // Use direct Google integration for Google provider
    if (isGoogleProvider(agent.provider)) {
      const client = createGoogleClientForAgent(agent);
      const response = await generateGoogleResponse(
        client,
        agent.model,
        preparedMessages,
        agent,
        mcpTools,
        world,
        abortSignal
      );

      // Update agent activity and LLM call count
      agent.lastActive = new Date();
      agent.llmCallCount++;
      agent.lastLLMCall = new Date();

      loggerGeneration.debug(`LLM: Finished non-streaming Google response for agent=${agent.id}, world=${world.id}`, {
        responseType: response.type,
        contentLength: response.content?.length || 0,
        hasToolCalls: response.type === 'tool_calls',
        toolCallCount: response.tool_calls?.length || 0,
        messageId
      });
      return { response, messageId };
    }

    // All providers now use direct integrations - no AI SDK needed
    throw new Error(`Provider ${agent.provider} should use direct integration, not AI SDK`);

  } catch (error) {
    if (isAbortError(error) || abortSignal?.aborted) {
      loggerGeneration.info(
        `LLM: Non-streaming response canceled for agent=${agent.id}, world=${world.id}, messageId=${messageId}`
      );
      throw new Error(`LLM call canceled for agent ${agent.id}`);
    }

    loggerGeneration.error(`LLM: Error during non-streaming response for agent=${agent.id}, world=${world.id}, error=${(error as Error).message}`);
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
 * Cancel active and pending LLM calls for a specific world/chat session.
 */
export function cancelLLMCallsForChat(
  worldId: string,
  chatId: string | null
): { canceledPending: number; abortedActive: number } {
  return llmQueue.cancelByChat(worldId, chatId);
}

/**
 * Check if provider uses OpenAI package (direct integration)
 */
function isOpenAIProvider(provider: LLMProvider): boolean {
  return [
    LLMProvider.OPENAI,
    LLMProvider.AZURE,
    LLMProvider.OPENAI_COMPATIBLE,
    LLMProvider.XAI,
    LLMProvider.OLLAMA  // Added: Ollama now uses OpenAI-compatible endpoint
  ].includes(provider);
}

/**
 * Check if provider uses Anthropic direct integration
 */
function isAnthropicProvider(provider: LLMProvider): boolean {
  return provider === LLMProvider.ANTHROPIC;
}

/**
 * Check if provider uses Google direct integration
 */
function isGoogleProvider(provider: LLMProvider): boolean {
  return provider === LLMProvider.GOOGLE;
}

/**
 * Create OpenAI client for agent based on provider type
 */
function createOpenAIClientForAgent(agent: Agent) {
  const config = getLLMProviderConfig(agent.provider);

  switch (agent.provider) {
    case LLMProvider.OPENAI:
      return createClientForProvider('openai', config);
    case LLMProvider.AZURE:
      return createClientForProvider('azure', config);
    case LLMProvider.OPENAI_COMPATIBLE:
      return createClientForProvider('openai-compatible', config);
    case LLMProvider.XAI:
      return createClientForProvider('xai', config);
    case LLMProvider.OLLAMA:
      return createClientForProvider('ollama', config);
    default:
      throw new Error(`Unsupported OpenAI provider: ${agent.provider}`);
  }
}
