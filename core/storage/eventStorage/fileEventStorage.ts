/**
 * File-based Event Storage Implementation
 * 
 * JSON-based event storage suitable for serverless environments and low-overhead persistence.
 * Each world/chat combination is stored in a separate JSON file for efficient access patterns.
 * 
 * Features:
 * - JSON format for readable event storage
 * - One file per world/chat combination for easy cleanup
 * - Automatic sequence number generation per world/chat
 * - Support for time-based and sequence-based pagination
 * - Event type filtering
 * - Duplicate event ID handling (silently ignores duplicates)
 * - No database dependencies
 * - Suitable for serverless and file-based deployments
 * 
 * Implementation:
 * - Uses JSON format for human-readable event storage
 * - Maintains sequence counters in memory with file-based initialization
 * - File structure: baseDir/worldId/events/chatId.json
 * - World-scoped storage: events stored within each world's directory
 * - Checks for duplicate IDs before insertion (matches SQLite INSERT OR IGNORE behavior)
 * 
 * Cascade Delete Behavior:
 * - Deleting a world directory removes all events for that world
 * - Deleting a chat file removes all events for that chat
 * 
 * Changes:
 * - 2025-11-09: Fixed file paths to be world-scoped (baseDir/worldId/events/) instead of storage root
 * - 2025-11-03: Added duplicate event ID detection to prevent constraint violations
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import type { EventStorage, StoredEvent, GetEventsOptions } from './types.js';
import { validateEventForPersistence } from './validation.js';

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
  return path.join(baseDir, worldId, 'events', `${chatIdStr}.json`);
}

/**
 * Get directory path for a world's events
 */
function getWorldEventsDir(baseDir: string, worldId: string): string {
  return path.join(baseDir, worldId, 'events');
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
    // Validate event metadata before persistence
    validateEventForPersistence(event);

    const eventsDir = getWorldEventsDir(this.baseDir, event.worldId);
    await ensureDir(eventsDir);

    const filePath = getEventFilePath(this.baseDir, event.worldId, event.chatId);

    // Read existing events
    const existingEvents = await readEventsFromFile(filePath);

    // Check for duplicate ID - skip if already exists
    const existingEvent = existingEvents.find(e => e.id === event.id);
    if (existingEvent) {
      // Silently ignore duplicate event ID (matches SQLite INSERT OR IGNORE behavior)
      return;
    }

    // Auto-generate sequence number if not provided
    const seq = event.seq ?? await this.getNextSeq(event.worldId, event.chatId);

    const storedEvent: StoredEvent = {
      ...event,
      seq
    };

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

      const eventsDir = getWorldEventsDir(this.baseDir, worldId);
      await ensureDir(eventsDir);

      const filePath = getEventFilePath(this.baseDir, worldId, chatId);

      // Read existing events
      const existingEvents = await readEventsFromFile(filePath);
      const existingIds = new Set(existingEvents.map(e => e.id));

      // Generate seq numbers sequentially and filter out duplicates
      const eventsWithSeq: StoredEvent[] = [];
      for (const event of groupEvents) {
        // Validate event metadata before persistence
        validateEventForPersistence(event);

        // Skip if duplicate ID exists
        if (existingIds.has(event.id)) {
          continue; // Silently ignore duplicate
        }

        const seq = event.seq ?? await this.getNextSeq(worldId, chatId);
        eventsWithSeq.push({ ...event, seq });
      }

      // Append new events and write back
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
    const eventsDir = getWorldEventsDir(this.baseDir, worldId);

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
    const filePath = getEventFilePath(this.baseDir, worldId, chatId);
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
    const filePath = getEventFilePath(this.baseDir, worldId, chatId);
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
