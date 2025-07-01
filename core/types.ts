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
  apiKey?: string;
  baseUrl?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  // Provider-specific configs
  azureEndpoint?: string;
  azureApiVersion?: string;
  azureDeployment?: string;
  ollamaBaseUrl?: string;
  createdAt?: Date;
  lastActive?: Date;
  llmCallCount: number;
  lastLLMCall?: Date;
  memory: AgentMessage[];
  world?: World;
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

// Event System Types
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

export interface Event {
  id: string;
  type: EventType;
  timestamp: string;
  sender: string;
  senderType: SenderType;
  payload: MessageEventPayload | SystemEventPayload | SSEEventPayload;
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

// Agent Operation Types
export interface CreateAgentParams {
  id: string;
  name: string;
  type: string;
  provider: LLMProvider;
  model: string;
  systemPrompt?: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface UpdateAgentParams {
  name?: string;
  type?: string;
  status?: 'active' | 'inactive' | 'error';
  provider?: LLMProvider;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  azureEndpoint?: string;
  azureApiVersion?: string;
  azureDeployment?: string;
  ollamaBaseUrl?: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  type: string;
  model: string;
  status?: string;
  createdAt?: Date;
  lastActive?: Date;
  memorySize: number;
  llmCallCount: number;
}

// World Management Types

/**
 * World creation parameters
 */
export interface CreateWorldParams {
  name: string;
  description?: string;
  turnLimit?: number;
}

/**
 * World update parameters (partial update support)
 */
export interface UpdateWorldParams {
  name?: string;
  description?: string;
  turnLimit?: number;
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

  // Runtime Objects
  eventEmitter: EventEmitter;
  agents: Map<string, Agent>;

  // Agent operation methods
  createAgent(params: CreateAgentParams): Promise<Agent>;
  getAgent(agentName: string): Promise<Agent | null>;
  updateAgent(agentName: string, updates: UpdateAgentParams): Promise<Agent | null>;
  deleteAgent(agentName: string): Promise<boolean>;
  clearAgentMemory(agentName: string): Promise<Agent | null>;
  listAgents(): Promise<AgentInfo[]>;
  updateAgentMemory(agentName: string, messages: AgentMessage[]): Promise<Agent | null>;
  saveAgentConfig(agentName: string): Promise<void>;

  // World operations
  save(): Promise<void>;
  delete(): Promise<boolean>;
  reload(): Promise<void>;
}

/**
 * @deprecated Use World interface directly
 * WorldConfig is deprecated in favor of flattened World structure
 */
export interface WorldConfig {
  name: string;
  description?: string;
  turnLimit?: number;
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



