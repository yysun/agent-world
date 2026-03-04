/**
 * SQLite Storage Behavioral Tests
 *
 * Purpose:
 * - Cover runtime behavior of sqlite-storage functions with callback-compatible in-memory DB fakes.
 *
 * Key features:
 * - Initialization flow through runMigrations only once per context.
 * - Default world bootstrap and world CRUD operations.
 * - Agent memory hydration for aliased tool call columns.
 * - System-message filtering in saveAgentMemory persistence.
 * - Aggregated getMemory mapping for tool/reply/message metadata.
 * - Chat snapshot/archive operations and restore transaction behavior.
 * - Integrity and statistics helper behavior.
 * - Compare-and-set chat title update helper behavior.
 *
 * Notes:
 * - No filesystem/database access; all DB interactions are fake callback handlers.
 */

import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  archiveAgentMemory,
  close,
  deleteAgent,
  deleteChatData,
  deleteMemoryByChatId,
  deleteWorld,
  exportArchive,
  getArchiveStatistics,
  getDatabaseStats,
  getMemory,
  initializeWithDefaults,
  loadChatData,
  loadWorld,
  loadWorldChat,
  loadWorldChatFull,
  loadAgentsBatch,
  listChatHistories,
  listAgents,
  restoreFromWorldChat,
  listWorlds,
  repairData,
  loadAgent,
  saveAgent,
  saveAgentsBatch,
  saveChatData,
  saveAgentMemory,
  saveWorld,
  saveWorldChat,
  searchArchives,
  updateChatData,
  updateChatNameIfCurrent,
  validateIntegrity,
  type SQLiteStorageContext,
} from '../../../core/storage/sqlite-storage.js';
import type { AgentMessage } from '../../../core/types.js';

const { runMigrationsMock } = vi.hoisted(() => ({
  runMigrationsMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../core/storage/migration-runner.js', () => ({
  runMigrations: runMigrationsMock,
}));

type RunResult = {
  changes?: number;
  lastID?: number;
  error?: Error;
};

type DbHandlers = {
  onRun?: (sql: string, params: any[]) => RunResult | undefined;
  onGet?: (sql: string, params: any[]) => any;
  onAll?: (sql: string, params: any[]) => any[];
};

function createMockDb(handlers: DbHandlers = {}) {
  const runCalls: Array<{ sql: string; params: any[] }> = [];
  const getCalls: Array<{ sql: string; params: any[] }> = [];
  const allCalls: Array<{ sql: string; params: any[] }> = [];

  const db: any = {
    run(
      sql: string,
      paramsOrCb?: any[] | ((err: Error | null) => void),
      cbMaybe?: (err: Error | null) => void
    ) {
      const params = Array.isArray(paramsOrCb) ? paramsOrCb : [];
      const cb = (typeof paramsOrCb === 'function' ? paramsOrCb : cbMaybe) as
        | ((err: Error | null) => void)
        | undefined;
      runCalls.push({ sql, params });

      const result = handlers.onRun?.(sql, params) ?? {};
      if (cb) {
        cb.call(
          { changes: result.changes ?? 0, lastID: result.lastID ?? 0 },
          result.error ?? null
        );
      }
    },
    get(
      sql: string,
      paramsOrCb?: any[] | ((err: Error | null, row?: any) => void),
      cbMaybe?: (err: Error | null, row?: any) => void
    ) {
      const params = Array.isArray(paramsOrCb) ? paramsOrCb : [];
      const cb = (typeof paramsOrCb === 'function' ? paramsOrCb : cbMaybe) as
        | ((err: Error | null, row?: any) => void)
        | undefined;
      getCalls.push({ sql, params });

      const row = handlers.onGet?.(sql, params);
      cb?.(null, row);
    },
    all(
      sql: string,
      paramsOrCb?: any[] | ((err: Error | null, rows?: any[]) => void),
      cbMaybe?: (err: Error | null, rows?: any[]) => void
    ) {
      const params = Array.isArray(paramsOrCb) ? paramsOrCb : [];
      const cb = (typeof paramsOrCb === 'function' ? paramsOrCb : cbMaybe) as
        | ((err: Error | null, rows?: any[]) => void)
        | undefined;
      allCalls.push({ sql, params });

      const rows = handlers.onAll?.(sql, params) ?? [];
      cb?.(null, rows);
    },
    close(cb: (err: Error | null) => void) {
      cb(null);
    },
  };

  return { db, runCalls, getCalls, allCalls };
}

