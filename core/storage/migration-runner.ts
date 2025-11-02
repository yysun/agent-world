/**
 * SQL File-Based Migration Runner
 * 
 * Purpose: Manages database schema migrations using SQL files
 * 
 * Features:
 * - Executes SQL migration files in order
 * - Tracks migration versions in database
 * - Supports both TypeScript and SQL file migrations
 * - Prevents concurrent migrations with locks
 * - Provides rollback support (future enhancement)
 * - Better error handling and logging
 * 
 * Migration File Naming Convention:
 * - {version}_{description}.sql (e.g., 0001_create_events_table.sql)
 * - Version numbers must be sequential
 * - Files are executed in numeric order
 * 
 * Implementation:
 * - 2025-11-02: Initial implementation replacing inline TypeScript migrations
 */

import type { Database } from 'sqlite3';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { createCategoryLogger } from '../logger.js';

const logger = createCategoryLogger('storage.migration');

export interface MigrationContext {
  db: Database;
  migrationsDir: string;
}

export interface MigrationFile {
  version: number;
  name: string;
  filePath: string;
}

interface MigrationRecord {
  version: number;
  name: string;
  applied_at: string;
}

/**
 * Get current schema version from database
 */
export async function getCurrentVersion(db: Database): Promise<number> {
  const get = promisify(db.get.bind(db));
  try {
    const result = await get("PRAGMA user_version") as { user_version: number };
    return result.user_version;
  } catch {
    return 0;
  }
}

/**
 * Set schema version in database
 */
