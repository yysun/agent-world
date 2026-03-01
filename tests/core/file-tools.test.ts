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
 * - 2026-02-28: Added initial unit coverage for new built-in `write_file` tool.
 */

import * as fs from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/shell-cmd-tool.js', () => ({
  resolveTrustedShellWorkingDirectory: vi.fn((context: { workingDirectory?: string } | undefined) =>
    context?.workingDirectory ?? '/workspace'
  ),
  validateShellDirectoryRequest: vi.fn((resolvedPath: string, trustedWorkingDirectory: string) => {
    const normalizedPath = String(resolvedPath).replace(/\\/g, '/').replace(/\/+/g, '/');
    const normalizedTrusted = String(trustedWorkingDirectory).replace(/\\/g, '/').replace(/\/+/g, '/');
    if (normalizedPath.includes('/../') || !normalizedPath.includes(normalizedTrusted)) {
      return {
        valid: false,
        error: `Requested path is outside trusted working directory: ${trustedWorkingDirectory}`,
      };
    }

    return { valid: true };
  }),
}));

import { createWriteFileToolDefinition } from '../../core/file-tools.js';

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
