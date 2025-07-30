/**
 * Core Module - Unified Public API
 * 
 * Features:
 * - Cross-platform world/agent/message management (Node.js: full, Browser: types only)
 * - Event-driven messaging with subscription support
 * - Category-based logging system
 * - Utility functions and type definitions
 * 
 * Architecture: Conditional compilation for environment-specific functionality.
 * Version: 3.0.0
 */

// Management functions
export {
  // World operations
  createWorld,
  getWorld,
  updateWorld,
  deleteWorld,
  listWorlds,
  getWorldConfig,
  exportWorldToMarkdown,
  // Agent operations
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
  // Message operations
  // Note: Message operations moved to events.js (publishMessage, etc.)
} from './managers.js';

// Event system
export {
  publishMessage,
  subscribeToMessages,
  subscribeToSSE,
  publishSSE,
  subscribeAgentToMessages,
  processAgentMessage,
  shouldAgentRespond
} from './events.js';

// Core types and utilities - Enhanced with TypeScript Utility Types
export type {
  // Base interfaces
  World,
  Agent,
  AgentMessage,
  // Enhanced parameter types
  CreateAgentParams,
  UpdateAgentParams,
  CreateWorldParams,
  UpdateWorldParams,
  // Derived types using utility types
  AgentInfo,
  AgentData,
  AgentStorage,
  // Enhanced event types
  EventPayloadMap,
  TypedEvent,
  WorldEventPayload
} from './types.js';
export type { WorldInfo } from './managers.js';
export type { WorldData } from './world-storage.js';
export type { LoggerConfig, LogLevel } from './logger.js';

export { LLMProvider } from './types.js';

// Logging and utilities
export { logger, createCategoryLogger, getCategoryLogLevel, initializeLogger } from './logger.js';
export { generateId, toKebabCase } from './utils.js';

// Streaming control
export { enableStreaming, disableStreaming } from './events.js';

// Subscription system
export * from './subscription.js';

export const VERSION = '3.0.0';
