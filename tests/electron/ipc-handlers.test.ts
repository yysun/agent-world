/**
 * Test: IPC Handlers construction
 *
 * Purpose:
 * - Verify `createMainIpcHandlers` constructs handler set when provided with
 *   dependencies where `editUserMessage` accepts an optional `targetWorld` arg.
 * - Verify `readSkillContent`, `readSkillFolderStructure`, `saveSkillContent`, and `deleteSkill` handlers
 *   manage skill SKILL.md paths via `getSkillSourcePath`.
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
 * - 2026-03-22: Added relative-path skill file coverage so the editor can open files selected from the tree view.
 * - 2026-03-22: Added skill-folder-structure handler coverage for the skill editor right pane.
 * - 2026-03-22: Added delete-skill handler coverage for removing the skill folder behind `SKILL.md`.
 * - 2026-03-08: Added readSkillContent and saveSkillContent handler tests.
 * - 2026-02-28: Added to validate optional `targetWorld` parameter acceptance.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import * as path from 'node:path';

const fsMockState = vi.hoisted(() => ({
  readFile: vi.fn(async () => '# SKILL content'),
  readdir: vi.fn(async () => []),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  cp: vi.fn(async () => undefined),
  rm: vi.fn(async () => undefined),
  existsSync: vi.fn(() => false),
  statSync: vi.fn(() => ({ isDirectory: () => false })),
}));

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  },
}), { virtual: true });

vi.mock('node:fs', () => ({
  promises: {
    readFile: fsMockState.readFile,
    readdir: fsMockState.readdir,
    writeFile: fsMockState.writeFile,
    mkdir: fsMockState.mkdir,
    cp: fsMockState.cp,
    rm: fsMockState.rm,
  },
  existsSync: fsMockState.existsSync,
  statSync: fsMockState.statSync,
  readFileSync: vi.fn(() => '{}'),
}));

vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:path')>();
  return actual;
});

import { createMainIpcHandlers } from '../../electron/main-process/ipc-handlers';

beforeEach(() => {
  vi.clearAllMocks();
  fsMockState.readFile.mockReset().mockResolvedValue('# SKILL content' as any);
  fsMockState.readdir.mockReset().mockResolvedValue([] as any);
  fsMockState.writeFile.mockReset().mockResolvedValue(undefined as any);
  fsMockState.mkdir.mockReset().mockResolvedValue(undefined as any);
  fsMockState.cp.mockReset().mockResolvedValue(undefined as any);
  fsMockState.rm.mockReset().mockResolvedValue(undefined as any);
  fsMockState.existsSync.mockReset().mockReturnValue(false);
  fsMockState.statSync.mockReset().mockReturnValue({ isDirectory: () => false } as any);
});

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
      stageGitHubWorldFromShorthand: async () => ({ stagingRootPath: '', worldFolderPath: '', source: { shorthand: '', owner: '', repo: '', branch: '', worldPath: '', commitSha: null }, cleanup: async () => { } }),
      stageGitHubFolderFromRepo: async () => ({ stagingRootPath: '', folderPath: '', source: { repoInput: '', owner: '', repo: '', branch: '', folderPath: '', commitSha: null }, cleanup: async () => { } }),
      heartbeatManager: { startJob: () => ({ started: true, reason: null, job: { status: 'running' } }), restartJob: () => ({ started: true, reason: null, job: { status: 'running' } }), pauseJob: () => { }, resumeJob: () => { }, stopJob: () => { }, stopAll: () => { }, listJobs: () => [] },
    };

    const handlers = createMainIpcHandlers(deps);
    expect(typeof handlers).toBe('object');
  });
});

describe('createMainIpcHandlers — readSkillContent / readSkillFolderStructure / saveSkillContent / deleteSkill', () => {
  const skillFilePath = path.resolve(path.sep, 'skills', 'my-skill', 'SKILL.md');
  const absoluteTestPath = (...segments: string[]) => (
    process.platform === 'win32'
      ? `C:\\${segments.join('\\')}`
      : `/${segments.join('/')}`
  );

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
      stageGitHubFolderFromRepo: async () => ({ stagingRootPath: '', folderPath: '', source: { repoInput: '', owner: '', repo: '', branch: '', folderPath: '', commitSha: null }, cleanup: async () => { } }),
      heartbeatManager: { startJob: () => ({ started: true, reason: null, job: { status: 'running' } }), restartJob: () => ({ started: true, reason: null, job: { status: 'running' } }), pauseJob: () => { }, resumeJob: () => { }, stopJob: () => { }, stopAll: () => { }, listJobs: () => [] },
    };
  }

  it('readSkillContent returns file content for a known skill path', async () => {
    const { promises: fsMock } = await import('node:fs');
    vi.mocked(fsMock.readFile).mockResolvedValue('# My Skill' as any);

    const handlers = createMainIpcHandlers(makeDeps(() => skillFilePath));
    const result = await (handlers as any).readSkillContent({ skillId: 'my-skill' });
    expect(result).toBe('# My Skill');
    expect(fsMock.readFile).toHaveBeenCalledWith(skillFilePath, 'utf8');
  });

  it('readSkillContent resolves a selected file path within the skill folder', async () => {
    const { promises: fsMock } = await import('node:fs');
    vi.mocked(fsMock.readFile).mockResolvedValue('<svg />' as any);

    const handlers = createMainIpcHandlers(makeDeps(() => skillFilePath));
    const result = await (handlers as any).readSkillContent({ skillId: 'my-skill', relativePath: 'assets/icon.svg' });

    expect(result).toBe('<svg />');
    expect(fsMock.readFile).toHaveBeenCalledWith(path.join(path.dirname(skillFilePath), 'assets', 'icon.svg'), 'utf8');
  });

  it('readSkillContent throws when skill is not in registry', async () => {
    const handlers = createMainIpcHandlers(makeDeps(() => undefined));
    await expect((handlers as any).readSkillContent({ skillId: 'unknown' }))
      .rejects.toThrow('Skill not found in registry: unknown');
  });

  it('readSkillFolderStructure returns nested entries for a known skill path', async () => {
    const { promises: fsMock } = await import('node:fs');
    vi.mocked(fsMock.readdir)
      .mockResolvedValueOnce([
        { name: 'assets', isDirectory: () => true, isFile: () => false },
        { name: 'SKILL.md', isDirectory: () => false, isFile: () => true },
      ] as any)
      .mockResolvedValueOnce([
        { name: 'icon.svg', isDirectory: () => false, isFile: () => true },
      ] as any);

    const handlers = createMainIpcHandlers(makeDeps(() => skillFilePath));
    const result = await (handlers as any).readSkillFolderStructure({ skillId: 'my-skill' });

    expect(result).toEqual([
      {
        name: 'assets',
        relativePath: 'assets',
        type: 'directory',
        children: [
          {
            name: 'icon.svg',
            relativePath: 'assets/icon.svg',
            type: 'file',
          },
        ],
      },
      {
        name: 'SKILL.md',
        relativePath: 'SKILL.md',
        type: 'file',
      },
    ]);
  });

  it('saveSkillContent writes content to the skill path', async () => {
    const { promises: fsMock } = await import('node:fs');
    vi.mocked(fsMock.writeFile).mockResolvedValue(undefined as any);

    const handlers = createMainIpcHandlers(makeDeps(() => skillFilePath));
    await (handlers as any).saveSkillContent({ skillId: 'my-skill', content: '# Updated' });
    expect(fsMock.writeFile).toHaveBeenCalledWith(skillFilePath, '# Updated', 'utf8');
  });

  it('saveSkillContent rejects paths that escape the skill folder', async () => {
    const handlers = createMainIpcHandlers(makeDeps(() => skillFilePath));

    await expect((handlers as any).saveSkillContent({
      skillId: 'my-skill',
      content: '# Updated',
      relativePath: '../outside.md',
    })).rejects.toThrow('Skill file path must stay within the skill folder.');
  });

  it('deleteSkill removes the containing skill folder for a known skill path', async () => {
    const { promises: fsMock } = await import('node:fs');
    vi.mocked(fsMock.rm).mockResolvedValue(undefined as any);

    const handlers = createMainIpcHandlers(makeDeps(() => skillFilePath));
    await (handlers as any).deleteSkill({ skillId: 'my-skill' });
    expect(fsMock.rm).toHaveBeenCalledWith(path.dirname(skillFilePath), { recursive: true, force: true });
  });

  it('importAgent saves a standalone local agent into the selected world', async () => {
    const saveAgent = vi.fn(async () => undefined);
    const importedAgentFolder = absoluteTestPath('imports', 'agent-kit');
    const importedAgentConfigPath = absoluteTestPath('imports', 'agent-kit', 'config.json');
    const workspacePath = absoluteTestPath('workspace');
    fsMockState.existsSync.mockImplementation((targetPath: string) => (
      targetPath === importedAgentFolder
      || targetPath === importedAgentConfigPath
    ));
    fsMockState.statSync.mockImplementation(() => ({ isDirectory: () => true }));
    fsMockState.readFile.mockImplementation(async (targetPath: string) => {
      if (targetPath === importedAgentConfigPath) {
        return JSON.stringify({ id: 'agent-kit', name: 'Agent Kit', type: 'assistant', provider: 'openai', model: 'gpt-4o-mini', llmCallCount: 0 });
      }
      const error = new Error(`Missing file: ${targetPath}`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    });

    const handlers = createMainIpcHandlers({
      ...makeDeps(() => undefined),
      getWorkspaceState: () => ({ workspacePath, storagePath: workspacePath, coreInitialized: true }),
      getMainWindow: () => ({ isDestroyed: () => false }),
      getWorld: vi.fn(async () => ({ id: 'world-1', name: 'World 1', agents: new Map() })),
      createStorageFromEnv: async () => ({ listAgents: async () => [], saveAgent }),
      refreshWorldSubscription: async () => null,
    } as any);

    const result = await (handlers as any).importAgent({ worldId: 'world-1', source: importedAgentFolder });
    expect(result.success).toBe(true);
    expect(saveAgent).toHaveBeenCalledWith('world-1', expect.objectContaining({ id: 'agent-kit', name: 'Agent Kit' }));
  });

  it('importSkill copies a local skill folder into the workspace skills directory', async () => {
    const syncSkills = vi.fn(async () => undefined);
    const importedSkillFolder = absoluteTestPath('imports', 'writing-skill');
    const importedSkillFilePath = absoluteTestPath('imports', 'writing-skill', 'SKILL.md');
    const workspacePath = absoluteTestPath('workspace');
    const targetSkillPath = absoluteTestPath('workspace', 'skills', 'writing-skill');
    fsMockState.existsSync.mockImplementation((targetPath: string) => (
      targetPath === importedSkillFolder
      || targetPath === importedSkillFilePath
    ));
    fsMockState.statSync.mockImplementation(() => ({ isDirectory: () => true }));
    fsMockState.cp.mockResolvedValue(undefined as any);
    fsMockState.mkdir.mockResolvedValue(undefined as any);

    const handlers = createMainIpcHandlers({
      ...makeDeps(() => undefined),
      getWorkspaceState: () => ({ workspacePath, storagePath: workspacePath, coreInitialized: true }),
      getMainWindow: () => ({ isDestroyed: () => false }),
      syncSkills,
    } as any);

    const result = await (handlers as any).importSkill({ source: importedSkillFolder });
    expect(result.success).toBe(true);
    expect(fsMockState.cp).toHaveBeenCalledWith(importedSkillFolder, targetSkillPath, { recursive: true, force: true });
    expect(syncSkills).toHaveBeenCalledWith({ projectSkillRoots: [absoluteTestPath('workspace', '.agents', 'skills'), absoluteTestPath('workspace', 'skills')] });
  });
});
