/**
 * Unit Tests for GitHub World Import Utilities
 *
 * Purpose:
 * - Validate shorthand resolution, safety guards, and staging behavior for GitHub world import sources.
 *
 * Key Features:
 * - Confirms supported alias mapping and world-path derivation.
 * - Confirms invalid shorthand and unsupported alias errors.
 * - Confirms unsafe relative path rejection.
 * - Confirms staging lifecycle success and cleanup-on-failure paths.
 *
 * Implementation Notes:
 * - Uses mocked network and filesystem APIs for deterministic staging coverage.
 * - Uses Vitest expectations for explicit error-code assertions.
 *
 * Recent Changes:
 * - 2026-02-27: Added stageGitHubWorldFromShorthand success/error/limit tests with mocked fetch and fs.
 * - 2026-02-25: Added baseline unit coverage for GitHub shorthand import resolver.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';

const fsPromisesMocks = vi.hoisted(() => ({
  mkdir: vi.fn(async () => undefined),
  mkdtemp: vi.fn(async () => '/tmp/agent-world-github-import-staging'),
  rm: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
}));

vi.mock('node:fs/promises', () => fsPromisesMocks);
vi.mock('node:os', () => ({
  tmpdir: () => '/tmp',
}));
vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:path')>();
  return actual;
});

import {
  ensureSafeRelativePath,
  GitHubWorldImportError,
  listGitHubDirectoryNames,
  resolveGitHubRepoSource,
  resolveGitHubWorldShorthand,
  stageGitHubFolderFromRepo,
  stageGitHubWorldFromShorthand,
} from '../../core/storage/github-world-import.js';

const MOCK_TMP_DIR = path.join(path.sep, 'tmp');
const MOCK_STAGING_ROOT = path.join(MOCK_TMP_DIR, 'agent-world-github-import-staging');

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function bytesResponse(text: string, status = 200): Response {
  return new Response(text, { status });
}

describe('stageGitHubWorldFromShorthand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsPromisesMocks.mkdtemp.mockResolvedValue(MOCK_STAGING_ROOT);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stages files and returns source metadata with cleanup callback', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ sha: 'abc123' }))
      .mockResolvedValueOnce(jsonResponse([
        {
          type: 'file',
          path: 'data/worlds/infinite-etude/config.json',
          download_url: 'https://download/config',
        },
        {
          type: 'dir',
          path: 'data/worlds/infinite-etude/agents',
        },
      ]))
      .mockResolvedValueOnce(jsonResponse([
        {
          type: 'file',
          path: 'data/worlds/infinite-etude/agents/alpha.json',
          download_url: 'https://download/alpha',
        },
      ]))
      .mockResolvedValueOnce(bytesResponse('{"id":"infinite-etude"}'))
      .mockResolvedValueOnce(bytesResponse('{"id":"alpha"}'));
    vi.stubGlobal('fetch', fetchMock);

    const staged = await stageGitHubWorldFromShorthand('@awesome-agent-world/infinite-etude', {
      tempPrefix: 'aw-stage-',
      requestTimeoutMs: 1_000,
    });

    expect(fsPromisesMocks.mkdtemp).toHaveBeenCalledWith(path.join(MOCK_TMP_DIR, 'aw-stage-'));
    expect(staged.stagingRootPath).toBe(MOCK_STAGING_ROOT);
    expect(staged.worldFolderPath).toBe(path.join(MOCK_STAGING_ROOT, 'infinite-etude'));
    expect(staged.source).toEqual({
      shorthand: '@awesome-agent-world/infinite-etude',
      owner: 'yysun',
      repo: 'awesome-agent-world',
      branch: 'main',
      worldPath: 'data/worlds/infinite-etude',
      commitSha: 'abc123',
    });

    expect(fsPromisesMocks.mkdir).toHaveBeenCalledWith(
      path.join(MOCK_STAGING_ROOT, 'infinite-etude'),
      { recursive: true },
    );
    expect(fsPromisesMocks.mkdir).toHaveBeenCalledWith(
      path.join(MOCK_STAGING_ROOT, 'infinite-etude', 'agents'),
      { recursive: true },
    );
    expect(fsPromisesMocks.writeFile).toHaveBeenCalledTimes(2);
    expect(fsPromisesMocks.rm).not.toHaveBeenCalled();

    await staged.cleanup();
    expect(fsPromisesMocks.rm).toHaveBeenCalledWith(MOCK_STAGING_ROOT, {
      recursive: true,
      force: true,
    });
  });

  it('cleans up staging root when no files are found', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ sha: 'abc123' }))
      .mockResolvedValueOnce(jsonResponse([])));

    await expect(
      stageGitHubWorldFromShorthand('@awesome-agent-world/infinite-etude'),
    ).rejects.toMatchObject({
      name: 'GitHubWorldImportError',
      code: 'source-not-found',
    });

    expect(fsPromisesMocks.rm).toHaveBeenCalledWith(MOCK_STAGING_ROOT, {
      recursive: true,
      force: true,
    });
  });

  it('enforces byte limits and cleans up after limit failures', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ sha: 'abc123' }))
      .mockResolvedValueOnce(jsonResponse([
        {
          type: 'file',
          path: 'data/worlds/infinite-etude/config.json',
          download_url: 'https://download/config',
        },
      ]))
      .mockResolvedValueOnce(bytesResponse('123456789')));

    await expect(
      stageGitHubWorldFromShorthand('@awesome-agent-world/infinite-etude', { maxTotalBytes: 3 }),
    ).rejects.toMatchObject({
      name: 'GitHubWorldImportError',
      code: 'limits-exceeded',
    });

    expect(fsPromisesMocks.rm).toHaveBeenCalledWith(MOCK_STAGING_ROOT, {
      recursive: true,
      force: true,
    });
  });

  it('cleans up and raises fetch-failed when file download rejects', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ sha: 'abc123' }))
      .mockResolvedValueOnce(jsonResponse([
        {
          type: 'file',
          path: 'data/worlds/infinite-etude/config.json',
          download_url: 'https://download/config',
        },
      ]))
      .mockRejectedValueOnce(new Error('network timeout')));

    await expect(
      stageGitHubWorldFromShorthand('@awesome-agent-world/infinite-etude'),
    ).rejects.toMatchObject({
      name: 'GitHubWorldImportError',
      code: 'fetch-failed',
    });

    expect(fsPromisesMocks.rm).toHaveBeenCalledWith(MOCK_STAGING_ROOT, {
      recursive: true,
      force: true,
    });
  });

  it('rejects unsupported entry types while listing source files', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ sha: 'abc123' }))
      .mockResolvedValueOnce(jsonResponse([
        {
          type: 'symlink',
          path: 'data/worlds/infinite-etude/symlink',
        },
      ])));

    await expect(
      stageGitHubWorldFromShorthand('@awesome-agent-world/infinite-etude'),
    ).rejects.toMatchObject({
      name: 'GitHubWorldImportError',
      code: 'unsupported-entry-type',
    });

    expect(fsPromisesMocks.rm).toHaveBeenCalledWith(MOCK_STAGING_ROOT, {
      recursive: true,
      force: true,
    });
  });

  it('rejects file entries that omit download_url', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ sha: 'abc123' }))
      .mockResolvedValueOnce(jsonResponse([
        {
          type: 'file',
          path: 'data/worlds/infinite-etude/config.json',
          download_url: null,
        },
      ])));

    await expect(
      stageGitHubWorldFromShorthand('@awesome-agent-world/infinite-etude'),
    ).rejects.toMatchObject({
      name: 'GitHubWorldImportError',
      code: 'fetch-failed',
    });
  });

  it('maps GitHub 404 listing to source-not-found error code', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ sha: 'abc123' }))
      .mockResolvedValueOnce(new Response('', { status: 404 })));

    await expect(
      stageGitHubWorldFromShorthand('@awesome-agent-world/infinite-etude'),
    ).rejects.toMatchObject({
      name: 'GitHubWorldImportError',
      code: 'source-not-found',
    });
  });
});

describe('stageGitHubFolderFromRepo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsPromisesMocks.mkdtemp.mockResolvedValue(MOCK_STAGING_ROOT);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stages a named folder from an explicit repo and branch', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ sha: 'def456' }))
      .mockResolvedValueOnce(jsonResponse([
        {
          type: 'file',
          path: 'skills/research/SKILL.md',
          download_url: 'https://download/skill',
        },
      ]))
      .mockResolvedValueOnce(bytesResponse('# Research skill'));
    vi.stubGlobal('fetch', fetchMock);

    const staged = await stageGitHubFolderFromRepo('octo/tools#dev', 'skills/research', {
      folderName: 'research',
      tempPrefix: 'aw-stage-',
    });

    expect(staged.folderPath).toBe(path.join(MOCK_STAGING_ROOT, 'research'));
    expect(staged.source).toEqual({
      repoInput: 'octo/tools#dev',
      owner: 'octo',
      repo: 'tools',
      branch: 'dev',
      folderPath: 'skills/research',
      commitSha: 'def456',
    });
    expect(fsPromisesMocks.writeFile).toHaveBeenCalledWith(
      path.join(MOCK_STAGING_ROOT, 'research', 'SKILL.md'),
      expect.any(Uint8Array),
    );
  });

  it('rejects empty folder paths', async () => {
    await expect(stageGitHubFolderFromRepo('octo/tools', '')).rejects.toMatchObject({
      name: 'GitHubWorldImportError',
      code: 'invalid-shorthand',
    });
  });
});

describe('listGitHubDirectoryNames', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists and sorts directory names within a repo path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse([
      {
        type: 'dir',
        path: 'skills/reviewer',
      },
      {
        type: 'file',
        path: 'skills/README.md',
      },
      {
        type: 'dir',
        path: 'skills/planner',
      },
    ])));

    await expect(listGitHubDirectoryNames('octo/tools#dev', 'skills')).resolves.toEqual({
      repoInput: 'octo/tools#dev',
      owner: 'octo',
      repo: 'tools',
      branch: 'dev',
      directoryPath: 'skills',
      directoryNames: ['planner', 'reviewer'],
    });
  });

  it('maps missing repo paths to source-not-found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 404 })));

    await expect(listGitHubDirectoryNames('octo/tools', 'skills')).rejects.toMatchObject({
      name: 'GitHubWorldImportError',
      code: 'source-not-found',
    });
  });
});

describe('resolveGitHubWorldShorthand', () => {
  it('resolves supported alias and world name', () => {
    const resolved = resolveGitHubWorldShorthand('@awesome-agent-world/infinite-etude');
    expect(resolved).toEqual({
      shorthand: '@awesome-agent-world/infinite-etude',
      alias: 'awesome-agent-world',
      worldName: 'infinite-etude',
      owner: 'yysun',
      repo: 'awesome-agent-world',
      branch: 'main',
      worldPath: 'data/worlds/infinite-etude',
    });
  });

  it('rejects invalid shorthand format', () => {
    expect(() => resolveGitHubWorldShorthand('awesome-agent-world/infinite-etude')).toThrowError(
      GitHubWorldImportError,
    );

    try {
      resolveGitHubWorldShorthand('awesome-agent-world/infinite-etude');
    } catch (error) {
      const typedError = error as GitHubWorldImportError;
      expect(typedError.code).toBe('invalid-shorthand');
    }
  });

  it('rejects unsupported alias', () => {
    expect(() => resolveGitHubWorldShorthand('@other-repo/infinite-etude')).toThrowError(
      GitHubWorldImportError,
    );

    try {
      resolveGitHubWorldShorthand('@other-repo/infinite-etude');
    } catch (error) {
      const typedError = error as GitHubWorldImportError;
      expect(typedError.code).toBe('unsupported-alias');
    }
  });
});

describe('resolveGitHubRepoSource', () => {
  it('accepts explicit owner repo syntax', () => {
    expect(resolveGitHubRepoSource('octo/tools#dev')).toEqual({
      repoInput: 'octo/tools#dev',
      owner: 'octo',
      repo: 'tools',
      branch: 'dev',
    });
  });

  it('accepts github urls', () => {
    expect(resolveGitHubRepoSource('https://github.com/octo/tools')).toEqual({
      repoInput: 'https://github.com/octo/tools',
      owner: 'octo',
      repo: 'tools',
      branch: 'main',
    });
  });

  it('rejects alias-only repo inputs', () => {
    expect(() => resolveGitHubRepoSource('@awesome-agent-world')).toThrowError(GitHubWorldImportError);
  });

  it('rejects unsupported aliases', () => {
    expect(() => resolveGitHubRepoSource('@not-allowed')).toThrowError(GitHubWorldImportError);
  });
});

describe('ensureSafeRelativePath', () => {
  it('accepts normal nested relative paths', () => {
    expect(ensureSafeRelativePath('agents/config.json')).toBe('agents/config.json');
    expect(ensureSafeRelativePath('chats/session-1/messages.json')).toBe('chats/session-1/messages.json');
  });

  it('rejects path traversal segments', () => {
    expect(() => ensureSafeRelativePath('../config.json')).toThrowError(GitHubWorldImportError);
    expect(() => ensureSafeRelativePath('agents/../../config.json')).toThrowError(GitHubWorldImportError);
  });

  it('rejects absolute paths', () => {
    expect(() => ensureSafeRelativePath('/tmp/config.json')).toThrowError(GitHubWorldImportError);
  });
});
