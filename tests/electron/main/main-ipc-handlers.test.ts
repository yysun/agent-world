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
 * - 2026-04-24: Updated mutation-flow restoreChat expectations to assert both
 *   suppressAutoResume and suppressHitlReplay for edit/delete IPC handlers.
 * - 2026-03-19: Added regression coverage for preserving `openWorkspace(directoryPath)` direct-path behavior and for `pickDirectory(defaultPath)` dialog seeding.
 * - 2026-03-14: Added regression coverage for explicit heartbeat starts so the
 *   IPC layer syncs persisted config onto the runtime world and rejects silent no-op starts.
 * - 2026-03-14: Added regression coverage that saving world settings stops heartbeat
 *   runtime state instead of auto-starting or auto-restarting cron jobs.
 * - 2026-03-13: Added coverage that `agent:create` refreshes the subscribed
 *   world runtime so Electron-created agents become live responders.
 * - 2026-03-15: Added regression coverage for exported worlds omitting env-backed config.
 * - 2026-03-15: Added regression coverage for `toImportSourceMetadata` so
 *   GitHub import source objects stay serializable without unsafe casts.
 * - 2026-03-10: Added a chat-flow scenario matrix covering new/current/switched chat
 *   send and edit lifecycles, including replay-safe pending HITL prompt recovery.
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

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as nodePath from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const { showOpenDialogMock, openExternalMock } = vi.hoisted(() => ({
  showOpenDialogMock: vi.fn(async () => ({ canceled: true, filePaths: [] })),
  openExternalMock: vi.fn(async () => undefined),
}));

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: showOpenDialogMock,
  },
  shell: {
    openExternal: openExternalMock,
  },
  default: {
    dialog: {
      showOpenDialog: showOpenDialogMock,
    },
    shell: {
      openExternal: openExternalMock,
    }
  }
}));

vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('path')>();
  return actual;
});

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
    activateChatWithSnapshot: vi.fn(async (_worldId: string, chatId: string) => ({
      world: { id: 'world-1', currentChatId: chatId },
      chatId,
      hitlPrompts: [],
    })),
    restoreChat: vi.fn(async () => ({ currentChatId: 'chat-1', chats: new Map([['chat-1', { id: 'chat-1' }]]) })),
    updateWorld: vi.fn(async () => ({})),
    editUserMessage: vi.fn(async () => ({ success: true, resubmissionStatus: 'success' })),
    removeMessagesFrom: vi.fn(async () => ({ success: true, messagesRemovedTotal: 3 })),
    openExternalUrl: openExternalMock,
    resumeChatQueue: vi.fn(async () => ({})),
    heartbeatManager: {
      startJob: vi.fn(() => ({
        started: true,
        reason: null,
        job: {
          worldId: 'world-1',
          worldName: 'World 1',
          interval: '*/5 * * * *',
          status: 'running',
          runCount: 0,
        },
      })),
      restartJob: vi.fn(() => ({
        started: true,
        reason: null,
        job: {
          worldId: 'world-1',
          worldName: 'World 1',
          interval: '*/5 * * * *',
          status: 'running',
          runCount: 0,
        },
      })),
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

describe('createMainIpcHandlers.importWorld', () => {
  it('copies GitHub world source objects into plain metadata records', async () => {
    const { toImportSourceMetadata } = await import('../../../electron/main-process/ipc-handlers');

    const source = {
      shorthand: '@yysun/agent-worlds/infinite-etude',
      owner: 'yysun',
      repo: 'agent-worlds',
      branch: 'main',
      worldPath: 'worlds/infinite-etude',
      commitSha: 'abc123',
    };

    const metadata = toImportSourceMetadata(source);

    expect(metadata).toEqual(source);
    expect(metadata).not.toBe(source);
  });
});

describe('createMainIpcHandlers.openExternalLink', () => {
  it('opens validated external links via Electron shell', async () => {
    openExternalMock.mockClear();
    const { handlers } = await createHandlers();

    const result = await handlers.openExternalLink({ url: 'https://example.com/docs?q=1' });

    expect(openExternalMock).toHaveBeenCalledWith('https://example.com/docs?q=1');
    expect(result).toEqual({ opened: true, url: 'https://example.com/docs?q=1' });
  });

  it('accepts allowed non-http protocols that the sanitizer preserves', async () => {
    openExternalMock.mockClear();
    const { handlers } = await createHandlers();

    const result = await handlers.openExternalLink({ url: 'sms:+15551234567' });

    expect(openExternalMock).toHaveBeenCalledWith('sms:+15551234567');
    expect(result).toEqual({ opened: true, url: 'sms:+15551234567' });
  });

  it('rejects unsupported or relative link targets', async () => {
    const { handlers } = await createHandlers();

    await expect(handlers.openExternalLink({ url: '/docs' })).rejects.toThrow('External URL must be absolute.');
    await expect(handlers.openExternalLink({ url: 'javascript:alert(1)' })).rejects.toThrow('Unsupported external URL protocol: javascript:');
  });
});

describe('createMainIpcHandlers.workspace dialogs', () => {
  it('returns a provided workspace path without reopening the folder picker', async () => {
    showOpenDialogMock.mockClear();
    const { handlers } = await createHandlers();

    const result = await handlers.openWorkspaceDialog({ directoryPath: '/tmp/workspace' });

    expect(showOpenDialogMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      workspacePath: '/tmp/workspace',
      storagePath: '/workspace',
      coreInitialized: true,
      canceled: false
    });
  });
});

