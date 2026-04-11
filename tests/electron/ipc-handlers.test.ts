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
 * - 2026-04-11: Added local skill-root discovery coverage for root SKILL.md plus nested skills-directory folders.
 * - 2026-04-11: GitHub skill listing assertions now cover description extraction from staged SKILL.md files.
 * - 2026-04-11: Added canonical dot-directory skill-root coverage for GitHub discovery/import
 *   and canonical-first project/global skill sync roots.
 * - 2026-04-03: Root GitHub skill listing/import now use the SKILL.md `name` front-matter field when present.
 * - 2026-04-03: Added GitHub root-skill discovery/import coverage for repo-level SKILL.md installs.
 * - 2026-03-22: Added relative-path skill file coverage so the editor can open files selected from the tree view.
 * - 2026-03-22: Added skill-folder-structure handler coverage for the skill editor right pane.
 * - 2026-03-22: Added delete-skill handler coverage for removing the skill folder behind `SKILL.md`.
 * - 2026-03-08: Added readSkillContent and saveSkillContent handler tests.
 * - 2026-02-28: Added to validate optional `targetWorld` parameter acceptance.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import * as path from 'node:path';
import { homedir } from 'node:os';

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
      listGitHubDirectoryNames: async () => ({ directoryNames: [] }),
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
      listGitHubDirectoryNames: async () => ({ directoryNames: [], fileNames: [] }),
      heartbeatManager: { startJob: () => ({ started: true, reason: null, job: { status: 'running' } }), restartJob: () => ({ started: true, reason: null, job: { status: 'running' } }), pauseJob: () => { }, resumeJob: () => { }, stopJob: () => { }, stopAll: () => { }, listJobs: () => [] },
    };
  }

  it('listGitHubSkills returns skill directory names from the canonical .agent-world folder', async () => {
    const plannerSkillPath = absoluteTestPath('staging', 'planner', 'SKILL.md');
    const reviewerSkillPath = absoluteTestPath('staging', 'reviewer', 'SKILL.md');
    const listGitHubDirectoryNames = vi.fn(async (_repo: string, directoryPath: string) => (
      directoryPath === '.'
        ? { directoryNames: ['.agent-world'], fileNames: [] }
        : { directoryNames: ['planner', 'reviewer'], fileNames: [] }
    ));
    const stageGitHubFolderFromRepo = vi.fn(async (_repoInput: string, folderPath: string, options?: { folderName?: string }) => ({
      stagingRootPath: absoluteTestPath('staging'),
      folderPath: absoluteTestPath('staging', String(options?.folderName || 'skill')),
      source: {
        repoInput: 'yysun/awesome-agent-world',
        owner: 'yysun',
        repo: 'awesome-agent-world',
        branch: 'main',
        folderPath,
        commitSha: null,
      },
      cleanup: vi.fn(async () => undefined),
    }));
    fsMockState.readFile.mockImplementation(async (targetPath: string) => {
      if (targetPath === plannerSkillPath) {
        return '---\ndescription: Plans work before implementation.\n---\n# Planner';
      }
      if (targetPath === reviewerSkillPath) {
        return '---\ndescription: Reviews changes for regressions.\n---\n# Reviewer';
      }
      return '# SKILL content';
    });

    const handlers = createMainIpcHandlers({
      ...makeDeps(() => undefined),
      listGitHubDirectoryNames,
      stageGitHubFolderFromRepo,
    } as any);

    await expect((handlers as any).listGitHubSkills({ repo: 'yysun/awesome-agent-world' })).resolves.toEqual([
      { skillId: 'planner', description: 'Plans work before implementation.' },
      { skillId: 'reviewer', description: 'Reviews changes for regressions.' },
    ]);
    expect(listGitHubDirectoryNames).toHaveBeenNthCalledWith(1, 'yysun/awesome-agent-world', '.');
    expect(listGitHubDirectoryNames).toHaveBeenCalledWith('yysun/awesome-agent-world', '.agent-world/skills');
  });

  it('listGitHubSkills returns skill directory names from a top-level skills folder', async () => {
    const musicSkillPath = absoluteTestPath('staging', 'music-to-svg', 'SKILL.md');
    const notebookSkillPath = absoluteTestPath('staging', 'notebooklm', 'SKILL.md');
    const listGitHubDirectoryNames = vi.fn(async (_repo: string, directoryPath: string) => (
      directoryPath === '.'
        ? { directoryNames: ['skills'], fileNames: [] }
        : { directoryNames: ['music-to-svg', 'notebooklm'], fileNames: [] }
    ));
    const stageGitHubFolderFromRepo = vi.fn(async (_repoInput: string, folderPath: string, options?: { folderName?: string }) => ({
      stagingRootPath: absoluteTestPath('staging'),
      folderPath: absoluteTestPath('staging', String(options?.folderName || 'skill')),
      source: {
        repoInput: 'yysun/awesome-agent-world',
        owner: 'yysun',
        repo: 'awesome-agent-world',
        branch: 'main',
        folderPath,
        commitSha: null,
      },
      cleanup: vi.fn(async () => undefined),
    }));
    fsMockState.readFile.mockImplementation(async (targetPath: string) => {
      if (targetPath === musicSkillPath) {
        return '---\ndescription: Convert music notation into SVG assets.\n---\n# music-to-svg';
      }
      if (targetPath === notebookSkillPath) {
        return '---\ndescription: NotebookLM workflows and automation.\n---\n# notebooklm';
      }
      return '# SKILL content';
    });

    const handlers = createMainIpcHandlers({
      ...makeDeps(() => undefined),
      listGitHubDirectoryNames,
      stageGitHubFolderFromRepo,
    } as any);

    await expect((handlers as any).listGitHubSkills({ repo: 'yysun/awesome-agent-world' })).resolves.toEqual([
      { skillId: 'music-to-svg', description: 'Convert music notation into SVG assets.' },
      { skillId: 'notebooklm', description: 'NotebookLM workflows and automation.' },
    ]);
    expect(listGitHubDirectoryNames).toHaveBeenNthCalledWith(1, 'yysun/awesome-agent-world', '.');
    expect(listGitHubDirectoryNames).toHaveBeenCalledWith('yysun/awesome-agent-world', 'skills');
  });

  it('listGitHubSkills ignores legacy .agents folders', async () => {
    const listGitHubDirectoryNames = vi.fn(async (_repo: string, directoryPath: string) => {
      if (directoryPath === '.') {
        return { directoryNames: ['.agents'], fileNames: [] };
      }
      throw new Error(`Unexpected directoryPath: ${directoryPath}`);
    });

    const handlers = createMainIpcHandlers({
      ...makeDeps(() => undefined),
      listGitHubDirectoryNames,
    } as any);

    await expect((handlers as any).listGitHubSkills({ repo: 'yysun/awesome-agent-world' })).resolves.toEqual([]);
    expect(listGitHubDirectoryNames).toHaveBeenNthCalledWith(1, 'yysun/awesome-agent-world', '.');
    expect(listGitHubDirectoryNames).toHaveBeenCalledTimes(1);
  });

  it('listGitHubSkills includes the repo name when the repo root contains SKILL.md', async () => {
    const rootSkillPath = absoluteTestPath('staging', 'awesome-agent-world', 'SKILL.md');
    const listGitHubDirectoryNames = vi.fn(async (_repo: string, directoryPath: string) => (
      directoryPath === '.'
        ? { directoryNames: ['.agent-world'], fileNames: ['SKILL.md'] }
        : { directoryNames: ['planner'], fileNames: [] }
    ));
    fsMockState.readFile.mockImplementation(async (targetPath: string) => {
      if (targetPath === rootSkillPath) {
        return '---\nname: repo-root-skill\n---\n# Root skill';
      }
      return '# SKILL content';
    });
    const cleanup = vi.fn(async () => undefined);
    const stageGitHubFolderFromRepo = vi.fn(async (_repoInput: string, folderPath: string, options?: { folderName?: string }) => {
      if (folderPath === 'SKILL.md') {
        expect(options).toEqual({ folderName: 'awesome-agent-world' });
      }
      return {
        stagingRootPath: absoluteTestPath('staging'),
        folderPath: absoluteTestPath('staging', String(options?.folderName || 'awesome-agent-world')),
        source: {
          repoInput: 'yysun/awesome-agent-world',
          owner: 'yysun',
          repo: 'awesome-agent-world',
          branch: 'main',
          folderPath,
          commitSha: null,
        },
        cleanup,
      };
    });

    const handlers = createMainIpcHandlers({
      ...makeDeps(() => undefined),
      listGitHubDirectoryNames,
      stageGitHubFolderFromRepo,
    } as any);

    await expect((handlers as any).listGitHubSkills({ repo: 'yysun/awesome-agent-world' })).resolves.toEqual([
      { skillId: 'awesome-agent-world', description: '' },
      { skillId: 'planner', description: '' },
      { skillId: 'repo-root-skill', description: '' },
    ]);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('listLocalSkills discovers root SKILL.md plus nested skills folders under the chosen root', async () => {
    const rootPath = absoluteTestPath('workspace', 'demo');
    const dotAgentWorldPath = absoluteTestPath('workspace', 'demo', '.agent-world');
    const dotAgentWorldSkillsPath = absoluteTestPath('workspace', 'demo', '.agent-world', 'skills');
    const packagesPath = absoluteTestPath('workspace', 'demo', 'packages');
    const packagesToolsPath = absoluteTestPath('workspace', 'demo', 'packages', 'tools');
    const packagesToolsSkillsPath = absoluteTestPath('workspace', 'demo', 'packages', 'tools', 'skills');
    const rootSkillPath = absoluteTestPath('workspace', 'demo', 'SKILL.md');
    const reviewerSkillPath = absoluteTestPath('workspace', 'demo', '.agent-world', 'skills', 'reviewer', 'SKILL.md');
    const plannerSkillPath = absoluteTestPath('workspace', 'demo', 'packages', 'tools', 'skills', 'planner', 'SKILL.md');
    const existingPaths = new Set([
      path.normalize(rootPath),
      path.normalize(rootSkillPath),
      path.normalize(reviewerSkillPath),
      path.normalize(plannerSkillPath),
    ]);
    fsMockState.existsSync.mockImplementation((targetPath: string) => (
      typeof targetPath === 'string' && existingPaths.has(path.normalize(targetPath))
    ));
    fsMockState.statSync.mockImplementation((targetPath: string) => ({
      isDirectory: () => path.normalize(String(targetPath || '')) === path.normalize(rootPath),
    }) as any);
    fsMockState.readdir.mockImplementation(async (targetPath: string, options?: { withFileTypes?: boolean }) => {
      const withFileTypes = options?.withFileTypes === true;
      const dirent = (name: string, isDirectory: boolean) => ({
        name,
        isDirectory: () => isDirectory,
      });
      const normalizedPath = path.normalize(targetPath);

      if (normalizedPath === path.normalize(rootPath)) {
        return withFileTypes ? [dirent('.agent-world', true), dirent('packages', true)] as any : ['.agent-world', 'packages'] as any;
      }
      if (normalizedPath === path.normalize(dotAgentWorldPath)) {
        return withFileTypes ? [dirent('skills', true)] as any : ['skills'] as any;
      }
      if (normalizedPath === path.normalize(dotAgentWorldSkillsPath)) {
        return withFileTypes ? [dirent('reviewer', true)] as any : ['reviewer'] as any;
      }
      if (normalizedPath === path.normalize(packagesPath)) {
        return withFileTypes ? [dirent('tools', true)] as any : ['tools'] as any;
      }
      if (normalizedPath === path.normalize(packagesToolsPath)) {
        return withFileTypes ? [dirent('skills', true)] as any : ['skills'] as any;
      }
      if (normalizedPath === path.normalize(packagesToolsSkillsPath)) {
        return withFileTypes ? [dirent('planner', true)] as any : ['planner'] as any;
      }
      return withFileTypes ? [] as any : [] as any;
    });
    fsMockState.readFile.mockImplementation(async (targetPath: string) => {
      if (targetPath === rootSkillPath) {
        return '---\nname: repo-root-skill\ndescription: Root skill description.\n---\n# Root';
      }
      if (targetPath === reviewerSkillPath) {
        return '---\ndescription: Reviews changes for regressions.\n---\n# Reviewer';
      }
      if (targetPath === plannerSkillPath) {
        return '---\ndescription: Plans implementation steps.\n---\n# Planner';
      }
      return '# SKILL content';
    });

    const handlers = createMainIpcHandlers(makeDeps(() => undefined));

    await expect((handlers as any).listLocalSkills({ source: rootPath })).resolves.toEqual([
      {
        skillId: 'repo-root-skill',
        description: 'Root skill description.',
        folderPath: rootPath,
        relativePath: '.',
      },
      {
        skillId: 'reviewer',
        description: 'Reviews changes for regressions.',
        folderPath: absoluteTestPath('workspace', 'demo', '.agent-world', 'skills', 'reviewer'),
        relativePath: '.agent-world/skills/reviewer',
      },
      {
        skillId: 'planner',
        description: 'Plans implementation steps.',
        folderPath: absoluteTestPath('workspace', 'demo', 'packages', 'tools', 'skills', 'planner'),
        relativePath: 'packages/tools/skills/planner',
      },
    ]);
  });

  it('listLocalSkills expands tilde-prefixed home paths before scanning', async () => {
    const rootPath = path.join(homedir(), '.agents', 'skills');
    const reviewerSkillPath = path.join(rootPath, 'reviewer', 'SKILL.md');
    const existingPaths = new Set([
      path.normalize(rootPath),
      path.normalize(reviewerSkillPath),
    ]);
    fsMockState.existsSync.mockImplementation((targetPath: string) => (
      typeof targetPath === 'string' && existingPaths.has(path.normalize(targetPath))
    ));
    fsMockState.statSync.mockImplementation((targetPath: string) => ({
      isDirectory: () => path.normalize(String(targetPath || '')) === path.normalize(rootPath),
    }) as any);
    fsMockState.readdir.mockImplementation(async (targetPath: string, options?: { withFileTypes?: boolean }) => {
      const withFileTypes = options?.withFileTypes === true;
      const dirent = (name: string, isDirectory: boolean) => ({
        name,
        isDirectory: () => isDirectory,
        isSymbolicLink: () => false,
      });
      const normalizedPath = path.normalize(targetPath);

      if (normalizedPath === path.normalize(rootPath)) {
        return withFileTypes ? [dirent('reviewer', true)] as any : ['reviewer'] as any;
      }

      return withFileTypes ? [] as any : [] as any;
    });
    fsMockState.readFile.mockImplementation(async (targetPath: string) => {
      if (path.normalize(targetPath) === path.normalize(reviewerSkillPath)) {
        return '---\ndescription: Reviews home skill folders.\n---\n# Reviewer';
      }
      return '# SKILL content';
    });

    const handlers = createMainIpcHandlers(makeDeps(() => undefined));

    await expect((handlers as any).listLocalSkills({ source: '~/.agents/skills' })).resolves.toEqual([
      {
        skillId: 'reviewer',
        description: 'Reviews home skill folders.',
        folderPath: path.join(rootPath, 'reviewer'),
        relativePath: 'reviewer',
      },
    ]);
  });

  it('listLocalSkills skips ignored dependency and build directories while scanning', async () => {
    const rootPath = absoluteTestPath('workspace', 'scan-root');
    const nodeModulesPath = absoluteTestPath('workspace', 'scan-root', 'node_modules');
    const nodeModulesSkillsPath = absoluteTestPath('workspace', 'scan-root', 'node_modules', 'vendor-package', 'skills');
    const packagesPath = absoluteTestPath('workspace', 'scan-root', 'packages');
    const appPath = absoluteTestPath('workspace', 'scan-root', 'packages', 'app');
    const appSkillsPath = absoluteTestPath('workspace', 'scan-root', 'packages', 'app', 'skills');
    const realSkillPath = absoluteTestPath('workspace', 'scan-root', 'packages', 'app', 'skills', 'reviewer', 'SKILL.md');
    const ignoredSkillPath = absoluteTestPath('workspace', 'scan-root', 'node_modules', 'vendor-package', 'skills', 'shadow-reviewer', 'SKILL.md');
    const existingPaths = new Set([
      path.normalize(rootPath),
      path.normalize(realSkillPath),
      path.normalize(ignoredSkillPath),
    ]);
    fsMockState.existsSync.mockImplementation((targetPath: string) => (
      typeof targetPath === 'string' && existingPaths.has(path.normalize(targetPath))
    ));
    fsMockState.statSync.mockImplementation((targetPath: string) => ({
      isDirectory: () => path.normalize(String(targetPath || '')) === path.normalize(rootPath),
    }) as any);
    fsMockState.readdir.mockImplementation(async (targetPath: string, options?: { withFileTypes?: boolean }) => {
      const withFileTypes = options?.withFileTypes === true;
      const dirent = (name: string, isDirectory: boolean) => ({
        name,
        isDirectory: () => isDirectory,
        isSymbolicLink: () => false,
      });
      const normalizedPath = path.normalize(targetPath);

      if (normalizedPath === path.normalize(rootPath)) {
        return withFileTypes ? [dirent('node_modules', true), dirent('packages', true)] as any : ['node_modules', 'packages'] as any;
      }
      if (normalizedPath === path.normalize(packagesPath)) {
        return withFileTypes ? [dirent('app', true)] as any : ['app'] as any;
      }
      if (normalizedPath === path.normalize(appPath)) {
        return withFileTypes ? [dirent('skills', true)] as any : ['skills'] as any;
      }
      if (normalizedPath === path.normalize(appSkillsPath)) {
        return withFileTypes ? [dirent('reviewer', true)] as any : ['reviewer'] as any;
      }
      if (normalizedPath === path.normalize(nodeModulesPath)) {
        return withFileTypes ? [dirent('vendor-package', true)] as any : ['vendor-package'] as any;
      }
      if (normalizedPath === path.normalize(nodeModulesSkillsPath)) {
        return withFileTypes ? [dirent('shadow-reviewer', true)] as any : ['shadow-reviewer'] as any;
      }
      return withFileTypes ? [] as any : [] as any;
    });
    fsMockState.readFile.mockImplementation(async (targetPath: string) => {
      if (targetPath === realSkillPath) {
        return '---\ndescription: Real reviewer skill.\n---\n# Reviewer';
      }
      if (targetPath === ignoredSkillPath) {
        return '---\ndescription: Should be ignored.\n---\n# Shadow Reviewer';
      }
      return '# SKILL content';
    });

    const handlers = createMainIpcHandlers(makeDeps(() => undefined));

    await expect((handlers as any).listLocalSkills({ source: rootPath })).resolves.toEqual([
      {
        skillId: 'reviewer',
        description: 'Real reviewer skill.',
        folderPath: absoluteTestPath('workspace', 'scan-root', 'packages', 'app', 'skills', 'reviewer'),
        relativePath: 'packages/app/skills/reviewer',
      },
    ]);
  });

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

  it('importSkill copies a local skill folder into the canonical project skills directory', async () => {
    const syncSkills = vi.fn(async () => undefined);
    const importedSkillFolder = absoluteTestPath('imports', 'writing-skill');
    const importedSkillFilePath = absoluteTestPath('imports', 'writing-skill', 'SKILL.md');
    const workspacePath = absoluteTestPath('workspace');
    const targetSkillPath = absoluteTestPath('workspace', '.agent-world', 'skills', 'writing-skill');
    const existingPaths = new Set([
      path.normalize(importedSkillFolder),
      path.normalize(importedSkillFilePath),
    ]);
    fsMockState.existsSync.mockImplementation((targetPath: string) => (
      typeof targetPath === 'string' && existingPaths.has(path.normalize(targetPath))
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
    expect(syncSkills).toHaveBeenCalledWith({ projectSkillRoots: [absoluteTestPath('workspace', '.agent-world', 'skills')] });
  });

  it('importSkill resolves project-scope installs under the explicit project folder root', async () => {
    const syncSkills = vi.fn(async () => undefined);
    const importedSkillFolder = absoluteTestPath('imports', 'writing-skill');
    const importedSkillFilePath = absoluteTestPath('imports', 'writing-skill', 'SKILL.md');
    const workspacePath = absoluteTestPath('workspace');
    const projectPath = absoluteTestPath('workspace', 'apps', 'demo');
    const targetSkillPath = absoluteTestPath('workspace', 'apps', 'demo', '.agent-world', 'skills', 'writing-skill');
    const existingPaths = new Set([
      path.normalize(importedSkillFolder),
      path.normalize(importedSkillFilePath),
    ]);
    fsMockState.existsSync.mockImplementation((targetPath: string) => (
      typeof targetPath === 'string' && existingPaths.has(path.normalize(targetPath))
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

    const result = await (handlers as any).importSkill({ source: importedSkillFolder, projectPath });
    expect(result.success).toBe(true);
    expect(fsMockState.cp).toHaveBeenCalledWith(importedSkillFolder, targetSkillPath, { recursive: true, force: true });
    expect(syncSkills).toHaveBeenCalledWith({ projectSkillRoots: [absoluteTestPath('workspace', 'apps', 'demo', '.agent-world', 'skills')] });
  });

  it('importSkill resolves GitHub project-scope installs under the explicit project folder root', async () => {
    class MockGitHubWorldImportError extends Error {
      code: string;
      details?: Record<string, unknown>;

      constructor(code: string, message: string, details?: Record<string, unknown>) {
        super(message);
        this.name = 'GitHubWorldImportError';
        this.code = code;
        this.details = details;
      }
    }

    const syncSkills = vi.fn(async () => undefined);
    const workspacePath = absoluteTestPath('workspace');
    const projectPath = absoluteTestPath('workspace', 'apps', 'demo');
    const stagedSkillFolder = absoluteTestPath('staging', 'repo-root-skill');
    const stagedSkillFilePath = absoluteTestPath('staging', 'repo-root-skill', 'SKILL.md');
    const targetSkillPath = absoluteTestPath('workspace', 'apps', 'demo', '.agent-world', 'skills', 'repo-root-skill');
    const existingPaths = new Set([
      path.normalize(stagedSkillFolder),
      path.normalize(stagedSkillFilePath),
    ]);
    fsMockState.existsSync.mockImplementation((targetPath: string) => (
      typeof targetPath === 'string' && existingPaths.has(path.normalize(targetPath))
    ));
    fsMockState.statSync.mockImplementation(() => ({ isDirectory: () => true }));
    fsMockState.cp.mockResolvedValue(undefined as any);

    const cleanup = vi.fn(async () => undefined);
    const stageGitHubFolderFromRepo = vi.fn(async (_repoInput: string, folderPath: string, options?: { folderName?: string }) => {
      if (folderPath === '.agent-world/skills/repo-root-skill') {
        return {
          stagingRootPath: absoluteTestPath('staging'),
          folderPath: stagedSkillFolder,
          source: {
            repoInput: 'yysun/awesome-agent-world',
            owner: 'yysun',
            repo: 'awesome-agent-world',
            branch: 'main',
            folderPath,
            commitSha: null,
          },
          cleanup,
        };
      }

      throw new MockGitHubWorldImportError('source-not-found', `Missing ${folderPath}`, { folderName: options?.folderName });
    });

    const handlers = createMainIpcHandlers({
      ...makeDeps(() => undefined),
      GitHubWorldImportError: MockGitHubWorldImportError,
      stageGitHubFolderFromRepo,
      getWorkspaceState: () => ({ workspacePath, storagePath: workspacePath, coreInitialized: true }),
      getMainWindow: () => ({ isDestroyed: () => false }),
      syncSkills,
    } as any);

    const result = await (handlers as any).importSkill({
      repo: 'yysun/awesome-agent-world',
      itemName: 'repo-root-skill',
      projectPath,
    });

    expect(result.success).toBe(true);
    expect(fsMockState.cp).toHaveBeenCalledWith(stagedSkillFolder, targetSkillPath, { recursive: true, force: true });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(syncSkills).toHaveBeenCalledWith({ projectSkillRoots: [absoluteTestPath('workspace', 'apps', 'demo', '.agent-world', 'skills')] });
  });

  it('importSkill copies the source skill first and only overlays edited draft files', async () => {
    const syncSkills = vi.fn(async () => undefined);
    const importedSkillFolder = absoluteTestPath('imports', 'writing-skill');
    const importedSkillFilePath = absoluteTestPath('imports', 'writing-skill', 'SKILL.md');
    const importedSkillImagePath = absoluteTestPath('imports', 'writing-skill', 'assets', 'banner.png');
    const workspacePath = absoluteTestPath('workspace');
    const targetSkillPath = absoluteTestPath('workspace', '.agent-world', 'skills', 'writing-skill');
    const targetSkillFilePath = absoluteTestPath('workspace', '.agent-world', 'skills', 'writing-skill', 'SKILL.md');

    const existingPaths = new Set([
      path.normalize(importedSkillFolder),
      path.normalize(importedSkillFilePath),
      path.normalize(importedSkillImagePath),
    ]);
    fsMockState.existsSync.mockImplementation((targetPath: string) => (
      typeof targetPath === 'string' && existingPaths.has(path.normalize(targetPath))
    ));
    fsMockState.statSync.mockImplementation(() => ({ isDirectory: () => true }));

    const handlers = createMainIpcHandlers({
      ...makeDeps(() => undefined),
      getWorkspaceState: () => ({ workspacePath, storagePath: workspacePath, coreInitialized: true }),
      getMainWindow: () => ({ isDestroyed: () => false }),
      syncSkills,
    } as any);

    const result = await (handlers as any).importSkill({
      source: importedSkillFolder,
      itemName: 'writing-skill',
      files: {
        'SKILL.md': '# Updated skill',
      },
    });

    expect(result.success).toBe(true);
    expect(fsMockState.cp).toHaveBeenCalledWith(importedSkillFolder, targetSkillPath, { recursive: true, force: true });
    expect(fsMockState.writeFile).toHaveBeenCalledWith(targetSkillFilePath, '# Updated skill', 'utf8');
    expect(fsMockState.writeFile).toHaveBeenCalledTimes(1);
    expect(syncSkills).toHaveBeenCalledWith({ projectSkillRoots: [absoluteTestPath('workspace', '.agent-world', 'skills')] });
  });

  it('importSkill copies a global skill into the canonical global skills directory', async () => {
    const syncSkills = vi.fn(async () => undefined);
    const importedSkillFolder = absoluteTestPath('imports', 'writing-skill');
    const importedSkillFilePath = absoluteTestPath('imports', 'writing-skill', 'SKILL.md');
    const workspacePath = absoluteTestPath('workspace');
    const targetSkillPath = path.join(homedir(), '.agent-world', 'skills', 'writing-skill');
    const existingPaths = new Set([
      path.normalize(importedSkillFolder),
      path.normalize(importedSkillFilePath),
    ]);
    fsMockState.existsSync.mockImplementation((targetPath: string) => (
      typeof targetPath === 'string' && existingPaths.has(path.normalize(targetPath))
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

    const result = await (handlers as any).importSkill({ source: importedSkillFolder, targetScope: 'global' });
    expect(result.success).toBe(true);
    expect(fsMockState.cp).toHaveBeenCalledWith(importedSkillFolder, targetSkillPath, { recursive: true, force: true });
    expect(syncSkills).toHaveBeenCalledWith({ userSkillRoots: [path.join(homedir(), '.agent-world', 'skills')] });
  });

  it('importSkill falls back to repo-root SKILL.md when the selected skill matches the root front-matter name', async () => {
    class MockGitHubWorldImportError extends Error {
      code: string;
      details?: Record<string, unknown>;

      constructor(code: string, message: string, details?: Record<string, unknown>) {
        super(message);
        this.name = 'GitHubWorldImportError';
        this.code = code;
        this.details = details;
      }
    }

    const syncSkills = vi.fn(async () => undefined);
    const workspacePath = absoluteTestPath('workspace');
    const stagedSkillFolder = absoluteTestPath('staging', 'repo-root-skill');
    const stagedSkillFilePath = absoluteTestPath('staging', 'repo-root-skill', 'SKILL.md');
    const targetSkillPath = absoluteTestPath('workspace', '.agent-world', 'skills', 'repo-root-skill');
    const existingPaths = new Set([
      path.normalize(stagedSkillFolder),
      path.normalize(stagedSkillFilePath),
    ]);
    fsMockState.existsSync.mockImplementation((targetPath: string) => (
      typeof targetPath === 'string' && existingPaths.has(path.normalize(targetPath))
    ));
    fsMockState.statSync.mockImplementation(() => ({ isDirectory: () => true }));
    fsMockState.readFile.mockImplementation(async (targetPath: string) => {
      if (targetPath === stagedSkillFilePath) {
        return '---\nname: repo-root-skill\n---\n# Root skill';
      }
      return '# SKILL content';
    });

    const cleanup = vi.fn(async () => undefined);
    const stageGitHubFolderFromRepo = vi.fn(async (_repoInput: string, folderPath: string, options?: { folderName?: string }) => {
      if (folderPath === 'SKILL.md') {
        return {
          stagingRootPath: absoluteTestPath('staging'),
          folderPath: stagedSkillFolder,
          source: {
            repoInput: 'yysun/awesome-agent-world',
            owner: 'yysun',
            repo: 'awesome-agent-world',
            branch: 'main',
            folderPath,
            commitSha: null,
          },
          cleanup,
        };
      }

      throw new MockGitHubWorldImportError('source-not-found', `Missing ${folderPath}`, { folderName: options?.folderName });
    });

    const handlers = createMainIpcHandlers({
      ...makeDeps(() => undefined),
      GitHubWorldImportError: MockGitHubWorldImportError,
      stageGitHubFolderFromRepo,
      getWorkspaceState: () => ({ workspacePath, storagePath: workspacePath, coreInitialized: true }),
      getMainWindow: () => ({ isDestroyed: () => false }),
      syncSkills,
    } as any);

    const result = await (handlers as any).importSkill({
      repo: 'yysun/awesome-agent-world',
      itemName: 'repo-root-skill',
    });

    expect(result.success).toBe(true);
    expect(stageGitHubFolderFromRepo).toHaveBeenNthCalledWith(1, 'yysun/awesome-agent-world', '.agent-world/skills/repo-root-skill', { folderName: 'repo-root-skill' });
    expect(stageGitHubFolderFromRepo).toHaveBeenNthCalledWith(2, 'yysun/awesome-agent-world', 'skills/repo-root-skill', { folderName: 'repo-root-skill' });
    expect(stageGitHubFolderFromRepo).toHaveBeenNthCalledWith(3, 'yysun/awesome-agent-world', 'repo-root-skill', { folderName: 'repo-root-skill' });
    expect(stageGitHubFolderFromRepo).toHaveBeenNthCalledWith(4, 'yysun/awesome-agent-world', 'SKILL.md', { folderName: 'repo-root-skill' });
    expect(fsMockState.cp).toHaveBeenCalledWith(stagedSkillFolder, targetSkillPath, { recursive: true, force: true });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(syncSkills).toHaveBeenCalledWith({ projectSkillRoots: [absoluteTestPath('workspace', '.agent-world', 'skills')] });
  });

  it('importSkill falls back to repo-root SKILL.md when the selected skill matches the repo name alias', async () => {
    class MockGitHubWorldImportError extends Error {
      code: string;
      details?: Record<string, unknown>;

      constructor(code: string, message: string, details?: Record<string, unknown>) {
        super(message);
        this.name = 'GitHubWorldImportError';
        this.code = code;
        this.details = details;
      }
    }

    const syncSkills = vi.fn(async () => undefined);
    const workspacePath = absoluteTestPath('workspace');
    const stagedSkillFolder = absoluteTestPath('staging', 'awesome-agent-world');
    const stagedSkillFilePath = absoluteTestPath('staging', 'awesome-agent-world', 'SKILL.md');
    const targetSkillPath = absoluteTestPath('workspace', '.agent-world', 'skills', 'awesome-agent-world');
    const existingPaths = new Set([
      path.normalize(stagedSkillFolder),
      path.normalize(stagedSkillFilePath),
    ]);
    fsMockState.existsSync.mockImplementation((targetPath: string) => (
      typeof targetPath === 'string' && existingPaths.has(path.normalize(targetPath))
    ));
    fsMockState.statSync.mockImplementation(() => ({ isDirectory: () => true }));
    fsMockState.readFile.mockImplementation(async (targetPath: string) => {
      if (targetPath === stagedSkillFilePath) {
        return '---\nname: repo-root-skill\n---\n# Root skill';
      }
      return '# SKILL content';
    });

    const cleanup = vi.fn(async () => undefined);
    const stageGitHubFolderFromRepo = vi.fn(async (_repoInput: string, folderPath: string, options?: { folderName?: string }) => {
      if (folderPath === 'SKILL.md') {
        return {
          stagingRootPath: absoluteTestPath('staging'),
          folderPath: stagedSkillFolder,
          source: {
            repoInput: 'yysun/awesome-agent-world',
            owner: 'yysun',
            repo: 'awesome-agent-world',
            branch: 'main',
            folderPath,
            commitSha: null,
          },
          cleanup,
        };
      }

      throw new MockGitHubWorldImportError('source-not-found', `Missing ${folderPath}`, { folderName: options?.folderName });
    });

    const handlers = createMainIpcHandlers({
      ...makeDeps(() => undefined),
      GitHubWorldImportError: MockGitHubWorldImportError,
      stageGitHubFolderFromRepo,
      getWorkspaceState: () => ({ workspacePath, storagePath: workspacePath, coreInitialized: true }),
      getMainWindow: () => ({ isDestroyed: () => false }),
      syncSkills,
    } as any);

    const result = await (handlers as any).importSkill({
      repo: 'yysun/awesome-agent-world',
      itemName: 'awesome-agent-world',
    });

    expect(result.success).toBe(true);
    expect(stageGitHubFolderFromRepo).toHaveBeenNthCalledWith(4, 'yysun/awesome-agent-world', 'SKILL.md', { folderName: 'awesome-agent-world' });
    expect(fsMockState.cp).toHaveBeenCalledWith(stagedSkillFolder, targetSkillPath, { recursive: true, force: true });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(syncSkills).toHaveBeenCalledWith({ projectSkillRoots: [absoluteTestPath('workspace', '.agent-world', 'skills')] });
  });
});
