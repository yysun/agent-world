/**
 * Provider Configuration Adapter for Pi-AI Integration
 * 
 * Converts Agent-World provider configuration to pi-ai options.
 * 
 * pi-ai uses a unified configuration approach:
 * - API keys can be provided via `apiKey` option or environment variables
 * - Custom headers for special cases (Azure, custom endpoints)
 * - Base URLs for compatible providers
 * 
 * Agent-World stores config in llm-config module.
 */

import { getLLMProviderConfig } from '../llm-config.js';
import type { Agent } from '../types.js';
import type { SimpleStreamOptions } from '@mariozechner/pi-ai';

/**
 * Get pi-ai stream options from Agent-World agent configuration
 */
export function getPiAiOptions(agent: Agent): SimpleStreamOptions {
  const config = getLLMProviderConfig(agent.provider);
  
  const options: SimpleStreamOptions = {
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
  };

  // Add API key if available
  // pi-ai will fall back to environment variables if not provided
  if ('apiKey' in config && config.apiKey) {
    options.apiKey = config.apiKey;
  }

  // Provider-specific configuration
  switch (agent.provider) {
    case 'azure': {
      // Azure requires custom headers and base URL
      const azureConfig = config as any;
      if (azureConfig.resourceName && azureConfig.deployment) {
        // pi-ai azure-openai-responses provider expects:
        // - apiKey in options
        // - Resource name and deployment in model identifier
        // - API version in headers
        const apiVersion = azureConfig.apiVersion || '2024-10-21-preview';
        options.headers = {
          'api-version': apiVersion,
        };
      }
      break;
    }

    case 'openai-compatible':
    case 'ollama': {
      // Custom base URL for OpenAI-compatible providers
      const customConfig = config as any;
      if (customConfig.baseUrl) {
        // Note: pi-ai doesn't have a baseURL option in SimpleStreamOptions
        // We'll need to use a custom model with baseURL
        // This requires registering a custom API - see pi-ai docs
        // For now, skip and rely on environment setup
      }
      break;
    }
  }

  return options;
}

/**
 * Get API key callback for dynamic provider configuration
 * 
 * This allows pi-ai to fetch API keys dynamically per request.
 * Useful for providers with rotating tokens or multi-tenant setups.
 */
export function createApiKeyGetter(agent: Agent) {
  return async (provider: string): Promise<string | undefined> => {
    try {
      const config = getLLMProviderConfig(agent.provider);
      if ('apiKey' in config) {
        return config.apiKey;
      }
    } catch (error) {
      // Fall back to environment variables
    }
    return undefined;
  };
}
