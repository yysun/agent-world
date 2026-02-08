/**
 * Core type definitions for the Agent World system.
 *
 * Features:
 * - Agent configuration with comprehensive LLM provider support and memory management
 * - Event system with strict payload typing and union types for type safety
 * - AI SDK compatible chat messages with utility functions for seamless integration
 * - Storage interfaces and world-specific file operations with EventEmitter integration
 * - Comprehensive LLM provider enumeration (OpenAI, Anthropic, Azure, Google, XAI, Ollama)
 */

import { type EventEmitter } from 'events';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  createdAt?: Date;
  // Tool call support for function calling
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string; // For tool response messages
}

export interface AgentMessage extends ChatMessage {
  /**
   * Unique message identifier. REQUIRED for all new messages.
   * Used for message editing, threading, and deduplication.
   * 
   * @required for new messages (as of version 6)
   * @optional only for legacy data (pre-version 6)
   * @example "msg-1234567890-abc"
   */
  messageId?: string;

  /**
   * Parent message identifier for threading support.
   * Links this message to the message it's replying to.
   * 
   * Threading Semantics:
   * - Assistant messages: Set to triggering user/agent message ID
   * - Incoming user messages: Usually null/undefined (start of conversation)
   * - Tool results: Set to assistant message that made tool call
   * - System messages: Usually null/undefined
   * 
   * Rules:
   * - MUST NOT equal messageId (no self-references)
   * - MUST reference existing message in conversation
   * - MUST NOT create circular chains (A→B→C→A)
   * 
   * @example
   * // Human asks question (root message)
   * { messageId: "msg-1", replyToMessageId: undefined, role: "user", content: "Hello?" }
   * 
   * // Agent responds (reply message)
   * { messageId: "msg-2", replyToMessageId: "msg-1", role: "assistant", content: "Hi!" }
   * 
   * // Multi-level thread
   * { messageId: "msg-3", replyToMessageId: "msg-2", role: "user", content: "Thanks!" }
   * 
   * @since version 7
   */
  replyToMessageId?: string;

  sender?: string; // Custom field - removed before LLM calls
  chatId?: string | null; // Chat session ID for memory filtering
  agentId?: string; // Agent ID for identifying message source

  /**
   * Tool call completion tracking for approval requests/responses
   * Maps tool_call_id to completion status and result
   * 
   * Usage:
   * - Approval requests: Mark as incomplete when tool_calls sent
   * - Approval responses: Mark as complete with decision/scope
   * - Server is source of truth, client reads this status
   * 
   * @example
   * // Approval request (incomplete)
   * {
   *   "approval_123": {
   *     complete: false,
   *     result: null
   *   }
   * }
   * 
   * // Approval response (complete)
   * {
   *   "approval_123": {
   *     complete: true,
   *     result: {
   *       decision: "approve",
   *       scope: "session",
   *       timestamp: "2025-11-08T16:30:00.000Z"
   *     }
   *   }
   * }
   */
  toolCallStatus?: Record<string, { complete: boolean; result: any | null }>;
}

export interface ToolResultData {
  tool_call_id: string;
  decision?: string;
  scope?: string;
  choice?: string;
  toolName?: string;
  toolArgs?: any;
  workingDirectory?: string;
  [key: string]: any;
}

// Agent Types
export interface Agent {
  id: string; // kebab-case of agent name
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
}

// deprecated
export interface MessageData {
  name: string;
  payload: any;
  id: string;
  sender?: string;
  content?: string;
  agentName?: string;
}

// Event System Types - Enhanced with Mapped Types

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

export interface WorldEventPayload {
  action: string;
  worldId?: string;
  agentId?: string;
  data?: any;
}

/**
 * Event payload mapping for type-safe event handling.
 * Maps each EventType to its corresponding payload type using proper core event interfaces.
 * 
 * This provides compile-time validation when using typed event utilities while
 * maintaining zero runtime overhead for direct EventEmitter usage.
 * 
 * @example
 * // Type-safe handler with payload validation
 * function handleEvent<T extends EventType>(
 *   eventType: T, 
 *   payload: EventPayloadMap[T]
 * ) {
 *   // TypeScript knows the exact payload structure
 * }
 * 
 * @since 2025-10-30 - Updated to use core World event types
 */
