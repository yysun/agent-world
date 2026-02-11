/**
 * Purpose:
 * - Verify world deletion in core managers is side-effect-free.
 *
 * Features:
 * - Ensures `deleteWorld` does not trigger world hydration/chat creation paths.
 * - Verifies deletion still executes storage deletion and optional cleanup callbacks.
 *
 * Implementation Notes:
 * - Mocks storage-factory before importing managers to control all storage interactions.
 * - Uses in-memory mocked functions only (no filesystem, no external services).
 *
 * Recent Changes:
 * - 2026-02-11: Added regression tests for side-effect-free `deleteWorld`.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockStorage = vi.hoisted(() => ({
  loadWorld: vi.fn(),
  listWorlds: vi.fn(),
  listChats: vi.fn(),
  listAgents: vi.fn(),
  saveChatData: vi.fn(),
  deleteWorld: vi.fn()
}));

const mockStorageFactory = vi.hoisted(() => ({
  createStorageWithWrappers: vi.fn(),
  getDefaultRootPath: vi.fn()
}));

vi.mock('../../core/storage/storage-factory.js', () => ({
  createStorageWithWrappers: mockStorageFactory.createStorageWithWrappers,
  getDefaultRootPath: mockStorageFactory.getDefaultRootPath
}));

describe('deleteWorld side effects', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockStorageFactory.createStorageWithWrappers.mockResolvedValue(mockStorage as any);
    mockStorageFactory.getDefaultRootPath.mockReturnValue('/test/data');

    mockStorage.listWorlds.mockResolvedValue([]);
    mockStorage.listChats.mockRejectedValue(new Error('listChats should never be called during deleteWorld'));
    mockStorage.listAgents.mockRejectedValue(new Error('listAgents should never be called during deleteWorld'));
    mockStorage.saveChatData.mockRejectedValue(new Error('saveChatData should never be called during deleteWorld'));
    mockStorage.deleteWorld.mockResolvedValue(true);
  });

  test('deletes a world without invoking world hydration/chat paths', async () => {
    mockStorage.loadWorld.mockResolvedValue({
      id: 'test-world',
      name: 'Test World'
    });

    const { deleteWorld } = await import('../../core/managers.js');
    const deleted = await deleteWorld('test-world');

    expect(deleted).toBe(true);
    expect(mockStorage.deleteWorld).toHaveBeenCalledWith('test-world');
    expect(mockStorage.listChats).not.toHaveBeenCalled();
    expect(mockStorage.listAgents).not.toHaveBeenCalled();
    expect(mockStorage.saveChatData).not.toHaveBeenCalled();
  });

  test('runs cleanup callbacks from loaded world data when present', async () => {
    const eventCleanup = vi.fn();
    const activityCleanup = vi.fn();

    mockStorage.loadWorld.mockResolvedValue({
      id: 'test-world',
      name: 'Test World',
      _eventPersistenceCleanup: eventCleanup,
      _activityListenerCleanup: activityCleanup
    });

    const { deleteWorld } = await import('../../core/managers.js');
    const deleted = await deleteWorld('test-world');

    expect(deleted).toBe(true);
    expect(eventCleanup).toHaveBeenCalledTimes(1);
    expect(activityCleanup).toHaveBeenCalledTimes(1);
    expect(mockStorage.listChats).not.toHaveBeenCalled();
    expect(mockStorage.saveChatData).not.toHaveBeenCalled();
  });
});
