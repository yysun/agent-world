/**
 * Migration Runner Behavioral Tests
 *
 * Purpose:
 * - Validate SQL migration discovery and execution behavior using in-memory fake DB callbacks.
 *
 * Key features:
 * - Discovery and ordering of migration files.
 * - Success + idempotency for repeated runMigrations calls.
 * - Failure handling with retry safety after lock cleanup.
 * - Concurrent migration lock behavior for same database key.
 *
 * Notes:
 * - Uses mocked fs module from global vitest setup (no filesystem access).
 * - Uses callback-compatible fake DB object (no real SQLite engine).
 */

import * as fs from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  discoverMigrations,
  getAppliedMigrations,
  getCurrentVersion,
  needsMigration,
  runMigrations,
  validateMigrationSequence,
} from '../../../core/storage/migration-runner.js';

type FakeDbOptions = {
  dbPath?: string;
  initialVersion?: number;
  failOnExecIncludes?: string | null;
  execDelayMs?: number;
};

type FakeDbState = {
  userVersion: number;
  execSql: string[];
  runSql: string[];
  applied: Array<{ version: number; name: string; applied_at: string }>;
  failOnExecIncludes: string | null;
};

function createFakeDb(options: FakeDbOptions = {}) {
  const state: FakeDbState = {
    userVersion: options.initialVersion ?? 0,
    execSql: [],
    runSql: [],
    applied: [],
    failOnExecIncludes: options.failOnExecIncludes ?? null,
  };

  const db: any = {
    filename: options.dbPath ?? '/tmp/migration-runner-test.db',
    serialize(callback: () => void) {
      callback();
    },
    exec(sql: string, callback?: (err: Error | null) => void) {
      state.execSql.push(sql);
      const run = () => {
        if (state.failOnExecIncludes && sql.includes(state.failOnExecIncludes)) {
          callback?.(new Error('migration boom'));
          return;
        }
        callback?.(null);
      };

      if ((options.execDelayMs ?? 0) > 0) {
        setTimeout(run, options.execDelayMs);
      } else {
        run();
      }
    },
    get(sql: string, callback: (err: Error | null, row?: any) => void) {
      if (sql.includes('PRAGMA user_version')) {
        callback(null, { user_version: state.userVersion });
        return;
      }
      callback(null, undefined);
    },
    all(sql: string, callback: (err: Error | null, rows?: any[]) => void) {
      if (sql.includes('FROM schema_migrations')) {
        callback(null, [...state.applied]);
        return;
      }
      callback(null, []);
    },
    run(
      sql: string,
      paramsOrCb?: any[] | ((err: Error | null) => void),
      cbMaybe?: (err: Error | null) => void
    ) {
      state.runSql.push(sql);
      const params = Array.isArray(paramsOrCb) ? paramsOrCb : [];
      const callback = (typeof paramsOrCb === 'function' ? paramsOrCb : cbMaybe) as
        | ((err: Error | null) => void)
        | undefined;

      const versionMatch = sql.match(/PRAGMA user_version = (\d+)/);
      if (versionMatch) {
        state.userVersion = Number(versionMatch[1]);
      }

      if (sql.includes('INSERT INTO schema_migrations')) {
        state.applied.push({
          version: Number(params[0]),
          name: String(params[1]),
          applied_at: new Date().toISOString(),
        });
      }

      callback?.(null);
    },
  };

  return {
    db,
    state,
    setFailFragment(value: string | null) {
      state.failOnExecIncludes = value;
    },
  };
}

describe('migration-runner behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync as any).mockReturnValue(true);
    vi.mocked(fs.readdirSync as any).mockReturnValue([]);
    vi.mocked(fs.readFileSync as any).mockReturnValue('');
  });

  it('discovers valid SQL migrations in numeric order and ignores invalid filenames', () => {
    vi.mocked(fs.readdirSync as any).mockReturnValue([
      '0002_add_tools.sql',
      'README.md',
      'invalid-name.sql',
      '0000_base.sql',
      '0001_add_worlds.sql',
    ]);

    const migrations = discoverMigrations('/migrations');
    expect(migrations.map((m) => m.version)).toEqual([0, 1, 2]);
    expect(migrations.map((m) => m.name)).toEqual(['base', 'add_worlds', 'add_tools']);
    expect(validateMigrationSequence(migrations)).toEqual({ isValid: true, errors: [] });
  });

  it('runs pending migrations and becomes idempotent on subsequent runs', async () => {
    const sqlByPath: Record<string, string> = {
      '/migrations/0000_base.sql': 'CREATE TABLE worlds(id TEXT PRIMARY KEY);',
      '/migrations/0001_add_agents.sql': 'CREATE TABLE agents(id TEXT PRIMARY KEY);',
    };

    vi.mocked(fs.readdirSync as any).mockReturnValue([
      '0001_add_agents.sql',
      '0000_base.sql',
    ]);
    vi.mocked(fs.readFileSync as any).mockImplementation((filePath: string) => sqlByPath[filePath]);

    const fake = createFakeDb({ initialVersion: 0 });
    const ctx = { db: fake.db, migrationsDir: '/migrations' };

    expect(await needsMigration(fake.db, '/migrations')).toBe(true);
    await runMigrations(ctx);

    expect(fake.state.execSql).toHaveLength(2);
    expect(await getCurrentVersion(fake.db)).toBe(1);

    const applied = await getAppliedMigrations(fake.db);
    expect(applied.map((row) => row.version)).toEqual([0, 1]);

    await runMigrations(ctx);
    expect(fake.state.execSql).toHaveLength(2);
    expect(await needsMigration(fake.db, '/migrations')).toBe(false);
  });

  it('releases migration lock on failure so a follow-up retry can succeed', async () => {
    let badMigrationSql = 'BROKEN STATEMENT';
    vi.mocked(fs.readdirSync as any).mockReturnValue([
      '0001_good.sql',
      '0002_bad.sql',
    ]);
    vi.mocked(fs.readFileSync as any).mockImplementation((filePath: string) => {
      if (filePath.endsWith('0001_good.sql')) {
        return 'CREATE TABLE good(id TEXT PRIMARY KEY);';
      }
      return badMigrationSql;
    });

    const fake = createFakeDb({ initialVersion: 0, failOnExecIncludes: 'BROKEN' });
    const ctx = { db: fake.db, migrationsDir: '/migrations' };

    await expect(runMigrations(ctx)).rejects.toThrow('migration boom');
    expect(await getCurrentVersion(fake.db)).toBe(1);

    badMigrationSql = 'CREATE TABLE repaired(id TEXT PRIMARY KEY);';
    fake.setFailFragment(null);

    await expect(runMigrations(ctx)).resolves.toBeUndefined();
    expect(await getCurrentVersion(fake.db)).toBe(2);
  });

  it('serializes concurrent runMigrations calls by database lock key', async () => {
    vi.mocked(fs.readdirSync as any).mockReturnValue(['0001_single.sql']);
    vi.mocked(fs.readFileSync as any).mockReturnValue('CREATE TABLE one(id TEXT PRIMARY KEY);');

    const fake = createFakeDb({ initialVersion: 0, execDelayMs: 40 });
    const ctx = { db: fake.db, migrationsDir: '/migrations' };

    await Promise.all([runMigrations(ctx), runMigrations(ctx)]);
    expect(fake.state.execSql).toHaveLength(1);
  });
});
