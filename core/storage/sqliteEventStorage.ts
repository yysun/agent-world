/**
 * SQLite Event Storage Implementation
 * 
 * Database-backed event storage using SQLite with foreign key cascade deletes.
 * Uses existing DB client pattern with run/get/all methods.
 * 
 * Features:
 * - Persistent event storage in SQLite database
 * - Foreign key constraints with cascade deletion
 * - Efficient querying with indexes
 * - JSON serialization for payload and metadata
 * - Batch insert support for multiple events
 * 
 * Implementation:
 * - Uses Database instance from sqlite3
 * - Defensive error handling
 * - Proper async/await patterns
 * - Parameterized queries for security
 */

import type { Database } from 'sqlite3';
import type { EventStorage, StoredEvent } from './eventStorage.js';

/**
 * SQLite event storage context
 */
export interface SQLiteEventStorageContext {
  db: Database;
}

/**
 * Create SQLite event storage instance
 */
export function createSQLiteEventStorage(db: Database): EventStorage {
  const ctx: SQLiteEventStorageContext = { db };

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
 * Helper to run SQL statements
 */
async function run(ctx: SQLiteEventStorageContext, sql: string, ...params: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    ctx.db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

/**
 * Helper to get a single row
 */
async function get(ctx: SQLiteEventStorageContext, sql: string, ...params: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    ctx.db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Helper to get all rows
 */
async function all(ctx: SQLiteEventStorageContext, sql: string, ...params: any[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    ctx.db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Serialize payload/meta to JSON string
 */
function serializeJson(data: any): string | null {
  if (data === null || data === undefined) {
    return null;
  }
  try {
    return JSON.stringify(data);
  } catch (error) {
    console.warn('[sqliteEventStorage] Failed to serialize JSON:', error);
    return null;
  }
}

/**
 * Deserialize JSON string to object
 */
function deserializeJson(json: string | null): any {
  if (!json) {
    return null;
  }
  try {
    return JSON.parse(json);
  } catch (error) {
    console.warn('[sqliteEventStorage] Failed to deserialize JSON:', error);
    return null;
  }
}

/**
 * Save a single event
 */
async function saveEvent(ctx: SQLiteEventStorageContext, event: StoredEvent): Promise<void> {
  const payloadJson = serializeJson(event.payload);
  const metaJson = serializeJson(event.meta);

  await run(
    ctx,
    `INSERT INTO events (world_id, chat_id, seq, type, payload, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
    event.worldId,
    event.chatId,
    event.seq,
    event.type,
    payloadJson,
    metaJson,
    event.createdAt ? event.createdAt.toISOString() : null
  );
}

/**
 * Save multiple events in batch
 */
async function saveEvents(ctx: SQLiteEventStorageContext, events: StoredEvent[]): Promise<void> {
  if (events.length === 0) {
    return;
  }

  // Use a transaction for batch inserts
  await run(ctx, 'BEGIN TRANSACTION');
  
  try {
    for (const event of events) {
      await saveEvent(ctx, event);
    }
    await run(ctx, 'COMMIT');
  } catch (error) {
    await run(ctx, 'ROLLBACK');
    throw error;
  }
}

/**
 * Get events by world and chat with optional filtering
 */
async function getEventsByWorldAndChat(
  ctx: SQLiteEventStorageContext,
  worldId: string,
  chatId: string,
  options?: { limit?: number; offset?: number; afterSeq?: number }
): Promise<StoredEvent[]> {
  let sql = `
    SELECT id, world_id as worldId, chat_id as chatId, seq, type, 
           payload, meta, created_at as createdAt
    FROM events
    WHERE world_id = ? AND chat_id = ?
  `;
  const params: any[] = [worldId, chatId];

  if (options?.afterSeq !== undefined) {
    sql += ' AND seq > ?';
    params.push(options.afterSeq);
  }

  sql += ' ORDER BY seq ASC, created_at ASC';

  if (options?.limit !== undefined) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  if (options?.offset !== undefined) {
    sql += ' OFFSET ?';
    params.push(options.offset);
  }

  const rows = await all(ctx, sql, ...params);

  return rows.map((row: any) => ({
    id: row.id,
    worldId: row.worldId,
    chatId: row.chatId,
    seq: row.seq,
    type: row.type,
    payload: deserializeJson(row.payload),
    meta: deserializeJson(row.meta),
    createdAt: row.createdAt ? new Date(row.createdAt) : undefined
  }));
}

/**
 * Delete all events for a specific world and chat
 * Returns the number of deleted events
 */
async function deleteEventsByWorldAndChat(
  ctx: SQLiteEventStorageContext,
  worldId: string,
  chatId: string
): Promise<number> {
  const result = await run(
    ctx,
    'DELETE FROM events WHERE world_id = ? AND chat_id = ?',
    worldId,
    chatId
  );
  return (result as any).changes || 0;
}
