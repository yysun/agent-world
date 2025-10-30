/**
 * SQLite Event Storage Implementation
 * 
 * Database-backed event storage using SQLite with transactions.
 * 
 * Features:
 * - Persistent storage with SQLite database
 * - Transaction support for batch inserts
 * - Automatic sequence generation using MAX(seq) + 1
 * - Foreign key cascade deletion via triggers
 * - Efficient querying with indexes
 * 
 * Implementation:
 * - Uses existing DB client from sqlite-storage pattern
 * - Creates events table if missing
 * - Uses transactions for batch operations
 * - Handles sequence generation atomically
 * 
 * Changes:
 * - 2025-10-30: Initial implementation
 */

import { nanoid } from 'nanoid';
import type { Database } from 'sqlite3';
import { EventStorage, EventRecord, EventQueryOpts } from './types.js';

/**
 * SQLite context for event storage
 */
export interface SQLiteEventStorageContext {
  db: Database;
}

/**
 * Create SQLite event storage context
 */
export async function createSQLiteEventStorageContext(db: Database): Promise<SQLiteEventStorageContext> {
  const ctx = { db };
  await ensureEventsTable(ctx);
  return ctx;
}

/**
 * Ensure events table exists
 */
async function ensureEventsTable(ctx: SQLiteEventStorageContext): Promise<void> {
  await run(ctx.db, `
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
      chat_id TEXT,
      seq INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload TEXT,
      meta TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(world_id, chat_id, seq)
    )
  `);

  await run(ctx.db, `
    CREATE INDEX IF NOT EXISTS idx_events_world_chat_seq 
      ON events(world_id, chat_id, seq)
  `);

  await run(ctx.db, `
    CREATE INDEX IF NOT EXISTS idx_events_world_chat_created 
      ON events(world_id, chat_id, created_at)
  `);

  await run(ctx.db, `
    CREATE INDEX IF NOT EXISTS idx_events_type 
      ON events(type)
  `);

  // Create triggers for cascade deletion if worlds and world_chats tables exist
  const tablesExist = await checkTablesExist(ctx.db);
  
  if (tablesExist.worlds) {
    await run(ctx.db, `
      CREATE TRIGGER IF NOT EXISTS trg_delete_events_on_world_delete
      AFTER DELETE ON worlds
      FOR EACH ROW
      BEGIN
        DELETE FROM events WHERE world_id = OLD.id;
      END
    `);
  }

  if (tablesExist.world_chats) {
    await run(ctx.db, `
      CREATE TRIGGER IF NOT EXISTS trg_delete_events_on_chat_delete
      AFTER DELETE ON world_chats
      FOR EACH ROW
      BEGIN
        DELETE FROM events WHERE world_id = OLD.world_id AND chat_id = OLD.id;
      END
    `);
  }
}

/**
 * Check if worlds and world_chats tables exist
 */
async function checkTablesExist(db: Database): Promise<{ worlds: boolean; world_chats: boolean }> {
  const worldsExist = await get(db, `
    SELECT name FROM sqlite_master WHERE type='table' AND name='worlds'
  `);

  const chatsExist = await get(db, `
    SELECT name FROM sqlite_master WHERE type='table' AND name='world_chats'
  `);

  return {
    worlds: !!worldsExist,
    world_chats: !!chatsExist
  };
}

/**
 * Helper to run SQL commands
 */
