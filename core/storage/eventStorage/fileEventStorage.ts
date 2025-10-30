/**
 * File-Backed Event Storage Implementation
 * 
 * Append-only JSONL (JSON Lines) storage for events with simple compaction and read methods.
 * Each world/chat combination gets its own JSONL file for efficient appending and reading.
 * 
 * Features:
 * - Append-only JSONL format for fast writes
 * - One file per world/chat combination
 * - Simple compaction to remove deleted events
 * - Efficient sequential reads
 * - Line-by-line parsing for memory efficiency
 * - File-based persistence suitable for single-server deployments
 * 
 * File Structure:
 * - Base directory: specified in config (e.g., ./data/events)
 * - File naming: {worldId}/{chatId}.jsonl (or {worldId}/null.jsonl for null chatId)
 * - Each line is a JSON object representing a StoredEvent
 * 
 * Implementation Notes:
 * - Uses Node.js fs/promises for async file operations
 * - Creates directories as needed
 * - Note: This implementation is NOT thread-safe for concurrent writes
 * - For production with high concurrency, consider using SQLite storage instead
 * - Provides compaction to reclaim space after deletions
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream, existsSync } from 'fs';
import { createInterface } from 'readline';
import type { EventStorage, StoredEvent, GetEventsOptions } from './types.js';

/**
 * File storage configuration
 */
export interface FileEventStorageConfig {
  baseDir: string;  // Base directory for event files
}

/**
 * Get file path for a world/chat combination
 */
function getEventFilePath(baseDir: string, worldId: string, chatId: string | null): string {
  const chatIdStr = chatId ?? 'null';
  return path.join(baseDir, worldId, `${chatIdStr}.jsonl`);
}

/**
 * Get directory path for a world
 */
function getWorldDir(baseDir: string, worldId: string): string {
  return path.join(baseDir, worldId);
}

/**
 * Ensure directory exists
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error: any) {
    // Ignore if directory already exists
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Read all events from a JSONL file
 */
async function readEventsFromFile(filePath: string): Promise<StoredEvent[]> {
  if (!existsSync(filePath)) {
    return [];
  }
  
  const events: StoredEvent[] = [];
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  for await (const line of rl) {
    if (line.trim()) {
      try {
        const event = JSON.parse(line);
        // Parse dates
        event.createdAt = new Date(event.createdAt);
        events.push(event);
      } catch (error) {
        console.error('[FileEventStorage] Failed to parse line:', line, error);
      }
    }
  }
  
  return events;
}

/**
 * Write events to a JSONL file (overwrites existing file)
 */
async function writeEventsToFile(filePath: string, events: StoredEvent[]): Promise<void> {
  const lines = events.map(event => JSON.stringify(event)).join('\n');
  await fs.writeFile(filePath, lines + '\n', 'utf-8');
}

/**
 * Append an event to a JSONL file
 */
async function appendEventToFile(filePath: string, event: StoredEvent): Promise<void> {
  const line = JSON.stringify(event) + '\n';
  await fs.appendFile(filePath, line, 'utf-8');
}

/**
 * File-backed event storage implementation
 */
export class FileEventStorage implements EventStorage {
  private baseDir: string;
  private seqCounters = new Map<string, number>();
  
  constructor(config: FileEventStorageConfig) {
    this.baseDir = config.baseDir;
  }
  
  /**
   * Get context key for sequence counter
   */
  private getContextKey(worldId: string, chatId: string | null): string {
    return `${worldId}:${chatId ?? 'null'}`;
  }
  
  /**
   * Get the next sequence number for a world/chat context
   */
  private async getNextSeq(worldId: string, chatId: string | null): Promise<number> {
    const key = this.getContextKey(worldId, chatId);
    
    // Check cache first
    if (this.seqCounters.has(key)) {
      const current = this.seqCounters.get(key)!;
      const next = current + 1;
      this.seqCounters.set(key, next);
      return next;
    }
    
    // Load from file to find max seq
    const filePath = getEventFilePath(this.baseDir, worldId, chatId);
    const events = await readEventsFromFile(filePath);
    const maxSeq = events.reduce((max, e) => Math.max(max, e.seq ?? 0), 0);
    const next = maxSeq + 1;
    this.seqCounters.set(key, next);
    return next;
  }
  
  /**
   * Save a single event
   */
  async saveEvent(event: StoredEvent): Promise<void> {
    const worldDir = getWorldDir(this.baseDir, event.worldId);
    await ensureDir(worldDir);
    
    // Auto-generate sequence number if not provided
    const seq = event.seq ?? await this.getNextSeq(event.worldId, event.chatId);
    
    const storedEvent: StoredEvent = {
      ...event,
      seq
    };
    
    const filePath = getEventFilePath(this.baseDir, event.worldId, event.chatId);
    await appendEventToFile(filePath, storedEvent);
  }
  
