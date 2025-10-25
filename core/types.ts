/**
 * Core type definitions for the Agent World system.
 *
 * Features:
 * - Agent configuration with comprehensive LLM provider support and memory management
 * - Event system with strict payload typing and union types for type safety
 * - AI SDK compatible chat messages with utility functions for seamless integration
 * - Storage interfaces and world-specific file operations with EventEmitter integration
 * - Comprehensive LLM provider enumeration (OpenAI, Anthropic, Azure, Google, XAI, Ollama)
 */

import { type EventEmitter } from 'events';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  createdAt?: Date;
  // Tool call support for function calling
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string; // For tool response messages
}

export interface AgentMessage extends ChatMessage {
  messageId?: string; // Unique identifier - REQUIRED for all new messages (optional only for legacy data pre-migration)
  sender?: string; // Custom field - removed before LLM calls
  chatId?: string | null; // Chat session ID for memory filtering
  agentId?: string; // Agent ID for identifying message source
}

// Agent Types
export interface Agent {
  id: string; // kebab-case of agent name
  name: string;
  type: string;
  status?: 'active' | 'inactive' | 'error';
  provider: LLMProvider;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  createdAt?: Date;
  lastActive?: Date;
  llmCallCount: number;
  lastLLMCall?: Date;
  memory: AgentMessage[];
}

// deprecated
export interface MessageData {
  name: string;
  payload: any;
  id: string;
  sender?: string;
  content?: string;
  agentName?: string;
}

// Event System Types - Enhanced with Mapped Types

export interface MessageEventPayload {
  content: string;
  sender: string;
}

export interface SystemEventPayload {
  action: string;
  agentName?: string;
  worldName?: string;
  content?: string;
  timestamp?: string;
}

export interface SSEEventPayload {
  agentName: string;
  type: 'start' | 'chunk' | 'end' | 'error';
  content?: string;
  error?: string;
  messageId?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface WorldEventPayload {
  action: string;
  worldId?: string;
  agentId?: string;
  data?: any;
}

/**
 * Event payload mapping for type-safe event handling
 * Maps each EventType to its corresponding payload type
 */
export type EventPayloadMap = {
  [EventType.MESSAGE]: MessageEventPayload;
  [EventType.SYSTEM]: SystemEventPayload;
  [EventType.SSE]: SSEEventPayload;
  [EventType.WORLD]: WorldEventPayload;
};

export enum EventType {
  MESSAGE = 'message',
  WORLD = 'world',
  SSE = 'sse',
  SYSTEM = 'system'
}

export enum SenderType {
  SYSTEM = 'system',
  WORLD = 'world',
  AGENT = 'agent',
  HUMAN = 'human'
}

// Agent Operation Types - Simplified Parameter Interfaces

/**
 * Agent creation parameters - includes all properties needed for new agents
 */
export interface CreateAgentParams {
  id?: string; // Optional - will be auto-generated from name using toKebabCase if not provided
  name: string;
  type: string;
  provider: LLMProvider;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Agent update parameters - partial for flexible updates with additional status field
 */
export interface UpdateAgentParams extends Partial<Omit<CreateAgentParams, 'id'>> {
  status?: 'active' | 'inactive' | 'error';
}

export interface Chat {
  id: string; // nanoid
  worldId: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

/**
 * World chat for full state capture
 */
export interface WorldChat {
  world: World;
  agents: Agent[];
  messages: AgentMessage[];
  metadata: {
    capturedAt: Date;
    version: string;
    totalMessages: number;
    activeAgents: number;
  };
}

/**
 * Chat creation parameters
 */
export interface CreateChatParams {
  name?: string;
  description?: string;
  captureChat?: boolean;
}

/**
 * Chat update parameters
 */
export interface UpdateChatParams extends Partial<Omit<CreateChatParams, 'captureChat'>> {
  tags?: string[];
  messageCount?: number; // For autosave updates
}

/**
 * Message edit result tracking
 */
export interface RemovalResult {
  success: boolean;
  messageId: string; // Original messageId that was removed
  totalAgents: number;
  processedAgents: string[];
  failedAgents: Array<{ agentId: string; error: string }>;
  messagesRemovedTotal: number;
  requiresRetry: boolean;
  // Resubmission status
  resubmissionStatus: 'success' | 'failed' | 'skipped';
  resubmissionError?: string;
  newMessageId?: string; // messageId of resubmitted message
}

/**
 * Edit error log for troubleshooting
 */
export interface EditErrorLog {
  worldId: string;
  messageId: string;
  chatId: string;
  timestamp: Date;
  operation: 'removal' | 'resubmission';
  failedAgents: Array<{ agentId: string; error: string }>;
  retryCount: number;
}

/**
 * Chat list info for efficient display
 */
// ...existing code...

// World Management Types - Simplified Parameter Interfaces

/**
 * World creation parameters
 */
export interface CreateWorldParams {
  name: string;
  description?: string | null;
  turnLimit?: number;
  chatLLMProvider?: LLMProvider; // For chat summarization
  chatLLMModel?: string; // For chat summarization
  mcpConfig?: string | null; // MCP configuration JSON string
}

/**
 * World update parameters - partial for flexible updates
 */
export interface UpdateWorldParams extends Partial<CreateWorldParams> {
  currentChatId?: string | null;
}

/**
 * Serializable world data for storage (flat structure, no EventEmitter, no agents Map)
 */
export interface World {
  id: string;
  name: string;
  description?: string | null;
  turnLimit: number;
  chatLLMProvider?: string; // For chat summarization
  chatLLMModel?: string; // For chat summarization
  currentChatId?: string | null; // Track active chat session
  mcpConfig?: string | null; // MCP configuration JSON string
  isProcessing?: boolean; // Flag to prevent edits during agent processing
  createdAt: Date;
  lastUpdated: Date;
  totalAgents: number;
  totalMessages: number;

