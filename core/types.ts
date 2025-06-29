/**
 * Core type definitions for the Agent World system.
 * 
 * Features:
 * - Agent configuration and state management with LLM provider support
 * - Event system with strict payload typing (MESSAGE, WORLD, SSE, SYSTEM)
 * - AI SDK compatible chat messages with utility functions for LLM integration
 * - Storage provider interfaces and file management
 * - World EventEmitter event data structures
 * - Zod schemas for runtime validation
 * 
 * Implementation:
 * - ChatMessage interface compatible with AI SDK (Date objects, optional sender field)
 * - Event system using union types for type-safe payloads
 * - Agent memory structure with message history and activity tracking
 * - Utility functions to strip custom fields before LLM calls
 * - Comprehensive LLM provider support (OpenAI, Anthropic, Azure, Google, XAI, Ollama)
 * - World event structures for World.eventEmitter integration
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
  type: string;
  status?: 'active' | 'inactive' | 'error';
  config: AgentConfig;
  createdAt?: Date;
  lastActive?: Date;
  llmCallCount: number;
  lastLLMCall?: Date;
  memory: AgentMessage[];
  world?: World;
}

export interface AgentConfig {
  name: string;
  type: string;
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  autoSyncMemory?: boolean; // Auto-sync memory to file after LLM responses
  // Provider-specific configs
  azureEndpoint?: string;
  azureApiVersion?: string;
  azureDeployment?: string;
  ollamaBaseUrl?: string;
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
  type?: string;
  config?: Partial<AgentConfig>;
  status?: 'active' | 'inactive' | 'error';
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
export interface WorldConfig {
  name: string;
  description?: string;
  turnLimit?: number;
}

export interface World {
  id: string; // kebab-case of world name
  agents: Map<string, Agent>;
  config: WorldConfig;
  eventEmitter: EventEmitter;

  // Agent operation methods
  createAgent(params: CreateAgentParams): Promise<Agent>;
  getAgent(agentName: string): Promise<Agent | null>;
  updateAgent(agentName: string, updates: UpdateAgentParams): Promise<Agent | null>;
  deleteAgent(agentName: string): Promise<boolean>;
  clearAgentMemory(agentName: string): Promise<Agent | null>;
  listAgents(): Promise<AgentInfo[]>;
  updateAgentMemory(agentName: string, messages: AgentMessage[]): Promise<Agent | null>;
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



