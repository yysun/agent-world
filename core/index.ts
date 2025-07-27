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
  getFullWorld,
  updateWorld,
  deleteWorld,
  listWorlds,
  getWorldConfig,
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
} from './managers';

// Event system
export {
  publishMessage,
  subscribeToMessages,
  subscribeToSSE,
  publishSSE,
  subscribeAgentToMessages,
  processAgentMessage,
  shouldAgentRespond
} from './events';

// Core types and utilities - Enhanced with TypeScript Utility Types
export type {
  // Base interfaces
  World,
  Agent,
  AgentMessage,
  // Enhanced parameter types
  BaseAgentParams,
  CreateAgentParams,
  UpdateAgentParams,
  BaseWorldParams,
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
} from './types';
export type { WorldInfo } from './managers';
export type { WorldData } from './world-storage';
export type { LoggerConfig, LogLevel } from './logger';

export { LLMProvider } from './types';

// Logging and utilities
export { logger, createCategoryLogger, getCategoryLogLevel, initializeLogger } from './logger';
export { generateId, toKebabCase } from './utils';

// Streaming control
export {
  enableStreaming,
  disableStreaming,
} from './events';

// Subscription system
export * from './subscription.js';

export const VERSION = '3.0.0';