export type EventPayloadMap = {
  /** Message events use WorldMessageEvent for complete structure */
  [EventType.MESSAGE]: WorldMessageEvent;

  /** System events use WorldSystemEvent for internal notifications */
  [EventType.SYSTEM]: WorldSystemEvent;

  /** SSE events use WorldSSEEvent for streaming data */
  [EventType.SSE]: WorldSSEEvent;

  /** World/tool events use WorldToolEvent for agent behavioral tracking */
  [EventType.WORLD]: WorldToolEvent;

  /** CRUD events use WorldCRUDEvent for configuration changes */
  [EventType.CRUD]: WorldCRUDEvent;
};

/**
 * Core event types for Agent World system EventEmitter.
 * 
 * These enums provide type-safe alternatives to string literals for event emission
 * and subscription. Each enum value maps exactly to the string used by EventEmitter
 * to maintain full backward compatibility.
 * 
 * @example
 * // Type-safe event emission (recommended)
 * world.eventEmitter.emit(EventType.MESSAGE, messageEvent);
 * 
 * // Traditional string usage (still supported)
 * world.eventEmitter.emit('message', messageEvent);
 * 
 * // Optional typed bridge for enhanced type safety
 * const bridge = createTypedEventBridge(world);
 * bridge.emit(EventType.MESSAGE, messageEvent); // Full payload validation
 * 
 * @since 2025-10-30
 */
export enum EventType {
  /** World channel - general world events, tool usage, and system messages */
  WORLD = 'world',
  /** Message channel - user and agent messages */
  MESSAGE = 'message',
  /** SSE channel - streaming LLM responses */
  SSE = 'sse',
  /** System events for internal notifications */
  SYSTEM = 'system',
  /** CRUD events - agent, chat, and world configuration changes */
  CRUD = 'crud'
}

export enum SenderType {
  SYSTEM = 'system',
  WORLD = 'world',
  AGENT = 'agent',
  HUMAN = 'human'
}

// Agent Operation Types - Simplified Parameter Interfaces

/**
 * Agent creation parameters - includes all properties needed for new agents
 */
export interface CreateAgentParams {
  id?: string; // Optional - will be auto-generated from name using toKebabCase if not provided
  name: string;
  type: string;
  provider: LLMProvider;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Agent update parameters - partial for flexible updates with additional status field
 */
export interface UpdateAgentParams extends Partial<Omit<CreateAgentParams, 'id'>> {
  status?: 'active' | 'inactive' | 'error';
}

export interface Chat {
  id: string; // nanoid
  worldId: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

/**
 * World chat for full state capture
 */
export interface WorldChat {
  world: World;
  agents: Agent[];
  messages: AgentMessage[];
  metadata: {
    capturedAt: Date;
    version: string;
    totalMessages: number;
    activeAgents: number;
  };
}

/**
 * Chat creation parameters
 */
export interface CreateChatParams {
  name?: string;
  description?: string;
  captureChat?: boolean;
}

/**
 * Chat update parameters
 */
export interface UpdateChatParams extends Partial<Omit<CreateChatParams, 'captureChat'>> {
  tags?: string[];
  messageCount?: number; // For autosave updates
}

/**
 * Message edit result tracking
 */
export interface RemovalResult {
  success: boolean;
  messageId: string; // Original messageId that was removed
  totalAgents: number;
  processedAgents: string[];
  failedAgents: Array<{ agentId: string; error: string }>;
  messagesRemovedTotal: number;
  requiresRetry: boolean;
  // Resubmission status
  resubmissionStatus: 'success' | 'failed' | 'skipped';
  resubmissionError?: string;
  newMessageId?: string; // messageId of resubmitted message
}

/**
 * Edit error log for troubleshooting
 */
export interface EditErrorLog {
  worldId: string;
  messageId: string;
  chatId: string;
  timestamp: Date;
  operation: 'removal' | 'resubmission';
  failedAgents: Array<{ agentId: string; error: string }>;
  retryCount: number;
}

/**
 * Chat list info for efficient display
 */
// ...existing code...

// World Management Types - Simplified Parameter Interfaces

/**
 * World creation parameters
 */
export interface CreateWorldParams {
  name: string;
  description?: string | null;
  turnLimit?: number;
  chatLLMProvider?: LLMProvider; // For chat summarization
  chatLLMModel?: string; // For chat summarization
  mcpConfig?: string | null; // MCP configuration JSON string
}

/**
 * World update parameters - partial for flexible updates
 */
export interface UpdateWorldParams extends Partial<CreateWorldParams> {
  currentChatId?: string | null;
}

/**
 * Serializable world data for storage (flat structure, no EventEmitter, no agents Map)
 */
export interface World {
  id: string;
  name: string;
  description?: string | null;
  turnLimit: number;
  chatLLMProvider?: string; // For chat summarization
  chatLLMModel?: string; // For chat summarization
  currentChatId?: string | null; // Track active chat session
  mcpConfig?: string | null; // MCP configuration JSON string
  isProcessing?: boolean; // Flag to prevent edits during agent processing
  createdAt: Date;
  lastUpdated: Date;
  totalAgents: number;
  totalMessages: number;

