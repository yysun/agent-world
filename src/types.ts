/**
 * Core type definitions for the Agent World system.
 * 
 * This file defines all the core types, interfaces, and schemas used throughout
 * the system for agents, events, storage, and configuration.
 * 
 * Features:
 * - Agent configuration and state types
 * - Event system types with strict payload typing
 * - Storage provider interfaces
 * - Zod schemas for runtime validation
 * - LLM provider configuration
 * - Standard LLM chat message schema for consistent memory storage
 * 
 * Recent Changes:
 * - Added strict typing for event payloads (MessageEventPayload, SystemEventPayload, SSEEventPayload)
 * - Updated Event interface to use union types for payload
 * - Refactored event structure to remove nested payload nesting
 * - Changed sender terminology from "CLI" to "HUMAN"
 * - Updated Zod schemas for new event structure validation
 * - Added standard LLM chat message schema types (ChatMessage)
 * - Added AgentMemory interface for new memory structure
 * - Removed unused types (ChatRole, CreateAgentRequest, unused Zod schemas)
 */

import { z } from 'zod';

// LLM Chat Message Types
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string; // Optional sender identification
  timestamp?: string; // ISO timestamp
}

export interface AgentMemory {
  messages: ChatMessage[];
  lastActivity: string; // ISO timestamp
}

// Legacy message type for migration
export interface LegacyMessage {
  type: 'incoming' | 'outgoing';
  sender: string;
  content: string;
  messageId: string;
  timestamp: string;
  inResponseTo?: string;
}

export interface Agent {
  name: string;
  type: string;
  status?: 'active' | 'inactive' | 'error';
  config: AgentConfig;
  createdAt?: Date;
  lastActive?: Date;
  metadata?: Record<string, any>;
}



// Agent Types
/**
 * AgentConfig - Configuration for an AI agent
 * Combines LLM provider, model, and agent-specific options
 * (Moved from agent.ts, reconciled fields)
 */
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

/**
 * MessageData - Structure for agent message events
 * (Moved from agent.ts)
 */
export interface MessageData {
  name: string;
  payload: any;
  id: string;
  sender?: string;
  content?: string;
  agentName?: string;
}

// Event Types
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
  payload: MessageEventPayload | SystemEventPayload | SSEEventPayload;
}

export enum EventType {
  MESSAGE = 'message',
  WORLD = 'world',
  SSE = 'sse',
  SYSTEM = 'system'
}

export interface EventFilter {
  types?: EventType[];
  agentName?: string;
  since?: Date;
}

export const EventSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(EventType),
  timestamp: z.string().datetime(),
  payload: z.union([
    z.object({
      content: z.string(),
      sender: z.string()
    }),
    z.object({
      action: z.string(),
      agentName: z.string().optional(),
      worldName: z.string().optional()
    }).and(z.record(z.any())),
    z.object({
      agentName: z.string(),
      type: z.enum(['start', 'chunk', 'end', 'error']),
      content: z.string().optional(),
      error: z.string().optional(),
      messageId: z.string().optional()
    })
  ])
});

// World Types
export interface WorldState {
  name: string;
  agents: Map<string, Agent>;
}

export interface WorldOptions {
  name?: string;
}

export interface WorldInfo {
  name: string;
  agentCount: number;
}

// LLM Types (for future use)
export enum LLMProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  AZURE = 'azure',
  GOOGLE = 'google',
  XAI = 'xai',
  OPENAI_COMPATIBLE = 'openai-compatible',
  OLLAMA = 'ollama'
}

// Message Types
export interface MessagePayload {
  content: string;
  sender: string;
}

// File Storage Types
export interface FileStorageOptions {
  dataPath?: string;
  enableLogging?: boolean;
}

export interface StoragePaths {
  agents: string;
  messages: string;
  events: string;
}

// Zod Schemas for Validation
export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
  name: z.string().optional(),
  timestamp: z.string().optional(),
});

export const LegacyMessageSchema = z.object({
  type: z.enum(['incoming', 'outgoing']),
  sender: z.string(),
  content: z.string(),
  messageId: z.string(),
  timestamp: z.string(),
  inResponseTo: z.string().optional(),
});


