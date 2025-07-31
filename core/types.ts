/**
 * Core type definitions for the Agent World system.
 * 
 * Features:
 * - Agent configuration and state management with comprehensive LLM provider support (flattened structure)
 * - Event system with strict payload typing and union types for type safety (MESSAGE, WORLD, SSE, SYSTEM)
 * - AI SDK compatible chat messages with utility functions for seamless LLM integration
 * - Storage provider interfaces and file management with world-specific operations
 * - World EventEmitter event data structures for isolated event handling
 * - Zod schemas for runtime validation and type safety (where applicable)
 * - Comprehensive LLM provider enumeration supporting all major services
 * 
 * Core Types:
 * - ChatMessage: AI SDK compatible interface with Date objects and optional sender field
 * - AgentMessage: Extended ChatMessage with custom fields for agent-specific data
 * - Agent: Flattened interface with all LLM provider configurations and memory management
 * - World: Complete world interface with agent operations and configuration management
 * - Event System: Union types for type-safe payload handling across different event types
 * - LLM Provider Support: Comprehensive enumeration covering OpenAI, Anthropic, Azure, Google, XAI, Ollama
 * 
 * Implementation Details:
 * - Event system using union types for type-safe payloads preventing runtime errors
 * - Agent memory structure with message history and activity tracking for conversation context
 * - Utility functions to strip custom fields before LLM calls ensuring AI SDK compatibility
 * - Comprehensive LLM provider support covering all major commercial and open-source options
 * - World event structures for World.eventEmitter integration with proper typing
 * - Flattened Agent interface for simplified property access and configuration management
 * - Storage interfaces supporting world-specific file operations and data persistence
 * 
 * AI SDK Integration:
 * - ChatMessage interface fully compatible with AI SDK requirements
 * - stripCustomFields utility removes agent-specific fields before LLM calls
 * - Date objects preserved for timestamp tracking and conversation history
 * - Message role system supporting system, user, and assistant roles
 * 
 * Recent Changes:
 * - Enhanced comment documentation with comprehensive feature descriptions
 * - Added detailed implementation notes about AI SDK compatibility and type safety
 * - Improved type descriptions with usage examples and integration details
 */

// Chat Message Types - AI SDK Compatible

import { EventEmitter } from 'events';
import type { WorldData } from './world-storage.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  createdAt?: Date;
}

export interface AgentMessage extends ChatMessage {
  sender?: string; // Custom field - removed before LLM calls
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
  world?: World;

  // LLM operation methods (R2.1)
  generateResponse(messages: AgentMessage[]): Promise<string>;
  streamResponse(messages: AgentMessage[]): Promise<string>;

  // Memory management methods (R2.2)
  addToMemory(message: AgentMessage): Promise<void>;
  getMemorySize(): number;
  archiveMemory(): Promise<void>;
  getMemorySlice(start: number, end: number): AgentMessage[];
  searchMemory(query: string): AgentMessage[];

  // Message processing methods (R2.3)
  shouldRespond(messageEvent: WorldMessageEvent): Promise<boolean>;
  processMessage(messageEvent: WorldMessageEvent): Promise<void>;
  extractMentions(content: string): string[];
  isMentioned(content: string): boolean;
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

/**
 * Type-safe event structure using conditional types
 * Ensures payload type matches the event type
 */
export type TypedEvent<T extends EventType> = {
  id: string;
  type: T;
  timestamp: string;
  sender: string;
  senderType: SenderType;
  payload: EventPayloadMap[T];
};

export interface Event {
  id: string;
  type: EventType;
  timestamp: string;
  sender: string;
  senderType: SenderType;
  payload: MessageEventPayload | SystemEventPayload | SSEEventPayload | WorldEventPayload;
}

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

/**
 * Agent information type - derived from Agent interface for consistency
 * Uses Pick utility type to ensure automatic synchronization with Agent changes
 */
export type AgentInfo = Pick<Agent,
  'id' | 'name' | 'type' | 'model' | 'status' | 'createdAt' | 'lastActive' | 'llmCallCount'
> & {
  memorySize: number; // Computed field - derived from memory.length
}

/**
 * Storage-safe agent data type - clean interface for persistence
 * Replaces complex AgentStorage with explicit properties
 */
export interface AgentData {
  id: string;
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

/**
 * @deprecated Use AgentData instead for cleaner, more maintainable code
 * 
 * AgentStorage uses complex Omit operations making it harder to maintain.
 * AgentData provides explicit properties for better IDE support and type safety.
 * 
 * Storage-safe agent type - excludes runtime methods for persistence
 * Uses Omit utility type to remove all methods, keeping only data properties
 */
export type AgentStorage = Omit<Agent,
  | 'generateResponse'
  | 'streamResponse'
  | 'addToMemory'
  | 'getMemorySize'
  | 'archiveMemory'
  | 'getMemorySlice'
  | 'searchMemory'
  | 'shouldRespond'
  | 'processMessage'
  | 'extractMentions'
  | 'isMentioned'
  | 'world' // Exclude circular reference for storage
>

// World Chat History Types

/**
 * World chat history entry
 */
export interface WorldChat {
  id: string; // nanoid
  worldId: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  summary?: string; // LLM-generated summary
  tags?: string[];
  snapshot?: WorldSnapshot; // Full world state when chat was created/saved
}

/**
 * World snapshot for full state capture
 */
export interface WorldSnapshot {
  world: WorldData;
  agents: AgentData[];
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
  name: string;
  description?: string;
  captureSnapshot?: boolean;
}

/**
 * Chat update parameters
 */
export interface UpdateChatParams extends Partial<Omit<CreateChatParams, 'captureSnapshot'>> {
  summary?: string;
  tags?: string[];
  messageCount?: number; // For autosave updates
}

/**
 * Chat list info for efficient display
 */
export interface ChatInfo {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  summary?: string;
  tags?: string[];
}

// World Management Types - Simplified Parameter Interfaces

/**
 * World creation parameters
 */
export interface CreateWorldParams {
  name: string;
  description?: string;
  turnLimit?: number;
  chatLLMProvider?: LLMProvider; // For chat summarization
  chatLLMModel?: string; // For chat summarization
}

/**
 * World update parameters - partial for flexible updates
 */
export interface UpdateWorldParams extends Partial<CreateWorldParams> { }

/**
 * Enhanced World interface with flattened configuration
 */
export interface World {
  // Identity & Storage
  id: string; // kebab-case of world name
  rootPath: string;

