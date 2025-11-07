/**
 * Event Storage Types and Interfaces
 * 
 * Defines the interface and types for persistent event storage across different backends.
 * Events are keyed by worldId and chatId, matching patterns used by existing world and agent storage.
 * 
 * Features:
 * - Type-safe event storage interface
 * - Support for sequence-based ordering within world/chat contexts
 * - Pagination and filtering capabilities
 * - Multiple backend implementations (SQLite, in-memory, file-backed)
 * 
 * Event Structure:
 * - id: Unique identifier (UUID)
 * - worldId: World context for the event
 * - chatId: Optional chat context (nullable)
 * - seq: Optional sequence number for ordering
 * - type: Event type (message, sse, tool, system, etc.)
 * - payload: Event-specific data as JSON
 * - meta: Metadata like timestamp, sender, etc.
 * - createdAt: Event creation timestamp
 */

export interface StoredEvent {
  id: string;
  worldId: string;
  chatId: string | null;
  seq?: number | null;
  type: string;
  payload: any;  // JSON serializable payload
  meta?: any;    // JSON serializable metadata
  createdAt: Date;
}

/**
 * Enhanced metadata for message events
 * All fields REQUIRED - no legacy support
 */
export interface MessageEventMetadata {
  // Core fields (REQUIRED)
  sender: string;
  chatId: string | null;

  // Agent Context (REQUIRED)
  ownerAgentIds: string[];         // Which agents have this in memory
  recipientAgentId: string | null; // Intended recipient (null = broadcast)
  originalSender: string | null;   // For cross-agent messages
  deliveredToAgents: string[];     // Who received it

  // Message Classification (REQUIRED)
  messageDirection: 'outgoing' | 'incoming' | 'broadcast';
  isMemoryOnly: boolean;           // Saved but no response triggered
  isCrossAgentMessage: boolean;    // Agent→agent communication
  isHumanMessage: boolean;         // Human→agents communication

  // Threading (REQUIRED for structure, null if not applicable)
  threadRootId: string | null;     // Root of conversation thread
  threadDepth: number;             // 0=root, 1=reply, etc.
  isReply: boolean;                // Has replyToMessageId
  hasReplies: boolean;             // Other messages reply to this (updated async)

  // Tool Approval (REQUIRED for tool calls)
  requiresApproval: boolean;
  approvalScope: 'once' | 'session' | 'always' | null;
  approvedAt: string | null;       // ISO timestamp
  approvedBy: string | null;
  deniedAt: string | null;         // ISO timestamp
  denialReason: string | null;

  // Performance (REQUIRED for agent messages, null for human)
  llmTokensInput: number | null;
  llmTokensOutput: number | null;
  llmLatency: number | null;
  llmProvider: string | null;
  llmModel: string | null;

  // UI State (REQUIRED)
  hasToolCalls: boolean;
  toolCallCount: number;
}

/**
 * Enhanced metadata for tool events
 */
export interface ToolEventMetadata {
  agentName: string;
  toolType: string;

  // Agent Context (REQUIRED)
  ownerAgentId: string;            // Which agent executed this
  triggeredByMessageId: string;    // What message caused this

  // Performance (REQUIRED)
  executionDuration: number;       // milliseconds
  resultSize: number;              // bytes
  wasApproved: boolean;
}

/**
 * Validation: All message events must have complete metadata
 */
export function validateMessageEventMetadata(meta: any): meta is MessageEventMetadata {
  return !!(
    meta &&
    typeof meta.sender === 'string' &&
    Array.isArray(meta.ownerAgentIds) &&
    typeof meta.messageDirection === 'string' &&
    typeof meta.isMemoryOnly === 'boolean' &&
    typeof meta.isCrossAgentMessage === 'boolean' &&
    typeof meta.isHumanMessage === 'boolean' &&
    typeof meta.threadDepth === 'number' &&
    typeof meta.isReply === 'boolean' &&
    typeof meta.hasReplies === 'boolean' &&
    typeof meta.requiresApproval === 'boolean' &&
    typeof meta.hasToolCalls === 'boolean' &&
    typeof meta.toolCallCount === 'number'
  );
}

export interface GetEventsOptions {
  /**
   * Get events with sequence number greater than this value
   */
  sinceSeq?: number;

  /**
   * Get events created after this timestamp
   */
  sinceTime?: Date;

  /**
   * Maximum number of events to return
   */
  limit?: number;

  /**
   * Order by sequence or time
   * Default: 'asc'
   */
  order?: 'asc' | 'desc';

  /**
   * Filter by event types
   */
  types?: string[];

  // Enhanced filtering (all events have this metadata)
  ownerAgentId?: string;        // Filter by agent ownership
  recipientAgentId?: string;    // Filter by recipient
  isMemoryOnly?: boolean;       // Only memory-only messages
  isCrossAgent?: boolean;       // Only cross-agent messages
  threadRootId?: string;        // Messages in specific thread
  hasToolCalls?: boolean;       // Only messages with tool calls
}

export interface EventStorage {
  /**
   * Save a single event to storage
   */
  saveEvent(event: StoredEvent): Promise<void>;

  /**
   * Save multiple events in a batch
   */
  saveEvents(events: StoredEvent[]): Promise<void>;

  /**
   * Get events for a specific world and chat
   */
  getEventsByWorldAndChat(
    worldId: string,
    chatId: string | null,
    options?: GetEventsOptions
  ): Promise<StoredEvent[]>;

  /**
   * Delete all events for a specific world and chat
   */
  deleteEventsByWorldAndChat(worldId: string, chatId: string | null): Promise<number>;

  /**
   * Delete all events for a specific world (all chats)
   */
  deleteEventsByWorld(worldId: string): Promise<number>;

  /**
   * Get the latest sequence number for a world/chat context
   * Returns 0 if no events exist
   */
  getLatestSeq(worldId: string, chatId: string | null): Promise<number>;

  /**
   * Get events within a specific sequence range (inclusive)
   */
  getEventRange(
    worldId: string,
    chatId: string | null,
    fromSeq: number,
    toSeq: number
  ): Promise<StoredEvent[]>;

  /**
   * Close/cleanup storage resources
   */
  close?(): Promise<void>;
}
