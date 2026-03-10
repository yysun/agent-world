/**
 * Test: IPC Handlers construction
 *
 * Purpose:
 * - Verify `createMainIpcHandlers` constructs handler set when provided with
 *   dependencies where `editUserMessage` accepts an optional `targetWorld` arg.
 * - Verify `readSkillContent` and `saveSkillContent` handlers read/write
 *   skill SKILL.md via `getSkillSourcePath`.
 *
 * Key features:
 * - Provides minimal stub dependencies to exercise the factory function.
 * - Uses in-memory file content mocks for skill read/write assertions.
 *
 * Notes on implementation:
 * - This test is a lightweight runtime smoke test to prevent regressions in
 *   the IPC factory wiring and to exercise the TypeScript-compatible dependency
 *   shape used by the Electron main process.
 *
 * Recent changes:
 * - 2026-03-08: Added readSkillContent and saveSkillContent handler tests.
 * - 2026-02-28: Added to validate optional `targetWorld` parameter acceptance.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  },
}), { virtual: true });

vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn(async () => '# SKILL content'),
    writeFile: vi.fn(async () => undefined),
  },
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '{}'),
}));

import { createMainIpcHandlers } from '../../electron/main-process/ipc-handlers';

describe('createMainIpcHandlers', () => {
  it('constructs handlers when editUserMessage accepts a fifth arg', () => {
    const deps: any = {
      ensureCoreReady: async () => { },
      getWorkspaceState: () => ({ workspacePath: null, storagePath: null, coreInitialized: false }),
      getMainWindow: () => null,
      removeWorldSubscriptions: async () => { },
      refreshWorldSubscription: async () => null,
      ensureWorldSubscribed: async () => ({}),
      createAgent: async () => ({}),
      createWorld: async () => ({}),
      deleteAgent: async () => true,
      deleteChat: async () => true,
      updateAgent: async () => ({}),
      deleteWorld: async () => true,
      getMemory: async () => null,
      getWorld: async () => null,
      listChats: async () => [],
      listWorlds: async () => [],
      getSkillSourceScope: () => undefined,
      getSkillSourcePath: () => undefined,
      getSkillsForSystemPrompt: () => [],
      syncSkills: async () => { },
      newChat: async () => ({}),
      branchChatFromMessage: async () => ({}),
      enqueueAndProcessUserTurn: async () => ({ messageId: 'm', sender: 's', content: 'c', createdAt: new Date().toISOString() }),
      submitWorldHitlResponse: () => ({ accepted: true }),
      stopMessageProcessing: async () => { },
      activateChatWithSnapshot: async () => null,
      restoreChat: async () => ({}),
      updateWorld: async () => ({}),
      editUserMessage: async (worldId: string, messageId: string, newContent: string, chatId: string, targetWorld?: any) => ({}),
      removeMessagesFrom: async () => ({}),
      addToQueue: async () => ({}),
      getQueueMessages: async () => ([]),
      removeFromQueue: async () => ({}),
      pauseChatQueue: async () => ({}),
      resumeChatQueue: async () => ({}),
      stopChatQueue: async () => ({}),
      clearChatQueue: async () => ({}),
      retryQueueMessage: async () => ({}),
      createStorage: async () => ({}),
      createStorageFromEnv: async () => ({}),
      loggerIpc: { debug: () => { }, info: () => { }, warn: () => { }, error: () => { } },
      loggerIpcSession: { debug: () => { }, info: () => { }, warn: () => { }, error: () => { } },
      loggerIpcMessages: { debug: () => { }, info: () => { }, warn: () => { }, error: () => { } },
      GitHubWorldImportError: Error,
      stageGitHubWorldFromShorthand: async () => ({ stagingRootPath: '', worldFolderPath: '', source: { shorthand: '', owner: '', repo: '', branch: '', worldPath: '', commitSha: null }, cleanup: async () => { } })
    };

    const handlers = createMainIpcHandlers(deps);
    expect(typeof handlers).toBe('object');
  });
});

describe('createMainIpcHandlers — readSkillContent / saveSkillContent', () => {
  function makeDeps(getSkillSourcePathImpl: (id: string) => string | undefined): any {
    return {
      ensureCoreReady: async () => { },
      getWorkspaceState: () => ({ workspacePath: null, storagePath: null, coreInitialized: false }),
      getMainWindow: () => null,
      removeWorldSubscriptions: async () => { },
      refreshWorldSubscription: async () => null,
      ensureWorldSubscribed: async () => ({}),
      createAgent: async () => ({}),
      createWorld: async () => ({}),
      deleteAgent: async () => true,
      deleteChat: async () => true,
      updateAgent: async () => ({}),
      deleteWorld: async () => true,
      getMemory: async () => null,
      getWorld: async () => null,
      listChats: async () => [],
      listWorlds: async () => [],
      getSkillSourceScope: () => undefined,
      getSkillSourcePath: getSkillSourcePathImpl,
      getSkillsForSystemPrompt: () => [],
      syncSkills: async () => { },
      newChat: async () => ({}),
      branchChatFromMessage: async () => ({}),
      enqueueAndProcessUserTurn: async () => ({ messageId: 'm', sender: 's', content: 'c', createdAt: new Date().toISOString() }),
      submitWorldHitlResponse: () => ({ accepted: true }),
      stopMessageProcessing: async () => { },
      activateChatWithSnapshot: async () => null,
      restoreChat: async () => ({}),
      updateWorld: async () => ({}),
      editUserMessage: async () => ({}),
      removeMessagesFrom: async () => ({}),
      addToQueue: async () => ({}),
      getQueueMessages: async () => ([]),
      removeFromQueue: async () => ({}),
      pauseChatQueue: async () => ({}),
      resumeChatQueue: async () => ({}),
      stopChatQueue: async () => ({}),
      clearChatQueue: async () => ({}),
      retryQueueMessage: async () => ({}),
      createStorage: async () => ({}),
      createStorageFromEnv: async () => ({}),
      loggerIpc: { debug: () => { }, info: () => { }, warn: () => { }, error: () => { } },
      loggerIpcSession: { debug: () => { }, info: () => { }, warn: () => { }, error: () => { } },
      loggerIpcMessages: { debug: () => { }, info: () => { }, warn: () => { }, error: () => { } },
      GitHubWorldImportError: Error,
      stageGitHubWorldFromShorthand: async () => ({ stagingRootPath: '', worldFolderPath: '', source: { shorthand: '', owner: '', repo: '', branch: '', worldPath: '', commitSha: null }, cleanup: async () => { } }),
    };
  }

  it('readSkillContent returns file content for a known skill path', async () => {
    const { promises: fsMock } = await import('node:fs');
    vi.mocked(fsMock.readFile).mockResolvedValue('# My Skill' as any);

    const handlers = createMainIpcHandlers(makeDeps(() => '/skills/my-skill/SKILL.md'));
    const result = await (handlers as any).readSkillContent({ skillId: 'my-skill' });
    expect(result).toBe('# My Skill');
    expect(fsMock.readFile).toHaveBeenCalledWith('/skills/my-skill/SKILL.md', 'utf8');
  });

  it('readSkillContent throws when skill is not in registry', async () => {
    const handlers = createMainIpcHandlers(makeDeps(() => undefined));
    await expect((handlers as any).readSkillContent({ skillId: 'unknown' }))
      .rejects.toThrow('Skill not found in registry: unknown');
  });

  it('saveSkillContent writes content to the skill path', async () => {
    const { promises: fsMock } = await import('node:fs');
    vi.mocked(fsMock.writeFile).mockResolvedValue(undefined as any);

    const handlers = createMainIpcHandlers(makeDeps(() => '/skills/my-skill/SKILL.md'));
    await (handlers as any).saveSkillContent({ skillId: 'my-skill', content: '# Updated' });
    expect(fsMock.writeFile).toHaveBeenCalledWith('/skills/my-skill/SKILL.md', '# Updated', 'utf8');
  });
});
