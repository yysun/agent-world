/**
 * SQLite Event Storage Implementation
 * 
 * Implements EventStorage interface using SQLite database with the repository's existing DB client pattern.
 * Uses parameterized SQL queries and transactions for data integrity and performance.
 * 
 * Features:
 * - Parameterized SQL queries to prevent SQL injection
 * - Transaction support for batch operations
 * - Automatic sequence number generation per world/chat
 * - Cascade delete via foreign keys to worlds/chats tables
 * - Efficient querying with indexed columns
 * - JSON storage for payload and metadata
 * 
 * Cascade Delete Behavior:
 * - Foreign keys ensure events are deleted when their parent world is deleted
 * - Foreign keys ensure events are deleted when their parent chat is deleted
 * - PRAGMA foreign_keys = ON must be enabled (done in sqlite-schema.ts)
 * 
 * Implementation Notes:
 * - Uses sqlite3 Database from the existing schema pattern
 * - Follows the promisify pattern used in sqlite-storage.ts
 * - Supports both time-based and sequence-based pagination
 * - Auto-increments sequence number within each world/chat context
 */

import type { Database } from 'sqlite3';
import { promisify } from 'util';
import type { EventStorage, StoredEvent, GetEventsOptions } from './types.js';

export interface SQLiteEventStorageContext {
  db: Database;
  isInitialized: boolean;
}

/**
 * Helper to promisify db.run
 */
