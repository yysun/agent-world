/**
 * SQLite Database Schema for Agent World System
 *
 * Features:
 * - Comprehensive schema supporting worlds, agents, and memory archives
 * - Foreign key constraints for data integrity
 * - Optimized indexes for performance
 * - Rich archive metadata with search capabilities
 * - Migration support from file-based storage
 *
 * Schema Design:
 * - worlds: Core world configuration and metadata
 * - agents: Agent configuration with LLM settings
 * - agent_memory: Current active conversation memory
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
 */

import { Database } from 'sqlite3';
import { promisify } from 'util';

/**
 * Database configuration and connection settings
 */
export interface SQLiteConfig {
  database: string;
  enableWAL?: boolean;
  busyTimeout?: number;
  cacheSize?: number;
  enableForeignKeys?: boolean;
}

/**
 * Archive metadata for rich archive management
 */
export interface ArchiveMetadata {
  sessionName?: string;
  archiveReason?: string;
  messageCount: number;
  startTime?: string;
  endTime?: string;
  participants: string[];
  tags?: string[];
  summary?: string;
}

/**
 * Archive statistics for analytics
 */
export interface ArchiveStatistics {
  totalArchives: number;
  totalMessages: number;
  averageSessionLength: number;
  mostActiveAgent: string;
  archiveFrequency: { [key: string]: number };
}

/**
 * Database schema initialization and management
 */
export class SQLiteSchema {
  private db: Database;
  private isInitialized = false;

  constructor(config: SQLiteConfig) {
    this.db = new Database(config.database);
    this.configurePragmas(config);
  }

  /**
   * Configure SQLite PRAGMA settings for optimal performance
   */
  private configurePragmas(config: SQLiteConfig): void {
    const run = promisify(this.db.run.bind(this.db));
    
    // Enable WAL mode for better concurrency
    if (config.enableWAL !== false) {
      this.db.run("PRAGMA journal_mode = WAL");
    }

    // Enable foreign key constraints
    if (config.enableForeignKeys !== false) {
      this.db.run("PRAGMA foreign_keys = ON");
    }

    // Set busy timeout for lock contention
    this.db.run(`PRAGMA busy_timeout = ${config.busyTimeout || 30000}`);

    // Set cache size for performance
    this.db.run(`PRAGMA cache_size = ${config.cacheSize || -64000}`); // 64MB

    // Enable synchronous mode for data safety
    this.db.run("PRAGMA synchronous = NORMAL");

    // Set page size for optimal performance
    this.db.run("PRAGMA page_size = 4096");
  }

