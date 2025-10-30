/**
 * Memory Event Storage Implementation
 * 
 * In-memory storage for events, suitable for tests and development.
 * 
 * Features:
 * - Map-based storage with automatic sequence generation
 * - Supports all EventStorage interface methods
 * - Thread-safe sequence increment per world+chat combination
 * - No persistence - data cleared on process restart
 * 
 * Implementation:
 * - Uses nested Maps for hierarchical organization
 * - Maintains separate sequence counters per world+chat
 * - Deep cloning for data isolation
 * 
 * Changes:
 * - 2025-10-30: Initial implementation
 */

import { nanoid } from 'nanoid';
import { EventStorage, EventRecord, EventQueryOpts } from './types.js';

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
 * Memory-based event storage implementation
 */
export class MemoryEventStorage implements EventStorage {
  // Store events: Map<worldId, Map<chatId|'null', EventRecord[]>>
  private events = new Map<string, Map<string, EventRecord[]>>();
  // Store sequence counters: Map<worldId, Map<chatId|'null', number>>
  private seqCounters = new Map<string, Map<string, number>>();

  private getChatKey(chatId: string | null): string {
    return chatId === null ? 'null' : chatId;
  }

  async getNextSeq(worldId: string, chatId: string | null): Promise<number> {
    const chatKey = this.getChatKey(chatId);
    
    if (!this.seqCounters.has(worldId)) {
      this.seqCounters.set(worldId, new Map());
    }
    
    const worldSeqs = this.seqCounters.get(worldId)!;
    const currentSeq = worldSeqs.get(chatKey) || 0;
    const nextSeq = currentSeq + 1;
    worldSeqs.set(chatKey, nextSeq);
    
    return nextSeq;
  }

  async saveEvent(event: Omit<EventRecord, 'id' | 'seq' | 'createdAt'>): Promise<EventRecord> {
    const id = nanoid();
    const seq = await this.getNextSeq(event.worldId, event.chatId);
    const createdAt = new Date();

    const record: EventRecord = {
      id,
      seq,
      createdAt,
      ...deepClone(event)
    };

    const chatKey = this.getChatKey(event.chatId);
    
    if (!this.events.has(event.worldId)) {
      this.events.set(event.worldId, new Map());
    }
    
    const worldEvents = this.events.get(event.worldId)!;
    if (!worldEvents.has(chatKey)) {
      worldEvents.set(chatKey, []);
    }
    
    worldEvents.get(chatKey)!.push(deepClone(record));
    
    return record;
  }

  async saveEvents(events: Array<Omit<EventRecord, 'id' | 'seq' | 'createdAt'>>): Promise<EventRecord[]> {
    const results: EventRecord[] = [];
    
    for (const event of events) {
      const result = await this.saveEvent(event);
      results.push(result);
    }
    
    return results;
  }

  async getEventsByWorldAndChat(opts: EventQueryOpts): Promise<EventRecord[]> {
    const { worldId, chatId, type, limit, offset = 0, startSeq, endSeq, startDate, endDate } = opts;
    
    const worldEvents = this.events.get(worldId);
    if (!worldEvents) {
      return [];
    }

    let allEvents: EventRecord[] = [];
    
    if (chatId !== undefined) {
      // Query specific chat
      const chatKey = this.getChatKey(chatId);
      const chatEvents = worldEvents.get(chatKey) || [];
      allEvents = [...chatEvents];
    } else {
      // Query all chats in world
      for (const chatEvents of worldEvents.values()) {
        allEvents.push(...chatEvents);
      }
    }

    // Apply filters
    let filtered = allEvents.filter(event => {
      if (type && event.type !== type) return false;
      if (startSeq !== undefined && event.seq < startSeq) return false;
      if (endSeq !== undefined && event.seq > endSeq) return false;
      if (startDate && event.createdAt < startDate) return false;
      if (endDate && event.createdAt > endDate) return false;
      return true;
    });

    // Sort by sequence number
    filtered.sort((a, b) => a.seq - b.seq);

    // Apply pagination
    if (offset > 0) {
      filtered = filtered.slice(offset);
    }
    if (limit !== undefined && limit > 0) {
      filtered = filtered.slice(0, limit);
    }

    return filtered.map(e => deepClone(e));
  }

  async deleteEventsByWorldAndChat(worldId: string, chatId: string | null): Promise<number> {
    const chatKey = this.getChatKey(chatId);
    const worldEvents = this.events.get(worldId);
    
    if (!worldEvents) {
      return 0;
    }

    const chatEvents = worldEvents.get(chatKey);
    if (!chatEvents) {
      return 0;
    }

    const count = chatEvents.length;
    worldEvents.delete(chatKey);
    
    // Also reset sequence counter
    const worldSeqs = this.seqCounters.get(worldId);
    if (worldSeqs) {
      worldSeqs.delete(chatKey);
    }
    
    return count;
  }

  /**
   * Clear all stored data - useful for test cleanup
   */
  async clear(): Promise<void> {
    this.events.clear();
    this.seqCounters.clear();
  }

  /**
   * Get storage statistics - useful for debugging
   */
  getStats(): {
    totalWorlds: number;
    totalEvents: number;
  } {
    let totalEvents = 0;
    
    for (const worldEvents of this.events.values()) {
      for (const chatEvents of worldEvents.values()) {
        totalEvents += chatEvents.length;
      }
    }
    
    return {
      totalWorlds: this.events.size,
      totalEvents
    };
  }
}

/**
 * Create a new memory event storage instance
 */
export function createMemoryEventStorage(): EventStorage {
  return new MemoryEventStorage();
}
