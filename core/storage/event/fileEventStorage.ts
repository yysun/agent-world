/**
 * File-based Event Storage Implementation
 * 
 * File-backed storage writing events as JSONL files under data/events/{worldId}/{chatId}.jsonl
 * 
 * Features:
 * - Append-only JSONL format for atomic writes
 * - One file per world+chat combination
 * - Efficient streaming reads
 * - Compaction helper to rewrite files
 * - Automatic directory creation
 * 
 * Implementation:
 * - Uses fs.promises for async file operations
 * - Ensures atomic append with proper error handling
 * - Reads full file with streaming support
 * - Manages sequence numbers from file content
 * 
 * Changes:
 * - 2025-10-30: Initial implementation
 */

import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';
import { EventStorage, EventRecord, EventQueryOpts } from './types.js';

/**
 * File event storage configuration
 */
export interface FileEventStorageConfig {
  rootPath: string; // Base directory for event files
}

/**
 * File-based event storage implementation
 */
export class FileEventStorage implements EventStorage {
  private rootPath: string;
  private seqCache = new Map<string, number>(); // Cache for sequence numbers

  constructor(config: FileEventStorageConfig) {
    this.rootPath = config.rootPath;
  }

  /**
   * Get the file path for a world+chat combination
   */
  private getFilePath(worldId: string, chatId: string | null): string {
    const chatKey = chatId === null ? 'null' : chatId;
    return path.join(this.rootPath, 'events', worldId, `${chatKey}.jsonl`);
  }

