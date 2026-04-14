/**
 * Project File Helpers Tests
 * Purpose:
 * - Verify project folder traversal and file preview helpers stay safe and bounded.
 *
 * Key Features:
 * - Confirms ignored directories are omitted from the project tree.
 * - Confirms path traversal outside the selected project root is rejected.
 * - Confirms binary and oversized files return structured preview states.
 * - Confirms text file writes stay scoped to the selected project root.
 *
 * Implementation Notes:
 * - Uses mocked `node:fs` bindings so tests stay deterministic and filesystem-free.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';

const fsMockState = vi.hoisted(() => ({
  readdir: vi.fn(async () => []),
  readFile: vi.fn(async () => Buffer.from('')),
  realpath: vi.fn(async (targetPath: string) => targetPath),
  lstat: vi.fn(async () => ({ isSymbolicLink: () => false })),
  stat: vi.fn(async () => ({ isFile: () => true, size: 0 })),
  writeFile: vi.fn(async () => undefined),
}));

vi.mock('node:fs', () => ({
  promises: {
    readdir: fsMockState.readdir,
    readFile: fsMockState.readFile,
    realpath: fsMockState.realpath,
    lstat: fsMockState.lstat,
    stat: fsMockState.stat,
    writeFile: fsMockState.writeFile,
  },
}));

vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:path')>();
  return actual;
});

import {
  readProjectFileContent,
  readProjectFolderEntries,
  resolveProjectFilePath,
  saveProjectFileContent,
} from '../../../electron/main-process/project-file-helpers';

function makeDirent(name: string, type: 'file' | 'directory') {
  return {
    name,
    isDirectory: () => type === 'directory',
    isFile: () => type === 'file',
  };
}

describe('project-file-helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMockState.readdir.mockReset().mockResolvedValue([] as any);
    fsMockState.readFile.mockReset().mockResolvedValue(Buffer.from('hello'));
    fsMockState.realpath.mockReset().mockImplementation(async (targetPath: string) => targetPath);
    fsMockState.lstat.mockReset().mockResolvedValue({ isSymbolicLink: () => false } as any);
    fsMockState.stat.mockReset().mockResolvedValue({ isFile: () => true, size: 5 } as any);
    fsMockState.writeFile.mockReset().mockResolvedValue(undefined);
  });

  it('omits ignored directories from the project tree and keeps directories before files', async () => {
    const projectRoot = path.resolve('/tmp/project');
    fsMockState.readdir.mockImplementation(async (targetPath: string) => {
      if (targetPath === projectRoot) {
        return [
          makeDirent('README.md', 'file'),
          makeDirent('node_modules', 'directory'),
          makeDirent('src', 'directory'),
        ] as any;
      }

      if (targetPath === path.join(projectRoot, 'src')) {
        return [makeDirent('index.ts', 'file')] as any;
      }

      return [] as any;
    });

    const result = await readProjectFolderEntries(projectRoot);

    expect(result).toEqual([
      {
        name: 'src',
        relativePath: 'src',
        type: 'directory',
        children: [
          { name: 'index.ts', relativePath: 'src/index.ts', type: 'file' },
        ],
      },
      { name: 'README.md', relativePath: 'README.md', type: 'file' },
    ]);
  });

  it('rejects file paths that escape the selected project root', () => {
    const projectRoot = path.resolve('/tmp/project');

    expect(() => resolveProjectFilePath(projectRoot, '../secret.txt')).toThrow('Project file path must stay within the selected project folder.');
  });

  it('caps recursive tree traversal so large repos do not expand indefinitely on open', async () => {
    const projectRoot = path.resolve('/tmp/project');
    const nestedDirs = Array.from({ length: 8 }, (_, index) => `dir-${index + 1}`);

    fsMockState.readdir.mockImplementation(async (targetPath: string) => {
      const relativePath = path.relative(projectRoot, targetPath);
      const depth = relativePath ? relativePath.split(path.sep).length : 0;
      if (depth >= nestedDirs.length) {
        return [makeDirent(`leaf-${depth}.txt`, 'file')] as any;
      }

      return [makeDirent(nestedDirs[depth], 'directory')] as any;
    });

    const result = await readProjectFolderEntries(projectRoot);

    expect(result).toHaveLength(1);
    expect(result[0]?.relativePath).toBe('dir-1');
    expect(result[0]?.children?.[0]?.relativePath).toBe('dir-1/dir-2');
    expect(result[0]?.children?.[0]?.children?.[0]?.children?.[0]?.children?.[0]?.children?.[0]).toEqual({
      name: 'dir-6',
      relativePath: 'dir-1/dir-2/dir-3/dir-4/dir-5/dir-6',
      type: 'directory',
      children: [],
    });
  });

  it('returns structured preview states for binary and oversized files', async () => {
    const projectRoot = path.resolve('/tmp/project');

    fsMockState.stat.mockResolvedValueOnce({ isFile: () => true, size: 3 } as any);
    fsMockState.readFile.mockResolvedValueOnce(Buffer.from([0, 1, 2]));
    const binaryResult = await readProjectFileContent(projectRoot, 'image.png');

    fsMockState.stat.mockResolvedValueOnce({ isFile: () => true, size: 300000 } as any);
    const tooLargeResult = await readProjectFileContent(projectRoot, 'huge.log');

    expect(binaryResult).toEqual({
      status: 'binary',
      relativePath: 'image.png',
      sizeBytes: 3,
    });
    expect(tooLargeResult).toEqual({
      status: 'too-large',
      relativePath: 'huge.log',
      sizeBytes: 300000,
    });
  });

  it('rejects symlink escapes for project file reads and writes', async () => {
    const projectRoot = path.resolve('/tmp/project');
    fsMockState.realpath.mockImplementation(async (targetPath: string) => {
      if (targetPath === projectRoot) {
        return projectRoot;
      }
      if (targetPath === path.resolve(projectRoot, 'docs')) {
        return path.resolve('/tmp/outside-docs');
      }
      return targetPath;
    });

    await expect(readProjectFileContent(projectRoot, 'docs/guide.md')).rejects.toThrow(
      'Project file path must stay within the selected project folder.'
    );
    await expect(saveProjectFileContent(projectRoot, 'docs/guide.md', '# updated')).rejects.toThrow(
      'Project file path must stay within the selected project folder.'
    );
  });

  it('writes edited project files inside the selected project root', async () => {
    const projectRoot = path.resolve('/tmp/project');

    await saveProjectFileContent(projectRoot, 'docs/guide.md', '# updated');

    expect(fsMockState.writeFile).toHaveBeenCalledWith(
      path.resolve(projectRoot, 'docs/guide.md'),
      '# updated',
      'utf8'
    );
  });
});