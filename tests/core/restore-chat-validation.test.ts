/**
 * Unit Tests for restoreChat validation
 *
 * Purpose:
 * - Ensure chat switching rejects unknown chat IDs instead of updating world state.
 *
 * Key features:
 * - Uses mocked in-memory storage wrappers only.
 * - Verifies no persistence update occurs for missing chats.
 * - Verifies chat restore replays unresolved HITL prompts for the loaded chat.
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

  it('invokes HITL replay when restoring a chat', async () => {
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
      listChats: vi.fn().mockResolvedValue([
        { id: 'chat-1', name: 'Chat 1', messageCount: 0 },
        { id: 'chat-2', name: 'Chat 2', messageCount: 0 },
      ]),
      loadChatData: vi.fn().mockResolvedValue({ id: 'chat-2', name: 'Chat 2', messageCount: 0 }),
      saveWorld: vi.fn().mockResolvedValue(undefined)
    };

    vi.doMock('../../core/storage/storage-factory.js', () => ({
      createStorageWithWrappers: vi.fn().mockResolvedValue(storageWrappers),
      getDefaultRootPath: vi.fn().mockReturnValue('/test/data')
    }));

    const replayPendingHitlRequests = vi.fn().mockReturnValue(1);
    vi.doMock('../../core/hitl.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/hitl.js')>('../../core/hitl.js');
      return {
        ...actual,
        replayPendingHitlRequests,
      };
    });

    const managers = await import('../../core/managers.js');
    const restored = await managers.restoreChat('world-1', 'chat-2');
    expect(restored).not.toBeNull();

    expect(replayPendingHitlRequests).toHaveBeenCalledTimes(1);
    expect(replayPendingHitlRequests).toHaveBeenCalledWith(expect.objectContaining({ id: 'world-1' }), 'chat-2');
  });
});
