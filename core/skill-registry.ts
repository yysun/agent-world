/**
 * Skill Registry - Singleton registry and synchronization for agent skills
 *
 * Purpose:
 * - Maintain an in-memory singleton registry of discovered skills from SKILL.md files
 * - Synchronize registry entries from user and project skill directories
 *
 * Key Features:
 * - Singleton module-level registry with query helpers
 * - Recursive SKILL.md discovery across configurable roots
 * - Content hashing for change detection
 * - Incremental sync based on file modified time
 * - Automatic pruning of removed skills
 *
 * Notes on Implementation:
 * - Default scan roots include user-level and project-level skill folders
 * - Skill ID is derived from YAML front matter `name` when present; falls back to directory name
 * - Project skills are scanned after user skills and can override by skill ID
 *
 * Recent Changes:
 * - 2026-02-14: Parse SKILL.md YAML front matter for metadata-driven `name` and `description`.
 * - 2026-02-14: Added initial singleton skill registry with syncSkills support.
 */

import { createHash } from 'crypto';
import { homedir } from 'os';
import path from 'path';
import { promises as fs } from 'fs';

export interface SkillRegistryEntry {
  name: string;
  skill_id: string;
  description: string;
  hash: string;
  lastUpdated: string;
  skillFilePath: string;
}

export interface SyncSkillsOptions {
  userSkillRoots?: string[];
  projectSkillRoots?: string[];
}

export interface SyncSkillsResult {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  total: number;
}

interface DiscoveredSkill {
  inferredSkillId: string;
  skillFilePath: string;
  lastUpdated: string;
}

interface SkillFrontMatter {
  name?: string;
  description?: string;
}

function buildDefaultUserSkillRoots(): string[] {
  return [
    path.join(homedir(), '.agents', 'skills'),
  ];
}

function buildDefaultProjectSkillRoots(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, '.agents', 'skills'),
    path.join(cwd, 'skills'),
  ];
}

function normalizeRoots(roots: string[]): string[] {
  const resolved = roots
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0)
    .map((candidate) => path.resolve(candidate));

  return [...new Set(resolved)];
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findSkillMarkdownFiles(rootPath: string): Promise<string[]> {
  const output: string[] = [];
  const pending: string[] = [rootPath];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolutePath);
        continue;
      }

      if (entry.isFile() && entry.name === 'SKILL.md') {
        output.push(absolutePath);
      }
    }
  }

  return output;
}

function createContentHash(content: string): string {
  return createHash('md5').update(content).digest('hex').slice(0, 8);
}

function normalizeFrontMatterValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const hasMatchingQuotes =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));

  if (hasMatchingQuotes && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function parseSkillFrontMatter(content: string): SkillFrontMatter {
  const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!frontMatterMatch || !frontMatterMatch[1]) {
    return {};
  }

  const lines = frontMatterMatch[1].split(/\r?\n/);
  const metadata: SkillFrontMatter = {};
  let currentKey: keyof SkillFrontMatter | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.trimStart().startsWith('#')) {
      continue;
    }

    const keyValueMatch = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (keyValueMatch) {
      const rawKey = keyValueMatch[1].trim();
      const rawValue = keyValueMatch[2] ?? '';

      if (rawKey === 'name' || rawKey === 'description') {
        const normalized = normalizeFrontMatterValue(rawValue);
        metadata[rawKey] = normalized;
        currentKey = rawKey;
      } else {
        currentKey = null;
      }

      continue;
    }

    const isContinuation = /^\s+/.test(rawLine);
    if (isContinuation && currentKey === 'description') {
      const continuation = normalizeFrontMatterValue(rawLine);
      if (!continuation) {
        continue;
      }

      const existing = metadata.description ?? '';
      metadata.description = existing ? `${existing} ${continuation}` : continuation;
    }
  }

  return metadata;
}

