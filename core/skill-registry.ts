/**
 * Skill Registry - Singleton registry and synchronization for agent skills.
 *
 * Purpose:
 * - Maintain one in-memory registry keyed by `skill_id`
 * - Sync registry entries from discovered SKILL.md files in user/project roots
 *
 * Key Features:
 * - Singleton module-level registry with exported helpers
 * - Recursive SKILL.md discovery with deterministic ordering
 * - Hash-based update checks using full SKILL.md content
 * - Automatic initial sync on module load so core starts with up-to-date skills
 * - Automatic pruning of entries whose files no longer exist
 *
 * Implementation Notes:
 * - `skill_id` is sourced from front-matter `name`
 * - `description` is sourced from front-matter `description`
 * - `hash` is computed from full SKILL.md content (front matter + body)
 * - Project roots are scanned after user roots, so later collisions always override earlier ones
 *
 * Recent Changes:
 * - 2026-02-14: Added `getSkillSourcePath` API and source-path tracking map for on-demand `SKILL.md` loading.
 * - 2026-02-14: Added `~/.codex/skills` to default user skill roots for Codex-managed skills discovery.
 * - 2026-02-14: Removed timestamp-gated update blocking so project-scope collisions always override user-scope entries when hashes differ.
 * - 2026-02-14: Fixed skill collision precedence so project-root skills override user-root skills for the same `skill_id`.
 * - 2026-02-14: Added `waitForInitialSkillSync` and startup sync tracking promise for deterministic core-load sync completion.
 * - 2026-02-14: Added module-load auto-sync so each core load refreshes the skill registry.
 * - 2026-02-14: Switched skill hash generation to use full SKILL.md content instead of metadata-only fields.
 * - 2026-02-14: Switched registry metadata source to SKILL.md front matter (`name` + `description`).
 * - 2026-02-14: Use front-matter `name` as canonical `skill_id`.
 */

import { createHash } from 'crypto';
import { promises as fs, type Dirent, type Stats } from 'fs';
import { homedir } from 'os';
import * as path from 'path';

export interface SkillRegistryEntry {
  skill_id: string;
  description: string;
  hash: string;
  lastUpdated: string;
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
    path.join(homedir(), '.codex', 'skills'),
  ];
}

function buildDefaultProjectSkillRoots(): string[] {
  const cwd = process.cwd();
  return [path.join(cwd, '.agents', 'skills'), path.join(cwd, 'skills')];
}

function normalizeRoots(roots: string[]): string[] {
  const resolved = roots
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0)
    .map((candidate) => path.resolve(candidate));
  return [...new Set(resolved)];
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
  let currentMultilineKey: keyof SkillFrontMatter | null = null;
  let blockStyle: 'literal' | 'folded' | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const keyValueMatch = rawLine.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (keyValueMatch) {
      const rawKey = keyValueMatch[1].trim();
      const rawValue = keyValueMatch[2] ?? '';

      if (rawKey !== 'name' && rawKey !== 'description') {
        currentMultilineKey = null;
        blockStyle = null;
        continue;
      }

      if ((rawValue === '|' || rawValue === '>') && rawKey === 'description') {
        metadata.description = '';
        currentMultilineKey = rawKey;
        blockStyle = rawValue === '|' ? 'literal' : 'folded';
        continue;
      }

      metadata[rawKey] = normalizeFrontMatterValue(rawValue);
      currentMultilineKey = null;
      blockStyle = null;
      continue;
    }

    if (!currentMultilineKey || currentMultilineKey !== 'description') {
      continue;
    }

    if (!/^\s+/.test(rawLine)) {
      currentMultilineKey = null;
      blockStyle = null;
      continue;
    }

    const chunk = rawLine.trim();
    if (!chunk) {
      continue;
    }

    if (blockStyle === 'literal') {
      metadata.description = metadata.description
        ? `${metadata.description}\n${chunk}`
        : chunk;
    } else {
      metadata.description = metadata.description
        ? `${metadata.description} ${chunk}`
        : chunk;
    }
  }

  return metadata;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readDirectoryEntries(directoryPath: string): Promise<Dirent[]> {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    return entries.sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return [];
  }
}

async function findSkillMarkdownFiles(rootPath: string): Promise<string[]> {
  const output: string[] = [];
  const queue: string[] = [rootPath];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await readDirectoryEntries(current);
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }
      if (entry.isFile() && entry.name === 'SKILL.md') {
        output.push(absolutePath);
      }
    }
  }

  return output.sort((left, right) => left.localeCompare(right));
}