  eventEmitter: EventEmitter;
  agents: Map<string, Agent>;
  chats: Map<string, Chat>;
}

// Unified Storage Interface - Consolidated from StorageManager and StorageAPI
export interface StorageAPI {
  // World operations
  saveWorld(worldData: World): Promise<void>;
  loadWorld(worldId: string): Promise<World | null>;
  deleteWorld(worldId: string): Promise<boolean>;
  listWorlds(): Promise<World[]>;
  worldExists(worldId: string): Promise<boolean>;

  getMemory(worldId: string, chatId?: string | null): Promise<AgentMessage[]>;

  // Agent operations
  saveAgent(worldId: string, agent: Agent): Promise<void>;
  loadAgent(worldId: string, agentId: string): Promise<Agent | null>;
  loadAgentWithRetry(worldId: string, agentId: string, options?: any): Promise<Agent | null>;
  deleteAgent(worldId: string, agentId: string): Promise<boolean>;
  listAgents(worldId: string): Promise<Agent[]>;
  agentExists(worldId: string, agentId: string): Promise<boolean>;
  saveAgentMemory(worldId: string, agentId: string, memory: AgentMessage[]): Promise<void>;
  archiveMemory(worldId: string, agentId: string, memory: AgentMessage[]): Promise<void>;
  deleteMemoryByChatId(worldId: string, chatId: string): Promise<number>;

  // Batch operations
  saveAgentsBatch(worldId: string, agents: Agent[]): Promise<void>;
  loadAgentsBatch(worldId: string, agentIds: string[]): Promise<Agent[]>;

  // Chat history operations
  saveChatData(worldId: string, chat: Chat): Promise<void>;
  loadChatData(worldId: string, chatId: string): Promise<Chat | null>;
  deleteChatData(worldId: string, chatId: string): Promise<boolean>;
  listChats(worldId: string): Promise<Chat[]>;
  updateChatData(worldId: string, chatId: string, updates: UpdateChatParams): Promise<Chat | null>;

  // Chat operations
  saveWorldChat(worldId: string, chatId: string, chat: WorldChat): Promise<void>;
  loadWorldChat(worldId: string, chatId: string): Promise<WorldChat | null>;
  loadWorldChatFull(worldId: string, chatId: string): Promise<WorldChat | null>;
  restoreFromWorldChat(worldId: string, chat: WorldChat): Promise<boolean>;

  // Integrity operations
  validateIntegrity(worldId: string, agentId?: string): Promise<boolean>;
  repairData(worldId: string, agentId?: string): Promise<boolean>;
}

// Legacy alias for backward compatibility - will be removed in future versions
export interface StorageManager extends StorageAPI { }

// LLM Provider Types
export enum LLMProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  AZURE = 'azure',
  GOOGLE = 'google',
  XAI = 'xai',
  OPENAI_COMPATIBLE = 'openai-compatible',
  OLLAMA = 'ollama'
};
// World EventEmitter Types

/**
 * World message event data structure for World.eventEmitter
 */
export interface WorldMessageEvent {
  content: string;
  sender: string;
  timestamp: Date;
  messageId: string;
}

/**
 * World SSE event data structure for World.eventEmitter
 */
export interface WorldSSEEvent {
  agentName: string;
  type: 'start' | 'chunk' | 'end' | 'error' | 'log' | 'tool-start' | 'tool-result' | 'tool-error' | 'tool-progress';
  content?: string;
  error?: string;
  messageId: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  logEvent?: {
    level: string;
    category: string;
    message: string;
    timestamp: string;
    data?: any;
  };
  // Enhanced tool execution metadata for Phase 2.2
  toolExecution?: {
    toolName: string;
    toolCallId: string;
    sequenceId?: string;
    phase: 'starting' | 'executing' | 'completed' | 'failed';
    duration?: number;
    input?: any;
    result?: any;
    resultType?: 'string' | 'object' | 'array' | 'null';
    resultSize?: number;
    error?: string;
    metadata?: {
      serverName?: string;
      transport?: string;
      isStreaming?: boolean;
    };
  };
}

export interface WorldSystemEvent {
  content: string;
  timestamp: Date;
  messageId: string;
}



