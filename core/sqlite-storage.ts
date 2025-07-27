/**
 * SQLite Storage Implementation for Agent World System
 *
 * Features:
 * - Full implementation of StorageManager interface for SQLite backend
 * - Enhanced archive management with rich metadata and search capabilities
 * - Optimized queries with prepared statements and transactions
 * - Data integrity with foreign key constraints and validation
 * - Migration support from file-based storage
 * - Performance monitoring and analytics
 *
 * Enhanced Archive Features:
 * - Rich archive metadata (session names, reasons, statistics)
 * - Content-based search across archived conversations
 * - Archive usage analytics and trends
 * - Efficient querying by date, agent, participants
 * - Export capabilities in various formats
 *
 * Implementation:
 * - Maintains compatibility with existing storage interfaces
 * - Uses proper async/await patterns for SQLite operations
 * - Implements batch operations for efficiency
 * - Provides transaction support for data consistency
 * - Includes comprehensive error handling and validation
 */

import { Database } from 'sqlite3';
import { SQLiteSchema, SQLiteConfig, ArchiveMetadata, ArchiveStatistics } from './sqlite-schema.js';
import type { StorageManager, WorldData, Agent, AgentMessage } from './types';
import { toKebabCase } from './utils.js';

/**
 * Enhanced archive query options
 */
export interface ArchiveQueryOptions {
  worldId?: string;
  agentId?: string;
  startDate?: Date;
  endDate?: Date;
  sessionName?: string;
  tags?: string[];
  participants?: string[];
  searchContent?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'created_at' | 'message_count' | 'session_name';
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * Archive search result
 */
export interface ArchiveSearchResult {
  archives: ArchiveInfo[];
  totalCount: number;
  hasMore: boolean;
}

/**
 * Archive information with metadata
 */
export interface ArchiveInfo {
  id: number;
  agentId: string;
  worldId: string;
  sessionName?: string;
  archiveReason?: string;
  messageCount: number;
  startTime?: Date;
  endTime?: Date;
  participants: string[];
  tags: string[];
  summary?: string;
  createdAt: Date;
}

/**
 * Archive export options
 */
export interface ArchiveExportOptions {
  format: 'json' | 'csv' | 'txt' | 'markdown';
  includeMetadata?: boolean;
  includeMessages?: boolean;
  compression?: 'none' | 'gzip';
}

/**
 * SQLite storage implementation with enhanced archive features
 */
export class SQLiteStorage implements StorageManager {
  private schema: SQLiteSchema;
  private db: Database;
  private isInitialized = false;

  constructor(config: SQLiteConfig) {
    this.schema = new SQLiteSchema(config);
    this.db = this.schema.getDatabase();
  }

  /**
   * Initialize the storage system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await this.schema.initialize();
    
    // Run migrations if needed
    if (await this.schema.needsMigration()) {
      await this.schema.migrate();
    }

    this.isInitialized = true;
  }

  /**
   * Ensure storage is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Execute a SQL query with parameters
   */
  private async run(sql: string, ...params: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }

