/**
 * Unit Tests for Electron Main Skill Helpers
 *
 * Features:
 * - Verifies skill markdown front-matter parsing.
 * - Verifies relative skill file path containment checks.
 *
 * Implementation Notes:
 * - Tests extracted pure helpers directly without Electron runtime setup.
 * - Avoids real filesystem usage by focusing on string parsing and path resolution.
 *
 * Recent Changes:
 * - 2026-04-11: Added coverage for extracted skill markdown and file path helper modules.
 */

import { describe, expect, it } from 'vitest';
import { resolveSkillFilePath } from '../../../electron/main-process/skill-file-helpers';
import { parseSkillDescriptionFromMarkdown, parseSkillNameFromMarkdown } from '../../../electron/main-process/skill-markdown';

describe('electron main skill helpers', () => {
  it('parses quoted skill names from SKILL.md front matter', () => {
    expect(parseSkillNameFromMarkdown([
      '---',
      'name: "repo-root-skill"',
      'description: Demo skill',
      '---',
      '# Skill',
    ].join('\n'))).toBe('repo-root-skill');
  });

  it('parses multiline skill descriptions from SKILL.md front matter', () => {
    expect(parseSkillDescriptionFromMarkdown([
      '---',
      'description: >',
      '  Plans implementation work',
      '  before code changes.',
      '---',
      '# Skill',
    ].join('\n'))).toBe('Plans implementation work before code changes.');
  });

  it('rejects skill file paths that escape the skill root', () => {
    expect(() => resolveSkillFilePath('/tmp/skills/reviewer', '../outside.md')).toThrow('Skill file path must stay within the skill folder.');
  });
});