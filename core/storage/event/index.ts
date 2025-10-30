/**
 * Event Storage Factory
 * 
 * Factory function to create event storage instances by type.
 * Follows the repository pattern used for world/agent storage.
 * 
 * Features:
 * - Creates storage instances based on type (sqlite, file, memory)
 * - Supports configuration for each storage backend
 * - Returns common EventStorage interface
 * 
 * Changes:
 * - 2025-10-30: Initial implementation
 */

import type { Database } from 'sqlite3';
import { EventStorage } from './types.js';
import { createMemoryEventStorage } from './memoryEventStorage.js';
import { createSQLiteEventStorage } from './sqliteEventStorage.js';
import { createFileEventStorage, FileEventStorageConfig } from './fileEventStorage.js';

/**
 * Event storage type
 */
export type EventStorageType = 'sqlite' | 'file' | 'memory';

/**
 * Event storage configuration
 */
export interface EventStorageConfig {
  type: EventStorageType;
  db?: Database; // For SQLite storage
  rootPath?: string; // For file storage
}

/**
 * Create event storage instance based on configuration
 */
export async function createEventStorage(config: EventStorageConfig): Promise<EventStorage> {
  switch (config.type) {
    case 'memory':
      return createMemoryEventStorage();

    case 'sqlite':
      if (!config.db) {
        throw new Error('Database instance required for SQLite event storage');
      }
      return createSQLiteEventStorage(config.db);

    case 'file':
      if (!config.rootPath) {
        throw new Error('Root path required for file event storage');
      }
      const fileConfig: FileEventStorageConfig = {
        rootPath: config.rootPath
      };
      return createFileEventStorage(fileConfig);

    default:
      throw new Error(`Unknown event storage type: ${config.type}`);
  }
}

/**
 * Create event storage from environment variables
 */
export async function createEventStorageFromEnv(db?: Database, rootPath?: string): Promise<EventStorage> {
  const type = (process.env.AGENT_WORLD_STORAGE_TYPE as EventStorageType) || 'memory';
  
  const config: EventStorageConfig = {
    type,
    db,
    rootPath
  };

  return createEventStorage(config);
}
