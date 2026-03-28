/**
 * LLM Package Runtime API
 *
 * Purpose:
 * - Expose the public `generate(...)` and `stream(...)` APIs for `@agent-world/llm`.
 *
 * Key features:
 * - Supports per-call provider/model/MCP/skill/tool configuration.
 * - Keeps internal caches for provider stores, MCP registries, and skill registries.
 * - Retains `createLLMRuntime(...)` as a compatibility wrapper over the per-call engine.
 *
 * Implementation notes:
 * - The recommended public API is per-call and does not require runtime construction.
 * - Internal caches are keyed by normalized config so equivalent calls reuse package state safely.
 * - The compatibility runtime delegates into the same shared execution path used by `generate(...)` and `stream(...)`.
 *
 * Recent changes:
 * - 2026-03-28: Switched the package to a per-call-first API with internal caching.
 */

import * as path from 'path';
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
import { createMCPRegistry, normalizeMCPConfig } from './mcp.js';
import {
  createClientForProvider,
  generateOpenAIResponse,
  streamOpenAIResponse,
} from './openai-direct.js';
import { createSkillRegistry } from './skills.js';
import { createToolRegistry } from './tools.js';
import type {
  BuiltInToolSelection,
  LLMGenerateOptions,
  LLMProviderConfigStore,
  LLMProviderConfigs,
  LLMResponse,
  LLMResolveToolsOptions,
  LLMRuntime,
  LLMRuntimeGenerateOptions,
  LLMRuntimeOptions,
  LLMRuntimeResolveToolsOptions,
  LLMRuntimeStreamOptions,
  LLMStreamChunk,
  LLMStreamOptions,
  LLMToolDefinition,
  LLMToolExecutionContext,
  LLMToolRegistry,
  MCPConfig,
  MCPRegistry,
  ReasoningEffort,
  SkillRegistry,
  ToolPermission,
} from './types.js';

const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'default';
const DEFAULT_TOOL_PERMISSION: ToolPermission = 'auto';

type RuntimeDefaults = Readonly<{
  reasoningEffort: ReasoningEffort;
  toolPermission: ToolPermission;
}>;

type RuntimeExecutionConfig = {
  defaults: RuntimeDefaults;
  providerConfigStore: LLMProviderConfigStore;
  mcpRegistry: MCPRegistry;
  skillRegistry: SkillRegistry;
  builtInToolSelection?: BuiltInToolSelection;
  extraTools: LLMToolDefinition[];
};

const providerConfigStoreCache = new Map<string, LLMProviderConfigStore>();
const mcpRegistryCache = new Map<string, MCPRegistry>();
const skillRegistryCache = new Map<string, SkillRegistry>();

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

function normalizeSkillRoots(roots?: string[]): string[] {
  return [...new Set((roots ?? []).map((root) => path.resolve(String(root || '').trim())).filter(Boolean))];
}

function createDefaults(overrides?: LLMRuntimeOptions['defaults']): RuntimeDefaults {
  return Object.freeze({
    reasoningEffort: overrides?.reasoningEffort ?? DEFAULT_REASONING_EFFORT,
    toolPermission: overrides?.toolPermission ?? DEFAULT_TOOL_PERMISSION,
  });
}

function mergeProviderConfigs(options: {
  provider: LLMGenerateOptions['provider'] | LLMStreamOptions['provider'];
  providerConfig?: LLMGenerateOptions['providerConfig'] | LLMStreamOptions['providerConfig'];
  providers?: LLMProviderConfigs;
}): LLMProviderConfigs {
  const merged: LLMProviderConfigs = {
    ...(options.providers ?? {}),
  };

  if (options.providerConfig) {
    merged[options.provider] = options.providerConfig as any;
  }

  return merged;
}

function getOrCreateProviderConfigStore(configs: LLMProviderConfigs): LLMProviderConfigStore {
  const cacheKey = stableStringify(configs);
  const cached = providerConfigStoreCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const store = createProviderConfigStore(configs);
  providerConfigStoreCache.set(cacheKey, store);
  return store;
}

