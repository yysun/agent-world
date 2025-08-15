/**
 * Consolidated Web UI Types - Centralized type definitions for frontend components
 * 
 * Features:
 * - Extends core types with UI-specific properties (spriteIndex, messageCount, streaming states)
 * - Consolidates duplicate interfaces across web components
 * - Single source of truth for UI state management and server communication
 * - Type-safe SSE event handling and component state management
 * 
 * Implementation:
 * - Re-exports essential core types for consistency
 * - UI-specific Message interface for streaming and error states  
 * - Agent/World interfaces matching server serialization format
 * - Consolidated AppRun component state interfaces
 * - SSE event data structures for real-time updates
 * 
 * Changes:
 * - Consolidated comment blocks - removed redundant feature descriptions
 * - Streamlined type imports - only essential core type dependencies
 * - Eliminated duplicate interface documentation
 * - Centralized SSE and component state type definitions
 */

// Essential core type imports
import type { AgentMessage, LLMProvider, EventType, SenderType } from '../../../core/types';
export type { EventType, SenderType, AgentMessage, LLMProvider };

// ========================================
// UI DATA INTERFACES
// ========================================

// Web UI Message Interface - extends core with streaming states
export interface Message {
  id: string;

  type: string;
  sender: string;
  text: string;
  createdAt: Date;
  worldName?: string;
  isStreaming?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  messageId?: string;
  userEntered?: boolean;
  fromAgentId?: string;
}

// Web UI Agent Interface - matches server serialization with UI extensions
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
  spriteIndex: number;    // UI-specific
  messageCount: number;   // UI-specific
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
  mcpConfig?: string | null;
  agents: Agent[];
  chats: Chat[];
  llmCallLimit?: number;  // For UI display
}

// Chat Interface - from core types
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

// ========================================
// COMPONENT PROP INTERFACES  
// ========================================

// World Chat Component Props
export interface WorldChatProps {
  worldName: string;
  messages?: Message[];
  userInput?: string;
  messagesLoading: boolean;
  isSending: boolean;
  isWaiting: boolean;
  activeAgent?: { spriteIndex: number; name: string } | null;
  selectedAgent?: { id?: string; name: string } | null;
  currentChat?: string;
}

// World Settings Component Props
export interface WorldSettingsProps {
  world: World | null;
  selectedSettingsTarget: 'world' | 'agent' | 'chat' | null;
  selectedAgent: Agent | null;
  loading?: boolean;
  totalMessages: number;
}

// World Edit Component Props & State
export interface WorldEditProps {
  mode: 'create' | 'edit' | 'delete';
  world?: World | null;
  onClose?: () => void;
  onSave?: (world: World) => void;
  parentComponent?: any;
}

export interface WorldEditState {
  mode: 'create' | 'edit' | 'delete';
  world: Partial<World>;
  parentComponent?: any;
  loading: boolean;
  error?: string | null;
  errorDetails?: any[] | null;
  successMessage?: string | null;
}

// Agent Edit Component Props & State
export interface AgentEditProps {
  mode: 'create' | 'edit' | 'delete';
  agent?: Agent | null;
  worldName: string;
  onClose?: () => void;
  onSave?: (agent: Agent) => void;
  parentComponent?: any;
}

export interface AgentEditState {
  mode: 'create' | 'edit' | 'delete';
  worldName: string;
  agent: Partial<Agent>;
  parentComponent?: any;
  loading: boolean;
  error?: string | null;
  errorDetails?: any[] | null;
  successMessage?: string | null;
}

// Chat History Component Props
export interface WorldChatHistoryProps {
  // Simplified to only the field used by WorldChatHistory component
  // Changes: Removed unused props (worldName, chats, currentChatId, onChatSelect, onChatDelete)
  world: World | null;
}

// ========================================
// COMPONENT STATE INTERFACES
// ========================================

// Base SSE Component State
export interface SSEComponentState {
  messages: Message[];
  worldName?: string;
  connectionStatus?: string;
  error?: string | null;
  needScroll?: boolean;
}

// Main World Component State - consolidated from multiple components
export interface WorldComponentState extends SSEComponentState {
  worldName: string;
  world: World | null;
  userInput?: string;
  loading: boolean;
  error: string | null;
  messagesLoading: boolean;
  isSending: boolean;
  isWaiting: boolean;
  selectedSettingsTarget: 'world' | 'agent' | 'chat' | null;
  selectedAgent: Agent | null;
  activeAgent: { spriteIndex: number; name: string } | null;

  // Agent edit state
  showAgentEdit: boolean;
  agentEditMode: 'create' | 'edit' | 'delete';
  selectedAgentForEdit: Agent | null;

  // World edit state  
  showWorldEdit: boolean;
  worldEditMode: 'create' | 'edit' | 'delete';
  selectedWorldForEdit: World | null;

  // Chat management state
  currentChat: Chat | null;
  chatToDelete: Chat | null;

  // SSE state (required overrides)
  connectionStatus: string;
  needScroll: boolean;
}

// ========================================
// SSE EVENT INTERFACES
// ========================================

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

// ========================================
// API REQUEST INTERFACES
// ========================================

export interface ApiRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  [key: string]: any;
}

