/**
 * SQLite Database Schema for Agent World System
 *
 * Features:
 * - Comprehensive schema supporting worlds, agents, and memory archives
 * - Foreign key constraints for data integrity
 * - Optimized indexes for performance
 * - Rich archive metadata with search capabilities
 * - Migration support from file-based storage
 * - Message identification for user message edit feature
 *
 * Schema Design:
 * - worlds: Core world configuration and metadata
 * - agents: Agent configuration with LLM settings
 * - agent_memory: Current active conversation memory (includes message_id)
 * - memory_archives: Archive session metadata with rich information
 * - archived_messages: Historical conversation content linked to archives
 * - archive_statistics: Usage analytics and management data
 *
 * Implementation:
 * - PRAGMA settings for performance and integrity
 * - JSON column types for flexible configuration storage
 * - Timestamp tracking for all operations
 * - Cascading deletes for data consistency
 * - Prepared statements for security and performance
 * - 2025-07-27: Ensures parent directory for SQLite database exists before opening (prevents SQLITE_CANTOPEN)
 * - 2025-08-06: Fixed migration logic to properly handle existing databases missing chat_id column
 * - 2025-10-21: Added message_id column to agent_memory table for user message edit feature (version 6 migration)
 */

// Types only import - will be stripped at runtime

import type { Database } from 'sqlite3';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';



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

