/**
 * Electron Main Local Skill Discovery
 *
 * Purpose:
 * - Discover installable skills from a chosen local root.
 *
 * Key Features:
 * - Detects a root-level SKILL.md.
 * - Traverses nested directories to find `skills` folders.
 * - Returns normalized local skill summaries with relative paths.
 *
 * Implementation Notes:
 * - Uses shared contract types so IPC payloads stay aligned.
 * - Reuses SKILL.md markdown parsing helpers for both root and nested skills.
 *
 * Recent Changes:
 * - 2026-04-11: Extracted from ipc-handlers.ts to isolate local-scan logic from IPC orchestration.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LocalSkillSummary } from '../shared/ipc-contracts.js';
import { parseSkillDescriptionFromMarkdown, parseSkillNameFromMarkdown } from './skill-markdown.js';

const IGNORED_WALK_DIRECTORY_NAMES = new Set([
  '.cache',
  '.git',
  '.next',
  '.nuxt',
  '.pnpm-store',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'tmp',
]);

function shouldSkipDirectory(entry: fs.Dirent<string>): boolean {
  const normalizedName = String(entry?.name || '').trim().toLowerCase();
  if (!normalizedName) {
    return true;
  }

  if (typeof entry?.isSymbolicLink === 'function' && entry.isSymbolicLink()) {
    return true;
  }

  return IGNORED_WALK_DIRECTORY_NAMES.has(normalizedName);
}

async function listNestedSkillDirectories(rootPath: string): Promise<string[]> {
  const normalizedRootPath = path.resolve(path.normalize(String(rootPath || '').trim()));
  const discoveredSkillDirectories = new Set<string>();

  async function walkDirectory(currentPath: string): Promise<void> {
    const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry?.isDirectory?.()) {
        continue;
      }
      if (shouldSkipDirectory(entry)) {
        continue;
      }

      const nextPath = path.join(currentPath, entry.name);
      if (entry.name.toLowerCase() === 'skills') {
        discoveredSkillDirectories.add(path.resolve(path.normalize(nextPath)));
      }

      await walkDirectory(nextPath);
    }
  }

  if (path.basename(normalizedRootPath).toLowerCase() === 'skills') {
    discoveredSkillDirectories.add(normalizedRootPath);
  }

  await walkDirectory(normalizedRootPath);
  return Array.from(discoveredSkillDirectories);
}

async function readLocalSkillSummary(folderPath: string, rootPath: string): Promise<LocalSkillSummary | null> {
  const normalizedFolderPath = path.resolve(path.normalize(String(folderPath || '').trim()));
  const skillFilePath = path.join(normalizedFolderPath, 'SKILL.md');
  if (!fs.existsSync(skillFilePath)) {
    return null;
  }

  let markdown = '';
  try {
    markdown = await fs.promises.readFile(skillFilePath, 'utf8');
  } catch {
    markdown = '';
  }

  const parsedSkillName = String(parseSkillNameFromMarkdown(markdown) || '').trim();
  return {
    skillId: parsedSkillName || path.basename(normalizedFolderPath),
    description: String(parseSkillDescriptionFromMarkdown(markdown) || '').trim(),
    folderPath: normalizedFolderPath,
    relativePath: path.relative(rootPath, normalizedFolderPath).replace(/\\/g, '/') || '.',
  };
}

export async function discoverLocalSkillFolders(rootPath: string): Promise<LocalSkillSummary[]> {
  const normalizedRootPath = path.resolve(path.normalize(String(rootPath || '').trim()));
  const discoveredSkills = new Map<string, LocalSkillSummary>();

  const rootSkillSummary = await readLocalSkillSummary(normalizedRootPath, normalizedRootPath);
  if (rootSkillSummary) {
    discoveredSkills.set(rootSkillSummary.folderPath, rootSkillSummary);
  }

  const nestedSkillDirectories = await listNestedSkillDirectories(normalizedRootPath);
  for (const skillsDirectory of nestedSkillDirectories) {
    const entries = await fs.promises.readdir(skillsDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry?.isDirectory?.()) {
        continue;
      }

      const skillFolderPath = path.join(skillsDirectory, entry.name);
      const summary = await readLocalSkillSummary(skillFolderPath, normalizedRootPath);
      if (summary) {
        discoveredSkills.set(summary.folderPath, summary);
      }
    }
  }

  return Array.from(discoveredSkills.values()).sort((left, right) => {
    const relativePathComparison = left.relativePath.localeCompare(right.relativePath);
    if (relativePathComparison !== 0) {
      return relativePathComparison;
    }
    return left.skillId.localeCompare(right.skillId);
  });
}