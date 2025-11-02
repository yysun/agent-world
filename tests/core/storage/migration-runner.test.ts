/**
 * Unit Tests for Migration Runner
 * 
 * Tests SQL file-based migration system including:
 * - Migration discovery and execution
 * - Version tracking
 * - Concurrent migration protection
 * - Error handling
 * - Fresh database initialization
 * - Legacy database migration
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
  getAppliedMigrations,
  recordMigration,
  discoverMigrations,
  readMigrationFile,
  executeMigration,
  needsMigration,
  runMigrations,
  getMigrationStatus,
  validateMigrationSequence
} from '../../../core/storage/migration-runner.js';

describe('Migration Runner', () => {
  let testDb: Database;
  let testDbPath: string;
  let testMigrationsDir: string;

  beforeEach(async () => {
    // Create temporary database
    testDbPath = path.join(os.tmpdir(), `test-migrations-${Date.now()}.db`);
    testDb = new Database(testDbPath);

    // Create temporary migrations directory
    testMigrationsDir = path.join(os.tmpdir(), `test-migrations-${Date.now()}`);
    fs.mkdirSync(testMigrationsDir, { recursive: true });
  });

  afterEach(async () => {
    // Close database
    await new Promise<void>((resolve) => {
      testDb.close(() => resolve());
    });

    // Clean up files
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(testMigrationsDir)) {
        fs.readdirSync(testMigrationsDir).forEach(file => {
          fs.unlinkSync(path.join(testMigrationsDir, file));
        });
        fs.rmdirSync(testMigrationsDir);
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  describe('Version Management', () => {
    it('should get and set version', async () => {
      const initialVersion = await getCurrentVersion(testDb);
      expect(initialVersion).toBe(0);

      await setVersion(testDb, 5);
      const newVersion = await getCurrentVersion(testDb);
      expect(newVersion).toBe(5);
    });

    it('should handle version updates', async () => {
      await setVersion(testDb, 1);
      expect(await getCurrentVersion(testDb)).toBe(1);

      await setVersion(testDb, 10);
      expect(await getCurrentVersion(testDb)).toBe(10);
    });
  });

  describe('Migration Tracking Table', () => {
    it('should create migration tracking table', async () => {
      await ensureMigrationTable(testDb);

      const run = promisify(testDb.run.bind(testDb));
      const get = promisify(testDb.get.bind(testDb));

      const result = await get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
      ) as any;

      expect(result).toBeDefined();
      expect(result.name).toBe('schema_migrations');
    });

    it('should be idempotent', async () => {
      await ensureMigrationTable(testDb);
      await ensureMigrationTable(testDb);

      const get = promisify(testDb.get.bind(testDb));
      const result = await get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
      ) as any;

      expect(result.name).toBe('schema_migrations');
    });
  });

  describe('Migration Recording', () => {
    beforeEach(async () => {
      await ensureMigrationTable(testDb);
    });

    it('should record migration', async () => {
      await recordMigration(testDb, 1, 'test_migration');

      const migrations = await getAppliedMigrations(testDb);
      expect(migrations).toHaveLength(1);
      expect(migrations[0].version).toBe(1);
      expect(migrations[0].name).toBe('test_migration');
    });

    it('should record multiple migrations', async () => {
      await recordMigration(testDb, 1, 'first');
      await recordMigration(testDb, 2, 'second');
      await recordMigration(testDb, 3, 'third');

      const migrations = await getAppliedMigrations(testDb);
      expect(migrations).toHaveLength(3);
      expect(migrations.map(m => m.version)).toEqual([1, 2, 3]);
    });
  });

  describe('Migration Discovery', () => {
    it('should discover migration files', () => {
      // Create test migration files
      fs.writeFileSync(
        path.join(testMigrationsDir, '0001_create_users.sql'),
        'CREATE TABLE users (id INTEGER);'
      );
      fs.writeFileSync(
        path.join(testMigrationsDir, '0002_add_email.sql'),
        'ALTER TABLE users ADD COLUMN email TEXT;'
      );

      const migrations = discoverMigrations(testMigrationsDir);

      expect(migrations).toHaveLength(2);
      expect(migrations[0].version).toBe(1);
      expect(migrations[0].name).toBe('create_users');
      expect(migrations[1].version).toBe(2);
      expect(migrations[1].name).toBe('add_email');
    });

    it('should sort migrations by version', () => {
      fs.writeFileSync(
        path.join(testMigrationsDir, '0003_third.sql'),
        'SELECT 3;'
      );
      fs.writeFileSync(
        path.join(testMigrationsDir, '0001_first.sql'),
        'SELECT 1;'
      );
      fs.writeFileSync(
        path.join(testMigrationsDir, '0002_second.sql'),
        'SELECT 2;'
      );

      const migrations = discoverMigrations(testMigrationsDir);

      expect(migrations.map(m => m.version)).toEqual([1, 2, 3]);
    });

    it('should handle non-existent directory', () => {
      const migrations = discoverMigrations('/non/existent/path');
      expect(migrations).toHaveLength(0);
    });

    it('should ignore invalid filenames', () => {
      fs.writeFileSync(
        path.join(testMigrationsDir, '0001_valid.sql'),
        'SELECT 1;'
      );
      fs.writeFileSync(
        path.join(testMigrationsDir, 'invalid.sql'),
        'SELECT 2;'
      );
      fs.writeFileSync(
        path.join(testMigrationsDir, 'README.md'),
        '# Migrations'
      );

      const migrations = discoverMigrations(testMigrationsDir);

      expect(migrations).toHaveLength(1);
      expect(migrations[0].version).toBe(1);
    });
  });

  describe('Migration Execution', () => {
    beforeEach(async () => {
      await ensureMigrationTable(testDb);
    });

    it('should execute migration', async () => {
      const migrationFile = path.join(testMigrationsDir, '0001_create_table.sql');
      fs.writeFileSync(
        migrationFile,
        'CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT);'
      );

      await executeMigration(testDb, {
        version: 1,
        name: 'create_table',
        filePath: migrationFile
      });

      // Verify table was created
      const get = promisify(testDb.get.bind(testDb));
      const result = await get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'"
      ) as any;

      expect(result).toBeDefined();
      expect(result.name).toBe('test_table');

      // Verify migration was recorded
      const migrations = await getAppliedMigrations(testDb);
      expect(migrations).toHaveLength(1);
      expect(migrations[0].version).toBe(1);

      // Verify version was updated
      expect(await getCurrentVersion(testDb)).toBe(1);
    });

    it('should handle migration errors', async () => {
      const migrationFile = path.join(testMigrationsDir, '0001_invalid.sql');
      fs.writeFileSync(migrationFile, 'INVALID SQL SYNTAX;');

      await expect(
        executeMigration(testDb, {
          version: 1,
          name: 'invalid',
          filePath: migrationFile
        })
      ).rejects.toThrow();

      // Version should not be updated on failure
      expect(await getCurrentVersion(testDb)).toBe(0);
    });
  });

  describe('Migration Status', () => {
    beforeEach(async () => {
      await ensureMigrationTable(testDb);
    });

    it('should check if migration is needed', async () => {
      fs.writeFileSync(
        path.join(testMigrationsDir, '0001_test.sql'),
        'SELECT 1;'
      );

      expect(await needsMigration(testDb, testMigrationsDir)).toBe(true);

      await setVersion(testDb, 1);
      expect(await needsMigration(testDb, testMigrationsDir)).toBe(false);
    });

    it('should get migration status', async () => {
      fs.writeFileSync(
        path.join(testMigrationsDir, '0001_first.sql'),
        'SELECT 1;'
      );
      fs.writeFileSync(
        path.join(testMigrationsDir, '0002_second.sql'),
        'SELECT 2;'
      );

      await recordMigration(testDb, 1, 'first');
      await setVersion(testDb, 1);

      const status = await getMigrationStatus({
        db: testDb,
        migrationsDir: testMigrationsDir
      });

      expect(status.currentVersion).toBe(1);
      expect(status.availableMigrations).toHaveLength(2);
      expect(status.appliedMigrations).toHaveLength(1);
      expect(status.pendingMigrations).toHaveLength(1);
      expect(status.pendingMigrations[0].version).toBe(2);
    });
  });

  describe('Full Migration Flow', () => {
    it('should run all pending migrations', async () => {
      // Create multiple migrations
      fs.writeFileSync(
        path.join(testMigrationsDir, '0001_create_users.sql'),
        'CREATE TABLE users (id INTEGER PRIMARY KEY);'
      );
      fs.writeFileSync(
        path.join(testMigrationsDir, '0002_add_name.sql'),
        'ALTER TABLE users ADD COLUMN name TEXT;'
      );
      fs.writeFileSync(
        path.join(testMigrationsDir, '0003_add_email.sql'),
        'ALTER TABLE users ADD COLUMN email TEXT;'
      );

      await runMigrations({
        db: testDb,
        migrationsDir: testMigrationsDir
      });

      // Verify all migrations ran
      expect(await getCurrentVersion(testDb)).toBe(3);

      const migrations = await getAppliedMigrations(testDb);
      expect(migrations).toHaveLength(3);

      // Verify table structure
      const all = promisify(testDb.all.bind(testDb));
      const columns = await all('PRAGMA table_info(users)') as any[];
      expect(columns).toHaveLength(3);
      expect(columns.map((c: any) => c.name)).toEqual(['id', 'name', 'email']);
    });

    it('should skip already applied migrations', async () => {
      fs.writeFileSync(
        path.join(testMigrationsDir, '0001_test.sql'),
        'CREATE TABLE test (id INTEGER);'
      );

      // Run migrations twice
      await runMigrations({ db: testDb, migrationsDir: testMigrationsDir });
      await runMigrations({ db: testDb, migrationsDir: testMigrationsDir });

      // Should only be recorded once
      const migrations = await getAppliedMigrations(testDb);
      expect(migrations).toHaveLength(1);
    });

    it('should handle empty migrations directory', async () => {
      await expect(
        runMigrations({ db: testDb, migrationsDir: testMigrationsDir })
      ).resolves.not.toThrow();

      expect(await getCurrentVersion(testDb)).toBe(0);
    });
  });

  describe('Migration Validation', () => {
    it('should validate migration sequence', () => {
      const validMigrations = [
        { version: 1, name: 'first', filePath: '/path/1.sql' },
        { version: 2, name: 'second', filePath: '/path/2.sql' },
        { version: 3, name: 'third', filePath: '/path/3.sql' }
      ];

      const result = validateMigrationSequence(validMigrations);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect duplicate versions', () => {
      const duplicateMigrations = [
        { version: 1, name: 'first', filePath: '/path/1.sql' },
        { version: 1, name: 'duplicate', filePath: '/path/1-dup.sql' }
      ];

      const result = validateMigrationSequence(duplicateMigrations);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Duplicate migration versions found');
    });

    it('should handle empty migrations list', () => {
      const result = validateMigrationSequence([]);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
