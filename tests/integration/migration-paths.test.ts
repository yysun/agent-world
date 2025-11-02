/**
 * Integration Tests for Database Migration Paths
 * 
 * Purpose: Verify all migration paths work correctly with production SQL files
 * 
 * Coverage:
 * - Fresh database (v0 → v9)
 * - Historical versions (v1 → v9, v2 → v9, etc.)
 * - Incremental migrations (v4 → v5, v5 → v6, etc.)
 * - Data preservation during migrations
 * - Schema integrity after migrations
 * 
 * Implementation:
 * - 2025-11-02: Initial comprehensive migration path testing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'sqlite3';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getCurrentVersion,
  setVersion,
  ensureMigrationTable,
  recordMigration,
  runMigrations,
  getMigrationStatus,
  needsMigration
} from '../../core/storage/migration-runner.js';

describe('Migration Path Integration Tests', () => {
  let testDb: Database;
  let testDbPath: string;
  const migrationsDir = path.join(process.cwd(), 'migrations');

  beforeEach(async () => {
    // Create temporary database
    testDbPath = path.join(os.tmpdir(), `test-migration-paths-${Date.now()}.db`);
    testDb = new Database(testDbPath);
  });

  afterEach(async () => {
    // Close database
    await new Promise<void>((resolve) => {
      testDb.close(() => resolve());
    });

    // Clean up
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  describe('Fresh Database Migration', () => {
    it('should migrate from v0 to latest (v9) with all production migrations', async () => {
      const run = promisify(testDb.run.bind(testDb));
      const all = promisify(testDb.all.bind(testDb));

      // Verify starting at v0
      expect(await getCurrentVersion(testDb)).toBe(0);
      expect(await needsMigration(testDb, migrationsDir)).toBe(true);

      // Run migrations
      await runMigrations({ db: testDb, migrationsDir });

      // Verify final version
      expect(await getCurrentVersion(testDb)).toBe(9);

      // Verify all tables exist
      const tables = await all(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ) as any[];

      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('worlds');
      expect(tableNames).toContain('agents');
      expect(tableNames).toContain('agent_memory');
      expect(tableNames).toContain('world_chats');
      expect(tableNames).toContain('events');
      expect(tableNames).toContain('event_sequences');
      expect(tableNames).toContain('memory_archives');
      expect(tableNames).toContain('archived_messages');
      expect(tableNames).toContain('archive_statistics');

      // Verify agent_memory has all columns from incremental migrations
      const columns = await all('PRAGMA table_info(agent_memory)') as any[];
      const columnNames = columns.map((c: any) => c.name);

      expect(columnNames).toContain('chat_id'); // v1
      expect(columnNames).toContain('message_id'); // v5
      expect(columnNames).toContain('reply_to_message_id'); // v6

      // Verify worlds has all columns
      const worldColumns = await all('PRAGMA table_info(worlds)') as any[];
      const worldColumnNames = worldColumns.map((c: any) => c.name);

      expect(worldColumnNames).toContain('chat_llm_provider'); // v2
      expect(worldColumnNames).toContain('chat_llm_model'); // v2
      expect(worldColumnNames).toContain('current_chat_id'); // v3
      expect(worldColumnNames).toContain('mcp_config'); // v4

      // Verify indexes exist
      const indexes = await all(
        "SELECT name FROM sqlite_master WHERE type='index'"
      ) as any[];
      const indexNames = indexes.map(i => i.name);

      expect(indexNames).toContain('idx_agent_memory_chat_id');
      expect(indexNames).toContain('idx_agent_memory_message_id');
      expect(indexNames).toContain('idx_agent_memory_reply_to_message_id');
      expect(indexNames).toContain('idx_events_world_chat_time');
      expect(indexNames).toContain('idx_event_sequences_world_chat');
    });
  });

  describe('Historical Version Migrations', () => {
    /**
     * Helper to create a database at a specific schema version
     * This simulates a database that was created at an older version
     */
    async function createDbAtVersion(version: number): Promise<void> {
      const run = promisify(testDb.run.bind(testDb));

      // Apply migrations up to the target version
      await ensureMigrationTable(testDb);

      // For versions 1-9, we need to apply migrations 0 through (version-1)
      // But we want to stop at 'version', so apply 0 through version
      const allMigrations = [
        { v: 0, file: '0000_init_base_schema.sql' },
        { v: 1, file: '0001_add_chat_id.sql' },
        { v: 2, file: '0002_add_llm_config.sql' },
        { v: 3, file: '0003_add_current_chat_id.sql' },
        { v: 4, file: '0004_add_mcp_config.sql' },
        { v: 5, file: '0005_add_message_id.sql' },
        { v: 6, file: '0006_add_reply_to_message_id.sql' },
        { v: 7, file: '0007_create_world_chats.sql' },
        { v: 8, file: '0008_create_events_table.sql' },
        { v: 9, file: '0009_add_event_sequences.sql' }
      ];

      // Apply migrations up to and including target version
      for (const migration of allMigrations) {
        if (migration.v > version) break;

        const migrationPath = path.join(migrationsDir, migration.file);
        const sql = fs.readFileSync(migrationPath, 'utf8');

        // Execute the migration SQL
        await run(sql);
        await recordMigration(testDb, migration.v, migration.file.replace('.sql', ''));
      }

      // Set the version
      await setVersion(testDb, version);
    }

    it('should migrate from v1 (chat_id) to v9', async () => {
      await createDbAtVersion(1);
      expect(await getCurrentVersion(testDb)).toBe(1);

      await runMigrations({ db: testDb, migrationsDir });
      expect(await getCurrentVersion(testDb)).toBe(9);

      // Verify new columns exist
      const all = promisify(testDb.all.bind(testDb));
      const worldColumns = await all('PRAGMA table_info(worlds)') as any[];
      const worldColumnNames = worldColumns.map((c: any) => c.name);

      expect(worldColumnNames).toContain('mcp_config');
      expect(worldColumnNames).toContain('current_chat_id');
    });

    it('should migrate from v4 (mcp_config) to v9', async () => {
      // v4 was the production version before this commit - critical test!
      await createDbAtVersion(4);
      expect(await getCurrentVersion(testDb)).toBe(4);

      // Add test data to verify preservation
      const run = promisify(testDb.run.bind(testDb));
      await run(`
        INSERT INTO worlds (id, name, description, turn_limit, mcp_config)
        VALUES ('test-world', 'Test World', 'Test', 10, '{"servers":[]}')
      `);

      await runMigrations({ db: testDb, migrationsDir });
      expect(await getCurrentVersion(testDb)).toBe(9);

      // Verify data preserved
      const get = promisify(testDb.get.bind(testDb));
      const world = await get(
        "SELECT * FROM worlds WHERE id = 'test-world'"
      ) as any;

      expect(world).toBeDefined();
      expect(world.name).toBe('Test World');
      expect(world.mcp_config).toBe('{"servers":[]}');

      // Verify new columns exist
      const all = promisify(testDb.all.bind(testDb));
      const memoryColumns = await all('PRAGMA table_info(agent_memory)') as any[];
      const memoryColumnNames = memoryColumns.map((c: any) => c.name);

      expect(memoryColumnNames).toContain('message_id');
      expect(memoryColumnNames).toContain('reply_to_message_id');
    });

    it('should migrate from v7 (world_chats) to v9', async () => {
      await createDbAtVersion(7);
      expect(await getCurrentVersion(testDb)).toBe(7);

      await runMigrations({ db: testDb, migrationsDir });
      expect(await getCurrentVersion(testDb)).toBe(9);

      // Verify events system exists
      const all = promisify(testDb.all.bind(testDb));
      const tables = await all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('events', 'event_sequences')"
      ) as any[];

      expect(tables).toHaveLength(2);
    });
  });

  describe('Incremental Migration Steps', () => {
    /**
     * Test each individual migration step to ensure they work correctly
     */

    async function createDbAtVersion(version: number): Promise<void> {
      const run = promisify(testDb.run.bind(testDb));
      await ensureMigrationTable(testDb);

      const allMigrations = [
        { v: 0, file: '0000_init_base_schema.sql' },
        { v: 1, file: '0001_add_chat_id.sql' },
        { v: 2, file: '0002_add_llm_config.sql' },
        { v: 3, file: '0003_add_current_chat_id.sql' },
        { v: 4, file: '0004_add_mcp_config.sql' },
        { v: 5, file: '0005_add_message_id.sql' },
        { v: 6, file: '0006_add_reply_to_message_id.sql' },
        { v: 7, file: '0007_create_world_chats.sql' },
        { v: 8, file: '0008_create_events_table.sql' },
        { v: 9, file: '0009_add_event_sequences.sql' }
      ];

      for (const migration of allMigrations) {
        if (migration.v > version) break;
        const migrationPath = path.join(migrationsDir, migration.file);
        const sql = fs.readFileSync(migrationPath, 'utf8');
        await run(sql);
        await recordMigration(testDb, migration.v, migration.file.replace('.sql', ''));
      }
      await setVersion(testDb, version);
    }

    it('should migrate v4 → v5 (add message_id)', async () => {
      await createDbAtVersion(4);

      // Manually apply just v5 migration
      const run = promisify(testDb.run.bind(testDb));
      const migrationPath = path.join(migrationsDir, '0005_add_message_id.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      await run(sql);
      await recordMigration(testDb, 5, 'add_message_id');
      await setVersion(testDb, 5);

      // Verify message_id column exists
      const all = promisify(testDb.all.bind(testDb));
      const columns = await all('PRAGMA table_info(agent_memory)') as any[];
      const columnNames = columns.map((c: any) => c.name);

      expect(columnNames).toContain('message_id');

      // Verify index exists
      const indexes = await all(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_agent_memory_message_id'"
      ) as any[];

      expect(indexes).toHaveLength(1);
    });

    it('should migrate v5 → v6 (add reply_to_message_id)', async () => {
      await createDbAtVersion(5);

      const run = promisify(testDb.run.bind(testDb));
      const migrationPath = path.join(migrationsDir, '0006_add_reply_to_message_id.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      await run(sql);
      await recordMigration(testDb, 6, 'add_reply_to_message_id');
      await setVersion(testDb, 6);

      // Verify reply_to_message_id column exists
      const all = promisify(testDb.all.bind(testDb));
      const columns = await all('PRAGMA table_info(agent_memory)') as any[];
      const columnNames = columns.map((c: any) => c.name);

      expect(columnNames).toContain('reply_to_message_id');

      // Verify index exists
      const indexes = await all(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_agent_memory_reply_to_message_id'"
      ) as any[];

      expect(indexes).toHaveLength(1);
    });

    it('should migrate v6 → v7 (create world_chats)', async () => {
      await createDbAtVersion(6);

      const run = promisify(testDb.run.bind(testDb));
      const migrationPath = path.join(migrationsDir, '0007_create_world_chats.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      await run(sql);
      await recordMigration(testDb, 7, 'create_world_chats');
      await setVersion(testDb, 7);

      // Verify world_chats table exists
      const all = promisify(testDb.all.bind(testDb));
      const tables = await all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='world_chats'"
      ) as any[];

      expect(tables).toHaveLength(1);

      // Verify columns
      const columns = await all('PRAGMA table_info(world_chats)') as any[];
      const columnNames = columns.map((c: any) => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('world_id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('message_count');
      expect(columnNames).toContain('tags');
    });

    it('should migrate v7 → v8 (create events table)', async () => {
      await createDbAtVersion(7);

      const run = promisify(testDb.run.bind(testDb));
      const migrationPath = path.join(migrationsDir, '0008_create_events_table.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      await run(sql);
      await recordMigration(testDb, 8, 'create_events_table');
      await setVersion(testDb, 8);

      // Verify events table exists
      const all = promisify(testDb.all.bind(testDb));
      const tables = await all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='events'"
      ) as any[];

      expect(tables).toHaveLength(1);

      // Verify indexes
      const indexes = await all(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_events_%'"
      ) as any[];

      expect(indexes.length).toBeGreaterThanOrEqual(3); // world_chat_time, world_chat_seq, type, world_id
    });

    it('should migrate v8 → v9 (add event sequences)', async () => {
      await createDbAtVersion(8);

      const run = promisify(testDb.run.bind(testDb));
      const migrationPath = path.join(migrationsDir, '0009_add_event_sequences.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      await run(sql);
      await recordMigration(testDb, 9, 'add_event_sequences');
      await setVersion(testDb, 9);

      // Verify event_sequences table exists
      const all = promisify(testDb.all.bind(testDb));
      const tables = await all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='event_sequences'"
      ) as any[];

      expect(tables).toHaveLength(1);

      // Verify columns
      const columns = await all('PRAGMA table_info(event_sequences)') as any[];
      const columnNames = columns.map((c: any) => c.name);

      expect(columnNames).toContain('world_id');
      expect(columnNames).toContain('chat_id');
      expect(columnNames).toContain('last_seq');
    });
  });

  describe('Data Preservation During Migrations', () => {
    async function createDbAtVersion(version: number): Promise<void> {
      const run = promisify(testDb.run.bind(testDb));
      await ensureMigrationTable(testDb);

      const allMigrations = [
        { v: 0, file: '0000_init_base_schema.sql' },
        { v: 1, file: '0001_add_chat_id.sql' },
        { v: 2, file: '0002_add_llm_config.sql' },
        { v: 3, file: '0003_add_current_chat_id.sql' },
        { v: 4, file: '0004_add_mcp_config.sql' },
        { v: 5, file: '0005_add_message_id.sql' },
        { v: 6, file: '0006_add_reply_to_message_id.sql' },
        { v: 7, file: '0007_create_world_chats.sql' },
        { v: 8, file: '0008_create_events_table.sql' },
        { v: 9, file: '0009_add_event_sequences.sql' }
      ];

      for (const migration of allMigrations) {
        if (migration.v > version) break;
        const migrationPath = path.join(migrationsDir, migration.file);
        const sql = fs.readFileSync(migrationPath, 'utf8');
        await run(sql);
        await recordMigration(testDb, migration.v, migration.file.replace('.sql', ''));
      }
      await setVersion(testDb, version);
    }

    it('should preserve world data when migrating v4 → v9', async () => {
      await createDbAtVersion(4);

      // Insert test data
      const run = promisify(testDb.run.bind(testDb));
      await run(`
        INSERT INTO worlds (id, name, description, turn_limit, chat_llm_provider, chat_llm_model, current_chat_id, mcp_config)
        VALUES (
          'test-world',
          'Production World',
          'Important production data',
          20,
          'anthropic',
          'claude-3-sonnet',
          'chat-123',
          '{"servers":[{"name":"test","command":"test"}]}'
        )
      `);

      // Run migrations
      await runMigrations({ db: testDb, migrationsDir });

      // Verify data preserved
      const get = promisify(testDb.get.bind(testDb));
      const world = await get("SELECT * FROM worlds WHERE id = 'test-world'") as any;

      expect(world.name).toBe('Production World');
      expect(world.description).toBe('Important production data');
      expect(world.turn_limit).toBe(20);
      expect(world.chat_llm_provider).toBe('anthropic');
      expect(world.chat_llm_model).toBe('claude-3-sonnet');
      expect(world.current_chat_id).toBe('chat-123');
      expect(world.mcp_config).toBe('{"servers":[{"name":"test","command":"test"}]}');
    });

    it('should preserve agent memory when migrating v4 → v9', async () => {
      await createDbAtVersion(4);

      // Insert test data
      const run = promisify(testDb.run.bind(testDb));
      await run(`
        INSERT INTO worlds (id, name, description, turn_limit)
        VALUES ('test-world', 'Test', 'Test', 10)
      `);

      await run(`
        INSERT INTO agents (id, world_id, name, type, status, provider, model)
        VALUES ('agent-1', 'test-world', 'Test Agent', 'assistant', 'active', 'openai', 'gpt-4')
      `);

      await run(`
        INSERT INTO agent_memory (agent_id, world_id, role, content, sender, chat_id)
        VALUES ('agent-1', 'test-world', 'user', 'Important conversation', 'user-1', 'chat-1')
      `);

      // Run migrations
      await runMigrations({ db: testDb, migrationsDir });

      // Verify data preserved
      const all = promisify(testDb.all.bind(testDb));
      const memories = await all(
        "SELECT * FROM agent_memory WHERE agent_id = 'agent-1'"
      ) as any[];

      expect(memories).toHaveLength(1);
      expect(memories[0].content).toBe('Important conversation');
      expect(memories[0].sender).toBe('user-1');
      expect(memories[0].chat_id).toBe('chat-1');

      // Verify new columns exist (should be NULL for old data)
      expect(memories[0].message_id).toBeNull();
      expect(memories[0].reply_to_message_id).toBeNull();
    });
  });

  describe('Migration Status Tracking', () => {
    async function createDbAtVersion(version: number): Promise<void> {
      const run = promisify(testDb.run.bind(testDb));
      await ensureMigrationTable(testDb);

      const allMigrations = [
        { v: 0, file: '0000_init_base_schema.sql' },
        { v: 1, file: '0001_add_chat_id.sql' },
        { v: 2, file: '0002_add_llm_config.sql' },
        { v: 3, file: '0003_add_current_chat_id.sql' },
        { v: 4, file: '0004_add_mcp_config.sql' },
        { v: 5, file: '0005_add_message_id.sql' },
        { v: 6, file: '0006_add_reply_to_message_id.sql' },
        { v: 7, file: '0007_create_world_chats.sql' },
        { v: 8, file: '0008_create_events_table.sql' },
        { v: 9, file: '0009_add_event_sequences.sql' }
      ];

      for (const migration of allMigrations) {
        if (migration.v > version) break;
        const migrationPath = path.join(migrationsDir, migration.file);
        const sql = fs.readFileSync(migrationPath, 'utf8');
        await run(sql);
        await recordMigration(testDb, migration.v, migration.file.replace('.sql', ''));
      }
      await setVersion(testDb, version);
    }

    it('should track applied migrations correctly', async () => {
      await createDbAtVersion(4);

      const statusBefore = await getMigrationStatus({
        db: testDb,
        migrationsDir
      });

      expect(statusBefore.currentVersion).toBe(4);
      expect(statusBefore.pendingMigrations.length).toBeGreaterThan(0);
      expect(statusBefore.appliedMigrations).toHaveLength(5); // 0-4 inclusive

      await runMigrations({ db: testDb, migrationsDir });

      const statusAfter = await getMigrationStatus({
        db: testDb,
        migrationsDir
      });

      expect(statusAfter.currentVersion).toBe(9);
      expect(statusAfter.pendingMigrations).toHaveLength(0);
      expect(statusAfter.appliedMigrations).toHaveLength(10); // 0-9 inclusive
    });
  });

  describe('Error Handling During Migrations', () => {
    async function createDbAtVersion(version: number): Promise<void> {
      const run = promisify(testDb.run.bind(testDb));
      await ensureMigrationTable(testDb);

      const allMigrations = [
        { v: 0, file: '0000_init_base_schema.sql' },
        { v: 1, file: '0001_add_chat_id.sql' },
        { v: 2, file: '0002_add_llm_config.sql' },
        { v: 3, file: '0003_add_current_chat_id.sql' },
        { v: 4, file: '0004_add_mcp_config.sql' },
        { v: 5, file: '0005_add_message_id.sql' },
        { v: 6, file: '0006_add_reply_to_message_id.sql' },
        { v: 7, file: '0007_create_world_chats.sql' },
        { v: 8, file: '0008_create_events_table.sql' },
        { v: 9, file: '0009_add_event_sequences.sql' }
      ];

      for (const migration of allMigrations) {
        if (migration.v > version) break;
        const migrationPath = path.join(migrationsDir, migration.file);
        const sql = fs.readFileSync(migrationPath, 'utf8');
        await run(sql);
        await recordMigration(testDb, migration.v, migration.file.replace('.sql', ''));
      }
      await setVersion(testDb, version);
    }

    it('should handle migration from version without migration table', async () => {
      // Simulate old database that doesn't have schema_migrations table
      await createDbAtVersion(0);

      // Remove migration tracking table to simulate very old database
      const run = promisify(testDb.run.bind(testDb));
      await run('DROP TABLE IF EXISTS schema_migrations');

      // Should still be able to migrate
      await runMigrations({ db: testDb, migrationsDir });

      expect(await getCurrentVersion(testDb)).toBe(9);
    });
  });
});
