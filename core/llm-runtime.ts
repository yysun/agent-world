/**
 * LLM Runtime Host Integration
 *
 * Purpose:
 * - Provide the single Agent World host boundary for llm-runtime-backed model execution.
 *
 * Key Features:
 * - Delegates provider configuration and model execution to the external llm-runtime package.
 * - Preserves Agent World chat-scoped queueing, cancellation, and SSE publication behavior.
 * - Resolves host-owned tools plus llm-runtime-owned MCP tools into the existing execution shape.
 *
 * Implementation Notes:
 * - Agent World keeps queue, chat lifecycle, persistence, and event responsibilities.
 * - llm-runtime owns provider configuration, provider dispatch, MCP registry ownership, and turn-loop control.
 * - Host-owned tools remain explicit extras so existing approval and persistence semantics are preserved.
 *
 * Recent Changes:
 * - 2026-04-23: Added a compatibility loader for `resolveTools` and `resolveToolsAsync` so published `llm-runtime@0.3.2` remains usable until the root exports are published.
 * - 2026-04-23: Disabled host-level `webSearch` by default without a host-side opt-in path.
 * - 2026-04-23: Switched tool discovery to the newly exported `resolveTools` and `resolveToolsAsync` package APIs from llm-runtime.
 * - 2026-04-23: Switched normal host calls back to llm-runtime built-ins and stopped re-registering reserved built-in names as host extras.
 * - 2026-04-23: Always expose the preferred `ask_user_input` HITL alias in runtime tool lists.
 * - 2026-04-23: Clear completed queue timeout timers so successful LLM calls do not emit stale timeout system events after the turn has already finished.
 * - 2026-04-16: Replaced the deleted core llm-manager/llm-config boundary with direct llm-runtime integration.
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as llmRuntimeModule from 'llm-runtime';
import {
  clearAllConfiguration,
  configureLLMProvider,
  generate,
  getConfiguredProviders,
  getConfigurationStatus,
  getLLMProviderConfig,
  isProviderConfigured,
  parseMCPConfigJson,
  stream,
  validateProviderConfig,
  type AnthropicConfig,
  type AzureConfig,
  type BaseLLMConfig,
  type GoogleConfig,
  type LLMProviderName,
  type LLMResolveToolsOptions,
  type LLMResponse as RuntimeLLMResponse,
  type LLMToolExecutionContext,
  type LLMToolDefinition,
  type OllamaConfig,
  type OpenAICompatibleConfig,
  type OpenAIConfig,
  type ProviderConfig,
  type ProviderConfigMap,
  type ToolPermission,
  type XAIConfig,
} from 'llm-runtime';
import { createCreateAgentToolDefinition } from './create-agent-tool.js';
import { createSendMessageToolDefinition } from './send-message-tool.js';
import { wrapToolWithValidation } from './tool-utils.js';
import { RELIABILITY_CONFIG } from './reliability-config.js';
import { createCategoryLogger } from './logger.js';
import { filterClientSideMessages } from './message-prep.js';
import { resolveSkillRootDescriptors } from './skill-root-contract.js';
import {
  buildToolUsagePromptSection,
  generateId,
  getDefaultWorkingDirectory,
  getEnvValueFromText,
} from './utils.js';
import {
  type Agent,
  type AgentMessage,
  type ChatMessage,
  LLMProvider,
  type LLMResponse,
  type World,
  type WorldSSEEvent,
} from './types.js';

const loggerQueue = createCategoryLogger('llm.queue');
const loggerRuntime = createCategoryLogger('llm.runtime');

type RuntimeResolveToolsExports = {
  resolveTools: (options?: LLMResolveToolsOptions) => Record<string, LLMToolDefinition>;
  resolveToolsAsync: (options?: LLMResolveToolsOptions) => Promise<Record<string, LLMToolDefinition>>;
};

let runtimeResolveToolsExportsPromise: Promise<RuntimeResolveToolsExports> | null = null;

type QueuedLLMCall = {
  id: string;
  agentId: string;
  worldId: string;
  chatId: string | null;
  abortController: AbortController;
  execute: (signal: AbortSignal) => Promise<unknown>;
  onTakingTooLong?: (details: { elapsedMs: number; timeoutMs: number }) => void;
  onTimedOut?: (details: { elapsedMs: number; timeoutMs: number }) => void;
  canceled: boolean;
  clearTimeoutTimer?: () => void;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

type ChatQueueState = {
  queue: QueuedLLMCall[];
  processing: boolean;
  activeItem: QueuedLLMCall | null;
};

const MAX_QUEUE_SIZE = 100;
const queueStates = new Map<string, ChatQueueState>();

function normalizeChatId(chatId: string | null | undefined): string {
  if (chatId == null) {
    return '__none__';
  }

  return String(chatId);
}

function getQueueKey(worldId: string, chatId: string | null): string {
  return `${worldId}::${normalizeChatId(chatId)}`;
}

function getOrCreateQueueState(worldId: string, chatId: string | null): ChatQueueState {
  const key = getQueueKey(worldId, chatId);
  const existing = queueStates.get(key);
  if (existing) {
    return existing;
  }

  const created: ChatQueueState = {
    queue: [],
    processing: false,
    activeItem: null,
  };
  queueStates.set(key, created);
  return created;
}

function deleteQueueIfIdle(worldId: string, chatId: string | null): void {
  const key = getQueueKey(worldId, chatId);
  const state = queueStates.get(key);
  if (!state) {
    return;
  }

  if (!state.processing && state.queue.length === 0 && !state.activeItem) {
    queueStates.delete(key);
  }
}

function createQueueTimeoutError(agentId: string, timeoutMs: number): Error {
  const error = new Error(`LLM call timeout after ${timeoutMs}ms for agent ${agentId}`) as Error & { code?: string };
  error.name = 'LLMQueueTimeoutError';
  error.code = 'LLM_QUEUE_TIMEOUT';
  return error;
}

function isLLMQueueTimeoutError(error: unknown): error is Error & { code?: string } {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: unknown }).code === 'LLM_QUEUE_TIMEOUT'
  );
}

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes('abort') || message.toLowerCase().includes('canceled');
}

function emitLLMTimeoutSystemStatus(world: World, chatId: string | null, content: string): void {
  const scopedChatId = typeof chatId === 'string' ? chatId.trim() : '';
  if (!scopedChatId) {
    return;
  }

  world.eventEmitter.emit('system', {
    content,
    timestamp: new Date(),
    messageId: generateId(),
    chatId: scopedChatId,
  });
}

function createCombinedAbortSignal(first?: AbortSignal, second?: AbortSignal): {
  signal?: AbortSignal;
  dispose: () => void;
} {
  const signals = [first, second].filter((value): value is AbortSignal => Boolean(value));
  if (signals.length === 0) {
    return { signal: undefined, dispose: () => undefined };
  }
  if (signals.length === 1) {
    return { signal: signals[0], dispose: () => undefined };
  }

  const controller = new AbortController();
  const onAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', onAbort);
  }

  return {
    signal: controller.signal,
    dispose: () => {
      for (const signal of signals) {
        signal.removeEventListener('abort', onAbort);
      }
    },
  };
}

async function processChatQueue(worldId: string, chatId: string | null): Promise<void> {
  const state = getOrCreateQueueState(worldId, chatId);
  if (state.processing) {
    return;
  }

  state.processing = true;
  while (state.queue.length > 0) {
    const item = state.queue.shift();
    if (!item) {
      continue;
    }

    if (item.canceled) {
      item.reject(new DOMException(`LLM call canceled before execution for agent ${item.agentId}`, 'AbortError'));
      continue;
    }

    state.activeItem = item;
    const timeoutMs = RELIABILITY_CONFIG.llm.processingTimeoutMs;
    const warningMs = Math.floor(timeoutMs * RELIABILITY_CONFIG.llm.warningThresholdRatio);
    const startedAt = Date.now();
    const warningTimer = setTimeout(() => {
      item.onTakingTooLong?.({ elapsedMs: Date.now() - startedAt, timeoutMs });
    }, warningMs);
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timeoutTimer = setTimeout(() => {
        const timeoutError = createQueueTimeoutError(item.agentId, timeoutMs);
        item.onTimedOut?.({ elapsedMs: Date.now() - startedAt, timeoutMs });
        item.abortController.abort(timeoutError);
        reject(timeoutError);
      }, timeoutMs);

      item.abortController.signal.addEventListener('abort', () => {
        clearTimeout(timeoutTimer);
      }, { once: true });

      item.clearTimeoutTimer = () => {
        clearTimeout(timeoutTimer);
      };
    });

    try {
      const result = await Promise.race([
        item.execute(item.abortController.signal),
        timeoutPromise,
      ]);
      item.resolve(result);
    } catch (error) {
      if (isLLMQueueTimeoutError(error)) {
        item.reject(error);
      } else if (isAbortError(error) || item.abortController.signal.aborted || item.canceled) {
        item.reject(new DOMException(`LLM call canceled for agent ${item.agentId}`, 'AbortError'));
      } else {
        item.reject(error);
      }
    } finally {
      clearTimeout(warningTimer);
      item.clearTimeoutTimer?.();
      state.activeItem = null;
    }
  }

  state.processing = false;
  deleteQueueIfIdle(worldId, chatId);
}

async function addToQueue<T>(
  agentId: string,
  worldId: string,
  chatId: string | null,
  task: (signal: AbortSignal) => Promise<T>,
  options?: {
    onTakingTooLong?: (details: { elapsedMs: number; timeoutMs: number }) => void;
    onTimedOut?: (details: { elapsedMs: number; timeoutMs: number }) => void;
  },
): Promise<T> {
  const state = getOrCreateQueueState(worldId, chatId);
  if (state.queue.length >= MAX_QUEUE_SIZE) {
    throw new Error(`LLM queue is full (${MAX_QUEUE_SIZE} items). Please try again later.`);
  }

  return await new Promise<T>((resolve, reject) => {
    state.queue.push({
      id: generateId(),
      agentId,
      worldId,
      chatId,
      abortController: new AbortController(),
      execute: task,
      onTakingTooLong: options?.onTakingTooLong,
      onTimedOut: options?.onTimedOut,
      canceled: false,
      clearTimeoutTimer: undefined,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    void processChatQueue(worldId, chatId);
  });
}

function mapProvider(provider: LLMProvider): LLMProviderName {
  switch (provider) {
    case LLMProvider.OPENAI:
      return 'openai';
    case LLMProvider.ANTHROPIC:
      return 'anthropic';
    case LLMProvider.GOOGLE:
      return 'google';
    case LLMProvider.AZURE:
      return 'azure';
    case LLMProvider.XAI:
      return 'xai';
    case LLMProvider.OPENAI_COMPATIBLE:
      return 'openai-compatible';
    case LLMProvider.OLLAMA:
      return 'ollama';
    default:
      throw new Error(`Unsupported provider: ${String(provider)}`);
  }
}

function toRuntimeMessage(message: AgentMessage): ChatMessage {
  const { sender, chatId, agentId, messageId, replyToMessageId, ...llmMessage } = message as AgentMessage & {
    replyToMessageId?: string;
  };
  return llmMessage;
}

function stripCustomFieldsFromMessages(messages: AgentMessage[]): ChatMessage[] {
  return filterClientSideMessages(messages).map(toRuntimeMessage);
}

function getReasoningEffort(world: World): 'default' | 'none' | 'low' | 'medium' | 'high' {
  const value = String(getEnvValueFromText(world.variables, 'reasoning_effort') || 'default').trim().toLowerCase();
  if (value === 'none' || value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  return 'default';
}

function getToolPermission(world: World): ToolPermission {
  const value = String(getEnvValueFromText(world.variables, 'tool_permission') || 'auto').trim().toLowerCase();
  if (value === 'ask' || value === 'read') {
    return value;
  }
  return 'auto';
}

function getHostToolDefinitions(): LLMToolDefinition[] {
  return [
    {
      ...wrapToolDefinitionForHost(wrapToolWithValidation(createCreateAgentToolDefinition(), 'create_agent')),
      name: 'create_agent',
    },
    {
      ...wrapToolDefinitionForHost(wrapToolWithValidation(createSendMessageToolDefinition(), 'send_message')),
      name: 'send_message',
    },
  ] as LLMToolDefinition[];
}

function getHostToolMap(): Record<string, LLMToolDefinition> {
  return Object.fromEntries(getHostToolDefinitions().map((tool) => [tool.name, tool]));
}

function getSkillRootsForWorld(world: World | null | undefined): string[] {
  if (!world) {
    return [];
  }

  return resolveSkillRootDescriptors({ worldVariablesText: world.variables })
    .map((descriptor) => descriptor.rootPath)
    .filter(Boolean);
}

async function loadRuntimeResolveToolsExports(): Promise<RuntimeResolveToolsExports> {
  const maybeResolveTools = (llmRuntimeModule as Partial<RuntimeResolveToolsExports>).resolveTools;
  const maybeResolveToolsAsync = (llmRuntimeModule as Partial<RuntimeResolveToolsExports>).resolveToolsAsync;
  if (typeof maybeResolveTools === 'function' && typeof maybeResolveToolsAsync === 'function') {
    return {
      resolveTools: maybeResolveTools,
      resolveToolsAsync: maybeResolveToolsAsync,
    };
  }

  if (!runtimeResolveToolsExportsPromise) {
    runtimeResolveToolsExportsPromise = (async () => {
      const require = createRequire(import.meta.url);
      const runtimePackageJsonPath = require.resolve('llm-runtime/package.json');
      const runtimeModuleUrl = pathToFileURL(join(dirname(runtimePackageJsonPath), 'dist', 'runtime.js')).href;
      const runtimeModule = await import(runtimeModuleUrl) as Partial<RuntimeResolveToolsExports>;
      if (typeof runtimeModule.resolveTools !== 'function' || typeof runtimeModule.resolveToolsAsync !== 'function') {
        throw new Error('llm-runtime runtime tool resolvers are unavailable from both the package root and dist/runtime.js');
      }
      return {
        resolveTools: runtimeModule.resolveTools,
        resolveToolsAsync: runtimeModule.resolveToolsAsync,
      };
    })();
  }

  return await runtimeResolveToolsExportsPromise;
}

function wrapToolDefinitionForHost(toolDefinition: LLMToolDefinition): LLMToolDefinition {
  return {
    ...toolDefinition,
    execute: toolDefinition.execute
      ? async (args: Record<string, unknown>, context?: LLMToolExecutionContext) => {
        const nextContext = context as unknown as Record<string, unknown> | undefined;
        const sequenceId = typeof nextContext?.sequenceId === 'string' ? nextContext.sequenceId : undefined;
        const parentToolCallId = typeof nextContext?.parentToolCallId === 'string' ? nextContext.parentToolCallId : undefined;
        if (toolDefinition.execute && toolDefinition.execute.length <= 2) {
          return await toolDefinition.execute(args, context);
        }
        return await (toolDefinition.execute as (
          args: Record<string, unknown>,
          sequenceId?: string,
          parentToolCallId?: string,
          context?: Record<string, unknown>,
        ) => Promise<unknown>)(args, sequenceId, parentToolCallId, nextContext);
      }
      : undefined,
  };
}

export async function getRuntimeToolsForWorld(world: World | null | undefined): Promise<Record<string, LLMToolDefinition>> {
  const runtimeResolveTools = await loadRuntimeResolveToolsExports();
  if (!world) {
    return runtimeResolveTools.resolveTools({
      skillRoots: getSkillRootsForWorld(world),
      tools: getHostToolMap(),
    });
  }

  return await runtimeResolveTools.resolveToolsAsync({
    mcpConfig: parseMCPConfigJson(world.mcpConfig ?? null),
    skillRoots: getSkillRootsForWorld(world),
    tools: getHostToolMap(),
  });
}

export function appendToolRulesToSystemMessage(
  messages: AgentMessage[],
  toolNames: string[],
  options?: { workingDirectory?: string },
): AgentMessage[] {
  if (messages.length === 0 || messages[0].role !== 'system') {
    return messages;
  }

  const systemMessage = messages[0];
  const normalizedToolNames = new Set(toolNames.map((toolName) => String(toolName || '').trim().toLowerCase()).filter(Boolean));
  const toolUsageSection = buildToolUsagePromptSection({ toolNames });
  const workingDirectory = typeof options?.workingDirectory === 'string' ? options.workingDirectory.trim() : '';
  const shellExecutionRule = normalizedToolNames.has('shell_cmd') && workingDirectory
    ? 'When using `shell_cmd`, execute commands only within this trusted working directory scope: ' + workingDirectory
    : '';
  const injectedSections = [shellExecutionRule, toolUsageSection].filter(Boolean);
  if (injectedSections.length === 0) {
    return messages;
  }

  return [
    { ...systemMessage, content: `${systemMessage.content}\n\n${injectedSections.join('\n\n')}` },
    ...messages.slice(1),
  ];
}

async function executeGenerateAgentResponse(
  world: World,
  agent: Agent,
  messages: AgentMessage[],
  skipTools?: boolean,
  chatId: string | null = null,
  abortSignal?: AbortSignal,
): Promise<{ response: LLMResponse; messageId: string }> {
  const messageId = generateId();
  const provider = mapProvider(agent.provider);
  const providerConfig = getLLMProviderConfig(provider);
  const workingDirectory = String(getEnvValueFromText(world.variables, 'working_directory') || getDefaultWorkingDirectory()).trim();
  let preparedMessages = stripCustomFieldsFromMessages(messages) as AgentMessage[];
  const advertisedTools = skipTools ? {} : await getRuntimeToolsForWorld(world);
  const hostTools = getHostToolMap();
  preparedMessages = appendToolRulesToSystemMessage(preparedMessages, Object.keys(advertisedTools), { workingDirectory });

  const response = await generate({
    provider,
    providerConfig,
    model: agent.model,
    messages: preparedMessages,
    ...(skipTools
      ? { builtIns: false, tools: {} }
      : {
        mcpConfig: parseMCPConfigJson(world.mcpConfig ?? null),
        skillRoots: getSkillRootsForWorld(world),
        tools: hostTools,
      }),
    context: {
      abortSignal,
      workingDirectory,
      reasoningEffort: getReasoningEffort(world),
      toolPermission: getToolPermission(world),
      world,
      chatId,
      agentName: agent.id,
    },
  });

  agent.lastActive = new Date();
  agent.llmCallCount++;
  agent.lastLLMCall = new Date();
  ((response.assistantMessage as unknown) as Record<string, unknown>).messageId = messageId;

  loggerRuntime.debug('Generated non-streaming llm-runtime response', {
    agentId: agent.id,
    worldId: world.id,
    chatId,
    messageId,
    responseType: response.type,
    toolCallCount: response.tool_calls?.length ?? 0,
  });

  return { response: response as LLMResponse, messageId };
}

async function executeStreamAgentResponse(
  world: World,
  agent: Agent,
  messages: AgentMessage[],
  publishSSE: (world: World, data: Partial<WorldSSEEvent>) => void,
  chatId: string,
  abortSignal?: AbortSignal,
): Promise<{ response: LLMResponse; messageId: string }> {
  const messageId = generateId();
  const provider = mapProvider(agent.provider);
  const providerConfig = getLLMProviderConfig(provider);
  const workingDirectory = String(getEnvValueFromText(world.variables, 'working_directory') || getDefaultWorkingDirectory()).trim();
  let preparedMessages = stripCustomFieldsFromMessages(messages) as AgentMessage[];
  const runtimeTools = await getRuntimeToolsForWorld(world);
  const hostTools = getHostToolMap();
  preparedMessages = appendToolRulesToSystemMessage(preparedMessages, Object.keys(runtimeTools), { workingDirectory });

  publishSSE(world, {
    agentName: agent.id,
    type: 'start',
    messageId,
    chatId,
  });

  try {
    const response = await stream({
      provider,
      providerConfig,
      model: agent.model,
      messages: preparedMessages,
      mcpConfig: parseMCPConfigJson(world.mcpConfig ?? null),
      skillRoots: getSkillRootsForWorld(world),
      tools: hostTools,
      onChunk: (chunk) => {
        publishSSE(world, {
          agentName: agent.id,
          type: 'chunk',
          content: chunk.content,
          reasoningContent: chunk.reasoningContent,
          messageId,
          chatId,
        });
      },
      context: {
        abortSignal,
        workingDirectory,
        reasoningEffort: getReasoningEffort(world),
        toolPermission: getToolPermission(world),
        world,
        chatId,
        agentName: agent.id,
      },
    });

    agent.lastActive = new Date();
    agent.llmCallCount++;
    agent.lastLLMCall = new Date();
    ((response.assistantMessage as unknown) as Record<string, unknown>).messageId = messageId;

    publishSSE(world, {
      agentName: agent.id,
      type: 'end',
      messageId,
      chatId,
    });

    return { response: response as LLMResponse, messageId };
  } catch (error) {
    if (isAbortError(error) || abortSignal?.aborted) {
      publishSSE(world, {
        agentName: agent.id,
        type: 'end',
        messageId,
        chatId,
      });
      throw new Error(`LLM call canceled for agent ${agent.id}`);
    }

    publishSSE(world, {
      agentName: agent.id,
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
      messageId,
      chatId,
    });
    throw error;
  }
}

export async function streamAgentResponse(
  world: World,
  agent: Agent,
  messages: AgentMessage[],
  publishSSE: (world: World, data: Partial<WorldSSEEvent>) => void,
  chatId: string | null = null,
  abortSignal?: AbortSignal,
): Promise<{ response: LLMResponse; messageId: string }> {
  if (abortSignal?.aborted) {
    throw new DOMException(`LLM call aborted before queue for agent ${agent.id}`, 'AbortError');
  }

  const normalizedChatId = typeof chatId === 'string' ? chatId.trim() : '';
  const resolvedChatId = normalizedChatId || null;
  if (!resolvedChatId) {
    throw new Error(`streamAgentResponse: chatId is required for agent ${agent.id}`);
  }

  return await addToQueue(agent.id, world.id, resolvedChatId, async (queueAbortSignal) => {
    const { signal, dispose } = createCombinedAbortSignal(queueAbortSignal, abortSignal);
    try {
      return await executeStreamAgentResponse(world, agent, messages, publishSSE, resolvedChatId, signal);
    } finally {
      dispose();
    }
  }, {
    onTakingTooLong: ({ elapsedMs, timeoutMs }) => {
      emitLLMTimeoutSystemStatus(world, resolvedChatId, `LLM processing taking too long for ${agent.id} (elapsed ${Math.floor(elapsedMs / 1000)}s, timeout ${Math.floor(timeoutMs / 1000)}s).`);
    },
    onTimedOut: ({ timeoutMs }) => {
      emitLLMTimeoutSystemStatus(world, resolvedChatId, `LLM processing timed out for ${agent.id} after ${Math.floor(timeoutMs / 1000)}s.`);
    },
  });
}

export async function generateAgentResponse(
  world: World,
  agent: Agent,
  messages: AgentMessage[],
  _publishSSE?: (world: World, data: Partial<WorldSSEEvent>) => void,
  skipTools?: boolean,
  chatId: string | null = null,
  abortSignal?: AbortSignal,
): Promise<{ response: LLMResponse; messageId: string }> {
  if (abortSignal?.aborted) {
    throw new DOMException(`LLM call aborted before queue for agent ${agent.id}`, 'AbortError');
  }

  const normalizedChatId = typeof chatId === 'string' ? chatId.trim() : '';
  const resolvedChatId = normalizedChatId || null;
  if (!resolvedChatId) {
    throw new Error(`generateAgentResponse: chatId is required for agent ${agent.id}`);
  }

  return await addToQueue(agent.id, world.id, resolvedChatId, async (queueAbortSignal) => {
    const { signal, dispose } = createCombinedAbortSignal(queueAbortSignal, abortSignal);
    try {
      return await executeGenerateAgentResponse(world, agent, messages, skipTools, resolvedChatId, signal);
    } finally {
      dispose();
    }
  }, {
    onTakingTooLong: ({ elapsedMs, timeoutMs }) => {
      emitLLMTimeoutSystemStatus(world, resolvedChatId, `LLM processing taking too long for ${agent.id} (elapsed ${Math.floor(elapsedMs / 1000)}s, timeout ${Math.floor(timeoutMs / 1000)}s).`);
    },
    onTimedOut: ({ timeoutMs }) => {
      emitLLMTimeoutSystemStatus(world, resolvedChatId, `LLM processing timed out for ${agent.id} after ${Math.floor(timeoutMs / 1000)}s.`);
    },
  });
}

export function getLLMQueueStatus(): {
  queueLength: number;
  processing: boolean;
  nextAgent?: string;
  nextWorld?: string;
  maxQueueSize: number;
  activeChatQueues: number;
} {
  let queueLength = 0;
  let processing = false;
  let nextAgent: string | undefined;
  let nextWorld: string | undefined;

  for (const state of queueStates.values()) {
    queueLength += state.queue.length;
    processing = processing || state.processing;
    const nextItem = state.activeItem ?? state.queue[0];
    if (!nextAgent && nextItem) {
      nextAgent = nextItem.agentId;
      nextWorld = nextItem.worldId;
    }
  }

  return {
    queueLength,
    processing,
    nextAgent,
    nextWorld,
    maxQueueSize: MAX_QUEUE_SIZE,
    activeChatQueues: queueStates.size,
  };
}

export function clearLLMQueue(): number {
  let clearedCount = 0;
  for (const state of queueStates.values()) {
    clearedCount += state.queue.length;
    for (const item of state.queue) {
      item.canceled = true;
      item.reject(new DOMException(`LLM call canceled before execution for agent ${item.agentId}`, 'AbortError'));
    }
    state.queue.length = 0;
  }
  return clearedCount;
}

export function cancelLLMCallsForChat(worldId: string, chatId: string | null): {
  canceledPending: number;
  abortedActive: number;
} {
  const key = getQueueKey(worldId, chatId);
  const state = queueStates.get(key);
  if (!state) {
    return { canceledPending: 0, abortedActive: 0 };
  }

  let canceledPending = 0;
  let abortedActive = 0;
  for (const item of state.queue) {
    item.canceled = true;
    item.reject(new DOMException(`LLM call canceled before execution for agent ${item.agentId}`, 'AbortError'));
    canceledPending += 1;
  }
  state.queue = [];
  if (state.activeItem) {
    abortedActive = 1;
    state.activeItem.canceled = true;
    state.activeItem.abortController.abort();
  }

  loggerQueue.info('Canceled llm queue items for chat', {
    worldId,
    chatId,
    canceledPending,
    abortedActive,
  });

  deleteQueueIfIdle(worldId, chatId);
  return { canceledPending, abortedActive };
}

export {
  configureLLMProvider,
  validateProviderConfig,
  getLLMProviderConfig,
  isProviderConfigured,
  getConfiguredProviders,
  clearAllConfiguration,
  getConfigurationStatus,
};

export type {
  BaseLLMConfig,
  OpenAIConfig,
  AnthropicConfig,
  GoogleConfig,
  AzureConfig,
  XAIConfig,
  OpenAICompatibleConfig,
  OllamaConfig,
  ProviderConfigMap,
  ProviderConfig,
};