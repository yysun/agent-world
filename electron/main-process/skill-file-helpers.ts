/**
 * Electron Main Skill File Helpers
 *
 * Purpose:
 * - Centralize skill folder traversal, preview file loading, and relative-path-safe file writes.
 *
 * Key Features:
 * - Reads skill folder trees for editor preview.
 * - Filters binary files from preview content.
 * - Resolves relative file paths safely within a skill root.
 * - Writes draft preview files back into a target skill folder.
 *
 * Implementation Notes:
 * - Uses the shared SkillFolderEntry type so preview payloads stay aligned with renderer contracts.
 * - Keeps path validation logic reusable across preview, save, and install flows.
 *
 * Recent Changes:
 * - 2026-04-11: Extracted from ipc-handlers.ts to reduce main IPC handler file size and isolate file-system concerns.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SkillFolderEntry } from '../shared/ipc-contracts.js';

export async function readSkillFolderEntries(rootPath: string, currentPath: string = rootPath): Promise<SkillFolderEntry[]> {
  const rootDir = String(rootPath || currentPath || '');
  const activeDir = String(currentPath || rootDir);
  const dirEntries = await fs.promises.readdir(activeDir, { withFileTypes: true });
  const orderedEntries = [...dirEntries].sort((left, right) => {
    const leftRank = left.isDirectory() ? 0 : 1;
    const rightRank = right.isDirectory() ? 0 : 1;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return left.name.localeCompare(right.name);
  });

  const results: SkillFolderEntry[] = [];
  for (const dirEntry of orderedEntries) {
    const entryName = String(dirEntry?.name || '');
    const nextPath = path.join(activeDir, entryName);
    const relativePath = path.relative(rootDir, nextPath).replace(/\\/g, '/');
    if (dirEntry.isDirectory()) {
      results.push({
        name: entryName,
        relativePath,
        type: 'directory',
        children: await readSkillFolderEntries(rootDir, nextPath),
      });
      continue;
    }

    results.push({
      name: entryName,
      relativePath,
      type: 'file',
    });
  }

  return results;
}

export async function readSkillFolderFiles(rootPath: string, currentPath: string = rootPath): Promise<Record<string, string>> {
  const rootDir = String(rootPath || currentPath || '');
  const activeDir = String(currentPath || rootDir);
  const dirEntries = await fs.promises.readdir(activeDir, { withFileTypes: true });
  const results: Record<string, string> = {};

  for (const dirEntry of dirEntries) {
    const entryName = String(dirEntry?.name || '');
    const nextPath = path.join(activeDir, entryName);
    if (dirEntry.isDirectory()) {
      Object.assign(results, await readSkillFolderFiles(rootDir, nextPath));
      continue;
    }

    const relativePath = path.relative(rootDir, nextPath).replace(/\\/g, '/');
    const fileBytes = await fs.promises.readFile(nextPath);
    if (isProbablyBinaryFile(fileBytes)) {
      continue;
    }
    results[relativePath] = fileBytes.toString('utf8');
  }

  return results;
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

function findFirstSkillFilePath(entries: SkillFolderEntry[]): string {
  for (const entry of entries) {
    if (entry.type === 'file') {
      return entry.relativePath;
    }
    if (entry.type === 'directory' && Array.isArray(entry.children) && entry.children.length > 0) {
      const nestedFilePath = findFirstSkillFilePath(entry.children);
      if (nestedFilePath) {
        return nestedFilePath;
      }
    }
  }

  return '';
}

export function getInitialSkillPreviewFilePath(entries: SkillFolderEntry[]): string {
  const defaultSkillFile = entries.find((entry) => entry.type === 'file' && entry.relativePath === 'SKILL.md');
  return defaultSkillFile?.relativePath || findFirstSkillFilePath(entries) || 'SKILL.md';
}

export function getSkillRootPath(skillPath: string): string {
  const normalizedSkillPath = String(skillPath || '').trim();
  return path.basename(normalizedSkillPath).toLowerCase() === 'skill.md'
    ? path.dirname(normalizedSkillPath)
    : normalizedSkillPath;
}

function getDefaultSkillFilePath(skillPath: string): string {
  const normalizedSkillPath = String(skillPath || '').trim();
  return path.basename(normalizedSkillPath).toLowerCase() === 'skill.md'
    ? normalizedSkillPath
    : path.join(getSkillRootPath(normalizedSkillPath), 'SKILL.md');
}

export function resolveSkillFilePath(skillPath: string, relativePath?: unknown): string {
  const normalizedRelativePath = String(relativePath || '').trim();
  if (!normalizedRelativePath) {
    return getDefaultSkillFilePath(skillPath);
  }

  if (path.isAbsolute(normalizedRelativePath)) {
    throw new Error('Skill file path must be relative.');
  }

  const skillRootPath = getSkillRootPath(skillPath);
  const resolvedPath = path.resolve(skillRootPath, normalizedRelativePath);
  const relativeToRoot = path.relative(skillRootPath, resolvedPath);
  if (!relativeToRoot || relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error('Skill file path must stay within the skill folder.');
  }

  return resolvedPath;
}

export async function writeSkillFilesToTarget(targetSkillPath: string, files: Record<string, string>): Promise<void> {
  const normalizedEntries = Object.entries(files)
    .map(([relativePath, content]) => [String(relativePath || '').trim(), String(content ?? '')] as const)
    .filter(([relativePath]) => relativePath.length > 0);

  for (const [relativePath, content] of normalizedEntries) {
    const targetFilePath = resolveSkillFilePath(targetSkillPath, relativePath);
    await fs.promises.mkdir(path.dirname(targetFilePath), { recursive: true });
    await fs.promises.writeFile(targetFilePath, content, 'utf8');
  }
}