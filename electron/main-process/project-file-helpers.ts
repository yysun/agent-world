/**
 * Electron Main Project File Helpers
 *
 * Purpose:
 * - Centralize safe project-folder traversal and read-only file preview helpers.
 *
 * Key Features:
 * - Reads bounded project folder trees for the composer project viewer.
 * - Resolves relative file paths safely within a selected project root.
 * - Detects binary and oversized files before returning preview content.
 * - Saves edited text content back into selected project files.
 *
 * Implementation Notes:
 * - Omits vendor/generated directories that would overwhelm the viewer.
 * - Applies traversal depth and entry budgets so large repos do not stall the viewer open flow.
 * - Returns structured file-read results so the renderer can render explicit placeholders.
 * - Reuses the same path-resolution guard for both reads and writes.
 * - Rejects symlink escapes by validating canonical parent/target paths against the selected project root.
 *
 * Recent Changes:
 * - 2026-04-14: Added traversal budgets and canonical path guards to prevent large-tree stalls and symlink escapes.
 * - 2026-04-14: Added safe project file save support for the editable project folder viewer.
 * - 2026-04-14: Initial helper extraction for the Electron composer project folder viewer.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProjectFileReadResult, ProjectFolderEntry } from '../shared/ipc-contracts.js';

const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'test-results',
]);

const MAX_PROJECT_FILE_PREVIEW_BYTES = 256 * 1024;
const MAX_PROJECT_TREE_DEPTH = 6;
const MAX_PROJECT_TREE_ENTRIES = 1500;

type ProjectTreeTraversalBudget = {
  remainingEntries: number;
};

function shouldIgnoreDirectory(entryName: string): boolean {
  return IGNORED_DIRECTORY_NAMES.has(String(entryName || '').trim());
}

function isProbablyBinaryFile(fileBytes: Buffer | Uint8Array | string): boolean {
  if (typeof fileBytes === 'string') {
    return false;
  }

  const sample = fileBytes.subarray(0, Math.min(fileBytes.length, 1024));
  if (sample.length === 0) {
    return false;
  }

  let suspiciousByteCount = 0;
  for (const value of sample) {
    if (value === 0) {
      return true;
    }
    if (value < 7 || (value > 14 && value < 32)) {
      suspiciousByteCount += 1;
    }
  }

  return suspiciousByteCount / sample.length > 0.3;
}

function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

async function getCanonicalProjectRootPath(projectPath: string): Promise<string> {
  const normalizedProjectPath = path.resolve(String(projectPath || '').trim());
  if (!normalizedProjectPath) {
    throw new Error('Project path is required.');
  }

  return fs.promises.realpath(normalizedProjectPath);
}

async function resolveSafeProjectAccessPath(projectPath: string, relativePath: unknown): Promise<{ resolvedPath: string; targetExists: boolean }> {
  const resolvedPath = resolveProjectFilePath(projectPath, relativePath);
  const canonicalProjectRootPath = await getCanonicalProjectRootPath(projectPath);
  const resolvedParentPath = path.dirname(resolvedPath);
  const canonicalParentPath = await fs.promises.realpath(resolvedParentPath);

  if (!isPathInsideRoot(canonicalProjectRootPath, canonicalParentPath)) {
    throw new Error('Project file path must stay within the selected project folder.');
  }

  try {
    const targetStats = await fs.promises.lstat(resolvedPath);
    if (targetStats.isSymbolicLink()) {
      throw new Error('Project file path must stay within the selected project folder.');
    }

    const canonicalTargetPath = await fs.promises.realpath(resolvedPath);
    if (!isPathInsideRoot(canonicalProjectRootPath, canonicalTargetPath)) {
      throw new Error('Project file path must stay within the selected project folder.');
    }

    return { resolvedPath, targetExists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { resolvedPath, targetExists: false };
    }
    throw error;
  }
}

export async function readProjectFolderEntries(
  rootPath: string,
  currentPath: string = rootPath,
  depth: number = 0,
  budget: ProjectTreeTraversalBudget = { remainingEntries: MAX_PROJECT_TREE_ENTRIES },
): Promise<ProjectFolderEntry[]> {
  const rootDir = path.resolve(String(rootPath || currentPath || ''));
  const activeDir = path.resolve(String(currentPath || rootDir));

  if (depth >= MAX_PROJECT_TREE_DEPTH || budget.remainingEntries <= 0) {
    return [];
  }

  const dirEntries = await fs.promises.readdir(activeDir, { withFileTypes: true });
  const orderedEntries = [...dirEntries].sort((left, right) => {
    const leftRank = left.isDirectory() ? 0 : 1;
    const rightRank = right.isDirectory() ? 0 : 1;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return left.name.localeCompare(right.name);
  });

  const results: ProjectFolderEntry[] = [];
  for (const dirEntry of orderedEntries) {
    if (budget.remainingEntries <= 0) {
      break;
    }

    if (dirEntry.isDirectory() && shouldIgnoreDirectory(dirEntry.name)) {
      continue;
    }

    if (!dirEntry.isDirectory() && !dirEntry.isFile()) {
      continue;
    }

    const nextPath = path.join(activeDir, dirEntry.name);
    const relativePath = path.relative(rootDir, nextPath).replace(/\\/g, '/');
    budget.remainingEntries -= 1;

    if (dirEntry.isDirectory()) {
      results.push({
        name: dirEntry.name,
        relativePath,
        type: 'directory',
        children: await readProjectFolderEntries(rootDir, nextPath, depth + 1, budget),
      });
      continue;
    }

    results.push({
      name: dirEntry.name,
      relativePath,
      type: 'file',
    });
  }

  return results;
}

export function resolveProjectFilePath(projectPath: string, relativePath: unknown): string {
  const projectRootPath = path.resolve(String(projectPath || '').trim());
  const normalizedRelativePath = String(relativePath || '').trim();

  if (!projectRootPath) {
    throw new Error('Project path is required.');
  }

  if (!normalizedRelativePath) {
    throw new Error('Project file path is required.');
  }

  if (path.isAbsolute(normalizedRelativePath)) {
    throw new Error('Project file path must be relative.');
  }

  const resolvedPath = path.resolve(projectRootPath, normalizedRelativePath);
  const relativeToRoot = path.relative(projectRootPath, resolvedPath);
  if (!relativeToRoot || relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error('Project file path must stay within the selected project folder.');
  }

  return resolvedPath;
}

export async function readProjectFileContent(projectPath: string, relativePath: unknown): Promise<ProjectFileReadResult> {
  const normalizedRelativePath = String(relativePath || '').trim();
  const { resolvedPath } = await resolveSafeProjectAccessPath(projectPath, normalizedRelativePath);
  const fileStats = await fs.promises.stat(resolvedPath);

  if (!fileStats.isFile()) {
    return {
      status: 'unsupported',
      relativePath: normalizedRelativePath,
      sizeBytes: fileStats.size,
    };
  }

  if (fileStats.size > MAX_PROJECT_FILE_PREVIEW_BYTES) {
    return {
      status: 'too-large',
      relativePath: normalizedRelativePath,
      sizeBytes: fileStats.size,
    };
  }

  const fileBytes = await fs.promises.readFile(resolvedPath);
  if (isProbablyBinaryFile(fileBytes)) {
    return {
      status: 'binary',
      relativePath: normalizedRelativePath,
      sizeBytes: fileBytes.length,
    };
  }

  return {
    status: 'ok',
    relativePath: normalizedRelativePath,
    content: fileBytes.toString('utf8'),
    sizeBytes: fileBytes.length,
  };
}

export async function saveProjectFileContent(projectPath: string, relativePath: unknown, content: unknown): Promise<void> {
  const { resolvedPath } = await resolveSafeProjectAccessPath(projectPath, relativePath);
  await fs.promises.writeFile(resolvedPath, String(content ?? ''), 'utf8');
}