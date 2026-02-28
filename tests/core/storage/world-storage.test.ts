/**
 * World Storage Behavioral Tests
 *
 * Purpose:
 * - Validate file-based world/chat persistence logic via in-memory mocked filesystem behavior.
 *
 * Key features:
 * - World save/load/list/delete flows with MCP config serialization handling.
 * - Chat CRUD and compare-and-set title updates.
 * - Cascade behavior for chat deletion into agent-memory cleanup.
 * - Aggregated getMemory behavior across agents with chat filtering.
 *
 * Notes:
 * - Uses mocked fs and mocked agent-storage helpers only (no real filesystem/database access).
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';

const { listAgentsMock, loadAgentMock, deleteMemoryByChatIdMock } = vi.hoisted(() => ({
  listAgentsMock: vi.fn(),
  loadAgentMock: vi.fn(),
  deleteMemoryByChatIdMock: vi.fn(),
}));

vi.mock('../../../core/storage/agent-storage.js', () => ({
  listAgents: listAgentsMock,
  loadAgent: loadAgentMock,
  deleteMemoryByChatId: deleteMemoryByChatIdMock,
}));

type FsState = {
  dirs: Set<string>;
  files: Map<string, string>;
};

function parentDir(filePath: string): string {
  const idx = filePath.lastIndexOf('/');
  if (idx <= 0) return '/';
  return filePath.slice(0, idx);
}

function addDirRecursive(dirs: Set<string>, dirPath: string): void {
  const isAbs = dirPath.startsWith('/');
  const parts = dirPath.split('/').filter(Boolean);
  if (isAbs) {
    dirs.add('/');
  }
  let acc = isAbs ? '' : '';
  for (const part of parts) {
    acc = `${acc}/${part}`;
    dirs.add(acc);
  }
  if (!parts.length && isAbs) {
    dirs.add('/');
  }
}

function setupInMemoryFs(initialDirs: string[] = ['/data']): FsState {
  const state: FsState = {
    dirs: new Set<string>(),
    files: new Map<string, string>(),
  };

  for (const dir of initialDirs) {
    addDirRecursive(state.dirs, dir);
  }

  const accessMock = vi.mocked(fs.promises.access as any);
  const mkdirMock = vi.mocked(fs.promises.mkdir as any);
  const writeFileMock = vi.mocked(fs.promises.writeFile as any);
  const readFileMock = vi.mocked(fs.promises.readFile as any);
  const unlinkMock = vi.mocked(fs.promises.unlink as any);
  const rmMock = vi.mocked(fs.promises.rm as any);
  const readdirMock = vi.mocked(fs.promises.readdir as any);

  accessMock.mockImplementation(async (targetPath: string) => {
    if (state.dirs.has(targetPath) || state.files.has(targetPath)) {
      return;
    }
    throw new Error(`ENOENT: ${targetPath}`);
  });

  mkdirMock.mockImplementation(async (targetPath: string) => {
    addDirRecursive(state.dirs, targetPath);
  });

  writeFileMock.mockImplementation(async (targetPath: string, data: string) => {
    addDirRecursive(state.dirs, parentDir(targetPath));
    state.files.set(targetPath, String(data));
  });

  readFileMock.mockImplementation(async (targetPath: string) => {
    if (!state.files.has(targetPath)) {
      throw new Error(`ENOENT: ${targetPath}`);
    }
    return state.files.get(targetPath)!;
  });

  unlinkMock.mockImplementation(async (targetPath: string) => {
    if (!state.files.has(targetPath)) {
      throw new Error(`ENOENT: ${targetPath}`);
    }
    state.files.delete(targetPath);
  });

  rmMock.mockImplementation(async (targetPath: string) => {
    const prefix = targetPath.endsWith('/') ? targetPath : `${targetPath}/`;
    for (const filePath of Array.from(state.files.keys())) {
      if (filePath === targetPath || filePath.startsWith(prefix)) {
        state.files.delete(filePath);
      }
    }
    for (const dirPath of Array.from(state.dirs.values())) {
      if (dirPath === targetPath || dirPath.startsWith(prefix)) {
        state.dirs.delete(dirPath);
      }
    }
  });

  readdirMock.mockImplementation(async (targetPath: string, options?: any) => {
    if (!state.dirs.has(targetPath)) {
      throw new Error(`ENOENT: ${targetPath}`);
    }

    const prefix = targetPath.endsWith('/') ? targetPath : `${targetPath}/`;
    const kindByName = new Map<string, 'file' | 'dir'>();

    for (const dirPath of state.dirs) {
      if (!dirPath.startsWith(prefix) || dirPath === targetPath) continue;
      const relative = dirPath.slice(prefix.length);
      if (!relative || relative.includes('/')) continue;
      kindByName.set(relative, 'dir');
    }

    for (const filePath of state.files.keys()) {
      if (!filePath.startsWith(prefix)) continue;
      const relative = filePath.slice(prefix.length);
      if (!relative || relative.includes('/')) continue;
      if (!kindByName.has(relative)) {
        kindByName.set(relative, 'file');
      }
    }

    const names = Array.from(kindByName.keys()).sort();
    if (options?.withFileTypes) {
      return names.map((name) => ({
        name,
        isDirectory: () => kindByName.get(name) === 'dir',
        isFile: () => kindByName.get(name) === 'file',
      }));
    }

    return names;
  });

  return state;
}

describe('world-storage behavior', () => {
  let worldStorage: typeof import('../../../core/storage/world-storage.js');
  let fsState: FsState;

  beforeAll(async () => {
    worldStorage = await vi.importActual('../../../core/storage/world-storage.js');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    listAgentsMock.mockResolvedValue([]);
    loadAgentMock.mockResolvedValue(null);
    deleteMemoryByChatIdMock.mockResolvedValue(0);
    fsState = setupInMemoryFs(['/data']);
  });

  it('saves world config without runtime fields and persists valid mcpConfig as JSON', async () => {
    await worldStorage.saveWorld('/data', {
      id: 'My World',
      name: 'My World',
      description: 'desc',
      turnLimit: 5,
      mcpConfig: '{"servers":{"demo":{"command":"node"}}}',
      eventEmitter: {} as any,
      agents: new Map(),
      chats: new Map(),
      eventStorage: {} as any,
      _eventPersistenceCleanup: () => undefined,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      lastUpdated: new Date('2026-01-01T00:00:00.000Z'),
    } as any);

    const worldDir = worldStorage.getWorldDir('/data', 'My World');
    expect(worldDir).toBe('/data/my-world');

    const configPath = '/data/my-world/config.json';
    const mcpPath = '/data/my-world/mcp.json';
    expect(fsState.files.has(configPath)).toBe(true);
    expect(fsState.files.has(mcpPath)).toBe(true);

    const savedConfig = JSON.parse(fsState.files.get(configPath)!);
    expect(savedConfig).toMatchObject({
      id: 'My World',
      name: 'My World',
      description: 'desc',
      turnLimit: 5,
    });
    expect(savedConfig).not.toHaveProperty('mcpConfig');
    expect(savedConfig).not.toHaveProperty('eventEmitter');
    expect(savedConfig).not.toHaveProperty('agents');
    expect(savedConfig).not.toHaveProperty('chats');
    expect(savedConfig).not.toHaveProperty('eventStorage');
    expect(savedConfig).not.toHaveProperty('_eventPersistenceCleanup');

    expect(JSON.parse(fsState.files.get(mcpPath)!)).toEqual({
      servers: { demo: { command: 'node' } },
    });
  });

  it('handles invalid mcpConfig payloads and removes stale mcp.json when mcpConfig is null', async () => {
    await worldStorage.saveWorld('/data', {
      id: 'world-1',
      name: 'World One',
      mcpConfig: 'not-json',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      lastUpdated: new Date('2026-01-01T00:00:00.000Z'),
    } as any);

    const mcpPath = '/data/world-1/mcp.json';
    expect(JSON.parse(fsState.files.get(mcpPath)!)).toEqual({ config: 'not-json' });

    await worldStorage.saveWorld('/data', {
      id: 'world-1',
      name: 'World One',
      mcpConfig: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      lastUpdated: new Date('2026-01-01T00:00:00.000Z'),
    } as any);

    expect(fsState.files.has(mcpPath)).toBe(false);
  });

  it('loads world with reconstructed dates and backward-compatible mcpConfig handling', async () => {
    fsState.files.set(
      '/data/world-1/config.json',
      JSON.stringify({
        id: 'world-1',
        name: 'World One',
        createdAt: '2026-01-01T10:00:00.000Z',
        lastUpdated: '2026-01-02T10:00:00.000Z',
      })
    );
    fsState.files.set('/data/world-1/mcp.json', JSON.stringify({ servers: { demo: { command: 'node' } } }));

    const loaded = await worldStorage.loadWorld('/data', 'world-1');
    expect(loaded).not.toBeNull();
    expect(loaded?.createdAt).toBeInstanceOf(Date);
    expect(loaded?.lastUpdated).toBeInstanceOf(Date);
    expect(loaded?.mcpConfig).toBe(JSON.stringify({ servers: { demo: { command: 'node' } } }));

    fsState.files.delete('/data/world-1/mcp.json');
    const fallback = await worldStorage.loadWorld('/data', 'world-1');
    expect(fallback?.mcpConfig).toBeNull();
  });

  it('supports worldExists, listWorlds sorting, and deleteWorld cascade removal', async () => {
    fsState.files.set(
      '/data/world-a/config.json',
      JSON.stringify({
        id: 'world-a',
        name: 'A',
        lastUpdated: '2026-01-01T00:00:00.000Z',
      })
    );
    fsState.files.set(
      '/data/world-b/config.json',
      JSON.stringify({
        id: 'world-b',
        name: 'B',
        lastUpdated: '2026-01-03T00:00:00.000Z',
      })
    );
    addDirRecursive(fsState.dirs, '/data/world-a');
    addDirRecursive(fsState.dirs, '/data/world-b');
    fsState.files.set('/data/world-b/chats/chat-1.json', JSON.stringify({ id: 'chat-1' }));
    addDirRecursive(fsState.dirs, '/data/world-b/chats');

    expect(await worldStorage.worldExists('/data', 'world-a')).toBe(true);
    expect(await worldStorage.worldExists('/data', 'world-missing')).toBe(false);

    const listed = await worldStorage.listWorlds('/data');
    expect(listed.map((w) => w.id)).toEqual(['world-b', 'world-a']);

    expect(await worldStorage.deleteWorld('/data', 'world-b')).toBe(true);
    expect(fsState.files.has('/data/world-b/config.json')).toBe(false);
    expect(fsState.files.has('/data/world-b/chats/chat-1.json')).toBe(false);
  });

  it('supports chat CRUD and compare-and-set name updates', async () => {
    const chat = {
      id: 'chat-1',
      worldId: 'world-1',
      name: 'Original',
      description: 'desc',
      messageCount: 2,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    await worldStorage.saveChatData('/data', 'world-1', chat as any);
    const loaded = await worldStorage.loadChatData('/data', 'world-1', 'chat-1');
    expect(loaded?.createdAt).toBeInstanceOf(Date);
    expect(loaded?.updatedAt).toBeInstanceOf(Date);

    const updated = await worldStorage.updateChatData('/data', 'world-1', 'chat-1', {
      name: 'Renamed',
      description: 'updated',
    });
    expect(updated).not.toBeNull();
    expect(updated?.name).toBe('Renamed');
    expect(updated?.description).toBe('updated');

    expect(
      await worldStorage.updateChatNameIfCurrent('/data', 'world-1', 'chat-1', 'Wrong', 'Nope')
    ).toBe(false);
    expect(
      await worldStorage.updateChatNameIfCurrent('/data', 'world-1', 'chat-1', 'Renamed', 'Final')
    ).toBe(true);

    const final = await worldStorage.loadChatData('/data', 'world-1', 'chat-1');
    expect(final?.name).toBe('Final');
  });

  it('deletes chat files and cascades to deleteMemoryByChatId', async () => {
    fsState.files.set('/data/world-1/chats/chat-1.json', JSON.stringify({ id: 'chat-1' }));
    addDirRecursive(fsState.dirs, '/data/world-1/chats');

    expect(await worldStorage.deleteChatData('/data', 'world-1', 'chat-1')).toBe(true);
    expect(deleteMemoryByChatIdMock).toHaveBeenCalledWith('/data', 'world-1', 'chat-1');

    expect(await worldStorage.deleteChatData('/data', 'world-1', 'chat-missing')).toBe(false);
  });

  it('lists chat histories with metadata only and sorted by updatedAt desc', async () => {
    const chatDir = '/data/world-1/chats';
    addDirRecursive(fsState.dirs, chatDir);
    fsState.files.set(
      `${chatDir}/chat-1.json`,
      JSON.stringify({
        id: 'chat-1',
        worldId: 'world-1',
        name: 'Older',
        messageCount: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        extraPayload: { large: true },
      })
    );
    fsState.files.set(
      `${chatDir}/chat-2.json`,
      JSON.stringify({
        id: 'chat-2',
        worldId: 'world-1',
        name: 'Newer',
        messageCount: 2,
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      })
    );

    const histories = await worldStorage.listChatHistories('/data', 'world-1');
    expect(histories.map((chat) => chat.id)).toEqual(['chat-2', 'chat-1']);
    expect(histories[0]).not.toHaveProperty('extraPayload');

    const none = await worldStorage.listChatHistories('/data', 'world-missing');
    expect(none).toEqual([]);
  });

  it('aggregates memory across agents with chat filtering and stable sort', async () => {
    listAgentsMock.mockResolvedValue([
      { id: 'a-1' },
      { id: 'a-2' },
    ]);
    loadAgentMock.mockImplementation(async (_root: string, _world: string, agentId: string) => {
      if (agentId === 'a-1') {
        return {
          id: 'a-1',
          memory: [
            {
              role: 'assistant',
              sender: 'a-1',
              content: 'later',
              chatId: 'chat-1',
              createdAt: '2026-01-01T00:00:02.000Z',
            },
          ],
        };
      }

      return {
        id: 'a-2',
        memory: [
          {
            role: 'assistant',
            sender: 'a-2',
            content: 'earlier',
            chatId: 'chat-1',
            createdAt: '2026-01-01T00:00:01.000Z',
          },
          {
            role: 'assistant',
            sender: 'a-2',
            content: 'other chat',
            chatId: 'chat-2',
            createdAt: '2026-01-01T00:00:03.000Z',
          },
        ],
      };
    });

    const scoped = await worldStorage.getMemory('/data', 'world-1', 'chat-1');
    expect(scoped.map((m) => m.content)).toEqual(['earlier', 'later']);
    expect(scoped.map((m) => m.agentId)).toEqual(['a-2', 'a-1']);

    const all = await worldStorage.getMemory('/data', 'world-1', '');
    expect(all.map((m) => m.content)).toEqual(['earlier', 'later', 'other chat']);

    listAgentsMock.mockRejectedValueOnce(new Error('boom'));
    expect(await worldStorage.getMemory('/data', 'world-1', 'chat-1')).toEqual([]);
  });
});
