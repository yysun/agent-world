import { describe, expect, it } from 'vitest';

import {
  createEmptySkillInstallPreviewState,
  deriveLocalSkillCandidateName,
  extractSkillDescriptionFromMarkdown,
  extractSkillDescriptionFromPreviewFiles,
  filterGitHubSkillOptions,
  filterLocalSkillOptions,
  isSkillInstallFileEditable,
  mergeSkillInstallDraftFiles,
  resolveLocalSkillPreviewSelection,
  resolveSkillInstallEditorStageOnPreview,
  resolveSelectedGitHubSkillName,
  resolveSelectedLocalSkillName,
  shouldApplyGitHubSkillLoadResult,
  shouldApplyLocalSkillLoadResult,
} from '../../../electron/renderer/src/domain/skill-install-preview';

describe('skill install preview domain', () => {
  it('returns the current GitHub skill when it still exists in the refreshed repo list', () => {
    expect(resolveSelectedGitHubSkillName('hello-world', [
      { skillId: 'hello-world', description: '' },
      { skillId: 'agent-lab', description: '' },
    ])).toBe('hello-world');
  });

  it('falls back to the first GitHub skill when the current selection no longer exists', () => {
    expect(resolveSelectedGitHubSkillName('missing-skill', [
      { skillId: 'hello-world', description: '' },
      { skillId: 'agent-lab', description: '' },
    ])).toBe('hello-world');
    expect(resolveSelectedGitHubSkillName('missing-skill', [])).toBe('');
  });

  it('filters loaded GitHub skills by a case-insensitive search query', () => {
    expect(filterGitHubSkillOptions([
      { skillId: 'hello-world', description: '' },
      { skillId: 'Agent Lab', description: '' },
      { skillId: 'reviewer', description: '' },
    ], 'ag')).toEqual([{ skillId: 'Agent Lab', description: '' }]);
    expect(filterGitHubSkillOptions([
      { skillId: 'hello-world', description: '' },
      { skillId: 'Agent Lab', description: '' },
      { skillId: 'reviewer', description: '' },
    ], '')).toEqual([
      { skillId: 'hello-world', description: '' },
      { skillId: 'Agent Lab', description: '' },
      { skillId: 'reviewer', description: '' },
    ]);
  });

  it('returns the current local skill when it still exists in the refreshed root scan', () => {
    expect(resolveSelectedLocalSkillName('reviewer', [
      { skillId: 'reviewer', description: '', folderPath: '/tmp/root/.agent-world/skills/reviewer', relativePath: '.agent-world/skills/reviewer' },
      { skillId: 'planner', description: '', folderPath: '/tmp/root/packages/tools/skills/planner', relativePath: 'packages/tools/skills/planner' },
    ])).toBe('reviewer');
  });

  it('filters loaded local skills by a case-insensitive search query', () => {
    expect(filterLocalSkillOptions([
      { skillId: 'reviewer', description: '', folderPath: '/tmp/root/.agent-world/skills/reviewer', relativePath: '.agent-world/skills/reviewer' },
      { skillId: 'planner', description: '', folderPath: '/tmp/root/packages/tools/skills/planner', relativePath: 'packages/tools/skills/planner' },
      { skillId: 'repo-root-skill', description: '', folderPath: '/tmp/root', relativePath: '.' },
    ], 'packages/tools')).toEqual([
      { skillId: 'planner', description: '', folderPath: '/tmp/root/packages/tools/skills/planner', relativePath: 'packages/tools/skills/planner' },
    ]);
  });

  it('prefers an exact local folder path when duplicate skill names exist', () => {
    expect(resolveLocalSkillPreviewSelection([
      { skillId: 'reviewer', description: '', folderPath: '/tmp/root/.agent-world/skills/reviewer', relativePath: '.agent-world/skills/reviewer' },
      { skillId: 'reviewer', description: '', folderPath: '/tmp/root/packages/tools/skills/reviewer', relativePath: 'packages/tools/skills/reviewer' },
    ], 'reviewer', '/tmp/root/packages/tools/skills/reviewer')).toEqual({
      skillName: 'reviewer',
      folderPath: '/tmp/root/packages/tools/skills/reviewer',
    });
  });

  it('ignores stale GitHub skill-load results when the active request or repo changed', () => {
    expect(shouldApplyGitHubSkillLoadResult({
      activeRequestId: 3,
      requestId: 3,
      currentRepo: 'yysun/awesome-agent-world',
      requestRepo: 'yysun/awesome-agent-world',
    })).toBe(true);

    expect(shouldApplyGitHubSkillLoadResult({
      activeRequestId: 4,
      requestId: 3,
      currentRepo: 'yysun/awesome-agent-world',
      requestRepo: 'yysun/awesome-agent-world',
    })).toBe(false);

    expect(shouldApplyGitHubSkillLoadResult({
      activeRequestId: 3,
      requestId: 3,
      currentRepo: 'yysun/apprun-skills',
      requestRepo: 'yysun/awesome-agent-world',
    })).toBe(false);
  });

  it('ignores stale local skill-load results when the active request or root path changed', () => {
    expect(shouldApplyLocalSkillLoadResult({
      activeRequestId: 2,
      requestId: 2,
      currentSourcePath: '/tmp/root',
      requestSourcePath: '/tmp/root',
    })).toBe(true);

    expect(shouldApplyLocalSkillLoadResult({
      activeRequestId: 3,
      requestId: 2,
      currentSourcePath: '/tmp/root',
      requestSourcePath: '/tmp/root',
    })).toBe(false);

    expect(shouldApplyLocalSkillLoadResult({
      activeRequestId: 2,
      requestId: 2,
      currentSourcePath: '/tmp/other-root',
      requestSourcePath: '/tmp/root',
    })).toBe(false);
  });

  it('keeps install preview open even if preview loading fails', () => {
    expect(resolveSkillInstallEditorStageOnPreview()).toBe('preview');
    expect(resolveSkillInstallEditorStageOnPreview(true)).toBe('preview');
    expect(resolveSkillInstallEditorStageOnPreview(false)).toBe('preview');
  });

  it('derives the local candidate name from the current override or folder path', () => {
    expect(deriveLocalSkillCandidateName('/tmp/skills/reviewer', '')).toBe('reviewer');
    expect(deriveLocalSkillCandidateName('/tmp/skills/reviewer/', 'custom-name')).toBe('custom-name');
    expect(deriveLocalSkillCandidateName('', '')).toBe('');
  });

  it('drops unchanged install drafts so installs only overlay edited text files', () => {
    const previewFiles = {
      'SKILL.md': '# Skill',
      'notes.txt': 'hello',
    };
    const draftFiles = mergeSkillInstallDraftFiles({}, previewFiles, 'SKILL.md', '# Skill updated');

    expect(draftFiles).toEqual({ 'SKILL.md': '# Skill updated' });
    expect(mergeSkillInstallDraftFiles(draftFiles, previewFiles, 'SKILL.md', '# Skill')).toEqual({});
  });

  it('marks preview files missing from the text map as non-editable', () => {
    expect(isSkillInstallFileEditable({ 'SKILL.md': '# Skill' }, 'SKILL.md')).toBe(true);
    expect(isSkillInstallFileEditable({ 'SKILL.md': '# Skill' }, 'banner.png')).toBe(false);
  });

  it('creates the canonical empty install preview state', () => {
    expect(createEmptySkillInstallPreviewState()).toEqual({
      selectedFilePath: 'SKILL.md',
      content: '',
      savedContent: '',
      folderEntries: [],
      previewFiles: {},
      draftFiles: {},
    });
  });

  it('extracts folded front-matter descriptions from skill markdown', () => {
    const markdown = [
      '---',
      'name: reviewer',
      'description: >',
      '  Review pull requests for correctness, regressions, and missing tests.',
      '  Keep findings concise and severity-ordered.',
      '---',
      '',
      '# Reviewer',
    ].join('\n');

    expect(extractSkillDescriptionFromMarkdown(markdown)).toBe('Review pull requests for correctness, regressions, and missing tests. Keep findings concise and severity-ordered.');
  });

  it('finds the skill description from preview files', () => {
    expect(extractSkillDescriptionFromPreviewFiles({
      'docs/readme.md': '# Docs',
      'SKILL.md': '---\ndescription: "Helpful install summary"\n---\n# Skill',
    })).toBe('Helpful install summary');
  });
});