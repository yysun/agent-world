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
 * 
 * Recent Changes:
 * - Added strict typing for event payloads (MessageEventPayload, SystemEventPayload, SSEEventPayload)
 * - Updated Event interface to use union types for payload
 * - Refactored event structure to remove nested payload nesting
 * - Changed sender terminology from "CLI" to "HUMAN"
 * - Updated Zod schemas for new event structure validation
 */

import { z } from 'zod';

export interface Agent {
  id: string;
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
  id?: string;
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
  agentId?: string;
}

export interface CreateAgentRequest {
  name: string;
  type: string;
  config?: Partial<AgentConfig>;
}

// Event Types
export interface MessageEventPayload {
  content: string;
  sender: string;
}

export interface SystemEventPayload {
  action: string;
  agentId?: string;
  worldId?: string;
  [key: string]: any;
}

export interface SSEEventPayload {
  agentId: string;
  type: 'start' | 'chunk' | 'end' | 'error';
  content?: string;
  error?: string;
  messageId?: string;
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
  SSE = 'sse'
}

export interface EventFilter {
  types?: EventType[];
  agentId?: string;
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
      agentId: z.string().optional(),
      worldId: z.string().optional()
    }).and(z.record(z.any())),
    z.object({
      agentId: z.string(),
      type: z.enum(['start', 'chunk', 'end', 'error']),
      content: z.string().optional(),
      error: z.string().optional(),
      messageId: z.string().optional()
    })
  ])
});

// World Types
export interface WorldState {
  id: string;
  name: string;
  agents: Map<string, Agent>;
}

export interface WorldOptions {
  name?: string;
}

export interface WorldInfo {
  id: string;
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

export interface AgentMemory {
  agentId?: string;
  conversationHistory?: Event[];
  facts: Record<string, any>;
  relationships?: Record<string, any>;
  goals?: string[];
  context?: string;
  lastActivity?: string;
  shortTerm?: Array<{ content: string; timestamp: string }>;
  longTerm?: Array<{ content: string; timestamp: string }>;
}


