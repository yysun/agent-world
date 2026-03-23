/**
 * File Tools Unit Tests
 *
 * Purpose:
 * - Validate built-in file tool behavior with deterministic mocked filesystem and scope guards.
 *
 * Key features:
 * - `write_file` success path for in-scope writes.
 * - `write_file` mode conflict handling (`create` when file exists).
 * - `write_file` trust-boundary rejection for escape paths.
 * - `write_file` directory-target rejection.
 *
 * Notes:
 * - Uses mocked fs and mocked shell scope helpers only (no real filesystem access).
 *
 * Recent changes:
 * - 2026-03-03: Added tests for tightened tool limits: read_file 200-line cap, list_files maxDepth/maxEntries caps, grep maxResults cap and contextLines support.
 * - 2026-03-01: Added regression coverage for `read_file` when mocked `fs.readFile` resolves `undefined` (should return empty content, not error).
 * - 2026-03-01: Added read_file regression coverage for missing cwd script paths that should resolve under loaded skill roots.
 * - 2026-03-01: Added regression coverage for `list_files` against symlinked `.agents/skills/*` paths that validate as out-of-scope after canonicalization.
 * - 2026-02-28: Added initial unit coverage for new built-in `write_file` tool.
 */

import * as fs from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fg from 'fast-glob';

vi.mock('../../core/shell-cmd-tool.js', () => ({
  resolveTrustedShellWorkingDirectory: vi.fn((context: { workingDirectory?: string } | undefined) =>
    context?.workingDirectory ?? '/workspace'
  ),
  validateShellDirectoryRequest: vi.fn((resolvedPath: string, trustedWorkingDirectory: string) => {
    const normalizedPath = String(resolvedPath).replace(/\\/g, '/').replace(/\/+/g, '/');
    const normalizedTrusted = String(trustedWorkingDirectory).replace(/\\/g, '/').replace(/\/+/g, '/');
    if (normalizedPath.includes('/.agents/skills/music-to-svg')) {
      return {
        valid: false,
        error: `Working directory mismatch: requested directory "${resolvedPath}" is outside world working directory "${trustedWorkingDirectory}". Update world working_directory first.`,
      };
    }
    if (normalizedPath.includes('/../') || !normalizedPath.includes(normalizedTrusted)) {
      return {
        valid: false,
        error: `Requested path is outside trusted working directory: ${trustedWorkingDirectory}`,
      };
    }

    return { valid: true };
  }),
}));

vi.mock('fast-glob', () => ({
  default: vi.fn(),
}));

vi.mock('../../core/skill-registry.js', () => ({
  getSkills: vi.fn(() => []),
  getSkillSourcePath: vi.fn(() => undefined),
}));

import { createGrepToolDefinition, createListFilesToolDefinition, createReadFileToolDefinition, createWriteFileToolDefinition } from '../../core/file-tools.js';
import { getSkillSourcePath, getSkills } from '../../core/skill-registry.js';

const mockedGetSkills = vi.mocked(getSkills);
const mockedGetSkillSourcePath = vi.mocked(getSkillSourcePath);