function run(db: Database, sql: string, ...params: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

/**
 * Helper to get single row
 */
function get(db: Database, sql: string, ...params: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Helper to get all rows
 */
function all(db: Database, sql: string, ...params: any[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * SQLite event storage implementation
 */
export class SQLiteEventStorage implements EventStorage {
  constructor(private ctx: SQLiteEventStorageContext) {}

  async getNextSeq(worldId: string, chatId: string | null): Promise<number> {
    const result = await get(
      this.ctx.db,
      `SELECT COALESCE(MAX(seq), 0) as maxSeq FROM events WHERE world_id = ? AND chat_id IS ?`,
      worldId,
      chatId
    );
    return (result?.maxSeq || 0) + 1;
  }

  async saveEvent(event: Omit<EventRecord, 'id' | 'seq' | 'createdAt'>): Promise<EventRecord> {
    const id = nanoid();
    const seq = await this.getNextSeq(event.worldId, event.chatId);
    const createdAt = new Date();

    await run(
      this.ctx.db,
      `INSERT INTO events (id, world_id, chat_id, seq, type, payload, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      event.worldId,
      event.chatId,
      seq,
      event.type,
      JSON.stringify(event.payload),
      event.meta ? JSON.stringify(event.meta) : null,
      createdAt.toISOString()
    );

    return {
      id,
      worldId: event.worldId,
      chatId: event.chatId,
      seq,
      type: event.type,
      payload: event.payload,
      meta: event.meta,
      createdAt
    };
  }

  async saveEvents(events: Array<Omit<EventRecord, 'id' | 'seq' | 'createdAt'>>): Promise<EventRecord[]> {
    const results: EventRecord[] = [];

    // Use transaction for batch insert
    await run(this.ctx.db, 'BEGIN TRANSACTION');

    try {
      for (const event of events) {
        const id = nanoid();
        const seq = await this.getNextSeq(event.worldId, event.chatId);
        const createdAt = new Date();

        await run(
          this.ctx.db,
          `INSERT INTO events (id, world_id, chat_id, seq, type, payload, meta, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          id,
          event.worldId,
          event.chatId,
          seq,
          event.type,
          JSON.stringify(event.payload),
          event.meta ? JSON.stringify(event.meta) : null,
          createdAt.toISOString()
        );

        results.push({
          id,
          worldId: event.worldId,
          chatId: event.chatId,
          seq,
          type: event.type,
          payload: event.payload,
          meta: event.meta,
          createdAt
        });
      }

      await run(this.ctx.db, 'COMMIT');
    } catch (error) {
      await run(this.ctx.db, 'ROLLBACK');
      throw error;
    }

    return results;
  }

  async getEventsByWorldAndChat(opts: EventQueryOpts): Promise<EventRecord[]> {
    const { worldId, chatId, type, limit, offset = 0, startSeq, endSeq, startDate, endDate } = opts;

    const whereClauses: string[] = ['world_id = ?'];
    const params: any[] = [worldId];

    if (chatId !== undefined) {
      whereClauses.push('chat_id IS ?');
      params.push(chatId);
    }

    if (type) {
      whereClauses.push('type = ?');
      params.push(type);
    }

    if (startSeq !== undefined) {
      whereClauses.push('seq >= ?');
      params.push(startSeq);
    }

    if (endSeq !== undefined) {
      whereClauses.push('seq <= ?');
      params.push(endSeq);
    }

    if (startDate) {
      whereClauses.push('created_at >= ?');
      params.push(startDate.toISOString());
    }

    if (endDate) {
      whereClauses.push('created_at <= ?');
      params.push(endDate.toISOString());
    }

    let sql = `
      SELECT id, world_id as worldId, chat_id as chatId, seq, type, payload, meta, created_at as createdAt
      FROM events
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY seq ASC
    `;

    if (limit !== undefined && limit > 0) {
      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);
    }

    const rows = await all(this.ctx.db, sql, ...params);

    return rows.map((row: any) => ({
      id: row.id,
      worldId: row.worldId,
      chatId: row.chatId,
      seq: row.seq,
      type: row.type,
      payload: row.payload ? JSON.parse(row.payload) : null,
      meta: row.meta ? JSON.parse(row.meta) : null,
      createdAt: new Date(row.createdAt)
    }));
  }

  async deleteEventsByWorldAndChat(worldId: string, chatId: string | null): Promise<number> {
    const result = await run(
      this.ctx.db,
      `DELETE FROM events WHERE world_id = ? AND chat_id IS ?`,
      worldId,
      chatId
    );
    return result.changes || 0;
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ctx.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

/**
 * Create SQLite event storage instance
 */
export function createSQLiteEventStorage(db: Database): Promise<EventStorage> {
  return createSQLiteEventStorageContext(db).then(ctx => new SQLiteEventStorage(ctx));
}
