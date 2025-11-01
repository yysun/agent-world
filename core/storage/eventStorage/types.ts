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
