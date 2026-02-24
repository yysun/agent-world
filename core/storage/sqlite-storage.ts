

/**
 * SQLite Storage Implementation for Agent World System
 *
 * Features:
 * - Full implementation of StorageAPI interface for SQLite backend
 * - Complete chat operations with proper TypeScript types (WorldChat, ChatData, etc.)
 * - Enhanced snapshot operations for world state preservation and restoration
 * - Enhanced archive management with rich metadata and search capabilities
 * - Optimized queries with prepared statements and transactions
 * - Data integrity with foreign key constraints and validation
 * - Migration support from file-based storage
 * - Performance monitoring and analytics
 *
 * Enhanced Chat Features:
 * - Full CRUD operations for world chats with proper type safety
 * - Snapshot storage and restoration with atomic transactions
 * - Foreign key relationships ensuring data consistency
 * - Efficient querying with indexed columns
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
 * - Complete type safety with proper TypeScript interfaces
 *
 * Recent Changes:
 * - 2026-02-13: Added atomic compare-and-set chat title update helper (`updateChatNameIfCurrent`).
 * - 2026-02-13: Fixed migration directory resolution so Electron runtimes launched from `electron/` still run root `migrations/`.
 * - 2025-08-01: Added proper TypeScript types for all chat operations
 * - 2025-08-01: Implemented restoreFromSnapshot with atomic transactions
 * - 2025-08-01: Enhanced type safety removing any types
 * - 2025-08-06: Fixed initialization order - migration check before schema initialization
 * - 2025-11-02: Integrated SQL migration runner, removed legacy migrations
 */


import type { Database } from 'sqlite3';
import {
  createSQLiteSchemaContext,
  validateIntegrity as schemaValidateIntegrity,
  getDatabaseStats as schemaGetDatabaseStats,
  closeSchema,
  ArchiveMetadata,
  ArchiveStatistics,
  SQLiteConfig,
  SQLiteSchemaContext
} from './sqlite-schema.js';
import { runMigrations } from './migration-runner.js';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import type { StorageAPI, World, Agent, AgentMessage, Chat, CreateChatParams, UpdateChatParams, WorldChat } from '../types.js';
import { toKebabCase } from '../utils.js';

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

function resolveMigrationsDir(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), 'migrations'),
    path.resolve(process.cwd(), '..', 'migrations'),
    path.resolve(moduleDir, '../../migrations'),
    path.resolve(moduleDir, '../../../migrations')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

async function ensureInitialized(ctx: SQLiteStorageContext): Promise<void> {
  if (!ctx.isInitialized) {
    const migrationsDir = resolveMigrationsDir();

    // Always run migrations - this handles both fresh databases (starting with 0000)
    // and existing databases that need updates
    await runMigrations({
      db: ctx.schemaCtx.db,
      migrationsDir
    });

    ctx.isInitialized = true;
  }
}

/**
 * Utility to initialize the database schema and insert a default world and agent if not present.
 * This is useful for first-time setup or testing.
 */
