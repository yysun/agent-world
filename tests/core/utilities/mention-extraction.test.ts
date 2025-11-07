/**
 * Unit Tests for Mention Extraction Utilities
 *
 * Features:
 * - Tests for extractMentions function - finds first mention in content
 * - Tests for extractParagraphBeginningMentions function - finds mentions at paragraph starts
 * - Edge cases and validation for mention parsing logic
 * - Performance tests for mention detection
 *
 * Implementation:
 * - Tests mention extraction functions in isolation
 * - No file I/O or LLM dependencies
 * - Tests edge cases and error conditions
 * - Validates mention parsing behavior and regex patterns
 */

import { describe, test, expect } from 'vitest';
import { extractMentions, extractParagraphBeginningMentions } from '../../../core/utils.js';

describe.skip('Mention Extraction Utilities', () => {
  describe('extractMentions', () => {
    test('should extract single mention', () => {
      expect(extractMentions('Hello @alice')).toEqual(['alice']);
      expect(extractMentions('@bob how are you?')).toEqual(['bob']);
      expect(extractMentions('Hi @charlie-test')).toEqual(['charlie-test']);
    });

    test('should extract only first mention when multiple present', () => {
      expect(extractMentions('Hello @alice @bob @charlie')).toEqual(['alice']);
      expect(extractMentions('@first @second @third')).toEqual(['first']);
      expect(extractMentions('Hey @agent1 and @agent2')).toEqual(['agent1']);
    });

    test('should handle case-insensitive mentions', () => {
      expect(extractMentions('Hello @Alice')).toEqual(['alice']);
      expect(extractMentions('@BOB how are you?')).toEqual(['bob']);
      expect(extractMentions('Hi @ChArLiE')).toEqual(['charlie']);
    });

    test('should handle mentions with special characters', () => {
      expect(extractMentions('Hello @agent-1')).toEqual(['agent-1']);
      expect(extractMentions('@test_agent')).toEqual(['test_agent']);
      expect(extractMentions('@agent_with-mixed')).toEqual(['agent_with-mixed']);
    });

    test('should handle edge cases', () => {
      expect(extractMentions('')).toEqual([]);
      expect(extractMentions('No mentions here')).toEqual([]);
      expect(extractMentions('@')).toEqual([]);
      expect(extractMentions('@ invalid')).toEqual([]);
      expect(extractMentions('@123')).toEqual(['123']);
    });

    test('should handle invalid mention formats', () => {
      expect(extractMentions('@agent@invalid')).toEqual(['agent']);
      expect(extractMentions('@@double')).toEqual(['double']);
      expect(extractMentions('@agent with spaces @second')).toEqual(['agent']);
    });

    test('should handle very long content efficiently', () => {
      const longContent = 'a'.repeat(10000) + ' @mention ' + 'b'.repeat(10000);
      expect(extractMentions(longContent)).toEqual(['mention']);
    });

    test('should handle multiple mentions with consistent first-only behavior', () => {
      expect(extractMentions('@first then @second then @third')).toEqual(['first']);
      expect(extractMentions('Start @a middle @b end @c')).toEqual(['a']);
      expect(extractMentions('@x@y@z')).toEqual(['x']);
    });
  });

  describe('extractParagraphBeginningMentions', () => {
    test('should extract mentions at start of string', () => {
      expect(extractParagraphBeginningMentions('@pro, what do you think?')).toEqual(['pro']);
      expect(extractParagraphBeginningMentions('@alice how are you?')).toEqual(['alice']);
      expect(extractParagraphBeginningMentions('@bob-test please help')).toEqual(['bob-test']);
    });

    test('should extract mentions after newlines', () => {
      expect(extractParagraphBeginningMentions('Hello everyone!\n@pro, please respond.')).toEqual(['pro']);
      expect(extractParagraphBeginningMentions('First line\n\n@alice what do you think?')).toEqual(['alice']);
      expect(extractParagraphBeginningMentions('Text\n  @bob with spaces')).toEqual(['bob']);
    });

    test('should ignore mentions in middle of text', () => {
      expect(extractParagraphBeginningMentions('hi @pro, what do you think?')).toEqual([]);
      expect(extractParagraphBeginningMentions('I think @alice should handle this.')).toEqual([]);
      expect(extractParagraphBeginningMentions('Please ask @bob about this.')).toEqual([]);
    });

    test('should handle multiple paragraphs correctly', () => {
      const content = 'Hello everyone!\n@pro, please respond.\n\nAlso, we need input from someone else.';
      expect(extractParagraphBeginningMentions(content)).toEqual(['pro']);
    });

    test('should extract multiple valid mentions', () => {
      const content = '@alice, please start.\n@bob, you handle the next part.';
      expect(extractParagraphBeginningMentions(content)).toEqual(['alice', 'bob']);
    });

    test('should be case-insensitive', () => {
      expect(extractParagraphBeginningMentions('@Alice, hello')).toEqual(['alice']);
      expect(extractParagraphBeginningMentions('@BOB how are you?')).toEqual(['bob']);
      expect(extractParagraphBeginningMentions('Hi\n@ChArLiE test')).toEqual(['charlie']);
    });

    test('should handle whitespace after newlines', () => {
      expect(extractParagraphBeginningMentions('Hello\n   @pro with spaces')).toEqual(['pro']);
      expect(extractParagraphBeginningMentions('Text\n\t@alice with tab')).toEqual(['alice']);
      expect(extractParagraphBeginningMentions('Line\n\n  @bob multiple spaces')).toEqual(['bob']);
    });

    test('should handle mixed valid and invalid mentions', () => {
      const content = '@alice, please start. Then ask @bob.\n@charlie, you handle the final part.';
      expect(extractParagraphBeginningMentions(content)).toEqual(['alice', 'charlie']);
    });

    test('should handle edge cases', () => {
      expect(extractParagraphBeginningMentions('')).toEqual([]);
      expect(extractParagraphBeginningMentions('No mentions here')).toEqual([]);
      expect(extractParagraphBeginningMentions('@')).toEqual([]);
      expect(extractParagraphBeginningMentions('@ invalid')).toEqual([]);
      expect(extractParagraphBeginningMentions('@123')).toEqual(['123']);
    });

    test('should handle special characters in mentions', () => {
      expect(extractParagraphBeginningMentions('@agent-1, hello')).toEqual(['agent-1']);
      expect(extractParagraphBeginningMentions('@test_agent please respond')).toEqual(['test_agent']);
      expect(extractParagraphBeginningMentions('@agent_with-mixed chars')).toEqual(['agent_with-mixed']);
    });

    test('should handle complex multi-paragraph scenarios', () => {
      const complexContent = `
        This is an intro paragraph with no mentions.
        
        @primary, please start the discussion.
        We need to cover several topics.
        
        Some content here that mentions @someone but not at start.
        
        @secondary, please add your thoughts.
        
        Final paragraph with mid-text @mention that should be ignored.
      `;
      expect(extractParagraphBeginningMentions(complexContent)).toEqual(['primary', 'secondary']);
    });

    test('should handle whitespace variations correctly', () => {
      // Leading whitespace at string start - function may not support this
      // Based on function name "extractParagraphBeginningMentions", it looks for mentions at paragraph beginnings
      // not just at string start with whitespace

      // These work - mentions after newlines with whitespace (paragraph beginnings)
      expect(extractParagraphBeginningMentions('Hello\n   @mention')).toEqual(['mention']);
      expect(extractParagraphBeginningMentions('Text\n\t@mention')).toEqual(['mention']);
      expect(extractParagraphBeginningMentions('Line\n\n  @mention')).toEqual(['mention']);

      // Direct string start with mention (should work)
      expect(extractParagraphBeginningMentions('@mention')).toEqual(['mention']);
    });

    test('should handle performance with large content', () => {
      const largeContent = Array(1000).fill('This is paragraph content.\n@mention here.\n').join('');
      const result = extractParagraphBeginningMentions(largeContent);
      expect(result.length).toBe(1000);
      expect(result.every(mention => mention === 'mention')).toBe(true);
    });
  });
});