describe('file-tools write_file', () => {
  const existingFiles = new Set<string>();
  const existingDirectories = new Set<string>();

  const normalizePath = (value: string): string => value.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '').replace(/\/+/g, '/');

  const mkdirMock = vi.mocked(fs.promises.mkdir as any);
  const writeFileMock = vi.mocked(fs.promises.writeFile as any);

  beforeEach(() => {
    vi.clearAllMocks();
    existingFiles.clear();
    existingDirectories.clear();

    existingDirectories.add('/workspace');

    (fs.promises as any).stat = vi.fn(async (targetPath: string) => {
      const normalizedTarget = normalizePath(targetPath);
      if (existingDirectories.has(normalizedTarget)) {
        return { isDirectory: () => true };
      }
      if (existingFiles.has(normalizedTarget)) {
        return { isDirectory: () => false };
      }

      const error = new Error(`ENOENT: ${targetPath}`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    });

    mkdirMock.mockImplementation(async (targetPath: string) => {
      existingDirectories.add(normalizePath(targetPath));
    });

    writeFileMock.mockImplementation(async (targetPath: string, content: string) => {
      existingFiles.add(normalizePath(targetPath));
      expect(typeof content).toBe('string');
    });
  });

  it('writes a new in-scope file and returns deterministic metadata', async () => {
    const writeFileTool = createWriteFileToolDefinition();

    const result = await writeFileTool.execute(
      {
        filePath: 'notes/todo.txt',
        content: 'hello',
      },
      undefined,
      undefined,
      { workingDirectory: '/workspace' }
    );

    const parsed = JSON.parse(String(result));
    expect(parsed).toMatchObject({
      ok: true,
      status: 'success',
      mode: 'overwrite',
      operation: 'created',
      created: true,
      updated: false,
      bytesWritten: 5,
    });
    expect(normalizePath(parsed.filePath)).toBe('/workspace/notes/todo.txt');

    expect(normalizePath(String(mkdirMock.mock.calls[0][0]))).toBe('/workspace/notes');
    expect(mkdirMock.mock.calls[0][1]).toEqual({ recursive: true });
    expect(normalizePath(String(writeFileMock.mock.calls[0][0]))).toBe('/workspace/notes/todo.txt');
    expect(writeFileMock.mock.calls[0][1]).toBe('hello');
    expect(writeFileMock.mock.calls[0][2]).toEqual({ encoding: 'utf8', flag: 'w' });
  });

  it('fails create mode when target file already exists', async () => {
    existingFiles.add('/workspace/existing.txt');

    const writeFileTool = createWriteFileToolDefinition();
    const result = await writeFileTool.execute(
      {
        filePath: 'existing.txt',
        content: 'new-content',
        mode: 'create',
      },
      undefined,
      undefined,
      { workingDirectory: '/workspace' }
    );

    expect(String(result)).toContain('Error: write_file failed - file already exists');
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('fails create mode when file appears between stat and write (EEXIST race)', async () => {
    writeFileMock.mockImplementationOnce(async () => {
      const error = new Error('EEXIST') as NodeJS.ErrnoException;
      error.code = 'EEXIST';
      throw error;
    });

    const writeFileTool = createWriteFileToolDefinition();
    const result = await writeFileTool.execute(
      {
        filePath: 'race.txt',
        content: 'new-content',
        mode: 'create',
      },
      undefined,
      undefined,
      { workingDirectory: '/workspace' }
    );

    expect(String(result)).toContain('Error: write_file failed - file already exists');
  });

  it('rejects out-of-scope paths using trusted-directory validation', async () => {
    const writeFileTool = createWriteFileToolDefinition();

    const result = await writeFileTool.execute(
      {
        filePath: '../../etc/passwd',
        content: 'blocked',
      },
      undefined,
      undefined,
      { workingDirectory: '/workspace' }
    );

    expect(String(result)).toContain('outside trusted working directory');
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('rejects invalid input when content is missing', async () => {
    const writeFileTool = createWriteFileToolDefinition();

    const result = await writeFileTool.execute(
      {
        filePath: 'notes/no-content.txt',
      },
      undefined,
      undefined,
      { workingDirectory: '/workspace' }
    );

    expect(String(result)).toBe('Error: write_file failed - content must be a string');
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('rejects writes when the target path is an existing directory', async () => {
    existingDirectories.add('/workspace/reports');

    const writeFileTool = createWriteFileToolDefinition();

    const result = await writeFileTool.execute(
      {
        filePath: 'reports',
        content: 'content',
      },
      undefined,
      undefined,
      { workingDirectory: '/workspace' }
    );

    expect(String(result)).toBe('Error: write_file failed - target path is a directory');
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});

describe('file-tools read_file', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSkills.mockReturnValue([]);
    mockedGetSkillSourcePath.mockReturnValue(undefined);
  });

  it('resolves missing relative script paths from loaded skill roots', async () => {
    (fs.promises as any).readFile = vi.fn();

    const readFileMock = vi.mocked((fs.promises as any).readFile);

    const normalizePath = (value: string): string => value.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '').replace(/\/+/g, '/');

    const cwdCandidate = '/workspace/scripts/convert.py';
    const skillCandidate = '/workspace/.agents/skills/music-to-svg/scripts/convert.py';
    const normalizedCwdCandidate = normalizePath(cwdCandidate);
    const normalizedSkillCandidate = normalizePath(skillCandidate);

    readFileMock.mockImplementation(async (targetPath: string) => {
      const normalizedTargetPath = normalizePath(String(targetPath));
      if (normalizedTargetPath === normalizedCwdCandidate) {
        const error = new Error(`ENOENT: no such file or directory, open '${targetPath}'`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
      if (normalizedTargetPath === normalizedSkillCandidate) {
        return 'print("ok")';
      }
      throw new Error(`Unexpected readFile path: ${targetPath}`);
    });

    mockedGetSkills.mockReturnValue([
      {
        skill_id: 'music-to-svg',
        description: 'convert musicxml to svg',
        hash: 'abcd1234',
        lastUpdated: '2026-03-01T00:00:00.000Z',
      },
    ]);
    mockedGetSkillSourcePath.mockImplementation((skillId: string) => {
      if (skillId === 'music-to-svg') {
        return '/workspace/.agents/skills/music-to-svg/SKILL.md';
      }
      return undefined;
    });

    const readFileTool = createReadFileToolDefinition();
    const result = await readFileTool.execute(
      {
        path: 'scripts/convert.py',
      },
      undefined,
      undefined,
      { workingDirectory: '/workspace' },
    );

    expect(mockedGetSkills).toHaveBeenCalled();
    expect(mockedGetSkillSourcePath).toHaveBeenCalledWith('music-to-svg');
    expect(String(result)).not.toMatch(/^Error:/);

    const parsed = JSON.parse(String(result));
    expect(normalizePath(String(parsed.filePath))).toBe(normalizedSkillCandidate);
    expect(parsed.content).toContain('print("ok")');
    const normalizedReadPaths = readFileMock.mock.calls
      .map((call) => normalizePath(String(call[0])));
    expect(normalizedReadPaths).toContain(normalizedCwdCandidate);
    expect(normalizedReadPaths).toContain(normalizedSkillCandidate);
  });

  it('returns empty content when fs.readFile resolves undefined', async () => {
    (fs.promises as any).readFile = vi.fn().mockResolvedValue(undefined);

    const readFileTool = createReadFileToolDefinition();
    const result = await readFileTool.execute(
      {
        filePath: 'package.json',
        offset: 1,
        limit: 5,
      },
      undefined,
      undefined,
      { workingDirectory: '/workspace' },
    );

    expect(String(result)).not.toMatch(/^Error:/);

    const parsed = JSON.parse(String(result));
    expect(parsed).toHaveProperty('content', '');
    expect(parsed).toHaveProperty('offset', 1);
    expect(parsed).toHaveProperty('limit', 5);
  });
});

describe('file-tools list_files', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows lexically in-scope skill alias paths under .agents/skills', async () => {
    vi.mocked(fg).mockResolvedValue(['scripts/', 'scripts/convert.py']);

    const listFilesTool = createListFilesToolDefinition();
    const result = await listFilesTool.execute(
      {
        path: '.agents/skills/music-to-svg',
        recursive: true,
        includePattern: 'scripts/*,scripts/**/*.py',
      },
      undefined,
      undefined,
      { workingDirectory: '/workspace' }
    );

    expect(String(result)).not.toContain('Error: list_files failed - Working directory mismatch');
    const parsed = JSON.parse(String(result));
    expect(String(parsed.path).replace(/\\/g, '/').replace(/\/+/g, '/')).toContain('/workspace/.agents/skills/music-to-svg');
    expect(parsed.found).toBe(true);
    expect(parsed.entries).toEqual(['scripts/', 'scripts/convert.py']);
  });

  it('caps maxDepth at 2 even when larger value requested', async () => {
    vi.mocked(fg).mockResolvedValue(['a/', 'a/b/']);

    const listFilesTool = createListFilesToolDefinition();
    await listFilesTool.execute(
      { path: '.', recursive: true, maxDepth: 99 },
      undefined,
      undefined,
      { workingDirectory: '/workspace' }
    );

    const fgCall = vi.mocked(fg).mock.calls[0];
    expect(fgCall[1]).toHaveProperty('deep', 2);
  });

  it('caps maxEntries at 200 even when larger value requested', async () => {
    const entries = Array.from({ length: 300 }, (_, i) => `file${i}.txt`);
    vi.mocked(fg).mockResolvedValue(entries);

    const listFilesTool = createListFilesToolDefinition();
    const result = await listFilesTool.execute(
      { path: '.', maxEntries: 500 },
      undefined,
      undefined,
      { workingDirectory: '/workspace' }
    );

    const parsed = JSON.parse(String(result));
    expect(parsed.returned).toBe(200);
    expect(parsed.truncated).toBe(true);
  });
});

describe('file-tools read_file limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('caps limit at 200 lines even when larger value requested', async () => {
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`);
    (fs.promises as any).readFile = vi.fn().mockResolvedValue(lines.join('\n'));

    const readFileTool = createReadFileToolDefinition();
    const result = await readFileTool.execute(
      { filePath: 'big.txt', limit: 2000 },
      undefined,
      undefined,
      { workingDirectory: '/workspace' }
    );

    const parsed = JSON.parse(String(result));
    expect(parsed.limit).toBe(200);
    expect(parsed.content.split('\n').length).toBe(200);
  });
});

describe('file-tools grep limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('caps maxResults at 50 even when larger value requested', async () => {
    const lines = Array.from({ length: 100 }, (_, i) => `match ${i}`).join('\n');
    (fs.promises as any).readdir = vi.fn().mockResolvedValue([
      { name: 'data.txt', isDirectory: () => false, isFile: () => true },
    ]);
    (fs.promises as any).stat = vi.fn().mockResolvedValue({ size: 1000 });
    (fs.promises as any).readFile = vi.fn().mockResolvedValue(lines);

    const grepTool = createGrepToolDefinition();
    const result = await grepTool.execute(
      { query: 'match', maxResults: 999 },
      undefined,
      undefined,
      { workingDirectory: '/workspace' }
    );

    const parsed = JSON.parse(String(result));
    expect(parsed.totalMatches).toBe(50);
    expect(parsed.truncated).toBe(true);
  });

  it('includes context lines around matches', async () => {
    const lines = ['aaa', 'bbb', 'TARGET', 'ddd', 'eee', 'fff'].join('\n');
    (fs.promises as any).readdir = vi.fn().mockResolvedValue([
      { name: 'ctx.txt', isDirectory: () => false, isFile: () => true },
    ]);
    (fs.promises as any).stat = vi.fn().mockResolvedValue({ size: 100 });
    (fs.promises as any).readFile = vi.fn().mockResolvedValue(lines);

    const grepTool = createGrepToolDefinition();
    const result = await grepTool.execute(
      { query: 'TARGET', contextLines: 2 },
      undefined,
      undefined,
      { workingDirectory: '/workspace' }
    );

    const parsed = JSON.parse(String(result));
    expect(parsed.matches).toHaveLength(1);
    expect(parsed.matches[0].content).toBe('TARGET');
    expect(parsed.matches[0].context).toEqual([
      '1: aaa',
      '2: bbb',
      '4: ddd',
      '5: eee',
    ]);
  });

  it('caps contextLines at 5 even when larger value requested', async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n');
    (fs.promises as any).readdir = vi.fn().mockResolvedValue([
      { name: 'a.txt', isDirectory: () => false, isFile: () => true },
    ]);
    (fs.promises as any).stat = vi.fn().mockResolvedValue({ size: 100 });
    (fs.promises as any).readFile = vi.fn().mockResolvedValue(lines);

    const grepTool = createGrepToolDefinition();
    const result = await grepTool.execute(
      { query: 'line10', contextLines: 99 },
      undefined,
      undefined,
      { workingDirectory: '/workspace' }
    );

    const parsed = JSON.parse(String(result));
    const match = parsed.matches[0];
    // 5 lines before + 5 lines after = 10 context lines max
    expect(match.context.length).toBeLessThanOrEqual(10);
    expect(match.context.length).toBeGreaterThan(5);
  });
});
