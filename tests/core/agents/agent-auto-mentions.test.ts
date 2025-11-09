/**
 * Unit Tests for Agent Auto-Mention Utilities
 *
 * Features:
 * - Tests for hasAnyMentionAtBeginning function - detects any mention at paragraph start
 * - Tests for addAutoMention function - adds mention when none exists at start
 * - Tests for world tags: <world>STOP|DONE|PASS</world> and <world>TO: a,b,c</world>
 * - Tests for removeSelfMentions function - removes agent's own mentions from beginning
 * - Tests for loop prevention integration - prevents mention loops in agent conversations
 *
 * Implementation:
 * - Tests auto-mention utility functions in isolation
 * - No file I/O or LLM dependencies
 * - Tests edge cases and integration scenarios
 * - Validates mention processing and loop prevention logic
 * - Validates world tag processing for advanced mention control with stop keywords
 */

import { describe, test, expect } from 'vitest';
import {
  hasAnyMentionAtBeginning,
  addAutoMention,
  removeSelfMentions
} from '../../../core/events/index.js';

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

    describe('world tags', () => {
      test('should handle <world>STOP|DONE|PASS</world> tags - no auto mention', () => {
        expect(addAutoMention('<world>STOP</world> I will not respond further.', 'human')).toBe('I will not respond further.');
        expect(addAutoMention('<world>DONE</world> Task completed.', 'gm')).toBe('Task completed.');
        expect(addAutoMention('<world>PASS</world> Passing to another agent.', 'pro')).toBe('Passing to another agent.');
        expect(addAutoMention('Some text <world>STOP</world> more text', 'gm')).toBe('Some text  more text');
        expect(addAutoMention('<world>stop</world> Case insensitive test', 'pro')).toBe('Case insensitive test');
        expect(addAutoMention('<world>done</world> Lowercase test', 'human')).toBe('Lowercase test');
        expect(addAutoMention('<world>PASS</world> Uppercase test', 'gm')).toBe('Uppercase test');
      });

      test('should handle <world>TO: a,b,c</world> tag - add specific mentions', () => {
        expect(addAutoMention('<world>TO: alice,bob</world> Please work together.', 'human')).toBe('@alice\n@bob\n\nPlease work together.');
        expect(addAutoMention('<world>TO: pro, gm, con</world> Team meeting.', 'human')).toBe('@pro\n@gm\n@con\n\nTeam meeting.');
        expect(addAutoMention('Prefix <world>TO: alice</world> suffix', 'gm')).toBe('@alice\n\nPrefix  suffix');
      });

      test('should handle TO tag with extra whitespace', () => {
        expect(addAutoMention('<world>TO:  alice , bob , charlie  </world> Clean this up.', 'human')).toBe('@alice\n@bob\n@charlie\n\nClean this up.');
        expect(addAutoMention('<world>TO: alice,  , bob</world> Handle empty names.', 'gm')).toBe('@alice\n@bob\n\nHandle empty names.');
      });

      test('should handle case insensitive world tags', () => {
        expect(addAutoMention('<WORLD>STOP</WORLD> Case test', 'human')).toBe('Case test');
        expect(addAutoMention('<WORLD>DONE</WORLD> Case test', 'human')).toBe('Case test');
        expect(addAutoMention('<WORLD>PASS</WORLD> Case test', 'human')).toBe('Case test');
        expect(addAutoMention('<World>TO: alice</World> Case test', 'human')).toBe('@alice\n\nCase test');
      });

      test('should handle empty TO tag gracefully', () => {
        expect(addAutoMention('<world>TO:</world> No recipients.', 'human')).toBe('@human No recipients.');
        expect(addAutoMention('<world>TO: ,, </world> Only commas.', 'gm')).toBe('@gm Only commas.');
      });

      test('should prioritize world tags over existing mentions', () => {
        expect(addAutoMention('@existing <world>STOP</world> Override mention.', 'human')).toBe('Override mention.');
        expect(addAutoMention('@existing <world>DONE</world> Override mention.', 'human')).toBe('Override mention.');
        expect(addAutoMention('@existing <world>PASS</world> Override mention.', 'human')).toBe('Override mention.');
        expect(addAutoMention('@existing <world>TO: alice</world> Replace mention.', 'human')).toBe('@alice\n\nReplace mention.');
        expect(addAutoMention('@existing, <world>TO: bob</world> Remove comma too.', 'human')).toBe('@bob\n\nRemove comma too.');
      });

      test('should remove multiple mentions at beginning with stop tags', () => {
        expect(addAutoMention('@alice @bob <world>STOP</world> No more mentions.', 'human')).toBe('No more mentions.');
        expect(addAutoMention('@user1\n@user2 <world>DONE</world> Clean response.', 'gm')).toBe('Clean response.');
        expect(addAutoMention('@mention <world>PASS</world>\n@another content', 'pro')).toBe('content');
        expect(addAutoMention('@alice, @bob, <world>STOP</world> Remove commas too.', 'human')).toBe('Remove commas too.');
      });
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

    test('should remove self-mentions from beginning of all paragraphs', () => {
      expect(removeSelfMentions('@alice First paragraph.\n@alice Second paragraph.', 'alice')).toBe('First paragraph.\nSecond paragraph.');
      expect(removeSelfMentions('@gm Line 1\n@gm @gm Line 2\nNormal line\n@gm Line 4', 'gm')).toBe('Line 1\nLine 2\nNormal line\nLine 4');
    });

    test('should handle lines with only self-mentions', () => {
      expect(removeSelfMentions('@alice\n@alice @alice\nContent here', 'alice')).toBe('\n\nContent here');
      expect(removeSelfMentions('@gm @gm @gm', 'gm')).toBe(''); // Remove all self-mentions completely
      expect(removeSelfMentions('@alice @alice', 'alice')).toBe(''); // Single line with only self-mentions
      expect(removeSelfMentions('  @gm  @gm  ', 'gm')).toBe('  '); // Preserve leading whitespace when only self-mentions
    });

    test('should remove commas with mentions', () => {
      expect(removeSelfMentions('@alice, hello there', 'alice')).toBe('hello there');
      expect(removeSelfMentions('@gm, @gm, how are you?', 'gm')).toBe('how are you?');
      expect(removeSelfMentions('@alice,@alice,start here', 'alice')).toBe('start here');
      expect(removeSelfMentions('@pro, @pro , working on it', 'pro')).toBe('working on it');
      expect(removeSelfMentions('@a2, let me tell you a story about a wonderful elephant!', 'a2')).toBe('let me tell you a story about a wonderful elephant!');
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

    test('should handle world tags in loop prevention', () => {
      // Test STOP tag prevents auto-mention
      let response = '<world>STOP</world> I will not respond further.';
      response = removeSelfMentions(response, 'gm');
      response = addAutoMention(response, 'human');
      expect(response).toBe('I will not respond further.');

      // Test DONE tag prevents auto-mention
      response = '<world>DONE</world> Task is complete.';
      response = removeSelfMentions(response, 'gm');
      response = addAutoMention(response, 'human');
      expect(response).toBe('Task is complete.');

      // Test PASS tag prevents auto-mention
      response = '<world>PASS</world> Passing to next agent.';
      response = removeSelfMentions(response, 'gm');
      response = addAutoMention(response, 'human');
      expect(response).toBe('Passing to next agent.');

      // Test TO tag overrides normal auto-mention
      response = '<world>TO: alice, bob</world> Please collaborate.';
      response = removeSelfMentions(response, 'gm');
      response = addAutoMention(response, 'human');
      expect(response).toBe('@alice\n@bob\n\nPlease collaborate.');
    });
  });
});
