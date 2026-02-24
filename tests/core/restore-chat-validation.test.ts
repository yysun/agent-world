/**
 * Unit Tests for restoreChat validation
 *
 * Purpose:
 * - Ensure chat switching rejects unknown chat IDs instead of updating world state.
 *
 * Key features:
 * - Uses mocked in-memory storage wrappers only.
 * - Verifies no persistence update occurs for missing chats.
 *
 * Notes:
 * - Prevents cross-chat leakage via invalid/stale chat IDs during switch flows.
 */

import { describe, it, expect, vi } from 'vitest';

describe('restoreChat validation', () => {
  it('returns null when target chat does not exist in runtime or storage', async () => {
    vi.resetModules();

    const persistedWorld = {
      id: 'world-1',
      name: 'World 1',
      turnLimit: 5,
      currentChatId: 'chat-1',
      createdAt: new Date(),
      lastUpdated: new Date()
    };

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
      listAgents: vi.fn().mockResolvedValue([]),
      listChats: vi.fn().mockResolvedValue([{ id: 'chat-1', name: 'New Chat', messageCount: 0 }]),
      loadChatData: vi.fn().mockResolvedValue(null),
      saveWorld: vi.fn().mockResolvedValue(undefined)
    };

    vi.doMock('../../core/storage/storage-factory.js', () => ({
      createStorageWithWrappers: vi.fn().mockResolvedValue(storageWrappers),
      getDefaultRootPath: vi.fn().mockReturnValue('/test/data')
    }));

    const managers = await import('../../core/managers.js');
    const result = await managers.restoreChat('world-1', 'chat-missing');

    expect(result).toBeNull();
    expect(storageWrappers.loadChatData).toHaveBeenCalledWith('world-1', 'chat-missing');
    expect(storageWrappers.saveWorld).not.toHaveBeenCalled();
  });
});
