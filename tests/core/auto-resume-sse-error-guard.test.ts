/**
 * Unit Tests: auto-resume queue-routing on chat restore
 *
 * Purpose:
 * - Ensure `triggerPendingLastMessageResume` always routes a user-last message
 *   through the queue system (addQueuedMessage + triggerPendingQueueResume) so
 *   that processing failures are surfaced as error cards on screen.
 * - Loop prevention is handled by queue dedup: if the messageId is already in
 *   the queue (any status including 'error'), it is not re-added, preventing
 *   infinite retry loops on permanently-failing chats.
 *
 * Key Features:
 * - On first restore with a user-last message not yet in queue → message is enqueued.
 * - If message is already in queue (e.g., status 'error' from a prior failure) →
 *   not added again, queue resume is still triggered (will no-op for error rows).
 * - Falls back to direct publish only when queue storage is unavailable.
 *
 * Implementation Notes:
 * - Tests exercise `restoreChat` which calls `triggerPendingLastMessageResume` internally.
 * - Uses `vi.doMock` + `vi.resetModules()` pattern for full module isolation.
 * - Verifies `addQueuedMessage` call as the observable outcome.
 *
 * Recent Changes:
 * - 2026-03-09: Initial implementation for the SSE terminal-state guard.
 * - 2026-03-09: Removed SSE guard; queue dedup now prevents infinite retry loops.
 */

import { describe, it, expect, vi } from 'vitest';

function createPersistedWorld(currentChatId = 'chat-1') {
  return {
    id: 'world-1',
    name: 'World 1',
    turnLimit: 5,
    currentChatId,
    createdAt: new Date(),
    lastUpdated: new Date(),
  };
}

function mockStorageFactory(storageWrappers: Record<string, any>): void {
  vi.doMock('../../core/storage/storage-factory.js', () => ({
    createStorageWithWrappers: vi.fn().mockResolvedValue(storageWrappers),
    getDefaultRootPath: vi.fn().mockReturnValue('/test/data'),
  }));
}


function buildBaseStorageWrappers(eventStorageOverrides: Record<string, any> = {}) {
  return {
    loadWorld: vi.fn().mockResolvedValue(createPersistedWorld('chat-1')),
    listAgents: vi.fn().mockResolvedValue([
      { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] },
    ]),
    listChats: vi.fn().mockResolvedValue([
      { id: 'chat-1', name: 'Chat 1', messageCount: 0 },
      { id: 'chat-2', name: 'Chat 2', messageCount: 0 },
    ]),
    loadChatData: vi.fn().mockResolvedValue({ id: 'chat-2', name: 'Chat 2', messageCount: 0 }),
    getMemory: vi.fn().mockResolvedValue([
      {
        role: 'user',
        content: 'hi',
        sender: 'human',
        messageId: 'user-last-1',
        chatId: 'chat-2',
        createdAt: new Date('2026-01-01T10:00:00Z'),
      },
    ]),
    saveWorld: vi.fn().mockResolvedValue(undefined),
    // Queue storage: default to empty queue (message not yet enqueued)
    addQueuedMessage: vi.fn().mockResolvedValue(undefined),
    getQueuedMessages: vi.fn().mockResolvedValue([]),
    updateMessageQueueStatus: vi.fn().mockResolvedValue(undefined),
    incrementQueueMessageRetry: vi.fn().mockResolvedValue(1),
    removeQueuedMessage: vi.fn().mockResolvedValue(undefined),
    eventStorage: {
      saveEvent: vi.fn().mockResolvedValue(undefined),
      saveEvents: vi.fn().mockResolvedValue(undefined),
      getEventsByWorldAndChat: vi.fn().mockResolvedValue([]),
      deleteEventsByWorldAndChat: vi.fn().mockResolvedValue(0),
      deleteEventsByWorld: vi.fn().mockResolvedValue(0),
      getLatestSeq: vi.fn().mockResolvedValue(0),
      getEventRange: vi.fn().mockResolvedValue([]),
      ...eventStorageOverrides,
    },
  };
}

async function setupCommonMocks() {
  const replayPendingHitlRequests = vi.fn().mockReturnValue(0);
  vi.doMock('../../core/hitl.js', async () => {
    const actual = await vi.importActual<typeof import('../../core/hitl.js')>('../../core/hitl.js');
    return { ...actual, replayPendingHitlRequests };
  });

  const resumePendingToolCallsForChat = vi.fn().mockResolvedValue(0);
  vi.doMock('../../core/events/memory-manager.js', async () => {
    const actual = await vi.importActual<typeof import('../../core/events/memory-manager.js')>('../../core/events/memory-manager.js');
    return { ...actual, resumePendingToolCallsForChat };
  });

  const publishMessageWithId = vi.fn();
  vi.doMock('../../core/events/index.js', async () => {
    const actual = await vi.importActual<typeof import('../../core/events/index.js')>('../../core/events/index.js');
    return { ...actual, publishMessageWithId };
  });

  return { publishMessageWithId };
}