function getOrCreateMCPRegistry(config: MCPConfig | null | undefined): MCPRegistry {
  const normalizedConfig = normalizeMCPConfig(config ?? null);
  const cacheKey = stableStringify(normalizedConfig);
  const cached = mcpRegistryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const registry = createMCPRegistry(normalizedConfig);
  mcpRegistryCache.set(cacheKey, registry);
  return registry;
}

function getOrCreateSkillRegistry(roots?: string[]): SkillRegistry {
  const normalizedRoots = normalizeSkillRoots(roots);
  const cacheKey = stableStringify(normalizedRoots);
  const cached = skillRegistryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const registry = createSkillRegistry({
    roots: normalizedRoots,
  });
  skillRegistryCache.set(cacheKey, registry);
  return registry;
}

function buildToolRegistry(extraTools: LLMToolDefinition[]): LLMToolRegistry {
  const baseToolRegistry = createToolRegistry(extraTools);

  return {
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
}

function resolveReasoningEffort(defaults: RuntimeDefaults, context?: LLMToolExecutionContext): ReasoningEffort {
  return context?.reasoningEffort ?? defaults.reasoningEffort;
}

function createExecutionApi(config: RuntimeExecutionConfig) {
  assertNoBuiltInToolNameCollisions(config.extraTools);
  const builtInTools = createBuiltInToolDefinitions({
    builtIns: config.builtInToolSelection,
    skillRegistry: config.skillRegistry,
  });
  const toolRegistry = buildToolRegistry([
    ...Object.values(builtInTools),
    ...config.extraTools,
  ]);

  function resolveRuntimeTools(
    request: Pick<LLMRuntimeGenerateOptions, 'resolveTools' | 'tools'> | Pick<LLMRuntimeStreamOptions, 'resolveTools' | 'tools'>,
  ): Record<string, LLMToolDefinition> {
    const resolveExtraTools = request.resolveTools?.extraTools ?? [];
    assertNoBuiltInToolNameCollisions(resolveExtraTools);
    const resolvedBuiltIns = createBuiltInToolDefinitions({
      builtIns: intersectBuiltInToolSelections(config.builtInToolSelection, request.resolveTools?.enabledBuiltIns),
      skillRegistry: config.skillRegistry,
    });

    const resolved = createToolRegistry([
      ...Object.values(resolvedBuiltIns),
      ...config.extraTools,
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

  async function resolveRuntimeToolsAsync(
    request: Pick<LLMRuntimeGenerateOptions, 'resolveTools' | 'tools'> | Pick<LLMRuntimeStreamOptions, 'resolveTools' | 'tools'>,
  ): Promise<Record<string, LLMToolDefinition>> {
    const resolved = resolveRuntimeTools(request);
    const mcpTools = await config.mcpRegistry.resolveTools();
    const merged = {
      ...resolved,
      ...mcpTools,
    };

    return Object.fromEntries(
      Object.entries(merged).sort(([left], [right]) => left.localeCompare(right)),
    );
  }

  async function generateInternal(request: LLMRuntimeGenerateOptions): Promise<LLMResponse> {
    const resolvedTools = await resolveRuntimeToolsAsync(request);
    const reasoningEffort = resolveReasoningEffort(config.defaults, request.context);

    switch (request.provider) {
      case 'openai':
      case 'azure':
      case 'openai-compatible':
      case 'xai':
      case 'ollama':
        return await generateOpenAIResponse({
          client: createClientForProvider(
            request.provider,
            config.providerConfigStore.getProviderConfig(request.provider as any) as any,
          ),
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
          client: createAnthropicClient(config.providerConfigStore.getProviderConfig('anthropic')),
          model: request.model,
          messages: request.messages,
          tools: resolvedTools,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
          abortSignal: request.context?.abortSignal,
        });
      case 'google':
        return await generateGoogleResponse({
          client: createGoogleClient(config.providerConfigStore.getProviderConfig('google')),
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
  }

  async function streamInternal(request: LLMRuntimeStreamOptions): Promise<LLMResponse> {
    const resolvedTools = await resolveRuntimeToolsAsync(request);
    const reasoningEffort = resolveReasoningEffort(config.defaults, request.context);
    const onChunk = request.onChunk ?? (() => undefined);

    switch (request.provider) {
      case 'openai':
      case 'azure':
      case 'openai-compatible':
      case 'xai':
      case 'ollama':
        return await streamOpenAIResponse({
          client: createClientForProvider(
            request.provider,
            config.providerConfigStore.getProviderConfig(request.provider as any) as any,
          ),
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
          client: createAnthropicClient(config.providerConfigStore.getProviderConfig('anthropic')),
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
          client: createGoogleClient(config.providerConfigStore.getProviderConfig('google')),
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
  }

  return {
    builtInTools,
    toolRegistry,
    resolveTools: (resolveOptions: LLMRuntimeResolveToolsOptions = {}) => {
      const resolveExtraTools = resolveOptions.extraTools ?? [];
      assertNoBuiltInToolNameCollisions(resolveExtraTools);
      const resolvedBuiltIns = createBuiltInToolDefinitions({
        builtIns: intersectBuiltInToolSelections(config.builtInToolSelection, resolveOptions.enabledBuiltIns),
        skillRegistry: config.skillRegistry,
      });

      return createToolRegistry([
        ...Object.values(resolvedBuiltIns),
        ...config.extraTools,
      ]).resolveTools(resolveExtraTools);
    },
    resolveToolsAsync: async (resolveOptions: LLMRuntimeResolveToolsOptions = {}) => {
      const resolveExtraTools = resolveOptions.extraTools ?? [];
      assertNoBuiltInToolNameCollisions(resolveExtraTools);
      const localTools = createToolRegistry(
        Object.values(
          createBuiltInToolDefinitions({
            builtIns: intersectBuiltInToolSelections(config.builtInToolSelection, resolveOptions.enabledBuiltIns),
            skillRegistry: config.skillRegistry,
          }),
        ).concat(config.extraTools),
      ).resolveTools(resolveExtraTools);

      const mcpTools = await config.mcpRegistry.resolveTools();
      return Object.fromEntries(
        Object.entries({
          ...localTools,
          ...mcpTools,
        }).sort(([left], [right]) => left.localeCompare(right)),
      );
    },
    generateInternal,
    streamInternal,
  };
}

function buildPerCallExecutionConfig(
  request: LLMGenerateOptions | LLMStreamOptions,
): RuntimeExecutionConfig {
  return {
    defaults: createDefaults(),
    providerConfigStore: getOrCreateProviderConfigStore(
      mergeProviderConfigs({
        provider: request.provider,
        providerConfig: request.providerConfig,
        providers: request.providers,
      }),
    ),
    mcpRegistry: getOrCreateMCPRegistry(request.mcpConfig ?? null),
    skillRegistry: getOrCreateSkillRegistry(request.skillRoots),
    builtInToolSelection: request.builtIns,
    extraTools: request.extraTools ?? [],
  };
}

function buildPerCallToolExecutionConfig(
  options: LLMResolveToolsOptions = {},
): RuntimeExecutionConfig {
  return {
    defaults: createDefaults(),
    providerConfigStore: getOrCreateProviderConfigStore({}),
    mcpRegistry: getOrCreateMCPRegistry(options.mcpConfig ?? null),
    skillRegistry: getOrCreateSkillRegistry(options.skillRoots),
    builtInToolSelection: options.builtIns,
    extraTools: options.extraTools ?? [],
  };
}

function toRuntimeGenerateOptions(request: LLMGenerateOptions): LLMRuntimeGenerateOptions {
  return {
    provider: request.provider,
    model: request.model,
    messages: request.messages,
    temperature: request.temperature,
    maxTokens: request.maxTokens,
    tools: request.tools,
    context: request.context,
  };
}

function toRuntimeStreamOptions(request: LLMStreamOptions): LLMRuntimeStreamOptions {
  return {
    provider: request.provider,
    model: request.model,
    messages: request.messages,
    temperature: request.temperature,
    maxTokens: request.maxTokens,
    tools: request.tools,
    context: request.context,
    onChunk: request.onChunk,
  };
}

export async function generate(request: LLMGenerateOptions): Promise<LLMResponse> {
  const executionApi = createExecutionApi(buildPerCallExecutionConfig(request));
  return await executionApi.generateInternal(toRuntimeGenerateOptions(request));
}

export async function stream(request: LLMStreamOptions): Promise<LLMResponse> {
  const executionApi = createExecutionApi(buildPerCallExecutionConfig(request));
  return await executionApi.streamInternal(toRuntimeStreamOptions(request));
}

export function resolveTools(options: LLMResolveToolsOptions = {}): Record<string, LLMToolDefinition> {
  const executionApi = createExecutionApi(buildPerCallToolExecutionConfig(options));
  if (options.tools) {
    const requestToolValues = Object.values(options.tools);
    assertNoBuiltInToolNameCollisions(requestToolValues);
    return Object.fromEntries(
      Object.entries({
        ...executionApi.resolveTools(),
        ...options.tools,
      }).sort(([left], [right]) => left.localeCompare(right)),
    );
  }
  return executionApi.resolveTools();
}

export async function resolveToolsAsync(options: LLMResolveToolsOptions = {}): Promise<Record<string, LLMToolDefinition>> {
  const executionApi = createExecutionApi(buildPerCallToolExecutionConfig(options));
  if (options.tools) {
    const requestToolValues = Object.values(options.tools);
    assertNoBuiltInToolNameCollisions(requestToolValues);
    const resolved = await executionApi.resolveToolsAsync();
    return Object.fromEntries(
      Object.entries({
        ...resolved,
        ...options.tools,
      }).sort(([left], [right]) => left.localeCompare(right)),
    );
  }
  return await executionApi.resolveToolsAsync();
}

export function createLLMRuntime(options: LLMRuntimeOptions = {}): LLMRuntime {
  const defaults = createDefaults(options.defaults);
  const providerConfigStore = createProviderConfigStore(options.providers);
  const mcpRegistry = createMCPRegistry(options.mcp?.config ?? null);
  const skillRegistry = createSkillRegistry(options.skills);
  const builtInToolSelection = options.tools?.builtIns;
  const extraTools = options.tools?.extraTools ?? [];
  const executionApi = createExecutionApi({
    defaults,
    providerConfigStore,
    mcpRegistry,
    skillRegistry,
    builtInToolSelection,
    extraTools,
  });

  return {
    getDefaults: () => defaults,
    configureProvider: providerConfigStore.configureProvider,
    getProviderConfig: providerConfigStore.getProviderConfig,
    isProviderConfigured: providerConfigStore.isProviderConfigured,
    getConfiguredProviders: providerConfigStore.getConfiguredProviders,
    getConfigurationStatus: providerConfigStore.getConfigurationStatus,
    clearProviderConfiguration: providerConfigStore.clearProviderConfiguration,
    getBuiltInTools: () => ({ ...executionApi.builtInTools }),
    getMCPRegistry: () => mcpRegistry,
    getSkillRegistry: () => skillRegistry,
    getToolRegistry: () => executionApi.toolRegistry,
    resolveTools: executionApi.resolveTools,
    resolveToolsAsync: executionApi.resolveToolsAsync,
    generate: executionApi.generateInternal,
    stream: executionApi.streamInternal,
    shutdown: async () => {
      await mcpRegistry.shutdown();
    },
  };
}

export async function __resetLLMCallCachesForTests(): Promise<void> {
  await Promise.all(
    [...mcpRegistryCache.values()].map(async (registry) => {
      await registry.shutdown();
    }),
  );
  mcpRegistryCache.clear();
  skillRegistryCache.clear();
  providerConfigStoreCache.clear();
}