  /**
   * Execute a SQL query and get single result
   */
  private async get(sql: string, ...params: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * Execute a SQL query and get all results
   */
  private async all(sql: string, ...params: any[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  // ========================
  // WORLD OPERATIONS
  // ========================

  /**
   * Save world configuration to database
   */
  async saveWorld(worldData: WorldData): Promise<void> {
    await this.ensureInitialized();

    await this.run(`
      INSERT OR REPLACE INTO worlds (id, name, description, turn_limit, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, worldData.id, worldData.name, worldData.description, worldData.turnLimit);
  }

  /**
   * Load world configuration from database
   */
  async loadWorld(worldId: string): Promise<WorldData | null> {
    await this.ensureInitialized();

    const result = await this.get(`
      SELECT id, name, description, turn_limit as turnLimit
      FROM worlds WHERE id = ?
    `, worldId) as WorldData | undefined;

    return result || null;
  }

  /**
   * Delete world and all associated data
   */
  async deleteWorld(worldId: string): Promise<boolean> {
    await this.ensureInitialized();

    try {
      const result = await this.run(`DELETE FROM worlds WHERE id = ?`, worldId);
      return (result as any).changes > 0;
    } catch {
      return false;
    }
  }

  /**
   * List all worlds
   */
  async listWorlds(): Promise<WorldData[]> {
    await this.ensureInitialized();

    const results = await this.all(`
      SELECT id, name, description, turn_limit as turnLimit
      FROM worlds
      ORDER BY name
    `) as WorldData[];

    return results || [];
  }

  // ========================
  // AGENT OPERATIONS
  // ========================

  /**
   * Save agent to database
   */
  async saveAgent(worldId: string, agent: Agent): Promise<void> {
    await this.ensureInitialized();
    const run = promisify(this.db.run.bind(this.db));

    // Save agent configuration
    await run(`
      INSERT OR REPLACE INTO agents (
        id, world_id, name, type, status, provider, model, system_prompt,
        temperature, max_tokens, llm_call_count, last_active, last_llm_call
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, 
      agent.id, worldId, agent.name, agent.type, agent.status || 'inactive',
      agent.provider, agent.model, agent.systemPrompt,
      agent.temperature, agent.maxTokens, agent.llmCallCount,
      agent.lastActive?.toISOString(), agent.lastLLMCall?.toISOString()
    );

    // Save agent memory
    if (agent.memory && agent.memory.length > 0) {
      await this.saveAgentMemory(worldId, agent.id, agent.memory);
    }
  }

  /**
   * Load agent from database
   */
  async loadAgent(worldId: string, agentId: string): Promise<Agent | null> {
    await this.ensureInitialized();
    const get = promisify(this.db.get.bind(this.db));
    const all = promisify(this.db.all.bind(this.db));

    // Load agent configuration
    const agentData = await get(`
      SELECT id, name, type, status, provider, model, system_prompt as systemPrompt,
             temperature, max_tokens as maxTokens, llm_call_count as llmCallCount,
             created_at as createdAt, last_active as lastActive, last_llm_call as lastLLMCall
      FROM agents WHERE id = ? AND world_id = ?
    `, agentId, worldId) as any;

    if (!agentData) return null;

    // Load agent memory
    const memoryData = await all(`
      SELECT role, content, sender, created_at as createdAt
      FROM agent_memory
      WHERE agent_id = ? AND world_id = ?
      ORDER BY created_at ASC
    `, agentId, worldId) as AgentMessage[];

    // Reconstruct agent with Date objects
    const agent: Agent = {
      ...agentData,
      createdAt: agentData.createdAt ? new Date(agentData.createdAt) : new Date(),
      lastActive: agentData.lastActive ? new Date(agentData.lastActive) : new Date(),
      lastLLMCall: agentData.lastLLMCall ? new Date(agentData.lastLLMCall) : undefined,
      memory: memoryData.map(msg => ({
        ...msg,
        createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date()
      })),
      // Note: Methods will be added by enhanceAgentWithMethods in managers.ts
    } as Agent;

    return agent;
  }

  /**
   * Delete agent and all associated data
   */
  async deleteAgent(worldId: string, agentId: string): Promise<boolean> {
    await this.ensureInitialized();
    const run = promisify(this.db.run.bind(this.db));

    try {
      const result = await run(`
        DELETE FROM agents WHERE id = ? AND world_id = ?
      `, agentId, worldId);
      return (result as any).changes > 0;
    } catch {
      return false;
    }
  }

  /**
   * List all agents in a world
   */
  async listAgents(worldId: string): Promise<Agent[]> {
    await this.ensureInitialized();
    const all = promisify(this.db.all.bind(this.db));

    const agents = await all(`
      SELECT id, name, type, status, provider, model, system_prompt as systemPrompt,
             temperature, max_tokens as maxTokens, llm_call_count as llmCallCount,
             created_at as createdAt, last_active as lastActive, last_llm_call as lastLLMCall
      FROM agents WHERE world_id = ?
      ORDER BY name
    `, worldId) as any[];

    // Load memory for each agent
    const result: Agent[] = [];
    for (const agentData of agents) {
      const memoryData = await all(`
        SELECT role, content, sender, created_at as createdAt
        FROM agent_memory
        WHERE agent_id = ? AND world_id = ?
        ORDER BY created_at ASC
      `, agentData.id, worldId) as AgentMessage[];

      const agent: Agent = {
        ...agentData,
        createdAt: agentData.createdAt ? new Date(agentData.createdAt) : new Date(),
        lastActive: agentData.lastActive ? new Date(agentData.lastActive) : new Date(),
        lastLLMCall: agentData.lastLLMCall ? new Date(agentData.lastLLMCall) : undefined,
        memory: memoryData.map(msg => ({
          ...msg,
          createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date()
        })),
      } as Agent;

      result.push(agent);
    }

    return result;
  }

  /**
   * Save agent memory to database
   */
  private async saveAgentMemory(worldId: string, agentId: string, memory: AgentMessage[]): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));

    // Clear existing memory
    await run(`DELETE FROM agent_memory WHERE agent_id = ? AND world_id = ?`, agentId, worldId);

    // Insert new memory
    for (const message of memory) {
      await run(`
        INSERT INTO agent_memory (agent_id, world_id, role, content, sender, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, 
        agentId, worldId, message.role, message.content, message.sender,
        message.createdAt?.toISOString() || new Date().toISOString()
      );
    }
  }

  // ========================
  // BATCH OPERATIONS
  // ========================

  /**
   * Save multiple agents in a batch transaction
   */
  async saveAgentsBatch(worldId: string, agents: Agent[]): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run("BEGIN TRANSACTION");

        let completed = 0;
        let hasError = false;

        const finish = () => {
          if (hasError) {
            this.db.run("ROLLBACK", () => reject(new Error('Batch save failed')));
          } else {
            this.db.run("COMMIT", () => resolve());
          }
        };

        for (const agent of agents) {
          this.saveAgent(worldId, agent)
            .then(() => {
              completed++;
              if (completed === agents.length) finish();
            })
            .catch(() => {
              hasError = true;
              finish();
            });
        }

        if (agents.length === 0) {
          this.db.run("COMMIT");
          resolve();
        }
      });
    });
  }

  /**
   * Load multiple agents by IDs
   */
  async loadAgentsBatch(worldId: string, agentIds: string[]): Promise<Agent[]> {
    await this.ensureInitialized();
    
    const agents: Agent[] = [];
    for (const agentId of agentIds) {
      const agent = await this.loadAgent(worldId, agentId);
      if (agent) agents.push(agent);
    }
    return agents;
  }

  // ========================
  // INTEGRITY OPERATIONS
  // ========================

  /**
   * Validate data integrity
   */
  async validateIntegrity(worldId: string, agentId?: string): Promise<boolean> {
    await this.ensureInitialized();
    
    const schemaValidation = await this.schema.validateIntegrity();
    if (!schemaValidation.isValid) return false;

    const get = promisify(this.db.get.bind(this.db));

    try {
      if (agentId) {
        // Validate specific agent
        const agent = await get(`
          SELECT id FROM agents WHERE id = ? AND world_id = ?
        `, agentId, worldId);
        return !!agent;
      } else {
        // Validate world
        const world = await get(`SELECT id FROM worlds WHERE id = ?`, worldId);
        return !!world;
      }
    } catch {
      return false;
    }
  }

  /**
   * Repair corrupted data
   */
  async repairData(worldId: string, agentId?: string): Promise<boolean> {
    await this.ensureInitialized();
    
    // For now, return false as SQLite has better data integrity than files
    // Future implementations could include specific repair operations
    return false;
  }

  // ========================
  // ENHANCED ARCHIVE OPERATIONS
  // ========================

  /**
   * Archive agent memory with rich metadata
   */
  async archiveAgentMemory(
    worldId: string,
    agentId: string,
    memory: AgentMessage[],
    metadata?: ArchiveMetadata
  ): Promise<number> {
    await this.ensureInitialized();
    const run = promisify(this.db.run.bind(this.db));

    // Extract participants from memory
    const participants = metadata?.participants || 
      [...new Set(memory.map(m => m.sender).filter(Boolean))] as string[];

    // Calculate session timespan
    const startTime = metadata?.startTime || 
      (memory.length > 0 ? memory[0].createdAt?.toISOString() : new Date().toISOString());
    const endTime = metadata?.endTime || 
      (memory.length > 0 ? memory[memory.length - 1].createdAt?.toISOString() : new Date().toISOString());

    // Create archive record
    const archiveResult = await run(`
      INSERT INTO memory_archives (
        agent_id, world_id, session_name, archive_reason, message_count,
        start_time, end_time, participants, tags, summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, 
      agentId, worldId, metadata?.sessionName, metadata?.archiveReason,
      memory.length, startTime, endTime,
      JSON.stringify(participants), JSON.stringify(metadata?.tags || []),
      metadata?.summary
    );

    const archiveId = (archiveResult as any).lastID;

    // Archive messages
    for (const message of memory) {
      await run(`
        INSERT INTO archived_messages (
          archive_id, role, content, sender, original_created_at
        ) VALUES (?, ?, ?, ?, ?)
      `, 
        archiveId, message.role, message.content, message.sender,
        message.createdAt?.toISOString() || new Date().toISOString()
      );
    }

    // Update statistics
    await this.updateArchiveStatistics(worldId, agentId);

    return archiveId;
  }

  /**
   * Search archives with advanced filtering
   */
  async searchArchives(options: ArchiveQueryOptions): Promise<ArchiveSearchResult> {
    await this.ensureInitialized();
    const all = promisify(this.db.all.bind(this.db));
    const get = promisify(this.db.get.bind(this.db));

    let whereClause = "WHERE 1=1";
    const params: any[] = [];

    // Build WHERE clause
    if (options.worldId) {
      whereClause += " AND ma.world_id = ?";
      params.push(options.worldId);
    }
    if (options.agentId) {
      whereClause += " AND ma.agent_id = ?";
      params.push(options.agentId);
    }
    if (options.startDate) {
      whereClause += " AND ma.created_at >= ?";
      params.push(options.startDate.toISOString());
    }
    if (options.endDate) {
      whereClause += " AND ma.created_at <= ?";
      params.push(options.endDate.toISOString());
    }
    if (options.sessionName) {
      whereClause += " AND ma.session_name LIKE ?";
      params.push(`%${options.sessionName}%`);
    }
    if (options.searchContent) {
      whereClause += ` AND ma.id IN (
        SELECT DISTINCT archive_id FROM archived_messages 
        WHERE content LIKE ?
      )`;
      params.push(`%${options.searchContent}%`);
    }

    // Build ORDER BY clause
    const sortBy = options.sortBy || 'created_at';
    const sortOrder = options.sortOrder || 'DESC';
    const orderClause = `ORDER BY ma.${sortBy} ${sortOrder}`;

    // Build LIMIT clause
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const limitClause = `LIMIT ? OFFSET ?`;

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM memory_archives ma
      ${whereClause}
    `;
    const countResult = await get(countQuery, ...params) as { total: number };

    // Get archives
    const archiveQuery = `
      SELECT ma.id, ma.agent_id as agentId, ma.world_id as worldId,
             ma.session_name as sessionName, ma.archive_reason as archiveReason,
             ma.message_count as messageCount, ma.start_time as startTime,
             ma.end_time as endTime, ma.participants, ma.tags, ma.summary,
             ma.created_at as createdAt
      FROM memory_archives ma
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    const archives = await all(archiveQuery, ...params, limit, offset) as any[];

    const result: ArchiveInfo[] = archives.map(archive => ({
      ...archive,
      startTime: archive.startTime ? new Date(archive.startTime) : undefined,
      endTime: archive.endTime ? new Date(archive.endTime) : undefined,
      participants: JSON.parse(archive.participants || '[]'),
      tags: JSON.parse(archive.tags || '[]'),
      createdAt: new Date(archive.createdAt)
    }));

    return {
      archives: result,
      totalCount: countResult.total,
      hasMore: offset + limit < countResult.total
    };
  }

  /**
   * Get archive statistics
   */
  async getArchiveStatistics(worldId: string, agentId?: string): Promise<ArchiveStatistics> {
    await this.ensureInitialized();
    const get = promisify(this.db.get.bind(this.db));
    const all = promisify(this.db.all.bind(this.db));

    let whereClause = "WHERE world_id = ?";
    const params = [worldId];

    if (agentId) {
      whereClause += " AND agent_id = ?";
      params.push(agentId);
    }

    // Get basic statistics
    const basicStats = await get(`
      SELECT COUNT(*) as totalArchives,
             SUM(message_count) as totalMessages,
             AVG(message_count) as averageSessionLength
      FROM memory_archives
      ${whereClause}
    `, ...params) as any;

    // Get most active agent
    const mostActiveResult = await get(`
      SELECT agent_id, COUNT(*) as archive_count
      FROM memory_archives
      WHERE world_id = ?
      GROUP BY agent_id
      ORDER BY archive_count DESC
      LIMIT 1
    `, worldId) as any;

    // Get archive frequency by date
    const frequencyData = await all(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM memory_archives
      ${whereClause}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, ...params) as any[];

    const archiveFrequency: { [key: string]: number } = {};
    frequencyData.forEach(item => {
      archiveFrequency[item.date] = item.count;
    });

    return {
      totalArchives: basicStats?.totalArchives || 0,
      totalMessages: basicStats?.totalMessages || 0,
      averageSessionLength: basicStats?.averageSessionLength || 0,
      mostActiveAgent: mostActiveResult?.agent_id || '',
      archiveFrequency
    };
  }

  /**
   * Export archive data
   */
  async exportArchive(archiveId: number, options: ArchiveExportOptions): Promise<string> {
    await this.ensureInitialized();
    const get = promisify(this.db.get.bind(this.db));
    const all = promisify(this.db.all.bind(this.db));

    // Get archive metadata
    const archive = await get(`
      SELECT * FROM memory_archives WHERE id = ?
    `, archiveId) as any;

    if (!archive) throw new Error('Archive not found');

    let exportData: any = {};

    if (options.includeMetadata) {
      exportData.metadata = {
        id: archive.id,
        agentId: archive.agent_id,
        worldId: archive.world_id,
        sessionName: archive.session_name,
        archiveReason: archive.archive_reason,
        messageCount: archive.message_count,
        startTime: archive.start_time,
        endTime: archive.end_time,
        participants: JSON.parse(archive.participants || '[]'),
        tags: JSON.parse(archive.tags || '[]'),
        summary: archive.summary,
        createdAt: archive.created_at
      };
    }

    if (options.includeMessages) {
      const messages = await all(`
        SELECT role, content, sender, original_created_at as createdAt
        FROM archived_messages
        WHERE archive_id = ?
        ORDER BY id ASC
      `, archiveId);

      exportData.messages = messages;
    }

    // Format based on requested format
    switch (options.format) {
      case 'json':
        return JSON.stringify(exportData, null, 2);
      
      case 'csv':
        if (!options.includeMessages) throw new Error('CSV format requires includeMessages=true');
        const csvHeaders = 'Role,Content,Sender,Created At\n';
        const csvRows = exportData.messages.map((msg: any) => 
          `"${msg.role}","${msg.content.replace(/"/g, '""')}","${msg.sender || ''}","${msg.createdAt}"`
        ).join('\n');
        return csvHeaders + csvRows;
      
      case 'txt':
        if (!options.includeMessages) throw new Error('TXT format requires includeMessages=true');
        return exportData.messages.map((msg: any) => 
          `[${msg.createdAt}] ${msg.sender || msg.role}: ${msg.content}`
        ).join('\n\n');
      
      case 'markdown':
        let md = '';
        if (options.includeMetadata) {
          md += `# Archive: ${exportData.metadata.sessionName || exportData.metadata.id}\n\n`;
          md += `**Agent:** ${exportData.metadata.agentId}\n`;
          md += `**World:** ${exportData.metadata.worldId}\n`;
          md += `**Created:** ${exportData.metadata.createdAt}\n`;
          md += `**Messages:** ${exportData.metadata.messageCount}\n\n`;
        }
        if (options.includeMessages) {
          md += '## Conversation\n\n';
          md += exportData.messages.map((msg: any) => 
            `**${msg.sender || msg.role}:** ${msg.content}\n`
          ).join('\n');
        }
        return md;
      
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  /**
   * Update archive statistics
   */
  private async updateArchiveStatistics(worldId: string, agentId: string): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    const get = promisify(this.db.get.bind(this.db));

    const today = new Date().toISOString().split('T')[0];

    // Get current statistics for today
    const stats = await get(`
      SELECT COUNT(*) as archive_count, SUM(message_count) as message_count
      FROM memory_archives
      WHERE world_id = ? AND agent_id = ? AND DATE(created_at) = ?
    `, worldId, agentId, today) as any;

    // Update or insert daily statistics
    await run(`
      INSERT OR REPLACE INTO archive_statistics (
        world_id, agent_id, stat_type, stat_date, archive_count, message_count
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, 
      worldId, agentId, 'daily', today,
      stats?.archive_count || 0, stats?.message_count || 0
    );
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    return this.schema.close();
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats() {
    return this.schema.getDatabaseStats();
  }
}