  /**
   * Initialize database schema with all tables and indexes
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const run = promisify(this.db.run.bind(this.db));

    // Create worlds table
    await run(`
      CREATE TABLE IF NOT EXISTS worlds (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        turn_limit INTEGER NOT NULL DEFAULT 5,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create agents table
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

    // Create agent_memory table for current active memory
    await run(`
      CREATE TABLE IF NOT EXISTS agent_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        world_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
        content TEXT NOT NULL,
        sender TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_id, world_id) REFERENCES agents(id, world_id) ON DELETE CASCADE
      )
    `);

    // Create memory_archives table for archive session metadata
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
        participants TEXT, -- JSON array of participant names
        tags TEXT, -- JSON array of tags
        summary TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_id, world_id) REFERENCES agents(id, world_id) ON DELETE CASCADE
      )
    `);

    // Create archived_messages table for historical conversation content
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

    // Create archive_statistics table for analytics
    await run(`
      CREATE TABLE IF NOT EXISTS archive_statistics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        world_id TEXT NOT NULL,
        agent_id TEXT,
        stat_type TEXT NOT NULL, -- 'daily', 'weekly', 'monthly', 'total'
        stat_date DATE NOT NULL,
        archive_count INTEGER DEFAULT 0,
        message_count INTEGER DEFAULT 0,
        session_length_avg REAL DEFAULT 0,
        most_active_agent TEXT,
        data TEXT, -- JSON for additional statistics
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for performance
    await this.createIndexes();

    // Create triggers for automatic timestamp updates
    await this.createTriggers();

    this.isInitialized = true;
  }

  /**
   * Create performance indexes
   */
  private async createIndexes(): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));

    // Indexes for agent operations
    await run(`CREATE INDEX IF NOT EXISTS idx_agents_world_id ON agents(world_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_agents_last_active ON agents(last_active)`);

    // Indexes for memory operations
    await run(`CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_world ON agent_memory(agent_id, world_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_agent_memory_created_at ON agent_memory(created_at)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_agent_memory_sender ON agent_memory(sender)`);

    // Indexes for archive operations
    await run(`CREATE INDEX IF NOT EXISTS idx_memory_archives_agent_world ON memory_archives(agent_id, world_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_memory_archives_created_at ON memory_archives(created_at)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_memory_archives_session_name ON memory_archives(session_name)`);

    // Indexes for archived messages
    await run(`CREATE INDEX IF NOT EXISTS idx_archived_messages_archive_id ON archived_messages(archive_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_archived_messages_content ON archived_messages(content)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_archived_messages_sender ON archived_messages(sender)`);

    // Indexes for statistics
    await run(`CREATE INDEX IF NOT EXISTS idx_archive_statistics_world_date ON archive_statistics(world_id, stat_date)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_archive_statistics_type ON archive_statistics(stat_type)`);
  }

  /**
   * Create triggers for automatic timestamp updates
   */
  private async createTriggers(): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));

    // Trigger for worlds updated_at
    await run(`
      CREATE TRIGGER IF NOT EXISTS worlds_updated_at 
      AFTER UPDATE ON worlds
      BEGIN
        UPDATE worlds SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);

    // Trigger for agents last_active
    await run(`
      CREATE TRIGGER IF NOT EXISTS agents_last_active 
      AFTER UPDATE ON agents
      BEGIN
        UPDATE agents SET last_active = CURRENT_TIMESTAMP WHERE id = NEW.id AND world_id = NEW.world_id;
      END
    `);

    // Trigger for archive statistics updated_at
    await run(`
      CREATE TRIGGER IF NOT EXISTS archive_statistics_updated_at 
      AFTER UPDATE ON archive_statistics
      BEGIN
        UPDATE archive_statistics SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);
  }

  /**
   * Get database schema version for migration support
   */
  async getSchemaVersion(): Promise<number> {
    const get = promisify(this.db.get.bind(this.db));
    
    try {
      const result = await get("PRAGMA user_version") as { user_version: number };
      return result.user_version;
    } catch {
      return 0;
    }
  }

  /**
   * Set database schema version
   */
  async setSchemaVersion(version: number): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    await run(`PRAGMA user_version = ${version}`);
  }

  /**
   * Check if database schema needs migration
   */
  async needsMigration(): Promise<boolean> {
    const currentVersion = await this.getSchemaVersion();
    const targetVersion = 1; // Current schema version
    return currentVersion < targetVersion;
  }

  /**
   * Run database migrations
   */
  async migrate(): Promise<void> {
    const currentVersion = await this.getSchemaVersion();
    
    if (currentVersion === 0) {
      // Initial schema creation
      await this.initialize();
      await this.setSchemaVersion(1);
    }

    // Future migrations would go here
  }

  /**
   * Validate database integrity
   */
  async validateIntegrity(): Promise<{ isValid: boolean; errors: string[] }> {
    const get = promisify(this.db.get.bind(this.db));
    const all = promisify(this.db.all.bind(this.db));
    const errors: string[] = [];

    try {
      // Check database integrity
      const integrityCheck = await get("PRAGMA integrity_check") as { integrity_check: string };
      if (integrityCheck.integrity_check !== 'ok') {
        errors.push(`Database integrity check failed: ${integrityCheck.integrity_check}`);
      }

      // Check foreign key constraints
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

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<{
    worldCount: number;
    agentCount: number;
    activeMemoryCount: number;
    archiveCount: number;
    archivedMessageCount: number;
    databaseSize: number;
  }> {
    const get = promisify(this.db.get.bind(this.db));

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
      databaseSize: ((sizeInfo as any).page_count || 0) * 4096 // Page size is 4096 bytes
    };
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Get database instance for direct operations
   */
  getDatabase(): Database {
    return this.db;
  }
}