/**
 * LLM Package Runtime Factory
 *
 * Purpose:
 * - Expose the main `createLLMRuntime(...)` entrypoint for `@agent-world/llm`.
 *
 * Key features:
 * - Aggregates provider configuration, MCP registry, skill registry, and tool registry.
 * - Provides one coherent runtime surface for package consumers.
 * - Keeps host inputs typed and split between constructor config and per-call context.
 *
 * Implementation notes:
 * - This is the first extraction slice; provider invocation will continue to expand behind this facade.
 * - The runtime currently focuses on registry/config surfaces and package-owned state.
 * - `core` can consume this facade incrementally without importing package internals.
 *
 * Recent changes:
 * - 2026-03-27: Initial `createLLMRuntime(...)` facade for `packages/llm`.
 * - 2026-03-27: Switched provider configuration to runtime-owned stores with public constructor types.
 * - 2026-03-27: Added package-owned built-in tool resolution with constructor-time defaults and optional narrowing.
 * - 2026-03-27: Added async MCP-backed tool resolution and runtime shutdown support.
 */

import {
  assertNoBuiltInToolNameCollisions,
  createBuiltInToolDefinitions,
  intersectBuiltInToolSelections,
} from './builtins.js';
import {
  createAnthropicClient,
  generateAnthropicResponse,
  streamAnthropicResponse,
} from './anthropic-direct.js';
import {
  generateGoogleResponse,
  streamGoogleResponse,
  createGoogleClient,
} from './google-direct.js';
import { createProviderConfigStore } from './llm-config.js';
import { createMCPRegistry } from './mcp.js';
import {
  createClientForProvider,
  generateOpenAIResponse,
  streamOpenAIResponse,
} from './openai-direct.js';
import { createSkillRegistry } from './skills.js';
import { createToolRegistry } from './tools.js';
import type {
  LLMToolDefinition,
  LLMToolRegistry,
  LLMRuntime,
  LLMRuntimeGenerateOptions,
  LLMRuntimeOptions,
  LLMRuntimeStreamOptions,
  LLMToolExecutionContext,
  ReasoningEffort,
  ToolPermission,
} from './types.js';

const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'default';
const DEFAULT_TOOL_PERMISSION: ToolPermission = 'auto';

