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
 * - Verifies chat restore triggers pending persisted tool-call resume for the loaded chat.
 * - Verifies chat restore auto-submits pending user-last message via existing messageId.
 * - Verifies queue resume retry bookkeeping runs when queued message publish fails.
 * - Verifies queue resume resets stale `sending` rows for the restored chat in same-runtime recovery paths.
 * - Verifies direct queue ingress does not reset existing `sending` rows.
 * - Verifies resumeChatQueue uses active subscribed world runtime for queue dispatch.
 *
 * Notes:
 * - Prevents cross-chat leakage via invalid/stale chat IDs during switch flows.
 *
 * Recent Changes:
 * - 2026-03-05: Added queue retry backoff status emission coverage (chat-scoped per-second system updates with attempt/remaining counters).
 * - 2026-03-05: Updated preflight no-responder expectation to retry/error transition semantics (no immediate fail-fast error).
 * - 2026-03-04: Reduced queue matrix duplication and made shared subscription mocks chat-aware so queue tests exercise runtime selection logic instead of relying on injected `targetWorld`.
 * - 2026-03-04: Added queue dispatch hardening regressions for fail-closed storage checks, no-response retry/error fallback, and in-flight row-specific completion cleanup.
 * - 2026-03-04: Added queue logging diagnostics coverage to assert agent/listener status snapshots are included on publish and no-response fallback logs.
 * - 2026-03-04: Added queue responder preflight coverage for no-responder handling and single refresh bootstrap behavior.
 */

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';

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