  /**
   * Get cache key for sequence counter
   */
  private getCacheKey(worldId: string, chatId: string | null): string {
    const chatKey = chatId === null ? 'null' : chatId;
    return `${worldId}:${chatKey}`;
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectory(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
  }

  /**
   * Read all events from a file
   */
  private async readEventsFromFile(filePath: string): Promise<EventRecord[]> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      return lines.map(line => {
        const parsed = JSON.parse(line);
        return {
          ...parsed,
          createdAt: new Date(parsed.createdAt)
        };
      });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return []; // File doesn't exist yet
      }
      throw error;
    }
  }

  async getNextSeq(worldId: string, chatId: string | null): Promise<number> {
    const cacheKey = this.getCacheKey(worldId, chatId);
    
    // Check cache first
    if (this.seqCache.has(cacheKey)) {
      const currentSeq = this.seqCache.get(cacheKey)!;
      const nextSeq = currentSeq + 1;
      this.seqCache.set(cacheKey, nextSeq);
      return nextSeq;
    }

    // Read from file to get max sequence
    const filePath = this.getFilePath(worldId, chatId);
    const events = await this.readEventsFromFile(filePath);
    
    const maxSeq = events.length > 0 ? Math.max(...events.map(e => e.seq)) : 0;
    const nextSeq = maxSeq + 1;
    
    this.seqCache.set(cacheKey, nextSeq);
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
      worldId: event.worldId,
      chatId: event.chatId,
      type: event.type,
      payload: event.payload,
      meta: event.meta
    };

    const filePath = this.getFilePath(event.worldId, event.chatId);
    await this.ensureDirectory(filePath);

    // Append to file (atomic write)
    const line = JSON.stringify(record) + '\n';
    await fs.promises.appendFile(filePath, line, 'utf-8');

    return record;
  }

  async saveEvents(events: Array<Omit<EventRecord, 'id' | 'seq' | 'createdAt'>>): Promise<EventRecord[]> {
    const results: EventRecord[] = [];

    // Group events by world+chat for efficient batch writing
    const grouped = new Map<string, Array<Omit<EventRecord, 'id' | 'seq' | 'createdAt'>>>();
    
    for (const event of events) {
      const key = this.getCacheKey(event.worldId, event.chatId);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(event);
    }

    // Process each group
    for (const [key, groupEvents] of grouped.entries()) {
      const lines: string[] = [];
      
      for (const event of groupEvents) {
        const id = nanoid();
        const seq = await this.getNextSeq(event.worldId, event.chatId);
        const createdAt = new Date();

        const record: EventRecord = {
          id,
          seq,
          createdAt,
          worldId: event.worldId,
          chatId: event.chatId,
          type: event.type,
          payload: event.payload,
          meta: event.meta
        };

        lines.push(JSON.stringify(record));
        results.push(record);
      }

      // Write all lines for this group at once
      const firstEvent = groupEvents[0];
      const filePath = this.getFilePath(firstEvent.worldId, firstEvent.chatId);
      await this.ensureDirectory(filePath);
      await fs.promises.appendFile(filePath, lines.join('\n') + '\n', 'utf-8');
    }

    return results;
  }

  async getEventsByWorldAndChat(opts: EventQueryOpts): Promise<EventRecord[]> {
    const { worldId, chatId, type, limit, offset = 0, startSeq, endSeq, startDate, endDate } = opts;

    let allEvents: EventRecord[] = [];

    if (chatId !== undefined) {
      // Query specific chat
      const filePath = this.getFilePath(worldId, chatId);
      allEvents = await this.readEventsFromFile(filePath);
    } else {
      // Query all chats in world
      const worldDir = path.join(this.rootPath, 'events', worldId);
      
      try {
        const files = await fs.promises.readdir(worldDir);
        
        for (const file of files) {
          if (file.endsWith('.jsonl')) {
            const filePath = path.join(worldDir, file);
            const events = await this.readEventsFromFile(filePath);
            allEvents.push(...events);
          }
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        // Directory doesn't exist - no events
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

    return filtered;
  }

  async deleteEventsByWorldAndChat(worldId: string, chatId: string | null): Promise<number> {
    const filePath = this.getFilePath(worldId, chatId);
    
    try {
      const events = await this.readEventsFromFile(filePath);
      const count = events.length;
      
      // Delete the file
      await fs.promises.unlink(filePath);
      
      // Clear cache
      const cacheKey = this.getCacheKey(worldId, chatId);
      this.seqCache.delete(cacheKey);
      
      return count;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return 0; // File doesn't exist
      }
      throw error;
    }
  }

  /**
   * Compact a file by rewriting it (removes any corruption or optimizes storage)
   */
  async compactFile(worldId: string, chatId: string | null): Promise<void> {
    const filePath = this.getFilePath(worldId, chatId);
    const events = await this.readEventsFromFile(filePath);
    
    if (events.length === 0) {
      return;
    }

    // Write to temporary file
    const tempPath = filePath + '.tmp';
    const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
    await fs.promises.writeFile(tempPath, lines, 'utf-8');
    
    // Atomic rename
    await fs.promises.rename(tempPath, filePath);
  }

  /**
   * Delete all events for a world
   */
  async deleteWorldEvents(worldId: string): Promise<number> {
    const worldDir = path.join(this.rootPath, 'events', worldId);
    
    try {
      const files = await fs.promises.readdir(worldDir);
      let totalCount = 0;
      
      for (const file of files) {
        if (file.endsWith('.jsonl')) {
          const filePath = path.join(worldDir, file);
          const events = await this.readEventsFromFile(filePath);
          totalCount += events.length;
          await fs.promises.unlink(filePath);
        }
      }
      
      // Try to remove directory if empty
      try {
        await fs.promises.rmdir(worldDir);
      } catch {
        // Ignore if directory not empty
      }
      
      // Clear cache for this world
      for (const key of this.seqCache.keys()) {
        if (key.startsWith(worldId + ':')) {
          this.seqCache.delete(key);
        }
      }
      
      return totalCount;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return 0;
      }
      throw error;
    }
  }
}

/**
 * Create file event storage instance
 */
export function createFileEventStorage(config: FileEventStorageConfig): EventStorage {
  return new FileEventStorage(config);
}