  eventEmitter: EventEmitter;
  agents: Map<string, Agent>;
  chats: Map<string, Chat>;
  eventStorage?: any; // EventStorage interface - optional for backward compatibility
  _eventPersistenceCleanup?: () => void; // Internal cleanup function for event listeners
  _activityListenerCleanup?: () => void; // Internal cleanup function for activity listener
}

// Unified Storage Interface - Consolidated from StorageManager and StorageAPI
export interface StorageAPI {
  // World operations
  saveWorld(worldData: World): Promise<void>;
  loadWorld(worldId: string): Promise<World | null>;
  deleteWorld(worldId: string): Promise<boolean>;
  listWorlds(): Promise<World[]>;
  worldExists(worldId: string): Promise<boolean>;

  getMemory(worldId: string, chatId?: string | null): Promise<AgentMessage[]>;

  // Agent operations
  saveAgent(worldId: string, agent: Agent): Promise<void>;
  loadAgent(worldId: string, agentId: string): Promise<Agent | null>;
  loadAgentWithRetry(worldId: string, agentId: string, options?: any): Promise<Agent | null>;
  deleteAgent(worldId: string, agentId: string): Promise<boolean>;
  listAgents(worldId: string): Promise<Agent[]>;
  agentExists(worldId: string, agentId: string): Promise<boolean>;
  saveAgentMemory(worldId: string, agentId: string, memory: AgentMessage[]): Promise<void>;
  archiveMemory(worldId: string, agentId: string, memory: AgentMessage[]): Promise<void>;
  deleteMemoryByChatId(worldId: string, chatId: string): Promise<number>;

  // Batch operations
  saveAgentsBatch(worldId: string, agents: Agent[]): Promise<void>;
  loadAgentsBatch(worldId: string, agentIds: string[]): Promise<Agent[]>;

  // Chat history operations
  saveChatData(worldId: string, chat: Chat): Promise<void>;
  loadChatData(worldId: string, chatId: string): Promise<Chat | null>;
  deleteChatData(worldId: string, chatId: string): Promise<boolean>;
  listChats(worldId: string): Promise<Chat[]>;
  updateChatData(worldId: string, chatId: string, updates: UpdateChatParams): Promise<Chat | null>;

  // Chat operations
  saveWorldChat(worldId: string, chatId: string, chat: WorldChat): Promise<void>;
  loadWorldChat(worldId: string, chatId: string): Promise<WorldChat | null>;
  loadWorldChatFull(worldId: string, chatId: string): Promise<WorldChat | null>;
  restoreFromWorldChat(worldId: string, chat: WorldChat): Promise<boolean>;