  // Flattened Configuration (no nested config object)
  name: string;
  description?: string;
  turnLimit: number;
  chatLLMProvider?: LLMProvider; // For chat summarization
  chatLLMModel?: string; // For chat summarization

  // Runtime Objects
  eventEmitter: EventEmitter;
  agents: Map<string, Agent>;

  // Unified interfaces (R3.2, R4.2)
  storage: StorageManager;
  messageProcessor: MessageProcessor;

  // Agent operation methods
  createAgent(params: CreateAgentParams): Promise<Agent>;
  getAgent(agentName: string): Promise<Agent | null>;
  updateAgent(agentName: string, updates: UpdateAgentParams): Promise<Agent | null>;
  deleteAgent(agentName: string): Promise<boolean>;
  clearAgentMemory(agentName: string): Promise<Agent | null>;
  listAgents(): Promise<AgentInfo[]>;
  updateAgentMemory(agentName: string, messages: AgentMessage[]): Promise<Agent | null>;
  saveAgentConfig(agentName: string): Promise<void>;

  // Chat history methods
  createChat(params: CreateChatParams): Promise<WorldChat>;
  loadChat(chatId: string): Promise<WorldChat | null>;
  updateChat(chatId: string, updates: UpdateChatParams): Promise<WorldChat | null>;
  deleteChat(chatId: string): Promise<boolean>;
  listChats(): Promise<ChatInfo[]>;
  createSnapshot(): Promise<WorldSnapshot>;
  restoreFromChat(chatId: string): Promise<boolean>;
  summarizeChat(chatId: string): Promise<string>;

  // World operations
  save(): Promise<void>;
  delete(): Promise<boolean>;
  reload(): Promise<void>;

  // Utility methods (R1.1)
  getTurnLimit(): number;
  getCurrentTurnCount(): number;
  hasReachedTurnLimit(): boolean;
  resetTurnCount(): void;

  // Event methods (R1.2)
  publishMessage(content: string, sender: string): void;
  subscribeToMessages(handler: (event: WorldMessageEvent) => void): () => void;
  broadcastMessage(message: string, sender?: string): void;
  publishSSE(data: Partial<WorldSSEEvent>): void;
  subscribeToSSE(handler: (event: WorldSSEEvent) => void): () => void;

  // Agent subscription methods (R1.3)
  subscribeAgent(agent: Agent): () => void;
  unsubscribeAgent(agentId: string): void;
  getSubscribedAgents(): string[];
  isAgentSubscribed(agentId: string): boolean;
}

/**
 * Storage-safe world data type - excludes runtime objects for persistence
 * Consolidation: Use WorldData from world-storage.ts as the single source of truth
 */
export type { WorldData } from './world-storage.js';

// Unified Storage Interface (R3.1)
export interface StorageManager {
  // World operations
  saveWorld(worldData: WorldData): Promise<void>;
  loadWorld(worldId: string): Promise<WorldData | null>;
  deleteWorld(worldId: string): Promise<boolean>;
  listWorlds(): Promise<WorldData[]>;

  // Agent operations
  saveAgent(worldId: string, agent: Agent): Promise<void>;
  loadAgent(worldId: string, agentId: string): Promise<Agent | null>;
  deleteAgent(worldId: string, agentId: string): Promise<boolean>;
  listAgents(worldId: string): Promise<Agent[]>;

