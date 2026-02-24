/**
 * Pi-Agent-Core Adapter Module
 *
 * Provides integration layer between agent-world and @mariozechner/pi-agent-core.
 * Handles agent creation, message conversion, event bridging, and API key resolution.
 *
 * Features:
 * - Create pi-agent-core Agent instances from agent-world Agent configs
 * - Convert between agent-world AgentMessage and pi-agent-core message formats
 * - Bridge pi-agent-core events to World.eventEmitter for UI compatibility
 * - Dynamic API key resolution from environment variables
 * - Agent instance caching per world/agent pair
 *
 * Implementation:
 * - Uses @mariozechner/pi-ai getModel() for LLM provider abstraction
 * - Uses @sinclair/typebox for tool parameter schemas
 * - Maps message roles: tool → toolResult, system → agent.systemPrompt
 * - Publishes SSE and tool events through World.eventEmitter
 *
 * Created: 2026-02-01
 */

import { Agent as PiAgent } from '@mariozechner/pi-agent-core';
import * as fs from 'fs';
import type { AgentEvent, AgentMessage as PiAgentMessage, AgentTool, AgentState } from '@mariozechner/pi-agent-core';
import { getModel, getEnvApiKey } from '@mariozechner/pi-ai';
import type { Message, Model, UserMessage, AssistantMessage, ToolResultMessage } from '@mariozechner/pi-ai';
import type { Agent, World, AgentMessage } from './types.js';
import { LLMProvider } from './types.js';
import { createCategoryLogger } from './logger.js';
import { generateId } from './utils.js';

const logger = createCategoryLogger('pi-adapter');

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Cached pi-agent instance with metadata
 */
interface CachedPiAgent {
  agent: PiAgent;
  worldId: string;
  agentId: string;
  createdAt: Date;
  unsubscribe?: () => void;
}

/**
 * Provider mapping from agent-world LLMProvider to pi-ai provider names
 */
const PROVIDER_MAP: Record<LLMProvider, string> = {
  [LLMProvider.OPENAI]: 'openai',
  [LLMProvider.ANTHROPIC]: 'anthropic',
  [LLMProvider.GOOGLE]: 'google',
  [LLMProvider.AZURE]: 'azure-openai-responses',
  [LLMProvider.XAI]: 'xai',
  [LLMProvider.OPENAI_COMPATIBLE]: 'openai',
  [LLMProvider.OLLAMA]: 'ollama' // Ollama has its own provider in pi-ai
};

// ============================================================================
// Agent Instance Cache
// ============================================================================

/**
 * Cache of pi-agent instances keyed by "worldId:agentId"
 */
const agentCache = new Map<string, CachedPiAgent>();

/**
 * Generate cache key for agent instance
 */
function getCacheKey(worldId: string, agentId: string): string {
  return `${worldId}:${agentId}`;
}

/**
 * Get or create a pi-agent instance for the given agent
 */
export async function getPiAgentForAgent(
  world: World,
  agent: Agent,
  tools?: AgentTool[]
): Promise<PiAgent> {
  const cacheKey = getCacheKey(world.id, agent.id);
  const cached = agentCache.get(cacheKey);

  if (cached) {
    logger.debug('Using cached pi-agent instance', { worldId: world.id, agentId: agent.id });
    try {
      const fs = await import('fs');
      fs.appendFileSync('data/debug_trace.log', `[${new Date().toISOString()}] ADAPTER: Returning CACHED pi-agent for ${agent.id}\n`);
    } catch (e) {}
    return cached.agent;
  }

  logger.debug('Creating new pi-agent instance', { worldId: world.id, agentId: agent.id });
  try {
    const fs = await import('fs');
    fs.appendFileSync('data/debug_trace.log', `[${new Date().toISOString()}] ADAPTER: Creating NEW pi-agent for ${agent.id}\n`);
  } catch (e) {}
  const piAgent = await createPiAgentForAgent(world, agent, tools);

  // Cache the instance
  agentCache.set(cacheKey, {
    agent: piAgent,
    worldId: world.id,
    agentId: agent.id,
    createdAt: new Date()
  });

  return piAgent;
}

/**
 * Clear cached pi-agent instance for an agent
 */
export function clearPiAgentCache(worldId: string, agentId: string): void {
  const cacheKey = getCacheKey(worldId, agentId);
  const cached = agentCache.get(cacheKey);

  if (cached) {
    cached.unsubscribe?.();
    agentCache.delete(cacheKey);
    logger.debug('Cleared pi-agent cache', { worldId, agentId });
  }
}

/**
 * Clear all cached pi-agent instances for a world
 */
export function clearWorldPiAgentCache(worldId: string): void {
  for (const [key, cached] of agentCache.entries()) {
    if (cached.worldId === worldId) {
      cached.unsubscribe?.();
      agentCache.delete(key);
    }
  }
  logger.debug('Cleared all pi-agent instances for world', { worldId });
}