describe('restoreChat validation', () => {
  it('returns null when target chat does not exist in runtime or storage', async () => {
    vi.resetModules();

    const persistedWorld = createPersistedWorld('chat-1');

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
      listAgents: vi.fn().mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] },
      ]),
      listChats: vi.fn().mockResolvedValue([{ id: 'chat-1', name: 'New Chat', messageCount: 0 }]),
      loadChatData: vi.fn().mockResolvedValue(null),
      getMemory: vi.fn().mockResolvedValue([]),
      saveWorld: vi.fn().mockResolvedValue(undefined)
    };

    mockStorageFactory(storageWrappers);

    const managers = await import('../../core/managers.js');
    const result = await managers.restoreChat('world-1', 'chat-missing');

    expect(result).toBeNull();
    expect(storageWrappers.loadChatData).toHaveBeenCalledWith('world-1', 'chat-missing');
    expect(storageWrappers.saveWorld).not.toHaveBeenCalled();
  });

  it('invokes HITL replay when restoring a chat', async () => {
    vi.resetModules();

    const persistedWorld = createPersistedWorld('chat-1');

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
      listAgents: vi.fn().mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] },
      ]),
      listChats: vi.fn().mockResolvedValue([
        { id: 'chat-1', name: 'Chat 1', messageCount: 0 },
        { id: 'chat-2', name: 'Chat 2', messageCount: 0 },
      ]),
      loadChatData: vi.fn().mockResolvedValue({ id: 'chat-2', name: 'Chat 2', messageCount: 0 }),
      getMemory: vi.fn().mockResolvedValue([
        { role: 'user', content: 'Please load skill', sender: 'human', messageId: 'm1', chatId: 'chat-2', createdAt: new Date('2026-02-24T10:00:00Z') },
        {
          role: 'assistant',
          content: 'Calling tool: load_skill',
          sender: 'assistant-1',
          messageId: 'm2',
          replyToMessageId: 'm1',
          chatId: 'chat-2',
          createdAt: new Date('2026-02-24T10:00:01Z'),
          tool_calls: [
            { id: 'tc-1', type: 'function', function: { name: 'load_skill', arguments: '{}' } }
          ]
        }
      ]),
      saveWorld: vi.fn().mockResolvedValue(undefined)
    };

    mockStorageFactory(storageWrappers);

    const replayPendingHitlRequests = vi.fn().mockReturnValue(0);
    vi.doMock('../../core/hitl.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/hitl.js')>('../../core/hitl.js');
      return {
        ...actual,
        replayPendingHitlRequests,
      };
    });

    const resumePendingToolCallsForChat = vi.fn().mockResolvedValue(1);
    vi.doMock('../../core/events/memory-manager.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/events/memory-manager.js')>('../../core/events/memory-manager.js');
      return {
        ...actual,
        resumePendingToolCallsForChat,
      };
    });

    const publishMessageWithId = vi.fn();
    vi.doMock('../../core/events/index.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/events/index.js')>('../../core/events/index.js');
      return {
        ...actual,
        publishMessageWithId,
      };
    });

    const managers = await import('../../core/managers.js');
    const restored = await managers.restoreChat('world-1', 'chat-2');
    expect(restored).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(replayPendingHitlRequests).toHaveBeenCalledTimes(1);
    expect(replayPendingHitlRequests).toHaveBeenCalledWith(expect.objectContaining({ id: 'world-1' }), 'chat-2');
    expect(resumePendingToolCallsForChat).toHaveBeenCalledTimes(1);
    expect(resumePendingToolCallsForChat).toHaveBeenCalledWith(expect.objectContaining({ id: 'world-1' }), 'chat-2', 'm2');
    expect(publishMessageWithId).not.toHaveBeenCalled();
  });

  it('does not resume pending tool calls when restoring a chat that already has replayed HITL prompts', async () => {
    vi.resetModules();

    const persistedWorld = createPersistedWorld('chat-1');

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
      listAgents: vi.fn().mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] },
      ]),
      listChats: vi.fn().mockResolvedValue([
        { id: 'chat-1', name: 'Chat 1', messageCount: 0 },
        { id: 'chat-2', name: 'Chat 2', messageCount: 0 },
      ]),
      loadChatData: vi.fn().mockResolvedValue({ id: 'chat-2', name: 'Chat 2', messageCount: 0 }),
      getMemory: vi.fn().mockResolvedValue([
        { role: 'user', content: 'Run the shell command', sender: 'human', messageId: 'm1', chatId: 'chat-2', createdAt: new Date('2026-02-24T10:00:00Z') },
        {
          role: 'assistant',
          content: 'Calling tool: shell_cmd',
          sender: 'assistant-1',
          messageId: 'm2',
          replyToMessageId: 'm1',
          chatId: 'chat-2',
          createdAt: new Date('2026-02-24T10:00:01Z'),
          tool_calls: [
            { id: 'tc-1', type: 'function', function: { name: 'shell_cmd', arguments: '{"command":"rm","args":[".e2e-hitl-delete-me.txt"]}' } }
          ]
        }
      ]),
      saveWorld: vi.fn().mockResolvedValue(undefined)
    };

    mockStorageFactory(storageWrappers);

    const replayPendingHitlRequests = vi.fn().mockReturnValue(1);
    vi.doMock('../../core/hitl.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/hitl.js')>('../../core/hitl.js');
      return {
        ...actual,
        replayPendingHitlRequests,
      };
    });

    const resumePendingToolCallsForChat = vi.fn().mockResolvedValue(1);
    vi.doMock('../../core/events/memory-manager.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/events/memory-manager.js')>('../../core/events/memory-manager.js');
      return {
        ...actual,
        resumePendingToolCallsForChat,
      };
    });

    const publishMessageWithId = vi.fn();
    vi.doMock('../../core/events/index.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/events/index.js')>('../../core/events/index.js');
      return {
        ...actual,
        publishMessageWithId,
      };
    });

    const managers = await import('../../core/managers.js');
    const restored = await managers.restoreChat('world-1', 'chat-2');
    expect(restored).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(replayPendingHitlRequests).toHaveBeenCalledTimes(1);
    expect(replayPendingHitlRequests).toHaveBeenCalledWith(expect.objectContaining({ id: 'world-1' }), 'chat-2');
    expect(resumePendingToolCallsForChat).not.toHaveBeenCalled();
    expect(publishMessageWithId).not.toHaveBeenCalled();
  });

  it('can suppress HITL replay during mutation restore flows', async () => {
    vi.resetModules();

    const persistedWorld = createPersistedWorld('chat-1');

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
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
          role: 'assistant',
          content: 'Calling tool: shell_cmd',
          sender: 'assistant-1',
          messageId: 'm-hitl',
          chatId: 'chat-2',
          createdAt: new Date('2026-02-24T10:00:01Z'),
          tool_calls: [
            { id: 'tc-1', type: 'function', function: { name: 'shell_cmd', arguments: '{"command":"rm","args":[".e2e-hitl-delete-me.txt"]}' } }
          ]
        }
      ]),
      saveWorld: vi.fn().mockResolvedValue(undefined)
    };

    mockStorageFactory(storageWrappers);

    const replayPendingHitlRequests = vi.fn().mockReturnValue(1);
    vi.doMock('../../core/hitl.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/hitl.js')>('../../core/hitl.js');
      return {
        ...actual,
        replayPendingHitlRequests,
      };
    });

    const resumePendingToolCallsForChat = vi.fn().mockResolvedValue(1);
    vi.doMock('../../core/events/memory-manager.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/events/memory-manager.js')>('../../core/events/memory-manager.js');
      return {
        ...actual,
        resumePendingToolCallsForChat,
      };
    });

    const managers = await import('../../core/managers.js');
    const restored = await managers.restoreChat('world-1', 'chat-2', {
      suppressAutoResume: true,
      suppressHitlReplay: true,
    });
    expect(restored).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(replayPendingHitlRequests).not.toHaveBeenCalled();
    expect(resumePendingToolCallsForChat).not.toHaveBeenCalled();
  });

  it('does not auto-submit a persisted user-last message when restoring a chat without queue ownership', async () => {
    vi.resetModules();

    const persistedWorld = createPersistedWorld('chat-1');

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
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
          content: 'Continue this pending request',
          sender: 'human',
          messageId: 'user-last-1',
          chatId: 'chat-2',
          createdAt: new Date('2026-02-24T10:00:00Z')
        }
      ]),
      saveWorld: vi.fn().mockResolvedValue(undefined),
      // Queue storage exists but there is no queue-owned row for this persisted message.
      addQueuedMessage: vi.fn().mockResolvedValue(undefined),
      getQueuedMessages: vi.fn().mockResolvedValue([]),
      updateMessageQueueStatus: vi.fn().mockResolvedValue(undefined),
      incrementQueueMessageRetry: vi.fn().mockResolvedValue(1),
      removeQueuedMessage: vi.fn().mockResolvedValue(undefined),
    };

    mockStorageFactory(storageWrappers);

    const replayPendingHitlRequests = vi.fn().mockReturnValue(0);
    vi.doMock('../../core/hitl.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/hitl.js')>('../../core/hitl.js');
      return {
        ...actual,
        replayPendingHitlRequests,
      };
    });

    const resumePendingToolCallsForChat = vi.fn().mockResolvedValue(0);
    vi.doMock('../../core/events/memory-manager.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/events/memory-manager.js')>('../../core/events/memory-manager.js');
      return {
        ...actual,
        resumePendingToolCallsForChat,
      };
    });

    const managers = await import('../../core/managers.js');
    const restored = await managers.restoreChat('world-1', 'chat-2');
    expect(restored).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(replayPendingHitlRequests).toHaveBeenCalledTimes(1);
    expect(storageWrappers.addQueuedMessage).not.toHaveBeenCalled();
    expect(storageWrappers.updateMessageQueueStatus).not.toHaveBeenCalled();
    expect(resumePendingToolCallsForChat).not.toHaveBeenCalled();
  });

  it('returns centralized activation snapshot with memory and pending HITL prompts', async () => {
    vi.resetModules();

    const persistedWorld = createPersistedWorld('chat-1');

    const memoryRows = [
      {
        role: 'assistant',
        content: 'Calling tool: human_intervention_request',
        sender: 'qwen',
        messageId: 'm-hitl',
        chatId: 'chat-2',
        createdAt: new Date('2026-02-25T09:00:00Z'),
        tool_calls: [
          { id: 'req-1', type: 'function', function: { name: 'human_intervention_request', arguments: '{"question":"Approve?","options":["Yes","No"]}' } }
        ]
      }
    ];

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
      listAgents: vi.fn().mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] },
      ]),
      listChats: vi.fn().mockResolvedValue([
        { id: 'chat-1', name: 'Chat 1', messageCount: 0 },
        { id: 'chat-2', name: 'Chat 2', messageCount: 0 },
      ]),
      loadChatData: vi.fn().mockResolvedValue({ id: 'chat-2', name: 'Chat 2', messageCount: 0 }),
      getMemory: vi.fn().mockResolvedValue(memoryRows),
      saveWorld: vi.fn().mockResolvedValue(undefined)
    };

    mockStorageFactory(storageWrappers);

    const replayPendingHitlRequests = vi.fn().mockReturnValue(0);
    const listPendingHitlPromptEvents = vi.fn().mockReturnValue([]);
    const listPendingHitlPromptEventsFromMessages = vi.fn().mockReturnValue([
      {
        chatId: 'chat-2',
        prompt: {
          requestId: 'req-1',
          title: 'Human input required',
          message: 'Approve?',
          options: [{ id: 'opt_1', label: 'Yes' }, { id: 'opt_2', label: 'No' }],
          defaultOptionId: 'opt_2',
          metadata: null,
          agentName: 'qwen',
          toolName: 'human_intervention_request',
          toolCallId: 'req-1',
        }
      }
    ]);
    vi.doMock('../../core/hitl.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/hitl.js')>('../../core/hitl.js');
      return {
        ...actual,
        replayPendingHitlRequests,
        listPendingHitlPromptEvents,
        listPendingHitlPromptEventsFromMessages,
      };
    });

    const resumePendingToolCallsForChat = vi.fn().mockResolvedValue(0);
    vi.doMock('../../core/events/memory-manager.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/events/memory-manager.js')>('../../core/events/memory-manager.js');
      return {
        ...actual,
        resumePendingToolCallsForChat,
      };
    });

    const managers = await import('../../core/managers.js');
    const snapshot = await managers.activateChatWithSnapshot('world-1', 'chat-2');

    expect(snapshot).not.toBeNull();
    expect(snapshot?.chatId).toBe('chat-2');
    expect(snapshot?.memory).toEqual(memoryRows);
    expect(snapshot?.hitlPrompts).toHaveLength(1);
    expect(listPendingHitlPromptEvents).not.toHaveBeenCalled();
    expect(listPendingHitlPromptEventsFromMessages).toHaveBeenCalledWith(memoryRows, 'chat-2');
  });

  it('marks queued chat message error when restore-triggered publish fails', async () => {
    vi.resetModules();

    const persistedWorld = createPersistedWorld('chat-1');

    const queueMessage = {
      messageId: 'q-1',
      chatId: 'chat-2',
      content: 'Queued hello',
      sender: 'human',
      status: 'queued' as const,
      retryCount: 0,
      createdAt: new Date('2026-03-01T10:00:00Z'),
      updatedAt: new Date('2026-03-01T10:00:00Z')
    };

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
      listAgents: vi.fn().mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] },
      ]),
      listChats: vi.fn().mockResolvedValue([
        { id: 'chat-1', name: 'Chat 1', messageCount: 0 },
        { id: 'chat-2', name: 'Chat 2', messageCount: 0 },
      ]),
      loadChatData: vi.fn().mockResolvedValue({ id: 'chat-2', name: 'Chat 2', messageCount: 0 }),
      getMemory: vi.fn().mockResolvedValue([]),
      saveWorld: vi.fn().mockResolvedValue(undefined),
      addQueuedMessage: vi.fn().mockResolvedValue(undefined),
      getQueuedMessages: vi.fn().mockResolvedValue([queueMessage]),
      updateMessageQueueStatus: vi.fn().mockResolvedValue(undefined),
      incrementQueueMessageRetry: vi.fn().mockResolvedValue(1),
      removeQueuedMessage: vi.fn().mockResolvedValue(undefined),
    };

    mockStorageFactory(storageWrappers);

    const replayPendingHitlRequests = vi.fn().mockReturnValue(0);
    vi.doMock('../../core/hitl.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/hitl.js')>('../../core/hitl.js');
      return {
        ...actual,
        replayPendingHitlRequests,
      };
    });

    const resumePendingToolCallsForChat = vi.fn().mockResolvedValue(0);
    vi.doMock('../../core/events/memory-manager.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/events/memory-manager.js')>('../../core/events/memory-manager.js');
      return {
        ...actual,
        resumePendingToolCallsForChat,
      };
    });

    const publishMessageWithId = vi.fn(() => {
      throw new Error('publish failure');
    });

    vi.doMock('../../core/events/index.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/events/index.js')>('../../core/events/index.js');
      return {
        ...actual,
        publishMessageWithId,
      };
    });

    const managers = await import('../../core/managers.js');
    const restored = await managers.restoreChat('world-1', 'chat-2');
    expect(restored).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('q-1', 'sending');
    expect(storageWrappers.incrementQueueMessageRetry).toHaveBeenCalledWith('q-1');
    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('q-1', 'error');
  });

  it('resets stale sending row before processing restored chat queue', async () => {
    vi.resetModules();

    const persistedWorld = createPersistedWorld('chat-1');

    const staleSending = {
      messageId: 'q-stale',
      chatId: 'chat-2',
      content: 'stale sending',
      sender: 'human',
      status: 'sending' as const,
      retryCount: 0,
      createdAt: new Date('2026-03-01T10:00:00Z'),
      updatedAt: new Date('2026-03-01T10:00:00Z')
    };

    const queuedNext = {
      messageId: 'q-next',
      chatId: 'chat-2',
      content: 'queued next',
      sender: 'human',
      status: 'queued' as const,
      retryCount: 0,
      createdAt: new Date('2026-03-01T10:00:01Z'),
      updatedAt: new Date('2026-03-01T10:00:01Z')
    };

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
      listAgents: vi.fn().mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] },
      ]),
      listChats: vi.fn().mockResolvedValue([
        { id: 'chat-1', name: 'Chat 1', messageCount: 0 },
        { id: 'chat-2', name: 'Chat 2', messageCount: 0 },
      ]),
      loadChatData: vi.fn().mockResolvedValue({ id: 'chat-2', name: 'Chat 2', messageCount: 0 }),
      getMemory: vi.fn().mockResolvedValue([]),
      saveWorld: vi.fn().mockResolvedValue(undefined),
      addQueuedMessage: vi.fn().mockResolvedValue(undefined),
      getQueuedMessages: vi.fn()
        .mockResolvedValueOnce([staleSending, queuedNext])
        .mockResolvedValueOnce([
          { ...staleSending, status: 'queued' as const },
          queuedNext,
        ]),
      updateMessageQueueStatus: vi.fn().mockResolvedValue(undefined),
      incrementQueueMessageRetry: vi.fn().mockResolvedValue(1),
      removeQueuedMessage: vi.fn().mockResolvedValue(undefined),
    };

    mockStorageFactory(storageWrappers);

    const replayPendingHitlRequests = vi.fn().mockReturnValue(0);
    vi.doMock('../../core/hitl.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/hitl.js')>('../../core/hitl.js');
      return {
        ...actual,
        replayPendingHitlRequests,
      };
    });

    const resumePendingToolCallsForChat = vi.fn().mockResolvedValue(0);
    vi.doMock('../../core/events/memory-manager.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/events/memory-manager.js')>('../../core/events/memory-manager.js');
      return {
        ...actual,
        resumePendingToolCallsForChat,
      };
    });

    const publishMessageWithId = vi.fn();
    vi.doMock('../../core/events/index.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/events/index.js')>('../../core/events/index.js');
      return {
        ...actual,
        publishMessageWithId,
      };
    });

    const managers = await import('../../core/managers.js');
    const restored = await managers.restoreChat('world-1', 'chat-2');
    expect(restored).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('q-stale', 'queued');
    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('q-stale', 'sending');
    expect(publishMessageWithId).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'world-1' }),
      'stale sending',
      'human',
      'q-stale',
      'chat-2'
    );
  });

  it('does not reset sending rows during direct ingress queue trigger', async () => {
    vi.resetModules();

    const persistedWorld = createPersistedWorld('chat-2');

    const storageWrappers = {
      recoverSendingMessages: vi.fn().mockResolvedValue(0),
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
      listWorlds: vi.fn().mockResolvedValue([persistedWorld]),
      listAgents: vi.fn().mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] },
      ]),
      addQueuedMessage: vi.fn().mockResolvedValue(undefined),
      getQueuedMessages: vi.fn()
        .mockResolvedValueOnce([
          { messageId: 'q-sending', chatId: 'chat-2', content: 'already sending', sender: 'human', status: 'sending' as const, retryCount: 0, createdAt: new Date(), updatedAt: new Date() },
          { messageId: 'q-new', chatId: 'chat-2', content: 'new queued', sender: 'human', status: 'queued' as const, retryCount: 0, createdAt: new Date(), updatedAt: new Date() },
        ])
        .mockResolvedValueOnce([
          { messageId: 'q-sending', chatId: 'chat-2', content: 'already sending', sender: 'human', status: 'sending' as const, retryCount: 0, createdAt: new Date(), updatedAt: new Date() },
          { messageId: 'q-new', chatId: 'chat-2', content: 'new queued', sender: 'human', status: 'queued' as const, retryCount: 0, createdAt: new Date(), updatedAt: new Date() },
        ]),
      updateMessageQueueStatus: vi.fn().mockResolvedValue(undefined),
      incrementQueueMessageRetry: vi.fn().mockResolvedValue(1),
      removeQueuedMessage: vi.fn().mockResolvedValue(undefined),
    };

    mockStorageFactory(storageWrappers);

    const publishMessageWithId = vi.fn();
    vi.doMock('../../core/events/index.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/events/index.js')>('../../core/events/index.js');
      return {
        ...actual,
        publishMessageWithId,
      };
    });

    const managers = await import('../../core/managers.js');
    await managers.addToQueue('world-1', 'chat-2', 'new queued', 'human', {
      preassignedMessageId: 'q-new',
      targetWorld: {
        id: 'world-1',
        currentChatId: 'chat-2',
        eventEmitter: { on: vi.fn(), removeListener: vi.fn() },
        agents: new Map([['agent-1', { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] }]]),
      } as any,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.updateMessageQueueStatus).not.toHaveBeenCalledWith('q-sending', 'queued');
    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('q-new', 'sending');
    expect(publishMessageWithId).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'world-1' }),
      'new queued',
      'human',
      'q-new',
      'chat-2'
    );
  });

  it('uses active subscribed world when resuming chat queue', async () => {
    vi.resetModules();

    const persistedWorld = createPersistedWorld('chat-2');

    const subscribedWorld = {
      id: 'world-1',
      currentChatId: 'chat-2',
      eventEmitter: new EventEmitter(),
      agents: new Map([['agent-1', { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] }]]),
    } as any;

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
      listWorlds: vi.fn().mockResolvedValue([persistedWorld]),
      listAgents: vi.fn().mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] },
      ]),
      addQueuedMessage: vi.fn().mockResolvedValue(undefined),
      getQueuedMessages: vi.fn().mockResolvedValue([
        { messageId: 'q-1', chatId: 'chat-2', content: 'resume me', sender: 'human', status: 'queued' as const, retryCount: 0, createdAt: new Date(), updatedAt: new Date() },
      ]),
      updateMessageQueueStatus: vi.fn().mockResolvedValue(undefined),
      incrementQueueMessageRetry: vi.fn().mockResolvedValue(1),
      removeQueuedMessage: vi.fn().mockResolvedValue(undefined),
    };

    mockStorageFactory(storageWrappers);

    vi.doMock('../../core/subscription.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/subscription.js')>('../../core/subscription.js');
      return {
        ...actual,
        getActiveSubscribedWorld: vi.fn(() => subscribedWorld),
      };
    });

    const publishMessageWithId = vi.fn();
    vi.doMock('../../core/events/index.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/events/index.js')>('../../core/events/index.js');
      return {
        ...actual,
        publishMessageWithId,
      };
    });

    const managers = await import('../../core/managers.js');
    await managers.resumeChatQueue('world-1', 'chat-2');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('q-1', 'sending');
    expect(publishMessageWithId).toHaveBeenCalledWith(
      subscribedWorld,
      'resume me',
      'human',
      'q-1',
      'chat-2'
    );
  });

  it('uses active subscribed runtime world for restore-triggered queue resume in already-current chat', async () => {
    vi.resetModules();

    const persistedWorld = createPersistedWorld('chat-2');

    const runtimeWorld = {
      id: 'world-1',
      currentChatId: 'chat-2',
      eventEmitter: new EventEmitter(),
      chats: new Map([['chat-2', { id: 'chat-2', name: 'Chat 2', messageCount: 0 }]]),
      agents: new Map([['agent-1', { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] }]]),
    } as any;

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
      listWorlds: vi.fn().mockResolvedValue([persistedWorld]),
      listAgents: vi.fn().mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] },
      ]),
      listChats: vi.fn().mockResolvedValue([{ id: 'chat-2', name: 'Chat 2', messageCount: 0 }]),
      getMemory: vi.fn().mockResolvedValue([]),
      addQueuedMessage: vi.fn().mockResolvedValue(undefined),
      getQueuedMessages: vi.fn().mockResolvedValue([
        { messageId: 'q-runtime-1', chatId: 'chat-2', content: 'from runtime', sender: 'human', status: 'queued' as const, retryCount: 0, createdAt: new Date(), updatedAt: new Date() },
      ]),
      updateMessageQueueStatus: vi.fn().mockResolvedValue(undefined),
      incrementQueueMessageRetry: vi.fn().mockResolvedValue(1),
      removeQueuedMessage: vi.fn().mockResolvedValue(undefined),
      saveWorld: vi.fn().mockResolvedValue(undefined),
    };

    mockStorageFactory(storageWrappers);

    vi.doMock('../../core/subscription.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/subscription.js')>('../../core/subscription.js');
      return {
        ...actual,
        getActiveSubscribedWorld: vi.fn(() => runtimeWorld),
      };
    });

    const replayPendingHitlRequests = vi.fn().mockReturnValue(0);
    vi.doMock('../../core/hitl.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/hitl.js')>('../../core/hitl.js');
      return {
        ...actual,
        replayPendingHitlRequests,
      };
    });

    const resumePendingToolCallsForChat = vi.fn().mockResolvedValue(0);
    vi.doMock('../../core/events/memory-manager.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/events/memory-manager.js')>('../../core/events/memory-manager.js');
      return {
        ...actual,
        resumePendingToolCallsForChat,
      };
    });

    const publishMessageWithId = vi.fn();
    vi.doMock('../../core/events/index.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/events/index.js')>('../../core/events/index.js');
      return {
        ...actual,
        publishMessageWithId,
      };
    });

    const managers = await import('../../core/managers.js');
    const restored = await managers.restoreChat('world-1', 'chat-2');
    expect(restored).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('q-runtime-1', 'sending');
    expect(publishMessageWithId).toHaveBeenCalledWith(
      runtimeWorld,
      'from runtime',
      'human',
      'q-runtime-1',
      'chat-2'
    );
  });
});