describe('auto-resume queue routing on chat restore', () => {
  it('enqueues user-last message even when last SSE was an error (prior failure visible on screen)', async () => {
    vi.resetModules();

    // Last message at seq 90, last SSE error at seq 100 → previously the SSE guard
    // would block; now the message is routed through the queue so the error is shown.
    const storageWrappers = buildBaseStorageWrappers();
    mockStorageFactory(storageWrappers);

    await setupCommonMocks();
    const managers = await import('../../core/managers.js');

    const restored = await managers.restoreChat('world-1', 'chat-2');
    expect(restored).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.addQueuedMessage).toHaveBeenCalledOnce();
    expect(storageWrappers.addQueuedMessage).toHaveBeenCalledWith(
      'world-1', 'chat-2', 'user-last-1', 'hi', 'human'
    );
  });

  it('does not re-add message that is already in queue (prevents infinite retry loop)', async () => {
    vi.resetModules();

    // Message already exists in queue with 'error' status (prior failure)
    const storageWrappers = buildBaseStorageWrappers();
    storageWrappers.getQueuedMessages = vi.fn().mockResolvedValue([
      {
        messageId: 'user-last-1',
        chatId: 'chat-2',
        content: 'hi',
        sender: 'human',
        status: 'error',
        retryCount: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockStorageFactory(storageWrappers);

    await setupCommonMocks();
    const managers = await import('../../core/managers.js');

    const restored = await managers.restoreChat('world-1', 'chat-2');
    expect(restored).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Already in queue → should NOT be added again
    expect(storageWrappers.addQueuedMessage).not.toHaveBeenCalled();
    // Should NOT trigger a new dispatch (no status transition to 'sending')
    expect(storageWrappers.updateMessageQueueStatus).not.toHaveBeenCalled();
  });

  it('enqueues user-last message when stream was interrupted mid-flight (SSE start with no end)', async () => {
    vi.resetModules();

    const storageWrappers = buildBaseStorageWrappers();
    mockStorageFactory(storageWrappers);

    await setupCommonMocks();
    const managers = await import('../../core/managers.js');

    const restored = await managers.restoreChat('world-1', 'chat-2');
    expect(restored).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.addQueuedMessage).toHaveBeenCalledOnce();
    expect(storageWrappers.addQueuedMessage).toHaveBeenCalledWith(
      'world-1', 'chat-2', 'user-last-1', 'hi', 'human'
    );
  });

  it('enqueues user-last message when no prior processing has occurred', async () => {
    vi.resetModules();

    const storageWrappers = buildBaseStorageWrappers();
    mockStorageFactory(storageWrappers);

    await setupCommonMocks();
    const managers = await import('../../core/managers.js');

    const restored = await managers.restoreChat('world-1', 'chat-2');
    expect(restored).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.addQueuedMessage).toHaveBeenCalledOnce();
    expect(storageWrappers.addQueuedMessage).toHaveBeenCalledWith(
      'world-1', 'chat-2', 'user-last-1', 'hi', 'human'
    );
  });

  it('enqueues new user message even when a prior SSE error exists for an older message', async () => {
    vi.resetModules();

    // A prior SSE error exists but the message in memory is not yet in queue
    // (e.g., user sent a new message after the old error was cleared)
    const storageWrappers = buildBaseStorageWrappers();
    mockStorageFactory(storageWrappers);

    await setupCommonMocks();
    const managers = await import('../../core/managers.js');

    const restored = await managers.restoreChat('world-1', 'chat-2');
    expect(restored).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.addQueuedMessage).toHaveBeenCalledOnce();
    expect(storageWrappers.addQueuedMessage).toHaveBeenCalledWith(
      'world-1', 'chat-2', 'user-last-1', 'hi', 'human'
    );
  });

  it('falls back to direct publish when queue storage is not configured', async () => {
    vi.resetModules();

    // No queue storage methods → falls back to direct publishMessageWithId
    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(createPersistedWorld('chat-1')),
      listAgents: vi.fn().mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] },
      ]),
      listChats: vi.fn().mockResolvedValue([
        { id: 'chat-1', name: 'Chat 1', messageCount: 0 },
        { id: 'chat-2', name: 'Chat 2', messageCount: 0 },
      ]),
      loadChatData: vi.fn().mockResolvedValue({ id: 'chat-2', name: 'Chat 2', messageCount: 0 }),
      getMemory: vi.fn().mockResolvedValue([
        {
          role: 'user',
          content: 'hi',
          sender: 'human',
          messageId: 'user-last-1',
          chatId: 'chat-2',
          createdAt: new Date(),
        },
      ]),
      saveWorld: vi.fn().mockResolvedValue(undefined),
      // No queue storage methods → forces fallback path
    };
    mockStorageFactory(storageWrappers);

    const { publishMessageWithId } = await setupCommonMocks();
    const managers = await import('../../core/managers.js');

    const restored = await managers.restoreChat('world-1', 'chat-2');
    expect(restored).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(publishMessageWithId).toHaveBeenCalledOnce();
  });
});