// ============================================================================
// Agent Creation
// ============================================================================

/**
 * Create a pi-agent-core Agent instance from agent-world Agent config
 */
export async function createPiAgentForAgent(
  world: World,
  agent: Agent,
  tools?: AgentTool[]
): Promise<PiAgent> {
  // Get the model for this agent's provider and model ID
  const model = getModelForAgent(agent);

  logger.debug('Creating pi-agent with model', { agentId: agent.id, model });

  // Create the pi-agent instance
  const piAgent = new PiAgent({
    initialState: {
      systemPrompt: agent.systemPrompt || '',
      model,
      tools: tools || [],
      messages: [],
      thinkingLevel: 'off',
      isStreaming: false,
      streamMessage: null,
      pendingToolCalls: new Set()
    },
    getApiKey: (provider) => getApiKeyForProvider(provider),
    convertToLlm: (messages) => convertMessagesToLLM(messages)
  });

  logger.info('Created pi-agent instance', {
    agentId: agent.id,
    provider: agent.provider,
    model: agent.model,
    hasSystemPrompt: !!agent.systemPrompt,
    initialStateModel: piAgent.state.model
  });

  return piAgent;
}

/**
 * Get pi-ai Model for agent's provider and model ID
 */
function getModelForAgent(agent: Agent): Model<any> {
  const provider = PROVIDER_MAP[agent.provider];
  if (!provider) {
    throw new Error(`Unsupported provider: ${agent.provider}`);
  }

  logger.debug('Getting model for agent', {
    agentId: agent.id,
    agentProvider: agent.provider,
    mappedProvider: provider,
    modelId: agent.model
  });

  try {
    // For known providers with known models, use getModel directly
    const model = getModel(provider as any, agent.model as any);
    logger.debug('Got model from pi-ai', { provider, modelId: agent.model, model });

    // Check if model is undefined (not found in registry)
    if (!model) {
      throw new Error(`Model ${agent.model} not found in pi-ai registry for provider ${provider}`);
    }

    return model;
  } catch (error) {
    // If model not found in pi-ai registry, create a custom model definition
    logger.warn('Model not found in pi-ai, using custom definition', {
      provider,
      modelId: agent.model,
      error: error instanceof Error ? error.message : error
    });

    // Return a minimal model definition for custom/unknown models
    // Use conservative defaults that work with most providers
    const customModel = {
      id: agent.model,
      name: agent.model,
      api: provider === 'anthropic' ? 'anthropic-messages' : 'openai-completions',
      provider,
      baseUrl: getBaseUrlForProvider(agent.provider),
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 32000, // Conservative default for unknown models
      maxTokens: agent.maxTokens || 4096
    } as Model<any>;

    logger.debug('Created custom model', { customModel });
    return customModel;
  }
}

/**
 * Get base URL for provider
 */
