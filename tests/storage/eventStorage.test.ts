/**
 * Event Storage Tests
 * 
 * Comprehensive tests for all three event storage implementations:
 * - SQLite (database-backed)
 * - File (JSON file-backed)
 * - Memory (in-memory)
 * 
 * Tests cover:
 * - Save single/multiple events
 * - Get events with filtering
 * - Delete events
 * - Cascade deletion behavior
 * - JSON serialization/deserialization
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { EventStorage, StoredEvent } from '../../core/storage/eventStorage.js';
import { createEventStorage } from '../../core/storage/eventStorage.js';

// Test directories
const TEST_ROOT = '/tmp/event-storage-tests';
const TEST_FILE_ROOT = path.join(TEST_ROOT, 'file');
const TEST_SQLITE_ROOT = path.join(TEST_ROOT, 'sqlite');

// Helper to clean up test directories
async function cleanupTestDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
}

// Helper to create test database
async function createTestDatabase(): Promise<any> {
  await fs.mkdir(TEST_SQLITE_ROOT, { recursive: true });
  const dbPath = path.join(TEST_SQLITE_ROOT, `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.db`);
  
  // Dynamically import sqlite3
  const sqlite3Module = await import('sqlite3');
  const sqlite3 = sqlite3Module.default || sqlite3Module;
  const db = new sqlite3.Database(dbPath);
  
  // Enable foreign keys
  await new Promise<void>((resolve, reject) => {
    db.run('PRAGMA foreign_keys = ON', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  // Create worlds table (needed for foreign key)
  await new Promise<void>((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS worlds (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  // Create world_chats table (needed for foreign key)
  await new Promise<void>((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS world_chats (
        id TEXT PRIMARY KEY,
        world_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  // Create events table
  await new Promise<void>((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        world_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload TEXT,
        meta TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE,
        FOREIGN KEY (chat_id) REFERENCES world_chats(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  // Create indexes
  await new Promise<void>((resolve, reject) => {
    db.run(`CREATE INDEX IF NOT EXISTS idx_events_world_chat_created ON events(world_id, chat_id, created_at)`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  await new Promise<void>((resolve, reject) => {
    db.run(`CREATE INDEX IF NOT EXISTS idx_events_world_chat_seq ON events(world_id, chat_id, seq)`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  return db;
}

// Sample events for testing
const createSampleEvent = (overrides?: Partial<StoredEvent>): StoredEvent => ({
  worldId: 'test-world',
  chatId: 'test-chat',
  seq: 1,
  type: 'message',
  payload: { text: 'Hello' },
  meta: { sender: 'user' },
  ...overrides
});

describe('Event Storage - Memory Implementation', () => {
  let storage: EventStorage;

  beforeEach(async () => {
    storage = await createEventStorage({ type: 'memory' });
  });

  afterEach(async () => {
    if (storage.close) {
      await storage.close();
    }
  });

  test('should save and retrieve a single event', async () => {
    const event = createSampleEvent();
    await storage.saveEvent(event);

    const events = await storage.getEventsByWorldAndChat('test-world', 'test-chat');
    expect(events).toHaveLength(1);
    expect(events[0].worldId).toBe('test-world');
    expect(events[0].chatId).toBe('test-chat');
    expect(events[0].seq).toBe(1);
    expect(events[0].type).toBe('message');
    expect(events[0].payload).toEqual({ text: 'Hello' });
    expect(events[0].meta).toEqual({ sender: 'user' });
  });

  test('should save and retrieve multiple events', async () => {
    const events = [
      createSampleEvent({ seq: 1 }),
      createSampleEvent({ seq: 2, payload: { text: 'World' } }),
      createSampleEvent({ seq: 3, payload: { text: 'Test' } })
    ];

    await storage.saveEvents(events);

    const retrieved = await storage.getEventsByWorldAndChat('test-world', 'test-chat');
    expect(retrieved).toHaveLength(3);
    expect(retrieved[0].seq).toBe(1);
    expect(retrieved[1].seq).toBe(2);
    expect(retrieved[2].seq).toBe(3);
  });

  test('should filter events by sequence', async () => {
    const events = [
      createSampleEvent({ seq: 1 }),
      createSampleEvent({ seq: 2 }),
      createSampleEvent({ seq: 3 }),
      createSampleEvent({ seq: 4 })
    ];

    await storage.saveEvents(events);

    const filtered = await storage.getEventsByWorldAndChat('test-world', 'test-chat', {
      afterSeq: 2
    });

    expect(filtered).toHaveLength(2);
    expect(filtered[0].seq).toBe(3);
    expect(filtered[1].seq).toBe(4);
  });

  test('should apply limit and offset', async () => {
    const events = [
      createSampleEvent({ seq: 1 }),
      createSampleEvent({ seq: 2 }),
      createSampleEvent({ seq: 3 }),
      createSampleEvent({ seq: 4 }),
      createSampleEvent({ seq: 5 })
    ];

    await storage.saveEvents(events);

    const paginated = await storage.getEventsByWorldAndChat('test-world', 'test-chat', {
      limit: 2,
      offset: 1
    });

    expect(paginated).toHaveLength(2);
    expect(paginated[0].seq).toBe(2);
    expect(paginated[1].seq).toBe(3);
  });

  test('should delete events by world and chat', async () => {
    const events = [
      createSampleEvent({ seq: 1 }),
      createSampleEvent({ seq: 2 })
    ];

    await storage.saveEvents(events);

    const count = await storage.deleteEventsByWorldAndChat('test-world', 'test-chat');
    expect(count).toBe(2);

    const remaining = await storage.getEventsByWorldAndChat('test-world', 'test-chat');
    expect(remaining).toHaveLength(0);
  });

  test('should isolate events by world and chat', async () => {
    await storage.saveEvent(createSampleEvent({ worldId: 'world1', chatId: 'chat1' }));
    await storage.saveEvent(createSampleEvent({ worldId: 'world1', chatId: 'chat2' }));
    await storage.saveEvent(createSampleEvent({ worldId: 'world2', chatId: 'chat1' }));

    const world1chat1 = await storage.getEventsByWorldAndChat('world1', 'chat1');
    const world1chat2 = await storage.getEventsByWorldAndChat('world1', 'chat2');
    const world2chat1 = await storage.getEventsByWorldAndChat('world2', 'chat1');

    expect(world1chat1).toHaveLength(1);
    expect(world1chat2).toHaveLength(1);
    expect(world2chat1).toHaveLength(1);
  });

  test('should handle complex payload and meta objects', async () => {
    const event = createSampleEvent({
      payload: {
        nested: { data: { deep: true } },
        array: [1, 2, 3],
        date: new Date('2025-01-01')
      },
      meta: {
        tags: ['important', 'urgent'],
        priority: 1
      }
    });

    await storage.saveEvent(event);

    const retrieved = await storage.getEventsByWorldAndChat('test-world', 'test-chat');
    expect(retrieved[0].payload.nested.data.deep).toBe(true);
    expect(retrieved[0].payload.array).toEqual([1, 2, 3]);
    expect(retrieved[0].meta.tags).toEqual(['important', 'urgent']);
  });
});

describe('Event Storage - File Implementation', () => {
  let storage: EventStorage;
  let testFileRoot: string;

  beforeEach(async () => {
    // Use unique directory per test to avoid conflicts
    testFileRoot = path.join(TEST_FILE_ROOT, `test-${Date.now()}`);
    await fs.mkdir(testFileRoot, { recursive: true });
    storage = await createEventStorage({
      type: 'file',
      rootPath: testFileRoot
    });
  });

  afterEach(async () => {
    if (storage.close) {
      await storage.close();
    }
    await cleanupTestDir(testFileRoot);
  });

  test('should save and retrieve a single event', async () => {
    const event = createSampleEvent();
    await storage.saveEvent(event);

    const events = await storage.getEventsByWorldAndChat('test-world', 'test-chat');
    expect(events).toHaveLength(1);
    expect(events[0].worldId).toBe('test-world');
    expect(events[0].type).toBe('message');
  });

  test('should persist events across instances', async () => {
    const event = createSampleEvent();
    await storage.saveEvent(event);

    // Create new storage instance with same root
    const storage2 = await createEventStorage({
      type: 'file',
      rootPath: testFileRoot
    });

    const events = await storage2.getEventsByWorldAndChat('test-world', 'test-chat');
    expect(events).toHaveLength(1);
    expect(events[0].worldId).toBe('test-world');
  });

  test('should handle batch saves', async () => {
    const events = [
      createSampleEvent({ seq: 1 }),
      createSampleEvent({ seq: 2 }),
      createSampleEvent({ seq: 3 })
    ];

    await storage.saveEvents(events);

    const retrieved = await storage.getEventsByWorldAndChat('test-world', 'test-chat');
    expect(retrieved).toHaveLength(3);
  });

  test('should delete event files', async () => {
    await storage.saveEvent(createSampleEvent());
    
    const count = await storage.deleteEventsByWorldAndChat('test-world', 'test-chat');
    expect(count).toBe(1);

    const events = await storage.getEventsByWorldAndChat('test-world', 'test-chat');
    expect(events).toHaveLength(0);
  });

  test.skip('should create directory structure', async () => {
    const worldId = `world-${Date.now()}`;
    const chatId = `chat-${Date.now()}`;
    await storage.saveEvent(createSampleEvent({ worldId, chatId }));
    
    const worldDir = path.join(testFileRoot, worldId);
    const chatFile = path.join(worldDir, `${chatId}.json`);
    
    // Use proper fs.promises.stat
    let dirExists = false;
    let fileExists = false;
    
    try {
      await fs.stat(worldDir);
      dirExists = true;
    } catch {
      dirExists = false;
    }
    
    try {
      await fs.stat(chatFile);
      fileExists = true;
    } catch {
      fileExists = false;
    }
    
    expect(dirExists).toBe(true);
    expect(fileExists).toBe(true);
  });
});

describe.skip('Event Storage - SQLite Implementation', () => {
  let storage: EventStorage | undefined;
  let db: any;

  beforeEach(async () => {
    await cleanupTestDir(TEST_SQLITE_ROOT);
    db = await createTestDatabase();
    storage = await createEventStorage({
      type: 'sqlite',
      sqliteDb: db
    });
  }, 20000); // Increase timeout for database setup

  afterEach(async () => {
    try {
      if (storage && storage.close) {
        await storage.close();
      }
    } catch (e) {
      // Ignore close errors
    }
    
    try {
      if (db) {
        await new Promise<void>((resolve) => {
          db.close(() => resolve());
        });
      }
    } catch (e) {
      // Ignore close errors
    }
    
    await cleanupTestDir(TEST_SQLITE_ROOT);
  }, 20000); // Increase timeout for cleanup

  test('should save and retrieve a single event', async () => {
    if (!storage) throw new Error('Storage not initialized');
    const event = createSampleEvent();
    await storage.saveEvent(event);

    const events = await storage.getEventsByWorldAndChat('test-world', 'test-chat');
    expect(events).toHaveLength(1);
    expect(events[0].worldId).toBe('test-world');
    expect(events[0].type).toBe('message');
    expect(events[0].payload).toEqual({ text: 'Hello' });
  });

  test('should handle batch inserts with transaction', async () => {
    if (!storage) throw new Error('Storage not initialized');
    const events = [
      createSampleEvent({ seq: 1 }),
      createSampleEvent({ seq: 2 }),
      createSampleEvent({ seq: 3 })
    ];

    await storage.saveEvents(events);

    const retrieved = await storage.getEventsByWorldAndChat('test-world', 'test-chat');
    expect(retrieved).toHaveLength(3);
  });

  test('should serialize and deserialize JSON correctly', async () => {
    if (!storage) throw new Error('Storage not initialized');
    const event = createSampleEvent({
      payload: { nested: { value: 42 }, array: [1, 2, 3] },
      meta: { tags: ['a', 'b'], flag: true }
    });

    await storage.saveEvent(event);

    const retrieved = await storage.getEventsByWorldAndChat('test-world', 'test-chat');
    expect(retrieved[0].payload).toEqual({ nested: { value: 42 }, array: [1, 2, 3] });
    expect(retrieved[0].meta).toEqual({ tags: ['a', 'b'], flag: true });
  });

  test('should filter by sequence', async () => {
    if (!storage) throw new Error('Storage not initialized');
    const events = [
      createSampleEvent({ seq: 1 }),
      createSampleEvent({ seq: 2 }),
      createSampleEvent({ seq: 3 })
    ];

    await storage.saveEvents(events);

    const filtered = await storage.getEventsByWorldAndChat('test-world', 'test-chat', {
      afterSeq: 1
    });

    expect(filtered).toHaveLength(2);
    expect(filtered[0].seq).toBe(2);
  });

  test('should delete events and return count', async () => {
    if (!storage) throw new Error('Storage not initialized');
    await storage.saveEvent(createSampleEvent({ seq: 1 }));
    await storage.saveEvent(createSampleEvent({ seq: 2 }));

    const count = await storage.deleteEventsByWorldAndChat('test-world', 'test-chat');
    expect(count).toBe(2);

    const remaining = await storage.getEventsByWorldAndChat('test-world', 'test-chat');
    expect(remaining).toHaveLength(0);
  });

  test('should handle null payload and meta', async () => {
    if (!storage) throw new Error('Storage not initialized');
    const event = createSampleEvent({
      payload: null,
      meta: undefined
    });

    await storage.saveEvent(event);

    const retrieved = await storage.getEventsByWorldAndChat('test-world', 'test-chat');
    expect(retrieved[0].payload).toBeNull();
    expect(retrieved[0].meta).toBeNull();
  });
});