function createCtx(db: any, isInitialized: boolean = false): SQLiteStorageContext {
  return {
    schemaCtx: { db } as any,
    db,
    isInitialized,
  };
}

describe('sqlite-storage behavior', () => {
  it('initializes migrations once per context across repeated calls', async () => {
    runMigrationsMock.mockClear();
    const mock = createMockDb({
      onAll: (sql) => (sql.includes('FROM worlds') ? [] : []),
    });
    const ctx = createCtx(mock.db, false);

    await listWorlds(ctx);
    await listWorlds(ctx);

    expect(runMigrationsMock).toHaveBeenCalledTimes(1);
  });

  it('creates default world only when no worlds exist', async () => {
    runMigrationsMock.mockClear();

    const emptyWorlds = createMockDb({
      onGet: (sql) => (sql.includes('COUNT(*) as count FROM worlds') ? { count: 0 } : null),
    });
    const emptyCtx = createCtx(emptyWorlds.db, false);
    await initializeWithDefaults(emptyCtx);
    expect(runMigrationsMock).toHaveBeenCalledTimes(1);
    expect(
      emptyWorlds.runCalls.some(
        (call) =>
          call.sql.includes('INSERT INTO worlds') &&
          call.params[0] === 'default-world' &&
          call.params[1] === 'Default World'
      )
    ).toBe(true);

    const existingWorlds = createMockDb({
      onGet: (sql) => (sql.includes('COUNT(*) as count FROM worlds') ? { count: 1 } : null),
    });
    const existingCtx = createCtx(existingWorlds.db, false);
    await initializeWithDefaults(existingCtx);
    expect(
      existingWorlds.runCalls.some((call) => call.sql.includes('INSERT INTO worlds'))
    ).toBe(false);
  });

  it('persists and reads world records and handles delete failures safely', async () => {
    const worldRow = {
      id: 'world-1',
      name: 'World 1',
      description: 'Desc',
      turnLimit: 10,
      mainAgent: null,
      chatLLMProvider: null,
      chatLLMModel: null,
      currentChatId: null,
      mcpConfig: null,
      variables: '',
    };
    const mock = createMockDb({
      onRun: (sql) => {
        if (sql.includes('DELETE FROM worlds')) return { changes: 1 };
        return { changes: 0 };
      },
      onGet: (sql) => (sql.includes('FROM worlds WHERE id = ?') ? worldRow : null),
      onAll: (sql) => (sql.includes('FROM worlds') ? [worldRow] : []),
    });
    const ctx = createCtx(mock.db, true);

    await saveWorld(ctx, {
      ...worldRow,
      agents: new Map(),
      chats: new Map(),
      isProcessing: false,
      eventEmitter: {} as any,
    } as any);

    await expect(loadWorld(ctx, 'world-1')).resolves.toEqual({
      ...worldRow,
      heartbeatEnabled: false,
      heartbeatInterval: null,
      heartbeatPrompt: null,
    });
    await expect(listWorlds(ctx)).resolves.toEqual([
      {
        ...worldRow,
        heartbeatEnabled: false,
        heartbeatInterval: null,
        heartbeatPrompt: null,
      }
    ]);
    await expect(deleteWorld(ctx, 'world-1')).resolves.toBe(true);

    const failingDelete = createMockDb({
      onRun: (sql) => (sql.includes('DELETE FROM worlds') ? { error: new Error('delete fail') } : {}),
    });
    await expect(deleteWorld(createCtx(failingDelete.db, true), 'world-1')).resolves.toBe(false);
  });

  it('persists heartbeat fields on worlds and restores booleans/nullables', async () => {
    const worldRow = {
      id: 'world-hb',
      name: 'Heartbeat World',
      description: 'Desc',
      turnLimit: 7,
      mainAgent: null,
      chatLLMProvider: null,
      chatLLMModel: null,
      currentChatId: 'chat-1',
      mcpConfig: null,
      variables: '',
      heartbeatEnabled: 1,
      heartbeatInterval: '*/5 * * * *',
      heartbeatPrompt: 'ping',
    };
    const mock = createMockDb({
      onGet: (sql) => (sql.includes('FROM worlds WHERE id = ?') ? worldRow : null),
      onAll: (sql) => (sql.includes('FROM worlds') ? [worldRow] : []),
    });
    const ctx = createCtx(mock.db, true);

    await saveWorld(ctx, {
      ...worldRow,
      heartbeatEnabled: true,
      agents: new Map(),
      chats: new Map(),
      isProcessing: false,
      eventEmitter: {} as any,
    } as any);

    const insertCall = mock.runCalls.find((call) => call.sql.includes('INSERT INTO worlds'));
    expect(insertCall?.params).toEqual(expect.arrayContaining([1, '*/5 * * * *', 'ping']));

    await expect(loadWorld(ctx, 'world-hb')).resolves.toMatchObject({
      heartbeatEnabled: true,
      heartbeatInterval: '*/5 * * * *',
      heartbeatPrompt: 'ping',
    });

    await expect(listWorlds(ctx)).resolves.toEqual([
      expect.objectContaining({
        heartbeatEnabled: true,
        heartbeatInterval: '*/5 * * * *',
        heartbeatPrompt: 'ping',
      })
    ]);
  });

  it('hydrates aliased tool call fields when loading an agent', async () => {
    const createdAt = '2026-01-01T10:00:00.000Z';
    const mock = createMockDb({
      onGet: (sql) => {
        if (sql.includes('FROM agents WHERE')) {
          return {
            id: 'agent-1',
            name: 'Agent One',
            type: 'assistant',
            status: 'active',
            provider: 'openai',
            model: 'gpt-4',
            systemPrompt: 'prompt',
            temperature: 0.2,
            maxTokens: 2048,
            autoReply: 0,
            llmCallCount: 7,
            createdAt,
            lastActive: createdAt,
            lastLLMCall: createdAt,
          };
        }
        return null;
      },
      onAll: (sql) => {
        if (sql.includes('FROM agent_memory')) {
          return [
            {
              role: 'assistant',
              content: 'Tool output',
              sender: 'agent-1',
              chatId: 'chat-1',
              messageId: 'msg-1',
              replyToMessageId: 'msg-0',
              toolCalls: JSON.stringify([{ id: 'call-1', type: 'function' }]),
              toolCallId: 'call-1',
              createdAt,
            },
          ];
        }
        return [];
      },
    });
    const ctx = createCtx(mock.db, true);

    const loaded = await loadAgent(ctx, 'world-1', 'agent-1');
    expect(loaded).not.toBeNull();
    expect(loaded?.autoReply).toBe(false);
    expect(loaded?.memory[0]).toMatchObject({
      chatId: 'chat-1',
      messageId: 'msg-1',
      replyToMessageId: 'msg-0',
      tool_call_id: 'call-1',
    });
    expect(loaded?.memory[0].tool_calls).toEqual([{ id: 'call-1', type: 'function' }]);
    expect(loaded?.memory[0].createdAt).toBeInstanceOf(Date);
  });

  it('filters system messages before persisting agent memory', async () => {
    const mock = createMockDb();
    const ctx = createCtx(mock.db, true);

    const memory: AgentMessage[] = [
      {
        role: 'system',
        content: 'do not persist',
        sender: 'system',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        role: 'user',
        content: 'persist me',
        sender: 'human',
        messageId: 'msg-1',
        chatId: 'chat-1',
        createdAt: new Date('2026-01-01T00:00:01.000Z'),
      },
      {
        role: 'assistant',
        content: 'persist me too',
        sender: 'agent-1',
        messageId: 'msg-2',
        chatId: 'chat-1',
        createdAt: new Date('2026-01-01T00:00:02.000Z'),
      },
    ];

    await saveAgentMemory(ctx, 'world-1', 'agent-1', memory);

    const insertCalls = mock.runCalls.filter((call) =>
      call.sql.includes('INSERT INTO agent_memory')
    );
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls.every((call) => !String(call.params[3]).includes('do not persist'))).toBe(
      true
    );
  });

  it('maps persisted memory rows to runtime AgentMessage fields', async () => {
    const mock = createMockDb({
      onAll: (sql, params) => {
        if (sql.includes('FROM agent_memory')) {
          expect(params).toEqual(['world-1', 'chat-1', 'chat-1']);
          return [
            {
              role: 'assistant',
              content: 'result',
              sender: 'agent-1',
              chatId: 'chat-1',
              messageId: 'msg-2',
              replyToMessageId: 'msg-1',
              toolCalls: JSON.stringify([{ id: 'tool-1', type: 'function' }]),
              toolCallId: 'tool-1',
              agentId: 'agent-1',
              createdAt: '2026-01-01T10:05:00.000Z',
            },
          ];
        }
        return [];
      },
    });
    const ctx = createCtx(mock.db, true);

    const memory = await getMemory(ctx, 'world-1', 'chat-1');
    expect(memory).toEqual([
      {
        role: 'assistant',
        content: 'result',
        sender: 'agent-1',
        chatId: 'chat-1',
        messageId: 'msg-2',
        replyToMessageId: 'msg-1',
        tool_calls: [{ id: 'tool-1', type: 'function' }],
        tool_call_id: 'tool-1',
        agentId: 'agent-1',
        createdAt: new Date('2026-01-01T10:05:00.000Z'),
      },
    ]);
  });

  it('returns compare-and-set success based on row changes for updateChatNameIfCurrent', async () => {
    const successMock = createMockDb({
      onRun: (sql) => (sql.includes('UPDATE world_chats') ? { changes: 1 } : { changes: 0 }),
    });
    const successCtx = createCtx(successMock.db, true);

    const updated = await updateChatNameIfCurrent(
      successCtx,
      'world-1',
      'chat-1',
      'Old',
      'New'
    );
    expect(updated).toBe(true);

    const failMock = createMockDb({
      onRun: (sql) => (sql.includes('UPDATE world_chats') ? { changes: 0 } : { changes: 0 }),
    });
    const failCtx = createCtx(failMock.db, true);

    const notUpdated = await updateChatNameIfCurrent(
      failCtx,
      'world-1',
      'chat-1',
      'Old',
      'New'
    );
    expect(notUpdated).toBe(false);
  });

  it('loads chat snapshots, updates chat metadata, and lists histories', async () => {
    const snapshotData = {
      world: { id: 'world-1', name: 'World', description: '', turnLimit: 5 },
      agents: [],
      messages: [],
      metadata: { capturedBy: 'test' },
    };
    const mock = createMockDb({
      onGet: (sql) => {
        if (sql.includes('FROM world_chats')) {
          return {
            id: 'chat-1',
            worldId: 'world-1',
            name: 'Chat 1',
            description: 'Desc',
            messageCount: 3,
            tags: '["a","b"]',
            createdAt: '2026-02-27T10:00:00.000Z',
            updatedAt: '2026-02-27T11:00:00.000Z',
          };
        }
        if (sql.includes('FROM chat_snapshots')) {
          return {
            snapshotData: JSON.stringify(snapshotData),
            capturedAt: '2026-02-27T11:10:00.000Z',
            version: '2.0',
          };
        }
        return null;
      },
      onAll: (sql) => {
        if (sql.includes('FROM world_chats')) {
          return [
            {
              id: 'chat-1',
              name: 'Chat 1',
              description: 'Desc',
              messageCount: 3,
              tags: '["a"]',
              createdAt: '2026-02-27T10:00:00.000Z',
              updatedAt: '2026-02-27T11:00:00.000Z',
            },
          ];
        }
        return [];
      },
    });
    const ctx = createCtx(mock.db, true);

    await saveChatData(ctx, 'world-1', {
      id: 'chat-1',
      name: 'Chat 1',
      description: 'Desc',
      messageCount: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: [],
    } as any);

    const loaded = await loadChatData(ctx, 'world-1', 'chat-1');
    expect(loaded?.tags).toEqual(['a', 'b']);
    expect(loaded?.chat?.metadata.version).toBe('2.0');
    expect(loaded?.chat?.metadata.capturedAt).toBeInstanceOf(Date);

    const noOpUpdate = await updateChatData(ctx, 'world-1', 'chat-1', {});
    expect(noOpUpdate?.id).toBe('chat-1');

    await updateChatData(ctx, 'world-1', 'chat-1', {
      name: 'Renamed',
      tags: ['x', 'y'],
      messageCount: 8,
    });
    expect(
      mock.runCalls.some(
        (call) =>
          call.sql.includes('UPDATE world_chats') &&
          call.params.includes('Renamed') &&
          call.params.includes(JSON.stringify(['x', 'y'])) &&
          call.params.includes(8)
      )
    ).toBe(true);

    const histories = await listChatHistories(ctx, 'world-1');
    expect(histories.length).toBeGreaterThan(0);
  });

  it('handles world chat snapshot save/load and restore transactions', async () => {
    const snapshot = {
      world: {
        name: 'Restored',
        description: 'd',
        turnLimit: 7,
        mainAgent: null,
        chatLLMProvider: null,
        chatLLMModel: null,
      },
      agents: [
        {
          id: 'agent-1',
          name: 'Agent',
          type: 'assistant',
          provider: 'openai',
          model: 'gpt-4',
          systemPrompt: 'prompt',
          temperature: 0.2,
          maxTokens: 100,
          autoReply: true,
          createdAt: new Date('2026-02-27T10:00:00.000Z'),
          lastActive: new Date('2026-02-27T10:00:00.000Z'),
          llmCallCount: 1,
          memory: [
            {
              role: 'user',
              content: 'hello',
              sender: 'human',
              messageId: 'msg-1',
              chatId: 'chat-1',
              createdAt: new Date('2026-02-27T10:00:00.000Z'),
            },
          ],
        },
      ],
      messages: [],
      metadata: { version: '2.0' },
    };

    const successMock = createMockDb({
      onGet: (sql) => {
        if (sql.includes('FROM world_chats')) {
          return {
            id: 'chat-1',
            name: 'Chat 1',
            description: 'Desc',
            messageCount: 1,
            tags: '[]',
            createdAt: '2026-02-27T10:00:00.000Z',
            updatedAt: '2026-02-27T10:30:00.000Z',
          };
        }
        if (sql.includes('FROM chat_snapshots')) {
          return {
            snapshotData: JSON.stringify(snapshot),
            capturedAt: '2026-02-27T10:31:00.000Z',
            version: '2.0',
          };
        }
        return null;
      },
    });
    const successCtx = createCtx(successMock.db, true);

    await saveWorldChat(successCtx, 'world-1', 'chat-1', snapshot as any);
    const compact = await loadWorldChat(successCtx, 'world-1', 'chat-1');
    expect(compact?.metadata.version).toBe('2.0');

    const full = await loadWorldChatFull(successCtx, 'world-1', 'chat-1');
    expect(full?.id).toBe('chat-1');
    expect(full?.world?.name).toBe('Restored');

    await expect(restoreFromWorldChat(successCtx, 'world-1', snapshot as any)).resolves.toBe(true);
    expect(successMock.runCalls.some((call) => call.sql === 'BEGIN TRANSACTION')).toBe(true);
    expect(successMock.runCalls.some((call) => call.sql === 'COMMIT')).toBe(true);

    const failMock = createMockDb({
      onRun: (sql) => {
        if (sql.includes('INSERT INTO agents')) return { error: new Error('insert fail') };
        return {};
      },
    });
    const failCtx = createCtx(failMock.db, true);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(restoreFromWorldChat(failCtx, 'world-1', snapshot as any)).resolves.toBe(false);
    consoleErrorSpy.mockRestore();
    expect(failMock.runCalls.some((call) => call.sql === 'ROLLBACK')).toBe(true);
  });

  it('archives/searches/exports memory and validates integrity/statistics', async () => {
    const mock = createMockDb({
      onRun: (sql) => {
        if (sql.includes('INSERT INTO memory_archives')) return { lastID: 42 };
        return { changes: 0 };
      },
      onGet: (sql) => {
        if (sql.includes('PRAGMA integrity_check')) return { integrity_check: 'ok' };
        if (sql.includes('SELECT id FROM worlds WHERE id = ?')) return { id: 'world-1' };
        if (sql.includes('SELECT id FROM agents WHERE id = ?')) return { id: 'agent-1' };
        if (sql.includes('FROM memory_archives WHERE id = ?')) {
          return {
            id: 42,
            agent_id: 'agent-1',
            world_id: 'world-1',
            session_name: 'session',
            created_at: '2026-02-27T10:00:00.000Z',
          };
        }
        if (sql.includes('COUNT(*) as totalArchives')) {
          return { totalArchives: 2, totalMessages: 7, averageSessionLength: 3.5 };
        }
        if (sql.includes('COUNT(*) as count FROM worlds')) return { count: 1 };
        if (sql.includes('COUNT(*) as count FROM agents')) return { count: 1 };
        if (sql.includes('COUNT(*) as count FROM agent_memory')) return { count: 2 };
        if (sql.includes('COUNT(*) as count FROM memory_archives')) return { count: 2 };
        if (sql.includes('COUNT(*) as count FROM archived_messages')) return { count: 4 };
        if (sql.includes('PRAGMA page_count')) return { page_count: 5 };
        return null;
      },
      onAll: (sql) => {
        if (sql.includes('PRAGMA foreign_key_check')) return [];
        if (sql.includes('FROM memory_archives')) {
          return [
            {
              id: 42,
              agentId: 'agent-1',
              worldId: 'world-1',
              sessionName: 'session',
              archiveReason: 'cleanup',
              messageCount: 2,
              startTime: '2026-02-27T09:00:00.000Z',
              endTime: '2026-02-27T10:00:00.000Z',
              participants: '["human","agent-1"]',
              tags: '["a"]',
              createdAt: '2026-02-27T10:00:00.000Z',
            },
          ];
        }
        if (sql.includes('FROM archived_messages')) {
          return [{ role: 'user', content: 'hello', sender: 'human', createdAt: '2026-02-27T09:00:00.000Z' }];
        }
        return [];
      },
    });
    const ctx = createCtx(mock.db, true);
    const memory: AgentMessage[] = [
      { role: 'user', content: 'hello', sender: 'human', createdAt: new Date('2026-02-27T09:00:00.000Z') },
      { role: 'assistant', content: 'hi', sender: 'agent-1', createdAt: new Date('2026-02-27T10:00:00.000Z') },
    ];

    await expect(archiveAgentMemory(ctx, 'world-1', 'agent-1', memory)).resolves.toBe(42);

    const search = await searchArchives(ctx, { worldId: 'world-1' });
    expect(search.totalCount).toBe(1);
    expect(search.archives[0].participants).toEqual(['human', 'agent-1']);

    await expect(getArchiveStatistics(ctx, 'world-1')).resolves.toEqual({
      totalArchives: 2,
      totalMessages: 7,
      averageSessionLength: 3.5,
      mostActiveAgent: '',
      archiveFrequency: {},
    });

    const exported = await exportArchive(ctx, 42, { format: 'json', includeMetadata: true, includeMessages: true });
    const parsed = JSON.parse(exported);
    expect(parsed.metadata.id).toBe(42);
    expect(parsed.messages).toHaveLength(1);

    await expect(validateIntegrity(ctx, 'world-1')).resolves.toBe(true);
    await expect(validateIntegrity(ctx, 'world-1', 'agent-1')).resolves.toBe(true);

    await expect(getDatabaseStats(ctx)).resolves.toEqual({
      worldCount: 1,
      agentCount: 1,
      activeMemoryCount: 2,
      archiveCount: 2,
      archivedMessageCount: 4,
      databaseSize: 20480,
    });
  });

  it('saves, lists, batches, and deletes agents with memory mapping', async () => {
    const listedAgentRows = [
      {
        id: 'agent-a',
        name: 'Agent A',
        type: 'assistant',
        status: 'active',
        provider: 'openai',
        model: 'gpt-4',
        systemPrompt: 'prompt',
        temperature: 0.1,
        maxTokens: 1000,
        autoReply: 1,
        llmCallCount: 2,
        createdAt: null,
        lastActive: null,
        lastLLMCall: null,
      },
      {
        id: 'agent-b',
        name: 'Agent B',
        type: 'assistant',
        status: 'inactive',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'prompt',
        temperature: 0.2,
        maxTokens: 2000,
        autoReply: 0,
        llmCallCount: 0,
        createdAt: '2026-02-27T10:00:00.000Z',
        lastActive: '2026-02-27T11:00:00.000Z',
        lastLLMCall: null,
      },
    ];

    const mock = createMockDb({
      onRun: (sql) => {
        if (sql.includes('DELETE FROM agents')) return { changes: 1 };
        return { changes: 0 };
      },
      onGet: (sql, params) => {
        if (sql.includes('FROM agents WHERE id = ? AND world_id = ?')) {
          if (params[0] === 'agent-a') {
            return {
              id: 'agent-a',
              name: 'Agent A',
              type: 'assistant',
              status: 'active',
              provider: 'openai',
              model: 'gpt-4',
              systemPrompt: 'prompt',
              temperature: 0.1,
              maxTokens: 1000,
              autoReply: 1,
              llmCallCount: 2,
              createdAt: '2026-02-27T10:00:00.000Z',
              lastActive: '2026-02-27T11:00:00.000Z',
              lastLLMCall: null,
            };
          }
          return null;
        }
        return null;
      },
      onAll: (sql, params) => {
        if (sql.includes('FROM agents WHERE world_id = ?')) {
          return listedAgentRows;
        }
        if (sql.includes('FROM agent_memory')) {
          if (params[0] === 'agent-a') {
            return [
              {
                role: 'assistant',
                content: 'a',
                sender: 'agent-a',
                chatId: 'chat-1',
                messageId: 'msg-a',
                replyToMessageId: 'msg-root',
                toolCalls: JSON.stringify([{ id: 'call-a' }]),
                toolCallId: 'call-a',
                createdAt: '2026-02-27T11:30:00.000Z',
              },
            ];
          }
          return [
            {
              role: 'user',
              content: 'b',
              sender: 'human',
              chatId: 'chat-1',
              messageId: 'msg-b',
              replyToMessageId: null,
              toolCalls: null,
              toolCallId: null,
              createdAt: null,
            },
          ];
        }
        return [];
      },
    });
    const ctx = createCtx(mock.db, true);

    await saveAgent(ctx, 'world-1', {
      id: 'agent-x',
      name: 'Agent X',
      type: 'assistant',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'prompt',
      temperature: 0.2,
      maxTokens: 500,
      autoReply: true,
      llmCallCount: 0,
      lastActive: new Date('2026-02-27T12:00:00.000Z'),
      memory: [
        {
          role: 'assistant',
          content: 'saved from saveAgent',
          sender: 'agent-x',
          chatId: 'chat-1',
          messageId: 'save-msg-1',
          createdAt: '2026-02-27T12:00:05.000Z' as any,
        },
      ],
    } as any);
    expect(
      mock.runCalls.some((call) => call.sql.includes('INSERT OR REPLACE INTO agents'))
    ).toBe(true);
    expect(
      mock.runCalls.some((call) => call.sql.includes('INSERT INTO agent_memory'))
    ).toBe(true);

    const listed = await listAgents(ctx, 'world-1');
    expect(listed).toHaveLength(2);
    expect(listed[0].memory[0].tool_calls).toEqual([{ id: 'call-a' }]);
    expect(listed[1].autoReply).toBe(false);
    expect(listed[1].memory[0].tool_calls).toBeUndefined();
    expect(listed[1].memory[0].createdAt).toBeInstanceOf(Date);

    await saveAgentsBatch(ctx, 'world-1', [
      {
        id: 'batch-1',
        name: 'Batch 1',
        type: 'assistant',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'prompt',
        temperature: 0.1,
        maxTokens: 1000,
        memory: [],
      },
      {
        id: 'batch-2',
        name: 'Batch 2',
        type: 'assistant',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'prompt',
        temperature: 0.1,
        maxTokens: 1000,
        memory: [],
      },
    ] as any);
    expect(
      mock.runCalls.filter((call) => call.sql.includes('INSERT OR REPLACE INTO agents')).length
    ).toBeGreaterThanOrEqual(3);

    const loadedBatch = await loadAgentsBatch(ctx, 'world-1', ['agent-a', 'missing']);
    expect(loadedBatch).toHaveLength(1);
    expect(loadedBatch[0].id).toBe('agent-a');

    await expect(deleteAgent(ctx, 'world-1', 'agent-a')).resolves.toBe(true);

    const failingDelete = createMockDb({
      onRun: (sql) => (sql.includes('DELETE FROM agents') ? { error: new Error('fail') } : {}),
    });
    await expect(deleteAgent(createCtx(failingDelete.db, true), 'world-1', 'agent-a')).resolves.toBe(
      false
    );
  });

  it('handles memory/chat deletion helpers, repair fallback, and close wrapper', async () => {
    const mock = createMockDb({
      onRun: (sql) => {
        if (sql.includes('DELETE FROM agent_memory WHERE world_id = ? AND chat_id = ?')) {
          return { changes: 3 };
        }
        if (sql.includes('DELETE FROM world_chats WHERE id = ? AND world_id = ?')) {
          return { changes: 1 };
        }
        return { changes: 0 };
      },
    });
    const ctx = createCtx(mock.db, true);

    await expect(deleteMemoryByChatId(ctx, 'world-1', 'chat-1')).resolves.toBe(3);
    await expect(deleteChatData(ctx, 'world-1', 'chat-1')).resolves.toBe(true);
    await expect(repairData(ctx, 'world-1')).resolves.toBe(false);
    await expect(close(ctx)).resolves.toBeUndefined();

    const unchangedDelete = createMockDb({
      onRun: (sql) =>
        sql.includes('DELETE FROM world_chats WHERE id = ? AND world_id = ?')
          ? { changes: 0 }
          : {},
    });
    await expect(deleteChatData(createCtx(unchangedDelete.db, true), 'world-1', 'chat-1')).resolves.toBe(
      false
    );
  });

  it('updates chat description branch and handles validateIntegrity lookup errors', async () => {
    const updateMock = createMockDb({
      onGet: (sql) => {
        if (sql.includes('FROM world_chats')) {
          return {
            id: 'chat-1',
            worldId: 'world-1',
            name: 'Chat 1',
            description: 'After update',
            messageCount: 1,
            tags: '[]',
            createdAt: '2026-02-27T10:00:00.000Z',
            updatedAt: '2026-02-27T11:00:00.000Z',
          };
        }
        return null;
      },
      onAll: () => [],
    });
    const updateCtx = createCtx(updateMock.db, true);
    await updateChatData(updateCtx, 'world-1', 'chat-1', { description: 'After update' });
    expect(
      updateMock.runCalls.some(
        (call) =>
          call.sql.includes('UPDATE world_chats') && call.params.includes('After update')
      )
    ).toBe(true);

    const errorDb: any = {
      run(_sql: string, cb?: (err: Error | null) => void) {
        cb?.(null);
      },
      get(
        sql: string,
        paramsOrCb?: any[] | ((err: Error | null, row?: any) => void),
        cbMaybe?: (err: Error | null, row?: any) => void
      ) {
        const cb = (typeof paramsOrCb === 'function' ? paramsOrCb : cbMaybe) as
          | ((err: Error | null, row?: any) => void)
          | undefined;
        if (sql.includes('PRAGMA integrity_check')) {
          cb?.(null, { integrity_check: 'ok' });
          return;
        }
        if (sql.includes('SELECT id FROM worlds WHERE id = ?')) {
          cb?.(new Error('lookup failed'));
          return;
        }
        cb?.(null, null);
      },
      all(
        _sql: string,
        paramsOrCb?: any[] | ((err: Error | null, rows?: any[]) => void),
        cbMaybe?: (err: Error | null, rows?: any[]) => void
      ) {
        const cb = (typeof paramsOrCb === 'function' ? paramsOrCb : cbMaybe) as
          | ((err: Error | null, rows?: any[]) => void)
          | undefined;
        cb?.(null, []);
      },
      close(cb: (err: Error | null) => void) {
        cb(null);
      },
    };
    const errorCtx = createCtx(errorDb, true);
    await expect(validateIntegrity(errorCtx, 'world-1')).resolves.toBe(false);
  });

  it('falls back to default migrations path when no candidate exists', async () => {
    runMigrationsMock.mockClear();
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const mock = createMockDb({ onAll: (sql) => (sql.includes('FROM worlds') ? [] : []) });
    const ctx = createCtx(mock.db, false);

    await listWorlds(ctx);
    expect(runMigrationsMock).toHaveBeenCalledTimes(1);
    expect(runMigrationsMock.mock.calls[0]?.[0]?.migrationsDir).toBe(
      path.join(process.cwd(), 'migrations')
    );
    existsSpy.mockRestore();
  });

  it('creates sqlite storage context from schema context wrapper', async () => {
    vi.resetModules();
    const fakeDb: any = {
      run: () => undefined,
      get: () => undefined,
      all: () => undefined,
      close: (cb: (err: Error | null) => void) => cb(null),
    };
    const createSchemaMock = vi.fn().mockResolvedValue({
      db: fakeDb,
      config: { database: ':memory:' },
      isInitialized: false,
    });

    vi.doMock('../../../core/storage/sqlite-schema.js', async () => {
      const actual = await vi.importActual('../../../core/storage/sqlite-schema.js');
      return {
        ...actual,
        createSQLiteSchemaContext: createSchemaMock,
      };
    });

    const sqliteStorageModule = await import('../../../core/storage/sqlite-storage.js');
    const ctx = await sqliteStorageModule.createSQLiteStorageContext({ database: ':memory:' } as any);

    expect(createSchemaMock).toHaveBeenCalledWith({ database: ':memory:' });
    expect(ctx.db).toBe(fakeDb);
    expect(ctx.isInitialized).toBe(false);

    vi.doUnmock('../../../core/storage/sqlite-schema.js');
  });
});
