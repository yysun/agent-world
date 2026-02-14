/**
 * Purpose: Validate core skill registry synchronization behavior with mocked filesystem state.
 *
 * Key Features:
 * - Verifies singleton registry sync add/update/no-op/remove flows
 * - Ensures `skill_id` and `description` come from SKILL.md front matter
 * - Confirms deterministic sorted output and resilience to missing roots
 *
 * Implementation Notes:
 * - Uses global Vitest fs mock from tests/vitest-setup.ts
 * - Mocks only in-memory directory/file structures (no real filesystem access)
 * - Exercises syncSkills through exported singleton helpers
 *
 * Recent Changes:
 * - 2026-02-14: Added default-root coverage for `~/.codex/skills` and precedence regression for project overrides even with older mtimes.
 * - 2026-02-14: Added precedence coverage ensuring project-root skill definitions override user-root collisions by shared front-matter `name`.
 * - 2026-02-14: Updated hash-change coverage to assert full-file-content hashing (body changes now update entries).
 * - 2026-02-14: Updated coverage for front-matter-based skill metadata (`name`, `description`).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fsModule from 'fs';
import {
  clearSkillsForTests,
  getSkill,
  getSkills,
  syncSkills,
} from '../../core/skill-registry.js';

type DirectoryEntry = {
  name: string;
  type: 'directory' | 'file';
};

type FileFixture = {
  content: string;
  mtime: Date;
};

const fs = vi.mocked(fsModule.promises);

function toDirent(entry: DirectoryEntry): fsModule.Dirent {
  return {
    name: entry.name,
    isDirectory: () => entry.type === 'directory',
    isFile: () => entry.type === 'file',
  } as fsModule.Dirent;
}

function normalizePathKey(input: string): string {
  const normalized = input.replace(/\\/g, '/').replace(/\/+/g, '/');
  return normalized.endsWith('/') && normalized.length > 1
    ? normalized.slice(0, -1)
    : normalized;
}

function getRecordValue<T>(record: Record<string, T>, key: string): T | undefined {
  const normalized = normalizePathKey(key);
  const noLeadingSlash = normalized.replace(/^\/+/, '');
  const withLeadingSlash = `/${noLeadingSlash}`;
  return record[normalized] ?? record[noLeadingSlash] ?? record[withLeadingSlash];
}

function setupFsScenario(
  directories: Record<string, DirectoryEntry[]>,
  files: Record<string, FileFixture>,
): void {
  const fsAny = fs as any;
  if (!fsAny.stat) {
    fsAny.stat = vi.fn();
  }

  vi.mocked(fsAny.access).mockImplementation(async (targetPath: any) => {
    const key = String(targetPath);
    if (getRecordValue(directories, key) || getRecordValue(files, key)) {
      return;
    }
    throw new Error(`ENOENT: ${key}`);
  });

  vi.mocked(fsAny.readdir).mockImplementation(async (targetPath: any) => {
    const key = String(targetPath);
    const entries = getRecordValue(directories, key);
    if (!entries) {
      throw new Error(`ENOENT: ${key}`);
    }
    return entries.map(toDirent) as any;
  });

  vi.mocked(fsAny.stat).mockImplementation(async (targetPath: any) => {
    const key = String(targetPath);
    const file = getRecordValue(files, key);
    if (!file) {
      throw new Error(`ENOENT: ${key}`);
    }
    return { mtime: file.mtime } as fsModule.Stats;
  });

  vi.mocked(fsAny.readFile).mockImplementation(async (targetPath: any) => {
    const key = String(targetPath);
    const file = getRecordValue(files, key);
    if (!file) {
      throw new Error(`ENOENT: ${key}`);
    }
    return file.content as any;
  });
}

describe('core/skill-registry', () => {
  beforeEach(() => {
    clearSkillsForTests();
    vi.clearAllMocks();
  });

  it('adds skills from user and project roots using front-matter name as skill_id', async () => {
    setupFsScenario(
      {
        'user-root': [{ name: 'pdf-folder', type: 'directory' }],
        'user-root/pdf-folder': [{ name: 'SKILL.md', type: 'file' }],
        'project-root': [{ name: 'apprun-folder', type: 'directory' }],
        'project-root/apprun-folder': [{ name: 'SKILL.md', type: 'file' }],
      },
      {
        'user-root/pdf-folder/SKILL.md': {
          content: [
            '---',
            'name: pdf-extract',
            'description: Extract content from PDF files',
            '---',
            '',
            '# Skill body should not be stored in description',
          ].join('\n'),
          mtime: new Date('2026-02-14T08:00:00.000Z'),
        },
        'project-root/apprun-folder/SKILL.md': {
          content: [
            '---',
            'name: apprun-skills',
            'description: Build AppRun components',
            '---',
            '',
            'Body text',
          ].join('\n'),
          mtime: new Date('2026-02-14T08:05:00.000Z'),
        },
      },
    );

    const result = await syncSkills({
      userSkillRoots: ['user-root'],
      projectSkillRoots: ['project-root'],
    });

    expect(result).toEqual({
      added: 2,
      updated: 0,
      removed: 0,
      unchanged: 0,
      total: 2,
    });

    expect(getSkills().map((entry) => entry.skill_id)).toEqual([
      'apprun-skills',
      'pdf-extract',
    ]);
    expect(getSkill('pdf-extract')?.description).toBe('Extract content from PDF files');
    expect(getSkill('pdf-extract')?.hash).toMatch(/^[a-f0-9]{8}$/);
  });

  it('prefers project skill when user and project roots define the same skill_id, even if project mtime is older', async () => {
    setupFsScenario(
      {
        'user-root': [{ name: 'shared', type: 'directory' }],
        'user-root/shared': [{ name: 'SKILL.md', type: 'file' }],
        'project-root': [{ name: 'shared', type: 'directory' }],
        'project-root/shared': [{ name: 'SKILL.md', type: 'file' }],
      },
      {
        'user-root/shared/SKILL.md': {
          content: [
            '---',
            'name: shared-skill',
            'description: From user root',
            '---',
            '',
            'user body',
          ].join('\n'),
          mtime: new Date('2026-02-14T08:10:00.000Z'),
        },
        'project-root/shared/SKILL.md': {
          content: [
            '---',
            'name: shared-skill',
            'description: From project root',
            '---',
            '',
            'project body',
          ].join('\n'),
          mtime: new Date('2026-02-14T08:00:00.000Z'),
        },
      },
    );

    const userOnlyResult = await syncSkills({
      userSkillRoots: ['user-root'],
      projectSkillRoots: [],
    });

    expect(userOnlyResult).toEqual({
      added: 1,
      updated: 0,
      removed: 0,
      unchanged: 0,
      total: 1,
    });
    expect(getSkill('shared-skill')?.description).toBe('From user root');

    const mergedResult = await syncSkills({
      userSkillRoots: ['user-root'],
      projectSkillRoots: ['project-root'],
    });

    expect(mergedResult).toEqual({
      added: 0,
      updated: 1,
      removed: 0,
      unchanged: 0,
      total: 1,
    });
    expect(getSkill('shared-skill')?.description).toBe('From project root');
  });

  it('includes both .agents and .codex directories in default user roots', async () => {
    setupFsScenario({}, {});
    await syncSkills({ projectSkillRoots: [] });

    const accessCalls = vi
      .mocked((fs as any).access)
      .mock
      .calls
      .map((call: any[]) => String(call[0]));

    expect(accessCalls.some((value) => value.includes('.agents/skills'))).toBe(true);
    expect(accessCalls.some((value) => value.includes('.codex/skills'))).toBe(true);
  });

  it('updates when file is newer and full SKILL.md content hash changes', async () => {
    const files: Record<string, FileFixture> = {
      'user-root/pdf-folder/SKILL.md': {
        content: ['---', 'name: pdf-extract', 'description: v1 instructions', '---'].join('\n'),
        mtime: new Date('2026-02-14T09:00:00.000Z'),
      },
    };

    setupFsScenario(
      {
        'user-root': [{ name: 'pdf-folder', type: 'directory' }],
        'user-root/pdf-folder': [{ name: 'SKILL.md', type: 'file' }],
      },
      files,
    );

    await syncSkills({ userSkillRoots: ['user-root'], projectSkillRoots: [] });
    const original = getSkill('pdf-extract');
    expect(original).toBeDefined();

    files['user-root/pdf-folder/SKILL.md'] = {
      content: ['---', 'name: pdf-extract', 'description: v2 instructions', '---'].join('\n'),
      mtime: new Date('2026-02-14T10:00:00.000Z'),
    };

    const updatedResult = await syncSkills({
      userSkillRoots: ['user-root'],
      projectSkillRoots: [],
    });
    const updated = getSkill('pdf-extract');

    expect(updatedResult.updated).toBe(1);
    expect(updated?.description).toBe('v2 instructions');
    expect(updated?.hash).not.toBe(original?.hash);
    expect(updated?.lastUpdated).toBe('2026-02-14T10:00:00.000Z');

    files['user-root/pdf-folder/SKILL.md'] = {
      content: [
        '---',
        'name: pdf-extract',
        'description: v2 instructions',
        '---',
        '',
        'Non-front-matter body changed',
      ].join('\n'),
      mtime: new Date('2026-02-14T11:00:00.000Z'),
    };

    const bodyChangeResult = await syncSkills({
      userSkillRoots: ['user-root'],
      projectSkillRoots: [],
    });
    const afterBodyChange = getSkill('pdf-extract');

    expect(bodyChangeResult.updated).toBe(1);
    expect(afterBodyChange?.description).toBe('v2 instructions');
    expect(afterBodyChange?.hash).not.toBe(updated?.hash);
    expect(afterBodyChange?.lastUpdated).toBe('2026-02-14T11:00:00.000Z');
  });

  it('skips skills missing front-matter name', async () => {
    setupFsScenario(
      {
        'user-root': [{ name: 'missing-name', type: 'directory' }],
        'user-root/missing-name': [{ name: 'SKILL.md', type: 'file' }],
      },
      {
        'user-root/missing-name/SKILL.md': {
          content: ['---', 'description: no name here', '---'].join('\n'),
          mtime: new Date('2026-02-14T11:30:00.000Z'),
        },
      },
    );

    const result = await syncSkills({
      userSkillRoots: ['user-root'],
      projectSkillRoots: [],
    });

    expect(result.total).toBe(0);
    expect(getSkills()).toEqual([]);
  });

  it('removes skills that no longer exist on disk', async () => {
    const directories: Record<string, DirectoryEntry[]> = {
      'user-root': [{ name: 'pdf-folder', type: 'directory' }],
      'user-root/pdf-folder': [{ name: 'SKILL.md', type: 'file' }],
    };
    const files: Record<string, FileFixture> = {
      'user-root/pdf-folder/SKILL.md': {
        content: ['---', 'name: pdf-extract', 'description: initial', '---'].join('\n'),
        mtime: new Date('2026-02-14T12:00:00.000Z'),
      },
    };

    setupFsScenario(directories, files);
    await syncSkills({ userSkillRoots: ['user-root'], projectSkillRoots: [] });
    expect(getSkills()).toHaveLength(1);

    directories['user-root'] = [];
    delete directories['user-root/pdf-folder'];
    delete files['user-root/pdf-folder/SKILL.md'];

    const result = await syncSkills({
      userSkillRoots: ['user-root'],
      projectSkillRoots: [],
    });

    expect(result.removed).toBe(1);
    expect(result.total).toBe(0);
    expect(getSkills()).toEqual([]);
  });

  it('handles missing roots and empty discovery without throwing', async () => {
    setupFsScenario({}, {});

    const result = await syncSkills({
      userSkillRoots: ['missing-user-root'],
      projectSkillRoots: ['missing-project-root'],
    });

    expect(result).toEqual({
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 0,
      total: 0,
    });
    expect(getSkills()).toEqual([]);
  });

  it('is deterministic across repeated unchanged sync runs', async () => {
    setupFsScenario(
      {
        'project-root': [
          { name: 'z-folder', type: 'directory' },
          { name: 'a-folder', type: 'directory' },
        ],
        'project-root/z-folder': [{ name: 'SKILL.md', type: 'file' }],
        'project-root/a-folder': [{ name: 'SKILL.md', type: 'file' }],
      },
      {
        'project-root/z-folder/SKILL.md': {
          content: ['---', 'name: z-skill', 'description: z', '---'].join('\n'),
          mtime: new Date('2026-02-14T13:00:00.000Z'),
        },
        'project-root/a-folder/SKILL.md': {
          content: ['---', 'name: a-skill', 'description: a', '---'].join('\n'),
          mtime: new Date('2026-02-14T13:00:00.000Z'),
        },
      },
    );

    await syncSkills({ userSkillRoots: [], projectSkillRoots: ['project-root'] });
    const first = getSkills();
    const secondResult = await syncSkills({
      userSkillRoots: [],
      projectSkillRoots: ['project-root'],
    });
    const second = getSkills();

    expect(secondResult).toEqual({
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 2,
      total: 2,
    });
    expect(second).toEqual(first);
    expect(second.map((entry) => entry.skill_id)).toEqual(['a-skill', 'z-skill']);
  });
});
