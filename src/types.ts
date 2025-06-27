/**
 * Core type definitions for the Agent World system.
 * 
 * Features:
 * - Agent configuration and state management with LLM provider support
 * - Event system with strict payload typing (MESSAGE, WORLD, SSE, SYSTEM)
 * - AI SDK compatible chat messages with utility functions for LLM integration
 * - Storage provider interfaces and file management
 * - Zod schemas for runtime validation
 * 
 * Implementation:
 * - ChatMessage interface compatible with AI SDK (Date objects, optional sender field)
 * - Event system using union types for type-safe payloads
 * - Agent memory structure with message history and activity tracking
 * - Utility functions to strip custom fields before LLM calls
 * - Comprehensive LLM provider support (OpenAI, Anthropic, Azure, Google, XAI, Ollama)
 */

import { z } from 'zod';

// Chat Message Types - AI SDK Compatible
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  createdAt?: Date;
  sender?: string; // Custom field - removed before LLM calls
}

export interface AgentMemory {
  messages: ChatMessage[];
  lastActivity: string; // ISO timestamp
}

// Agent Types
export interface Agent {
  name: string;
  type: string;
  status?: 'active' | 'inactive' | 'error';
  config: AgentConfig;
  createdAt?: Date;
  lastActive?: Date;
  llmCallCount: number;
  lastLLMCall?: Date;
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
  // Provider-specific configs
  azureEndpoint?: string;
  azureApiVersion?: string;
  azureDeployment?: string;
  ollamaBaseUrl?: string;
}

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
  [key: string]: any;
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
  WORLD = 'world',
  AGENT = 'agent',
  HUMAN = 'human'
}

export interface EventFilter {
  types?: EventType[];
  agentName?: string;
  since?: Date;
}

// World Management Types
export interface WorldState {
  name: string;
  agents: Map<string, Agent>;
  turnLimit?: number;
}

export interface WorldOptions {
  name?: string;
  turnLimit?: number;
}

export interface WorldInfo {
  name: string;
  agentCount: number;
  turnLimit: number;
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

export interface MessagePayload {
  content: string;
  sender: string;
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

// Zod Validation Schemas
export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
  createdAt: z.date().optional(),
  sender: z.string().optional(),
});

export const LegacyMessageSchema = z.object({
  type: z.enum(['incoming', 'outgoing']),
  sender: z.string(),
  content: z.string(),
  messageId: z.string(),
  timestamp: z.string(),
  inResponseTo: z.string().optional(),
});

export const EventSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(EventType),
  timestamp: z.string().datetime(),
  sender: z.string(),
  senderType: z.nativeEnum(SenderType),
  payload: z.union([
    z.object({ content: z.string(), sender: z.string() }), // MessageEventPayload
    z.object({
      action: z.string(),
      agentName: z.string().optional(),
      worldName: z.string().optional(),
      content: z.string().optional(),
      timestamp: z.string().optional()
    }).and(z.record(z.any())), // SystemEventPayload
    z.object({
      agentName: z.string(),
      type: z.enum(['start', 'chunk', 'end', 'error']),
      content: z.string().optional(),
      error: z.string().optional(),
      messageId: z.string().optional()
    }) // SSEEventPayload
  ])
});

// LLM Integration Utilities
export type LLMCompatibleMessage = Omit<ChatMessage, 'sender'>;

export function stripCustomFields(message: ChatMessage): LLMCompatibleMessage {
  const { sender, ...llmMessage } = message;
  return llmMessage;
}

export function stripCustomFieldsFromMessages(messages: ChatMessage[]): LLMCompatibleMessage[] {
  return messages.map(stripCustomFields);
}