describe('createMainIpcHandlers.exportWorld', () => {
  it('omits world env data and current chat id from exported world config', async () => {
    const saveWorld = vi.fn(async (_world: any) => undefined);
    const createStorage = vi.fn(async () => ({
      saveWorld,
      saveAgent: vi.fn(async () => undefined),
      saveChatData: vi.fn(async () => undefined),
    }));
    const getWorld = vi.fn(async () => ({
      id: 'world-1',
      name: 'World 1',
      description: 'Export me',
      turnLimit: 5,
      currentChatId: 'chat-9',
      variables: 'OPENAI_API_KEY=secret\nworking_directory=/tmp/project',
      env: { OPENAI_API_KEY: 'secret' },
      agents: new Map(),
      chats: new Map(),
    }));
    const exportRoot = await mkdtemp(nodePath.join(tmpdir(), 'agent-world-export-'));

    try {
      const { handlers } = await createHandlers({
        getMainWindow: vi.fn(() => ({ isDestroyed: () => false })),
        getWorld,
        createStorage,
        listChats: vi.fn(async () => []),
      });

      const result = await handlers.exportWorld({
        worldId: 'world-1',
        targetPath: exportRoot,
      });

      expect(result).toMatchObject({ success: true });
      expect(createStorage).toHaveBeenCalledWith({
        type: 'file',
        rootPath: exportRoot,
      });

      const exportedWorld = saveWorld.mock.calls[0]?.[0];
      expect(exportedWorld).toMatchObject({
        id: 'world-1',
        name: 'World 1',
        description: 'Export me',
        turnLimit: 5,
      });
      expect(exportedWorld).not.toHaveProperty('variables');
      expect(exportedWorld).not.toHaveProperty('env');
      expect(exportedWorld).not.toHaveProperty('currentChatId');
    } finally {
      await rm(exportRoot, { recursive: true, force: true });
    }
  });
});

type FlowLifecycle = 'new-chat' | 'current-chat' | 'switch-chat';

function createRestoredWorld(chatIds: string[], currentChatId: string) {
  return {
    currentChatId,
    chats: new Map(chatIds.map((chatId) => [chatId, { id: chatId }]))
  };
}

function createPendingHitlPrompt(chatId: string, requestId: string) {
  return {
    chatId,
    prompt: {
      requestId,
      title: 'Approval needed',
      message: `Pending approval for ${chatId}`,
      options: [
        { id: 'approve', label: 'Approve' },
        { id: 'deny', label: 'Deny' }
      ],
      defaultOptionId: 'approve'
    }
  };
}

function createActivatedSnapshot(worldId: string, chatId: string, hitlPrompts: any[] = []) {
  return {
    world: { id: worldId, currentChatId: chatId },
    chatId,
    memory: [],
    hitlPrompts
  };
}

