/**
 * Unit Tests for File Event Storage Concurrency and Corruption Recovery
 *
 * Features:
 * - Verifies concurrent `saveEvent` calls serialize correctly for the same chat file
 * - Verifies recovery path for JSON files with valid array content plus trailing corruption
 * - Verifies recovered files are rewritten into valid JSON
 * - Verifies filtering, deduplication, deletion, and compaction behaviors
 *
 * Implementation Notes:
 * - Uses fully mocked `fs` and `fs/promises` to avoid real file-system I/O
 * - Stores mocked files in an in-memory `Map<string, string>`
 * - Uses `system` events to avoid message/tool metadata validation constraints
 *
 * Recent Changes:
 * - 2026-02-27: Added filtering/delete/compact/getLatestSeq and duplicate handling coverage.
 * - 2026-02-08: Added regression tests for lock queueing and trailing JSON recovery
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fsModule from 'fs';
import * as fsPromises from 'fs/promises';
import { FileEventStorage } from '../../../core/storage/eventStorage/fileEventStorage.js';
import type { StoredEvent } from '../../../core/storage/eventStorage/types.js';

const { mockFiles } = vi.hoisted(() => ({
  mockFiles: new Map<string, string>()
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  unlink: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(),
  rmdir: vi.fn()
}));

describe('FileEventStorage', () => {
  const worldId = 'world-1';
  const chatId = 'chat-1';
  const baseDir = '/data';
  const eventFilePath = `${baseDir}/${worldId}/events/${chatId}.json`;

  beforeEach(() => {
    mockFiles.clear();

    vi.mocked(fsModule.existsSync).mockImplementation((filePath: any) => {
      const key = String(filePath);
      if (mockFiles.has(key)) return true;
      const prefix = `${key.replace(/\/$/, '')}/`;
      return Array.from(mockFiles.keys()).some((path) => path.startsWith(prefix));
    });

    vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
    vi.mocked(fsPromises.rmdir).mockResolvedValue(undefined);

    vi.mocked(fsPromises.readdir).mockImplementation(async (dirPath: any) => {
      const dir = `${String(dirPath).replace(/\/$/, '')}/`;
      const fileNames = Array.from(mockFiles.keys())
        .filter((filePath) => filePath.startsWith(dir))
        .map((filePath) => filePath.slice(dir.length))
        .filter((fileName) => !fileName.includes('/'));
      return fileNames as any;
    });

    vi.mocked(fsPromises.readFile).mockImplementation(async (filePath: any) => {
      const key = String(filePath);
      if (!mockFiles.has(key)) {
        const err = new Error(`ENOENT: no such file or directory, open '${key}'`) as Error & { code?: string };
        err.code = 'ENOENT';
        throw err;
      }
      return mockFiles.get(key)! as any;
    });

    vi.mocked(fsPromises.writeFile).mockImplementation(async (filePath: any, content: any) => {
      mockFiles.set(String(filePath), String(content));
    });

    vi.mocked(fsPromises.rename).mockImplementation(async (fromPath: any, toPath: any) => {
      const from = String(fromPath);
      const to = String(toPath);
      if (!mockFiles.has(from)) {
        const err = new Error(`ENOENT: no such file or directory, rename '${from}' -> '${to}'`) as Error & { code?: string };
        err.code = 'ENOENT';
        throw err;
      }

      mockFiles.set(to, mockFiles.get(from)!);
      mockFiles.delete(from);
    });

    vi.mocked(fsPromises.unlink).mockImplementation(async (filePath: any) => {
      mockFiles.delete(String(filePath));
    });
  });

  function createSystemEvent(index: number): StoredEvent {
    return {
      id: `evt-${index}`,
      worldId,
      chatId,
      type: 'system',
      payload: { index },
      meta: { source: 'test' },
      createdAt: new Date(`2026-02-08T00:00:${String(index).padStart(2, '0')}.000Z`)
    };
  }

  it('serializes concurrent writes for the same world/chat file', async () => {
    const storage = new FileEventStorage({ baseDir });
    const total = 10;

    await Promise.all(
      Array.from({ length: total }, (_, i) => storage.saveEvent(createSystemEvent(i + 1)))
    );

    const events = await storage.getEventsByWorldAndChat(worldId, chatId);

    expect(events).toHaveLength(total);
    expect(new Set(events.map((event) => event.id)).size).toBe(total);
    expect(events.map((event) => event.seq)).toEqual(
      Array.from({ length: total }, (_, i) => i + 1)
    );
  });

  it('recovers from valid JSON with trailing corrupted content and rewrites the file', async () => {
    const seedEvent = createSystemEvent(1);
    mockFiles.set(
      eventFilePath,
      `${JSON.stringify([seedEvent], null, 2)}\n{"corrupted": true}`
    );

    const storage = new FileEventStorage({ baseDir });
    const events = await storage.getEventsByWorldAndChat(worldId, chatId);

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(seedEvent.id);
    expect(events[0].createdAt).toBeInstanceOf(Date);

    const rewritten = mockFiles.get(eventFilePath);
    expect(rewritten).toBeDefined();
    expect(() => JSON.parse(rewritten!)).not.toThrow();
    expect(rewritten).not.toContain('"corrupted": true');
    expect(vi.mocked(fsPromises.rename)).toHaveBeenCalled();
  });

  it('applies type/time/sequence filters and supports descending limit queries', async () => {
    const storage = new FileEventStorage({ baseDir });

    const baseTime = new Date('2026-02-08T10:00:00.000Z');
    await storage.saveEvents([
      { ...createSystemEvent(1), type: 'system', createdAt: new Date(baseTime.getTime()) },
      { ...createSystemEvent(2), type: 'sse', createdAt: new Date(baseTime.getTime() + 1_000) },
      { ...createSystemEvent(3), type: 'tool-start', createdAt: new Date(baseTime.getTime() + 2_000) },
    ]);

    const filtered = await storage.getEventsByWorldAndChat(worldId, chatId, {
      sinceSeq: 1,
      sinceTime: new Date(baseTime.getTime() + 500),
      types: ['sse', 'tool-start'],
      order: 'desc',
      limit: 1,
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('evt-3');
  });

  it('ignores duplicate event IDs for single and batch writes', async () => {
    const storage = new FileEventStorage({ baseDir });

    const event = createSystemEvent(1);
    await storage.saveEvent(event);
    await storage.saveEvent(event);
    await storage.saveEvents([event, createSystemEvent(2)]);

    const events = await storage.getEventsByWorldAndChat(worldId, chatId);
    expect(events).toHaveLength(2);
    expect(events.map((item) => item.id)).toEqual(['evt-1', 'evt-2']);
    expect(events.map((item) => item.seq)).toEqual([1, 2]);
  });

  it('returns event ranges and latest sequence with cache updates', async () => {
    const storage = new FileEventStorage({ baseDir });

    await storage.saveEvents([createSystemEvent(1), createSystemEvent(2), createSystemEvent(3)]);
    expect(await storage.getLatestSeq(worldId, chatId)).toBe(3);

    const range = await storage.getEventRange(worldId, chatId, 2, 3);
    expect(range).toHaveLength(2);
    expect(range.map((item) => item.id)).toEqual(['evt-2', 'evt-3']);
  });

  it('deletes chat and world event files and compacts existing files', async () => {
    const storage = new FileEventStorage({ baseDir });

    await storage.saveEvents([
      createSystemEvent(1),
      createSystemEvent(2),
      {
        id: 'evt-world-2',
        worldId: 'world-2',
        chatId: 'chat-9',
        type: 'system',
        payload: { world: 2 },
        meta: { source: 'test' },
        createdAt: new Date('2026-02-08T00:00:09.000Z'),
      },
    ]);

    const writesBeforeCompact = vi.mocked(fsPromises.writeFile).mock.calls.length;
    await storage.compact(worldId, chatId);
    expect(vi.mocked(fsPromises.writeFile).mock.calls.length).toBeGreaterThan(writesBeforeCompact);

    const deletedChat = await storage.deleteEventsByWorldAndChat(worldId, chatId);
    expect(deletedChat).toBe(2);
    expect(await storage.getLatestSeq(worldId, chatId)).toBe(0);

    const deletedWorld = await storage.deleteEventsByWorld('world-2');
    expect(deletedWorld).toBe(1);
  });

  it('returns zero for missing chat/world deletions and handles delete-world read errors', async () => {
    const storage = new FileEventStorage({ baseDir });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await storage.deleteEventsByWorldAndChat('missing-world', 'missing-chat')).toBe(0);
    expect(await storage.deleteEventsByWorld('missing-world')).toBe(0);

    mockFiles.set(`${baseDir}/error-world/events/chat-a.json`, '[]');
    vi.mocked(fsPromises.readdir).mockRejectedValueOnce(new Error('readdir failed'));
    const deleted = await storage.deleteEventsByWorld('error-world');
    expect(deleted).toBe(0);
    expect(errorSpy).toHaveBeenCalled();
  });
});
