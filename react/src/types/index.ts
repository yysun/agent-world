/**
 * Type Definitions - Comprehensive types for React frontend
 * 
 * Source: Enhanced from web/src/types/index.ts (AppRun frontend)
 * Adapted for: React 19.2.0
 * 
 * Features:
 * - UI-specific types with streaming states and tool events
 * - SSE event handling types
 * - API request/response types
 * - Comprehensive Message, Agent, World, Chat interfaces
 * - Tool approval flow types
 * 
 * Changes:
 * - 2025-11-12: Enhanced with web frontend types for feature parity
 * - 2025-11-12: Removed WebSocket-related types, using REST API now
 * - 2025-11-03: Initial type definitions
 */

// Re-export core types for consistency
export type LLMProvider = 'openai' | 'anthropic' | 'azure-openai' | 'google' | 'xai' | 'ollama';
export type EventType = string;
export type SenderType = 'user' | 'assistant' | 'system' | 'tool';

// ========================================
// UI DATA INTERFACES
// ========================================

/**
 * Log Event Interface - for streaming log messages
 */
export interface LogEvent {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  category: string;
  message: string;
  timestamp: string;
  data?: any;
  messageId: string;
}

/**
 * World Event Interface - for world activity and system events
 */
export interface WorldEvent {
  type: 'world' | 'system';
  category: string;
  message: string;
  timestamp: string;
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  data?: any;
  messageId: string;
}

/**
 * Approval Request - tool approval UI state
 */
export interface ApprovalRequest {
  toolCallId: string;
  originalToolCall?: any;
  toolName: string;
  toolArgs: Record<string, unknown>;
  message: string;
  options: string[];
  agentId?: string;
}

/**
 * Message Interface - comprehensive UI message with streaming and tool support
 */
export interface Message {
  id: string;
  type: string;
  sender: string;
  text: string;
  createdAt: Date;
  worldName?: string;

  // Streaming states
  isStreaming?: boolean;
  hasError?: boolean;
  errorMessage?: string;

  // Backend fields
  messageId?: string;
  replyToMessageId?: string;
  role?: string;
  chatId?: string;
  worldId?: string;

  // UI metadata
  userEntered?: boolean;
  fromAgentId?: string;
  ownerAgentId?: string;
  seenByAgents?: string[];

  // Event types
  logEvent?: LogEvent;
  worldEvent?: WorldEvent;

  // Tool execution events
  isToolEvent?: boolean;
  isLogExpanded?: boolean;
  toolEventType?: 'start' | 'progress' | 'result' | 'error';
  toolExecution?: {
    toolName: string;
    toolCallId: string;
    sequenceId?: string;
    duration?: number;
    input?: any;
    result?: any;
    resultType?: 'string' | 'object' | 'array' | 'null';
    resultSize?: number;
    error?: string;
    metadata?: {
      serverName?: string;
      transport?: string;
      isStreaming?: boolean;
    };
  };
  expandable?: boolean;
  resultPreview?: string;

  // Tool approval
  isToolCallRequest?: boolean;
  isToolCallResponse?: boolean;
  toolCallData?: {
    toolCallId: string;
    originalToolCall?: any;
    toolName: string;
    toolArgs: Record<string, unknown>;
    approvalMessage?: string;
    approvalOptions?: string[];
    approvalDecision?: 'approve' | 'deny';
    approvalScope?: 'once' | 'session' | 'none';
    agentId?: string;
  };

  // Legacy compatibility
  content?: string;
  timestamp?: string;
}

/**
 * Agent Interface - with UI extensions
 */
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
  createdAt?: Date | string;
  lastActive?: Date;
  llmCallCount?: number;
  lastLLMCall?: Date;
  description?: string;

  // UI-specific
  spriteIndex?: number;
  messageCount?: number;
}

/**
 * World Interface - matches server serialization
 */
export interface World {
  id: string;
  name: string;
  description?: string;
  turnLimit?: number;
  chatLLMProvider?: string;
  chatLLMModel?: string;
  currentChatId?: string | null;
  mcpConfig?: string | null;
  agents?: Agent[];
  chats?: Chat[];
  llmCallLimit?: number;
  createdAt?: string;
}

/**
 * Chat Interface - with metadata
 */
export interface Chat {
  id: string;
  name: string;
  description?: string;
  createdAt: Date | string;
  updatedAt?: Date;
  messageCount?: number;
  summary?: string;
  tags?: string[];
}

// ========================================
// SSE EVENT INTERFACES
// ========================================

/**
 * SSE Stream Start Event
 */
export interface StreamStartData {
  messageId: string;
  sender: string;
  worldName?: string;
}

/**
 * SSE Stream Chunk Event
 */
export interface StreamChunkData {
  messageId: string;
  sender: string;
  content: string;
  isAccumulated: boolean;
  tool_calls?: Array<{
    id: string;
    function?: {
      name: string;
      arguments?: string;
    };
  }>;
  worldName?: string;
}

/**
 * SSE Stream End Event
 */
export interface StreamEndData {
  messageId: string;
  sender: string;
  content: string;
  worldName?: string;
}

/**
 * SSE Stream Error Event
 */
export interface StreamErrorData {
  messageId: string;
  sender: string;
  error: string;
  worldName?: string;
}

/**
 * Generic Agent Event (for backward compatibility)
 */
export interface AgentEvent {
  id: string;
  type: string;
  worldId: string;
  chatId?: string;
  seq?: number;
  payload: any;
  meta?: any;
  createdAt: string;
  timestamp: number;
}

// ========================================
// API REQUEST INTERFACES
// ========================================

/**
 * API Request Options
 */
export interface ApiRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  [key: string]: any;
}

// Hook return types
export interface UseWorldDataReturn {
  worlds: World[];
  loading: boolean;
  error: Error | null;
  createWorld: (data: { name: string; description?: string }) => Promise<World>;
  updateWorld: (worldId: string, data: { name?: string; description?: string }) => Promise<World>;
  deleteWorld: (worldId: string) => Promise<void>;
  getWorld: (worldId: string) => Promise<World | null>;
  refetch: () => Promise<void>;
}

export interface UseAgentDataReturn {
  agents: Agent[];
  loading: boolean;
  error: Error | null;
  createAgent: (data: Partial<Agent>) => Promise<Agent>;
  updateAgent: (agentId: string, data: Partial<Agent>) => Promise<Agent>;
  deleteAgent: (agentId: string) => Promise<void>;
  getAgent: (agentId: string) => Promise<Agent | null>;
  refetch: () => Promise<void>;
}

export interface UseChatDataReturn {
  chats: Chat[];
  messages: Message[];
  loading: boolean;
  error: Error | null;
  sendMessage: (content: string, sender?: string) => Promise<void>;
  createChat: () => Promise<Chat>;
  deleteChat: (chatId: string) => Promise<void>;
  subscribeToChat: (chatId?: string) => Promise<void>;
  unsubscribeFromChat: () => Promise<void>;
  loadChatMessages: (chatId: string) => Promise<void>;
}
