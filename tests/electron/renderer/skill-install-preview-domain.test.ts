import { describe, expect, it } from 'vitest';

import {
  createEmptySkillInstallPreviewState,
  extractSkillDescriptionFromMarkdown,
  extractSkillDescriptionFromPreviewFiles,
  isSkillInstallFileEditable,
  mergeSkillInstallDraftFiles,
  resolveSelectedGitHubSkillName,
} from '../../../electron/renderer/src/domain/skill-install-preview';

describe('skill install preview domain', () => {
  it('returns the current GitHub skill when it still exists in the refreshed repo list', () => {
    expect(resolveSelectedGitHubSkillName('hello-world', ['hello-world', 'agent-lab'])).toBe('hello-world');
  });

  it('falls back to the first GitHub skill when the current selection no longer exists', () => {
    expect(resolveSelectedGitHubSkillName('missing-skill', ['hello-world', 'agent-lab'])).toBe('hello-world');
    expect(resolveSelectedGitHubSkillName('missing-skill', [])).toBe('');
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