  /**
   * Save multiple events in batch
   * Note: This method generates sequence numbers sequentially to avoid race conditions
   */
  async saveEvents(events: StoredEvent[]): Promise<void> {
    // Group events by world/chat
    const groupedEvents = new Map<string, StoredEvent[]>();
    
    for (const event of events) {
      const key = this.getContextKey(event.worldId, event.chatId);
      if (!groupedEvents.has(key)) {
        groupedEvents.set(key, []);
      }
      groupedEvents.get(key)!.push(event);
    }
    
    // Process each group sequentially to avoid race conditions with seq generation
    for (const [key, groupEvents] of groupedEvents.entries()) {
      const [worldId, chatIdStr] = key.split(':');
      const chatId = chatIdStr === 'null' ? null : chatIdStr;
      
      const worldDir = getWorldDir(this.baseDir, worldId);
      await ensureDir(worldDir);
      
      const filePath = getEventFilePath(this.baseDir, worldId, chatId);
      
      // Generate seq numbers sequentially to avoid duplicates
      const eventsWithSeq: StoredEvent[] = [];
      for (const event of groupEvents) {
        const seq = event.seq ?? await this.getNextSeq(worldId, chatId);
        eventsWithSeq.push({ ...event, seq });
      }
      
      // Append all events for this group
      for (const event of eventsWithSeq) {
        await appendEventToFile(filePath, event);
      }
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
    const filePath = getEventFilePath(this.baseDir, worldId, chatId);
    let events = await readEventsFromFile(filePath);
    
    // Apply filters
    if (options.sinceSeq !== undefined) {
      events = events.filter(e => (e.seq ?? 0) > options.sinceSeq!);
    }
    
    if (options.sinceTime !== undefined) {
      events = events.filter(e => e.createdAt > options.sinceTime!);
    }
    
    if (options.types && options.types.length > 0) {
      const typeSet = new Set(options.types);
      events = events.filter(e => typeSet.has(e.type));
    }
    
    // Sort by sequence and time
    events.sort((a, b) => {
      const seqA = a.seq ?? 0;
      const seqB = b.seq ?? 0;
      if (seqA !== seqB) {
        return seqA - seqB;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    
    // Apply order (reverse if desc)
    if (options.order === 'desc') {
      events.reverse();
    }
    
    // Apply limit
    if (options.limit && options.limit > 0) {
      events = events.slice(0, options.limit);
    }
    
    return events;
  }
  
  /**
   * Delete all events for a specific world and chat
   */
  async deleteEventsByWorldAndChat(worldId: string, chatId: string | null): Promise<number> {
    const filePath = getEventFilePath(this.baseDir, worldId, chatId);
    
    if (!existsSync(filePath)) {
      return 0;
    }
    
    const events = await readEventsFromFile(filePath);
    const count = events.length;
    
    // Delete the file
    await fs.unlink(filePath);
    
    // Clear sequence counter
    const key = this.getContextKey(worldId, chatId);
    this.seqCounters.delete(key);
    
    return count;
  }
  
  /**
   * Delete all events for a specific world (all chats)
   */
  async deleteEventsByWorld(worldId: string): Promise<number> {
    const worldDir = getWorldDir(this.baseDir, worldId);
    
    if (!existsSync(worldDir)) {
      return 0;
    }
    
    let totalDeleted = 0;
    
    try {
      // Read all files in the world directory
      const files = await fs.readdir(worldDir);
      
      for (const file of files) {
        if (file.endsWith('.jsonl')) {
          const filePath = path.join(worldDir, file);
          const events = await readEventsFromFile(filePath);
          totalDeleted += events.length;
          await fs.unlink(filePath);
        }
      }
      
      // Remove the world directory if empty
      try {
        await fs.rmdir(worldDir);
      } catch (error) {
        // Ignore if directory is not empty or doesn't exist
      }
    } catch (error) {
      console.error('[FileEventStorage] Error deleting events for world:', worldId, error);
    }
    
    // Clear sequence counters for this world
    const keysToDelete: string[] = [];
    for (const key of this.seqCounters.keys()) {
      if (key.startsWith(`${worldId}:`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.seqCounters.delete(key);
    }
    
    return totalDeleted;
  }
  
  /**
   * Compact a specific event file (remove deleted events, rewrite file)
   * This is useful after bulk deletions to reclaim space
   */
  async compact(worldId: string, chatId: string | null): Promise<void> {
    const filePath = getEventFilePath(this.baseDir, worldId, chatId);
    
    if (!existsSync(filePath)) {
      return;
    }
    
    // Read all events
    const events = await readEventsFromFile(filePath);
    
    // Write them back (this removes any gaps or corruption)
    await writeEventsToFile(filePath, events);
  }
}

/**
 * Create a new file-backed event storage instance
 */
export function createFileEventStorage(config: FileEventStorageConfig): EventStorage {
  return new FileEventStorage(config);
}
