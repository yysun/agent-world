/**
 * Unit Tests for File Event Storage Concurrency and Corruption Recovery
 *
 * Features:
 * - Verifies concurrent `saveEvent` calls serialize correctly for the same chat file
 * - Verifies recovery path for JSON files with valid array content plus trailing corruption
 * - Verifies recovered files are rewritten into valid JSON
 *
 * Implementation Notes:
 * - Uses fully mocked `fs` and `fs/promises` to avoid real file-system I/O
 * - Stores mocked files in an in-memory `Map<string, string>`
 * - Uses `system` events to avoid message/tool metadata validation constraints
 *
 * Recent Changes:
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
      return mockFiles.has(String(filePath));
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
});
