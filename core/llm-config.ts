/**
 * Core LLM Configuration Re-export
 *
 * Purpose:
 * - Preserve the existing `core/llm-config` import surface while delegating provider
 *   configuration ownership to the publishable `@agent-world/llm` workspace.
 *
 * Key features:
 * - Re-exports provider configuration types and helpers from the package.
 * - Keeps existing `core` callers stable during the workspace migration.
 * - Establishes the first real `core` dependency on the new package.
 *
 * Implementation notes:
 * - This compatibility layer is intentionally thin.
 * - The package remains the source of truth for provider config state and validation.
 * - Additional `core` LLM/MCP/skill modules can migrate onto the package surface incrementally.
 *
 * Recent changes:
 * - 2026-03-27: Switched `core/llm-config` to re-export from `@agent-world/llm`.
 */

export {
  configureLLMProvider,
  getLLMProviderConfig,
  validateProviderConfig,
  isProviderConfigured,
  getConfiguredProviders,
  clearAllConfiguration,
  getConfigurationStatus,
  type BaseLLMConfig,
  type OpenAIConfig,
  type AnthropicConfig,
  type GoogleConfig,
  type AzureConfig,
  type XAIConfig,
  type OpenAICompatibleConfig,
  type OllamaConfig,
  type ProviderConfigMap,
  type ProviderConfig,
  type LLMProviderName,
} from '@agent-world/llm';
