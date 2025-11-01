/**
 * File-Backed Event Storage Implementation
 * 
 * JSON array storage for events with simple read/write methods.
 * Each world/chat combination gets its own JSON file.
 * 
 * Features:
 * - JSON array format for easy reading and editing
 * - One file per world/chat combination
 * - Simple read/write operations
 * - File-based persistence suitable for single-server deployments
 * 
 * File Structure:
 * - Base directory: specified in config (e.g., ./data)
 * - File naming: {worldId}/events/{chatId}.json (or {worldId}/events/null.json for null chatId)
 * - Each file contains a JSON array of StoredEvent objects
 * - Events folder is at the same level as agents and chats folders within each world
 * 
 * Implementation Notes:
 * - Uses Node.js fs/promises for async file operations
 * - Creates directories as needed
 * - Note: This implementation is NOT thread-safe for concurrent writes
 * - For production with high concurrency, consider using SQLite storage instead
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
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
  return path.join(baseDir, 'events', `${chatIdStr}.json`);
}

/**
 * Get directory path for a world's events
 */
function getWorldEventsDir(baseDir: string): string {
  return path.join(baseDir, 'events');
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
 * Read all events from a JSON file
 */
async function readEventsFromFile(filePath: string): Promise<StoredEvent[]> {
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    if (!content.trim()) {
      return [];
    }

    const events = JSON.parse(content) as StoredEvent[];
    // Parse dates
    return events.map(event => ({
      ...event,
      createdAt: new Date(event.createdAt)
    }));
  } catch (error) {
    console.error('[FileEventStorage] Failed to read events from file:', filePath, error);
    return [];
  }
}

/**
 * Write events to a JSON file (overwrites existing file)
 */
async function writeEventsToFile(filePath: string, events: StoredEvent[]): Promise<void> {
  const content = JSON.stringify(events, null, 2);
  await fs.writeFile(filePath, content, 'utf-8');
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
    const worldDir = path.join(this.baseDir, worldId);
    const filePath = getEventFilePath(worldDir, worldId, chatId);
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
    const worldDir = path.join(this.baseDir, event.worldId);
    const eventsDir = getWorldEventsDir(worldDir);
    await ensureDir(eventsDir);

    // Auto-generate sequence number if not provided
    const seq = event.seq ?? await this.getNextSeq(event.worldId, event.chatId);

    const storedEvent: StoredEvent = {
      ...event,
      seq
    };

    const filePath = getEventFilePath(this.baseDir, event.worldId, event.chatId);

    // Read existing events, append new one, and write back
    const existingEvents = await readEventsFromFile(filePath);
    existingEvents.push(storedEvent);
    await writeEventsToFile(filePath, existingEvents);
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

      const worldDir = path.join(this.baseDir, worldId);
      const eventsDir = getWorldEventsDir(worldDir);
      await ensureDir(eventsDir);

      const filePath = getEventFilePath(worldDir, worldId, chatId);

      // Generate seq numbers sequentially to avoid duplicates
      const eventsWithSeq: StoredEvent[] = [];
      for (const event of groupEvents) {
        const seq = event.seq ?? await this.getNextSeq(worldId, chatId);
        eventsWithSeq.push({ ...event, seq });
      }

      // Read existing events, append new ones, and write back
      const existingEvents = await readEventsFromFile(filePath);
      existingEvents.push(...eventsWithSeq);
      await writeEventsToFile(filePath, existingEvents);
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
    const worldDir = path.join(this.baseDir, worldId);
    const filePath = getEventFilePath(worldDir, worldId, chatId);
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
    const worldDir = path.join(this.baseDir, worldId);
    const filePath = getEventFilePath(worldDir, worldId, chatId);

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
    const worldDir = path.join(this.baseDir, worldId);
    const eventsDir = getWorldEventsDir(worldDir);

    if (!existsSync(eventsDir)) {
      return 0;
    }

    let totalDeleted = 0;

    try {
      // Read all files in the events directory
      const files = await fs.readdir(eventsDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(eventsDir, file);
          const events = await readEventsFromFile(filePath);
          totalDeleted += events.length;
          await fs.unlink(filePath);
        }
      }

      // Remove the events directory if empty
      try {
        await fs.rmdir(eventsDir);
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
   * Get the latest sequence number for a world/chat context
   * Returns 0 if no events exist
   */
  async getLatestSeq(worldId: string, chatId: string | null): Promise<number> {
    const key = this.getContextKey(worldId, chatId);

    // Check cache first
    if (this.seqCounters.has(key)) {
      return this.seqCounters.get(key)!;
    }

    // Load from file to find max seq
    const worldDir = path.join(this.baseDir, worldId);
    const filePath = getEventFilePath(worldDir, worldId, chatId);
    const events = await readEventsFromFile(filePath);
    const maxSeq = events.reduce((max, e) => Math.max(max, e.seq ?? 0), 0);

    // Update cache
    if (maxSeq > 0) {
      this.seqCounters.set(key, maxSeq);
    }

    return maxSeq;
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
    const worldDir = path.join(this.baseDir, worldId);
    const filePath = getEventFilePath(worldDir, worldId, chatId);
    let events = await readEventsFromFile(filePath);

    // Filter by sequence range
    events = events.filter(e => {
      const seq = e.seq ?? 0;
      return seq >= fromSeq && seq <= toSeq;
    });

    // Sort by sequence and time
    events.sort((a, b) => {
      const seqA = a.seq ?? 0;
      const seqB = b.seq ?? 0;
      if (seqA !== seqB) {
        return seqA - seqB;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    return events;
  }

  /**
   * Compact a specific event file (remove deleted events, rewrite file)
   * This is useful after bulk deletions to reclaim space
   */
  async compact(worldId: string, chatId: string | null): Promise<void> {
    const worldDir = path.join(this.baseDir, worldId);
    const filePath = getEventFilePath(worldDir, worldId, chatId);

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