async function readSkillStats(skillFilePath: string): Promise<Stats | null> {
  try {
    return await fs.stat(skillFilePath);
  } catch {
    return null;
  }
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
      const stats = await readSkillStats(skillFilePath);
      if (!stats) {
        continue;
      }

      discovered.set(skillFilePath, {
        skillFilePath,
        lastUpdated: stats.mtime.toISOString(),
      });
    }
  }

  return discovered;
}

function createSkillRegistrySingleton() {
  const registry = new Map<string, SkillRegistryEntry>();
  const registrySourcePaths = new Map<string, string>();

  async function syncSkills(options: SyncSkillsOptions = {}): Promise<SyncSkillsResult> {
    const roots = normalizeRoots([
      ...(options.userSkillRoots ?? buildDefaultUserSkillRoots()),
      ...(options.projectSkillRoots ?? buildDefaultProjectSkillRoots()),
    ]);

    const discovered = await discoverSkills(roots);
    const discoveredIds = new Set<string>();

    let added = 0;
    let updated = 0;
    let unchanged = 0;

    const resolvedDiscovered = new Map<
      string,
      { description: string; hash: string; lastUpdated: string; skillFilePath: string }
    >();
    for (const discoveredSkill of discovered.values()) {
      let content: string;
      try {
        content = await fs.readFile(discoveredSkill.skillFilePath, 'utf8');
      } catch {
        continue;
      }

      const metadata = parseSkillFrontMatter(content);
      const skillId = (metadata.name ?? '').trim();
      if (!skillId) {
        continue;
      }

      const description = (metadata.description ?? '').trim();
      resolvedDiscovered.set(skillId, {
        description,
        hash: createContentHash(content),
        lastUpdated: discoveredSkill.lastUpdated,
        skillFilePath: discoveredSkill.skillFilePath,
      });
    }

    for (const [skillId, discoveredSkill] of [...resolvedDiscovered.entries()].sort(([leftId], [rightId]) =>
      leftId.localeCompare(rightId),
    )) {
      discoveredIds.add(skillId);

      const existing = registry.get(skillId);
      const nextHash = discoveredSkill.hash;
      registrySourcePaths.set(skillId, discoveredSkill.skillFilePath);
      if (existing && existing.hash === nextHash) {
        unchanged += 1;
        continue;
      }

      registry.set(skillId, {
        skill_id: skillId,
        description: discoveredSkill.description,
        hash: nextHash,
        lastUpdated: discoveredSkill.lastUpdated,
      });

      if (existing) {
        updated += 1;
      } else {
        added += 1;
      }
    }

    let removed = 0;
    for (const skillId of [...registry.keys()]) {
      if (!discoveredIds.has(skillId)) {
        registry.delete(skillId);
        registrySourcePaths.delete(skillId);
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
    return [...registry.values()].sort((left, right) =>
      left.skill_id.localeCompare(right.skill_id),
    );
  }

  function getSkill(skillId: string): SkillRegistryEntry | undefined {
    return registry.get(skillId);
  }

  function getSkillSourcePath(skillId: string): string | undefined {
    return registrySourcePaths.get(skillId);
  }

  function clearSkillsForTests(): void {
    registry.clear();
    registrySourcePaths.clear();
  }

  return { syncSkills, getSkills, getSkill, getSkillSourcePath, clearSkillsForTests };
}

export const skillRegistry = createSkillRegistrySingleton();
export const syncSkills = skillRegistry.syncSkills;
export const getSkills = skillRegistry.getSkills;
export const getSkill = skillRegistry.getSkill;
export const getSkillSourcePath = skillRegistry.getSkillSourcePath;
export const clearSkillsForTests = skillRegistry.clearSkillsForTests;

const EMPTY_SYNC_RESULT: SyncSkillsResult = {
  added: 0,
  updated: 0,
  removed: 0,
  unchanged: 0,
  total: 0,
};

let initialSkillSyncPromise: Promise<SyncSkillsResult> | null = null;

function ensureInitialSkillSyncStarted(): Promise<SyncSkillsResult> {
  if (!initialSkillSyncPromise) {
    initialSkillSyncPromise = syncSkills().catch(() => EMPTY_SYNC_RESULT);
  }
  return initialSkillSyncPromise;
}

export function waitForInitialSkillSync(): Promise<SyncSkillsResult> {
  return ensureInitialSkillSyncStarted();
}

// Keep the registry warm when core loads, without breaking module import flows on sync errors.
void ensureInitialSkillSyncStarted();