export async function setVersion(db: Database, version: number): Promise<void> {
  // Ensure version is an integer
  const intVersion = Math.floor(version);

  // PRAGMA statements work with db.run but need to be handled in serialize mode
  await new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      db.run(`PRAGMA user_version = ${intVersion}`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  logger.info('Schema version updated', { version: intVersion });
}

/**
 * Create migration tracking table if it doesn't exist
 * This provides better migration history than just PRAGMA user_version
 */
export async function ensureMigrationTable(db: Database): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Get list of applied migrations from tracking table
 */
export async function getAppliedMigrations(db: Database): Promise<MigrationRecord[]> {
  const all = promisify(db.all.bind(db));
  try {
    // Ensure table exists before querying
    await ensureMigrationTable(db);
    const rows = await all("SELECT version, name, applied_at FROM schema_migrations ORDER BY version") as MigrationRecord[];
    return rows || [];
  } catch {
    return [];
  }
}

/**
 * Record a migration in the tracking table
 */
export async function recordMigration(db: Database, version: number, name: string): Promise<void> {
  // Ensure table exists before inserting
  await ensureMigrationTable(db);

  const run = (sql: string, params?: any[]): Promise<void> => {
    return new Promise((resolve, reject) => {
      db.run(sql, params || [], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };
  await run(
    "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
    [version, name]
  );
}

/**
 * Discover all SQL migration files in the migrations directory
 */
export function discoverMigrations(migrationsDir: string): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    logger.warn('Migrations directory not found', { dir: migrationsDir });
    return [];
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .map(filename => {
      const match = filename.match(/^(\d+)_(.+)\.sql$/);
      if (!match) {
        logger.warn('Invalid migration filename format', { filename });
        return null;
      }
      return {
        version: parseInt(match[1], 10),
        name: match[2],
        filePath: path.join(migrationsDir, filename)
      };
    })
    .filter((m): m is MigrationFile => m !== null)
    .sort((a, b) => a.version - b.version);

  return files;
}

/**
 * Read and parse SQL migration file
 */
export function readMigrationFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Migration file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Execute a single migration file
 */
export async function executeMigration(db: Database, migration: MigrationFile): Promise<void> {
  // Split SQL by semicolons and execute each statement
  const run = promisify(db.run.bind(db));

  logger.info('Executing migration', {
    version: migration.version,
    name: migration.name
  });

  const sql = readMigrationFile(migration.filePath);

  try {
    // Split SQL into statements and execute each one
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      await run(statement);
    }

    await recordMigration(db, migration.version, migration.name);
    await setVersion(db, migration.version);

    logger.info('Migration completed successfully', {
      version: migration.version,
      name: migration.name
    });
  } catch (error) {
    logger.error('Migration failed', {
      version: migration.version,
      name: migration.name,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Check if migrations are needed
 */
export async function needsMigration(db: Database, migrationsDir: string): Promise<boolean> {
  const currentVersion = await getCurrentVersion(db);
  const migrations = discoverMigrations(migrationsDir);

  if (migrations.length === 0) {
    return false;
  }

  const latestVersion = Math.max(...migrations.map(m => m.version));
  return currentVersion < latestVersion;
}

// Global migration locks to prevent concurrent migrations
const migrationLocks = new Map<string, Promise<void>>();

/**
 * Run all pending migrations
 */
export async function runMigrations(ctx: MigrationContext): Promise<void> {
  const dbPath = (ctx.db as any).filename || 'memory';

  // Check if there's already a migration in progress for this database
  if (migrationLocks.has(dbPath)) {
    logger.info('Waiting for existing migration to complete', { dbPath });
    await migrationLocks.get(dbPath);
    return;
  }

  const migrationPromise = performMigrations(ctx);
  migrationLocks.set(dbPath, migrationPromise);

  try {
    await migrationPromise;
  } finally {
    migrationLocks.delete(dbPath);
  }
}

/**
 * Internal function to perform migrations
 */
async function performMigrations(ctx: MigrationContext): Promise<void> {
  const { db, migrationsDir } = ctx;

  // Ensure migration tracking table exists
  await ensureMigrationTable(db);

  const currentVersion = await getCurrentVersion(db);
  const migrations = discoverMigrations(migrationsDir);

  if (migrations.length === 0) {
    logger.info('No migration files found', { dir: migrationsDir });
    return;
  }

  // For completely fresh databases at v0, include migration 0000
  // For all other cases, only include migrations with version > currentVersion
  const pendingMigrations = currentVersion === 0
    ? migrations.filter(m => m.version >= 0)
    : migrations.filter(m => m.version > currentVersion);

  if (pendingMigrations.length === 0) {
    logger.info('Database is up to date', { currentVersion });
    return;
  }

  logger.info('Starting migrations', {
    currentVersion,
    pendingCount: pendingMigrations.length,
    targetVersion: Math.max(...pendingMigrations.map(m => m.version))
  });

  // Execute each pending migration in order
  for (const migration of pendingMigrations) {
    await executeMigration(db, migration);
  }

  const finalVersion = await getCurrentVersion(db);
  logger.info('Migrations completed', {
    fromVersion: currentVersion,
    toVersion: finalVersion
  });
}

/**
 * Get migration status and history
 */
export async function getMigrationStatus(ctx: MigrationContext): Promise<{
  currentVersion: number;
  availableMigrations: MigrationFile[];
  appliedMigrations: MigrationRecord[];
  pendingMigrations: MigrationFile[];
}> {
  const { db, migrationsDir } = ctx;

  const currentVersion = await getCurrentVersion(db);
  const availableMigrations = discoverMigrations(migrationsDir);

  let appliedMigrations: MigrationRecord[] = [];
  try {
    appliedMigrations = await getAppliedMigrations(db);
  } catch {
    // Migration table might not exist yet
  }

  const pendingMigrations = availableMigrations.filter(
    m => m.version > currentVersion
  );

  return {
    currentVersion,
    availableMigrations,
    appliedMigrations,
    pendingMigrations
  };
}

/**
 * Validate migration file sequence
 * Ensures no gaps or duplicates in version numbers
 */
export function validateMigrationSequence(migrations: MigrationFile[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (migrations.length === 0) {
    return { isValid: true, errors };
  }

  // Check for duplicates
  const versions = migrations.map(m => m.version);
  const uniqueVersions = new Set(versions);
  if (versions.length !== uniqueVersions.size) {
    errors.push('Duplicate migration versions found');
  }

  // Check for gaps (optional - might want to allow gaps)
  for (let i = 1; i < migrations.length; i++) {
    const expectedVersion = migrations[i - 1].version + 1;
    if (migrations[i].version !== expectedVersion) {
      logger.warn('Gap in migration sequence', {
        expected: expectedVersion,
        actual: migrations[i].version
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
