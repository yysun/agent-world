/**
 * LLM Configuration Module - Browser-Safe Provider Configuration Management
 *
 * Features:
 * - Browser-safe configuration storage for all LLM providers
 * - Type-safe configuration interfaces for each provider
 * - Configuration injection and validation functions
 * - Clear error messages for missing configuration
 * - Zero Node.js dependencies for browser compatibility
 *
 * Provider Configuration Support:
 * - OpenAI: API key configuration
 * - Anthropic: API key configuration
 * - Google: API key configuration
 * - Azure: API key, endpoint, and deployment configuration
 * - XAI: API key configuration
 * - OpenAI-Compatible: API key and base URL configuration
 * - Ollama: Base URL configuration
 *
 * Usage:
 * - configureLLMProvider: Set configuration for a specific provider
 * - getLLMProviderConfig: Get configuration for a specific provider
 * - validateProviderConfig: Validate that required configuration is present
 * - clearAllConfiguration: Clear all provider configurations (for testing)
 *
 * Implementation Details:
 * - Global configuration store with provider-specific sections
 * - Type-safe interfaces prevent configuration errors
 * - Validation functions ensure required settings are present
 * - No external dependencies for maximum browser compatibility
 * - Clear error messages guide users to correct configuration issues
 *
 * Recent Changes:
 * - Initial implementation with all provider configuration interfaces
 * - Added configuration injection and validation functions
 * - Implemented browser-safe global configuration store
 * - Added comprehensive error handling and validation
 */

import { LLMProvider } from './types';

/**
 * Provider-specific configuration interfaces
 */
export interface OpenAIConfig {
  apiKey: string;
}

export interface AnthropicConfig {
  apiKey: string;
}

export interface GoogleConfig {
  apiKey: string;
}

export interface AzureConfig {
  apiKey: string;
  endpoint: string;
  deployment: string;
  apiVersion?: string;
}

export interface XAIConfig {
  apiKey: string;
}

export interface OpenAICompatibleConfig {
  apiKey: string;
  baseUrl: string;
}

export interface OllamaConfig {
  baseUrl: string;
}

/**
 * Union type for all provider configurations
 */
export type ProviderConfig =
  | OpenAIConfig
  | AnthropicConfig
  | GoogleConfig
  | AzureConfig
  | XAIConfig
  | OpenAICompatibleConfig
  | OllamaConfig;

/**
 * Global configuration store
 */
interface LLMProviderConfigs {
  [LLMProvider.OPENAI]?: OpenAIConfig;
  [LLMProvider.ANTHROPIC]?: AnthropicConfig;
  [LLMProvider.GOOGLE]?: GoogleConfig;
  [LLMProvider.AZURE]?: AzureConfig;
  [LLMProvider.XAI]?: XAIConfig;
  [LLMProvider.OPENAI_COMPATIBLE]?: OpenAICompatibleConfig;
  [LLMProvider.OLLAMA]?: OllamaConfig;
}

/**
 * Global configuration store instance
 */
let providerConfigs: LLMProviderConfigs = {};

/**
 * Configure a specific LLM provider with type-safe configuration
 */
export function configureLLMProvider<T extends LLMProvider>(
  provider: T,
  config: T extends LLMProvider.OPENAI ? OpenAIConfig :
    T extends LLMProvider.ANTHROPIC ? AnthropicConfig :
    T extends LLMProvider.GOOGLE ? GoogleConfig :
    T extends LLMProvider.AZURE ? AzureConfig :
    T extends LLMProvider.XAI ? XAIConfig :
    T extends LLMProvider.OPENAI_COMPATIBLE ? OpenAICompatibleConfig :
    T extends LLMProvider.OLLAMA ? OllamaConfig :
    never
): void {
  // Validate configuration before storing
  validateProviderConfig(provider, config as any);

  // Store configuration
  (providerConfigs as any)[provider] = config;
}

/**
 * Get configuration for a specific provider
 */