  // Integrity operations
  validateIntegrity(worldId: string, agentId?: string): Promise<boolean>;
  repairData(worldId: string, agentId?: string): Promise<boolean>;
}

// Legacy alias for backward compatibility - will be removed in future versions
export interface StorageManager extends StorageAPI { }

// LLM Provider Types
export enum LLMProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  AZURE = 'azure',
  GOOGLE = 'google',
  XAI = 'xai',
  OPENAI_COMPATIBLE = 'openai-compatible',
  OLLAMA = 'ollama'
};

/**
 * Unified LLM response structure
 * All providers return this type (never raw strings or mixed objects)
 * 
 * @since Phase 1 of provider refactoring (2025-11-09)
 */
export interface LLMResponse {
  /**
   * Response type discriminator
   */
  type: 'text' | 'tool_calls';

  /**
   * Text content (for type='text' responses)
   */
  content?: string;

  /**
   * Tool calls requested by LLM (for type='tool_calls' responses)
   */
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string; // JSON string
    };
  }>;

  /**
   * Original assistant message for memory storage
   * CRITICAL: Must include full tool_calls array for approval flow
   */
  assistantMessage: {
    role: 'assistant';
    content: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
  };

  /**
   * Token usage metadata (optional)
   */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// World EventEmitter Types

/**
 * World message event data structure for World.eventEmitter
 */
export interface WorldMessageEvent {
  content: string;
  sender: string;
  timestamp: Date;
  messageId: string;
  chatId?: string | null;
  replyToMessageId?: string;  // For message threading
}

/**
 * World SSE event data structure for World.eventEmitter
 * Note: Tool events have been migrated to world channel (see WorldToolEvent)
 */
export interface WorldSSEEvent {
  agentName: string;
  type: 'start' | 'chunk' | 'end' | 'error' | 'log';
  content?: string;
  error?: string;
  messageId: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  logEvent?: {
    level: string;
    category: string;
    message: string;
    timestamp: string;
    data?: any;
  };
}

/**
 * World CRUD event data structure for World.eventEmitter
 * Used to broadcast agent, chat, and world configuration changes to subscribed clients
 */
export interface WorldCRUDEvent {
  operation: 'create' | 'update' | 'delete';
  entityType: 'agent' | 'chat' | 'world';
  entityId: string;
  entityData?: any; // Full entity data for create/update, null for delete
  timestamp: Date;
  chatId?: string | null; // For chat-specific operations
}

/**
 * World tool event data structure for agent behavioral events
 * Emitted on world channel to track agent actions (tool execution)
 */
