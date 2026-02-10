/**
 * Pi-Agent Configuration
 * 
 * Feature flags and configuration for pi-ai LLM integration.
 * Allows gradual rollout and easy rollback.
 * 
 * Environment Variables:
 * - USE_PI_AGENT: Enable pi-ai integration (default: false)
 * - PI_AGENT_PROVIDERS: Comma-separated list of providers to use pi-ai for
 * 
 * Usage:
 * ```bash
 * export USE_PI_AGENT=true
 * export PI_AGENT_PROVIDERS=openai,anthropic,google
 * ```
 */

/**
 * Feature flag to enable pi-ai execution
 * Set environment variable: USE_PI_AGENT=true
 */
export const USE_PI_AGENT = process.env.USE_PI_AGENT === 'true';

/**
 * Providers to use pi-ai for (when feature flag is enabled)
 * Default: openai
 */
export const PI_AGENT_PROVIDERS = new Set(
  (process.env.PI_AGENT_PROVIDERS || 'openai').split(',').map(p => p.trim())
);

/**
 * Check if agent should use pi-ai execution
 */
export function shouldUsePiAgent(agent: { provider: string }): boolean {
  return USE_PI_AGENT && PI_AGENT_PROVIDERS.has(agent.provider);
}
