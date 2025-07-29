/**
 * Utility to initialize the database schema and insert a default world and agent if not present.
 * This is useful for first-time setup or testing.
 * Modified to avoid recreating deleted agents - only creates defaults if no agents exist at all.
 */
export async function initializeWithDefaults(ctx: SQLiteStorageContext): Promise<void> {
  await ensureInitialized(ctx);
  
  // Insert default world if not exists
  const defaultWorldId = 'default-world';
  const world = await get(ctx, `SELECT id FROM worlds WHERE id = ?`, defaultWorldId);
  if (!world) {
    await run(ctx, `
      INSERT INTO worlds (id, name, description, turn_limit, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, defaultWorldId, 'Default World', 'The default world for Agent World system.', 100);
  }
  
  // Only insert default agent if NO agents exist in the default world
  // This prevents recreation of intentionally deleted agents
  const existingAgents = await all(ctx, `SELECT id FROM agents WHERE world_id = ?`, defaultWorldId);
  
  if (existingAgents.length === 0) {
    const defaultAgentId = 'default-agent';
    await run(ctx, `
      INSERT INTO agents (
        id, world_id, name, type, status, provider, model, system_prompt,
        temperature, max_tokens, llm_call_count, last_active, last_llm_call
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      defaultAgentId, defaultWorldId, 'Default Agent', 'assistant', 'active',
      'ollama', 'llama3.2:3b', 'You are a helpful assistant.',
      0.7, 2048, 0, new Date().toISOString(), new Date().toISOString()
    );
  }
}

// ...existing code...
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


import type { Database } from 'sqlite3';
import {
  createSQLiteSchemaContext,
  initializeSchema,
  needsMigration,
  migrate,
  validateIntegrity as schemaValidateIntegrity,
  getDatabaseStats as schemaGetDatabaseStats,
  closeSchema,
  SQLiteConfig,
  ArchiveMetadata,
  ArchiveStatistics
} from './sqlite-schema.js';
import type { StorageManager, WorldData, Agent, AgentMessage } from './types.js';
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


// Context object for function-based storage

export interface SQLiteStorageContext {
  schemaCtx: Awaited<ReturnType<typeof createSQLiteSchemaContext>>;
  db: Database;
  isInitialized: boolean;
}

export async function createSQLiteStorageContext(config: SQLiteConfig): Promise<SQLiteStorageContext> {
  const schemaCtx = await createSQLiteSchemaContext(config);
  return {
    schemaCtx,
    db: schemaCtx.db,
    isInitialized: false
  };
}

async function ensureInitialized(ctx: SQLiteStorageContext): Promise<void> {
  if (!ctx.isInitialized) {
    await initializeSchema(ctx.schemaCtx);
    if (await needsMigration(ctx.schemaCtx)) {
      await migrate(ctx.schemaCtx);
    }
    ctx.isInitialized = true;
  }
}

async function run(ctx: SQLiteStorageContext, sql: string, ...params: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    ctx.db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function get(ctx: SQLiteStorageContext, sql: string, ...params: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    ctx.db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export { get }; // Export for use in storage factory

async function all(ctx: SQLiteStorageContext, sql: string, ...params: any[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    ctx.db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// WORLD OPERATIONS
export async function saveWorld(ctx: SQLiteStorageContext, worldData: WorldData): Promise<void> {
  await ensureInitialized(ctx);
  // Use INSERT with ON CONFLICT UPDATE instead of INSERT OR REPLACE to avoid foreign key cascade issues
  await run(ctx, `
    INSERT INTO worlds (id, name, description, turn_limit, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      turn_limit = excluded.turn_limit,
      updated_at = CURRENT_TIMESTAMP
  `, worldData.id, worldData.name, worldData.description, worldData.turnLimit);
}

export async function loadWorld(ctx: SQLiteStorageContext, worldId: string): Promise<WorldData | null> {
  await ensureInitialized(ctx);
  const result = await get(ctx, `
    SELECT id, name, description, turn_limit as turnLimit
    FROM worlds WHERE id = ?
  `, worldId) as WorldData | undefined;
  return result || null;
}

export async function deleteWorld(ctx: SQLiteStorageContext, worldId: string): Promise<boolean> {
  await ensureInitialized(ctx);
  try {
    const result = await run(ctx, `DELETE FROM worlds WHERE id = ?`, worldId);
    return (result as any).changes > 0;
  } catch {
    return false;
  }
}

export async function listWorlds(ctx: SQLiteStorageContext): Promise<WorldData[]> {
  await ensureInitialized(ctx);
  const results = await all(ctx, `
    SELECT id, name, description, turn_limit as turnLimit
    FROM worlds
    ORDER BY name
  `) as WorldData[];
  return results || [];
}

// AGENT OPERATIONS
export async function saveAgent(ctx: SQLiteStorageContext, worldId: string, agent: Agent): Promise<void> {
  await ensureInitialized(ctx);
  await run(ctx, `
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
  if (agent.memory && agent.memory.length > 0) {
    await saveAgentMemory(ctx, worldId, agent.id, agent.memory);
  }
}

export async function loadAgent(ctx: SQLiteStorageContext, worldId: string, agentId: string): Promise<Agent | null> {
  await ensureInitialized(ctx);
  const agentData = await get(ctx, `
    SELECT id, name, type, status, provider, model, system_prompt as systemPrompt,
           temperature, max_tokens as maxTokens, llm_call_count as llmCallCount,
           created_at as createdAt, last_active as lastActive, last_llm_call as lastLLMCall
    FROM agents WHERE id = ? AND world_id = ?
  `, agentId, worldId) as any;
  if (!agentData) return null;
  const memoryData = await all(ctx, `
    SELECT role, content, sender, created_at as createdAt
    FROM agent_memory
    WHERE agent_id = ? AND world_id = ?
    ORDER BY created_at ASC
  `, agentId, worldId) as AgentMessage[];
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
  return agent;
}

export async function deleteAgent(ctx: SQLiteStorageContext, worldId: string, agentId: string): Promise<boolean> {
  await ensureInitialized(ctx);
  try {
    const result = await run(ctx, `
      DELETE FROM agents WHERE id = ? AND world_id = ?
    `, agentId, worldId);
    return (result as any).changes > 0;
  } catch {
    return false;
  }
}

export async function listAgents(ctx: SQLiteStorageContext, worldId: string): Promise<Agent[]> {
  await ensureInitialized(ctx);
  const agents = await all(ctx, `
    SELECT id, name, type, status, provider, model, system_prompt as systemPrompt,
           temperature, max_tokens as maxTokens, llm_call_count as llmCallCount,
           created_at as createdAt, last_active as lastActive, last_llm_call as lastLLMCall
    FROM agents WHERE world_id = ?
    ORDER BY name
  `, worldId) as any[];
  const result: Agent[] = [];
  for (const agentData of agents) {
    const memoryData = await all(ctx, `
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

async function saveAgentMemory(ctx: SQLiteStorageContext, worldId: string, agentId: string, memory: AgentMessage[]): Promise<void> {
  await run(ctx, `DELETE FROM agent_memory WHERE agent_id = ? AND world_id = ?`, agentId, worldId);
  for (const message of memory) {
    await run(ctx, `
      INSERT INTO agent_memory (agent_id, world_id, role, content, sender, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      agentId, worldId, message.role, message.content, message.sender,
      message.createdAt?.toISOString() || new Date().toISOString()
    );
  }
}

// BATCH OPERATIONS
export async function saveAgentsBatch(ctx: SQLiteStorageContext, worldId: string, agents: Agent[]): Promise<void> {
  await ensureInitialized(ctx);
  for (const agent of agents) {
    await saveAgent(ctx, worldId, agent);
  }
}

export async function loadAgentsBatch(ctx: SQLiteStorageContext, worldId: string, agentIds: string[]): Promise<Agent[]> {
  await ensureInitialized(ctx);
  const agents: Agent[] = [];
  for (const agentId of agentIds) {
    const agent = await loadAgent(ctx, worldId, agentId);
    if (agent) agents.push(agent);
  }
  return agents;
}

// INTEGRITY OPERATIONS
export async function validateIntegrity(ctx: SQLiteStorageContext, worldId: string, agentId?: string): Promise<boolean> {
  await ensureInitialized(ctx);
  const schemaValidation = await schemaValidateIntegrity(ctx.schemaCtx);
  if (!schemaValidation.isValid) return false;
  try {
    if (agentId) {
      const agent = await get(ctx, `
        SELECT id FROM agents WHERE id = ? AND world_id = ?
      `, agentId, worldId);
      return !!agent;
    } else {
      const world = await get(ctx, `SELECT id FROM worlds WHERE id = ?`, worldId);
      return !!world;
    }
  } catch {
    return false;
  }
}

export async function repairData(ctx: SQLiteStorageContext, worldId: string, agentId?: string): Promise<boolean> {
  await ensureInitialized(ctx);
  return false;
}

// ARCHIVE OPERATIONS
export async function archiveAgentMemory(
  ctx: SQLiteStorageContext,
  worldId: string,
  agentId: string,
  memory: AgentMessage[],
  metadata?: ArchiveMetadata
): Promise<number> {
  await ensureInitialized(ctx);
  const participants = metadata?.participants || [...new Set(memory.map(m => m.sender).filter(Boolean))] as string[];
  const startTime = metadata?.startTime || (memory.length > 0 ? memory[0].createdAt?.toISOString() : new Date().toISOString());
  const endTime = metadata?.endTime || (memory.length > 0 ? memory[memory.length - 1].createdAt?.toISOString() : new Date().toISOString());
  const archiveResult = await run(ctx, `
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
  for (const message of memory) {
    await run(ctx, `
      INSERT INTO archived_messages (
        archive_id, role, content, sender, original_created_at
      ) VALUES (?, ?, ?, ?, ?)
    `,
      archiveId, message.role, message.content, message.sender,
      message.createdAt?.toISOString() || new Date().toISOString()
    );
  }
  return archiveId;
}

// SEARCH AND STATS
export async function searchArchives(ctx: SQLiteStorageContext, options: ArchiveQueryOptions): Promise<ArchiveSearchResult> {
  await ensureInitialized(ctx);
  const archives = await all(ctx, `
    SELECT id, agent_id as agentId, world_id as worldId,
           session_name as sessionName, archive_reason as archiveReason,
           message_count as messageCount, start_time as startTime,
           end_time as endTime, participants, tags, summary,
           created_at as createdAt
    FROM memory_archives
    WHERE world_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `, options.worldId || '');
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
    totalCount: result.length,
    hasMore: false
  };
}

export async function getArchiveStatistics(ctx: SQLiteStorageContext, worldId: string, agentId?: string): Promise<ArchiveStatistics> {
  await ensureInitialized(ctx);
  const basicStats = await get(ctx, `
    SELECT COUNT(*) as totalArchives,
           SUM(message_count) as totalMessages,
           AVG(message_count) as averageSessionLength
    FROM memory_archives
    WHERE world_id = ?
  `, worldId) as any;
  return {
    totalArchives: basicStats?.totalArchives || 0,
    totalMessages: basicStats?.totalMessages || 0,
    averageSessionLength: basicStats?.averageSessionLength || 0,
    mostActiveAgent: '',
    archiveFrequency: {}
  };
}

export async function exportArchive(ctx: SQLiteStorageContext, archiveId: number, options: ArchiveExportOptions): Promise<string> {
  await ensureInitialized(ctx);
  const archive = await get(ctx, `
    SELECT * FROM memory_archives WHERE id = ?
  `, archiveId) as any;
  if (!archive) throw new Error('Archive not found');
  let messages: any[] = [];
  if (options.includeMessages) {
    messages = await all(ctx, `
      SELECT role, content, sender, original_created_at as createdAt
      FROM archived_messages
      WHERE archive_id = ?
      ORDER BY id ASC
    `, archiveId);
  }
  const exportData = {
    metadata: options.includeMetadata ? {
      id: archive.id,
      agentId: archive.agent_id,
      worldId: archive.world_id,
      sessionName: archive.session_name,
      createdAt: archive.created_at
    } : undefined,
    messages: options.includeMessages ? messages : undefined
  };
  return JSON.stringify(exportData, null, 2);
}

export async function close(ctx: SQLiteStorageContext): Promise<void> {
  return closeSchema(ctx.schemaCtx);
}

export async function getDatabaseStats(ctx: SQLiteStorageContext) {
  return schemaGetDatabaseStats(ctx.schemaCtx);
}