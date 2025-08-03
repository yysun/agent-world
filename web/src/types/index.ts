/**
 * Consolidated Type Definitions - Centralized types for web components
 * 
 * Features:
 * - Reuses core types from ../../../core/types
 * - Consolidates duplicate interface definitions
 * - Provides UI-specific extensions of core types
 * - Eliminates redundant type definitions across components
 * - Single source of truth for all UI state management
 * - Matches server serialization structure for World interface
 * 
 * Implementation:
 * - Re-exports core types for consistency
 * - Extends core interfaces for UI-specific properties
 * - Consolidates message, agent, and world interfaces
 * - Provides type-safe state management interfaces
 * - Eliminates circular dependencies through proper organization
 * - Web World interface matches server's serializeWorld output
 * 
 * Changes:
 * - Created centralized type consolidation
 * - Eliminated duplicate interfaces across web components
 * - Extended core types with UI-specific properties
 * - Consolidated SSE and AppRun state management types
 * - Updated World interface to match server serialization:
 *   - Added chatLLMProvider, chatLLMModel, currentChatId
 *   - Added chats array for chat history
 *   - Made id required to match server response
 *   - Updated WorldFormData to include LLM configuration
 * - Agent interface matches server's serializeAgent output:
 *   - Includes UI-specific properties (spriteIndex, messageCount)
 *   - Consistent with server serialization format
 *   - Preserves all core agent properties
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

// Web UI World Interface - matches server serialization
export interface World {
  id: string;
  name: string;
  description?: string;
  turnLimit: number;
  chatLLMProvider?: string;
  chatLLMModel?: string;
  currentChatId: string | null;
  agents: Agent[];
  chats: Chat[];
}

// Chat History Interfaces (from core types)
export interface Chat {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  summary?: string;
  tags?: string[];
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
  userInput?: string; // Made optional to handle undefined cases
  loading: boolean;
  error: string | null;
  messagesLoading: boolean;
  isSending: boolean;
  isWaiting: boolean;
  selectedSettingsTarget: 'world' | 'agent' | 'chat' | null;
  selectedAgent: Agent | null;
  activeAgent: { spriteIndex: number; name: string } | null;

  // Simplified agent edit state - just boolean flags and mode
  showAgentEdit: boolean;
  agentEditMode: 'create' | 'edit' | 'delete';
  selectedAgentForEdit: Agent | null;

  // Simplified world edit state - just boolean flags and mode
  showWorldEdit: boolean;
  worldEditMode: 'create' | 'edit' | 'delete';
  selectedWorldForEdit: World | null;

  // Chat history UI state
  chatToDelete: Chat | null;

  // Additional missing properties from SSE state
  connectionStatus: string;
  wsError: string | null;
  needScroll: boolean;
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

// API Request Types (consolidated from server/api.ts patterns)
export interface ApiRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  [key: string]: any;
}

