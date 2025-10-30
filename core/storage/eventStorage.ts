/**
 * Event Storage Interface and Factory
 * 
 * Provides unified interface for persistent event storage across different backends.
 * Supports SQLite, file-based JSON, and in-memory storage implementations.
 * 
 * Features:
 * - Type-safe event storage operations
 * - Storage backend selection via factory
 * - Event querying by world and chat
 * - Cascade deletion support
 * - JSON serialization for payload and metadata
 * 
 * Implementation:
 * - SQLite: Database-backed with foreign key constraints
 * - File: JSON files per world+chat combination
 * - Memory: In-memory Map for tests and ephemeral usage
 */

/**
 * Represents a stored event
 */
export interface StoredEvent {
  id?: number;
  worldId: string;
  chatId: string;
  seq: number;
  type: string;
  payload?: any;
  meta?: any;
  createdAt?: Date;
}

/**
 * Event storage interface
 */
export interface EventStorage {
  /**
   * Save a single event
   */
  saveEvent(event: StoredEvent): Promise<void>;

  /**
   * Save multiple events in batch
   */
  saveEvents(events: StoredEvent[]): Promise<void>;

  /**
   * Get events by world and chat
   */
  getEventsByWorldAndChat(worldId: string, chatId: string, options?: {
    limit?: number;
    offset?: number;
    afterSeq?: number;
  }): Promise<StoredEvent[]>;

  /**
   * Delete all events for a specific world and chat
   */
  deleteEventsByWorldAndChat(worldId: string, chatId: string): Promise<number>;

  /**
   * Close/cleanup storage resources
   */
  close?(): Promise<void>;
}

/**
 * Storage type options
 */
export type EventStorageType = 'sqlite' | 'file' | 'memory';

/**
 * Configuration for event storage
 */
export interface EventStorageConfig {
  type: EventStorageType;
  rootPath?: string;
  sqliteDb?: any; // Database instance for SQLite
}

/**
 * Factory to create event storage by type
 */
export async function createEventStorage(config: EventStorageConfig): Promise<EventStorage> {
  switch (config.type) {
    case 'sqlite': {
      const { createSQLiteEventStorage } = await import('./sqliteEventStorage.js');
      if (!config.sqliteDb) {
        throw new Error('SQLite database instance required for sqlite storage type');
      }
      return createSQLiteEventStorage(config.sqliteDb);
    }
    case 'file': {
      const { createFileEventStorage } = await import('./fileEventStorage.js');
      const rootPath = config.rootPath || './data/events';
      return createFileEventStorage(rootPath);
    }
    case 'memory': {
      const { createMemoryEventStorage } = await import('./memoryEventStorage.js');
      return createMemoryEventStorage();
    }
    default:
      throw new Error(`Unknown event storage type: ${config.type}`);
  }
}
