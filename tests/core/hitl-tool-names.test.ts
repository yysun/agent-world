/**
 * HITL Tool Name Helper Tests
 *
 * Purpose:
 * - Verify shared HITL tool-name helpers keep alias behavior consistent across core modules.
 *
 * Key Features:
 * - Covers alias detection for the legacy and preferred HITL tool names.
 * - Covers preferred-name resolution when one or both aliases are present.
 *
 * Implementation Notes:
 * - Pure unit tests with no world, storage, or provider setup.
 * - Locks the shared helper contract used by validation, replay, and prompt guidance.
 *
 * Recent Changes:
 * - 2026-04-23: Added coverage for consolidated HITL tool-name alias helpers.
 */

import { describe, expect, test } from 'vitest';
import { isHitlToolName, resolvePreferredHitlToolName } from '../../core/hitl-tool-names.js';

describe('hitl-tool-names', () => {
  test('detects both HITL tool aliases', () => {
    expect(isHitlToolName('human_intervention_request')).toBe(true);
    expect(isHitlToolName('ask_user_input')).toBe(true);
    expect(isHitlToolName('shell_cmd')).toBe(false);
  });

  test('prefers ask_user_input when resolving an available HITL tool name', () => {
    expect(resolvePreferredHitlToolName(['human_intervention_request'])).toBe('human_intervention_request');
    expect(resolvePreferredHitlToolName(['human_intervention_request', 'ask_user_input'])).toBe('ask_user_input');
    expect(resolvePreferredHitlToolName(['shell_cmd', 'ask_user_input'])).toBe('ask_user_input');
    expect(resolvePreferredHitlToolName(['shell_cmd'])).toBeNull();
  });
});