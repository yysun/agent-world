/**
 * Unit Tests: restore-time queue-owned auto-resume guardrails
 *
 * Purpose:
 * - Ensure restore-time auto-resume is queue-only.
 * - Ensure terminal SSE after a queue-owned user turn suppresses interrupted-flight recovery.
 * - Ensure mutation flows can restore chat state without triggering auto-resume.
 *
 * Key Features:
 * - A queued user turn resumes through queue dispatch on restore.
 * - A queue-owned failed user turn does not auto-resume.
 * - A stale sending row with terminal SSE is marked error instead of replayed.
 * - `restoreChat(..., { suppressAutoResume: true })` skips auto-resume entirely.
 *
 * Implementation Notes:
 * - Tests exercise `restoreChat`, which now delegates automatic recovery to queue state only.
 * - Uses `vi.doMock` + `vi.resetModules()` pattern for full module isolation.
 * - Verifies queue status updates and publish calls as observable outcomes.
 *
 * Recent Changes:
 * - 2026-03-10: Removed memory-based restore resend and narrowed auto-resume to queue-owned recovery only.
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

function createStoredEvent(seq: number, type: string, id: string, payload: Record<string, unknown>) {
  return {
    seq,
    id,
    worldId: 'world-1',
    chatId: 'chat-2',
    type,
    payload,
    createdAt: new Date(`2026-01-01T10:00:${String(seq).padStart(2, '0')}Z`),
  };
}

function createLatestEventQueryMock(eventsByType: {
  message?: unknown[];
  sse?: unknown[];
} = {}) {
  return vi.fn().mockImplementation(async (_worldId: string, _chatId: string, options?: { types?: string[] }) => {
    const requestedType = options?.types?.[0];
    if (requestedType === 'message') {
      return eventsByType.message ?? [];
    }

    if (requestedType === 'sse') {
      return eventsByType.sse ?? [];
    }

    return [];
  });
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

describe('restore-time queue-owned auto-resume guardrails', () => {
  it('does not auto-resume a queue-owned failed turn during restore', async () => {
    vi.resetModules();

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

    const { publishMessageWithId } = await setupCommonMocks();
    const managers = await import('../../core/managers.js');

    const restored = await managers.restoreChat('world-1', 'chat-2');
    expect(restored).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.addQueuedMessage).not.toHaveBeenCalled();
    expect(storageWrappers.updateMessageQueueStatus).not.toHaveBeenCalled();
    expect(publishMessageWithId).not.toHaveBeenCalled();
  });

  it('resumes a queued user turn through queue dispatch on restore', async () => {
    vi.resetModules();

    const storageWrappers = buildBaseStorageWrappers();
    storageWrappers.getQueuedMessages = vi.fn().mockResolvedValue([
      {
        messageId: 'user-last-1',
        chatId: 'chat-2',
        content: 'hi',
        sender: 'human',
        status: 'queued',
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockStorageFactory(storageWrappers);

    const { publishMessageWithId } = await setupCommonMocks();
    const managers = await import('../../core/managers.js');

    const restored = await managers.restoreChat('world-1', 'chat-2');
    expect(restored).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.addQueuedMessage).not.toHaveBeenCalled();
    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('user-last-1', 'sending');
    expect(publishMessageWithId).toHaveBeenCalledWith(
      expect.any(Object),
      'hi',
      'human',
      'user-last-1',
      'chat-2',
    );
  });

  it('marks a stale sending row error when terminal SSE post-dates it', async () => {
    vi.resetModules();

    const storageWrappers = buildBaseStorageWrappers({
      getEventsByWorldAndChat: createLatestEventQueryMock({
        message: [
          createStoredEvent(1, 'message', 'user-last-1', { content: 'hi', sender: 'human', role: 'user' }),
        ],
        sse: [
          createStoredEvent(2, 'sse', 'sse-error-1', { type: 'error', error: 'provider missing' }),
        ],
      }),
    });
    storageWrappers.getQueuedMessages = vi.fn()
      .mockResolvedValueOnce([
        {
          messageId: 'user-last-1',
          chatId: 'chat-2',
          content: 'hi',
          sender: 'human',
          status: 'sending',
          retryCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([
        {
          messageId: 'user-last-1',
          chatId: 'chat-2',
          content: 'hi',
          sender: 'human',
          status: 'error',
          retryCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    mockStorageFactory(storageWrappers);

    const { publishMessageWithId } = await setupCommonMocks();
    const managers = await import('../../core/managers.js');

    const restored = await managers.restoreChat('world-1', 'chat-2');
    expect(restored).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('user-last-1', 'error');
    expect(publishMessageWithId).not.toHaveBeenCalled();
  });

  it('marks a stale sending row error when a newer message supersedes it', async () => {
    vi.resetModules();

    const storageWrappers = buildBaseStorageWrappers({
      getEventsByWorldAndChat: createLatestEventQueryMock({
        message: [
          createStoredEvent(3, 'message', 'newer-user-2', { content: 'newer', sender: 'human', role: 'user' }),
        ],
        sse: [],
      }),
    });
    storageWrappers.getQueuedMessages = vi.fn()
      .mockResolvedValueOnce([
        {
          messageId: 'user-last-1',
          chatId: 'chat-2',
          content: 'hi',
          sender: 'human',
          status: 'sending',
          retryCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([
        {
          messageId: 'user-last-1',
          chatId: 'chat-2',
          content: 'hi',
          sender: 'human',
          status: 'error',
          retryCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    mockStorageFactory(storageWrappers);

    const { publishMessageWithId } = await setupCommonMocks();
    const managers = await import('../../core/managers.js');

    const restored = await managers.restoreChat('world-1', 'chat-2');
    expect(restored).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('user-last-1', 'error');
    expect(publishMessageWithId).not.toHaveBeenCalled();
  });

  it('restores chat for mutation without triggering auto-resume when suppression is requested', async () => {
    vi.resetModules();

    const storageWrappers = buildBaseStorageWrappers();
    mockStorageFactory(storageWrappers);

    await setupCommonMocks();
    const managers = await import('../../core/managers.js');

    const restored = await managers.restoreChat('world-1', 'chat-2', { suppressAutoResume: true });
    expect(restored).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.addQueuedMessage).not.toHaveBeenCalled();
    expect(storageWrappers.updateMessageQueueStatus).not.toHaveBeenCalled();
  });

  it('does not invent an auto-resume path from persisted user-last memory when queue ownership is absent', async () => {
    vi.resetModules();

    const storageWrappers = buildBaseStorageWrappers();
    mockStorageFactory(storageWrappers);

    const { publishMessageWithId } = await setupCommonMocks();
    const managers = await import('../../core/managers.js');

    const restored = await managers.restoreChat('world-1', 'chat-2');
    expect(restored).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.addQueuedMessage).not.toHaveBeenCalled();
    expect(storageWrappers.updateMessageQueueStatus).not.toHaveBeenCalled();
    expect(publishMessageWithId).not.toHaveBeenCalled();
  });
});
