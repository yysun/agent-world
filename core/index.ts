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
 * - Utilities: logger, createCategoryLogger, loggers, generateId, toKebabCase
 * - Subscription System: subscribeWorld, ClientConnection (for server API)
 *
 * Private APIs (not exported):
 * - Internal agent functions: createAgent (via world instance), updateAgentMemory, loadAgentsIntoWorld, syncWorldAgents, etc.
 * - Internal chat functions: createChat, getChat, createWorldChat
 * - Internal event functions: subscribeAgentToMessages, processAgentMessage, SSE functions
 * - Parameter types: CreateAgentParams, UpdateAgentParams, etc.
 * - Storage implementation: StorageAPI, storage factory functions
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
  getMemory,
  migrateMessageIds,
  removeMessagesFrom,
  editUserMessage,
  logEditError,
  getEditErrors
} from './managers.js';

export {
  exportWorldToMarkdown,
  exportChatToMarkdown,
} from './export.js';

// === AGENT MANAGEMENT ===
export {
  createAgent,
  getAgent,
  updateAgent,
  deleteAgent,
  listAgents,
  clearAgentMemory,
} from './managers.js';

// === MCP MANAGEMENT ===
export {
  clearToolsCache
} from './mcp-server-registry.js';

// === SHELL COMMAND TOOL ===
export {
  executeShellCommand,
  getExecutionHistory,
  clearExecutionHistory,
  type CommandExecutionResult
} from './shell-cmd-tool.js';

// === CHAT MANAGEMENT ===
export {
  newChat,
  listChats,
  updateChat,
  deleteChat,
  restoreChat
} from './managers.js';

// === EVENT SYSTEM ===
export {
  enableStreaming,
  disableStreaming,
  publishMessage,
  publishMessageWithId,
  publishToolResult,
} from './events/index.js';

export {
  beginWorldActivity,
  trackWorldActivity,
  type WorldActivityEventPayload,
  type WorldActivityEventType,
} from './activity-tracker.js';

// LLM Provider enum (needed for agent configuration)
export { type World, type Agent, type Chat, type AgentMessage, type RemovalResult, type EditErrorLog, LLMProvider, EventType, type LLMResponse } from './types.js';

// === LOGGER ===
export { type LoggerConfig, type LogLevel, logger, createCategoryLogger, loggers } from './logger.js';

// === SUBSCRIPTION SYSTEM ===
export { type ClientConnection, subscribeWorld } from './subscription.js';

export { getDefaultRootPath } from './storage/storage-factory.js';

// === MIGRATION SYSTEM (for advanced usage) ===
export {
  runMigrations,
  getMigrationStatus,
  needsMigration,
  type MigrationContext,
  type MigrationFile
} from './storage/migration-runner.js';

export const VERSION = '0.5.0';