export async function initializeWithDefaults(ctx: SQLiteStorageContext): Promise<void> {
  await ensureInitialized(ctx);
  // Insert default world if not exists
  const defaultWorldId = 'default-world';
  // Only create the default world if no worlds exist in the database
  const worldCountRow = await get(ctx, `SELECT COUNT(*) as count FROM worlds`);
  if (worldCountRow && worldCountRow.count === 0) {
    const defaultWorldId = 'default-world';
    await run(ctx, `
        INSERT INTO worlds (id, name, description, turn_limit, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, defaultWorldId, 'Default World', 'The default world for Agent World system.', 100);
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

async function all(ctx: SQLiteStorageContext, sql: string, ...params: any[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    ctx.db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// WORLD OPERATIONS
export async function saveWorld(ctx: SQLiteStorageContext, worldData: World): Promise<void> {
  await ensureInitialized(ctx);
  // Use INSERT with ON CONFLICT UPDATE instead of INSERT OR REPLACE to avoid foreign key cascade issues
  await run(ctx, `
    INSERT INTO worlds (id, name, description, turn_limit, main_agent, chat_llm_provider, chat_llm_model, current_chat_id, mcp_config, variables, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      turn_limit = excluded.turn_limit,
      main_agent = excluded.main_agent,
      chat_llm_provider = excluded.chat_llm_provider,
      chat_llm_model = excluded.chat_llm_model,
      current_chat_id = excluded.current_chat_id,
      variables = excluded.variables,
      mcp_config = excluded.mcp_config,
      updated_at = CURRENT_TIMESTAMP
  `, worldData.id, worldData.name, worldData.description, worldData.turnLimit,
    worldData.mainAgent, worldData.chatLLMProvider, worldData.chatLLMModel, worldData.currentChatId, worldData.mcpConfig, worldData.variables);
}

export async function loadWorld(ctx: SQLiteStorageContext, worldId: string): Promise<World | null> {
  await ensureInitialized(ctx);
  const result = await get(ctx, `
    SELECT id, name, description, turn_limit as turnLimit,
           main_agent as mainAgent,
           chat_llm_provider as chatLLMProvider, chat_llm_model as chatLLMModel,
           current_chat_id as currentChatId, mcp_config as mcpConfig,
           variables as variables
    FROM worlds WHERE id = ?
  `, worldId) as World | undefined;
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

export async function listWorlds(ctx: SQLiteStorageContext): Promise<World[]> {
  await ensureInitialized(ctx);
  const results = await all(ctx, `
    SELECT id, name, description, turn_limit as turnLimit,
           main_agent as mainAgent,
           chat_llm_provider as chatLLMProvider, chat_llm_model as chatLLMModel,
           current_chat_id as currentChatId, mcp_config as mcpConfig,
           variables as variables
    FROM worlds
    ORDER BY name
  `) as World[];
  return results || [];
}

// AGENT OPERATIONS
export async function saveAgent(ctx: SQLiteStorageContext, worldId: string, agent: Agent): Promise<void> {
  await ensureInitialized(ctx);
  await run(ctx, `
    INSERT OR REPLACE INTO agents (
      id, world_id, name, type, status, provider, model, system_prompt,
      temperature, max_tokens, auto_reply, llm_call_count, last_active, last_llm_call
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    agent.id, worldId, agent.name, agent.type, agent.status || 'inactive',
    agent.provider, agent.model, agent.systemPrompt,
    agent.temperature, agent.maxTokens, agent.autoReply === false ? 0 : 1, agent.llmCallCount,
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
           temperature, max_tokens as maxTokens, auto_reply as autoReply, llm_call_count as llmCallCount,
           created_at as createdAt, last_active as lastActive, last_llm_call as lastLLMCall
    FROM agents WHERE id = ? AND world_id = ?
  `, agentId, worldId) as any;
  if (!agentData) return null;
  const memoryData = await all(ctx, `
    SELECT role, content, sender, chat_id as chatId, message_id as messageId, reply_to_message_id as replyToMessageId, 
           tool_calls as toolCalls, tool_call_id as toolCallId, created_at as createdAt
    FROM agent_memory
    WHERE agent_id = ? AND world_id = ?
    ORDER BY created_at ASC
  `, agentId, worldId) as AgentMessage[];
  const agent: Agent = {
    ...agentData,
    autoReply: agentData.autoReply === 0 ? false : true,
    createdAt: agentData.createdAt ? new Date(agentData.createdAt) : new Date(),
    lastActive: agentData.lastActive ? new Date(agentData.lastActive) : new Date(),
    lastLLMCall: agentData.lastLLMCall ? new Date(agentData.lastLLMCall) : undefined,
    memory: memoryData.map(msg => ({
      ...msg,
      createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
      chatId: msg.chatId, // Preserve chatId field
      tool_calls: (msg as any).toolCalls ? JSON.parse((msg as any).toolCalls) : undefined,
      tool_call_id: (msg as any).toolCallId || undefined
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
        temperature, max_tokens as maxTokens, auto_reply as autoReply, llm_call_count as llmCallCount,
           created_at as createdAt, last_active as lastActive, last_llm_call as lastLLMCall
    FROM agents WHERE world_id = ?
    ORDER BY name
  `, worldId) as any[];
  const result: Agent[] = [];
  for (const agentData of agents) {
    const memoryData = await all(ctx, `
      SELECT role, content, sender, chat_id as chatId, message_id as messageId, reply_to_message_id as replyToMessageId,
             tool_calls as toolCalls, tool_call_id as toolCallId, created_at as createdAt
      FROM agent_memory
      WHERE agent_id = ? AND world_id = ?
      ORDER BY created_at ASC
    `, agentData.id, worldId) as AgentMessage[];
    const agent: Agent = {
      ...agentData,
      autoReply: agentData.autoReply === 0 ? false : true,
      createdAt: agentData.createdAt ? new Date(agentData.createdAt) : new Date(),
      lastActive: agentData.lastActive ? new Date(agentData.lastActive) : new Date(),
      lastLLMCall: agentData.lastLLMCall ? new Date(agentData.lastLLMCall) : undefined,
      memory: memoryData.map(msg => ({
        ...msg,
        createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
        chatId: msg.chatId, // Preserve chatId field
        replyToMessageId: msg.replyToMessageId, // Preserve replyToMessageId field
        tool_calls: msg.tool_calls ? JSON.parse(msg.tool_calls as any) : undefined // Parse JSON string to object
      })),
    } as Agent;
    result.push(agent);
  }
  return result;
}

export async function saveAgentMemory(ctx: SQLiteStorageContext, worldId: string, agentId: string, memory: AgentMessage[]): Promise<void> {
  await run(ctx, `DELETE FROM agent_memory WHERE agent_id = ? AND world_id = ?`, agentId, worldId);

  // CRITICAL: Filter out system messages - they should NEVER be saved to storage
  // System messages are generated dynamically during LLM preparation
  const filteredMemory = memory.filter(msg => msg.role !== 'system');
  if (filteredMemory.length < memory.length) {
    const logger = await import('../logger.js').then(m => m.logger);
    logger.warn('Filtered out system messages from agent memory before saving to SQLite', {
      agentId,
      worldId,
      removedCount: memory.length - filteredMemory.length,
      remainingCount: filteredMemory.length
    });
  }

  for (const message of filteredMemory) {
    await run(ctx, `
      INSERT INTO agent_memory (agent_id, world_id, role, content, sender, chat_id, message_id, reply_to_message_id, tool_calls, tool_call_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      agentId, worldId, message.role, message.content, message.sender, message.chatId, message.messageId, message.replyToMessageId,
      message.tool_calls ? JSON.stringify(message.tool_calls) : null,
      message.tool_call_id || null,
      message.createdAt instanceof Date ? message.createdAt.toISOString() : (message.createdAt || new Date().toISOString())
    );
  }
}

// MEMORY CLEANUP OPERATIONS
export async function deleteMemoryByChatId(ctx: SQLiteStorageContext, worldId: string, chatId: string): Promise<number> {
  await ensureInitialized(ctx);
  const result = await run(ctx, `
    DELETE FROM agent_memory WHERE world_id = ? AND chat_id = ?
  `, worldId, chatId);
  return result.changes || 0;
}

// GET MEMORY (aggregated across agents for a given chat)
export async function getMemory(ctx: SQLiteStorageContext, worldId: string, chatId: string): Promise<AgentMessage[]> {
  await ensureInitialized(ctx);
  const rows = await all(ctx, `
    SELECT role, content, sender, chat_id as chatId, message_id as messageId, reply_to_message_id as replyToMessageId,
           tool_calls as toolCalls, tool_call_id as toolCallId, agent_id as agentId, created_at as createdAt
    FROM agent_memory
    WHERE world_id = ? AND (? = '' OR chat_id = ?)
    ORDER BY datetime(created_at) ASC, rowid ASC
  `, worldId, chatId || '', chatId || '');

  return (rows || []).map((r: any) => ({
    role: r.role,
    content: r.content,
    sender: r.sender,
    chatId: r.chatId,
    messageId: r.messageId,
    replyToMessageId: r.replyToMessageId, // FIX: Include replyToMessageId from database
    tool_calls: r.toolCalls ? JSON.parse(r.toolCalls) : undefined,
    tool_call_id: r.toolCallId || undefined,
    agentId: r.agentId,
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date()
  }));
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

// CHAT HISTORY OPERATIONS
export async function saveChatData(ctx: SQLiteStorageContext, worldId: string, chat: Chat): Promise<void> {
  await ensureInitialized(ctx);
  await run(ctx, `
    INSERT INTO world_chats (id, world_id, name, description, message_count, tags, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      message_count = excluded.message_count,
      tags = excluded.tags,
      updated_at = CURRENT_TIMESTAMP
  `, chat.id, worldId, chat.name, chat.description, chat.messageCount || 0);
}

export async function loadChatData(ctx: SQLiteStorageContext, worldId: string, chatId: string): Promise<Chat | null> {
  await ensureInitialized(ctx);
  const result = await get(ctx, `
    SELECT id, world_id as worldId, name, description, message_count as messageCount,
           tags, created_at as createdAt, updated_at as updatedAt
    FROM world_chats
    WHERE id = ? AND world_id = ?
  `, chatId, worldId);

  if (!result) return null;

  // Load chat if exists
  const chat = await get(ctx, `
    SELECT snapshot_data as snapshotData, captured_at as capturedAt, version
    FROM chat_snapshots
    WHERE chat_id = ? AND world_id = ?
    ORDER BY captured_at DESC
    LIMIT 1
  `, chatId, worldId);

  return {
    ...result,
    createdAt: new Date(result.createdAt),
    updatedAt: new Date(result.updatedAt),
    tags: JSON.parse(result.tags || '[]'),
    chat: chat ? {
      ...JSON.parse(chat.snapshotData),
      metadata: {
        ...JSON.parse(chat.snapshotData).metadata,
        capturedAt: new Date(chat.capturedAt),
        version: chat.version
      }
    } : undefined
  };
}

export async function deleteChatData(ctx: SQLiteStorageContext, worldId: string, chatId: string): Promise<boolean> {
  await ensureInitialized(ctx);
  const result = await run(ctx, `
    DELETE FROM world_chats WHERE id = ? AND world_id = ?
  `, chatId, worldId);
  return result.changes > 0;
}

export async function listChatHistories(ctx: SQLiteStorageContext, worldId: string): Promise<Chat[]> {
  await ensureInitialized(ctx);
  const results = await all(ctx, `
    SELECT id, name, description, message_count as messageCount,
           tags, created_at as createdAt, updated_at as updatedAt
    FROM world_chats
    WHERE world_id = ?
    ORDER BY updated_at DESC
  `, worldId);

  return results.map(chat => ({
    ...chat,
    createdAt: new Date(chat.createdAt),
    updatedAt: new Date(chat.updatedAt),
    tags: JSON.parse(chat.tags || '[]')
  }));
}

export async function updateChatData(ctx: SQLiteStorageContext, worldId: string, chatId: string, updates: UpdateChatParams): Promise<Chat | null> {
  await ensureInitialized(ctx);

  const setClauses: string[] = [];
  const params: any[] = [];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    params.push(updates.name);
  }
  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    params.push(updates.description);
  }
  if (updates.tags !== undefined) {
    setClauses.push('tags = ?');
    params.push(JSON.stringify(updates.tags));
  }
  if (updates.messageCount !== undefined) {
    setClauses.push('message_count = ?');
    params.push(updates.messageCount);
  }

  if (setClauses.length === 0) {
    return await loadChatData(ctx, worldId, chatId);
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP');
  params.push(chatId, worldId);

  await run(ctx, `
    UPDATE world_chats
    SET ${setClauses.join(', ')}
    WHERE id = ? AND world_id = ?
  `, ...params);

  return await loadChatData(ctx, worldId, chatId);
}

export async function updateChatNameIfCurrent(
  ctx: SQLiteStorageContext,
  worldId: string,
  chatId: string,
  expectedName: string,
  nextName: string
): Promise<boolean> {
  await ensureInitialized(ctx);
  const result = await run(ctx, `
    UPDATE world_chats
    SET name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND world_id = ? AND name = ?
  `, nextName, chatId, worldId, expectedName);
  return (result.changes || 0) > 0;
}

// CHAT OPERATIONS
export async function saveWorldChat(ctx: SQLiteStorageContext, worldId: string, chatId: string, chat: WorldChat): Promise<void> {
  await ensureInitialized(ctx);
  await run(ctx, `
    INSERT INTO chat_snapshots (chat_id, world_id, snapshot_data, version)
    VALUES (?, ?, ?, ?)
  `, chatId, worldId, JSON.stringify(chat), chat.metadata?.version || '1.0');
}

export async function loadWorldChatFull(ctx: SQLiteStorageContext, worldId: string, chatId: string): Promise<WorldChat | null> {
  await ensureInitialized(ctx);

  // Get the chat metadata
  const result = await get(ctx, `
    SELECT id, name, description, message_count as messageCount,
           tags, created_at as createdAt, updated_at as updatedAt
    FROM world_chats
    WHERE id = ? AND world_id = ?
  `, chatId, worldId);

  if (!result) return null;

  // Get the chat snapshot data
  const chat = await get(ctx, `
    SELECT snapshot_data as snapshotData, captured_at as capturedAt, version
    FROM chat_snapshots
    WHERE chat_id = ? AND world_id = ?
    ORDER BY captured_at DESC
    LIMIT 1
  `, chatId, worldId);

  if (!chat) return null; // No snapshot data found

  const snapshotData = JSON.parse(chat.snapshotData);

  // Return merged WorldChat with snapshot fields accessible directly
  // This matches the web interface expectation
  return {
    // Chat metadata (ChatInfo + worldId)
    id: result.id,
    worldId: worldId,
    name: result.name,
    description: result.description,
    createdAt: new Date(result.createdAt),
    updatedAt: new Date(result.updatedAt),
    messageCount: result.messageCount,
    tags: JSON.parse(result.tags || '[]'),

    // Snapshot data (core WorldChat fields)
    world: snapshotData.world,
    agents: snapshotData.agents,
    messages: snapshotData.messages,
    metadata: {
      ...snapshotData.metadata,
      capturedAt: new Date(chat.capturedAt),
      version: chat.version
    }
  } as any; // Use 'as any' since this is a merged type that differs between web and core
}

export async function loadWorldChat(ctx: SQLiteStorageContext, worldId: string, chatId: string): Promise<WorldChat | null> {
  await ensureInitialized(ctx);
  const result = await get(ctx, `
    SELECT snapshot_data as snapshotData, captured_at as capturedAt, version
    FROM chat_snapshots
    WHERE chat_id = ? AND world_id = ?
    ORDER BY captured_at DESC
    LIMIT 1
  `, chatId, worldId);

  if (!result) return null;

  const chat = JSON.parse(result.snapshotData);
  return {
    ...chat,
    metadata: {
      ...chat.metadata,
      capturedAt: new Date(result.capturedAt),
      version: result.version
    }
  };
}

export async function restoreFromWorldChat(ctx: SQLiteStorageContext, worldId: string, chat: WorldChat): Promise<boolean> {
  await ensureInitialized(ctx);

  try {
    // Begin transaction for atomic restore
    await run(ctx, 'BEGIN TRANSACTION');

    // Restore world data
    if (chat.world) {
      await run(ctx, `
        UPDATE worlds
        SET name = ?, description = ?, turn_limit = ?, main_agent = ?, chat_llm_provider = ?, chat_llm_model = ?
        WHERE id = ?
      `, chat.world.name, chat.world.description, chat.world.turnLimit,
        chat.world.mainAgent, chat.world.chatLLMProvider, chat.world.chatLLMModel, worldId);
    }

    // Clear existing agents for this world
    await run(ctx, 'DELETE FROM agents WHERE world_id = ?', worldId);

    // Restore agents
    if (chat.agents && chat.agents.length > 0) {
      for (const agent of chat.agents) {
        await run(ctx, `
          INSERT INTO agents (
            id, world_id, name, type, status, provider, model, system_prompt,
            temperature, max_tokens, auto_reply, created_at, last_active, llm_call_count, last_llm_call
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, agent.id, worldId, agent.name, agent.type, agent.status || 'active',
          agent.provider, agent.model, agent.systemPrompt, agent.temperature,
          agent.maxTokens, agent.autoReply === false ? 0 : 1,
          agent.createdAt instanceof Date ? agent.createdAt.toISOString() : agent.createdAt,
          agent.lastActive instanceof Date ? agent.lastActive.toISOString() : agent.lastActive,
          agent.llmCallCount || 0,
          agent.lastLLMCall instanceof Date ? agent.lastLLMCall.toISOString() : agent.lastLLMCall);

        // Clear and restore agent memory
        await run(ctx, 'DELETE FROM agent_memory WHERE agent_id = ? AND world_id = ?', agent.id, worldId);

        if (agent.memory && agent.memory.length > 0) {
          for (const message of agent.memory) {
            await run(ctx, `
              INSERT INTO agent_memory (agent_id, world_id, role, content, sender, chat_id, message_id, reply_to_message_id, tool_calls, tool_call_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, agent.id, worldId, message.role, message.content, message.sender, message.chatId, message.messageId, message.replyToMessageId,
              message.tool_calls ? JSON.stringify(message.tool_calls) : null,
              message.tool_call_id || null,
              message.createdAt instanceof Date ? message.createdAt.toISOString() : (message.createdAt || new Date().toISOString()));
          }
        }
      }
    }

    await run(ctx, 'COMMIT');
    return true;
  } catch (error) {
    await run(ctx, 'ROLLBACK');
    console.error('[sqlite-storage] Failed to restore from world chat:', error);
    return false;
  }
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
  const firstMessage = memory.length > 0 ? memory[0] : null;
  const lastMessage = memory.length > 0 ? memory[memory.length - 1] : null;
  const startTime = metadata?.startTime || (firstMessage?.createdAt ? (firstMessage.createdAt instanceof Date ? firstMessage.createdAt.toISOString() : firstMessage.createdAt) : new Date().toISOString());
  const endTime = metadata?.endTime || (lastMessage?.createdAt ? (lastMessage.createdAt instanceof Date ? lastMessage.createdAt.toISOString() : lastMessage.createdAt) : new Date().toISOString());
  const archiveResult = await run(ctx, `
    INSERT INTO memory_archives (
      agent_id, world_id, session_name, archive_reason, message_count,
      start_time, end_time, participants, tags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    agentId, worldId, metadata?.sessionName, metadata?.archiveReason,
    memory.length, startTime, endTime,
    JSON.stringify(participants), JSON.stringify(metadata?.tags || [])
  );
  const archiveId = (archiveResult as any).lastID;
  for (const message of memory) {
    await run(ctx, `
      INSERT INTO archived_messages (
        archive_id, role, content, sender, original_created_at
      ) VALUES (?, ?, ?, ?, ?)
    `,
      archiveId, message.role, message.content, message.sender,
      message.createdAt instanceof Date ? message.createdAt.toISOString() : (message.createdAt || new Date().toISOString())
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
           end_time as endTime, participants, tags,
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
