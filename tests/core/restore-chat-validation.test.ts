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
      getMemory: vi.fn().mockResolvedValue([]),
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

  it('auto-submits pending user-last message when restoring a chat', async () => {
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
      saveWorld: vi.fn().mockResolvedValue(undefined)
    };

    vi.doMock('../../core/storage/storage-factory.js', () => ({
      createStorageWithWrappers: vi.fn().mockResolvedValue(storageWrappers),
      getDefaultRootPath: vi.fn().mockReturnValue('/test/data')
    }));

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

    expect(replayPendingHitlRequests).toHaveBeenCalledTimes(1);
    expect(publishMessageWithId).toHaveBeenCalledTimes(1);
    expect(publishMessageWithId).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'world-1' }),
      'Continue this pending request',
      'human',
      'user-last-1',
      'chat-2',
      undefined
    );
    expect(resumePendingToolCallsForChat).not.toHaveBeenCalled();
  });

  it('returns centralized activation snapshot with memory and pending HITL prompts', async () => {
    vi.resetModules();

    const persistedWorld = {
      id: 'world-1',
      name: 'World 1',
      turnLimit: 5,
      currentChatId: 'chat-1',
      createdAt: new Date(),
      lastUpdated: new Date()
    };

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
      listAgents: vi.fn().mockResolvedValue([]),
      listChats: vi.fn().mockResolvedValue([
        { id: 'chat-1', name: 'Chat 1', messageCount: 0 },
        { id: 'chat-2', name: 'Chat 2', messageCount: 0 },
      ]),
      loadChatData: vi.fn().mockResolvedValue({ id: 'chat-2', name: 'Chat 2', messageCount: 0 }),
      getMemory: vi.fn().mockResolvedValue(memoryRows),
      saveWorld: vi.fn().mockResolvedValue(undefined)
    };

    vi.doMock('../../core/storage/storage-factory.js', () => ({
      createStorageWithWrappers: vi.fn().mockResolvedValue(storageWrappers),
      getDefaultRootPath: vi.fn().mockReturnValue('/test/data')
    }));

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
    expect(listPendingHitlPromptEvents).toHaveBeenCalledWith(expect.objectContaining({ id: 'world-1' }), 'chat-2');
    expect(listPendingHitlPromptEventsFromMessages).toHaveBeenCalledWith(memoryRows, 'chat-2');
  });
});