function parseTimestamp(isoTimestamp: string | undefined): number {
  if (!isoTimestamp) {
    return 0;
  }

  const timestamp = Date.parse(isoTimestamp);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

async function discoverSkills(roots: string[]): Promise<Map<string, DiscoveredSkill>> {
  const discovered = new Map<string, DiscoveredSkill>();

  for (const rootPath of roots) {
    const exists = await pathExists(rootPath);
    if (!exists) {
      continue;
    }

    const skillFiles = await findSkillMarkdownFiles(rootPath);
    for (const skillFilePath of skillFiles) {
      const skillId = path.basename(path.dirname(skillFilePath));
      if (!skillId) {
        continue;
      }

      let stats: fs.Stats;
      try {
        stats = await fs.stat(skillFilePath);
      } catch {
        continue;
      }

      discovered.set(skillId, {
        inferredSkillId: skillId,
        skillFilePath,
        lastUpdated: stats.mtime.toISOString(),
      });
    }
  }

  return discovered;
}

function createSkillRegistrySingleton() {
  const registry = new Map<string, SkillRegistryEntry>();

  async function syncSkills(options: SyncSkillsOptions = {}): Promise<SyncSkillsResult> {
    const roots = normalizeRoots([
      ...(options.userSkillRoots ?? buildDefaultUserSkillRoots()),
      ...(options.projectSkillRoots ?? buildDefaultProjectSkillRoots()),
    ]);

    const discovered = await discoverSkills(roots);
    const resolvedDiscovered = new Map<string, { skillFilePath: string; lastUpdated: string; content: string; name: string; description: string }>();
    let added = 0;
    let updated = 0;
    let unchanged = 0;

    for (const discoveredSkill of discovered.values()) {
      let content: string;
      try {
        content = await fs.readFile(discoveredSkill.skillFilePath, 'utf8');
      } catch {
        continue;
      }

      const metadata = parseSkillFrontMatter(content);
      const resolvedName = (metadata.name || discoveredSkill.inferredSkillId).trim();
      if (!resolvedName) {
        continue;
      }

      resolvedDiscovered.set(resolvedName, {
        skillFilePath: discoveredSkill.skillFilePath,
        lastUpdated: discoveredSkill.lastUpdated,
        content,
        name: resolvedName,
        description: (metadata.description || '').trim(),
      });
    }

    for (const [skillId, discoveredSkill] of resolvedDiscovered.entries()) {
      const existing = registry.get(skillId);
      const discoveredTimestamp = parseTimestamp(discoveredSkill.lastUpdated);
      const existingTimestamp = parseTimestamp(existing?.lastUpdated);

      if (existing && discoveredTimestamp <= existingTimestamp) {
        unchanged += 1;
        continue;
      }

      const nextHash = createContentHash(discoveredSkill.content);
      if (existing && existing.hash === nextHash) {
        registry.set(skillId, {
          ...existing,
          lastUpdated: discoveredSkill.lastUpdated,
          skillFilePath: discoveredSkill.skillFilePath,
          name: discoveredSkill.name,
          description: discoveredSkill.description,
        });
        unchanged += 1;
        continue;
      }

      registry.set(skillId, {
        name: discoveredSkill.name,
        skill_id: skillId,
        description: discoveredSkill.description,
        hash: nextHash,
        lastUpdated: discoveredSkill.lastUpdated,
        skillFilePath: discoveredSkill.skillFilePath,
      });

      if (existing) {
        updated += 1;
      } else {
        added += 1;
      }
    }

    let removed = 0;
    for (const skillId of [...registry.keys()]) {
      if (!resolvedDiscovered.has(skillId)) {
        registry.delete(skillId);
        removed += 1;
      }
    }

    return {
      added,
      updated,
      removed,
      unchanged,
      total: registry.size,
    };
  }

  function getSkills(): SkillRegistryEntry[] {
    return [...registry.values()].sort((left, right) => left.skill_id.localeCompare(right.skill_id));
  }

  function getSkill(skillId: string): SkillRegistryEntry | undefined {
    return registry.get(skillId);
  }

  function clearSkillsForTests(): void {
    registry.clear();
  }

  return {
    syncSkills,
    getSkills,
    getSkill,
    clearSkillsForTests,
  };
}

export const skillRegistry = createSkillRegistrySingleton();

export const syncSkills = skillRegistry.syncSkills;
export const getSkills = skillRegistry.getSkills;
export const getSkill = skillRegistry.getSkill;
export const clearSkillsForTests = skillRegistry.clearSkillsForTests;
