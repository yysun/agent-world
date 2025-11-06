/**
 * TUI Type Definitions - Adapted from Web Frontend
 * 
 * Features:
 * - Core data structures for TUI (Message, Agent, World, Chat)
 * - WebSocket event types for real-time communication
 * - Tool approval system types (ApprovalRequest, ApprovalResponse, ApprovalState)
 * - Removed UI-specific fields from web frontend (spriteIndex, messageCount, etc.)
 * - Focused on data and communication types only
 * 
 * Adapted from: web/src/types/index.ts
 * Changes:
 * - Removed UI-specific Agent fields: spriteIndex, messageCount
 * - Removed UI-specific Message fields: expandable, resultPreview
 * - Kept core data structures and event types
 * - Added WebSocket-specific types
 * - Phase 7: Added tool approval system types (ApprovalRequest, ApprovalResponse, ApprovalState)
 * 
 * Created: 2025-11-01 - Phase 0: Code Extraction from Web Frontend
 * Updated: Phase 7 - Tool approval system integration
 */

// ========================================
// CORE DATA INTERFACES
// ========================================

// Message Interface - simplified for TUI
export interface Message {
  messageId: string;
  sender: string;
  content: string;
  timestamp: Date;
  type?: string;
  role?: string;
  replyToMessageId?: string;
  userEntered?: boolean;
  fromAgentId?: string;
  ownerAgentId?: string;
  seenByAgents?: string[];
  isHistorical?: boolean;

  // Streaming state
  isStreaming?: boolean;
  hasError?: boolean;
  errorMessage?: string;

  // Event types
  logEvent?: LogEvent;
  worldEvent?: WorldEvent;

  // Tool execution
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
}

// Agent Message (from core types)
export interface AgentMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  messageId?: string;
  replyToMessageId?: string;
}

// Agent Interface - core fields only
export interface Agent {
  id: string;
  name: string;
  type: string;
  status?: 'active' | 'inactive' | 'error';
  provider: string;
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
}

// World Interface
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

// Chat Interface
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
// EVENT INTERFACES
// ========================================

// Log Event Interface
export interface LogEvent {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  category: string;
  message: string;
  timestamp: string;
  data?: any;
  messageId: string;
}

// World Event Interface
export interface WorldEvent {
  type: 'world' | 'system';
  category: string;
  message: string;
  timestamp: string;
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  data?: any;
  messageId: string;
}

// Event Type Enum
export type EventType =
  | 'message'
  | 'sse'
  | 'world'
  | 'log'
  | 'system'
  | 'approval';

// Sender Type Enum
export type SenderType =
  | 'human'
  | 'agent'
  | 'system';

// ========================================
// APPROVAL INTERFACES
// ========================================

// Approval decision types
export type ApprovalDecision = 'approve' | 'deny';
export type ApprovalScope = 'once' | 'session';

// Tool approval request data
export interface ApprovalRequest {
  toolName: string;
  toolArgs: object;
  message: string;
  options: string[];
  requestId: string;
  toolCallId: string; // Original tool_call.id from OpenAI protocol (for tool result response)
  agentId?: string;
}

// Approval decision response
export interface ApprovalResponse {
  requestId: string;
  decision: ApprovalDecision;
  scope: ApprovalScope;
}

// Approval state for UI
export interface ApprovalState {
  isShowingApproval: boolean;
  currentRequest: ApprovalRequest | null;
}

// ========================================
// STREAMING EVENT INTERFACES
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
