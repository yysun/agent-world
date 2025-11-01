/**
 * In-Memory Event Storage Implementation
 * 
 * Map-based event storage for tests and development environments.
 * Provides fast, in-memory event storage with support for sequence ordering and efficient queries.
 * 
 * Features:
 * - Fast Map-based storage organized by worldId and chatId
 * - Automatic sequence number generation per world/chat
 * - Support for time-based and sequence-based pagination
 * - Event type filtering
 * - No external dependencies
 * - Suitable for unit tests and browser environments
 * 
 * Implementation:
 * - Uses nested Maps for hierarchical organization: worldId -> chatId -> events[]
 * - Maintains sequence counters per world/chat combination
 * - Deep cloning for data isolation
 * - Efficient queries with Array methods
 */

import type { EventStorage, StoredEvent, GetEventsOptions } from './types.js';

/**
 * Generate a composite key for world/chat combination
 */
function getContextKey(worldId: string, chatId: string | null): string {
  return `${worldId}:${chatId ?? 'null'}`;
}

/**
 * Deep clone utility for data isolation
 */
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as T;
  }

  const clonedObj = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clonedObj[key] = deepClone(obj[key]);
    }
  }
  return clonedObj;
}

/**
 * In-memory event storage implementation
 */
export class MemoryEventStorage implements EventStorage {
  // Map of contextKey -> events array
  private events = new Map<string, StoredEvent[]>();

  // Map of contextKey -> next sequence number
  private seqCounters = new Map<string, number>();

  /**
   * Get the next sequence number for a world/chat context
   */
  private getNextSeq(worldId: string, chatId: string | null): number {
    const key = getContextKey(worldId, chatId);
    const current = this.seqCounters.get(key) || 0;
    const next = current + 1;
    this.seqCounters.set(key, next);
    return next;
  }

  /**
   * Get or create events array for a world/chat context
   */
  private getEventsArray(worldId: string, chatId: string | null): StoredEvent[] {
    const key = getContextKey(worldId, chatId);
    if (!this.events.has(key)) {
      this.events.set(key, []);
    }
    return this.events.get(key)!;
  }

  /**
   * Save a single event
   */
  async saveEvent(event: StoredEvent): Promise<void> {
    const eventsArray = this.getEventsArray(event.worldId, event.chatId);

    // Auto-generate sequence number if not provided
    const seq = event.seq ?? this.getNextSeq(event.worldId, event.chatId);

    const storedEvent: StoredEvent = {
      ...deepClone(event),
      seq
    };

    eventsArray.push(storedEvent);
  }

  /**
   * Save multiple events in batch
   */
  async saveEvents(events: StoredEvent[]): Promise<void> {
    for (const event of events) {
      await this.saveEvent(event);
    }
  }

  /**
   * Get events for a specific world and chat with filtering
   */
  async getEventsByWorldAndChat(
    worldId: string,
    chatId: string | null,
    options: GetEventsOptions = {}
  ): Promise<StoredEvent[]> {
    const eventsArray = this.getEventsArray(worldId, chatId);

    // Start with all events for this context
    let filtered = eventsArray.slice();

    // Apply filters
    if (options.sinceSeq !== undefined) {
      filtered = filtered.filter(e => (e.seq ?? 0) > options.sinceSeq!);
    }

    if (options.sinceTime !== undefined) {
      filtered = filtered.filter(e => e.createdAt > options.sinceTime!);
    }

    if (options.types && options.types.length > 0) {
      const typeSet = new Set(options.types);
      filtered = filtered.filter(e => typeSet.has(e.type));
    }

    // Sort by sequence and time
    filtered.sort((a, b) => {
      const seqA = a.seq ?? 0;
      const seqB = b.seq ?? 0;
      if (seqA !== seqB) {
        return seqA - seqB;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    // Apply order (reverse if desc)
    if (options.order === 'desc') {
      filtered.reverse();
    }

    // Apply limit
    if (options.limit && options.limit > 0) {
      filtered = filtered.slice(0, options.limit);
    }

    // Return deep clones to prevent external mutations
    return filtered.map(e => deepClone(e));
  }

  /**
   * Delete all events for a specific world and chat
   */
  async deleteEventsByWorldAndChat(worldId: string, chatId: string | null): Promise<number> {
    const key = getContextKey(worldId, chatId);
    const eventsArray = this.events.get(key);

    if (!eventsArray) {
      return 0;
    }

    const count = eventsArray.length;
    this.events.delete(key);
    this.seqCounters.delete(key);

    return count;
  }

  /**
   * Delete all events for a specific world (all chats)
   */
  async deleteEventsByWorld(worldId: string): Promise<number> {
    let totalDeleted = 0;

    // Find all keys that start with this worldId
    const keysToDelete: string[] = [];
    for (const key of this.events.keys()) {
      if (key.startsWith(`${worldId}:`)) {
        keysToDelete.push(key);
      }
    }

    // Delete events and count
    for (const key of keysToDelete) {
      const eventsArray = this.events.get(key);
      if (eventsArray) {
        totalDeleted += eventsArray.length;
      }
      this.events.delete(key);
      this.seqCounters.delete(key);
    }

    return totalDeleted;
  }

  /**
   * Get the latest sequence number for a world/chat context
   * Returns 0 if no events exist
   */
  async getLatestSeq(worldId: string, chatId: string | null): Promise<number> {
    const key = getContextKey(worldId, chatId);
    return this.seqCounters.get(key) || 0;
  }

  /**
   * Get events within a specific sequence range (inclusive)
   */
  async getEventRange(
    worldId: string,
    chatId: string | null,
    fromSeq: number,
    toSeq: number
  ): Promise<StoredEvent[]> {
    const eventsArray = this.getEventsArray(worldId, chatId);

    // Filter by sequence range
    const filtered = eventsArray.filter(e => {
      const seq = e.seq ?? 0;
      return seq >= fromSeq && seq <= toSeq;
    });

    // Sort by sequence and time
    filtered.sort((a, b) => {
      const seqA = a.seq ?? 0;
      const seqB = b.seq ?? 0;
      if (seqA !== seqB) {
        return seqA - seqB;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    // Return deep clones
    return filtered.map(e => deepClone(e));
  }

  /**
   * Clear all events (useful for testing)
   */
  async clear(): Promise<void> {
    this.events.clear();
    this.seqCounters.clear();
  }

  /**
   * Get storage statistics (useful for debugging)
   */
  getStats(): {
    totalContexts: number;
    totalEvents: number;
    eventsByContext: Map<string, number>;
  } {
    const eventsByContext = new Map<string, number>();
    let totalEvents = 0;

    for (const [key, eventsArray] of this.events.entries()) {
      const count = eventsArray.length;
      eventsByContext.set(key, count);
      totalEvents += count;
    }

    return {
      totalContexts: this.events.size,
      totalEvents,
      eventsByContext
    };
  }
}

/**
 * Create a new in-memory event storage instance
 */
export function createMemoryEventStorage(): EventStorage {
  return new MemoryEventStorage();
}
