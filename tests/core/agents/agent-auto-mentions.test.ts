/**
 * Unit Tests for Agent Auto-Mention Utilities
 *
 * Features:
 * - Tests for hasAnyMentionAtBeginning function - detects any mention at paragraph start
 * - Tests for addAutoMention function - adds mention when none exists at start
 * - Tests for removeSelfMentions function - removes agent's own mentions from beginning
 * - Tests for loop prevention integration - prevents mention loops in agent conversations
 *
 * Implementation:
 * - Tests auto-mention utility functions in isolation
 * - No file I/O or LLM dependencies
 * - Tests edge cases and integration scenarios
 * - Validates mention processing and loop prevention logic
 */

import { describe, test, expect } from '@jest/globals';
import {
  hasAnyMentionAtBeginning,
  addAutoMention,
  removeSelfMentions
} from '../../../core/events.js';

describe('Agent Auto-Mention Utilities', () => {
  describe('hasAnyMentionAtBeginning', () => {
    test('should detect any mention at beginning', () => {
      expect(hasAnyMentionAtBeginning('@human hello')).toBe(true);
      expect(hasAnyMentionAtBeginning('@gm hello')).toBe(true);
      expect(hasAnyMentionAtBeginning('@pro hello')).toBe(true);
    });

    test('should not detect mentions in middle', () => {
      expect(hasAnyMentionAtBeginning('hello @human')).toBe(false);
      expect(hasAnyMentionAtBeginning('I think @gm should help')).toBe(false);
    });

    test('should handle empty strings', () => {
      expect(hasAnyMentionAtBeginning('')).toBe(false);
      expect(hasAnyMentionAtBeginning('   ')).toBe(false);
    });

    test('should handle mentions with newlines', () => {
      expect(hasAnyMentionAtBeginning('@human\n hello')).toBe(true);
      expect(hasAnyMentionAtBeginning('@gm\t hello')).toBe(true);
    });
  });

  describe('addAutoMention', () => {
    test('should add auto-mention when no mention exists', () => {
      expect(addAutoMention('Hello there!', 'human')).toBe('@human Hello there!');
      expect(addAutoMention('How can I help?', 'gm')).toBe('@gm How can I help?');
    });

    test('should NOT add auto-mention when ANY mention exists at beginning', () => {
      expect(addAutoMention('@gm Hello there!', 'human')).toBe('@gm Hello there!');
      expect(addAutoMention('@pro Please help', 'gm')).toBe('@pro Please help');
      expect(addAutoMention('@con Take this task', 'human')).toBe('@con Take this task');
    });

    test('should handle empty strings', () => {
      expect(addAutoMention('', 'human')).toBe('');
      expect(addAutoMention('   ', 'gm')).toBe('   ');
    });

    test('should trim response but preserve original structure', () => {
      expect(addAutoMention('  Hello there!  ', 'human')).toBe('@human Hello there!');
    });
  });

  describe('removeSelfMentions', () => {
    test('should remove self-mentions from beginning', () => {
      expect(removeSelfMentions('@alice I should handle this.', 'alice')).toBe('I should handle this.');
      expect(removeSelfMentions('@gm @gm I will help.', 'gm')).toBe('I will help.');
    });

    test('should be case-insensitive', () => {
      expect(removeSelfMentions('@Alice @ALICE @alice I can help.', 'alice')).toBe('I can help.');
    });

    test('should preserve mentions in middle', () => {
      expect(removeSelfMentions('@alice I think @alice should work with @bob.', 'alice')).toBe('I think @alice should work with @bob.');
    });

    test('should handle empty strings', () => {
      expect(removeSelfMentions('', 'alice')).toBe('');
      expect(removeSelfMentions('   ', 'gm')).toBe('   ');
    });
  });

  describe('Loop Prevention Integration', () => {
    test('should prevent @gm->@pro->@gm loops', () => {
      // Simulate @pro responding to @gm
      let response = '@gm I will work on this task.';

      // Step 1: Remove self-mentions (pro removes @pro mentions, but there are none)
      response = removeSelfMentions(response, 'pro');
      expect(response).toBe('@gm I will work on this task.');

      // Step 2: Add auto-mention (should NOT add @gm because @gm already exists)
      response = addAutoMention(response, 'gm');
      expect(response).toBe('@gm I will work on this task.');
    });

    test('should allow @gm->@con redirections', () => {
      // Simulate @gm redirecting to @con
      let response = '@con Please handle this request.';

      // Step 1: Remove self-mentions (gm removes @gm mentions, but there are none)
      response = removeSelfMentions(response, 'gm');
      expect(response).toBe('@con Please handle this request.');

      // Step 2: Add auto-mention (should NOT add auto-mention because @con already exists)
      response = addAutoMention(response, 'human');
      expect(response).toBe('@con Please handle this request.');
    });

    test('should add auto-mention when no mention exists', () => {
      // Normal response without any mentions
      let response = 'I understand your request.';

      // Step 1: Remove self-mentions
      response = removeSelfMentions(response, 'gm');
      expect(response).toBe('I understand your request.');

      // Step 2: Add auto-mention (should add because no mention exists)
      response = addAutoMention(response, 'human');
      expect(response).toBe('@human I understand your request.');
    });
  });
});