export function createLLMRuntime(options: LLMRuntimeOptions = {}): LLMRuntime {
  const defaults = Object.freeze({
    reasoningEffort: options.defaults?.reasoningEffort ?? DEFAULT_REASONING_EFFORT,
    toolPermission: options.defaults?.toolPermission ?? DEFAULT_TOOL_PERMISSION,
  });

  const providerConfigStore = createProviderConfigStore(options.providers);
  const mcpRegistry = createMCPRegistry(options.mcp?.config ?? null);
  const skillRegistry = createSkillRegistry(options.skills);
  const builtInToolSelection = options.tools?.builtIns;
  const extraTools = options.tools?.extraTools ?? [];
  assertNoBuiltInToolNameCollisions(extraTools);
  const builtInTools = createBuiltInToolDefinitions({
    builtIns: builtInToolSelection,
    skillRegistry,
  });
  const baseToolRegistry = createToolRegistry([
    ...Object.values(builtInTools),
    ...extraTools,
  ]);
  const toolRegistry: LLMToolRegistry = {
    registerTool: (tool: LLMToolDefinition) => {
      assertNoBuiltInToolNameCollisions([tool]);
      baseToolRegistry.registerTool(tool);
    },
    registerTools: (tools: LLMToolDefinition[]) => {
      assertNoBuiltInToolNameCollisions(tools);
      baseToolRegistry.registerTools(tools);
    },
    getTool: baseToolRegistry.getTool,
    listTools: baseToolRegistry.listTools,
    resolveTools: (resolveExtraTools: LLMToolDefinition[] = []) => {
      assertNoBuiltInToolNameCollisions(resolveExtraTools);
      return baseToolRegistry.resolveTools(resolveExtraTools);
    },
  };

  function resolveRuntimeTools(request: LLMRuntimeGenerateOptions | LLMRuntimeStreamOptions): Record<string, LLMToolDefinition> {
    const resolveExtraTools = request.resolveTools?.extraTools ?? [];
    assertNoBuiltInToolNameCollisions(resolveExtraTools);
    const resolvedBuiltIns = createBuiltInToolDefinitions({
      builtIns: intersectBuiltInToolSelections(builtInToolSelection, request.resolveTools?.enabledBuiltIns),
      skillRegistry,
    });

    const resolved = createToolRegistry([
      ...Object.values(resolvedBuiltIns),
      ...extraTools,
    ]).resolveTools(resolveExtraTools);

    if (request.tools) {
      const requestToolValues = Object.values(request.tools);
      assertNoBuiltInToolNameCollisions(requestToolValues);
      return {
        ...resolved,
        ...request.tools,
      };
    }

    return resolved;
  }

  async function resolveRuntimeToolsAsync(request: LLMRuntimeGenerateOptions | LLMRuntimeStreamOptions): Promise<Record<string, LLMToolDefinition>> {
    const resolved = resolveRuntimeTools(request);
    const mcpTools = await mcpRegistry.resolveTools();
    const merged = {
      ...resolved,
      ...mcpTools,
    };

    return Object.fromEntries(
      Object.entries(merged).sort(([left], [right]) => left.localeCompare(right)),
    );
  }

  function resolveReasoningEffort(context?: LLMToolExecutionContext): ReasoningEffort {
    return context?.reasoningEffort ?? defaults.reasoningEffort;
  }

  return {
    getDefaults: () => defaults,
    configureProvider: providerConfigStore.configureProvider,
    getProviderConfig: providerConfigStore.getProviderConfig,
    isProviderConfigured: providerConfigStore.isProviderConfigured,
    getConfiguredProviders: providerConfigStore.getConfiguredProviders,
    getConfigurationStatus: providerConfigStore.getConfigurationStatus,
    clearProviderConfiguration: providerConfigStore.clearProviderConfiguration,
    getBuiltInTools: () => ({ ...builtInTools }),
    getMCPRegistry: () => mcpRegistry,
    getSkillRegistry: () => skillRegistry,
    getToolRegistry: () => toolRegistry,
    resolveTools: (resolveOptions = {}) => {
      const resolveExtraTools = resolveOptions.extraTools ?? [];
      assertNoBuiltInToolNameCollisions(resolveExtraTools);
      const resolvedBuiltIns = createBuiltInToolDefinitions({
        builtIns: intersectBuiltInToolSelections(builtInToolSelection, resolveOptions.enabledBuiltIns),
        skillRegistry,
      });

      return createToolRegistry([
        ...Object.values(resolvedBuiltIns),
        ...extraTools,
      ]).resolveTools(resolveExtraTools);
    },
    resolveToolsAsync: async (resolveOptions = {}) => {
      const resolveExtraTools = resolveOptions.extraTools ?? [];
      assertNoBuiltInToolNameCollisions(resolveExtraTools);
      const localTools = createToolRegistry(
        Object.values(
          createBuiltInToolDefinitions({
            builtIns: intersectBuiltInToolSelections(builtInToolSelection, resolveOptions.enabledBuiltIns),
            skillRegistry,
          }),
        ).concat(extraTools),
      ).resolveTools(resolveExtraTools);

      const mcpTools = await mcpRegistry.resolveTools();
      return Object.fromEntries(
        Object.entries({
          ...localTools,
          ...mcpTools,
        }).sort(([left], [right]) => left.localeCompare(right)),
      );
    },
    generate: async (request) => {
      const resolvedTools = await resolveRuntimeToolsAsync(request);
      const reasoningEffort = resolveReasoningEffort(request.context);

      switch (request.provider) {
        case 'openai':
        case 'azure':
        case 'openai-compatible':
        case 'xai':
        case 'ollama':
          return await generateOpenAIResponse({
            client: createClientForProvider(request.provider, providerConfigStore.getProviderConfig(request.provider as any) as any),
            provider: request.provider,
            model: request.model,
            messages: request.messages,
            tools: resolvedTools,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
            reasoningEffort,
            abortSignal: request.context?.abortSignal,
          });
        case 'anthropic':
          return await generateAnthropicResponse({
            client: createAnthropicClient(providerConfigStore.getProviderConfig('anthropic')),
            model: request.model,
            messages: request.messages,
            tools: resolvedTools,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
            abortSignal: request.context?.abortSignal,
          });
        case 'google':
          return await generateGoogleResponse({
            client: createGoogleClient(providerConfigStore.getProviderConfig('google')),
            model: request.model,
            messages: request.messages,
            tools: resolvedTools,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
            reasoningEffort,
            abortSignal: request.context?.abortSignal,
          });
        default:
          throw new Error(`Unsupported provider: ${request.provider}`);
      }
    },
    stream: async (request) => {
      const resolvedTools = await resolveRuntimeToolsAsync(request);
      const reasoningEffort = resolveReasoningEffort(request.context);
      const onChunk = request.onChunk ?? (() => undefined);

      switch (request.provider) {
        case 'openai':
        case 'azure':
        case 'openai-compatible':
        case 'xai':
        case 'ollama':
          return await streamOpenAIResponse({
            client: createClientForProvider(request.provider, providerConfigStore.getProviderConfig(request.provider as any) as any),
            provider: request.provider,
            model: request.model,
            messages: request.messages,
            tools: resolvedTools,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
            reasoningEffort,
            abortSignal: request.context?.abortSignal,
            onChunk,
          });
        case 'anthropic':
          return await streamAnthropicResponse({
            client: createAnthropicClient(providerConfigStore.getProviderConfig('anthropic')),
            model: request.model,
            messages: request.messages,
            tools: resolvedTools,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
            abortSignal: request.context?.abortSignal,
            onChunk,
          });
        case 'google':
          return await streamGoogleResponse({
            client: createGoogleClient(providerConfigStore.getProviderConfig('google')),
            model: request.model,
            messages: request.messages,
            tools: resolvedTools,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
            reasoningEffort,
            abortSignal: request.context?.abortSignal,
            onChunk,
          });
        default:
          throw new Error(`Unsupported provider: ${request.provider}`);
      }
    },
    shutdown: async () => {
      await mcpRegistry.shutdown();
    },
  };
}