export interface WorldToolEvent {
  agentName: string;
  type: 'tool-start' | 'tool-result' | 'tool-error' | 'tool-progress';
  messageId: string;
  toolExecution: {
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

export interface WorldSystemEvent {
  content: any; // Can be string or object depending on usage
  timestamp: Date;
  messageId: string;
  chatId?: string | null; // Optional chat context for system events
}

// Typed Event Bridge Utilities

/**
 * Typed event bridge for enhanced type safety with EventEmitter.
 * 
 * Provides optional type-safe wrappers around World.eventEmitter while maintaining
 * zero runtime overhead. All functions delegate directly to EventEmitter methods.
 * 
 * @example
 * const bridge = createTypedEventBridge(world);
 * 
 * // Type-safe emission with payload validation
 * bridge.emit(EventType.MESSAGE, {
 *   content: 'Hello',
 *   sender: 'user',
 *   timestamp: new Date(),
 *   messageId: 'msg-123'
 * });
 * 
 * // Type-safe subscription
 * const unsubscribe = bridge.on(EventType.MESSAGE, (payload) => {
 *   // TypeScript knows payload is WorldMessageEvent
 *   console.log('Message:', payload.content);
 * });
 * 
 * @since 2025-10-30
 */
export interface TypedEventBridge {
  /**
   * Emit a typed event with payload validation.
   * Zero overhead - delegates directly to EventEmitter.emit()
   */
  emit<T extends EventType>(
    eventType: T,
    payload: EventPayloadMap[T]
  ): boolean;

  /**
   * Subscribe to typed events with payload validation.
   * Zero overhead - delegates directly to EventEmitter.on()
   */
  on<T extends EventType>(
    eventType: T,
    handler: (payload: EventPayloadMap[T]) => void
  ): () => void;

  /**
   * Remove typed event subscription.
   * Zero overhead - delegates directly to EventEmitter.off()
   */
  off<T extends EventType>(
    eventType: T,
    handler: (payload: EventPayloadMap[T]) => void
  ): void;
}

/**
 * Zero-overhead typed event bridge implementation.
 * 
 * Optimized to achieve <0.1% overhead by using direct property assignment
 * instead of method dispatch. Binds EventEmitter methods directly to avoid
 * the overhead of wrapper method calls.
 * 
 * Performance: Target <0.1% overhead compared to raw EventEmitter usage.
 * Architecture: Direct property assignment eliminates method dispatch overhead.
 * 
 * @since 2025-10-30
 */
class TypedEventBridgeImpl implements TypedEventBridge {
  // Direct property assignments for zero-overhead delegation
  public readonly emit: <T extends EventType>(
    eventType: T,
    payload: EventPayloadMap[T]
  ) => boolean;

  public readonly on: <T extends EventType>(
    eventType: T,
    handler: (payload: EventPayloadMap[T]) => void
  ) => () => void;

  public readonly off: <T extends EventType>(
    eventType: T,
    handler: (payload: EventPayloadMap[T]) => void
  ) => void;

  constructor(eventEmitter: EventEmitter) {
    // Direct assignment avoids method dispatch overhead
    this.emit = eventEmitter.emit.bind(eventEmitter) as any;

    // For 'on', we need to return an unsubscribe function
    this.on = <T extends EventType>(
      eventType: T,
      handler: (payload: EventPayloadMap[T]) => void
    ) => {
      eventEmitter.on(eventType, handler);
      return () => eventEmitter.off(eventType, handler);
    };

    // Direct assignment for 'off'
    this.off = eventEmitter.off.bind(eventEmitter) as any;
  }
}

/**
 * Create a typed event bridge for enhanced type safety.
 * 
 * This utility provides optional type-safe wrappers around World.eventEmitter
 * while maintaining zero runtime overhead. Use this when you want compile-time
 * validation of event names and payload structures.
 * 
 * @param world - World instance with eventEmitter
 * @returns TypedEventBridge with type-safe emit/on/off methods
 * 
 * @example
 * const world = await getWorld('my-world');
 * const bridge = createTypedEventBridge(world);
 * 
 * // Compile-time validation of event type and payload
 * bridge.emit(EventType.MESSAGE, messageEvent);
 * 
 * // Original EventEmitter usage still works
 * world.eventEmitter.emit('message', messageEvent);
 * 
 * @since 2025-10-30
 */
export function createTypedEventBridge(world: World): TypedEventBridge {
  return new TypedEventBridgeImpl(world.eventEmitter);
}

/**
 * Validates message threading relationships
 * @throws Error if threading is invalid
 */
export function validateMessageThreading(
  message: AgentMessage,
  allMessages?: AgentMessage[]
): void {
  // Check self-reference
  if (message.replyToMessageId && message.replyToMessageId === message.messageId) {
    throw new Error(`Message ${message.messageId || 'unknown'} cannot reply to itself`);
  }

  // Check parent exists (if allMessages provided)
  if (message.replyToMessageId && allMessages) {
    const parent = allMessages.find(m => m.messageId === message.replyToMessageId);
    if (!parent) {
      console.warn(`Parent message ${message.replyToMessageId} not found for message ${message.messageId || 'unknown'}`);
      // Don't throw - parent might be in different chat or deleted
    }

    // Check for circular references (limited depth check)
    const visited = new Set<string>();
    let current: string | undefined = message.replyToMessageId;
    let depth = 0;
    const MAX_DEPTH = 100;

    while (current && depth < MAX_DEPTH) {
      if (visited.has(current)) {
        throw new Error(`Circular reference detected in thread: ${Array.from(visited).join(' → ')} → ${current}`);
      }
      visited.add(current);

      const parent = allMessages.find(m => m.messageId === current);
      current = parent?.replyToMessageId;
      depth++;
    }

    if (depth >= MAX_DEPTH) {
      throw new Error(`Thread depth exceeds maximum (${MAX_DEPTH})`);
    }
  }
}



