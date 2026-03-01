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

import { createListFilesToolDefinition, createReadFileToolDefinition, createWriteFileToolDefinition } from '../../core/file-tools.js';
import { getSkillSourcePath, getSkills } from '../../core/skill-registry.js';

const mockedGetSkills = vi.mocked(getSkills);
const mockedGetSkillSourcePath = vi.mocked(getSkillSourcePath);

describe('file-tools write_file', () => {
  const existingFiles = new Set<string>();
  const existingDirectories = new Set<string>();

  const normalizePath = (value: string): string => value.replace(/\\/g, '/').replace(/\/+/g, '/');

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

    const normalizePath = (value: string): string => value.replace(/\\/g, '/').replace(/\/+/g, '/');

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
    expect(String(parsed.path).replace(/\\/g, '/').replace(/\/+/g, '/')).toBe('/workspace/.agents/skills/music-to-svg');
    expect(parsed.found).toBe(true);
    expect(parsed.entries).toEqual(['scripts/', 'scripts/convert.py']);
  });
});
