/**
 * Shared Type Definitions for Agent World
 * 
 * Purpose: Centralized type definitions shared between WebSocket server, TUI client, and web UI
 * 
 * Features:
 * - Core domain types (Message, Agent, World, Chat)
 * - WebSocket protocol types (WSMessage, WSMessageType, WSEvent)
 * - SSE streaming types (StreamStartData, StreamChunkData, etc.)
 * - Activity tracking types (AgentActivityStatus)
 * - Single source of truth for all clients
 * 
 * Location Rationale:
 * - Lives in ws/ folder alongside WebSocket server
 * - Imported by both Node.js (TUI, server) and browser (web) code
 * - No package.json needed - direct imports via relative paths
 * 
 * Import Pattern:
 * ```typescript
 * // From TUI:
 * import type { Message, WSMessage } from '../../ws/types.js';
 * 
 * // From web:
 * import type { Message, Agent } from '../../ws/types.js';
 * ```
 * 
 * Changes:
 * - 2025-11-02: Initial creation - extracted from web/src/types/ and ws/ws-server.ts
 */

// ========================================
// WEBSOCKET PROTOCOL TYPES
// ========================================

/**
 * WebSocket message types for client-server communication
 */
export type WSMessageType =
  | 'subscribe'      // Client subscribes to world events
  | 'unsubscribe'    // Client unsubscribes from world
  | 'message'        // Client sends message to world
  | 'command'        // Client sends CLI command
  | 'event'          // Server sends event update to client
  | 'crud'           // Server sends CRUD update to client (agent/chat/world changes)
  | 'status'         // Server sends processing status update
  | 'error'          // Server sends error message
  | 'ping'           // Heartbeat ping
  | 'pong';          // Heartbeat pong

/**
 * WebSocket message structure
 */
export interface WSMessage {
  type: WSMessageType;
  worldId?: string;
  chatId?: string;
  messageId?: string;
  seq?: number;
  payload?: any;
  error?: string;
  timestamp?: number;
}

/**
 * WebSocket event structure (for 'event' and 'crud' message types)
 */
export interface WSEvent {
  type: string;
  data: any;
  timestamp?: number;
  seq?: number;
}

// ========================================
// CORE DOMAIN TYPES
// ========================================

/**
 * LLM Provider types
 */
export type LLMProvider = 'openai' | 'anthropic' | 'google';

/**
 * Event types for activity tracking
 */
export type EventType = 'user' | 'agent' | 'system' | 'tool' | 'log' | 'world';

/**
 * Sender types for messages
 */
export type SenderType = 'user' | 'agent' | 'system';

/**
 * Agent message in memory
 */
export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  messageId?: string;
  replyToMessageId?: string;
}

/**
 * Message removal result
 */
export interface RemovalResult {
  removedCount: number;
  remaining: AgentMessage[];
}

/**
 * Log event for streaming log messages
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
 * World event for world activity and system events
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
 * Tool execution metadata
 */
export interface ToolExecution {
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
}

/**
 * Message interface - shared between web UI and TUI
 */
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
  replyToMessageId?: string;
  role?: string;
  userEntered?: boolean;
  fromAgentId?: string;
  ownerAgentId?: string;
  seenByAgents?: string[];
  logEvent?: LogEvent;
  worldEvent?: WorldEvent;
  isToolEvent?: boolean;
  isLogExpanded?: boolean;
  toolEventType?: 'start' | 'progress' | 'result' | 'error';
  toolExecution?: ToolExecution;
  expandable?: boolean;
  resultPreview?: string;
}

/**
 * Agent interface - shared between web UI and TUI
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
  createdAt?: Date;
  lastActive?: Date;
  llmCallCount: number;
  lastLLMCall?: Date;
  memory: AgentMessage[];
  description?: string;
  spriteIndex?: number;
  messageCount?: number;
}

/**
 * Chat interface
 */
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

/**
 * World interface - shared between web UI and TUI
 */
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
  llmCallLimit?: number;
}

// ========================================
// ACTIVITY TRACKING TYPES
// ========================================

/**
 * Agent activity status for real-time UI updates
 */
export interface AgentActivityStatus {
  agentId: string;
  message: string;
  phase: 'thinking' | 'tool-start' | 'tool-progress' | 'tool-result' | 'tool-error';
  activityId: number | null;
  toolName?: string;
  updatedAt: number;
}

// ========================================
// SSE STREAMING TYPES
// ========================================

/**
 * Stream start event data
 */
export interface StreamStartData {
  messageId: string;
  sender: string;
  worldName?: string;
}

/**
 * Stream chunk event data
 */
export interface StreamChunkData {
  messageId: string;
  sender: string;
  content: string;
  isAccumulated: boolean;
  worldName?: string;
}

/**
 * Stream end event data
 */
export interface StreamEndData {
  messageId: string;
  sender: string;
  content: string;
  worldName?: string;
}

/**
 * Stream error event data
 */
export interface StreamErrorData {
  messageId: string;
  sender: string;
  error: string;
  worldName?: string;
}

// ========================================
// SUBSCRIPTION TYPES
// ========================================

/**
 * Replay options for event subscription
 */
export type ReplayFrom = 'beginning' | number;

/**
 * Subscription options
 */
export interface SubscriptionOptions {
  worldId: string;
  chatId: string | null;
  replayFrom?: ReplayFrom;
}

/**
 * Enqueue message options
 */
export interface EnqueueOptions {
  worldId: string;
  chatId: string | null;
  content: string;
  sender?: string;
}
