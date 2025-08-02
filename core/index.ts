/**
 * Core Module - Curated Public API
 * 
 * Features:
 * - Essential world/agent/chat management functions for client applications
 * - Event-driven messaging with clean subscription interface
 * - Category-based logging system
 * - Core types and utility functions
 * 
 * Architecture: 
 * - Public API limited to client-facing functionality (~25 exports vs previous 60+)
 * - Internal implementation details kept private
 * - Clear separation between public and private interfaces
 * - Tests can import from internal modules directly
 * 
 * Public API Categories:
 * - World Management: createWorld, getWorld, updateWorld, deleteWorld, listWorlds, getWorldConfig, exportWorldToMarkdown
 * - Agent Management: getAgent, updateAgent, deleteAgent, listAgents, clearAgentMemory
 * - Chat Management: createChatData, getChatData, restoreWorldChat
 * - Event System: publishMessage, enableStreaming, disableStreaming
 * - Core Types: World, Agent, AgentMessage, WorldChat, ChatData, WorldInfo, LLMProvider, LoggerConfig, LogLevel
 * - Utilities: logger, createCategoryLogger, generateId, toKebabCase
 * - Subscription System: subscribeWorld, ClientConnection (for server API)
 * 
 * Private APIs (not exported):
 * - Internal agent functions: createAgent (via world instance), updateAgentMemory, loadAgentsIntoWorld, syncWorldAgents, etc.
 * - Internal chat functions: createChat, getChat, createWorldChat
 * - Internal event functions: subscribeAgentToMessages, processAgentMessage, SSE functions
 * - Parameter types: CreateAgentParams, UpdateAgentParams, etc.
 * - Storage implementation: StorageManager, StorageAPI, storage factory functions
 * - Internal utilities: initializeLogger, getCategoryLogLevel
 * 
 * Version: 3.0.0
 */

// === WORLD MANAGEMENT ===
export {
  createWorld,
  getWorld,
  updateWorld,
  deleteWorld,
  listWorlds,
  getWorldConfig,
  exportWorldToMarkdown,
} from './managers.js';

// === AGENT MANAGEMENT ===
export {
  getAgent,
  updateAgent,
  deleteAgent,
  listAgents,
  // Memory management (only clearAgentMemory needed for public API)
  clearAgentMemory,
} from './managers.js';

// === CHAT MANAGEMENT ===
export {
  createChatData,
  getChatData,
  restoreWorldChat,
} from './managers.js';

// === EVENT SYSTEM ===
export {
  publishMessage,
  enableStreaming,
  disableStreaming,
} from './events.js';

// === CORE TYPES ===
export type {
  // Base interfaces for client use
  World,
  Agent,
  AgentMessage,
  // Chat data types
  WorldChat,
  ChatData,
} from './types.js';

export type { WorldInfo } from './managers.js';
export type { LoggerConfig, LogLevel } from './logger.js';

// LLM Provider enum (needed for agent configuration)
export { LLMProvider } from './types.js';

// === UTILITIES ===
export {
  logger,
  createCategoryLogger,
} from './logger.js';

export {
  generateId,
  toKebabCase
} from './utils.js';

// === SUBSCRIPTION SYSTEM ===
// Export subscription functionality for server API
export * from './subscription.js';

export const VERSION = '3.0.0';
