/**
 * Event Storage Types
 * 
 * Type definitions for event storage implementations.
 * Supports persisting events emitted by world emitters keyed by worldId and chatId.
 * 
 * Features:
 * - EventRecord: Core event data structure with sequence numbers
 * - EventQueryOpts: Query options for filtering and pagination
 * - EventStorage: Common interface for all storage backends
 * 
 * Changes:
 * - 2025-10-30: Initial implementation for event persistence
 */

/**
 * Event record stored in the database/file
 */
export interface EventRecord {
  id: string;
  worldId: string;
  chatId: string | null;
  seq: number;
  type: string;
  payload: any;
  meta?: any;
  createdAt: Date;
}

/**
 * Query options for retrieving events
 */
export interface EventQueryOpts {
  worldId: string;
  chatId?: string | null;
  type?: string;
  limit?: number;
  offset?: number;
  startSeq?: number;
  endSeq?: number;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Common interface for all event storage backends
 */
export interface EventStorage {
  /**
   * Save a single event
   */
  saveEvent(event: Omit<EventRecord, 'id' | 'seq' | 'createdAt'>): Promise<EventRecord>;

  /**
   * Save multiple events in a batch (with transaction support)
   */
  saveEvents(events: Array<Omit<EventRecord, 'id' | 'seq' | 'createdAt'>>): Promise<EventRecord[]>;

  /**
   * Get events by world and optionally chat
   */
  getEventsByWorldAndChat(opts: EventQueryOpts): Promise<EventRecord[]>;

  /**
   * Delete all events for a world+chat combination
   */
  deleteEventsByWorldAndChat(worldId: string, chatId: string | null): Promise<number>;

  /**
   * Get the next sequence number for a world+chat combination
   */
  getNextSeq(worldId: string, chatId: string | null): Promise<number>;

  /**
   * Close/cleanup the storage (for DB connections, file handles, etc.)
   */
  close?(): Promise<void>;
}