export async function initializeSchema(ctx: SQLiteSchemaContext): Promise<void> {
  if (ctx.isInitialized) return;
  const db = ctx.db;
  const run = (sql: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      db.run(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };
  await run(`
    CREATE TABLE IF NOT EXISTS worlds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      turn_limit INTEGER NOT NULL DEFAULT 5,
      chat_llm_provider TEXT,
      chat_llm_model TEXT,
      current_chat_id TEXT,
      mcp_config TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT NOT NULL,
      world_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'inactive',
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      system_prompt TEXT,
      temperature REAL,
      max_tokens INTEGER,
      llm_call_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_llm_call TIMESTAMP,
      PRIMARY KEY (id, world_id),
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS agent_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      world_id TEXT NOT NULL,
      message_id TEXT,
      reply_to_message_id TEXT,
      role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
      content TEXT NOT NULL,
      sender TEXT,
      chat_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id, world_id) REFERENCES agents(id, world_id) ON DELETE CASCADE
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS world_chats (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      message_count INTEGER DEFAULT 0,
      tags TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS chat_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      world_id TEXT NOT NULL,
      snapshot_data TEXT NOT NULL,
      captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      version TEXT DEFAULT '1.0',
      FOREIGN KEY (chat_id) REFERENCES world_chats(id) ON DELETE CASCADE,
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS memory_archives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      world_id TEXT NOT NULL,
      session_name TEXT,
      archive_reason TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      start_time TIMESTAMP,
      end_time TIMESTAMP,
      participants TEXT,
      tags TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id, world_id) REFERENCES agents(id, world_id) ON DELETE CASCADE
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS archived_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      archive_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
      content TEXT NOT NULL,
      sender TEXT,
      original_created_at TIMESTAMP,
      archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (archive_id) REFERENCES memory_archives(id) ON DELETE CASCADE
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS archive_statistics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      world_id TEXT NOT NULL,
      agent_id TEXT,
      stat_type TEXT NOT NULL,
      stat_date DATE NOT NULL,
      archive_count INTEGER DEFAULT 0,
      message_count INTEGER DEFAULT 0,
      session_length_avg REAL DEFAULT 0,
      most_active_agent TEXT,
      data TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
    )
  `);
  await createIndexes(ctx);
  await createTriggers(ctx);
  ctx.isInitialized = true;
}

export async function createIndexes(ctx: SQLiteSchemaContext): Promise<void> {
  const run = promisify(ctx.db.run.bind(ctx.db));
  await run(`CREATE INDEX IF NOT EXISTS idx_agents_world_id ON agents(world_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_agents_last_active ON agents(last_active)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_world ON agent_memory(agent_id, world_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_agent_memory_created_at ON agent_memory(created_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_agent_memory_sender ON agent_memory(sender)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_agent_memory_chat_id ON agent_memory(chat_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_agent_memory_message_id ON agent_memory(message_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_world_chats_world_id ON world_chats(world_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_world_chats_created_at ON world_chats(created_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_world_chats_updated_at ON world_chats(updated_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_chat_snapshots_chat_id ON chat_snapshots(chat_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_chat_snapshots_world_id ON chat_snapshots(world_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_memory_archives_agent_world ON memory_archives(agent_id, world_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_memory_archives_created_at ON memory_archives(created_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_memory_archives_session_name ON memory_archives(session_name)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_archived_messages_archive_id ON archived_messages(archive_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_archived_messages_content ON archived_messages(content)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_archived_messages_sender ON archived_messages(sender)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_archive_statistics_world_date ON archive_statistics(world_id, stat_date)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_archive_statistics_type ON archive_statistics(stat_type)`);
}

export async function createTriggers(ctx: SQLiteSchemaContext): Promise<void> {
  const run = promisify(ctx.db.run.bind(ctx.db));
  await run(`
    CREATE TRIGGER IF NOT EXISTS worlds_updated_at
    AFTER UPDATE ON worlds
    BEGIN
      UPDATE worlds SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END
  `);
  await run(`
    CREATE TRIGGER IF NOT EXISTS agents_last_active
    AFTER UPDATE ON agents
    BEGIN
      UPDATE agents SET last_active = CURRENT_TIMESTAMP WHERE id = NEW.id AND world_id = NEW.world_id;
    END
  `);
  await run(`
    CREATE TRIGGER IF NOT EXISTS world_chats_updated_at
    AFTER UPDATE ON world_chats
    BEGIN
      UPDATE world_chats SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END
  `);
  await run(`
    CREATE TRIGGER IF NOT EXISTS archive_statistics_updated_at
    AFTER UPDATE ON archive_statistics
    BEGIN
      UPDATE archive_statistics SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END
  `);
}

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

export async function needsMigration(ctx: SQLiteSchemaContext): Promise<boolean> {
  const currentVersion = await getSchemaVersion(ctx);
  const targetVersion = 7; // Latest version includes reply_to_message_id field for message threading
  return currentVersion < targetVersion;
}

// Global migration lock to prevent concurrent migrations on the same database
const migrationLocks = new Map<string, Promise<void>>();

export async function migrate(ctx: SQLiteSchemaContext): Promise<void> {
  const dbPath = ctx.config.database;

  // Check if there's already a migration in progress for this database
  if (migrationLocks.has(dbPath)) {
    await migrationLocks.get(dbPath);
    return;
  }

  const migrationPromise = performMigration(ctx);
  migrationLocks.set(dbPath, migrationPromise);

  try {
    await migrationPromise;
  } finally {
    migrationLocks.delete(dbPath);
  }
}

async function performMigration(ctx: SQLiteSchemaContext): Promise<void> {
  const currentVersion = await getSchemaVersion(ctx);
  const run = promisify(ctx.db.run.bind(ctx.db));
  const get = promisify(ctx.db.get.bind(ctx.db));
  const all = promisify(ctx.db.all.bind(ctx.db));

  // Import logger dynamically to avoid circular dependencies
  const { logger } = await import('../logger.js');
  logger.info('sqlite-schema', `Starting migration from version ${currentVersion} to version 7`);

  if (currentVersion === 0) {
    // Check if tables exist (existing database) or need to be created (fresh database)
    try {
      const tableCheck = await get("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_memory'") as any;

      if (!tableCheck) {
        // Fresh database - create all tables with current schema
        logger.info('sqlite-schema', 'Initializing fresh database with current schema');
        await initializeSchema(ctx);
        await setSchemaVersion(ctx, 6);
      } else {
        // Existing database with version 0 - check if chat_id column exists
        logger.info('sqlite-schema', 'Migrating existing database from version 0');
        try {
          const columns = await all("PRAGMA table_info(agent_memory)") as any[];
          const hasChatIdColumn = columns && Array.isArray(columns) && columns.some((col: any) => col.name === 'chat_id');

          if (!hasChatIdColumn) {
            // Add missing chat_id column
            logger.info('sqlite-schema', 'Adding chat_id column to agent_memory table');
            await run(`ALTER TABLE agent_memory ADD COLUMN chat_id TEXT`);
            await run(`CREATE INDEX IF NOT EXISTS idx_agent_memory_chat_id ON agent_memory(chat_id)`);
          }

          // Check and add LLM provider/model columns
          const worldColumns = await all("PRAGMA table_info(worlds)") as any[];
          const hasLLMProvider = worldColumns && Array.isArray(worldColumns) && worldColumns.some((col: any) => col.name === 'chat_llm_provider');
          const hasLLMModel = worldColumns && Array.isArray(worldColumns) && worldColumns.some((col: any) => col.name === 'chat_llm_model');
          const hasCurrentChatId = worldColumns && Array.isArray(worldColumns) && worldColumns.some((col: any) => col.name === 'current_chat_id');

          if (!hasLLMProvider) {
            logger.info('sqlite-schema', 'Adding chat_llm_provider column to worlds table');
            await run(`ALTER TABLE worlds ADD COLUMN chat_llm_provider TEXT`);
          }
          if (!hasLLMModel) {
            logger.info('sqlite-schema', 'Adding chat_llm_model column to worlds table');
            await run(`ALTER TABLE worlds ADD COLUMN chat_llm_model TEXT`);
          }
          if (!hasCurrentChatId) {
            logger.info('sqlite-schema', 'Adding current_chat_id column to worlds table');
            await run(`ALTER TABLE worlds ADD COLUMN current_chat_id TEXT`);
          }

          await setSchemaVersion(ctx, 4);
        } catch (error) {
          console.warn('[sqlite-schema] Migration warning for chat_id column:', error);
          // Try to continue anyway
          await setSchemaVersion(ctx, 4);
        }
      }
    } catch (error) {
      console.error('[sqlite-schema] Migration error:', error);
      throw error;
    }
  } else if (currentVersion === 1) {
    // Migration from version 1 to 2: Add chatId column to agent_memory
    logger.info('sqlite-schema', 'Migrating from version 1 to 2: Adding chat_id column');
    try {
      await run(`ALTER TABLE agent_memory ADD COLUMN chat_id TEXT`);
      await run(`CREATE INDEX IF NOT EXISTS idx_agent_memory_chat_id ON agent_memory(chat_id)`);
      await setSchemaVersion(ctx, 2);
    } catch (error) {
      // Column might already exist, check and continue
      console.warn('[sqlite-schema] Migration warning:', error);
    }
  }

  if (currentVersion < 3) {
    // Migration to version 3: Add LLM provider/model columns to worlds table
    logger.info('sqlite-schema', 'Migrating to version 3: Adding LLM provider/model columns');
    try {
      const worldColumns = await all("PRAGMA table_info(worlds)") as any[];
      const hasLLMProvider = worldColumns && Array.isArray(worldColumns) && worldColumns.some((col: any) => col.name === 'chat_llm_provider');
      const hasLLMModel = worldColumns && Array.isArray(worldColumns) && worldColumns.some((col: any) => col.name === 'chat_llm_model');

      if (!hasLLMProvider) {
        logger.info('sqlite-schema', 'Adding chat_llm_provider column');
        await run(`ALTER TABLE worlds ADD COLUMN chat_llm_provider TEXT`);
      }
      if (!hasLLMModel) {
        logger.info('sqlite-schema', 'Adding chat_llm_model column');
        await run(`ALTER TABLE worlds ADD COLUMN chat_llm_model TEXT`);
      }

      await setSchemaVersion(ctx, 3);
    } catch (error) {
      console.warn('[sqlite-schema] Migration warning for LLM columns:', error);
      // Try to continue anyway
      await setSchemaVersion(ctx, 3);
    }
  }

  if (currentVersion < 4) {
    // Migration to version 4: Add current_chat_id column to worlds table
    logger.info('sqlite-schema', 'Migrating to version 4: Adding current_chat_id column');
    try {
      const worldColumns = await all("PRAGMA table_info(worlds)") as any[];
      const hasCurrentChatId = worldColumns && Array.isArray(worldColumns) && worldColumns.some((col: any) => col.name === 'current_chat_id');

      if (!hasCurrentChatId) {
        logger.info('sqlite-schema', 'Adding current_chat_id column to worlds table');
        await run(`ALTER TABLE worlds ADD COLUMN current_chat_id TEXT`);
      }

      await setSchemaVersion(ctx, 4);
    } catch (error) {
      console.warn('[sqlite-schema] Migration warning for current_chat_id column:', error);
      // Try to continue anyway
      await setSchemaVersion(ctx, 4);
    }
  }

  // Migration to version 5: Add mcpConfig column to worlds table
  if (currentVersion < 5) {
    logger.info('sqlite-schema', 'Migrating to version 5: Adding mcp_config column');
    try {
      const worldColumns = await all("PRAGMA table_info(worlds)") as any[];
      const hasMcpConfig = worldColumns && Array.isArray(worldColumns) && worldColumns.some((col: any) => col.name === 'mcp_config');

      if (!hasMcpConfig) {
        logger.info('sqlite-schema', 'Adding mcp_config column to worlds table');
        await run(`ALTER TABLE worlds ADD COLUMN mcp_config TEXT`);
      }

      await setSchemaVersion(ctx, 5);
    } catch (error) {
      console.warn('[sqlite-schema] Migration warning for mcp_config column:', error);
      // Try to continue anyway
      await setSchemaVersion(ctx, 5);
    }
  }

  // Migration to version 6: Add message_id column to agent_memory table for user message edit feature
  if (currentVersion < 6) {
    logger.info('sqlite-schema', 'Migrating to version 6: Adding message_id column for edit feature');
    try {
      const memoryColumns = await all("PRAGMA table_info(agent_memory)") as any[];
      const hasMessageId = memoryColumns && Array.isArray(memoryColumns) && memoryColumns.some((col: any) => col.name === 'message_id');

      if (!hasMessageId) {
        logger.info('sqlite-schema', 'Adding message_id column to agent_memory table');
        await run(`ALTER TABLE agent_memory ADD COLUMN message_id TEXT`);
        await run(`CREATE INDEX IF NOT EXISTS idx_agent_memory_message_id ON agent_memory(message_id)`);
      }

      await setSchemaVersion(ctx, 6);
    } catch (error) {
      console.warn('[sqlite-schema] Migration warning for message_id column:', error);
      // Try to continue anyway
      await setSchemaVersion(ctx, 6);
    }
  }

  // Version 7: Add reply_to_message_id for message threading
  if (currentVersion < 7) {
    logger.info('sqlite-schema', 'Migrating to version 7: Adding reply_to_message_id for threading');
    try {
      const memoryColumns = await all("PRAGMA table_info(agent_memory)") as any[];
      const hasReplyToMessageId = memoryColumns && Array.isArray(memoryColumns) && memoryColumns.some((col: any) => col.name === 'reply_to_message_id');

      if (!hasReplyToMessageId) {
        logger.info('sqlite-schema', 'Adding reply_to_message_id column to agent_memory table');
        await run(`ALTER TABLE agent_memory ADD COLUMN reply_to_message_id TEXT`);
        await run(`CREATE INDEX IF NOT EXISTS idx_agent_memory_reply_to_message_id ON agent_memory(reply_to_message_id)`);
      }

      await setSchemaVersion(ctx, 7);
    } catch (error) {
      console.warn('[sqlite-schema] Migration warning for reply_to_message_id column:', error);
      // Try to continue anyway
      await setSchemaVersion(ctx, 7);
    }
  }

  // Future migrations would go here

  const finalVersion = await getSchemaVersion(ctx);
  if (finalVersion > currentVersion) {
    logger.info('sqlite-schema', `Migration completed: version ${currentVersion} → ${finalVersion}`);
  }
} export async function validateIntegrity(ctx: SQLiteSchemaContext): Promise<{ isValid: boolean; errors: string[] }> {
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