/**
 * In-Memory Event Storage Implementation
 * 
 * Ephemeral event storage for tests and development.
 * No persistence across process restarts.
 * 
 * Features:
 * - Fast in-memory storage using Maps
 * - Full EventStorage interface compatibility
 * - Suitable for unit tests and ephemeral usage
 * - No external dependencies
 * - Thread-safe within single process
 * 
 * Implementation:
 * - Uses nested Maps for hierarchical organization
 * - Deep cloning for data isolation
 * - Simple filtering and sorting
 * - No file system or database access
 */

import type { EventStorage, StoredEvent } from './eventStorage.js';

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
    if (obj.hasOwnProperty(key)) {
      clonedObj[key] = deepClone(obj[key]);
    }
  }
  return clonedObj;
}

/**
 * In-memory event storage context
 */
export interface MemoryEventStorageContext {
  // Map: worldId -> chatId -> events[]
  events: Map<string, Map<string, StoredEvent[]>>;
  nextId: number;
}

/**
 * Create in-memory event storage instance
 */
export function createMemoryEventStorage(): EventStorage {
  const ctx: MemoryEventStorageContext = {
    events: new Map(),
    nextId: 1
  };

  return {
    async saveEvent(event: StoredEvent): Promise<void> {
      await saveEvent(ctx, event);
    },

    async saveEvents(events: StoredEvent[]): Promise<void> {
      await saveEvents(ctx, events);
    },

    async getEventsByWorldAndChat(
      worldId: string,
      chatId: string,
      options?: { limit?: number; offset?: number; afterSeq?: number }
    ): Promise<StoredEvent[]> {
      return await getEventsByWorldAndChat(ctx, worldId, chatId, options);
    },

    async deleteEventsByWorldAndChat(worldId: string, chatId: string): Promise<number> {
      return await deleteEventsByWorldAndChat(ctx, worldId, chatId);
    },

    async close(): Promise<void> {
      // Clean up all data
      ctx.events.clear();
    }
  };
}

/**
 * Get or create chat events array
 */
function getOrCreateChatEvents(ctx: MemoryEventStorageContext, worldId: string, chatId: string): StoredEvent[] {
  if (!ctx.events.has(worldId)) {
    ctx.events.set(worldId, new Map());
  }
  
  const worldEvents = ctx.events.get(worldId)!;
  
  if (!worldEvents.has(chatId)) {
    worldEvents.set(chatId, []);
  }
  
  return worldEvents.get(chatId)!;
}

/**
 * Save a single event
 */
async function saveEvent(ctx: MemoryEventStorageContext, event: StoredEvent): Promise<void> {
  const events = getOrCreateChatEvents(ctx, event.worldId, event.chatId);
  
  // Create a copy with ID and timestamp
  const eventToSave = deepClone({
    ...event,
    id: ctx.nextId++,
    createdAt: event.createdAt || new Date()
  });
  
  events.push(eventToSave);
}

/**
 * Save multiple events in batch
 */
async function saveEvents(ctx: MemoryEventStorageContext, eventsToSave: StoredEvent[]): Promise<void> {
  for (const event of eventsToSave) {
    await saveEvent(ctx, event);
  }
}

/**
 * Get events by world and chat with optional filtering
 */
async function getEventsByWorldAndChat(
  ctx: MemoryEventStorageContext,
  worldId: string,
  chatId: string,
  options?: { limit?: number; offset?: number; afterSeq?: number }
): Promise<StoredEvent[]> {
  const worldEvents = ctx.events.get(worldId);
  if (!worldEvents) {
    return [];
  }
  
  const chatEvents = worldEvents.get(chatId);
  if (!chatEvents) {
    return [];
  }

  let filteredEvents = [...chatEvents];

  // Filter by sequence if specified
  if (options?.afterSeq !== undefined) {
    filteredEvents = filteredEvents.filter(e => e.seq > options.afterSeq!);
  }

  // Sort by sequence and time
  filteredEvents.sort((a, b) => {
    if (a.seq !== b.seq) {
      return a.seq - b.seq;
    }
    if (a.createdAt && b.createdAt) {
      return a.createdAt.getTime() - b.createdAt.getTime();
    }
    return 0;
  });

  // Apply offset and limit
  const offset = options?.offset || 0;
  const limit = options?.limit;
  
  if (limit !== undefined) {
    filteredEvents = filteredEvents.slice(offset, offset + limit);
  } else if (offset > 0) {
    filteredEvents = filteredEvents.slice(offset);
  }

  // Return deep clones to prevent external modification
  return filteredEvents.map(e => deepClone(e));
}

/**
 * Delete all events for a specific world and chat
 * Returns the number of deleted events
 */
async function deleteEventsByWorldAndChat(
  ctx: MemoryEventStorageContext,
  worldId: string,
  chatId: string
): Promise<number> {
  const worldEvents = ctx.events.get(worldId);
  if (!worldEvents) {
    return 0;
  }
  
  const chatEvents = worldEvents.get(chatId);
  if (!chatEvents) {
    return 0;
  }
  
  const count = chatEvents.length;
  worldEvents.delete(chatId);
  
  // Clean up empty world map
  if (worldEvents.size === 0) {
    ctx.events.delete(worldId);
  }
  
  return count;
}
