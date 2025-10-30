/**
 * File-Backed Event Storage Implementation
 * 
 * JSON file storage for events, organized per world+chat combination.
 * Uses atomic write operations and optional compaction.
 * 
 * Features:
 * - Events stored in JSON files under data/events/{worldId}/{chatId}.json
 * - Atomic write operations using temp files
 * - Optional compaction to remove old events
 * - Directory structure mirrors world/chat hierarchy
 * - Defensive file system operations
 * 
 * Implementation:
 * - Uses Node.js fs/promises for async file operations
 * - Creates directories as needed
 * - Handles missing files gracefully
 * - Simple JSON serialization
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { EventStorage, StoredEvent } from './eventStorage.js';

/**
 * File event storage context
 */
export interface FileEventStorageContext {
  rootPath: string;
}

/**
 * Create file-backed event storage instance
 */
export function createFileEventStorage(rootPath: string): EventStorage {
  const ctx: FileEventStorageContext = { rootPath };

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
    }
  };
}

/**
 * Get the file path for a world+chat combination
 */
function getEventFilePath(ctx: FileEventStorageContext, worldId: string, chatId: string): string {
  return path.join(ctx.rootPath, worldId, `${chatId}.json`);
}

/**
 * Ensure directory exists for the given file path
 */
async function ensureDirectory(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    // Ignore if directory already exists
    if ((error as any).code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Read events from file
 */
async function readEventsFromFile(filePath: string): Promise<StoredEvent[]> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(data);
    
    // Convert date strings back to Date objects
    return parsed.map((event: any) => ({
      ...event,
      createdAt: event.createdAt ? new Date(event.createdAt) : undefined
    }));
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Write events to file atomically
 */
async function writeEventsToFile(filePath: string, events: StoredEvent[]): Promise<void> {
  await ensureDirectory(filePath);
  
  // Use atomic write with temp file
  const tempPath = `${filePath}.tmp`;
  const data = JSON.stringify(events, null, 2);
  
  try {
    await fs.writeFile(tempPath, data, 'utf-8');
    await fs.rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file on error
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Save a single event
 */
async function saveEvent(ctx: FileEventStorageContext, event: StoredEvent): Promise<void> {
  const filePath = getEventFilePath(ctx, event.worldId, event.chatId);
  const events = await readEventsFromFile(filePath);
  
  // Add timestamp if not provided
  const eventToSave = {
    ...event,
    createdAt: event.createdAt || new Date()
  };
  
  events.push(eventToSave);
  await writeEventsToFile(filePath, events);
}

/**
 * Save multiple events in batch
 */
async function saveEvents(ctx: FileEventStorageContext, eventsToSave: StoredEvent[]): Promise<void> {
  if (eventsToSave.length === 0) {
    return;
  }

  // Group events by world+chat
  const eventsByKey = new Map<string, StoredEvent[]>();
  
  for (const event of eventsToSave) {
    const key = `${event.worldId}:${event.chatId}`;
    if (!eventsByKey.has(key)) {
      eventsByKey.set(key, []);
    }
    eventsByKey.get(key)!.push({
      ...event,
      createdAt: event.createdAt || new Date()
    });
  }

  // Save each group
  for (const [key, events] of eventsByKey.entries()) {
    const [worldId, chatId] = key.split(':');
    const filePath = getEventFilePath(ctx, worldId, chatId);
    const existingEvents = await readEventsFromFile(filePath);
    const allEvents = [...existingEvents, ...events];
    await writeEventsToFile(filePath, allEvents);
  }
}

/**
 * Get events by world and chat with optional filtering
 */
async function getEventsByWorldAndChat(
  ctx: FileEventStorageContext,
  worldId: string,
  chatId: string,
  options?: { limit?: number; offset?: number; afterSeq?: number }
): Promise<StoredEvent[]> {
  const filePath = getEventFilePath(ctx, worldId, chatId);
  let events = await readEventsFromFile(filePath);

  // Filter by sequence if specified
  if (options?.afterSeq !== undefined) {
    events = events.filter(e => e.seq > options.afterSeq!);
  }

  // Sort by sequence and time
  events.sort((a, b) => {
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
    return events.slice(offset, offset + limit);
  } else if (offset > 0) {
    return events.slice(offset);
  }

  return events;
}

/**
 * Delete all events for a specific world and chat
 * Returns the number of deleted events
 */
async function deleteEventsByWorldAndChat(
  ctx: FileEventStorageContext,
  worldId: string,
  chatId: string
): Promise<number> {
  const filePath = getEventFilePath(ctx, worldId, chatId);
  
  try {
    const events = await readEventsFromFile(filePath);
    const count = events.length;
    
    await fs.unlink(filePath);
    
    // Try to remove the world directory if it's empty
    try {
      const worldDir = path.dirname(filePath);
      const files = await fs.readdir(worldDir);
      if (files.length === 0) {
        await fs.rmdir(worldDir);
      }
    } catch {
      // Ignore errors when cleaning up directories
    }
    
    return count;
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
}
