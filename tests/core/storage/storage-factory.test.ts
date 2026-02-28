/**
 * Storage Factory Runtime Selection Tests
 *
 * Purpose:
 * - Validate storage factory selection/caching for memory and sqlite runtime paths.
 *
 * Key features covered:
 * - Explicit memory backend creation
 * - Environment-driven backend selection
 * - Environment cache behavior for repeated calls
 *
 * Implementation notes:
 * - Uses in-memory backends only for behavioral assertions
 * - Avoids filesystem and real sqlite usage in unit tests
 *
 * Recent changes:
 * - 2026-02-27: Added wrapper fallback/error tests and mocked sqlite branch delegation coverage.
 * - 2026-02-27: Added targeted storage-factory coverage after removing stale legacy suites.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';

const sqliteStorageMocks = vi.hoisted(() => ({
  createSQLiteStorageContext: vi.fn(async () => ({ db: { label: 'mock-db' } })),
  saveWorld: vi.fn(async () => undefined),
  loadWorld: vi.fn(async () => null),
  deleteWorld: vi.fn(async () => true),
  listWorlds: vi.fn(async () => []),
  saveAgent: vi.fn(async () => undefined),
  loadAgent: vi.fn(async () => null),
  deleteAgent: vi.fn(async () => true),
  listAgents: vi.fn(async () => []),
  saveAgentsBatch: vi.fn(async () => undefined),
  loadAgentsBatch: vi.fn(async () => []),
  validateIntegrity: vi.fn(async () => true),
  repairData: vi.fn(async () => true),
  close: vi.fn(async () => undefined),
  getDatabaseStats: vi.fn(async () => ({ ok: true })),
  initializeWithDefaults: vi.fn(async () => undefined),
  saveChatData: vi.fn(async () => undefined),
  loadChatData: vi.fn(async () => null),
  deleteChatData: vi.fn(async () => true),
  listChatHistories: vi.fn(async () => []),
  updateChatData: vi.fn(async () => null),
  updateChatNameIfCurrent: vi.fn(async () => false),
  saveWorldChat: vi.fn(async () => undefined),
  loadWorldChat: vi.fn(async () => null),
  loadWorldChatFull: vi.fn(async () => null),
  restoreFromWorldChat: vi.fn(async () => true),
  archiveAgentMemory: vi.fn(async () => undefined),
  deleteMemoryByChatId: vi.fn(async () => 0),
  getMemory: vi.fn(async () => []),
  saveAgentMemory: vi.fn(async () => undefined),
}));

const eventStorageMocks = vi.hoisted(() => ({
  createMemoryEventStorage: vi.fn(() => ({ backend: 'memory-events' })),
  createFileEventStorage: vi.fn(() => ({ backend: 'file-events' })),
  createSQLiteEventStorage: vi.fn(async () => ({ backend: 'sqlite-events' })),
}));

const worldStorageMocks = vi.hoisted(() => ({
  saveWorld: vi.fn(async () => undefined),
  loadWorld: vi.fn(async () => null),
  deleteWorld: vi.fn(async () => true),
  listWorlds: vi.fn(async () => []),
  getMemory: vi.fn(async () => []),
  saveChatData: vi.fn(async () => undefined),
  loadChatData: vi.fn(async () => null),
  deleteChatData: vi.fn(async () => true),
  listChatHistories: vi.fn(async () => []),
  updateChatData: vi.fn(async () => null),
  updateChatNameIfCurrent: vi.fn(async () => false),
  saveWorldChat: vi.fn(async () => undefined),
  loadWorldChat: vi.fn(async () => null),
  loadWorldChatFull: vi.fn(async () => null),
  worldExists: vi.fn(async () => true),
}));

const agentStorageMocks = vi.hoisted(() => ({
  saveAgent: vi.fn(async () => undefined),
  loadAgent: vi.fn(async () => null),
  deleteAgent: vi.fn(async () => true),
  listAgents: vi.fn(async () => []),
  validateAgentIntegrity: vi.fn(async () => ({ isValid: true })),
  repairAgentData: vi.fn(async () => true),
  saveAgentMemory: vi.fn(async () => undefined),
  deleteMemoryByChatId: vi.fn(async () => 0),
}));

vi.mock('../../../core/storage/migration-runner.js', () => ({
  runMigrations: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../core/storage/sqlite-storage.js', () => sqliteStorageMocks);
vi.mock('../../../core/storage/eventStorage/index.js', () => eventStorageMocks);
vi.mock('../../../core/storage/world-storage.js', () => worldStorageMocks);
vi.mock('../../../core/storage/agent-storage.js', () => agentStorageMocks);

import {
  createStorage,
  createStorageWrappers,
  createStorageFromEnv,
  createStorageWithWrappers,
  getDefaultRootPath,
} from '../../../core/storage/storage-factory.js';

function uniqueRoot(prefix: string): string {
  return `/tmp/agent-world-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

describe('storage-factory runtime selection', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    sqliteStorageMocks.createSQLiteStorageContext.mockResolvedValue({ db: { label: 'mock-db' } });
    sqliteStorageMocks.initializeWithDefaults.mockResolvedValue(undefined);
    sqliteStorageMocks.loadAgent.mockResolvedValue(null);
    sqliteStorageMocks.loadWorld.mockResolvedValue(null);
    worldStorageMocks.loadWorld.mockResolvedValue(null);
    worldStorageMocks.listWorlds.mockResolvedValue([]);
    worldStorageMocks.loadChatData.mockResolvedValue(null);
    worldStorageMocks.listChatHistories.mockResolvedValue([]);
    worldStorageMocks.loadWorldChat.mockResolvedValue(null);
    worldStorageMocks.loadWorldChatFull.mockResolvedValue(null);
    worldStorageMocks.worldExists.mockResolvedValue(true);
    worldStorageMocks.getMemory.mockResolvedValue([]);

    agentStorageMocks.loadAgent.mockResolvedValue(null);
    agentStorageMocks.listAgents.mockResolvedValue([]);
    agentStorageMocks.validateAgentIntegrity.mockResolvedValue({ isValid: true });
    agentStorageMocks.repairAgentData.mockResolvedValue(true);
    agentStorageMocks.deleteMemoryByChatId.mockResolvedValue(0);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('creates a memory storage backend with event storage attached', async () => {
    const storage = await createStorage({
      type: 'memory',
      rootPath: uniqueRoot('memory'),
    });

    expect(typeof storage.saveWorld).toBe('function');
    expect(typeof storage.loadWorld).toBe('function');
    expect((storage as any).eventStorage).toBeDefined();
  });

  it('caches storage instances for identical config keys', async () => {
    const rootPath = uniqueRoot('cache');

    const first = await createStorage({ type: 'memory', rootPath });
    const second = await createStorage({ type: 'memory', rootPath });

    expect(second).toBe(first);
  });

  it('uses memory backend through environment selection and reuses env cache', async () => {
    process.env.AGENT_WORLD_STORAGE_TYPE = 'memory';
    process.env.AGENT_WORLD_DATA_PATH = uniqueRoot('env-memory');

    const first = await createStorageFromEnv();
    const second = await createStorageFromEnv();

    expect(second).toBe(first);
    expect((first as any).eventStorage).toBeDefined();
  });

  it('wraps environment storage with wrapper surface in createStorageWithWrappers', async () => {
    process.env.AGENT_WORLD_STORAGE_TYPE = 'memory';
    process.env.AGENT_WORLD_DATA_PATH = uniqueRoot('wrappers');

    const wrapped = await createStorageWithWrappers();

    expect(typeof wrapped.worldExists).toBe('function');
    expect(typeof wrapped.agentExists).toBe('function');
    expect(await wrapped.listWorlds()).toEqual([]);
  });

  it('provides safe no-op wrapper behavior when storage instance is null', async () => {
    const wrapped = createStorageWrappers(null);

    expect(await wrapped.loadWorld('world-1')).toBeNull();
    expect(await wrapped.worldExists('world-1')).toBe(false);
    expect(await wrapped.listWorlds()).toEqual([]);
    expect(await wrapped.listChats('world-1')).toEqual([]);
    expect(await wrapped.updateChatNameIfCurrent('world-1', 'chat-1', 'Old', 'New')).toBe(false);
  });

  it('uses wrapper fallback compare-and-set logic when backend lacks updateChatNameIfCurrent', async () => {
    const storage = {
      loadChatData: vi.fn().mockResolvedValue({ id: 'chat-1', name: 'Old' }),
      updateChatData: vi.fn().mockResolvedValue({ id: 'chat-1', name: 'New' }),
    } as any;

    const wrapped = createStorageWrappers(storage);
    const updated = await wrapped.updateChatNameIfCurrent('world-1', 'chat-1', 'Old', 'New');
    expect(updated).toBe(true);
    expect(storage.updateChatData).toHaveBeenCalledWith('world-1', 'chat-1', { name: 'New' });
  });

  it('falls back to load-modify-save for saveAgentMemory when backend method is missing', async () => {
    const existingAgent = { id: 'agent-1', name: 'Agent', memory: [] };
    const storage = {
      loadAgent: vi.fn().mockResolvedValue(existingAgent),
      saveAgent: vi.fn().mockResolvedValue(undefined),
    } as any;

    const wrapped = createStorageWrappers(storage);
    await wrapped.saveAgentMemory('world-1', 'agent-1', [
      { role: 'user', content: 'hello', sender: 'human' } as any,
    ]);

    expect(storage.loadAgent).toHaveBeenCalledWith('world-1', 'agent-1');
    expect(storage.saveAgent).toHaveBeenCalledWith('world-1', {
      ...existingAgent,
      memory: [{ role: 'user', content: 'hello', sender: 'human' }],
    });
  });

  it('normalizes wrapped chat and world-chat storage errors', async () => {
    const storage = {
      saveChatData: vi.fn().mockRejectedValue(new Error('save failed')),
      loadChatData: vi.fn().mockRejectedValue(new Error('load failed')),
      deleteChatData: vi.fn().mockRejectedValue(new Error('delete failed')),
      listChats: vi.fn().mockRejectedValue(new Error('list failed')),
      updateChatData: vi.fn().mockRejectedValue(new Error('update failed')),
      saveWorldChat: vi.fn().mockRejectedValue(new Error('save world chat failed')),
      loadWorldChat: vi.fn().mockRejectedValue(new Error('load world chat failed')),
      loadWorldChatFull: vi.fn().mockRejectedValue(new Error('load world chat full failed')),
      restoreFromWorldChat: vi.fn().mockRejectedValue(new Error('restore world chat failed')),
    } as any;
    const wrapped = createStorageWrappers(storage);

    await expect(wrapped.saveChatData('world-1', { id: 'chat-1' } as any)).rejects.toThrow(
      'Failed to save chat history: save failed',
    );
    await expect(wrapped.loadChatData('world-1', 'chat-1')).rejects.toThrow(
      'Failed to load chat history: load failed',
    );
    await expect(wrapped.deleteChatData('world-1', 'chat-1')).rejects.toThrow(
      'Failed to delete chat history: delete failed',
    );
    await expect(wrapped.listChats('world-1')).rejects.toThrow('Failed to list chats: list failed');
    await expect(wrapped.updateChatData('world-1', 'chat-1', { name: 'Renamed' })).rejects.toThrow(
      'Failed to update chat history: update failed',
    );
    await expect(wrapped.saveWorldChat('world-1', 'chat-1', { id: 'chat-1' } as any)).rejects.toThrow(
      'Failed to save world chat: save world chat failed',
    );
    await expect(wrapped.loadWorldChat('world-1', 'chat-1')).rejects.toThrow(
      'Failed to load world chat: load world chat failed',
    );
    await expect(wrapped.loadWorldChatFull('world-1', 'chat-1')).rejects.toThrow(
      'Failed to load full world chat: load world chat full failed',
    );
    await expect(wrapped.restoreFromWorldChat('world-1', { id: 'chat-1' } as any)).rejects.toThrow(
      'Failed to restore from world chat: restore world chat failed',
    );
  });

  it('uses wrapper fallbacks for batch and integrity operations when backend helpers are absent', async () => {
    const storage = {
      saveAgent: vi.fn().mockResolvedValue(undefined),
      loadAgent: vi.fn().mockImplementation(async (_worldId: string, agentId: string) => {
        if (agentId === 'agent-1') return { id: agentId };
        return null;
      }),
      loadWorld: vi.fn().mockResolvedValue({ id: 'world-1' }),
    } as any;
    const wrapped = createStorageWrappers(storage);

    await wrapped.saveAgentsBatch('world-1', [{ id: 'agent-1' } as any, { id: 'agent-2' } as any]);
    expect(storage.saveAgent).toHaveBeenCalledTimes(2);

    const loaded = await wrapped.loadAgentsBatch('world-1', ['agent-1', 'agent-2']);
    expect(loaded).toEqual([{ id: 'agent-1' }]);

    expect(await wrapped.validateIntegrity('world-1')).toBe(true);
    expect(await wrapped.validateIntegrity('world-1', 'agent-1')).toBe(true);
    expect(await wrapped.repairData('world-1', 'agent-1')).toBe(true);

    storage.loadWorld.mockRejectedValueOnce(new Error('world unavailable'));
    storage.loadAgent.mockRejectedValueOnce(new Error('agent unavailable'));
    expect(await wrapped.validateIntegrity('world-1')).toBe(false);
    expect(await wrapped.repairData('world-1', 'agent-1')).toBe(false);
  });

  it('delegates optional memory/archive helpers and protects existence checks on backend errors', async () => {
    const storage = {
      getMemory: vi.fn().mockResolvedValue([{ id: 'msg-1' }]),
      archiveAgentMemory: vi.fn().mockResolvedValue(undefined),
      deleteMemoryByChatId: vi.fn().mockResolvedValue(3),
      loadWorld: vi.fn().mockRejectedValue(new Error('world load failed')),
      loadAgent: vi.fn().mockRejectedValue(new Error('agent load failed')),
    } as any;
    const wrapped = createStorageWrappers(storage);

    expect(await wrapped.getMemory('world-1', 'chat-1')).toEqual([{ id: 'msg-1' }]);
    await wrapped.archiveMemory('world-1', 'agent-1', [{ id: 'msg-1' } as any]);
    expect(storage.archiveAgentMemory).toHaveBeenCalledWith('world-1', 'agent-1', [{ id: 'msg-1' }]);
    expect(await wrapped.deleteMemoryByChatId('world-1', 'chat-1')).toBe(3);
    expect(await wrapped.worldExists('world-1')).toBe(false);
    expect(await wrapped.agentExists('world-1', 'agent-1')).toBe(false);
  });

  it('creates sqlite storage with mocked sqlite modules and delegates method calls', async () => {
    const rootPath = uniqueRoot('sqlite-branch');
    const ctx = { db: { label: 'sqlite-db' } };
    sqliteStorageMocks.createSQLiteStorageContext.mockResolvedValue(ctx);
    sqliteStorageMocks.loadWorld.mockResolvedValue({ id: 'world-1' });
    sqliteStorageMocks.getMemory.mockResolvedValue([{ id: 'memory-1' }]);
    sqliteStorageMocks.getDatabaseStats.mockResolvedValue({ pageCount: 5 });
    sqliteStorageMocks.loadAgent
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ id: 'agent-1' });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = await createStorage({
      type: 'sqlite',
      rootPath,
      sqlite: {
        database: `${rootPath}/custom.db`,
        enableWAL: true,
        busyTimeout: 1234,
        cacheSize: -123,
        enableForeignKeys: true,
      },
    });

    expect(sqliteStorageMocks.createSQLiteStorageContext).toHaveBeenCalledWith({
      database: `${rootPath}/custom.db`,
      enableWAL: true,
      busyTimeout: 1234,
      cacheSize: -123,
      enableForeignKeys: true,
    });
    expect(eventStorageMocks.createSQLiteEventStorage).toHaveBeenCalledWith(ctx.db);
    expect((storage as any).eventStorage).toEqual({ backend: 'sqlite-events' });

    await storage.saveWorld({ id: 'world-1' } as any);
    expect(sqliteStorageMocks.saveWorld).toHaveBeenCalledWith(ctx, { id: 'world-1' });

    expect(await storage.worldExists('world-1')).toBe(true);
    expect(await storage.getMemory('world-1', 'chat-1')).toEqual([{ id: 'memory-1' }]);
    expect(await storage.loadAgentWithRetry('world-1', 'agent-1', { retries: 2, delay: 0 })).toEqual({
      id: 'agent-1',
    });
    expect(warnSpy).toHaveBeenCalled();
    expect(await (storage as any).getDatabaseStats()).toEqual({ pageCount: 5 });
    await (storage as any).close();
    expect(sqliteStorageMocks.close).toHaveBeenCalledWith(ctx);
  });

  it('continues sqlite initialization when default bootstrap throws warning', async () => {
    const rootPath = uniqueRoot('sqlite-init-warning');
    sqliteStorageMocks.initializeWithDefaults.mockRejectedValueOnce(new Error('already initialized'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await createStorage({ type: 'sqlite', rootPath });

    expect(warnSpy).toHaveBeenCalledWith(
      '[storage-factory] Warning during default initialization:',
      'already initialized',
    );
  });

  it('creates file storage and delegates world/chat operations through adapter modules', async () => {
    const rootPath = uniqueRoot('file-adapter');
    worldStorageMocks.loadWorld.mockResolvedValue({ id: 'world-1' });
    worldStorageMocks.listWorlds.mockResolvedValue([{ id: 'world-1' }]);
    worldStorageMocks.getMemory.mockResolvedValue([{ id: 'msg-1' }]);
    worldStorageMocks.loadChatData.mockResolvedValue({ id: 'chat-1', name: 'Old' });
    worldStorageMocks.listChatHistories.mockResolvedValue([{ id: 'chat-1' }]);
    worldStorageMocks.updateChatData.mockResolvedValue({ id: 'chat-1', name: 'New' });
    worldStorageMocks.updateChatNameIfCurrent.mockResolvedValue(true);
    worldStorageMocks.loadWorldChat.mockResolvedValue({ id: 'chat-1' });
    worldStorageMocks.loadWorldChatFull.mockResolvedValue({ id: 'chat-1', meta: true });

    const storage = await createStorage({ type: 'file', rootPath });
    expect((storage as any).eventStorage).toEqual({ backend: 'file-events' });

    await storage.saveWorld({ id: 'world-1' } as any);
    expect(worldStorageMocks.saveWorld).toHaveBeenCalledWith(rootPath, { id: 'world-1' });
    expect(await storage.loadWorld('world-1')).toEqual({ id: 'world-1' });
    expect(await storage.deleteWorld('world-1')).toBe(true);
    expect(await storage.listWorlds()).toEqual([{ id: 'world-1' }]);
    expect(await storage.getMemory('world-1', 'chat-1')).toEqual([{ id: 'msg-1' }]);

    await storage.saveChatData('world-1', { id: 'chat-1' } as any);
    expect(await storage.loadChatData('world-1', 'chat-1')).toEqual({ id: 'chat-1', name: 'Old' });
    expect(await storage.deleteChatData('world-1', 'chat-1')).toBe(true);
    expect(await storage.listChats('world-1')).toEqual([{ id: 'chat-1' }]);
    expect(await storage.updateChatData('world-1', 'chat-1', { name: 'New' })).toEqual({
      id: 'chat-1',
      name: 'New',
    });
    expect(await storage.updateChatNameIfCurrent('world-1', 'chat-1', 'Old', 'New')).toBe(true);
    expect(worldStorageMocks.updateChatNameIfCurrent).toHaveBeenCalledWith(
      rootPath,
      'world-1',
      'chat-1',
      'Old',
      'New',
    );

    await storage.saveWorldChat('world-1', 'chat-1', { id: 'chat-1' } as any);
    expect(await storage.loadWorldChat('world-1', 'chat-1')).toEqual({ id: 'chat-1' });
    expect(await storage.loadWorldChatFull('world-1', 'chat-1')).toEqual({ id: 'chat-1', meta: true });
    expect(await storage.worldExists('world-1')).toBe(true);
  });

  it('delegates file storage agent operations and covers retry/fallback branches', async () => {
    const rootPath = uniqueRoot('file-agents');
    agentStorageMocks.loadAgent
      .mockRejectedValueOnce(new Error('temporary read failure'))
      .mockResolvedValueOnce({
        id: 'agent-1',
        memory: [{ role: 'user', content: 'hello', sender: 'human', agentId: 'agent-1', messageId: 'msg-1' }],
      });
    agentStorageMocks.listAgents.mockResolvedValue([{ id: 'agent-1' }]);
    agentStorageMocks.deleteMemoryByChatId.mockResolvedValue(2);

    const storage = await createStorage({ type: 'file', rootPath });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await storage.saveAgent('world-1', {
      id: 'agent-1',
      memory: [{ role: 'user', content: 'legacy no message id', sender: 'human' }],
    } as any);
    expect(agentStorageMocks.saveAgent).toHaveBeenCalledTimes(1);

    expect(await storage.loadAgentWithRetry('world-1', 'agent-1', { retries: 2, delay: 0 })).toEqual({
      id: 'agent-1',
      memory: [{ role: 'user', content: 'hello', sender: 'human', agentId: 'agent-1', messageId: 'msg-1' }],
    });
    expect(await storage.deleteAgent('world-1', 'agent-1')).toBe(true);
    expect(await storage.listAgents('world-1')).toEqual([{ id: 'agent-1' }]);

    await storage.saveAgentsBatch('world-1', [{ id: 'a1' } as any, { id: 'a2' } as any]);
    expect(agentStorageMocks.saveAgent).toHaveBeenCalledTimes(3);
    agentStorageMocks.loadAgent.mockResolvedValueOnce({ id: 'a1' }).mockResolvedValueOnce(null);
    expect(await storage.loadAgentsBatch('world-1', ['a1', 'a2'])).toEqual([{ id: 'a1' }]);

    expect(await storage.validateIntegrity('world-1')).toBe(true);
    expect(await storage.validateIntegrity('world-1', 'agent-1')).toBe(true);
    expect(await storage.repairData('world-1', 'agent-1')).toBe(true);

    expect(await storage.deleteMemoryByChatId('world-1', 'chat-1')).toBe(2);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('uses file adapter fallbacks when optional helpers are missing', async () => {
    const rootPath = uniqueRoot('file-fallbacks');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const originalUpdateChatNameIfCurrent = worldStorageMocks.updateChatNameIfCurrent;
    const originalSaveAgentMemory = agentStorageMocks.saveAgentMemory;
    const originalDeleteMemoryByChatId = agentStorageMocks.deleteMemoryByChatId;

    (worldStorageMocks as any).updateChatNameIfCurrent = undefined;
    worldStorageMocks.loadChatData.mockResolvedValue({ id: 'chat-1', name: 'Old' });
    worldStorageMocks.updateChatData.mockResolvedValue({ id: 'chat-1', name: 'New' });
    (agentStorageMocks as any).saveAgentMemory = undefined;
    (agentStorageMocks as any).deleteMemoryByChatId = undefined;
    agentStorageMocks.loadAgent.mockResolvedValue({ id: 'agent-1', memory: [] });

    try {
      const storage = await createStorage({ type: 'file', rootPath });

      expect(await storage.updateChatNameIfCurrent('world-1', 'chat-1', 'Old', 'New')).toBe(true);
      await storage.saveAgentMemory('world-1', 'agent-1', [{ role: 'user', content: 'x', sender: 'human' } as any]);
      await storage.archiveMemory('world-1', 'agent-1', []);
      expect(await storage.restoreFromWorldChat('world-1', { id: 'chat-1' } as any)).toBe(false);
      expect(await storage.deleteMemoryByChatId('world-1', 'chat-1')).toBe(0);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      (worldStorageMocks as any).updateChatNameIfCurrent = originalUpdateChatNameIfCurrent;
      (agentStorageMocks as any).saveAgentMemory = originalSaveAgentMemory;
      (agentStorageMocks as any).deleteMemoryByChatId = originalDeleteMemoryByChatId;
    }
  });

  it('resolves default root path correctly for absolute, relative, and fallback env states', () => {
    process.env.AGENT_WORLD_DATA_PATH = '/tmp/absolute-root';
    expect(getDefaultRootPath()).toBe('/tmp/absolute-root');

    process.env.AGENT_WORLD_DATA_PATH = 'relative-root';
    expect(getDefaultRootPath()).toBe('/relative-root');

    delete process.env.AGENT_WORLD_DATA_PATH;
    delete process.env.HOME;
    delete process.env.USERPROFILE;
    expect(getDefaultRootPath()).toBe('./agent-world');

    process.env.HOME = '/home/test-user';
    expect(getDefaultRootPath()).toBe('/home/test-user/agent-world');
  });

  it('creates storage root directory for non-memory env storage when path does not exist', async () => {
    process.env.AGENT_WORLD_STORAGE_TYPE = 'file';
    process.env.AGENT_WORLD_DATA_PATH = uniqueRoot('file-storage');

    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);

    await createStorageFromEnv();
    expect(existsSpy).toHaveBeenCalledWith(process.env.AGENT_WORLD_DATA_PATH);
    expect(mkdirSpy).toHaveBeenCalledWith(process.env.AGENT_WORLD_DATA_PATH, { recursive: true });
  });
});
