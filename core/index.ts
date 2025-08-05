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
  createAgent,
  getAgent,
  updateAgent,
  deleteAgent,
  listAgents,
  clearAgentMemory,
} from './managers.js';

// === CHAT MANAGEMENT ===
export {
  createChatData,
  getChatData,
  restoreWorldChat,
  listChatHistories,
  newChat,
  loadChatById,
} from './managers.js';

// === EVENT SYSTEM ===
export {
  enableStreaming,
  disableStreaming,
  publishMessage,
} from './events.js';

// Export full message types
import type { AgentMessage } from './types.js';
  
// === CORE TYPES ===
// Export public-only interfaces for client use
export interface World {
  // Core properties
  readonly id: string;
  readonly rootPath: string;
  name: string;
  description?: string;
  turnLimit: number;
  chatLLMProvider?: string;
  chatLLMModel?: string;
  currentChatId: string | null;

  // Runtime objects (for CLI display)
  readonly agents: Map<string, Agent>;

  // Agent operations
  // createAgent(params: {
  //   name: string;
  //   type?: string;
  //   provider: string;
  //   model: string;
  //   systemPrompt?: string;
  //   temperature?: number;
  //   maxTokens?: number;
  // }): Promise<Agent>;
  // getAgent(agentName: string): Promise<Agent | null>;
  // updateAgent(agentName: string, updates: {
  //   name?: string;
  //   type?: string;
  //   status?: 'active' | 'inactive' | 'error';
  //   provider?: string;
  //   model?: string;
  //   systemPrompt?: string;
  //   temperature?: number;
  //   maxTokens?: number;
  // }): Promise<Agent | null>;
  // deleteAgent(agentName: string): Promise<boolean>;
  // clearAgentMemory(agentName: string): Promise<Agent | null>;

  // // Chat operations
  // listChats(): Promise<{
  //   id: string;
  //   worldId: string;
  //   name: string;
  //   description?: string;
  //   createdAt: Date;
  //   updatedAt: Date;
  //   messageCount: number;
  //   tags?: string[];
  // }[]>;
  // deleteChatData(chatId: string): Promise<boolean>;
  // newChat(): Promise<World>;
  // loadChatById(chatId: string): Promise<void>;

  // // World operations
  // delete(): Promise<boolean>;
}

export interface Agent {
  // Core properties
  readonly id: string;
  name: string;
  type: string;
  status?: 'active' | 'inactive' | 'error';
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;

  // Metrics
  llmCallCount: number;
  lastLLMCall?: Date;
  memory: AgentMessage[];
  createdAt?: Date;
  lastActive?: Date;
  description?: string;
}

// LLM Provider enum (needed for agent configuration)
export { LLMProvider } from './types.js';

// === UTILITIES ===
// export type { WorldInfo } from './managers.js';
export type { LoggerConfig, LogLevel } from './logger.js';

export {
  logger,
  createCategoryLogger,
} from './logger.js';


// === SUBSCRIPTION SYSTEM ===
export { type ClientConnection, subscribeWorld } from './subscription.js';

export const VERSION = '3.0.0';
