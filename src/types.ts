/**
 * Agent - Minimal agent structure for world and event types
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
/*
 * Type Definitions - Agent, LLM, Event, and World Types
 * 
 * Features:
 * - Agent configuration and status types
 * - LLM provider and queue types
 * - Event-bus event and filter types
 * - World state and options types
 * - Replaces shared package dependencies
 * 
 * Logic:
 * - Provides all necessary types for world management
 * - Self-contained type definitions (no external dependencies)
 * - Clean interfaces for agents, events, and worlds
 * - Compatible with existing event-bus.ts structure
 * 
 * Changes:
 * - Initial implementation of consolidated type definitions
 * - Replaces shared package dependencies with local types
 * - Provides type safety for world management functions
 * - Defines core interfaces for agent and world management
 * - UPDATED: Replaced personality/instructions with systemPrompt field
 * - systemPrompt is saved as separate system-prompt.md file per agent
 */

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
export interface Event {
  id: string;
  type: EventType;
  timestamp: string;
  payload: any;
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
  payload: z.record(z.any())
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


