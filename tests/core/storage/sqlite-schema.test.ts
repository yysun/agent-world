/**
 * SQLite Schema Utility Behavioral Tests
 *
 * Purpose:
 * - Validate sqlite-schema utility logic without using real filesystem or sqlite database files.
 *
 * Key features:
 * - PRAGMA configuration behavior
 * - Schema version/integrity/stats helper queries
 * - Context creation error handling and db close semantics
 *
 * Implementation notes:
 * - Uses callback-compatible in-memory db fakes only.
 * - Mocks sqlite3 dynamic import path when testing context creation.
 *
 * Recent changes:
 * - 2026-02-27: Added targeted production-path tests for core/storage/sqlite-schema.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import type { SQLiteSchemaContext } from '../../../core/storage/sqlite-schema.js';
import {
  closeSchema,
  configurePragmas,
  createSQLiteSchemaContext,
  getDatabase,
  getDatabaseStats,
  getSchemaVersion,
  setSchemaVersion,
  validateIntegrity,
} from '../../../core/storage/sqlite-schema.js';

type Callback<T> = (err: Error | null, result?: T) => void;

function createDbMock() {
  return {
    run: vi.fn((sql: string, cb?: (err?: Error | null) => void) => cb?.(null)),
    get: vi.fn(),
    all: vi.fn(),
    close: vi.fn((cb: (err?: Error | null) => void) => cb(null)),
  };
}

function asContext(db: any): SQLiteSchemaContext {
  return {
    db,
    config: { database: '/tmp/agent-world-test.db' },
    isInitialized: true,
  };
}

describe('sqlite-schema utilities', () => {
  const originalWindow = (globalThis as any).window;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
    vi.restoreAllMocks();
  });

  it('configures default pragmas and respects explicit disables', () => {
    const db = createDbMock();

    configurePragmas({
      db: db as any,
      config: {
        database: '/tmp/file.db',
        busyTimeout: 5000,
        cacheSize: -4096,
      },
    });

    expect(db.run).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
    expect(db.run).toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
    expect(db.run).toHaveBeenCalledWith('PRAGMA busy_timeout = 5000');
    expect(db.run).toHaveBeenCalledWith('PRAGMA cache_size = -4096');

    db.run.mockClear();
    configurePragmas({
      db: db as any,
      config: {
        database: '/tmp/file.db',
        enableWAL: false,
        enableForeignKeys: false,
      },
    });
    expect(db.run).not.toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
    expect(db.run).not.toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
  });

  it('returns schema version and supports schema version updates', async () => {
    const db = createDbMock();
    db.get.mockImplementation((sql: string, cb: Callback<{ user_version: number }>) => {
      cb(null, { user_version: 7 });
    });

    const ctx = asContext(db);
    await expect(getSchemaVersion(ctx)).resolves.toBe(7);

    await setSchemaVersion(ctx, 9);
    expect(db.run).toHaveBeenCalledWith('PRAGMA user_version = 9', expect.any(Function));
  });

  it('returns zero schema version when pragma query fails', async () => {
    const db = createDbMock();
    db.get.mockImplementation((sql: string, cb: Callback<{ user_version: number }>) => {
      cb(new Error('db unavailable'));
    });

    await expect(getSchemaVersion(asContext(db))).resolves.toBe(0);
  });

  it('validates integrity and reports failures from checks', async () => {
    const okDb = createDbMock();
    okDb.get.mockImplementation((sql: string, cb: Callback<any>) => {
      if (sql === 'PRAGMA integrity_check') cb(null, { integrity_check: 'ok' });
      else cb(null, {});
    });
    okDb.all.mockImplementation((sql: string, cb: Callback<any[]>) => cb(null, []));

    await expect(validateIntegrity(asContext(okDb))).resolves.toEqual({ isValid: true, errors: [] });

    const badDb = createDbMock();
    badDb.get.mockImplementation((sql: string, cb: Callback<any>) => {
      if (sql === 'PRAGMA integrity_check') cb(null, { integrity_check: 'corrupt-page' });
      else cb(null, {});
    });
    badDb.all.mockImplementation((sql: string, cb: Callback<any[]>) => cb(null, [{ rowid: 1 }]));

    const result = await validateIntegrity(asContext(badDb));
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Database integrity check failed: corrupt-page');
    expect(result.errors).toContain('Foreign key constraint violations: 1');
  });

  it('collects aggregate database stats from expected queries', async () => {
    const db = createDbMock();
    db.get.mockImplementation((sql: string, cb: Callback<any>) => {
      const map: Record<string, any> = {
        'SELECT COUNT(*) as count FROM worlds': { count: 2 },
        'SELECT COUNT(*) as count FROM agents': { count: 5 },
        'SELECT COUNT(*) as count FROM agent_memory': { count: 11 },
        'SELECT COUNT(*) as count FROM memory_archives': { count: 3 },
        'SELECT COUNT(*) as count FROM archived_messages': { count: 27 },
        'PRAGMA page_count': { page_count: 100 },
      };
      cb(null, map[sql] ?? { count: 0 });
    });

    await expect(getDatabaseStats(asContext(db))).resolves.toEqual({
      worldCount: 2,
      agentCount: 5,
      activeMemoryCount: 11,
      archiveCount: 3,
      archivedMessageCount: 27,
      databaseSize: 409600,
    });
  });

  it('returns db reference and resolves close callback', async () => {
    const db = createDbMock();
    const ctx = asContext(db);

    expect(getDatabase(ctx)).toBe(db);
    await expect(closeSchema(ctx)).resolves.toBeUndefined();
    expect(db.close).toHaveBeenCalledTimes(1);
  });

  it('rejects sqlite context creation in browser environment', async () => {
    (globalThis as any).window = {};

    await expect(createSQLiteSchemaContext({ database: '/tmp/ignored.db' })).rejects.toThrow(
      'SQLite not available in browser environment'
    );
  });

  it('creates sqlite context with mocked sqlite3 module and parent dir creation', async () => {
    const runSpy = vi.fn();
    class FakeDatabase {
      public run = runSpy;
      constructor(public dbPath: string) {}
    }

    vi.doMock('sqlite3', () => ({
      default: {
        Database: FakeDatabase,
      },
    }));
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);

    const ctx = await createSQLiteSchemaContext({
      database: '/tmp/agent-world/schema-test.db',
      busyTimeout: 1234,
      cacheSize: -2048,
    });

    expect(mkdirSpy).toHaveBeenCalledWith('/tmp/agent-world', { recursive: true });
    expect((ctx.db as any).dbPath).toBe('/tmp/agent-world/schema-test.db');
    expect(runSpy).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
    expect(runSpy).toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
    expect(runSpy).toHaveBeenCalledWith('PRAGMA busy_timeout = 1234');
    expect(runSpy).toHaveBeenCalledWith('PRAGMA cache_size = -2048');
  });
});
