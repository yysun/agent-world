/**
 * Consolidated Type Definitions - Centralized types for web components
 * 
 * Features:
 * - Reuses core types from ../../../core/types
 * - Consolidates duplicate interface definitions
 * - Provides UI-specific extensions of core types
 * - Eliminates redundant type definitions across components
 * - Single source of truth for all UI state management
 * 
 * Implementation:
 * - Re-exports core types for consistency
 * - Extends core interfaces for UI-specific properties
 * - Consolidates message, agent, and world interfaces
 * - Provides type-safe state management interfaces
 * - Eliminates circular dependencies through proper organization
 * 
 * Changes:
 * - Created centralized type consolidation
 * - Eliminated duplicate interfaces across web components
 * - Extended core types with UI-specific properties
 * - Consolidated SSE and AppRun state management types
 */

// Import core types for internal use only (not re-exported)
import type {
  AgentMessage,
  LLMProvider
} from '../../../core/types';

import {
  EventType,
  SenderType,
  stripCustomFields,
  stripCustomFieldsFromMessages
} from '../../../core/types';

// Export utilities that are still needed
export {
  EventType,
  SenderType,
  stripCustomFields,
  stripCustomFieldsFromMessages
};

// Re-export LLMProvider type for components that need it
export type { LLMProvider };

// Web UI Message Interface
export interface Message {
  id: number | string;
  type: string;
  sender: string;
  text: string;
  createdAt: string;
  worldName?: string;
  isStreaming?: boolean;
  streamComplete?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  messageId?: string;
  userEntered?: boolean;
  fromAgentId?: string;
}

// Web UI Agent Interface (data-only, no methods)
export interface Agent {
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
  description?: string;

  // UI-specific properties
  spriteIndex: number;
  messageCount: number;
}

// Web UI World Interface
export interface World {
  id?: string;
  name: string;
  description?: string;
  agents: Agent[];
  llmCallLimit?: number;
  turnLimit?: number;
}

// Agent Edit State Management
export interface AgentEditState {
  isOpen: boolean;
  mode: 'create' | 'edit';
  selectedAgent: Agent | null;
  formData: {
    name: string;
    description: string;
    provider: string;
    model: string;
    temperature: number;
    systemPrompt: string;
  };
  loading: boolean;
  error: string | null;
}

// World Edit State Management
export interface WorldEditState {
  isOpen: boolean;
  mode: 'create' | 'edit';
  selectedWorld: World | null;
  formData: {
    name: string;
    description: string;
    turnLimit: number;
  };
  loading: boolean;
  error: string | null;
}

// Base SSE Component State (consolidated from sse-client.ts)
export interface SSEComponentState {
  messages: Message[];
  worldName?: string;
  connectionStatus?: string;
  wsError?: string | null;
  needScroll?: boolean;
}

// World Component State (consolidated from world-update.ts)
export interface WorldComponentState extends SSEComponentState {
  worldName: string;
  world: World | null;
  agents: Agent[];
  userInput?: string; // Made optional to handle undefined cases
  loading: boolean;
  error: string | null;
  messagesLoading: boolean;
  isSending: boolean;
  isWaiting: boolean;
  selectedSettingsTarget: 'world' | 'agent' | null;
  selectedAgent: Agent | null;
  activeAgent: { spriteIndex: number; name: string } | null;
  agentEdit: AgentEditState;
  worldEdit: WorldEditState;

  // Additional missing properties from SSE state
  connectionStatus: string;
  wsError: string | null;
  needScroll: boolean;
}

// API Response Types (consolidated from api.ts)
export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  code?: string;
}

export interface AgentMemoryResponse {
  messages: Message[];
  [key: string]: any;
}

// SSE Event Handler Types
export interface StreamStartData {
  messageId: string;
  sender: string;
  worldName?: string;
}

export interface StreamChunkData {
  messageId: string;
  sender: string;
  content: string;
  isAccumulated: boolean;
  worldName?: string;
}

export interface StreamEndData {
  messageId: string;
  sender: string;
  content: string;
  worldName?: string;
}

export interface StreamErrorData {
  messageId: string;
  sender: string;
  error: string;
  worldName?: string;
}

export interface MessageData {
  data?: {
    type?: string;
    sender?: string;
    agentName?: string;
    content?: string;
    message?: string;
    createdAt?: string;
    worldName?: string;
  };
}

export interface ErrorData {
  message: string;
}

// API Request Types (consolidated from server/api.ts patterns)
export interface ApiRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  [key: string]: any;
}

// Form Data Types
export interface WorldFormData {
  name: string;
  description?: string;
  turnLimit?: number;
}

export interface AgentFormData {
  name: string;
  description: string;
  provider: string;
  model: string;
  temperature: number;
  systemPrompt: string;
}

// Event Handler Function Types
export type StateUpdateFunction<T extends SSEComponentState> = (state: T, data?: any) => T;
export type AsyncStateUpdateFunction<T extends SSEComponentState> = (state: T, data?: any) => Promise<T>;
export type StateUpdateGenerator<T extends SSEComponentState> = (state: T, data?: any) => AsyncGenerator<T>;

// AppRun Event Handler Types
export interface AppRunEventHandlers<T extends SSEComponentState> {
  [eventName: string]: StateUpdateFunction<T> | AsyncStateUpdateFunction<T> | StateUpdateGenerator<T>;
}

// Utility type for component state updates
export type ComponentStateUpdate<T extends SSEComponentState> = Partial<T>;

// Type guards for runtime type checking
export function isAgent(obj: any): obj is Agent {
  return obj && typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.spriteIndex === 'number' &&
    typeof obj.messageCount === 'number';
}

export function isMessage(obj: any): obj is Message {
  return obj && typeof obj === 'object' &&
    typeof obj.sender === 'string' &&
    typeof obj.text === 'string' &&
    typeof obj.createdAt === 'string';
}

export function isWorldComponentState(obj: any): obj is WorldComponentState {
  return obj && typeof obj === 'object' &&
    typeof obj.worldName === 'string' &&
    Array.isArray(obj.messages) &&
    Array.isArray(obj.agents);
}

// Constants for UI configuration
export const UI_CONSTANTS = {
  DEFAULT_TEMPERATURE: 0.7,
  DEFAULT_TURN_LIMIT: 5,
  DEFAULT_SPRITE_COUNT: 9,
  MAX_MESSAGE_LENGTH: 4000,
  MAX_SYSTEM_PROMPT_LENGTH: 2000,
  MAX_AGENT_NAME_LENGTH: 50,
  MAX_WORLD_NAME_LENGTH: 100,
} as const;

// Default values for forms
export const DEFAULT_AGENT_FORM_DATA: AgentFormData = {
  name: '',
  description: '',
  provider: 'ollama',
  model: 'llama3.2:3b',
  temperature: UI_CONSTANTS.DEFAULT_TEMPERATURE,
  systemPrompt: ''
};

export const DEFAULT_WORLD_FORM_DATA: WorldFormData = {
  name: '',
  description: '',
  turnLimit: UI_CONSTANTS.DEFAULT_TURN_LIMIT
};

// Export commonly used type aliases for backward compatibility
export type WorldAgent = Agent;
