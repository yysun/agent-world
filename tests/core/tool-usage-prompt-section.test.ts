/**
 * Tool Usage Prompt Section Tests
 *
 * Purpose:
 * - Verify centralized tool-usage prompt guidance generation in `buildToolUsagePromptSection`.
 *
 * Key Features:
 * - Returns empty guidance when no tools are available.
 * - Includes HITL-specific instructions when `human_intervention_request` is present.
 * - Includes `list_files` narrowing instructions for `includePattern` and bounded `maxEntries`.
 *
 * Notes on Implementation:
 * - Pure unit tests; no storage, world setup, or external provider calls.
 *
 * Recent Changes:
 * - 2026-02-21: Added initial coverage for `list_files` prompt hinting to reduce oversized listing results.
 */

import { describe, expect, test } from 'vitest';
import { buildToolUsagePromptSection } from '../../core/utils.js';

describe('buildToolUsagePromptSection', () => {
  test('returns empty string when no tools are available', () => {
    expect(buildToolUsagePromptSection({ toolNames: [] })).toBe('');
  });

  test('includes base guidance for generic tools', () => {
    const content = buildToolUsagePromptSection({ toolNames: ['shell_cmd'] });
    expect(content).toContain('You have access to tools.');
    expect(content).toContain('Use tools when the user requests an action that requires tool execution.');
  });

  test('includes HITL-only guidance when human_intervention_request is available', () => {
    const content = buildToolUsagePromptSection({ toolNames: ['human_intervention_request'] });
    expect(content).toContain('call human_intervention_request');
    expect(content).toContain('do not request free-text HITL input');
  });

  test('includes list_files narrowing guidance when list_files is available', () => {
    const content = buildToolUsagePromptSection({ toolNames: ['list_files'] });
    expect(content).toContain('includePattern');
    expect(content).toContain('**/*.md');
    expect(content).toContain('maxEntries');
  });
});