export function getLLMProviderConfig<T extends LLMProvider>(
  provider: T
): T extends LLMProvider.OPENAI ? OpenAIConfig :
  T extends LLMProvider.ANTHROPIC ? AnthropicConfig :
  T extends LLMProvider.GOOGLE ? GoogleConfig :
  T extends LLMProvider.AZURE ? AzureConfig :
  T extends LLMProvider.XAI ? XAIConfig :
  T extends LLMProvider.OPENAI_COMPATIBLE ? OpenAICompatibleConfig :
  T extends LLMProvider.OLLAMA ? OllamaConfig :
  never {

  const config = providerConfigs[provider];

  if (!config) {
    throw new Error(
      `No configuration found for ${provider} provider. ` +
      `Please ensure the provider is configured before making LLM calls. ` +
      `Configuration should be set via configureLLMProvider() function.`
    );
  }

  return config as any;
}

/**
 * Validate provider configuration
 */
export function validateProviderConfig(provider: LLMProvider, config: any): void {
  switch (provider) {
    case LLMProvider.OPENAI:
      if (!config.apiKey || typeof config.apiKey !== 'string') {
        throw new Error('OpenAI provider requires apiKey (string)');
      }
      break;

    case LLMProvider.ANTHROPIC:
      if (!config.apiKey || typeof config.apiKey !== 'string') {
        throw new Error('Anthropic provider requires apiKey (string)');
      }
      break;

    case LLMProvider.GOOGLE:
      if (!config.apiKey || typeof config.apiKey !== 'string') {
        throw new Error('Google provider requires apiKey (string)');
      }
      break;

    case LLMProvider.AZURE:
      if (!config.apiKey || typeof config.apiKey !== 'string') {
        throw new Error('Azure provider requires apiKey (string)');
      }
      if (!config.endpoint || typeof config.endpoint !== 'string') {
        throw new Error('Azure provider requires endpoint (string)');
      }
      if (!config.deployment || typeof config.deployment !== 'string') {
        throw new Error('Azure provider requires deployment (string)');
      }
      break;

    case LLMProvider.XAI:
      if (!config.apiKey || typeof config.apiKey !== 'string') {
        throw new Error('XAI provider requires apiKey (string)');
      }
      break;

    case LLMProvider.OPENAI_COMPATIBLE:
      if (!config.apiKey || typeof config.apiKey !== 'string') {
        throw new Error('OpenAI-Compatible provider requires apiKey (string)');
      }
      if (!config.baseUrl || typeof config.baseUrl !== 'string') {
        throw new Error('OpenAI-Compatible provider requires baseUrl (string)');
      }
      break;

    case LLMProvider.OLLAMA:
      if (!config.baseUrl || typeof config.baseUrl !== 'string') {
        throw new Error('Ollama provider requires baseUrl (string)');
      }
      break;

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Check if a provider is configured
 */
export function isProviderConfigured(provider: LLMProvider): boolean {
  return !!providerConfigs[provider];
}

/**
 * Get list of all configured providers
 */
export function getConfiguredProviders(): LLMProvider[] {
  return Object.keys(providerConfigs) as LLMProvider[];
}

/**
 * Clear all provider configurations (useful for testing)
 */
export function clearAllConfiguration(): void {
  providerConfigs = {};
}

/**
 * Get configuration status for debugging
 */
export function getConfigurationStatus(): Record<LLMProvider, boolean> {
  return {
    [LLMProvider.OPENAI]: isProviderConfigured(LLMProvider.OPENAI),
    [LLMProvider.ANTHROPIC]: isProviderConfigured(LLMProvider.ANTHROPIC),
    [LLMProvider.GOOGLE]: isProviderConfigured(LLMProvider.GOOGLE),
    [LLMProvider.AZURE]: isProviderConfigured(LLMProvider.AZURE),
    [LLMProvider.XAI]: isProviderConfigured(LLMProvider.XAI),
    [LLMProvider.OPENAI_COMPATIBLE]: isProviderConfigured(LLMProvider.OPENAI_COMPATIBLE),
    [LLMProvider.OLLAMA]: isProviderConfigured(LLMProvider.OLLAMA),
  };
}