interface MatrixQueuedMessage {
  messageId: string;
  chatId: string;
  content: string;
  sender: string;
  status: 'queued' | 'sending' | 'error' | 'cancelled';
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

type MatrixQueuesByChat = Record<string, MatrixQueuedMessage[]>;

function createMatrixQueueMessage(
  messageId: string,
  chatId: string,
  status: MatrixQueuedMessage['status'],
  content = messageId,
): MatrixQueuedMessage {
  const now = new Date();
  return {
    messageId,
    chatId,
    content,
    sender: 'human',
    status,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

async function setupQueueManagersForMatrix(options?: {
  currentChatId?: string;
  queuesByChat?: MatrixQueuesByChat;
  activeProcessingChatIds?: string[];
  includeQueueStorageOps?: boolean;
  includeResetForRetry?: boolean;
  worldExists?: boolean;
  runtimeWorldsByChat?: Record<string, any>;
  runtimeAgents?: Array<{ id: string; name: string; type: string; provider: any; model: string; llmCallCount: number; autoReply?: boolean; status?: 'active' | 'inactive' | 'error'; memory?: any[] }>;
}) {
  vi.resetModules();
  const runtimeAgents = options?.runtimeAgents ?? [
    {
      id: 'agent-default',
      name: 'Agent Default',
      type: 'assistant',
      provider: 'openai',
      model: 'gpt-4o-mini',
      llmCallCount: 0,
      autoReply: true,
      status: 'active' as const,
      memory: [],
    },
  ];

  const currentChatId = options?.currentChatId ?? 'chat-a';
  const persistedWorld = options?.worldExists === false
    ? null
    : {
      id: 'world-1',
      name: 'World 1',
      turnLimit: 5,
      currentChatId,
      createdAt: new Date(),
      lastUpdated: new Date(),
    };

  const chats = [
    { id: 'chat-a', name: 'Chat A', messageCount: 0 },
    { id: 'chat-b', name: 'Chat B', messageCount: 0 },
    { id: 'chat-new', name: 'New Chat', messageCount: 0 },
    { id: 'chat-existing', name: 'Existing Chat', messageCount: 0 },
  ];

  const queuesByChat: MatrixQueuesByChat = {
    'chat-a': [],
    'chat-b': [],
    'chat-new': [],
    'chat-existing': [],
    ...(options?.queuesByChat || {}),
  };

  const storageWrappers: Record<string, any> = {
    recoverSendingMessages: vi.fn().mockResolvedValue(0),
    loadWorld: vi.fn().mockResolvedValue(persistedWorld),
    listWorlds: vi.fn().mockResolvedValue(persistedWorld ? [persistedWorld] : []),
    listAgents: vi.fn().mockResolvedValue(runtimeAgents),
    listChats: vi.fn().mockResolvedValue(chats),
    loadChatData: vi.fn().mockImplementation(async (_worldId: string, chatId: string) => {
      return chats.find((chat) => chat.id === chatId) ?? null;
    }),
    getMemory: vi.fn().mockResolvedValue([]),
    saveWorld: vi.fn().mockImplementation(async (nextWorld: { currentChatId?: string }) => {
      if (persistedWorld && nextWorld.currentChatId) {
        persistedWorld.currentChatId = nextWorld.currentChatId;
      }
    }),
  };

  if (options?.includeQueueStorageOps !== false) {
    storageWrappers.addQueuedMessage = vi.fn().mockImplementation(async (_worldId: string, chatId: string, messageId: string, content: string, sender: string) => {
      const row = createMatrixQueueMessage(messageId, chatId, 'queued', content);
      row.sender = sender;
      queuesByChat[chatId] = [...(queuesByChat[chatId] || []), row];
    });

    storageWrappers.getQueuedMessages = vi.fn().mockImplementation(async (_worldId: string, chatId: string) => {
      return [...(queuesByChat[chatId] || [])];
    });

    storageWrappers.updateMessageQueueStatus = vi.fn().mockImplementation(async (messageId: string, status: MatrixQueuedMessage['status']) => {
      Object.keys(queuesByChat).forEach((chatId) => {
        queuesByChat[chatId] = (queuesByChat[chatId] || []).map((row) =>
          row.messageId === messageId
            ? { ...row, status, updatedAt: new Date() }
            : row,
        );
      });
    });

    storageWrappers.incrementQueueMessageRetry = vi.fn().mockResolvedValue(1);
    storageWrappers.removeQueuedMessage = vi.fn().mockImplementation(async (messageId: string) => {
      Object.keys(queuesByChat).forEach((chatId) => {
        queuesByChat[chatId] = (queuesByChat[chatId] || []).filter((row) => row.messageId !== messageId);
      });
    });
    storageWrappers.cancelQueuedMessages = vi.fn().mockResolvedValue(0);
    storageWrappers.deleteQueueForChat = vi.fn().mockImplementation(async (_worldId: string, chatId: string) => {
      const count = (queuesByChat[chatId] || []).length;
      queuesByChat[chatId] = [];
      return count;
    });
  }

  if (options?.includeResetForRetry) {
    storageWrappers.resetQueueMessageForRetry = vi.fn().mockResolvedValue(undefined);
  }

  const activeSet = new Set(options?.activeProcessingChatIds || []);

  mockStorageFactory(storageWrappers);

  vi.doMock('../../core/hitl.js', async () => {
    const actual = await vi.importActual<typeof import('../../core/hitl.js')>('../../core/hitl.js');
    return {
      ...actual,
      replayPendingHitlRequests: vi.fn().mockReturnValue(0),
      listPendingHitlPromptEvents: vi.fn().mockReturnValue([]),
      listPendingHitlPromptEventsFromMessages: vi.fn().mockReturnValue([]),
      clearPendingHitlRequestsForChat: vi.fn(),
    };
  });

  vi.doMock('../../core/events/memory-manager.js', async () => {
    const actual = await vi.importActual<typeof import('../../core/events/memory-manager.js')>('../../core/events/memory-manager.js');
    return {
      ...actual,
      resumePendingToolCallsForChat: vi.fn().mockResolvedValue(0),
    };
  });

  vi.doMock('../../core/message-processing-control.js', async () => {
    const actual = await vi.importActual<typeof import('../../core/message-processing-control.js')>('../../core/message-processing-control.js');
    return {
      ...actual,
      hasActiveChatMessageProcessing: vi.fn((worldId: string, chatId: string) => worldId === 'world-1' && activeSet.has(chatId)),
      stopMessageProcessing: vi.fn(),
    };
  });

  const publishMessageWithId = vi.fn();
  const publishMessage = vi.fn();
  const publishEvent = vi.fn();
  vi.doMock('../../core/events/index.js', async () => {
    const actual = await vi.importActual<typeof import('../../core/events/index.js')>('../../core/events/index.js');
    return {
      ...actual,
      publishEvent,
      publishMessageWithId,
      publishMessage,
    };
  });

  const runtimeWorld = {
    id: 'world-1',
    currentChatId,
    eventEmitter: new EventEmitter(),
    chats: new Map([
      ['chat-a', { id: 'chat-a', name: 'Chat A', messageCount: 0 }],
      ['chat-b', { id: 'chat-b', name: 'Chat B', messageCount: 0 }],
      ['chat-new', { id: 'chat-new', name: 'New Chat', messageCount: 0 }],
      ['chat-existing', { id: 'chat-existing', name: 'Existing Chat', messageCount: 0 }],
    ]),
    agents: new Map(runtimeAgents.map((agent) => [agent.id, agent])),
  } as any;

  const runtimeWorldsByChat = options?.runtimeWorldsByChat || {};
  const getActiveSubscribedWorld = vi.fn((_worldId: string, preferredChatId?: string | null) => {
    if (options?.worldExists === false) return null;
    const chatKey = String(preferredChatId || '').trim();
    if (chatKey && runtimeWorldsByChat[chatKey]) {
      return runtimeWorldsByChat[chatKey];
    }
    return runtimeWorld;
  });

  vi.doMock('../../core/subscription.js', async () => {
    const actual = await vi.importActual<typeof import('../../core/subscription.js')>('../../core/subscription.js');
    return {
      ...actual,
      getActiveSubscribedWorld,
    };
  });

  const managers = await import('../../core/managers.js');

  return {
    managers,
    storageWrappers,
    publishMessageWithId,
    publishMessage,
    publishEvent,
    runtimeWorld,
    getActiveSubscribedWorld,
    queuesByChat,
  };
}

describe('restoreChat queue matrix (consolidated)', () => {
  const lifecycleContexts = [
    { name: 'open world -> new chat', chatId: 'chat-new' },
    { name: 'open world -> existing chat', chatId: 'chat-existing' },
  ];

  it.each(lifecycleContexts)('Q0 empty queue: %s', async ({ chatId }) => {
    const { managers, storageWrappers, publishMessageWithId } = await setupQueueManagersForMatrix();

    await managers.resumeChatQueue('world-1', chatId);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.updateMessageQueueStatus).not.toHaveBeenCalled();
    expect(publishMessageWithId).not.toHaveBeenCalled();
  });

  it.each(lifecycleContexts)('Q1 pending queued messages dispatch first only: %s', async ({ chatId }) => {
    const { managers, storageWrappers, publishMessageWithId } = await setupQueueManagersForMatrix({
      queuesByChat: {
        [chatId]: [
          createMatrixQueueMessage(`${chatId}-q1`, chatId, 'queued', 'm1'),
          createMatrixQueueMessage(`${chatId}-q2`, chatId, 'queued', 'm2'),
          createMatrixQueueMessage(`${chatId}-q3`, chatId, 'queued', 'm3'),
          createMatrixQueueMessage(`${chatId}-q4`, chatId, 'queued', 'm4'),
          createMatrixQueueMessage(`${chatId}-q5`, chatId, 'queued', 'm5'),
        ],
      },
    });

    await managers.resumeChatQueue('world-1', chatId);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith(`${chatId}-q1`, 'sending');
    expect(publishMessageWithId).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'world-1' }),
      'm1',
      'human',
      `${chatId}-q1`,
      chatId,
    );
  });

