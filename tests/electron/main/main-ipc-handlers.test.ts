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
 * - 2026-03-10: Added coverage that edit/delete restore chat state in mutation mode without triggering auto-resume.
 * - 2026-03-04: Added `sendChatMessage` response coverage for queue metadata (`queueStatus`, `queueRetryCount`).
 * - 2026-02-28: Added edit-message IPC coverage asserting the subscribed runtime world is injected into core `editUserMessage` for realtime-safe resubmission events.
 * - 2026-02-26: Added coverage for env-derived renderer logging config payload (`getLoggingConfig`).
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
    enqueueAndProcessUserTurn: vi.fn(async () => ({
      messageId: 'queued-msg-1',
      sender: 'human',
      content: 'hello',
      createdAt: new Date().toISOString(),
    })),
    submitWorldHitlResponse: vi.fn(() => ({ accepted: true })),
    stopMessageProcessing: vi.fn(async () => ({ stopped: true })),
    restoreChat: vi.fn(async () => ({ currentChatId: 'chat-1', chats: new Map([['chat-1', { id: 'chat-1' }]]) })),
    updateWorld: vi.fn(async () => ({})),
    editUserMessage: vi.fn(async () => ({ success: true, resubmissionStatus: 'success' })),
    removeMessagesFrom: vi.fn(async () => ({ success: true, messagesRemovedTotal: 3 })),
    resumeChatQueue: vi.fn(async () => ({})),
    heartbeatManager: {
      startJob: vi.fn(),
      restartJob: vi.fn(),
      pauseJob: vi.fn(),
      resumeJob: vi.fn(),
      stopJob: vi.fn(),
      stopAll: vi.fn(),
      listJobs: vi.fn(() => []),
    },
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
  it('restores chat in mutation mode and refreshes the world subscription after deleting messages from storage', async () => {
    const removeMessagesFrom = vi.fn(async () => ({ success: true, messagesRemovedTotal: 4 }));
    const refreshWorldSubscription = vi.fn(async () => null);
    const restoreChat = vi.fn(async () => ({ currentChatId: 'chat-1', chats: new Map([['chat-1', { id: 'chat-1' }]]) }));
    const { handlers } = await createHandlers({ removeMessagesFrom, refreshWorldSubscription, restoreChat });

    const result = await handlers.deleteMessageFromChat({
      worldId: 'world-1',
      messageId: 'msg-1',
      chatId: 'chat-1'
    });

    expect(removeMessagesFrom).toHaveBeenCalledWith('world-1', 'msg-1', 'chat-1');
    expect(restoreChat).toHaveBeenCalledWith('world-1', 'chat-1', { suppressAutoResume: true });
    expect(refreshWorldSubscription).toHaveBeenCalledWith('world-1');
    expect(result).toEqual({ success: true, messagesRemovedTotal: 4 });
  });

  it('returns refresh warning when subscription refresh reports one', async () => {
    const removeMessagesFrom = vi.fn(async () => ({ success: true, messagesRemovedTotal: 2 }));
    const refreshWorldSubscription = vi.fn(async () => 'refresh failed');
    const restoreChat = vi.fn(async () => ({ currentChatId: 'chat-3', chats: new Map([['chat-3', { id: 'chat-3' }]]) }));
    const { handlers } = await createHandlers({ removeMessagesFrom, refreshWorldSubscription, restoreChat });

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

describe('createMainIpcHandlers.getLoggingConfig', () => {
  it('returns normalized global/category logging levels from LOG_* env variables', async () => {
    const previousLogLevel = process.env.LOG_LEVEL;
    const previousElectronSession = process.env.LOG_ELECTRON_RENDERER_SESSION;
    const previousElectronRenderer = process.env.LOG_ELECTRON_RENDERER;
    const previousMessageQueue = process.env.LOG_MESSAGE_QUEUE;

    process.env.LOG_LEVEL = 'warn';
    process.env.LOG_ELECTRON_RENDERER_SESSION = 'debug';
    process.env.LOG_ELECTRON_RENDERER = 'info';
    process.env.LOG_MESSAGE_QUEUE = 'trace';

    try {
      const { handlers } = await createHandlers();
      const result = handlers.getLoggingConfig();

      expect(result).toMatchObject({
        globalLevel: 'warn',
        categoryLevels: {
          'electron.renderer.session': 'debug',
          'electron.renderer': 'info',
          'message.queue': 'trace'
        }
      });
    } finally {
      if (previousLogLevel === undefined) delete process.env.LOG_LEVEL;
      else process.env.LOG_LEVEL = previousLogLevel;

      if (previousElectronSession === undefined) delete process.env.LOG_ELECTRON_RENDERER_SESSION;
      else process.env.LOG_ELECTRON_RENDERER_SESSION = previousElectronSession;

      if (previousElectronRenderer === undefined) delete process.env.LOG_ELECTRON_RENDERER;
      else process.env.LOG_ELECTRON_RENDERER = previousElectronRenderer;

      if (previousMessageQueue === undefined) delete process.env.LOG_MESSAGE_QUEUE;
      else process.env.LOG_MESSAGE_QUEUE = previousMessageQueue;
    }
  });
});

describe('createMainIpcHandlers.editMessageInChat', () => {
  it('delegates edit operations to core editUserMessage using the active subscribed world', async () => {
    const editUserMessage = vi.fn(async () => ({
      success: true,
      messagesRemovedTotal: 2,
      resubmissionStatus: 'success',
      newMessageId: 'new-msg-1'
    }));
    const restoreChat = vi.fn(async () => ({ currentChatId: 'chat-1', chats: new Map([['chat-1', { id: 'chat-1' }]]) }));
    const subscribedWorld = { id: 'world-1', eventEmitter: {} };
    const ensureWorldSubscribed = vi.fn(async () => subscribedWorld);
    const getMemory = vi.fn(async () => ([
      { messageId: 'msg-1', role: 'user', chatId: 'chat-1' }
    ]));
    const refreshWorldSubscription = vi.fn(async () => null);
    const { handlers } = await createHandlers({
      editUserMessage,
      ensureWorldSubscribed,
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

    expect(ensureWorldSubscribed).toHaveBeenCalledWith('world-1');
    expect(editUserMessage).toHaveBeenCalledWith('world-1', 'msg-1', 'updated prompt', 'chat-1', subscribedWorld);
    expect(restoreChat).toHaveBeenCalledWith('world-1', 'chat-1', { suppressAutoResume: true });
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
    const subscribedWorld = { id: 'world-1', eventEmitter: {} };
    const ensureWorldSubscribed = vi.fn(async () => subscribedWorld);
    const refreshWorldSubscription = vi.fn(async () => 'refresh failed');
    const restoreChat = vi.fn(async () => ({ currentChatId: 'chat-1', chats: new Map([['chat-1', { id: 'chat-1' }]]) }));
    const getMemory = vi.fn(async () => ([
      { messageId: 'msg-1', role: 'user', chatId: 'chat-1' }
    ]));
    const { handlers } = await createHandlers({
      editUserMessage,
      ensureWorldSubscribed,
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

    expect(ensureWorldSubscribed).toHaveBeenCalledWith('world-1');
    expect(editUserMessage).toHaveBeenCalledWith('world-1', 'msg-1', 'updated prompt', 'chat-1', subscribedWorld);
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


});

describe('createMainIpcHandlers.respondHitlOption', () => {
  it('delegates option responses to core submitWorldHitlResponse', async () => {
    const submitWorldHitlResponse = vi.fn(() => ({ accepted: true }));
    const { handlers } = await createHandlers({ submitWorldHitlResponse });

    const result = await handlers.respondHitlOption({
      worldId: 'world-1',
      requestId: 'req-1',
      optionId: 'yes_once'
    });

    expect(submitWorldHitlResponse).toHaveBeenCalledWith({
      worldId: 'world-1',
      requestId: 'req-1',
      optionId: 'yes_once'
    });
    expect(result).toEqual({ accepted: true });
  });

});

describe('createMainIpcHandlers.listSkillRegistry', () => {
  it('syncs and filters skills using projectPath-scoped roots when provided', async () => {
    const syncSkills = vi.fn(async () => ({ added: 0, updated: 0, removed: 0, unchanged: 0, total: 1 }));
    const getSkillsForSystemPrompt = vi.fn(() => ([
      {
        skill_id: 'pptx',
        description: 'PPTX operations',
        hash: 'abc12345',
        lastUpdated: '2026-02-16T00:00:00.000Z'
      }
    ]));
    const getSkillSourceScope = vi.fn(() => 'project');

    const { handlers } = await createHandlers({
      syncSkills,
      getSkillsForSystemPrompt,
      getSkillSourceScope
    });

    const projectPath = '/Users/esun/Documents/Projects/test-agent-world';
    const result = await handlers.listSkillRegistry({
      includeGlobalSkills: true,
      includeProjectSkills: true,
      projectPath,
    });

    expect(syncSkills).toHaveBeenCalledWith({
      projectSkillRoots: [
        '/Users/esun/Documents/Projects/test-agent-world/.agents/skills',
        '/Users/esun/Documents/Projects/test-agent-world/skills',
      ]
    });
    expect(getSkillsForSystemPrompt).toHaveBeenCalledWith({
      includeGlobal: true,
      includeProject: true,
      projectSkillRoots: [
        '/Users/esun/Documents/Projects/test-agent-world/.agents/skills',
        '/Users/esun/Documents/Projects/test-agent-world/skills',
      ]
    });
    expect(result).toEqual([
      {
        skill_id: 'pptx',
        description: 'PPTX operations',
        hash: 'abc12345',
        lastUpdated: '2026-02-16T00:00:00.000Z',
        sourceScope: 'project'
      }
    ]);
  });
});

describe('createMainIpcHandlers.sendChatMessage', () => {
  it('rejects sending when chatId is missing', async () => {
    const restoreChat = vi.fn(async () => ({ currentChatId: 'chat-1', chats: new Map([['chat-1', { id: 'chat-1' }]]) }));
    const enqueueAndProcessUserTurn = vi.fn();
    const ensureWorldSubscribed = vi.fn(async () => ({ id: 'world-1' }));

    const { handlers } = await createHandlers({
      restoreChat,
      enqueueAndProcessUserTurn,
      ensureWorldSubscribed
    });

    await expect(
      handlers.sendChatMessage({
        worldId: 'world-1',
        content: 'hello',
        sender: 'human'
      })
    ).rejects.toThrow('Chat ID is required.');

    expect(restoreChat).not.toHaveBeenCalled();
    expect(enqueueAndProcessUserTurn).not.toHaveBeenCalled();
  });
  it('rejects sending when provided chatId cannot be restored', async () => {
    const restoreChat = vi.fn(async () => null);
    const enqueueAndProcessUserTurn = vi.fn();
    const ensureWorldSubscribed = vi.fn(async () => ({ id: 'world-1' }));

    const { handlers } = await createHandlers({
      restoreChat,
      enqueueAndProcessUserTurn,
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
    expect(enqueueAndProcessUserTurn).not.toHaveBeenCalled();
  });

  it('applies provided skill settings payload to env before publishing', async () => {
    const staleWorld = { id: 'world-1', runtime: 'stale' };
    const activeWorld = { id: 'world-1', runtime: 'active' };
    const ensureWorldSubscribed = vi
      .fn()
      .mockResolvedValueOnce(staleWorld)
      .mockResolvedValueOnce(activeWorld);
    const restoreChat = vi.fn(async () => ({ currentChatId: 'chat-1', chats: new Map([['chat-1', { id: 'chat-1' }]]) }));
    const enqueueAndProcessUserTurn = vi.fn(async () => ({
      messageId: 'queued-msg-1',
      sender: 'human',
      content: 'hello',
      createdAt: new Date().toISOString(),
      status: 'queued',
      retryCount: 0,
    }));

    const previousGlobalEnabled = process.env.AGENT_WORLD_ENABLE_GLOBAL_SKILLS;
    const previousProjectEnabled = process.env.AGENT_WORLD_ENABLE_PROJECT_SKILLS;
    const previousGlobalDisabled = process.env.AGENT_WORLD_DISABLED_GLOBAL_SKILLS;
    const previousProjectDisabled = process.env.AGENT_WORLD_DISABLED_PROJECT_SKILLS;

    try {
      const { handlers } = await createHandlers({ ensureWorldSubscribed, restoreChat, enqueueAndProcessUserTurn });

      const result = await handlers.sendChatMessage({
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
      expect(enqueueAndProcessUserTurn).toHaveBeenCalledTimes(1);
      expect(ensureWorldSubscribed).toHaveBeenCalledTimes(2);
      expect(enqueueAndProcessUserTurn).toHaveBeenCalledWith('world-1', 'chat-1', 'hello', 'human', activeWorld);
      expect(result).toMatchObject({
        messageId: 'queued-msg-1',
        queueStatus: 'queued',
        queueRetryCount: 0,
      });
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

describe('createMainIpcHandlers.loadSpecificWorld', () => {
  it('subscribes runtime without resuming a queue from persisted currentChatId', async () => {
    const world = {
      id: 'world-1',
      name: 'World 1',
      currentChatId: 'chat-7',
      turnLimit: 5,
      createdAt: new Date(),
      lastUpdated: new Date(),
      agents: new Map(),
      chats: new Map(),
    } as any;

    const getWorld = vi.fn(async () => world);
    const ensureWorldSubscribed = vi.fn(async () => ({ id: 'world-1', currentChatId: 'chat-7' }));
    const resumeChatQueue = vi.fn(async () => undefined);
    const listChats = vi.fn(async () => [{ id: 'chat-7', name: 'Chat 7', messageCount: 0 }]);
    const getMemory = vi.fn(async () => []);

    const { handlers } = await createHandlers({
      getWorld,
      ensureWorldSubscribed,
      resumeChatQueue,
      listChats,
      getMemory,
    });

    const result = await handlers.loadSpecificWorld('world-1');

    expect(result).toMatchObject({ success: true });
    expect(getWorld).toHaveBeenCalledWith('world-1');
    expect(ensureWorldSubscribed).toHaveBeenCalledWith('world-1');
    expect(resumeChatQueue).not.toHaveBeenCalled();
  });
});

describe('createMainIpcHandlers.selectWorldSession', () => {
  it('ensures runtime subscription before activating selected chat', async () => {
    const ensureWorldSubscribed = vi.fn(async () => ({ id: 'world-1', currentChatId: 'chat-2' }));
    const activateChatWithSnapshot = vi.fn(async () => ({
      world: { id: 'world-1', currentChatId: 'chat-2' },
      chatId: 'chat-2',
      memory: [],
      hitlPrompts: [],
    }));

    const { handlers } = await createHandlers({
      ensureWorldSubscribed,
      activateChatWithSnapshot,
    });

    const result = await handlers.selectWorldSession('world-1', 'chat-2');

    expect(result).toMatchObject({ worldId: 'world-1', chatId: 'chat-2' });
    expect(ensureWorldSubscribed).toHaveBeenCalledWith('world-1');
    expect(activateChatWithSnapshot).toHaveBeenCalledWith('world-1', 'chat-2');
  });
});

describe('createMainIpcHandlers.updateWorkspaceWorld heartbeat mapping', () => {
  it('maps heartbeat fields and restarts heartbeat job with subscribed world and explicit chatId', async () => {
    const updateWorld = vi.fn(async () => ({
      id: 'world-1',
      name: 'World 1',
      description: '',
      turnLimit: 5,
      heartbeatEnabled: true,
      heartbeatInterval: '*/5 * * * *',
      heartbeatPrompt: 'tick',
    }));
    const refreshWorldSubscription = vi.fn(async () => null);
    const runtimeWorld = { id: 'world-1', name: 'World 1', heartbeatEnabled: true, heartbeatInterval: '*/5 * * * *', heartbeatPrompt: 'tick' };
    const ensureWorldSubscribed = vi.fn(async () => runtimeWorld);
    const heartbeatManager = {
      startJob: vi.fn(),
      restartJob: vi.fn(),
      pauseJob: vi.fn(),
      resumeJob: vi.fn(),
      stopJob: vi.fn(),
      stopAll: vi.fn(),
      listJobs: vi.fn(() => []),
    };

    const { handlers } = await createHandlers({
      updateWorld,
      refreshWorldSubscription,
      ensureWorldSubscribed,
      heartbeatManager,
    });

    await handlers.updateWorkspaceWorld({
      worldId: 'world-1',
      chatId: 'chat-9',
      heartbeatEnabled: true,
      heartbeatInterval: ' */5 * * * * ',
      heartbeatPrompt: 'tick',
    });

    expect(updateWorld).toHaveBeenCalledWith('world-1', expect.objectContaining({
      heartbeatEnabled: true,
      heartbeatInterval: '*/5 * * * *',
      heartbeatPrompt: 'tick',
    }));
    expect(refreshWorldSubscription).toHaveBeenCalledWith('world-1');
    expect(ensureWorldSubscribed).toHaveBeenCalledWith('world-1');
    expect(heartbeatManager.restartJob).toHaveBeenCalledWith(runtimeWorld, 'chat-9');
  });

  it('stops heartbeat runtime when heartbeat config updates without explicit chatId', async () => {
    const updateWorld = vi.fn(async () => ({
      id: 'world-1',
      name: 'World 1',
      description: '',
      turnLimit: 5,
      heartbeatEnabled: true,
      heartbeatInterval: '*/5 * * * *',
      heartbeatPrompt: 'tick',
    }));
    const refreshWorldSubscription = vi.fn(async () => null);
    const ensureWorldSubscribed = vi.fn(async () => ({ id: 'world-1' }));
    const heartbeatManager = {
      startJob: vi.fn(),
      restartJob: vi.fn(),
      pauseJob: vi.fn(),
      resumeJob: vi.fn(),
      stopJob: vi.fn(),
      stopAll: vi.fn(),
      listJobs: vi.fn(() => []),
    };

    const { handlers } = await createHandlers({
      updateWorld,
      refreshWorldSubscription,
      ensureWorldSubscribed,
      heartbeatManager,
    });

    await handlers.updateWorkspaceWorld({
      worldId: 'world-1',
      heartbeatEnabled: true,
      heartbeatInterval: '*/5 * * * *',
      heartbeatPrompt: 'tick',
    });

    expect(heartbeatManager.restartJob).not.toHaveBeenCalled();
    expect(heartbeatManager.stopJob).toHaveBeenCalledWith('world-1');
  });
});
