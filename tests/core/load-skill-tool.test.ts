/**
 * load_skill Tool Tests
 *
 * Purpose:
 * - Validate progressive skill loading tool behavior for success and failure paths.
 *
 * Features tested:
 * - Loads full SKILL.md content by `skill_id` from registry-provided source path
 * - Returns structured not-found output for unknown IDs
 * - Returns structured read-error output when SKILL.md cannot be read
 *
 * Implementation notes:
 * - Uses mocked registry APIs for deterministic lookup behavior
 * - Uses mocked in-memory fs APIs only (no filesystem access)
 *
 * Recent changes:
 * - 2026-02-14: Added initial unit coverage for the built-in `load_skill` tool.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fsModule from 'fs';
import { createLoadSkillToolDefinition } from '../../core/load-skill-tool.js';
import {
  getSkill,
  getSkillSourcePath,
  waitForInitialSkillSync,
} from '../../core/skill-registry.js';

vi.mock('../../core/skill-registry.js', () => ({
  getSkill: vi.fn(),
  getSkillSourcePath: vi.fn(),
  waitForInitialSkillSync: vi.fn(async () => ({
    added: 0,
    updated: 0,
    removed: 0,
    unchanged: 0,
    total: 0,
  })),
}));

const fs = vi.mocked(fsModule.promises);
const mockedGetSkill = vi.mocked(getSkill);
const mockedGetSkillSourcePath = vi.mocked(getSkillSourcePath);
const mockedWaitForInitialSkillSync = vi.mocked(waitForInitialSkillSync);

describe('core/load-skill-tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedWaitForInitialSkillSync.mockResolvedValue({
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 0,
      total: 1,
    });
  });

  it('returns skill context with full SKILL.md content when skill exists', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'pdf-extract',
      description: 'Extract PDF content',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
    vi.mocked(fs.readFile).mockResolvedValue('# PDF Extraction Instructions\n1. Use tool X...\n' as any);

    const tool = createLoadSkillToolDefinition();
    const result = await tool.execute({ skill_id: 'pdf-extract' });

    expect(mockedWaitForInitialSkillSync).toHaveBeenCalledTimes(1);
    expect(fs.readFile).toHaveBeenCalledWith('/skills/pdf-extract/SKILL.md', 'utf8');
    expect(result).toContain('<skill_context id="pdf-extract">');
    expect(result).toContain('<instructions>');
    expect(result).toContain('# PDF Extraction Instructions');
    expect(result).toContain('<execution_directive>');
    expect(result).toContain('specialized pdf-extract protocol');
  });

  it('returns structured not-found output when skill id does not exist', async () => {
    mockedGetSkill.mockReturnValue(undefined);
    mockedGetSkillSourcePath.mockReturnValue(undefined);

    const tool = createLoadSkillToolDefinition();
    const result = await tool.execute({ skill_id: 'missing-skill' });

    expect(result).toContain('<skill_context id="missing-skill">');
    expect(result).toContain('<error>');
    expect(result).toContain('was not found in the current registry');
  });

  it('returns structured read-error output when skill file cannot be read', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'pdf-extract',
      description: 'Extract PDF content',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
    vi.mocked(fs.readFile).mockRejectedValue(new Error('EACCES: permission denied'));

    const tool = createLoadSkillToolDefinition();
    const result = await tool.execute({ skill_id: 'pdf-extract' });

    expect(result).toContain('<skill_context id="pdf-extract">');
    expect(result).toContain('<error>');
    expect(result).toContain('Failed to load SKILL.md');
    expect(result).toContain('EACCES');
  });
});
