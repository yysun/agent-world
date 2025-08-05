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
export interface ChatData {
  id: string; // nanoid
  worldId: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  tags?: string[];
  chat?: WorldChat; // Full world state when chat was created/saved
}

/**
 * World chat for full state capture
 */
export interface WorldChat {
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
 * Chat list info for efficient display
 */
// ...existing code...

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
export interface UpdateWorldParams extends Partial<CreateWorldParams> {
  currentChatId?: string | null;
}

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

  // Chat State Management
  currentChatId: string | null; // Track active chat session

  // Runtime Objects (minimal)
  eventEmitter: EventEmitter;
  agents: Map<string, Agent>;

  // NO METHODS - Pure data interface
  // All operations now use standalone functions:
  // - createAgent(worldId, params)
  // - getAgent(worldId, agentName)
  // - updateAgent(worldId, agentName, updates)
  // - deleteAgent(worldId, agentName)
  // - clearAgentMemory(worldId, agentName)
  // - listAgents(worldId)
  // - updateAgentMemory(worldId, agentName, messages)
  // - createChatData(worldId, params)
  // - loadChatData(worldId, chatId)
  // - updateChatData(worldId, chatId, updates)
  // - deleteChatData(worldId, chatId)
  // - listChats(worldId)
  // - createWorldChat(worldId)
  // - newChat(worldId)
  // - getCurrentChat(worldId)
  // - publishMessage(worldId, content, sender)
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
  saveChatData(worldId: string, chat: ChatData): Promise<void>;
  loadChatData(worldId: string, chatId: string): Promise<ChatData | null>;
  deleteChatData(worldId: string, chatId: string): Promise<boolean>;
  listChats(worldId: string): Promise<ChatData[]>;
  updateChatData(worldId: string, chatId: string, updates: UpdateChatParams): Promise<ChatData | null>;

  // Chat operations
  saveWorldChat(worldId: string, chatId: string, chat: WorldChat): Promise<void>;
  loadWorldChat(worldId: string, chatId: string): Promise<WorldChat | null>;
  loadWorldChatFull(worldId: string, chatId: string): Promise<WorldChat | null>;
  restoreFromWorldChat(worldId: string, chat: WorldChat): Promise<boolean>;

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
  saveChatData(worldId: string, chat: ChatData): Promise<void>;
  loadChatData(worldId: string, chatId: string): Promise<ChatData | null>;
  deleteChatData(worldId: string, chatId: string): Promise<boolean>;
  listChats(worldId: string): Promise<ChatData[]>;
  updateChatData(worldId: string, chatId: string, updates: UpdateChatParams): Promise<ChatData | null>;

  // Chat operations
  saveWorldChat(worldId: string, chatId: string, chat: WorldChat): Promise<void>;
  loadWorldChat(worldId: string, chatId: string): Promise<WorldChat | null>;
  loadWorldChatFull(worldId: string, chatId: string): Promise<WorldChat | null>;
  restoreFromWorldChat(worldId: string, chat: WorldChat): Promise<boolean>;

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

export interface WorldSystemEvent {
  content: string;
  timestamp: Date;
  messageId: string;
}



