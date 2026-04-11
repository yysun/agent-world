/**
 * Skill Root Contract - Shared canonical and legacy Agent World skill roots.
 *
 * Purpose:
 * - Centralize canonical skill-root defaults, legacy compatibility roots, and
 *   user-facing project skill labels across core and Electron flows.
 *
 * Key Features:
 * - Defines canonical global/project skill roots and display labels.
 * - Provides ordered default root descriptors with explicit precedence.
 * - Maps canonical project path aliases to the shared on-disk project skills
 *   directory used by Agent World.
 * - Uses canonical-only global and project defaults for skill discovery.
 *
 * Implementation Notes:
 * - The canonical project root is `<working_directory>/.agent-world/skills`.
 * - Canonical precedence is explicit: project roots outrank global roots.
 * - Explicit caller-provided root arrays are preserved and known canonical
 *   paths still receive their matching precedence ranks.
 *
 * Recent Changes:
 * - 2026-04-11: Switched canonical roots to `~/.agent-world/skills` and
 *   `./.agent-world/skills`, removed legacy compatibility roots, and stopped
 *   deriving project-scope defaults from the home-directory fallback.
 * - 2026-04-11: Initial shared canonical skill-root contract extracted from
 *   registry, runtime helper, and Electron import logic.
 */

import { homedir } from 'os';
import * as path from 'path';

export type SkillRootScope = 'global' | 'project';
export type SkillRootKind = 'canonical' | 'legacy' | 'custom';

export interface SkillRootDescriptor {
  kind: SkillRootKind;
  precedence: number;
  rootPath: string;
  sourceScope: SkillRootScope;
}

export interface ResolveSkillRootOptions {
  projectSkillRoots?: string[];
  userSkillRoots?: string[];
  worldVariablesText?: string;
}

export const CANONICAL_PROJECT_SKILL_DISPLAY_ROOT = './.agent-world/skills';
export const CANONICAL_PROJECT_SKILL_ALIAS_PREFIXES = [
  './.agent-world/skills/',
  '.agent-world/skills/',
];
export const SUPPORTED_PROJECT_SKILL_PATH_PREFIXES = [
  ...CANONICAL_PROJECT_SKILL_ALIAS_PREFIXES,
];

function normalizeRoots(roots: string[]): string[] {
  const resolved = roots
    .map((candidate) => String(candidate || '').trim())
    .filter((candidate) => candidate.length > 0)
    .map((candidate) => path.resolve(candidate));
  return [...new Set(resolved)];
}

export function getWorkingDirectoryFromWorldVariables(variablesText: string | undefined): string {
  const lines = String(variablesText || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (key !== 'working_directory') {
      continue;
    }

    const value = trimmed.slice(separatorIndex + 1).trim();
    if (value.length > 0) {
      return value;
    }
  }

  return '';
}

export function resolveDefaultSkillWorkingDirectory(worldVariablesText?: string): string {
  return getWorkingDirectoryFromWorldVariables(worldVariablesText) || homedir();
}

export function getCanonicalGlobalSkillRoot(): string {
  return path.join(homedir(), '.agent-world', 'skills');
}

export function getLegacyGlobalSkillRoots(): string[] {
  return [];
}

export function getDefaultGlobalSkillRoots(): string[] {
  return normalizeRoots([getCanonicalGlobalSkillRoot()]);
}

export function getCanonicalProjectSkillRoot(workingDirectory: string): string {
  return path.join(path.resolve(workingDirectory), '.agent-world', 'skills');
}

export function getLegacyProjectSkillRoots(workingDirectory: string): string[] {
  return [];
}

export function getDefaultProjectSkillRoots(workingDirectory: string): string[] {
  return normalizeRoots([getCanonicalProjectSkillRoot(workingDirectory)]);
}

function getCanonicalRootForScope(scope: SkillRootScope, workingDirectory: string): string {
  return scope === 'global'
    ? getCanonicalGlobalSkillRoot()
    : getCanonicalProjectSkillRoot(workingDirectory);
}

function getLegacyRootsForScope(scope: SkillRootScope, workingDirectory: string): string[] {
  return scope === 'global'
    ? getLegacyGlobalSkillRoots()
    : getLegacyProjectSkillRoots(workingDirectory);
}

function getKnownRootKind(
  rootPath: string,
  scope: SkillRootScope,
  workingDirectory: string,
): SkillRootKind {
  const normalizedRootPath = path.resolve(rootPath);
  if (normalizedRootPath === path.resolve(getCanonicalRootForScope(scope, workingDirectory))) {
    return 'canonical';
  }

  if (getLegacyRootsForScope(scope, workingDirectory).some((legacyRoot) => normalizedRootPath === path.resolve(legacyRoot))) {
    return 'legacy';
  }

  return 'custom';
}

function getScopePrecedence(scope: SkillRootScope, kind: SkillRootKind): number {
  if (scope === 'project') {
    if (kind === 'canonical') {
      return 3;
    }
    return 2;
  }

  if (kind === 'legacy') {
    return 0;
  }
  return 1;
}

function buildRootDescriptors(
  roots: string[],
  scope: SkillRootScope,
  workingDirectory: string,
): SkillRootDescriptor[] {
  return normalizeRoots(roots).map((rootPath) => {
    const kind = getKnownRootKind(rootPath, scope, workingDirectory);
    return {
      rootPath,
      sourceScope: scope,
      kind,
      precedence: getScopePrecedence(scope, kind),
    };
  });
}

export function resolveSkillRootDescriptors(options: ResolveSkillRootOptions = {}): SkillRootDescriptor[] {
  const workingDirectory = getWorkingDirectoryFromWorldVariables(options.worldVariablesText).trim();
  const userRoots = options.userSkillRoots ?? getDefaultGlobalSkillRoots();
  const projectRoots = options.projectSkillRoots ?? (workingDirectory
    ? getDefaultProjectSkillRoots(workingDirectory)
    : []);
  const userRootSet = new Set(normalizeRoots(userRoots));
  const filteredProjectRoots = normalizeRoots(projectRoots).filter((rootPath) => !userRootSet.has(rootPath));

  return [
    ...buildRootDescriptors(userRoots, 'global', workingDirectory),
    ...buildRootDescriptors(filteredProjectRoots, 'project', workingDirectory),
  ];
}

export function resolveCanonicalProjectSkillAliasPath(
  candidatePath: string,
  workingDirectory: string,
): string | null {
  const normalizedCandidate = path.resolve(candidatePath);
  const projectAliasRoot = path.resolve(workingDirectory, '.agent-world', 'skills');
  const relativeToAliasRoot = path.relative(projectAliasRoot, normalizedCandidate);

  if (
    normalizedCandidate !== projectAliasRoot
    && (relativeToAliasRoot.startsWith('..') || path.isAbsolute(relativeToAliasRoot))
  ) {
    return null;
  }

  return path.resolve(getCanonicalProjectSkillRoot(workingDirectory), relativeToAliasRoot || '');
}

export function remapCanonicalProjectSkillPrefix(candidatePath: string): string {
  const normalized = String(candidatePath || '').replace(/\\/g, '/');
  for (const prefix of CANONICAL_PROJECT_SKILL_ALIAS_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return `.agent-world/skills/${normalized.slice(prefix.length)}`;
    }
  }
  return candidatePath;
}