  // Batch operations
  saveAgentsBatch(worldId: string, agents: Agent[]): Promise<void>;
  loadAgentsBatch(worldId: string, agentIds: string[]): Promise<Agent[]>;

  // Chat history operations
  saveChat(worldId: string, chat: WorldChat): Promise<void>;
  loadChat(worldId: string, chatId: string): Promise<WorldChat | null>;
  deleteChat(worldId: string, chatId: string): Promise<boolean>;
  listChats(worldId: string): Promise<ChatInfo[]>;
  updateChat(worldId: string, chatId: string, updates: UpdateChatParams): Promise<WorldChat | null>;

  // Snapshot operations
  saveSnapshot(worldId: string, chatId: string, snapshot: WorldSnapshot): Promise<void>;
  loadSnapshot(worldId: string, chatId: string): Promise<WorldSnapshot | null>;
  restoreFromSnapshot(worldId: string, snapshot: WorldSnapshot): Promise<boolean>;

  // Integrity operations
  validateIntegrity(worldId: string, agentId?: string): Promise<boolean>;
  repairData(worldId: string, agentId?: string): Promise<boolean>;
}

// Standardized Storage API Interface (R3.2) - Unified interface for all storage implementations
export interface StorageAPI {
  // World operations - standardized naming
  saveWorld(worldData: WorldData): Promise<void>;
  loadWorld(worldId: string): Promise<WorldData | null>;
  deleteWorld(worldId: string): Promise<boolean>;
  listWorlds(): Promise<WorldData[]>;
  worldExists(worldId: string): Promise<boolean>;

  // Agent operations - standardized naming
  saveAgent(worldId: string, agent: Agent): Promise<void>;
  saveAgentConfig(worldId: string, agent: Agent): Promise<void>;
  saveAgentMemory(worldId: string, agentId: string, memory: AgentMessage[]): Promise<void>;
  loadAgent(worldId: string, agentId: string): Promise<Agent | null>;
  loadAgentWithRetry(worldId: string, agentId: string, options?: any): Promise<Agent | null>;
  deleteAgent(worldId: string, agentId: string): Promise<boolean>;
  listAgents(worldId: string): Promise<Agent[]>;
  agentExists(worldId: string, agentId: string): Promise<boolean>;

  // Batch operations
  saveAgentsBatch(worldId: string, agents: Agent[]): Promise<void>;
  loadAgentsBatch(worldId: string, agentIds: string[], options?: any): Promise<{ successful: Agent[]; failed: any[] }>;

  // Chat history operations
  saveChat(worldId: string, chat: WorldChat): Promise<void>;
  loadChat(worldId: string, chatId: string): Promise<WorldChat | null>;
  deleteChat(worldId: string, chatId: string): Promise<boolean>;
  listChats(worldId: string): Promise<ChatInfo[]>;
  updateChat(worldId: string, chatId: string, updates: UpdateChatParams): Promise<WorldChat | null>;

  // Snapshot operations
  saveSnapshot(worldId: string, chatId: string, snapshot: WorldSnapshot): Promise<void>;
  loadSnapshot(worldId: string, chatId: string): Promise<WorldSnapshot | null>;
  restoreFromSnapshot(worldId: string, snapshot: WorldSnapshot): Promise<boolean>;

  // Integrity operations
  validateIntegrity(worldId: string, agentId?: string): Promise<{ isValid: boolean }>;
  repairData(worldId: string, agentId?: string): Promise<boolean>;
  archiveMemory(worldId: string, agentId: string, memory: AgentMessage[]): Promise<void>;
}

// Message Processing Interface (R4.1)
export interface MessageProcessor {
  extractMentions(content: string): string[];
  extractParagraphBeginningMentions(content: string): string[];
  determineSenderType(sender: string | undefined): SenderType;
  shouldAutoMention(response: string, sender: string, agentId: string): boolean;
  addAutoMention(response: string, sender: string): string;
  removeSelfMentions(response: string, agentId: string): string;
}



// Storage Types
export interface FileStorageOptions {
  dataPath?: string;
  enableLogging?: boolean;
}

export interface StoragePaths {
  agents: string;
  messages: string;
  events: string;
}

// LLM Provider Types
export enum LLMProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  AZURE = 'azure',
  GOOGLE = 'google',
  XAI = 'xai',
  OPENAI_COMPATIBLE = 'openai-compatible',
  OLLAMA = 'ollama'
}

// LLM Integration Utilities

export function stripCustomFields(message: AgentMessage): ChatMessage {
  const { sender, ...llmMessage } = message;
  return llmMessage;
}

export function stripCustomFieldsFromMessages(messages: AgentMessage[]): ChatMessage[] {
  return messages.map(stripCustomFields);
}

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
  type: 'start' | 'chunk' | 'end' | 'error';
  content?: string;
  error?: string;
  messageId: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}