async function createChatFlowScenarioHarness(overrides: Record<string, unknown> = {}) {
  const knownChatIds = ['chat-current', 'chat-a', 'chat-b', 'chat-new'];
  const pendingHitlPromptsByChat = new Map<string, any[]>();
  const ensureWorldSubscribed = vi.fn(async (worldId: string) => ({
    id: worldId,
    currentChatId: 'chat-current',
    eventEmitter: {},
    chats: new Map(knownChatIds.map((chatId) => [chatId, { id: chatId }]))
  }));
  const restoreChat = vi.fn(async (_worldId: string, chatId: string) => createRestoredWorld(knownChatIds, chatId));
  const activateChatWithSnapshot = vi.fn(async (worldId: string, chatId: string) => (
    createActivatedSnapshot(worldId, chatId, pendingHitlPromptsByChat.get(chatId) || [])
  ));
  const newChat = vi.fn(async (worldId: string) => ({
    id: worldId,
    currentChatId: 'chat-new'
  }));
  const listChats = vi.fn(async () => knownChatIds.map((chatId, index) => ({
    id: chatId,
    name: chatId,
    messageCount: index
  })));
  const getMemory = vi.fn(async (_worldId: string, chatId: string | null) => {
    if (chatId === 'chat-current') {
      return [{ messageId: 'msg-current-1', chatId: 'chat-current' }];
    }
    return [];
  });

  const harness = await createHandlers({
    ensureWorldSubscribed,
    restoreChat,
    activateChatWithSnapshot,
    newChat,
    listChats,
    getMemory,
    ...overrides
  });

  return {
    ...harness,
    pendingHitlPromptsByChat,
    mocks: {
      ensureWorldSubscribed,
      restoreChat,
      activateChatWithSnapshot,
      newChat,
      listChats,
      getMemory
    }
  };
}

