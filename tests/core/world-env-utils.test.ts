/**
 * World Env Utilities Tests
 *
 * Purpose:
 * - Validate .env-style parsing and template interpolation utilities.
 *
 * Key Features:
 * - Ensures comments/blank lines are ignored.
 * - Verifies duplicate-key resolution (last value wins).
 * - Confirms missing template variables resolve to empty string.
 *
 * Notes:
 * - Tests are pure utility tests with no storage/LLM dependencies.
 *
 * Recent changes:
 * - 2026-02-14: Updated missing `working_directory` default expectation to use core default working directory resolver (user home in Node runtimes).
 */

import { describe, expect, it } from 'vitest';
import {
  getDefaultWorkingDirectory,
  getEnvValueFromText,
  interpolateTemplateVariables,
  parseEnvText
} from '../../core/utils.js';

describe('world env utilities', () => {
  it('parses .env text with comments, blanks, and whitespace around =', () => {
    const parsed = parseEnvText(`
# Comment
project_name = agent-world

working_directory=/tmp
`);

    expect(parsed).toEqual({
      project_name: 'agent-world',
      working_directory: '/tmp'
    });
  });

  it('uses last definition for duplicate keys', () => {
    const parsed = parseEnvText(`project_name=old\nproject_name=new`);
    expect(parsed.project_name).toBe('new');
  });

  it('ignores invalid lines without crashing', () => {
    const parsed = parseEnvText(`INVALID\n=missingKey\nvalid_key=value`);
    expect(parsed).toEqual({ valid_key: 'value' });
  });

  it('gets env value from text', () => {
    const value = getEnvValueFromText('working_directory=/workspace', 'working_directory');
    expect(value).toBe('/workspace');
  });

  it('defaults working_directory to core default working directory when missing', () => {
    const value = getEnvValueFromText('', 'working_directory');
    expect(value).toBe(getDefaultWorkingDirectory());
  });

  it('interpolates template variables with optional spaces', () => {
    const text = interpolateTemplateVariables(
      'Project {{ project_name }} at {{working_directory}}',
      {
        project_name: 'agent-world',
        working_directory: '/tmp/project'
      }
    );

    expect(text).toBe('Project agent-world at /tmp/project');
  });

  it('replaces undefined variables with empty string', () => {
    const text = interpolateTemplateVariables('Missing={{ missing_key }}', {});
    expect(text).toBe('Missing=');
  });
});
