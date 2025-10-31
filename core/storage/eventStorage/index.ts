/**
 * Event Storage Factory
 * 
 * Exports factory functions and types for creating event storage backends.
 * Provides a simple API to create the appropriate storage backend based on configuration.
 * 
 * Supported Backends:
 * - SQLite: Production-ready persistent storage with transactions and foreign keys
 * - Memory: Fast in-memory storage for tests and development
 * - File: File-backed JSONL storage for simple persistence needs
 * 
 * Usage:
 * ```typescript
 * import { createMemoryEventStorage } from './storage/eventStorage';
 * const storage = createMemoryEventStorage();
 * 
 * import { createSQLiteEventStorage } from './storage/eventStorage';
 * const storage = await createSQLiteEventStorage(db);
 * 
 * import { createFileEventStorage } from './storage/eventStorage';
 * const storage = createFileEventStorage({ baseDir: './data/events' });
 * ```
 */

// Export types
export type {
  StoredEvent,
  GetEventsOptions,
  EventStorage
} from './types.js';

// Export factory functions
export { createSQLiteEventStorage } from './sqliteEventStorage.js';
export { createMemoryEventStorage } from './memoryEventStorage.js';
export { createFileEventStorage } from './fileEventStorage.js';
export type { FileEventStorageConfig } from './fileEventStorage.js';

// Export classes for direct instantiation if needed
export { MemoryEventStorage } from './memoryEventStorage.js';
export { FileEventStorage } from './fileEventStorage.js';