async function prepareLifecycle(
  handlers: Awaited<ReturnType<typeof createHandlers>>['handlers'],
  lifecycle: FlowLifecycle
): Promise<{ activeChatId: string; previousChatId: string | null }> {
  if (lifecycle === 'new-chat') {
    const created = await handlers.createWorldSession('world-1');
    return {
      activeChatId: String(created.currentChatId || ''),
      previousChatId: null
    };
  }

  if (lifecycle === 'current-chat') {
    await handlers.selectWorldSession('world-1', 'chat-current');
    return {
      activeChatId: 'chat-current',
      previousChatId: null
    };
  }

  await handlers.selectWorldSession('world-1', 'chat-a');
  await handlers.selectWorldSession('world-1', 'chat-b');
  return {
    activeChatId: 'chat-b',
    previousChatId: 'chat-a'
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
    expect(restoreChat).toHaveBeenCalledWith('world-1', 'chat-1', {
      suppressAutoResume: true,
      suppressHitlReplay: true,
    });
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

describe('createMainIpcHandlers.createWorldAgent', () => {
  it('refreshes the world subscription after creating an agent', async () => {
    const createAgent = vi.fn(async () => ({
      id: 'e2e-google',
      name: 'E2E Google',
      type: 'assistant',
      provider: 'google',
      model: 'gemini-2.5-flash',
      autoReply: true,
    }));
    const getWorld = vi.fn(async () => ({
      id: 'world-1',
      chatLLMProvider: 'google',
      chatLLMModel: 'gemini-2.5-flash',
    }));
    const refreshWorldSubscription = vi.fn(async () => null);
    const { handlers } = await createHandlers({
      createAgent,
      getWorld,
      refreshWorldSubscription,
    });

    const result = await handlers.createWorldAgent({
      worldId: 'world-1',
      name: 'E2E Google',
      provider: 'google',
      model: 'gemini-2.5-flash',
      autoReply: true,
    });

    expect(createAgent).toHaveBeenCalledWith('world-1', expect.objectContaining({
      name: 'E2E Google',
      provider: 'google',
      model: 'gemini-2.5-flash',
      autoReply: true,
    }));
    expect(refreshWorldSubscription).toHaveBeenCalledWith('world-1');
    expect(result).toMatchObject({
      id: 'e2e-google',
      name: 'E2E Google',
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
    expect(restoreChat).toHaveBeenCalledWith('world-1', 'chat-1', {
      suppressAutoResume: true,
      suppressHitlReplay: true,
    });
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

  it('delegates skipped HITL responses without synthesizing an option id', async () => {
    const submitWorldHitlResponse = vi.fn(() => ({ accepted: true }));
    const { handlers } = await createHandlers({ submitWorldHitlResponse });

    const result = await handlers.respondHitlOption({
      worldId: 'world-1',
      requestId: 'req-skip',
      skipped: true,
      chatId: 'chat-1'
    });

    expect(submitWorldHitlResponse).toHaveBeenCalledWith({
      worldId: 'world-1',
      requestId: 'req-skip',
      skipped: true,
      chatId: 'chat-1'
    });
    expect(result).toEqual({ accepted: true });
  });

  it('delegates structured HITL answers without requiring optionId', async () => {
    const submitWorldHitlResponse = vi.fn(() => ({ accepted: true }));
    const { handlers } = await createHandlers({ submitWorldHitlResponse });

    const result = await handlers.respondHitlOption({
      worldId: 'world-1',
      requestId: 'req-answers',
      answers: [{ questionId: 'question-1', optionIds: ['yes_once'] }],
      chatId: 'chat-1'
    });

    expect(submitWorldHitlResponse).toHaveBeenCalledWith({
      worldId: 'world-1',
      requestId: 'req-answers',
      answers: [{ questionId: 'question-1', optionIds: ['yes_once'] }],
      chatId: 'chat-1'
    });
    expect(result).toEqual({ accepted: true });
  });

});

describe('createMainIpcHandlers.listSkillRegistry', () => {
  it('syncs and filters skills using world variables from the requested world', async () => {
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
    const getWorld = vi.fn(async () => ({
      id: 'world-1',
      variables: 'working_directory=/Users/esun/Documents/Projects/test-agent-world',
    }));

    const { handlers } = await createHandlers({
      syncSkills,
      getSkillsForSystemPrompt,
      getSkillSourceScope,
      getWorld,
    });

    const result = await handlers.listSkillRegistry({
      includeGlobalSkills: true,
      includeProjectSkills: true,
      worldId: 'world-1',
    });

    expect(syncSkills).toHaveBeenCalledWith({
      worldVariablesText: 'working_directory=/Users/esun/Documents/Projects/test-agent-world',
    });
    expect(getSkillsForSystemPrompt).toHaveBeenCalledWith({
      includeGlobal: true,
      includeProject: true,
      worldVariablesText: 'working_directory=/Users/esun/Documents/Projects/test-agent-world',
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
    expect(getWorld).toHaveBeenCalledWith('world-1');
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

  it('activates the chat without touching world subscriptions', async () => {
    const callOrder: string[] = [];
    const ensureWorldSubscribed = vi.fn(async () => {
      callOrder.push('ensure');
      return { id: 'world-1', currentChatId: 'chat-2' };
    });
    const activateChatWithSnapshot = vi.fn(async () => {
      callOrder.push('activate');
      return {
        world: { id: 'world-1', currentChatId: 'chat-2' },
        chatId: 'chat-2',
        memory: [],
        hitlPrompts: [],
      };
    });
    const refreshWorldSubscription = vi.fn(async () => null);

    const { handlers } = await createHandlers({
      ensureWorldSubscribed,
      activateChatWithSnapshot,
      refreshWorldSubscription,
    });

    await handlers.selectWorldSession('world-1', 'chat-2');

    expect(callOrder).toEqual(['ensure', 'activate']);
    expect(refreshWorldSubscription).not.toHaveBeenCalled();
  });

  it('does not call refreshWorldSubscription on session switch to avoid dropping in-flight SSE events', async () => {
    const refreshWorldSubscription = vi.fn(async () => null);
    const activateChatWithSnapshot = vi.fn(async () => ({
      world: { id: 'world-1', currentChatId: 'chat-2' },
      chatId: 'chat-2',
      memory: [],
      hitlPrompts: [],
    }));

    const { handlers } = await createHandlers({
      activateChatWithSnapshot,
      refreshWorldSubscription,
    });

    await handlers.selectWorldSession('world-1', 'chat-2');

    expect(refreshWorldSubscription).not.toHaveBeenCalled();
  });

  it('does not refresh the world subscription when activation fails', async () => {
    const activateChatWithSnapshot = vi.fn(async () => null);
    const refreshWorldSubscription = vi.fn(async () => null);

    const { handlers } = await createHandlers({
      activateChatWithSnapshot,
      refreshWorldSubscription,
    });

    await expect(handlers.selectWorldSession('world-1', 'chat-missing')).rejects.toThrow(
      'World or session not found: world-1/chat-missing'
    );
    expect(refreshWorldSubscription).not.toHaveBeenCalled();
  });

  it('returns pending HITL prompts for the selected chat', async () => {
    const pendingPrompt = createPendingHitlPrompt('chat-current', 'req-current');
    const activateChatWithSnapshot = vi.fn(async () => ({
      world: { id: 'world-1', currentChatId: 'chat-current' },
      chatId: 'chat-current',
      memory: [],
      hitlPrompts: [pendingPrompt]
    }));

    const { handlers } = await createHandlers({ activateChatWithSnapshot });
    const result = await handlers.selectWorldSession('world-1', 'chat-current');

    expect(result).toMatchObject({
      worldId: 'world-1',
      chatId: 'chat-current',
      hitlPrompts: [pendingPrompt]
    });
  });

  it('keeps pending HITL prompts scoped to the switched target chat', async () => {
    const promptsByChat = new Map<string, any[]>([
      ['chat-a', [createPendingHitlPrompt('chat-a', 'req-a')]],
      ['chat-b', [createPendingHitlPrompt('chat-b', 'req-b')]]
    ]);
    const activateChatWithSnapshot = vi.fn(async (worldId: string, chatId: string) => (
      createActivatedSnapshot(worldId, chatId, promptsByChat.get(chatId) || [])
    ));

    const { handlers } = await createHandlers({ activateChatWithSnapshot });

    const first = await handlers.selectWorldSession('world-1', 'chat-a');
    const second = await handlers.selectWorldSession('world-1', 'chat-b');

    expect(first.hitlPrompts).toEqual(promptsByChat.get('chat-a'));
    expect(second.hitlPrompts).toEqual(promptsByChat.get('chat-b'));
    expect(second.hitlPrompts).not.toEqual(first.hitlPrompts);
  });
});

describe('createMainIpcHandlers.createWorldSession', () => {
  it('creates a new chat and returns serialized sessions for the updated world', async () => {
    const newChat = vi.fn(async () => ({
      id: 'world-1',
      currentChatId: 'chat-new'
    }));
    const listChats = vi.fn(async () => ([
      { id: 'chat-current', name: 'Current Chat', messageCount: 2 },
      { id: 'chat-new', name: 'New Chat', messageCount: 0 }
    ]));
    const getMemory = vi.fn(async (_worldId: string, chatId: string | null) => (
      chatId === 'chat-current'
        ? [{ messageId: 'm-current-1', chatId: 'chat-current' }]
        : []
    ));

    const { handlers } = await createHandlers({ newChat, listChats, getMemory });
    const result = await handlers.createWorldSession('world-1');

    expect(newChat).toHaveBeenCalledWith('world-1');
    expect(result.currentChatId).toBe('chat-new');
    expect(result.sessions.map((session: any) => session.id)).toEqual(['chat-current', 'chat-new']);
  });

  it('propagates refresh warnings after creating a new chat', async () => {
    const newChat = vi.fn(async () => ({
      id: 'world-1',
      currentChatId: 'chat-new'
    }));
    const refreshWorldSubscription = vi.fn(async () => 'refresh failed');

    const { handlers } = await createHandlers({ newChat, refreshWorldSubscription });
    const result = await handlers.createWorldSession('world-1');

    expect(result).toMatchObject({
      currentChatId: 'chat-new',
      refreshWarning: 'refresh failed'
    });
  });
});

describe('createMainIpcHandlers chat-flow scenario matrix', () => {
  const sendLifecycleCases: Array<{ key: FlowLifecycle; label: string }> = [
    { key: 'new-chat', label: 'new chat' },
    { key: 'current-chat', label: 'load current chat' },
    { key: 'switch-chat', label: 'switch chat' }
  ];
  const sendOutcomeCases = [
    { key: 'success', label: 'success', queueStatus: 'queued', retryCount: 0 },
    { key: 'hitl', label: 'pending HITL replay', queueStatus: 'sending', retryCount: 1 },
    { key: 'error', label: 'error', queueStatus: null, retryCount: null }
  ] as const;

  it.each(
    sendLifecycleCases.flatMap((lifecycle) => sendOutcomeCases.map((outcome) => ({ lifecycle, outcome })))
  )('$lifecycle.label -> send new message -> $outcome.label', async ({ lifecycle, outcome }) => {
    const enqueueAndProcessUserTurn = vi.fn(async (_worldId: string, chatId: string) => {
      if (outcome.key === 'error') {
        throw new Error(`send failed for ${chatId}`);
      }
      return {
        messageId: `${chatId}-queued-1`,
        sender: 'human',
        content: `message for ${chatId}`,
        createdAt: '2026-03-10T12:00:00.000Z',
        status: outcome.queueStatus,
        retryCount: outcome.retryCount
      };
    });

    const { handlers, pendingHitlPromptsByChat, mocks } = await createChatFlowScenarioHarness({
      enqueueAndProcessUserTurn
    });

    const prepared = await prepareLifecycle(handlers, lifecycle.key);
    mocks.ensureWorldSubscribed.mockClear();
    mocks.restoreChat.mockClear();
    enqueueAndProcessUserTurn.mockClear();

    if (outcome.key === 'hitl') {
      pendingHitlPromptsByChat.set(
        prepared.activeChatId,
        [createPendingHitlPrompt(prepared.activeChatId, `${prepared.activeChatId}-send-hitl`)]
      );
    }

    const payload = {
      worldId: 'world-1',
      chatId: prepared.activeChatId,
      content: `${lifecycle.label} message`,
      sender: 'human'
    };

    if (outcome.key === 'error') {
      await expect(handlers.sendChatMessage(payload)).rejects.toThrow(`send failed for ${prepared.activeChatId}`);
      expect(mocks.restoreChat).toHaveBeenCalledWith('world-1', prepared.activeChatId);
      expect(enqueueAndProcessUserTurn).toHaveBeenCalledTimes(1);
      return;
    }

    const result = await handlers.sendChatMessage(payload);

    expect(mocks.restoreChat).toHaveBeenCalledWith('world-1', prepared.activeChatId);
    expect(mocks.ensureWorldSubscribed).toHaveBeenCalledTimes(2);
    expect(enqueueAndProcessUserTurn).toHaveBeenCalledWith(
      'world-1',
      prepared.activeChatId,
      `${lifecycle.label} message`,
      'human',
      expect.objectContaining({ id: 'world-1' })
    );
    expect(result).toMatchObject({
      messageId: `${prepared.activeChatId}-queued-1`,
      queueStatus: outcome.queueStatus,
      queueRetryCount: outcome.retryCount
    });

    if (outcome.key === 'hitl') {
      const selected = await handlers.selectWorldSession('world-1', prepared.activeChatId);
      expect(selected.hitlPrompts).toEqual(
        [createPendingHitlPrompt(prepared.activeChatId, `${prepared.activeChatId}-send-hitl`)]
      );
      if (prepared.previousChatId) {
        const previous = await handlers.selectWorldSession('world-1', prepared.previousChatId);
        expect(previous.hitlPrompts).toEqual([]);
      }
    }
  });

  const editLifecycleCases: Array<{ key: Extract<FlowLifecycle, 'current-chat' | 'switch-chat'>; label: string }> = [
    { key: 'current-chat', label: 'load current chat' },
    { key: 'switch-chat', label: 'switch chat' }
  ];
  const editOutcomeCases = [
    {
      key: 'success',
      label: 'success',
      resultFactory: (chatId: string) => ({
        success: true,
        messagesRemovedTotal: 2,
        resubmissionStatus: 'success',
        newMessageId: `${chatId}-edited-1`
      })
    },
    {
      key: 'hitl',
      label: 'pending HITL replay',
      resultFactory: (chatId: string) => ({
        success: true,
        messagesRemovedTotal: 2,
        resubmissionStatus: 'success',
        newMessageId: `${chatId}-edited-1`
      })
    },
    {
      key: 'error',
      label: 'error',
      resultFactory: () => ({
        success: true,
        messagesRemovedTotal: 2,
        resubmissionStatus: 'failed',
        resubmissionError: 'edit replay failed'
      })
    }
  ] as const;

  it.each(
    editLifecycleCases.flatMap((lifecycle) => editOutcomeCases.map((outcome) => ({ lifecycle, outcome })))
  )('$lifecycle.label -> edit user message -> $outcome.label', async ({ lifecycle, outcome }) => {
    const editUserMessage = vi.fn(async (_worldId: string, _messageId: string, _newContent: string, chatId: string) => (
      outcome.resultFactory(chatId)
    ));

    const { handlers, pendingHitlPromptsByChat, mocks } = await createChatFlowScenarioHarness({
      editUserMessage
    });

    const prepared = await prepareLifecycle(handlers, lifecycle.key);
    mocks.ensureWorldSubscribed.mockClear();
    mocks.restoreChat.mockClear();
    editUserMessage.mockClear();

    if (outcome.key === 'hitl') {
      pendingHitlPromptsByChat.set(
        prepared.activeChatId,
        [createPendingHitlPrompt(prepared.activeChatId, `${prepared.activeChatId}-edit-hitl`)]
      );
    }

    const result = await handlers.editMessageInChat({
      worldId: 'world-1',
      chatId: prepared.activeChatId,
      messageId: `${prepared.activeChatId}-msg-1`,
      newContent: `${lifecycle.label} edited prompt`
    });

    expect(mocks.restoreChat).toHaveBeenCalledWith('world-1', prepared.activeChatId, {
      suppressAutoResume: true,
      suppressHitlReplay: true,
    });
    expect(editUserMessage).toHaveBeenCalledWith(
      'world-1',
      `${prepared.activeChatId}-msg-1`,
      `${lifecycle.label} edited prompt`,
      prepared.activeChatId,
      expect.objectContaining({ id: 'world-1' })
    );

    if (outcome.key === 'error') {
      expect(result).toMatchObject({
        success: true,
        resubmissionStatus: 'failed',
        resubmissionError: 'edit replay failed'
      });
      return;
    }

    expect(result).toMatchObject({
      success: true,
      resubmissionStatus: 'success',
      newMessageId: `${prepared.activeChatId}-edited-1`
    });

    if (outcome.key === 'hitl') {
      const selected = await handlers.selectWorldSession('world-1', prepared.activeChatId);
      expect(selected.hitlPrompts).toEqual(
        [createPendingHitlPrompt(prepared.activeChatId, `${prepared.activeChatId}-edit-hitl`)]
      );
      if (prepared.previousChatId) {
        const previous = await handlers.selectWorldSession('world-1', prepared.previousChatId);
        expect(previous.hitlPrompts).toEqual([]);
      }
    }
  });
});

describe('createMainIpcHandlers.updateWorkspaceWorld heartbeat mapping', () => {
  it('returns a hydrated world snapshot so agents survive renderer world-save refreshes', async () => {
    const updateWorld = vi.fn(async () => ({
      id: 'world-1',
      name: 'World 1',
      description: 'Updated description',
      turnLimit: 5,
    }));
    const getWorld = vi.fn(async () => ({
      id: 'world-1',
      name: 'World 1',
      description: 'Updated description',
      turnLimit: 5,
      agents: new Map([
        ['e2e-google', {
          id: 'e2e-google',
          name: 'E2E Google',
          type: 'assistant',
          provider: 'google',
          model: 'gemini-2.5-flash',
          autoReply: true,
          memory: [],
        }]
      ]),
    }));
    const refreshWorldSubscription = vi.fn(async () => null);
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
      getWorld,
      refreshWorldSubscription,
      heartbeatManager,
    });

    const result = await handlers.updateWorkspaceWorld({
      worldId: 'world-1',
      description: 'Updated description',
    });

    expect(refreshWorldSubscription).toHaveBeenCalledWith('world-1');
    expect(getWorld).toHaveBeenCalledWith('world-1');
    expect(result).toMatchObject({
      id: 'world-1',
      name: 'World 1',
      description: 'Updated description',
      agents: [
        expect.objectContaining({
          id: 'e2e-google',
          name: 'E2E Google',
        })
      ]
    });
  });

  it('maps heartbeat fields but does not auto-start heartbeat job when saving world settings', async () => {
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
    expect(ensureWorldSubscribed).not.toHaveBeenCalled();
    expect(heartbeatManager.restartJob).not.toHaveBeenCalled();
    expect(heartbeatManager.stopJob).toHaveBeenCalledWith('world-1');
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
    expect(ensureWorldSubscribed).not.toHaveBeenCalled();
    expect(heartbeatManager.stopJob).toHaveBeenCalledWith('world-1');
  });
});

describe('createMainIpcHandlers.runHeartbeatJob', () => {
  it('syncs persisted heartbeat config onto the subscribed runtime world before starting cron', async () => {
    const runtimeWorld = {
      id: 'world-1',
      name: 'Runtime World',
      heartbeatEnabled: false,
      heartbeatInterval: null,
      heartbeatPrompt: null,
    };
    const getWorld = vi.fn(async () => ({
      id: 'world-1',
      name: 'Persisted World',
      heartbeatEnabled: true,
      heartbeatInterval: '*/5 * * * *',
      heartbeatPrompt: 'tick',
    }));
    const ensureWorldSubscribed = vi.fn(async () => runtimeWorld);
    const heartbeatManager = {
      startJob: vi.fn(),
      restartJob: vi.fn((world) => ({
        started: true,
        reason: null,
        job: {
          worldId: world.id,
          worldName: world.name,
          interval: world.heartbeatInterval,
          status: 'running',
          runCount: 0,
        },
      })),
      pauseJob: vi.fn(),
      resumeJob: vi.fn(),
      stopJob: vi.fn(),
      stopAll: vi.fn(),
      listJobs: vi.fn(() => []),
    };

    const { handlers } = await createHandlers({
      getWorld,
      ensureWorldSubscribed,
      heartbeatManager,
    });

    await expect(handlers.runHeartbeatJob({ worldId: 'world-1', chatId: 'chat-1' })).resolves.toEqual({
      ok: true,
      worldId: 'world-1',
      chatId: 'chat-1',
      status: 'running',
    });

    expect(ensureWorldSubscribed).toHaveBeenCalledWith('world-1');
    expect(heartbeatManager.restartJob).toHaveBeenCalledWith(expect.objectContaining({
      id: 'world-1',
      name: 'Persisted World',
      heartbeatEnabled: true,
      heartbeatInterval: '*/5 * * * *',
      heartbeatPrompt: 'tick',
    }), 'chat-1');
  });

  it('throws when heartbeat start does not produce a running job', async () => {
    const getWorld = vi.fn(async () => ({
      id: 'world-1',
      name: 'World 1',
      heartbeatEnabled: true,
      heartbeatInterval: '*/5 * * * *',
      heartbeatPrompt: 'tick',
    }));
    const ensureWorldSubscribed = vi.fn(async () => ({ id: 'world-1' }));
    const heartbeatManager = {
      startJob: vi.fn(),
      restartJob: vi.fn(() => ({
        started: false,
        reason: 'Heartbeat interval is invalid.',
        job: {
          worldId: 'world-1',
          worldName: 'World 1',
          interval: 'bad',
          status: 'stopped',
          runCount: 0,
        },
      })),
      pauseJob: vi.fn(),
      resumeJob: vi.fn(),
      stopJob: vi.fn(),
      stopAll: vi.fn(),
      listJobs: vi.fn(() => []),
    };

    const { handlers } = await createHandlers({
      getWorld,
      ensureWorldSubscribed,
      heartbeatManager,
    });

    await expect(handlers.runHeartbeatJob({ worldId: 'world-1', chatId: 'chat-1' })).rejects.toThrow(
      'Heartbeat interval is invalid.'
    );
  });
});
