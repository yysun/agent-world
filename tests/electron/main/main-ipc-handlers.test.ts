/**
 * Unit Tests for Main IPC Handler Behaviors
 *
 * Features:
 * - Verifies message deletion delegates to core removal API.
 * - Verifies world subscription refresh runs after message deletion.
 * - Verifies refresh warnings are propagated in delete-message responses.
 *
 * Implementation Notes:
 * - Uses dependency-injected IPC handlers with fully mocked core APIs.
 * - Mocks the Electron `dialog` module virtually to avoid runtime Electron dependency.
 *
 * Recent Changes:
 * - 2026-02-15: Added edit-message guardrail coverage for chat existence and user-role-only enforcement parity with web/API.
 * - 2026-02-14: Added `hitl:respond` handler coverage for core HITL option resolution delegation.
 * - 2026-02-14: Updated edit-message IPC coverage to validate pure core delegation (no main-process runtime refresh/rebind side effects).
 * - 2026-02-13: Added `message:edit` handler coverage for core-driven edit + resubmission delegation.
 * - 2026-02-13: Added regression coverage for delete-message flow to refresh subscribed world runtime after storage deletion.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] }))
  }
}), { virtual: true });

function createDependencies(overrides: Record<string, unknown> = {}) {
  return {
    ensureCoreReady: vi.fn(async () => undefined),
    getWorkspaceState: vi.fn(() => ({
      workspacePath: '/workspace',
      storagePath: '/workspace',
      coreInitialized: true
    })),
    getMainWindow: vi.fn(() => null),
    removeWorldSubscriptions: vi.fn(async () => undefined),
    refreshWorldSubscription: vi.fn(async () => null),
    ensureWorldSubscribed: vi.fn(async () => ({})),
    createAgent: vi.fn(async () => ({})),
    createWorld: vi.fn(async () => ({})),
    deleteAgent: vi.fn(async () => true),
    deleteChat: vi.fn(async () => true),
    updateAgent: vi.fn(async () => ({})),
    deleteWorld: vi.fn(async () => true),
    getMemory: vi.fn(async () => []),
    getWorld: vi.fn(async () => null),
    listChats: vi.fn(async () => []),
    listWorlds: vi.fn(async () => []),
    getSkillSourceScope: vi.fn(() => 'global'),
    getSkillsForSystemPrompt: vi.fn(() => []),
    syncSkills: vi.fn(async () => ({ added: 0, updated: 0, removed: 0, unchanged: 0, total: 0 })),
    newChat: vi.fn(async () => null),
    publishMessage: vi.fn(() => ({})),
    submitWorldOptionResponse: vi.fn(() => ({ accepted: true })),
    stopMessageProcessing: vi.fn(async () => ({ stopped: true })),
    restoreChat: vi.fn(async () => null),
    updateWorld: vi.fn(async () => ({})),
    editUserMessage: vi.fn(async () => ({ success: true, resubmissionStatus: 'success' })),
    removeMessagesFrom: vi.fn(async () => ({ success: true, messagesRemovedTotal: 3 })),
    ...overrides
  };
}

async function createHandlers(overrides: Record<string, unknown> = {}) {
  const { createMainIpcHandlers } = await import('../../../electron/main-process/ipc-handlers');
  const dependencies = createDependencies(overrides);
  return {
    handlers: createMainIpcHandlers(dependencies as any),
    dependencies
  };
}

describe('createMainIpcHandlers.deleteMessageFromChat', () => {
  it('refreshes the world subscription after deleting messages from storage', async () => {
    const removeMessagesFrom = vi.fn(async () => ({ success: true, messagesRemovedTotal: 4 }));
    const refreshWorldSubscription = vi.fn(async () => null);
    const { handlers } = await createHandlers({ removeMessagesFrom, refreshWorldSubscription });

    const result = await handlers.deleteMessageFromChat({
      worldId: 'world-1',
      messageId: 'msg-1',
      chatId: 'chat-1'
    });

    expect(removeMessagesFrom).toHaveBeenCalledWith('world-1', 'msg-1', 'chat-1');
    expect(refreshWorldSubscription).toHaveBeenCalledWith('world-1');
    expect(result).toEqual({ success: true, messagesRemovedTotal: 4 });
  });

  it('returns refresh warning when subscription refresh reports one', async () => {
    const removeMessagesFrom = vi.fn(async () => ({ success: true, messagesRemovedTotal: 2 }));
    const refreshWorldSubscription = vi.fn(async () => 'refresh failed');
    const { handlers } = await createHandlers({ removeMessagesFrom, refreshWorldSubscription });

    const result = await handlers.deleteMessageFromChat({
      worldId: 'world-2',
      messageId: 'msg-9',
      chatId: 'chat-3'
    });

    expect(result).toEqual({
      success: true,
      messagesRemovedTotal: 2,
      refreshWarning: 'refresh failed'
    });
  });
});

describe('createMainIpcHandlers.editMessageInChat', () => {
  it('delegates edit operations to core editUserMessage without runtime refresh', async () => {
    const editUserMessage = vi.fn(async () => ({
      success: true,
      messagesRemovedTotal: 2,
      resubmissionStatus: 'success',
      newMessageId: 'new-msg-1'
    }));
    const restoreChat = vi.fn(async () => ({ currentChatId: 'chat-1' }));
    const getMemory = vi.fn(async () => ([
      { messageId: 'msg-1', role: 'user', chatId: 'chat-1' }
    ]));
    const refreshWorldSubscription = vi.fn(async () => null);
    const { handlers } = await createHandlers({
      editUserMessage,
      refreshWorldSubscription,
      restoreChat,
      getMemory
    });

    const result = await handlers.editMessageInChat({
      worldId: 'world-1',
      chatId: 'chat-1',
      messageId: 'msg-1',
      newContent: 'updated prompt'
    });

    expect(editUserMessage).toHaveBeenCalledWith('world-1', 'msg-1', 'updated prompt', 'chat-1');
    expect(restoreChat).toHaveBeenCalledWith('world-1', 'chat-1');
    expect(getMemory).toHaveBeenCalledWith('world-1', 'chat-1');
    expect(refreshWorldSubscription).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      resubmissionStatus: 'success',
      newMessageId: 'new-msg-1'
    });
  });

  it('propagates core edit failures without subscription warnings', async () => {
    const editUserMessage = vi.fn(async () => ({
      success: true,
      resubmissionStatus: 'failed',
      resubmissionError: 'resubmit failed'
    }));
    const refreshWorldSubscription = vi.fn(async () => 'refresh failed');
    const restoreChat = vi.fn(async () => ({ currentChatId: 'chat-1' }));
    const getMemory = vi.fn(async () => ([
      { messageId: 'msg-1', role: 'user', chatId: 'chat-1' }
    ]));
    const { handlers } = await createHandlers({
      editUserMessage,
      refreshWorldSubscription,
      restoreChat,
      getMemory
    });

    const result = await handlers.editMessageInChat({
      worldId: 'world-1',
      chatId: 'chat-1',
      messageId: 'msg-1',
      newContent: 'updated prompt'
    });

    expect(editUserMessage).toHaveBeenCalledWith('world-1', 'msg-1', 'updated prompt', 'chat-1');
    expect(refreshWorldSubscription).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      resubmissionStatus: 'failed',
      resubmissionError: 'resubmit failed'
    });
  });

  it('rejects edit when target chat cannot be restored', async () => {
    const editUserMessage = vi.fn(async () => ({ success: true }));
    const restoreChat = vi.fn(async () => null);
    const getMemory = vi.fn(async () => []);
    const { handlers } = await createHandlers({ editUserMessage, restoreChat, getMemory });

    await expect(
      handlers.editMessageInChat({
        worldId: 'world-1',
        chatId: 'chat-missing',
        messageId: 'msg-1',
        newContent: 'updated prompt'
      })
    ).rejects.toThrow('404 Chat not found: chat-missing');

    expect(editUserMessage).not.toHaveBeenCalled();
  });

  it('rejects edit when target message is not a user message', async () => {
    const editUserMessage = vi.fn(async () => ({ success: true }));
    const restoreChat = vi.fn(async () => ({ currentChatId: 'chat-1' }));
    const getMemory = vi.fn(async () => ([
      { messageId: 'msg-1', role: 'assistant', chatId: 'chat-1' }
    ]));
    const { handlers } = await createHandlers({ editUserMessage, restoreChat, getMemory });

    await expect(
      handlers.editMessageInChat({
        worldId: 'world-1',
        chatId: 'chat-1',
        messageId: 'msg-1',
        newContent: 'updated prompt'
      })
    ).rejects.toThrow('400 Can only edit user messages');

    expect(editUserMessage).not.toHaveBeenCalled();
  });
});

describe('createMainIpcHandlers.respondHitlOption', () => {
  it('delegates option responses to core submitWorldOptionResponse', async () => {
    const submitWorldOptionResponse = vi.fn(() => ({ accepted: true }));
    const { handlers } = await createHandlers({ submitWorldOptionResponse });

    const result = await handlers.respondHitlOption({
      worldId: 'world-1',
      requestId: 'req-1',
      optionId: 'yes_once'
    });

    expect(submitWorldOptionResponse).toHaveBeenCalledWith({
      worldId: 'world-1',
      requestId: 'req-1',
      optionId: 'yes_once'
    });
    expect(result).toEqual({ accepted: true });
  });
});

describe('createMainIpcHandlers.sendChatMessage', () => {
  it('rejects sending when provided chatId cannot be restored', async () => {
    const restoreChat = vi.fn(async () => null);
    const publishMessage = vi.fn();
    const ensureWorldSubscribed = vi.fn(async () => ({ id: 'world-1' }));

    const { handlers } = await createHandlers({
      restoreChat,
      publishMessage,
      ensureWorldSubscribed
    });

    await expect(
      handlers.sendChatMessage({
        worldId: 'world-1',
        chatId: 'chat-missing',
        content: 'hello',
        sender: 'human'
      })
    ).rejects.toThrow('Chat not found: chat-missing');

    expect(restoreChat).toHaveBeenCalledWith('world-1', 'chat-missing');
    expect(publishMessage).not.toHaveBeenCalled();
  });

  it('applies provided skill settings payload to env before publishing', async () => {
    const ensureWorldSubscribed = vi.fn(async () => ({ id: 'world-1' }));
    const restoreChat = vi.fn(async () => ({ currentChatId: 'chat-1' }));
    const publishMessage = vi.fn(() => ({
      messageId: 'msg-1',
      sender: 'human',
      content: 'hello',
      timestamp: Date.now(),
    }));

    const previousGlobalEnabled = process.env.AGENT_WORLD_ENABLE_GLOBAL_SKILLS;
    const previousProjectEnabled = process.env.AGENT_WORLD_ENABLE_PROJECT_SKILLS;
    const previousGlobalDisabled = process.env.AGENT_WORLD_DISABLED_GLOBAL_SKILLS;
    const previousProjectDisabled = process.env.AGENT_WORLD_DISABLED_PROJECT_SKILLS;

    try {
      const { handlers } = await createHandlers({ ensureWorldSubscribed, restoreChat, publishMessage });

      await handlers.sendChatMessage({
        worldId: 'world-1',
        chatId: 'chat-1',
        content: 'hello',
        sender: 'human',
        systemSettings: {
          enableGlobalSkills: false,
          enableProjectSkills: true,
          disabledGlobalSkillIds: ['find-skills', 'rpd'],
          disabledProjectSkillIds: ['apprun-skills']
        }
      });

      expect(process.env.AGENT_WORLD_ENABLE_GLOBAL_SKILLS).toBe('false');
      expect(process.env.AGENT_WORLD_ENABLE_PROJECT_SKILLS).toBe('true');
      expect(process.env.AGENT_WORLD_DISABLED_GLOBAL_SKILLS).toBe('find-skills,rpd');
      expect(process.env.AGENT_WORLD_DISABLED_PROJECT_SKILLS).toBe('apprun-skills');
      expect(publishMessage).toHaveBeenCalledTimes(1);
    } finally {
      if (previousGlobalEnabled === undefined) {
        delete process.env.AGENT_WORLD_ENABLE_GLOBAL_SKILLS;
      } else {
        process.env.AGENT_WORLD_ENABLE_GLOBAL_SKILLS = previousGlobalEnabled;
      }

      if (previousProjectEnabled === undefined) {
        delete process.env.AGENT_WORLD_ENABLE_PROJECT_SKILLS;
      } else {
        process.env.AGENT_WORLD_ENABLE_PROJECT_SKILLS = previousProjectEnabled;
      }

      if (previousGlobalDisabled === undefined) {
        delete process.env.AGENT_WORLD_DISABLED_GLOBAL_SKILLS;
      } else {
        process.env.AGENT_WORLD_DISABLED_GLOBAL_SKILLS = previousGlobalDisabled;
      }

      if (previousProjectDisabled === undefined) {
        delete process.env.AGENT_WORLD_DISABLED_PROJECT_SKILLS;
      } else {
        process.env.AGENT_WORLD_DISABLED_PROJECT_SKILLS = previousProjectDisabled;
      }
    }
  });
});