function getBaseUrlForProvider(provider: LLMProvider): string {
  switch (provider) {
    case LLMProvider.OPENAI:
      return 'https://api.openai.com/v1';
    case LLMProvider.ANTHROPIC:
      return 'https://api.anthropic.com';
    case LLMProvider.GOOGLE:
      return 'https://generativelanguage.googleapis.com';
    case LLMProvider.AZURE:
      return process.env.AZURE_OPENAI_ENDPOINT || '';
    case LLMProvider.XAI:
      return 'https://api.x.ai/v1';
    case LLMProvider.OLLAMA:
      // Default to OpenAI-compatible endpoint as per system design
      return process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
    case LLMProvider.OPENAI_COMPATIBLE: {
      const url = process.env.OPENAI_COMPATIBLE_BASE_URL;
      if (url && !url.match(/^https?:\/\//)) {
        throw new Error(`Invalid OPENAI_COMPATIBLE_BASE_URL: must start with http:// or https://`);
      }
      return url || '';
    }
    default:
      return '';
  }
}

// ============================================================================
// API Key Resolution
// ============================================================================

/**
 * Get API key for provider from environment variables
 * Replaces llm-config.ts functionality
 */
export function getApiKeyForProvider(provider: string): string | undefined {
  // First try pi-ai's built-in env key resolution
  const envKey = getEnvApiKey(provider as any);
  if (envKey) {
    return envKey;
  }

  // Fallback to common environment variable patterns
  switch (provider.toLowerCase()) {
    case 'openai':
      return process.env.OPENAI_API_KEY;
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY;
    case 'google':
      return process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    case 'azure-openai-responses':
    case 'azure':
      return process.env.AZURE_OPENAI_API_KEY;
    case 'xai':
      return process.env.XAI_API_KEY;
    case 'groq':
      return process.env.GROQ_API_KEY;
    case 'ollama':
      // Ollama doesn't require an API key (runs locally), return dummy value
      return 'ollama';
    default:
      logger.warn('No API key found for provider', { provider });
      return undefined;
  }
}

// ============================================================================
// Message Conversion
// ============================================================================

/**
 * Convert agent-world AgentMessage[] to pi-ai Message[] for LLM calls
 */
export function convertMessagesToLLM(messages: PiAgentMessage[]): Message[] {
  const result: Message[] = [];

  for (const msg of messages) {
    // Handle standard LLM message roles
    if ('role' in msg) {
      const role = msg.role as string;

      if (role === 'user') {
        result.push(msg as UserMessage);
      } else if (role === 'assistant') {
        result.push(msg as AssistantMessage);
      } else if (role === 'toolResult') {
        result.push(msg as ToolResultMessage);
      }
      // Skip unknown roles (including legacy 'system' if any)
    }
  }

  return result;
}

/**
 * Convert agent-world storage messages to pi-agent-core format
 *
 * Handles:
 * - role: 'tool' → role: 'toolResult'
 * - role: 'system' → filtered out (use agent.systemPrompt)
 * - tool_call_id → toolCallId
 */
export function toAgentMessage(stored: AgentMessage): PiAgentMessage | null {
  // Skip system messages
  if (stored.role === 'system') {
    return null;
  }

  // Map tool role to toolResult
  if (stored.role === 'tool') {
    const toolResult: ToolResultMessage = {
      role: 'toolResult',
      toolCallId: stored.tool_call_id || generateId(),
      toolName: 'unknown', // Original tool name not stored in basic format
      content: [{ type: 'text', text: stored.content }],
      isError: false,
      timestamp: stored.createdAt?.getTime() || Date.now()
    };
    return toolResult;
  }

  // Map user messages
  if (stored.role === 'user') {
    const userMsg: UserMessage = {
      role: 'user',
      content: stored.content,
      timestamp: stored.createdAt?.getTime() || Date.now()
    };
    return userMsg;
  }

  // Map assistant messages
  if (stored.role === 'assistant') {
    // Build content array
    const content: AssistantMessage['content'] = [];

    if (stored.content) {
      content.push({ type: 'text', text: stored.content });
    }

    // Convert tool_calls to pi-ai format
    if (stored.tool_calls && stored.tool_calls.length > 0) {
      for (const tc of stored.tool_calls) {
        content.push({
          type: 'toolCall',
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments || '{}')
        });
      }
    }

    // AssistantMessage requires many fields - create partial for conversion
    // These will be populated by the LLM response, but for storage conversion
    // we create a minimal representation
    const assistantMsg: AssistantMessage = {
      role: 'assistant',
      content,
      api: 'openai-completions', // Default, will be overwritten
      provider: 'openai', // Default, will be overwritten
      model: 'unknown', // Default, will be overwritten
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: 'stop',
      timestamp: stored.createdAt?.getTime() || Date.now()
    };

    return assistantMsg;
  }

  logger.warn('Unknown message role, skipping', { role: stored.role });
  return null;
}

/**
 * Convert pi-agent-core messages to agent-world storage format
 *
 * Handles:
 * - role: 'toolResult' → role: 'tool'
 * - toolCallId → tool_call_id
 */
export function toStoredMessage(
  piMsg: PiAgentMessage,
  sender: string,
  chatId: string | null
): AgentMessage | null {
  if (!('role' in piMsg)) {
    return null;
  }

  const role = piMsg.role as string;
  const timestamp = 'timestamp' in piMsg ? piMsg.timestamp : Date.now();

  if (role === 'user') {
    const userMsg = piMsg as UserMessage;
    return {
      role: 'user',
      content: typeof userMsg.content === 'string'
        ? userMsg.content
        : userMsg.content.filter(c => c.type === 'text').map(c => (c as any).text).join(''),
      sender,
      chatId,
      createdAt: new Date(timestamp),
      messageId: generateId()
    };
  }

  if (role === 'assistant') {
    const assistantMsg = piMsg as AssistantMessage;
    const textContent = assistantMsg.content
      .filter(c => c.type === 'text')
      .map(c => (c as any).text)
      .join('');
    const toolCalls = assistantMsg.content
      .filter(c => c.type === 'toolCall')
      .map(c => {
        const tc = c as any;
        return {
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments)
          }
        };
      });

    return {
      role: 'assistant',
      content: textContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      sender,
      chatId,
      createdAt: new Date(timestamp),
      messageId: generateId()
    };
  }

  if (role === 'toolResult') {
    const toolResult = piMsg as ToolResultMessage;
    // Extract text content from the content array
    const textContent = toolResult.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('\n');

    return {
      role: 'tool',
      content: textContent || JSON.stringify(toolResult.content),
      tool_call_id: toolResult.toolCallId,
      sender,
      chatId,
      createdAt: new Date(timestamp),
      messageId: generateId()
    };
  }

  return null;
}

