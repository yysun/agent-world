/**
 * Core Module Exports - Public API for both Node.js and Browser
 * 
 * Exports:
 * - World management functions (Node.js: full implementation, Browser: no-op warnings)
 * - Agent management functions (Node.js: full implementation, Browser: no-op warnings)
 * - Message management functions for high-level broadcasting
 * - Type definitions and LLM provider enumeration (both environments)
 * - Utility functions (both environments)
 * - Subscription layer for world lifecycle management
 * - Package version metadata
 * 
 * Architecture: Unified manager module with conditional compilation.
 * Browser gets types and structure, Node.js gets full storage functionality.
 */

// Unified management functions - conditionally compiled
export {
  // World management
  createWorld,
  getWorld,
  getFullWorld,
  updateWorld,
  deleteWorld,
  listWorlds,
  getWorldConfig,

  // Agent management
  createAgent,
  getAgent,
  updateAgent,
  deleteAgent,
  listAgents,
  updateAgentMemory,
  clearAgentMemory,
  loadAgentsIntoWorld,
  syncWorldAgents,
  createAgentsBatch,
  registerAgentRuntime,
  getAgentConfig,

  // Message management
  broadcastMessage,
  sendDirectMessage,
  getWorldMessages
} from './managers';

// Event functions for direct access
export {
  publishMessage,
  subscribeToMessages,
  subscribeToSSE,
  publishSSE,
  subscribeAgentToMessages,
  processAgentMessage,
  shouldAgentRespond
} from './events';

// Types and enums (safe for both Node.js and browser)
export type {
  World,
  CreateWorldParams,
  UpdateWorldParams,
  Agent,
  AgentMessage,
  CreateAgentParams,
  UpdateAgentParams,
  AgentInfo
} from './types';

// Manager types
export type { WorldInfo } from './managers';

export { LLMProvider } from './types';

// Logging (safe for both Node.js and browser)
export { logger } from './logger';

// Utility functions (safe for both Node.js and browser)
export { generateId, toKebabCase } from './utils';

export * from './subscription.js';

// Storage access (for advanced use cases)  
export type { WorldData } from './world-storage';

// Package metadata
export const VERSION = '3.0.0';
