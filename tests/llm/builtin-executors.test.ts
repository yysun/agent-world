/**
 * LLM Package Built-In Executor Tests
 *
 * Purpose:
 * - Lock package-owned glob-backed file discovery behavior at the public tool boundary.
 *
 * Key features:
 * - Verifies `list_files` uses the workspace `fast-glob` helper with bounded options.
 * - Verifies `grep` discovers candidate files and returns matched lines without touching the real filesystem.
 *
 * Notes on Implementation:
 * - Mocks `fast-glob` and `fs` so tests stay deterministic and in-memory.
 * - Exercises the executors through `resolveTools()` instead of importing private helpers directly.
 *
 * Summary of Recent Changes:
 * - 2026-03-29: Added regression coverage for `fast-glob` namespace helper execution in `packages/llm`.
 */

import path from 'node:path';

import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockGlob = vi.hoisted(() => vi.fn());
const mockReadFile = vi.hoisted(() => vi.fn());

vi.mock('fast-glob', () => ({
  glob: mockGlob,
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: mockReadFile,
    },
  };
});

import { resolveTools } from '../../packages/llm/src/index.js';

describe('@agent-world/llm built-in executors', () => {
  beforeEach(() => {
    mockGlob.mockReset();
    mockReadFile.mockReset();
  });

  it('lists files through fast-glob with capped recursive options', async () => {
    mockGlob.mockResolvedValueOnce([
      'src/utils/',
      'src/index.ts',
    ]);

    const tools = resolveTools({
      builtIns: {
        list_files: true,
      },
    });

    const result = await tools.list_files?.execute?.(
      {
        path: '.',
        recursive: true,
        includeHidden: false,
        maxDepth: 99,
        maxEntries: 10,
      },
      {
        workingDirectory: '/workspace',
      } as any,
    );

    expect(mockGlob).toHaveBeenCalledWith(['**/*'], expect.objectContaining({
      cwd: '/workspace',
      deep: 2,
      dot: false,
      onlyFiles: false,
      markDirectories: true,
    }));

    expect(JSON.parse(String(result))).toMatchObject({
      path: '/workspace',
      recursive: true,
      entries: ['src/index.ts', 'src/utils/'],
      found: true,
      truncated: false,
    });
  });

  it('greps files discovered through fast-glob without reading the real filesystem', async () => {
    mockGlob.mockResolvedValueOnce([
      'src/a.ts',
      'README.md',
    ]);
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath === path.join('/workspace', 'src/a.ts')) {
        return 'alpha\nbeta match\ngamma';
      }
      return 'no hits here';
    });

    const tools = resolveTools({
      builtIns: {
        grep: true,
      },
    });

    const result = await tools.grep?.execute?.(
      {
        query: 'beta match',
        contextLines: 0,
      },
      {
        workingDirectory: '/workspace',
      } as any,
    );

    expect(mockGlob).toHaveBeenCalledWith(['**/*'], expect.objectContaining({
      cwd: '/workspace',
      onlyFiles: true,
      dot: true,
    }));

    expect(JSON.parse(String(result))).toEqual({
      query: 'beta match',
      truncated: false,
      matches: [
        {
          filePath: path.join('/workspace', 'src/a.ts'),
          lineNumber: 2,
          line: 'beta match',
          context: ['beta match'],
        },
      ],
    });
  });
});
