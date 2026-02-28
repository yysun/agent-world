/**
 * SQLite Event Storage Behavioral Tests
 *
 * Purpose:
 * - Validate sqlite event storage behavior through the production API using a deterministic fake DB.
 *
 * Key features covered:
 * - Single and batch event persistence
 * - Filtering, ordering, and range queries
 * - Latest sequence lookup
 * - Chat-scoped and world-scoped deletion
 *
 * Implementation notes:
 * - Uses an in-memory fake sqlite-like DB object (`run/get/all` callbacks)
 * - Avoids real filesystem and real sqlite usage in unit tests
 * - Uses `system` event types to bypass message/tool metadata requirements
 *
 * Recent changes:
 * - 2026-02-27: Added direct execution tests for sqlite event storage paths.
 */

import { describe, expect, it } from 'vitest';
import { createSQLiteEventStorage } from '../../../core/storage/eventStorage/sqliteEventStorage.js';
import type { StoredEvent } from '../../../core/storage/eventStorage/types.js';

type EventRow = {
  id: string;
  world_id: string;
  chat_id: string | null;
  seq: number;
  type: string;
  payload: string;
  meta: string | null;
  created_at: string;
};

type FakeDatabase = {
  run: (sql: string, params: any[], callback: (error: Error | null) => void) => void;
  get: (sql: string, params: any[], callback: (error: Error | null, row?: any) => void) => void;
  all: (sql: string, params: any[], callback: (error: Error | null, rows?: any[]) => void) => void;
};

function createFakeDb(): FakeDatabase {
  const rows: EventRow[] = [];
  let tableExists = false;
  let nextSeq = 1;

  function filterRows(sql: string, params: any[]): EventRow[] {
    let index = 0;
    let output = [...rows];

    if (sql.includes('world_id = ?')) {
      const worldId = params[index++];
      output = output.filter((row) => row.world_id === worldId);
    }

    if (sql.includes('chat_id IS NULL')) {
      output = output.filter((row) => row.chat_id === null);
    } else if (sql.includes('chat_id = ?')) {
      const chatId = params[index++];
      output = output.filter((row) => row.chat_id === chatId);
    }

    if (sql.includes('seq > ?')) {
      const sinceSeq = Number(params[index++]);
      output = output.filter((row) => row.seq > sinceSeq);
    }

    if (sql.includes('created_at > ?')) {
      const sinceIso = String(params[index++]);
      output = output.filter((row) => row.created_at > sinceIso);
    }

    if (sql.includes('seq >= ? AND seq <= ?')) {
      const fromSeq = Number(params[index++]);
      const toSeq = Number(params[index++]);
      output = output.filter((row) => row.seq >= fromSeq && row.seq <= toSeq);
    }

    const typeInMatch = sql.match(/type IN \(([^)]+)\)/);
    if (typeInMatch) {
      const count = (typeInMatch[1].match(/\?/g) ?? []).length;
      const types = params.slice(index, index + count).map(String);
      index += count;
      output = output.filter((row) => types.includes(row.type));
    }

    if (/ORDER BY\s+seq\s+DESC/i.test(sql)) {
      output.sort((a, b) => b.seq - a.seq || b.created_at.localeCompare(a.created_at));
    } else {
      output.sort((a, b) => a.seq - b.seq || a.created_at.localeCompare(b.created_at));
    }

    if (sql.includes('LIMIT ?')) {
      const limit = Number(params[params.length - 1]);
      output = output.slice(0, limit);
    }

    return output;
  }

  return {
    run(sql, params, callback) {
      const statement = sql.replace(/\s+/g, ' ').trim();

      if (statement.startsWith('CREATE TABLE IF NOT EXISTS events')) {
        tableExists = true;
        callback.call({ changes: 0 } as any, null);
        return;
      }

      if (statement.startsWith('CREATE INDEX IF NOT EXISTS')) {
        callback.call({ changes: 0 } as any, null);
        return;
      }

      if (
        statement.startsWith('BEGIN TRANSACTION') ||
        statement.startsWith('COMMIT') ||
        statement.startsWith('ROLLBACK')
      ) {
        callback.call({ changes: 0 } as any, null);
        return;
      }

      if (statement.startsWith('INSERT OR IGNORE INTO events')) {
        const [id, worldId, chatId, type, payload, meta, createdAt] = params;
        const duplicate = rows.find((row) => row.id === id);
        if (!duplicate) {
          rows.push({
            id: String(id),
            world_id: String(worldId),
            chat_id: chatId === null ? null : String(chatId),
            seq: nextSeq++,
            type: String(type),
            payload: String(payload),
            meta: meta === null || meta === undefined ? null : String(meta),
            created_at: String(createdAt),
          });
        }
        callback.call({ changes: duplicate ? 0 : 1 } as any, null);
        return;
      }

      if (statement.startsWith('DELETE FROM events')) {
        const before = rows.length;
        const retained = filterRows(
          statement.replace('DELETE FROM events', 'SELECT id, world_id, chat_id, seq, type, payload, meta, created_at FROM events'),
          params,
        );
        const retainedIds = new Set(retained.map((row) => row.id));
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (retainedIds.has(rows[i].id)) {
            rows.splice(i, 1);
          }
        }
        callback.call({ changes: before - rows.length } as any, null);
        return;
      }

      callback.call({ changes: 0 } as any, null);
    },

    get(sql, params, callback) {
      const statement = sql.replace(/\s+/g, ' ').trim();

      if (statement.includes("sqlite_master") && statement.includes("name='events'")) {
        callback(null, tableExists ? { name: 'events' } : undefined);
        return;
      }

      if (statement.includes('COALESCE(MAX(seq), 0) as latestSeq')) {
        const worldId = String(params[0]);
        const chatId = params[1] === null ? null : String(params[1]);
        const matching = rows.filter(
          (row) =>
            row.world_id === worldId &&
            (chatId === null ? row.chat_id === null : row.chat_id === chatId),
        );
        const latestSeq = matching.reduce((max, row) => Math.max(max, row.seq), 0);
        callback(null, { latestSeq });
        return;
      }

      callback(null, undefined);
    },

    all(sql, params, callback) {
      const statement = sql.replace(/\s+/g, ' ').trim();
      if (!statement.includes('FROM events')) {
        callback(null, []);
        return;
      }
      callback(null, filterRows(statement, params));
    },
  };
}