  it.each(lifecycleContexts)('Q2 sending active blocks additional dispatch: %s', async ({ chatId }) => {
    const { managers, storageWrappers, publishMessageWithId } = await setupQueueManagersForMatrix({
      activeProcessingChatIds: [chatId],
      queuesByChat: {
        [chatId]: [
          createMatrixQueueMessage(`${chatId}-sending`, chatId, 'sending', 'already sending'),
          createMatrixQueueMessage(`${chatId}-behind`, chatId, 'queued', 'queued behind'),
        ],
      },
    });

    await managers.resumeChatQueue('world-1', chatId);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.updateMessageQueueStatus).not.toHaveBeenCalled();
    expect(publishMessageWithId).not.toHaveBeenCalled();
  });

  it.each(lifecycleContexts)('Q3 stalled sending is recovered then re-dispatched: %s', async ({ chatId }) => {
    const stalledId = `${chatId}-stalled`;
    const { managers, storageWrappers, publishMessageWithId } = await setupQueueManagersForMatrix({
      queuesByChat: {
        [chatId]: [
          createMatrixQueueMessage(stalledId, chatId, 'sending', 'stalled message'),
          createMatrixQueueMessage(`${chatId}-queued-next`, chatId, 'queued', 'next message'),
        ],
      },
    });

    await managers.resumeChatQueue('world-1', chatId);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith(stalledId, 'queued');
    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith(stalledId, 'sending');
    expect(publishMessageWithId).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'world-1' }),
      'stalled message',
      'human',
      stalledId,
      chatId,
    );
  });

  it.each(lifecycleContexts)('Q4-Q6 clean queue removes rows regardless of Q1/Q2/Q3: %s', async ({ chatId }) => {
    const { managers, storageWrappers, queuesByChat } = await setupQueueManagersForMatrix({
      queuesByChat: {
        [chatId]: [
          createMatrixQueueMessage(`${chatId}-q`, chatId, 'queued'),
          createMatrixQueueMessage(`${chatId}-s`, chatId, 'sending'),
          createMatrixQueueMessage(`${chatId}-e`, chatId, 'error'),
        ],
      },
    });

    await managers.clearChatQueue('world-1', chatId);

    expect(storageWrappers.deleteQueueForChat).toHaveBeenCalledWith('world-1', chatId);
    expect(queuesByChat[chatId]).toHaveLength(0);
  });

  it('Q0 switch A->B when both queues are empty', async () => {
    const { managers, storageWrappers, publishMessageWithId } = await setupQueueManagersForMatrix({ currentChatId: 'chat-a' });

    const restored = await managers.restoreChat('world-1', 'chat-b');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(restored?.currentChatId).toBe('chat-b');
    expect(storageWrappers.updateMessageQueueStatus).not.toHaveBeenCalled();
    expect(publishMessageWithId).not.toHaveBeenCalled();
  });

  it('Q1 switch away while A has pending queued and restore later preserves order', async () => {
    const { managers, storageWrappers } = await setupQueueManagersForMatrix({
      currentChatId: 'chat-a',
      queuesByChat: {
        'chat-a': [
          createMatrixQueueMessage('a-1', 'chat-a', 'queued', 'A1'),
          createMatrixQueueMessage('a-2', 'chat-a', 'queued', 'A2'),
        ],
      },
    });

    await managers.restoreChat('world-1', 'chat-b');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await managers.restoreChat('world-1', 'chat-a');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('a-1', 'sending');
    expect(storageWrappers.updateMessageQueueStatus).not.toHaveBeenCalledWith('a-2', 'sending');
  });

  it('Q2 switch away while A has sending does not bleed into B dispatch', async () => {
    const { managers, storageWrappers, publishMessageWithId } = await setupQueueManagersForMatrix({
      currentChatId: 'chat-a',
      queuesByChat: {
        'chat-a': [createMatrixQueueMessage('a-sending', 'chat-a', 'sending', 'A sending')],
        'chat-b': [createMatrixQueueMessage('b-1', 'chat-b', 'queued', 'B queued')],
      },
    });

    await managers.restoreChat('world-1', 'chat-b');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('b-1', 'sending');
    expect(storageWrappers.updateMessageQueueStatus).not.toHaveBeenCalledWith('a-sending', 'sending');
    expect(publishMessageWithId).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'world-1' }),
      'B queued',
      'human',
      'b-1',
      'chat-b',
    );
  });

  it('Q3 switch away while A is stalled and returning recovers stalled state', async () => {
    const { managers, storageWrappers } = await setupQueueManagersForMatrix({
      currentChatId: 'chat-a',
      queuesByChat: {
        'chat-a': [
          createMatrixQueueMessage('a-stalled', 'chat-a', 'sending', 'A stalled'),
          createMatrixQueueMessage('a-next', 'chat-a', 'queued', 'A next'),
        ],
      },
    });

    await managers.restoreChat('world-1', 'chat-b');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await managers.restoreChat('world-1', 'chat-a');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('a-stalled', 'queued');
    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('a-stalled', 'sending');
  });

  it('Q4 switch to B and enqueue while A is sending remains chat-isolated without runtime current-chat mutation', async () => {
    const { managers, storageWrappers, publishMessageWithId } = await setupQueueManagersForMatrix({
      currentChatId: 'chat-a',
      queuesByChat: {
        'chat-a': [createMatrixQueueMessage('a-sending', 'chat-a', 'sending', 'A sending')],
      },
    });

    await managers.restoreChat('world-1', 'chat-b');
    await managers.addToQueue('world-1', 'chat-b', 'B fresh', 'human', {
      preassignedMessageId: 'b-fresh',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('b-fresh', 'sending');
    expect(storageWrappers.updateMessageQueueStatus).not.toHaveBeenCalledWith('a-sending', 'sending');
    expect(publishMessageWithId).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'world-1' }),
      'B fresh',
      'human',
      'b-fresh',
      'chat-b',
    );
  });

  it.each([
    { label: 'Q5 clean A from B while A has queued', state: 'queued' as const },
    { label: 'Q6 clean A from B while A has sending', state: 'sending' as const },
    { label: 'Q7 clean A from B while A is stalled', state: 'sending' as const },
  ])('$label', async ({ state }) => {
    const { managers, storageWrappers } = await setupQueueManagersForMatrix({
      currentChatId: 'chat-a',
      queuesByChat: {
        'chat-a': [createMatrixQueueMessage('a-target', 'chat-a', state, `A ${state}`)],
      },
    });

    await managers.restoreChat('world-1', 'chat-b');
    await managers.clearChatQueue('world-1', 'chat-a');

    expect(storageWrappers.deleteQueueForChat).toHaveBeenCalledWith('world-1', 'chat-a');
  });
});

