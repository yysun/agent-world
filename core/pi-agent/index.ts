/**
 * Pi-Agent Integration Module
 * 
 * Provides pi-ai based LLM calling as an alternative to direct provider SDKs.
 * 
 * Features:
 * - Feature flag controlled integration
 * - Per-provider enablement
 * - Unified LLM API
 * - Event streaming adaptation
 * - Tool handling
 * 
 * Usage:
 * ```typescript
 * import { shouldUsePiAgent, piAgentIntegration } from './pi-agent';
 * 
 * if (shouldUsePiAgent(agent)) {
 *   const result = await piAgentIntegration.streamAgentResponse(...);
 * } else {
 *   // Use existing provider code
 * }
 * ```
 */

export { PiAgentIntegration, piAgentIntegration } from './integration.js';
export { USE_PI_AGENT, PI_AGENT_PROVIDERS, shouldUsePiAgent } from './config.js';
export * from './types.js';
export * from './tool-adapter.js';
export * from './provider-config.js';
export * from './event-adapter.js';