function createSystemEvent(input: {
  id: string;
  worldId: string;
  chatId: string | null;
  createdAt: string;
  payloadValue: string;
  type?: string;
}): StoredEvent {
  return {
    id: input.id,
    worldId: input.worldId,
    chatId: input.chatId,
    type: input.type ?? 'system',
    payload: { value: input.payloadValue },
    meta: { source: 'test' },
    createdAt: new Date(input.createdAt),
  };
}

describe('sqlite-event-storage behavior', () => {
  it('saves events and queries by chat with filters', async () => {
    const storage = await createSQLiteEventStorage(createFakeDb() as any);

    await storage.saveEvent(
      createSystemEvent({
        id: 'evt-1',
        worldId: 'w-1',
        chatId: 'chat-a',
        createdAt: '2026-02-27T10:00:00.000Z',
        payloadValue: 'first',
      }),
    );

    await storage.saveEvent(
      createSystemEvent({
        id: 'evt-2',
        worldId: 'w-1',
        chatId: 'chat-a',
        createdAt: '2026-02-27T10:01:00.000Z',
        payloadValue: 'second',
        type: 'sse',
      }),
    );

    await storage.saveEvent(
      createSystemEvent({
        id: 'evt-3',
        worldId: 'w-1',
        chatId: null,
        createdAt: '2026-02-27T10:02:00.000Z',
        payloadValue: 'null-chat',
      }),
    );

    const chatEvents = await storage.getEventsByWorldAndChat('w-1', 'chat-a', {
      types: ['system'],
      order: 'asc',
    });

    expect(chatEvents).toHaveLength(1);
    expect(chatEvents[0].id).toBe('evt-1');
    expect(chatEvents[0].payload.value).toBe('first');

    const nullChatEvents = await storage.getEventsByWorldAndChat('w-1', null);
    expect(nullChatEvents).toHaveLength(1);
    expect(nullChatEvents[0].id).toBe('evt-3');
  });

  it('supports batch save, latest seq, and range queries', async () => {
    const storage = await createSQLiteEventStorage(createFakeDb() as any);

    await storage.saveEvents([
      createSystemEvent({
        id: 'evt-10',
        worldId: 'w-2',
        chatId: 'chat-b',
        createdAt: '2026-02-27T11:00:00.000Z',
        payloadValue: 'one',
      }),
      createSystemEvent({
        id: 'evt-11',
        worldId: 'w-2',
        chatId: 'chat-b',
        createdAt: '2026-02-27T11:01:00.000Z',
        payloadValue: 'two',
      }),
      createSystemEvent({
        id: 'evt-12',
        worldId: 'w-2',
        chatId: 'chat-b',
        createdAt: '2026-02-27T11:02:00.000Z',
        payloadValue: 'three',
      }),
    ]);

    const latest = await storage.getLatestSeq('w-2', 'chat-b');
    expect(latest).toBe(3);

    const range = await storage.getEventRange('w-2', 'chat-b', 2, 3);
    expect(range).toHaveLength(2);
    expect(range.map((event) => event.id)).toEqual(['evt-11', 'evt-12']);

    const descendingLimited = await storage.getEventsByWorldAndChat('w-2', 'chat-b', {
      order: 'desc',
      limit: 1,
    });
    expect(descendingLimited).toHaveLength(1);
    expect(descendingLimited[0].id).toBe('evt-12');
  });

  it('deletes events by world/chat and by world', async () => {
    const storage = await createSQLiteEventStorage(createFakeDb() as any);

    await storage.saveEvents([
      createSystemEvent({
        id: 'evt-20',
        worldId: 'w-3',
        chatId: 'chat-c',
        createdAt: '2026-02-27T12:00:00.000Z',
        payloadValue: 'a',
      }),
      createSystemEvent({
        id: 'evt-21',
        worldId: 'w-3',
        chatId: 'chat-c',
        createdAt: '2026-02-27T12:01:00.000Z',
        payloadValue: 'b',
      }),
      createSystemEvent({
        id: 'evt-22',
        worldId: 'w-3',
        chatId: 'chat-d',
        createdAt: '2026-02-27T12:02:00.000Z',
        payloadValue: 'c',
      }),
      createSystemEvent({
        id: 'evt-23',
        worldId: 'w-4',
        chatId: 'chat-z',
        createdAt: '2026-02-27T12:03:00.000Z',
        payloadValue: 'd',
      }),
    ]);

    const deletedChat = await storage.deleteEventsByWorldAndChat('w-3', 'chat-c');
    expect(deletedChat).toBe(2);

    const remainingW3 = await storage.getEventsByWorldAndChat('w-3', 'chat-d');
    expect(remainingW3).toHaveLength(1);

    const deletedWorld = await storage.deleteEventsByWorld('w-3');
    expect(deletedWorld).toBe(1);

    const remainingW4 = await storage.getEventsByWorldAndChat('w-4', 'chat-z');
    expect(remainingW4).toHaveLength(1);
  });
});