function dbRun(db: Database, sql: string, ...params: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

/**
 * Helper to promisify db.get
 */
function dbGet(db: Database, sql: string, ...params: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Helper to promisify db.all
 */
function dbAll(db: Database, sql: string, ...params: any[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Create SQLite event storage context
 */
export async function createSQLiteEventStorage(db: Database): Promise<EventStorage> {
  const ctx: SQLiteEventStorageContext = {
    db,
    isInitialized: false
  };
  
  await ensureInitialized(ctx);
  
  return {
    saveEvent: (event: StoredEvent) => saveEvent(ctx, event),
    saveEvents: (events: StoredEvent[]) => saveEvents(ctx, events),
    getEventsByWorldAndChat: (worldId: string, chatId: string | null, options?: GetEventsOptions) => 
      getEventsByWorldAndChat(ctx, worldId, chatId, options),
    deleteEventsByWorldAndChat: (worldId: string, chatId: string | null) => 
      deleteEventsByWorldAndChat(ctx, worldId, chatId),
    deleteEventsByWorld: (worldId: string) => deleteEventsByWorld(ctx, worldId),
  };
}

/**
 * Ensure the events table is created
 * The events table should already exist from the migration, but this provides a fallback
 */
async function ensureInitialized(ctx: SQLiteEventStorageContext): Promise<void> {
  if (ctx.isInitialized) return;
  
  // Check if events table exists
  const tableCheck = await dbGet(
    ctx.db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='events'"
  );
  
  if (!tableCheck) {
    // Table doesn't exist, create it
    // This is a fallback - normally the migration should create this table
    // Note: Foreign keys are omitted here because parent tables may not exist yet
    // In production, the migration script handles this properly with foreign keys
    await dbRun(ctx.db, `
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        world_id TEXT NOT NULL,
        chat_id TEXT,
        seq INTEGER,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        meta TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes
    await dbRun(ctx.db, `
      CREATE INDEX IF NOT EXISTS idx_events_world_chat_time 
        ON events(world_id, chat_id, created_at)
    `);
    
    await dbRun(ctx.db, `
      CREATE INDEX IF NOT EXISTS idx_events_world_chat_seq 
        ON events(world_id, chat_id, seq)
    `);
    
    await dbRun(ctx.db, `
      CREATE INDEX IF NOT EXISTS idx_events_type 
        ON events(type)
    `);
    
    await dbRun(ctx.db, `
      CREATE INDEX IF NOT EXISTS idx_events_world_id 
        ON events(world_id)
    `);
  }
  
  ctx.isInitialized = true;
}

/**
 * Get the next sequence number for a world/chat
 */
async function getNextSeq(ctx: SQLiteEventStorageContext, worldId: string, chatId: string | null): Promise<number> {
  const result = await dbGet(
    ctx.db,
    `SELECT COALESCE(MAX(seq), 0) + 1 as nextSeq 
     FROM events 
     WHERE world_id = ? AND (chat_id = ? OR (chat_id IS NULL AND ? IS NULL))`,
    worldId,
    chatId,
    chatId
  );
  return result.nextSeq;
}

/**
 * Save a single event
 */
async function saveEvent(ctx: SQLiteEventStorageContext, event: StoredEvent): Promise<void> {
  await ensureInitialized(ctx);
  
  // Auto-generate sequence number if not provided
  const seq = event.seq ?? await getNextSeq(ctx, event.worldId, event.chatId);
  
  await dbRun(
    ctx.db,
    `INSERT INTO events (id, world_id, chat_id, seq, type, payload, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    event.id,
    event.worldId,
    event.chatId,
    seq,
    event.type,
    JSON.stringify(event.payload),
    event.meta ? JSON.stringify(event.meta) : null,
    event.createdAt.toISOString()
  );
}

/**
 * Save multiple events in a transaction
 */
async function saveEvents(ctx: SQLiteEventStorageContext, events: StoredEvent[]): Promise<void> {
  await ensureInitialized(ctx);
  
  if (events.length === 0) return;
  
  // Use transaction for batch insert
  await dbRun(ctx.db, 'BEGIN TRANSACTION');
  
  try {
    for (const event of events) {
      // Auto-generate sequence number if not provided
      const seq = event.seq ?? await getNextSeq(ctx, event.worldId, event.chatId);
      
      await dbRun(
        ctx.db,
        `INSERT INTO events (id, world_id, chat_id, seq, type, payload, meta, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        event.id,
        event.worldId,
        event.chatId,
        seq,
        event.type,
        JSON.stringify(event.payload),
        event.meta ? JSON.stringify(event.meta) : null,
        event.createdAt.toISOString()
      );
    }
    
    await dbRun(ctx.db, 'COMMIT');
  } catch (error) {
    await dbRun(ctx.db, 'ROLLBACK');
    throw error;
  }
}

/**
 * Get events for a specific world and chat with filtering options
 */
async function getEventsByWorldAndChat(
  ctx: SQLiteEventStorageContext,
  worldId: string,
  chatId: string | null,
  options: GetEventsOptions = {}
): Promise<StoredEvent[]> {
  await ensureInitialized(ctx);
  
  const whereClauses: string[] = ['world_id = ?'];
  const params: any[] = [worldId];
  
  // Handle chatId (including NULL case)
  if (chatId === null) {
    whereClauses.push('chat_id IS NULL');
  } else {
    whereClauses.push('chat_id = ?');
    params.push(chatId);
  }
  
  // Add optional filters
  if (options.sinceSeq !== undefined) {
    whereClauses.push('seq > ?');
    params.push(options.sinceSeq);
  }
  
  if (options.sinceTime !== undefined) {
    whereClauses.push('created_at > ?');
    params.push(options.sinceTime.toISOString());
  }
  
  if (options.types && options.types.length > 0) {
    const placeholders = options.types.map(() => '?').join(', ');
    whereClauses.push(`type IN (${placeholders})`);
    params.push(...options.types);
  }
  
  // Build query
  let sql = `SELECT id, world_id, chat_id, seq, type, payload, meta, created_at
             FROM events
             WHERE ${whereClauses.join(' AND ')}`;
  
  // Add ordering
  const order = options.order || 'asc';
  sql += ` ORDER BY seq ${order.toUpperCase()}, created_at ${order.toUpperCase()}`;
  
  // Add limit
  if (options.limit) {
    sql += ` LIMIT ?`;
    params.push(options.limit);
  }
  
  const rows = await dbAll(ctx.db, sql, ...params);
  
  // Parse JSON fields and convert to StoredEvent
  return rows.map(row => ({
    id: row.id,
    worldId: row.world_id,
    chatId: row.chat_id,
    seq: row.seq,
    type: row.type,
    payload: JSON.parse(row.payload),
    meta: row.meta ? JSON.parse(row.meta) : undefined,
    createdAt: new Date(row.created_at)
  }));
}

/**
 * Delete all events for a specific world and chat
 */
async function deleteEventsByWorldAndChat(
  ctx: SQLiteEventStorageContext,
  worldId: string,
  chatId: string | null
): Promise<number> {
  await ensureInitialized(ctx);
  
  let sql: string;
  let params: any[];
  
  if (chatId === null) {
    sql = 'DELETE FROM events WHERE world_id = ? AND chat_id IS NULL';
    params = [worldId];
  } else {
    sql = 'DELETE FROM events WHERE world_id = ? AND chat_id = ?';
    params = [worldId, chatId];
  }
  
  const result = await dbRun(ctx.db, sql, ...params);
  return (result as any).changes || 0;
}

/**
 * Delete all events for a specific world (all chats)
 */
async function deleteEventsByWorld(
  ctx: SQLiteEventStorageContext,
  worldId: string
): Promise<number> {
  await ensureInitialized(ctx);
  
  const result = await dbRun(ctx.db, 'DELETE FROM events WHERE world_id = ?', worldId);
  return (result as any).changes || 0;
}