describe('managers queue branch coverage', () => {
  it('throws when enqueueAndProcessUserTurn is called without chatId', async () => {
    const { managers } = await setupQueueManagersForMatrix();
    await expect(
      managers.enqueueAndProcessUserTurn('world-1', '', 'hello', 'human')
    ).rejects.toThrow('chatId is required');
  });

  it('uses immediate publishMessage for non-user sender without preassigned message id', async () => {
    const { managers, publishMessage, publishMessageWithId, runtimeWorld } = await setupQueueManagersForMatrix();
    await managers.recoverQueueSendingMessages();
    await managers.dispatchImmediateChatMessage('world-1', 'chat-a', 'system note', 'system', runtimeWorld);

    expect(publishMessage).toHaveBeenCalledWith(runtimeWorld, 'system note', 'system', 'chat-a');
    expect(publishMessageWithId).not.toHaveBeenCalled();
  });

  it('throws when non-user immediate dispatch cannot resolve runtime world', async () => {
    const { managers } = await setupQueueManagersForMatrix({ worldExists: false });
    await managers.recoverQueueSendingMessages();
    await expect(
      managers.dispatchImmediateChatMessage('world-1', 'chat-a', 'system note', 'system', null)
    ).rejects.toThrow('world not found for immediate dispatch');
  });

  it('uses chat-specific subscribed runtime world for queue dispatch without targetWorld', async () => {
    const chatARuntimeWorld = {
      id: 'world-1',
      currentChatId: 'chat-a',
      eventEmitter: new EventEmitter(),
      chats: new Map([['chat-a', { id: 'chat-a', name: 'Chat A', messageCount: 0 }]]),
      agents: new Map([['agent-default', { id: 'agent-default', name: 'Agent Default', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] }]]),
    } as any;
    const chatBRuntimeWorld = {
      id: 'world-1',
      currentChatId: 'chat-b',
      eventEmitter: new EventEmitter(),
      chats: new Map([['chat-b', { id: 'chat-b', name: 'Chat B', messageCount: 0 }]]),
      agents: new Map([['agent-default', { id: 'agent-default', name: 'Agent Default', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] }]]),
    } as any;

    const { managers, publishMessageWithId, getActiveSubscribedWorld } = await setupQueueManagersForMatrix({
      runtimeWorldsByChat: {
        'chat-a': chatARuntimeWorld,
        'chat-b': chatBRuntimeWorld,
      },
    });

    await managers.addToQueue('world-1', 'chat-b', 'hello chat b', 'human', {
      preassignedMessageId: 'q-chat-specific-runtime',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getActiveSubscribedWorld).toHaveBeenCalledWith('world-1', 'chat-b');
    expect(publishMessageWithId).toHaveBeenCalledWith(
      chatBRuntimeWorld,
      'hello chat b',
      'human',
      'q-chat-specific-runtime',
      'chat-b',
    );
  });

  it('marks queue message as error after max retry attempts are reached', async () => {
    vi.resetModules();

    const persistedWorld = createPersistedWorld('chat-1');

    const queueMessage = {
      messageId: 'q-max-retry',
      chatId: 'chat-2',
      content: 'Queued hello',
      sender: 'human',
      status: 'queued' as const,
      retryCount: 2,
      createdAt: new Date('2026-03-01T10:00:00Z'),
      updatedAt: new Date('2026-03-01T10:00:00Z')
    };

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
      listAgents: vi.fn().mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] },
      ]),
      listChats: vi.fn().mockResolvedValue([
        { id: 'chat-1', name: 'Chat 1', messageCount: 0 },
        { id: 'chat-2', name: 'Chat 2', messageCount: 0 },
      ]),
      loadChatData: vi.fn().mockResolvedValue({ id: 'chat-2', name: 'Chat 2', messageCount: 0 }),
      getMemory: vi.fn().mockResolvedValue([]),
      saveWorld: vi.fn().mockResolvedValue(undefined),
      addQueuedMessage: vi.fn().mockResolvedValue(undefined),
      getQueuedMessages: vi.fn().mockResolvedValue([queueMessage]),
      updateMessageQueueStatus: vi.fn().mockResolvedValue(undefined),
      incrementQueueMessageRetry: vi.fn().mockResolvedValue(3),
      removeQueuedMessage: vi.fn().mockResolvedValue(undefined),
    };

    mockStorageFactory(storageWrappers);

    vi.doMock('../../core/hitl.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/hitl.js')>('../../core/hitl.js');
      return {
        ...actual,
        replayPendingHitlRequests: vi.fn().mockReturnValue(0),
      };
    });

    vi.doMock('../../core/events/memory-manager.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/events/memory-manager.js')>('../../core/events/memory-manager.js');
      return {
        ...actual,
        resumePendingToolCallsForChat: vi.fn().mockResolvedValue(0),
      };
    });

    const publishMessageWithId = vi.fn(() => {
      throw new Error('publish failure');
    });

    vi.doMock('../../core/events/index.js', async () => {
      const actual = await vi.importActual<typeof import('../../core/events/index.js')>('../../core/events/index.js');
      return {
        ...actual,
        publishMessageWithId,
      };
    });

    const managers = await import('../../core/managers.js');
    await managers.restoreChat('world-1', 'chat-2');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.incrementQueueMessageRetry).toHaveBeenCalledWith('q-max-retry');
    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('q-max-retry', 'error');
  });

  it('does not auto-retry a failed queue dispatch on a later runtime world', async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();

      const persistedWorld = createPersistedWorld('chat-a');
      const queuedMessageId = 'q-retry-runtime-world';
      const queueState = {
        status: 'queued' as const | 'sending' | 'error',
        retryCount: 0,
      };

      const storageWrappers = {
        recoverSendingMessages: vi.fn().mockResolvedValue(0),
        loadWorld: vi.fn().mockResolvedValue(persistedWorld),
        listWorlds: vi.fn().mockResolvedValue([persistedWorld]),
        listAgents: vi.fn().mockResolvedValue([
          { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] },
        ]),
        listChats: vi.fn().mockResolvedValue([{ id: 'chat-a', name: 'Chat A', messageCount: 0 }]),
        loadChatData: vi.fn().mockResolvedValue({ id: 'chat-a', name: 'Chat A', messageCount: 0 }),
        getMemory: vi.fn().mockResolvedValue([]),
        saveWorld: vi.fn().mockResolvedValue(undefined),
        addQueuedMessage: vi.fn().mockImplementation(async () => {
          queueState.status = 'queued';
          queueState.retryCount = 0;
        }),
        getQueuedMessages: vi.fn().mockImplementation(async () => {
          if (queueState.status === 'error') {
            return [];
          }
          return [{
            messageId: queuedMessageId,
            chatId: 'chat-a',
            content: 'retry me',
            sender: 'human',
            status: queueState.status,
            retryCount: queueState.retryCount,
            createdAt: new Date(),
            updatedAt: new Date(),
          }];
        }),
        updateMessageQueueStatus: vi.fn().mockImplementation(async (_messageId: string, status: 'queued' | 'sending' | 'error') => {
          queueState.status = status;
        }),
        incrementQueueMessageRetry: vi.fn().mockImplementation(async () => {
          queueState.retryCount += 1;
          return queueState.retryCount;
        }),
        removeQueuedMessage: vi.fn().mockResolvedValue(undefined),
      };

      mockStorageFactory(storageWrappers);

      vi.doMock('../../core/hitl.js', async () => {
        const actual = await vi.importActual<typeof import('../../core/hitl.js')>('../../core/hitl.js');
        return {
          ...actual,
          replayPendingHitlRequests: vi.fn().mockReturnValue(0),
        };
      });

      vi.doMock('../../core/events/memory-manager.js', async () => {
        const actual = await vi.importActual<typeof import('../../core/events/memory-manager.js')>('../../core/events/memory-manager.js');
        return {
          ...actual,
          resumePendingToolCallsForChat: vi.fn().mockResolvedValue(0),
        };
      });

      const staleWorld = {
        id: 'world-1',
        currentChatId: 'chat-a',
        eventEmitter: new EventEmitter(),
        agents: new Map([['agent-1', { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] }]]),
      } as any;
      const freshWorld = {
        id: 'world-1',
        currentChatId: 'chat-a',
        eventEmitter: new EventEmitter(),
        agents: new Map([['agent-1', { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] }]]),
      } as any;
      const staleEmitSpy = vi.spyOn(staleWorld.eventEmitter, 'emit');
      const freshEmitSpy = vi.spyOn(freshWorld.eventEmitter, 'emit');

      const getActiveSubscribedWorld = vi
        .fn()
        .mockImplementationOnce(() => null)
        .mockImplementation(() => freshWorld);

      vi.doMock('../../core/subscription.js', async () => {
        const actual = await vi.importActual<typeof import('../../core/subscription.js')>('../../core/subscription.js');
        return {
          ...actual,
          getActiveSubscribedWorld,
        };
      });

      const publishMessageWithId = vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('first publish failed');
        })
        .mockImplementation(() => undefined);

      vi.doMock('../../core/events/index.js', async () => {
        const actual = await vi.importActual<typeof import('../../core/events/index.js')>('../../core/events/index.js');
        return {
          ...actual,
          publishMessageWithId,
        };
      });

      const managers = await import('../../core/managers.js');

      await managers.addToQueue('world-1', 'chat-a', 'retry me', 'human', {
        preassignedMessageId: queuedMessageId,
        targetWorld: staleWorld,
      });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(0);

      expect(publishMessageWithId).toHaveBeenNthCalledWith(
        1,
        staleWorld,
        'retry me',
        'human',
        queuedMessageId,
        'chat-a',
      );
      expect(publishMessageWithId).toHaveBeenCalledTimes(1);
      expect(storageWrappers.incrementQueueMessageRetry).toHaveBeenCalledWith(queuedMessageId);
      expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith(queuedMessageId, 'error');
      expect(getActiveSubscribedWorld).toHaveBeenCalledTimes(1);
      expect(freshEmitSpy).not.toHaveBeenCalledWith(
        'system',
        expect.anything(),
      );
      expect(staleEmitSpy).not.toHaveBeenCalledWith(
        'system',
        expect.objectContaining({
          chatId: 'chat-a',
          content: expect.stringContaining('attempt 1/3'),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not schedule exponential backoff retry after a queue dispatch failure', async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();

      const persistedWorld = createPersistedWorld('chat-a');
      const queuedMessageId = 'q-retry-backoff';
      const queueState = {
        status: 'queued' as const | 'sending' | 'error',
        retryCount: 1,
      };

      const storageWrappers = {
        recoverSendingMessages: vi.fn().mockResolvedValue(0),
        loadWorld: vi.fn().mockResolvedValue(persistedWorld),
        listWorlds: vi.fn().mockResolvedValue([persistedWorld]),
        listAgents: vi.fn().mockResolvedValue([
          { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] },
        ]),
        listChats: vi.fn().mockResolvedValue([{ id: 'chat-a', name: 'Chat A', messageCount: 0 }]),
        loadChatData: vi.fn().mockResolvedValue({ id: 'chat-a', name: 'Chat A', messageCount: 0 }),
        getMemory: vi.fn().mockResolvedValue([]),
        saveWorld: vi.fn().mockResolvedValue(undefined),
        addQueuedMessage: vi.fn().mockResolvedValue(undefined),
        getQueuedMessages: vi.fn().mockImplementation(async () => {
          if (queueState.status === 'error') return [];
          return [{
            messageId: queuedMessageId,
            chatId: 'chat-a',
            content: 'retry with backoff',
            sender: 'human',
            status: queueState.status,
            retryCount: queueState.retryCount,
            createdAt: new Date(),
            updatedAt: new Date(),
          }];
        }),
        updateMessageQueueStatus: vi.fn().mockImplementation(async (_messageId: string, status: 'queued' | 'sending' | 'error') => {
          queueState.status = status;
        }),
        incrementQueueMessageRetry: vi.fn().mockImplementation(async () => {
          queueState.retryCount += 1;
          return queueState.retryCount;
        }),
        removeQueuedMessage: vi.fn().mockResolvedValue(undefined),
      };

      mockStorageFactory(storageWrappers);

      vi.doMock('../../core/hitl.js', async () => {
        const actual = await vi.importActual<typeof import('../../core/hitl.js')>('../../core/hitl.js');
        return {
          ...actual,
          replayPendingHitlRequests: vi.fn().mockReturnValue(0),
        };
      });

      vi.doMock('../../core/events/memory-manager.js', async () => {
        const actual = await vi.importActual<typeof import('../../core/events/memory-manager.js')>('../../core/events/memory-manager.js');
        return {
          ...actual,
          resumePendingToolCallsForChat: vi.fn().mockResolvedValue(0),
        };
      });

      const runtimeWorld = {
        id: 'world-1',
        currentChatId: 'chat-a',
        eventEmitter: new EventEmitter(),
        agents: new Map([['agent-1', { id: 'agent-1', name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0, autoReply: true, status: 'active', memory: [] }]]),
      } as any;
      const getActiveSubscribedWorld = vi.fn(() => runtimeWorld);

      vi.doMock('../../core/subscription.js', async () => {
        const actual = await vi.importActual<typeof import('../../core/subscription.js')>('../../core/subscription.js');
        return {
          ...actual,
          getActiveSubscribedWorld,
        };
      });

      const publishMessageWithId = vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('first publish failed');
        })
        .mockImplementation(() => undefined);

      vi.doMock('../../core/events/index.js', async () => {
        const actual = await vi.importActual<typeof import('../../core/events/index.js')>('../../core/events/index.js');
        return {
          ...actual,
          publishMessageWithId,
        };
      });

      const managers = await import('../../core/managers.js');
      await managers.resumeChatQueue('world-1', 'chat-a');
      await vi.advanceTimersByTimeAsync(0);

      expect(publishMessageWithId).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(0);
      expect(publishMessageWithId).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(0);
      expect(publishMessageWithId).toHaveBeenCalledTimes(1);
      expect(storageWrappers.incrementQueueMessageRetry).toHaveBeenCalledWith(queuedMessageId);
      expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith(queuedMessageId, 'error');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps queue paused after stopChatQueue until explicit resume', async () => {
    const { managers, storageWrappers } = await setupQueueManagersForMatrix({
      currentChatId: 'chat-a',
    });

    await managers.stopChatQueue('world-1', 'chat-a');
    await managers.addToQueue('world-1', 'chat-a', 'paused message', 'human', {
      preassignedMessageId: 'paused-q',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.cancelQueuedMessages).toHaveBeenCalledWith('world-1', 'chat-a');
    expect(storageWrappers.updateMessageQueueStatus).not.toHaveBeenCalledWith('paused-q', 'sending');

    await managers.resumeChatQueue('world-1', 'chat-a');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('paused-q', 'sending');
  });

  it('returns empty queue list when queue storage methods are unavailable', async () => {
    const { managers } = await setupQueueManagersForMatrix({ includeQueueStorageOps: false });
    const result = await managers.getQueueMessages('world-1', 'chat-a');
    expect(result).toEqual([]);
  });

  it('retryQueueMessage no-ops when retry reset capability is unavailable', async () => {
    const { managers, publishMessageWithId } = await setupQueueManagersForMatrix({ includeResetForRetry: false });
    await expect(managers.retryQueueMessage('world-1', 'q-1', 'chat-a')).resolves.toBeUndefined();
    expect(publishMessageWithId).not.toHaveBeenCalled();
  });

  it('retryQueueMessage no-ops after reset when runtime world is unavailable', async () => {
    const { managers, storageWrappers } = await setupQueueManagersForMatrix({
      includeResetForRetry: true,
      worldExists: false,
    });

    await expect(managers.retryQueueMessage('world-1', 'q-1', 'chat-a')).resolves.toBeUndefined();
    expect(storageWrappers.resetQueueMessageForRetry).toHaveBeenCalledWith('q-1');
  });

  it('fails closed when queue storage operations are unavailable for enqueue', async () => {
    const { managers } = await setupQueueManagersForMatrix({ includeQueueStorageOps: false });
    await expect(
      managers.addToQueue('world-1', 'chat-a', 'hello', 'human', {
        preassignedMessageId: 'q-missing-storage',
      })
    ).rejects.toThrow('queue storage backend missing required operations');
  });

  it('routes preflight no-responder failures to explicit recovery error state after one refresh attempt', async () => {
    const { managers, storageWrappers, publishEvent, publishMessageWithId } = await setupQueueManagersForMatrix({
      currentChatId: 'chat-a',
      runtimeAgents: [],
    });

    storageWrappers.listAgents.mockResolvedValue([]);

    await managers.addToQueue('world-1', 'chat-a', 'no responder', 'human', {
      preassignedMessageId: 'q-no-responder-preflight',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.listAgents).toHaveBeenCalledWith('world-1');
    expect(storageWrappers.incrementQueueMessageRetry).toHaveBeenCalledWith('q-no-responder-preflight');
    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('q-no-responder-preflight', 'error');
    expect(publishMessageWithId).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'q-no-responder-preflight',
      expect.anything(),
    );
    expect(publishEvent).toHaveBeenCalledWith(
      expect.anything(),
      'system',
      expect.objectContaining({
        message: 'Queue failed to dispatch user message: this world has no agents available.',
        failureKind: 'queue-dispatch',
      }),
      'chat-a',
    );
  });

  it('names the missing mentioned agent in no-responder queue failures', async () => {
    const mentionedAgentRuntimeRow = {
      id: 'gemini',
      name: 'Gemini',
      type: 'assistant',
      provider: 'google',
      model: 'gemini-2.5-flash',
      llmCallCount: 0,
      autoReply: false,
      status: 'inactive' as const,
      memory: [],
    };
    const { managers, storageWrappers, publishEvent, publishMessageWithId } = await setupQueueManagersForMatrix({
      currentChatId: 'chat-a',
      runtimeAgents: [mentionedAgentRuntimeRow],
    });

    storageWrappers.listAgents.mockResolvedValue([mentionedAgentRuntimeRow]);

    await managers.addToQueue('world-1', 'chat-a', '@composer install the skill-installer locally', 'human', {
      preassignedMessageId: 'q-missing-mentioned-agent',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.incrementQueueMessageRetry).toHaveBeenCalledWith('q-missing-mentioned-agent');
    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('q-missing-mentioned-agent', 'error');
    expect(publishMessageWithId).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'q-missing-mentioned-agent',
      expect.anything(),
    );
    expect(publishEvent).toHaveBeenCalledWith(
      expect.anything(),
      'system',
      expect.objectContaining({
        message: 'Queue failed to dispatch user message: no agent "@composer" found in this world.',
        failureKind: 'queue-dispatch',
      }),
      'chat-a',
    );
  });

  it('refreshes responders once and proceeds with publish when preflight bootstrap succeeds', async () => {
    const { managers, storageWrappers, publishMessageWithId } = await setupQueueManagersForMatrix({
      currentChatId: 'chat-a',
      runtimeAgents: [],
    });

    storageWrappers.listAgents.mockResolvedValue([
      {
        id: 'agent-bootstrapped',
        name: 'Agent Bootstrapped',
        type: 'assistant',
        provider: 'openai',
        model: 'gpt-4o-mini',
        llmCallCount: 0,
        autoReply: true,
        status: 'active',
        memory: [],
      },
    ]);

    await managers.addToQueue('world-1', 'chat-a', 'bootstrap responders', 'human', {
      preassignedMessageId: 'q-preflight-refresh-ok',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.listAgents).toHaveBeenCalledWith('world-1');
    expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('q-preflight-refresh-ok', 'sending');
    expect(publishMessageWithId).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'world-1' }),
      'bootstrap responders',
      'human',
      'q-preflight-refresh-ok',
      'chat-a',
    );
  });

  it('marks sending row error when processing does not start despite responder presence', async () => {
    vi.useFakeTimers();
    try {
      const { managers, storageWrappers, publishMessageWithId } = await setupQueueManagersForMatrix({
        currentChatId: 'chat-a',
        runtimeAgents: [
          {
            id: 'agent-1',
            name: 'Agent 1',
            type: 'assistant',
            provider: 'openai',
            model: 'gpt-4o-mini',
            llmCallCount: 0,
            autoReply: true,
            status: 'active' as const,
            memory: [],
          },
        ],
      });

      await managers.addToQueue('world-1', 'chat-a', 'has responder', 'human', {
        preassignedMessageId: 'q-has-responder',
      });

      await vi.advanceTimersByTimeAsync(5000);

      expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('q-has-responder', 'sending');
      expect(publishMessageWithId).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'world-1' }),
        'has responder',
        'human',
        'q-has-responder',
        'chat-a',
      );
      expect(storageWrappers.incrementQueueMessageRetry).toHaveBeenCalledWith('q-has-responder');
      expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('q-has-responder', 'error');
      expect(storageWrappers.getQueuedMessages).toHaveBeenCalledWith('world-1', 'chat-a');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not trigger fallback retry after response-start is observed', async () => {
    vi.useFakeTimers();
    try {
      const { managers, storageWrappers, runtimeWorld } = await setupQueueManagersForMatrix({
        currentChatId: 'chat-a',
      });

      await managers.addToQueue('world-1', 'chat-a', 'hello', 'human', {
        preassignedMessageId: 'q-started',
      });
      await vi.advanceTimersByTimeAsync(0);

      runtimeWorld.eventEmitter.emit('world', {
        type: 'response-start',
        chatId: 'chat-a',
        activeChatIds: ['chat-a'],
      });

      await vi.advanceTimersByTimeAsync(5000);

      expect(storageWrappers.incrementQueueMessageRetry).not.toHaveBeenCalledWith('q-started');
      expect(storageWrappers.removeQueuedMessage).not.toHaveBeenCalledWith('q-started');
    } finally {
      vi.useRealTimers();
    }
  });

  it('removes only the tracked in-flight sending row on completion', async () => {
    const { managers, storageWrappers, runtimeWorld, queuesByChat } = await setupQueueManagersForMatrix({
      currentChatId: 'chat-a',
      queuesByChat: {
        'chat-a': [
          createMatrixQueueMessage('q-older-sending', 'chat-a', 'sending', 'older'),
        ],
      },
    });

    await managers.addToQueue('world-1', 'chat-a', 'new queued', 'human', {
      preassignedMessageId: 'q-new',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    runtimeWorld.eventEmitter.emit('world', {
      type: 'idle',
      chatId: 'chat-a',
      activeChatIds: [],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageWrappers.removeQueuedMessage).toHaveBeenCalledWith('q-new');
    expect(queuesByChat['chat-a'].some((row) => row.messageId === 'q-older-sending')).toBe(true);
  });

  it('moves no-response fallback to error when retry limit is exhausted', async () => {
    vi.useFakeTimers();
    try {
      const { managers, storageWrappers } = await setupQueueManagersForMatrix({
        currentChatId: 'chat-a',
      });
      storageWrappers.incrementQueueMessageRetry.mockResolvedValue(3);

      await managers.addToQueue('world-1', 'chat-a', 'hello', 'human', {
        preassignedMessageId: 'q-max-fallback',
      });

      await vi.advanceTimersByTimeAsync(5000);

      expect(storageWrappers.incrementQueueMessageRetry).toHaveBeenCalledWith('q-max-fallback');
      expect(storageWrappers.updateMessageQueueStatus).toHaveBeenCalledWith('q-max-fallback', 'error');
    } finally {
      vi.useRealTimers();
    }
  });

  it('includes agent status snapshot in publishing queue debug logs', async () => {
    const previousQueueLogLevel = process.env.LOG_MESSAGE_QUEUE;
    process.env.LOG_MESSAGE_QUEUE = 'debug';
    try {
      const { managers, runtimeWorld } = await setupQueueManagersForMatrix({
        currentChatId: 'chat-a',
        runtimeAgents: [
          {
            id: 'granite',
            name: 'Granite',
            type: 'assistant',
            provider: 'ollama',
            model: 'granite4:latest',
            llmCallCount: 0,
            autoReply: false,
            status: 'inactive',
            memory: [],
          },
          {
            id: 'qwen3',
            name: 'Qwen3',
            type: 'assistant',
            provider: 'ollama',
            model: 'qwen3:latest',
            llmCallCount: 0,
            autoReply: false,
            status: 'inactive',
            memory: [],
          },
        ],
      });

      runtimeWorld.mainAgent = 'granite';

      const { addLogStreamCallback } = await import('../../core/logger.js');
      const capturedLogs: any[] = [];
      const removeLogListener = addLogStreamCallback((event) => {
        capturedLogs.push(event);
      });

      try {
        await managers.addToQueue('world-1', 'chat-a', 'hello first message', 'human', {
          preassignedMessageId: 'q-log-status-publish',
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      } finally {
        removeLogListener();
      }

      const publishLog = capturedLogs.find((logEvent) => {
        return String(logEvent?.category || '').toLowerCase() === 'message.queue' &&
          String(logEvent?.message || '').includes('Publishing queued message');
      });

      expect(publishLog).toBeTruthy();
      expect(publishLog?.data?.agentStatus).toMatchObject({
        queueChatId: 'chat-a',
        totalAgents: 2,
        resolvedMainAgentId: 'granite',
        eligibleResponderCount: 1,
        messageListenerCount: 0,
        reasonHint: 'no-message-listeners',
      });
    } finally {
      if (previousQueueLogLevel === undefined) {
        delete process.env.LOG_MESSAGE_QUEUE;
      } else {
        process.env.LOG_MESSAGE_QUEUE = previousQueueLogLevel;
      }
    }
  });

  it('includes agent status snapshot in no-response fallback escalation logs', async () => {
    vi.useFakeTimers();
    const previousQueueLogLevel = process.env.LOG_MESSAGE_QUEUE;
    process.env.LOG_MESSAGE_QUEUE = 'debug';
    try {
      const { managers, runtimeWorld } = await setupQueueManagersForMatrix({
        currentChatId: 'chat-a',
      });

      const { addLogStreamCallback } = await import('../../core/logger.js');
      const capturedLogs: any[] = [];
      const removeLogListener = addLogStreamCallback((event) => {
        capturedLogs.push(event);
      });

      try {
        await managers.addToQueue('world-1', 'chat-a', 'hello timeout', 'human', {
          preassignedMessageId: 'q-log-status-fallback',
        });
        await vi.advanceTimersByTimeAsync(5000);
      } finally {
        removeLogListener();
      }

      const fallbackLog = capturedLogs.find((logEvent) => {
        return String(logEvent?.category || '').toLowerCase() === 'message.queue' &&
          String(logEvent?.message || '').includes('Queue fallback marked message error after no responder start');
      });

      expect(fallbackLog).toBeTruthy();
      expect(fallbackLog?.data?.agentStatus).toMatchObject({
        queueChatId: 'chat-a',
        totalAgents: 1,
        eligibleResponderCount: 1,
        reasonHint: 'no-message-listeners',
      });
    } finally {
      if (previousQueueLogLevel === undefined) {
        delete process.env.LOG_MESSAGE_QUEUE;
      } else {
        process.env.LOG_MESSAGE_QUEUE = previousQueueLogLevel;
      }
      vi.useRealTimers();
    }
  });
});

describe('dispatchImmediateChatMessage / enqueueAndProcessUserTurn', () => {
  it('does not enqueue non-user sender messages and publishes immediately', async () => {
    const { managers, publishMessageWithId, runtimeWorld } = await setupQueueManagersForMatrix({
      currentChatId: 'chat-a',
    });

    const preassignedMessageId = `immediate-${Date.now()}`;
    await managers.recoverQueueSendingMessages();
    await managers.dispatchImmediateChatMessage(
      'world-1',
      'chat-a',
      'system broadcast',
      'system',
      runtimeWorld,
      { preassignedMessageId }
    );

    expect(publishMessageWithId).toHaveBeenCalledWith(
      runtimeWorld,
      'system broadcast',
      'system',
      preassignedMessageId,
      'chat-a',
    );

    const queue = await managers.getQueueMessages('world-1', 'chat-a');
    expect(queue).toEqual([]);
  });

  it('enqueues queue-eligible user senders via the queue-only API', async () => {
    const { managers } = await setupQueueManagersForMatrix({
      currentChatId: 'chat-a',
    });

    await managers.recoverQueueSendingMessages();
    const result = await managers.enqueueAndProcessUserTurn(
      'world-1',
      'chat-a',
      'human queued message',
      'human',
    );

    expect(result?.status).toBe('queued');
    const queue = await managers.getQueueMessages('world-1', 'chat-a');
    expect(queue).toHaveLength(1);
  });
});