/**
 * Convert array of stored messages to pi-agent-core format
 */
export function toAgentMessages(stored: AgentMessage[]): PiAgentMessage[] {
  return stored
    .map(toAgentMessage)
    .filter((m): m is PiAgentMessage => m !== null);
}

/**
 * Extract system prompt from stored messages
 */
export function extractSystemPrompt(stored: AgentMessage[]): string {
  const systemMsg = stored.find(m => m.role === 'system');
  return systemMsg?.content || '';
}

// ============================================================================
// Event Bridging
// ============================================================================

/**
 * Bridge pi-agent-core events to World.eventEmitter
 *
 * Maps:
 * - message_start → sse { type: 'start' }
 * - message_update → sse { type: 'chunk' }
 * - message_end → sse { type: 'end' }
 * - tool_execution_start → world { type: 'tool-start' }
 * - tool_execution_end → world { type: 'tool-result' }
 */
export function bridgeEventToWorld(
  world: World,
  event: AgentEvent,
  agentId: string,
  messageId: string
): void {
  switch (event.type) {
    case 'message_start':
      world.eventEmitter.emit('sse', {
        agentName: agentId,
        type: 'start',
        messageId
      });
      break;

    case 'message_update':
      // Extract text delta from the event
      const delta = extractTextDelta(event);
      if (delta) {
        world.eventEmitter.emit('sse', {
          agentName: agentId,
          type: 'chunk',
          content: delta,
          messageId
        });
      }
      break;

    case 'message_end':
      world.eventEmitter.emit('sse', {
        agentName: agentId,
        type: 'end',
        messageId
      });
      break;

    case 'tool_execution_start':
      world.eventEmitter.emit('world', {
        agentName: agentId,
        type: 'tool-start',
        messageId,
        toolExecution: {
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          input: event.args
        }
      });
      break;

    case 'tool_execution_update':
      world.eventEmitter.emit('world', {
        agentName: agentId,
        type: 'tool-progress',
        messageId,
        toolExecution: {
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          result: event.partialResult
        }
      });
      break;

    case 'tool_execution_end':
      world.eventEmitter.emit('world', {
        agentName: agentId,
        type: event.isError ? 'tool-error' : 'tool-result',
        messageId,
        toolExecution: {
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          result: event.result,
          error: event.isError ? String(event.result) : undefined
        }
      });
      break;

    case 'turn_end':
      logger.debug('Turn ended', { agentId, messageId });
      break;

    case 'agent_end':
      logger.debug('Agent run completed', {
        agentId,
        messageCount: event.messages.length
      });
      break;

    default:
      // Ignore agent_start, turn_start
      break;
  }
}

/**
 * Extract text delta from message_update event
 */
function extractTextDelta(event: AgentEvent & { type: 'message_update' }): string | null {
  const assistantEvent = event.assistantMessageEvent;

  if (assistantEvent.type === 'text_delta') {
    return assistantEvent.delta;
  }

  return null;
}

/**
 * Subscribe to pi-agent events and bridge them to World
 */
export function subscribePiAgentToWorld(
  piAgent: PiAgent,
  world: World,
  agentId: string,
  messageId: string
): () => void {
  const unsubscribe = piAgent.subscribe((event) => {
    // DEBUG LOG
    try {
      fs.appendFileSync('data/debug_trace.log', `[${new Date().toISOString()}] ADAPTER EVENT: ${event.type} Agent:${agentId}\n`);
    } catch (e) {}

    bridgeEventToWorld(world, event, agentId, messageId);
  });

  return unsubscribe;
}

// ============================================================================
// Agent Execution
// ============================================================================

/**
 * Run a prompt through the pi-agent and return when complete
 */
export async function runAgentPrompt(
  world: World,
  agent: Agent,
  userMessage: string,
  tools?: AgentTool[]
): Promise<PiAgentMessage[]> {
  const piAgent = await getPiAgentForAgent(world, agent, tools);
  const messageId = generateId();

  // Load existing messages from agent memory
  const existingMessages = toAgentMessages(agent.memory);
  piAgent.replaceMessages(existingMessages);

  // Set up event bridging
  const unsubscribe = subscribePiAgentToWorld(piAgent, world, agent.id, messageId);

  try {
    // Run the prompt
    await piAgent.prompt(userMessage);

    // Return the final messages
    return piAgent.state.messages;
  } finally {
    unsubscribe();
  }
}

/**
 * Abort a running agent
 */
export function abortAgent(worldId: string, agentId: string): void {
  const cacheKey = getCacheKey(worldId, agentId);
  const cached = agentCache.get(cacheKey);

  if (cached) {
    cached.agent.abort();
    logger.debug('Aborted agent', { worldId, agentId });
  }
}
