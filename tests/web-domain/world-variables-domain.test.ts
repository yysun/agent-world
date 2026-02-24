/**
 * Web World Variables Domain Tests
 *
 * Purpose:
 * - Verify `.env`-style world variable parsing/upsert helpers used by web Project-button flow.
 *
 * Coverage:
 * - Reads existing env values while ignoring comments/blank lines.
 * - Replaces existing key values.
 * - Appends missing keys with stable newline behavior.
 */

import { describe, expect, it } from 'vitest';
import { getEnvValueFromText, upsertEnvVariable } from '../../web/src/domain/world-variables';

describe('web/world-variables domain', () => {
  it('reads existing env values and ignores comments', () => {
    const text = [
      '# world settings',
      '',
      'project_name=agent-world',
      'working_directory=/tmp/project',
    ].join('\n');

    expect(getEnvValueFromText(text, 'working_directory')).toBe('/tmp/project');
    expect(getEnvValueFromText(text, 'missing_key')).toBeNull();
  });

  it('replaces existing key values', () => {
    const text = [
      'project_name=agent-world',
      'working_directory=/tmp/project',
    ].join('\n');

    const next = upsertEnvVariable(text, 'working_directory', '/Users/me/work');
    expect(next).toContain('working_directory=/Users/me/work');
    expect(next).not.toContain('working_directory=/tmp/project');
  });

  it('appends missing keys with separator newline when needed', () => {
    const text = 'project_name=agent-world';
    const next = upsertEnvVariable(text, 'working_directory', '/Users/me/work');
    expect(next).toBe('project_name=agent-world\n\nworking_directory=/Users/me/work');
  });

  it('appends missing key without leading newline when source is empty', () => {
    const next = upsertEnvVariable('', 'working_directory', '/Users/me/work');
    expect(next).toBe('working_directory=/Users/me/work');
  });
});
