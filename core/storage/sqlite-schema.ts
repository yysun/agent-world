/**
 * SQLite Database Schema for Agent World System
 *
 * Logger Category: storage.schema
 * Purpose: Schema utilities and PRAGMA configuration
 * 
 * Features:
 * - PRAGMA configuration for performance and integrity
 * - Schema version tracking (PRAGMA user_version)
 * - Database statistics and integrity validation
 * - Index and trigger creation utilities
 *
 * Schema Design:
 * - worlds: Core world configuration and metadata
 * - agents: Agent configuration with LLM settings
 * - agent_memory: Current active conversation memory
 * - memory_archives: Archive session metadata with rich information
 * - archived_messages: Historical conversation content linked to archives
 * - archive_statistics: Usage analytics and management data
 * - world_chats: Chat session management
 * - events: Event storage with sequences
 * - event_sequences: Atomic sequence generation
 *
 * Implementation:
 * - PRAGMA settings for performance and integrity
 * - JSON column types for flexible configuration storage
 * - Timestamp tracking for all operations
 * - Cascading deletes for data consistency
 * - Prepared statements for security and performance
 * - 2025-11-02: Refactored to remove migration logic (now in migration-runner.ts)
 * - 2025-11-02: Schema initialization deprecated - all databases use migration system (0000-0009)
 * - 2025-11-02: Removed initializeSchema() - migration 0000 handles base schema creation
 */

// Types only import - will be stripped at runtime

import type { Database } from 'sqlite3';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { createCategoryLogger } from '../logger.js';

const logger = createCategoryLogger('storage.schema');



export interface SQLiteConfig {
  database: string;
  enableWAL?: boolean;
  busyTimeout?: number;
  cacheSize?: number;
  enableForeignKeys?: boolean;
}


export interface ArchiveMetadata {
  sessionName?: string;
  archiveReason?: string;
  messageCount: number;
  startTime?: string;
  endTime?: string;
  participants: string[];
  tags?: string[];
}


export interface ArchiveStatistics {
  totalArchives: number;
  totalMessages: number;
  averageSessionLength: number;
  mostActiveAgent: string;
  archiveFrequency: { [key: string]: number };
}


// Context object for function-based schema
export interface SQLiteSchemaContext {
  db: Database;
  config: SQLiteConfig;
  isInitialized: boolean;
}

export async function createSQLiteSchemaContext(config: SQLiteConfig): Promise<SQLiteSchemaContext> {
  if (typeof window !== 'undefined') {
    throw new Error('SQLite not available in browser environment');
  }
  try {
    // Ensure parent directory exists for the database file
    const dbPath = config.database;
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Use dynamic import for ESM compatibility
    const sqlite3Module = await import('sqlite3');
    const sqlite3 = sqlite3Module.default || sqlite3Module;
    const db = new sqlite3.Database(dbPath);
    configurePragmas({ db, config });
    return { db, config, isInitialized: false };
  } catch (error) {
    console.error('[sqlite-schema] Failed to import or initialize sqlite3:', error);
    throw new Error('SQLite3 module not available. Please install sqlite3: npm install sqlite3');
  }
}

// ...existing code...
export function configurePragmas(ctx: { db: Database; config: SQLiteConfig }): void {
  const { db, config } = ctx;
  try {
    if (config.enableWAL !== false) {
      db.run("PRAGMA journal_mode = WAL");
    }
    if (config.enableForeignKeys !== false) {
      db.run("PRAGMA foreign_keys = ON");
    }
    db.run(`PRAGMA busy_timeout = ${config.busyTimeout || 30000}`);
    db.run(`PRAGMA cache_size = ${config.cacheSize || -64000}`);
    db.run("PRAGMA synchronous = NORMAL");
    db.run("PRAGMA page_size = 4096");
  } catch (error) {
    // Ignore pragma errors in test environments
  }
}

/**
 * @deprecated All schema initialization is now handled by the migration system.
 * This file only provides utility functions for PRAGMA configuration and database introspection.
 * Schema creation (tables, indexes, triggers) is defined in migrations/*.sql files.
 */

export async function getSchemaVersion(ctx: SQLiteSchemaContext): Promise<number> {
  const get = promisify(ctx.db.get.bind(ctx.db));
  try {
    const result = await get("PRAGMA user_version") as { user_version: number };
    return result.user_version;
  } catch {
    return 0;
  }
}

export async function setSchemaVersion(ctx: SQLiteSchemaContext, version: number): Promise<void> {
  const run = promisify(ctx.db.run.bind(ctx.db));
  await run(`PRAGMA user_version = ${version}`);
}

/**
 * Validate database integrity
 * Checks for corruption and foreign key constraint violations
 */
export async function validateIntegrity(ctx: SQLiteSchemaContext): Promise<{ isValid: boolean; errors: string[] }> {
  const get = promisify(ctx.db.get.bind(ctx.db));
  const all = promisify(ctx.db.all.bind(ctx.db));
  const errors: string[] = [];
  try {
    const integrityCheck = await get("PRAGMA integrity_check") as { integrity_check: string };
    if (integrityCheck.integrity_check !== 'ok') {
      errors.push(`Database integrity check failed: ${integrityCheck.integrity_check}`);
    }
    const foreignKeyCheck = await all("PRAGMA foreign_key_check") as any[];
    if (foreignKeyCheck.length > 0) {
      errors.push(`Foreign key constraint violations: ${foreignKeyCheck.length}`);
    }
    return { isValid: errors.length === 0, errors };
  } catch (error) {
    errors.push(`Integrity validation error: ${error instanceof Error ? error.message : error}`);
    return { isValid: false, errors };
  }
}

export async function getDatabaseStats(ctx: SQLiteSchemaContext): Promise<{
  worldCount: number;
  agentCount: number;
  activeMemoryCount: number;
  archiveCount: number;
  archivedMessageCount: number;
  databaseSize: number;
}> {
  const get = promisify(ctx.db.get.bind(ctx.db));
  const [
    worldCount,
    agentCount,
    activeMemoryCount,
    archiveCount,
    archivedMessageCount,
    sizeInfo
  ] = await Promise.all([
    get("SELECT COUNT(*) as count FROM worlds"),
    get("SELECT COUNT(*) as count FROM agents"),
    get("SELECT COUNT(*) as count FROM agent_memory"),
    get("SELECT COUNT(*) as count FROM memory_archives"),
    get("SELECT COUNT(*) as count FROM archived_messages"),
    get("PRAGMA page_count")
  ]);
  return {
    worldCount: (worldCount as any).count || 0,
    agentCount: (agentCount as any).count || 0,
    activeMemoryCount: (activeMemoryCount as any).count || 0,
    archiveCount: (archiveCount as any).count || 0,
    archivedMessageCount: (archivedMessageCount as any).count || 0,
    databaseSize: ((sizeInfo as any).page_count || 0) * 4096
  };
}

export async function closeSchema(ctx: SQLiteSchemaContext): Promise<void> {
  return new Promise((resolve, reject) => {
    ctx.db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function getDatabase(ctx: SQLiteSchemaContext): Database {
  return ctx.db;
}