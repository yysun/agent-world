/**
 * LLM Config Behavioral Tests
 *
 * Purpose:
 * - Validate runtime provider configuration and validation logic in core/llm-config.
 *
 * Key features:
 * - Default Ollama bootstrap configuration
 * - Provider-specific validation and storage
 * - Configuration lifecycle helpers (configured list/status/clear)
 *
 * Implementation notes:
 * - Uses only in-memory module state.
 * - Reloads module per test to isolate global configuration state.
 *
 * Recent changes:
 * - 2026-02-27: Added targeted production-path coverage for llm-config runtime behavior.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LLMProvider } from '../../core/types.js';

async function loadLLMConfigModule() {
  vi.resetModules();
  return import('../../core/llm-config.js');
}

describe('llm-config runtime behavior', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('initializes with default ollama provider configuration', async () => {
    const mod = await loadLLMConfigModule();

    expect(mod.isProviderConfigured(LLMProvider.OLLAMA)).toBe(true);
    expect(mod.getConfiguredProviders()).toContain(LLMProvider.OLLAMA);
    expect(mod.getLLMProviderConfig(LLMProvider.OLLAMA).baseUrl).toBe('http://localhost:11434/v1');
  });

  it('stores and retrieves openai provider configuration', async () => {
    const mod = await loadLLMConfigModule();
    mod.clearAllConfiguration();

    mod.configureLLMProvider(LLMProvider.OPENAI, { apiKey: 'sk-test' });

    expect(mod.isProviderConfigured(LLMProvider.OPENAI)).toBe(true);
    expect(mod.getLLMProviderConfig(LLMProvider.OPENAI)).toEqual({ apiKey: 'sk-test' });
  });

  it('validates required azure fields', async () => {
    const mod = await loadLLMConfigModule();
    mod.clearAllConfiguration();

    expect(() =>
      mod.configureLLMProvider(LLMProvider.AZURE, {
        apiKey: 'key',
        deployment: 'deploy',
      } as any)
    ).toThrow('Azure provider requires resourceName (string)');

    mod.configureLLMProvider(LLMProvider.AZURE, {
      apiKey: 'key',
      deployment: 'deploy',
      resourceName: 'resource',
    });
    expect(mod.getLLMProviderConfig(LLMProvider.AZURE)).toMatchObject({
      apiKey: 'key',
      deployment: 'deploy',
      resourceName: 'resource',
    });
  });

  it('throws descriptive error when provider is not configured', async () => {
    const mod = await loadLLMConfigModule();
    mod.clearAllConfiguration();

    expect(() => mod.getLLMProviderConfig(LLMProvider.OPENAI)).toThrow(
      'No configuration found for openai provider.'
    );
  });

  it('returns full provider status map and supports clear operation', async () => {
    const mod = await loadLLMConfigModule();
    mod.clearAllConfiguration();

    mod.configureLLMProvider(LLMProvider.GOOGLE, { apiKey: 'google-key' });
    mod.configureLLMProvider(LLMProvider.XAI, { apiKey: 'xai-key' });

    const status = mod.getConfigurationStatus();
    expect(status[LLMProvider.GOOGLE]).toBe(true);
    expect(status[LLMProvider.XAI]).toBe(true);
    expect(status[LLMProvider.OPENAI]).toBe(false);

    mod.clearAllConfiguration();
    expect(mod.getConfiguredProviders()).toEqual([]);
    expect(mod.isProviderConfigured(LLMProvider.GOOGLE)).toBe(false);
  });

  it('rejects unsupported provider values', async () => {
    const mod = await loadLLMConfigModule();

    expect(() =>
      mod.validateProviderConfig('unsupported-provider' as unknown as LLMProvider, {})
    ).toThrow('Unsupported provider: unsupported-provider');
  });
});
