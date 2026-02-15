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
    const refreshWorldSubscription = vi.fn(async () => null);
    const { handlers } = await createHandlers({ editUserMessage, refreshWorldSubscription });

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
    const { handlers } = await createHandlers({ editUserMessage, refreshWorldSubscription });

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
});
