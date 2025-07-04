/**
 * Integration test for paragraph beginning mention rule
 * Tests the complete flow of mention detection and agent response behavior
 */

import { extractParagraphBeginningMentions, extractMentions } from '../core/utils';

describe('Paragraph Beginning Mention Rule Integration', () => {
  describe('extractParagraphBeginningMentions', () => {
    test('should validate all requirement examples correctly', () => {
      // Valid mentions (should trigger agent response)
      expect(extractParagraphBeginningMentions('@pro, what do you think about this?')).toEqual(['pro']);
      expect(extractParagraphBeginningMentions('Hello everyone!\n@pro, please respond to this question.')).toEqual(['pro']);
      expect(extractParagraphBeginningMentions('@pro\nPlease help with this task.')).toEqual(['pro']);

      // Invalid mentions (should NOT trigger agent response)
      expect(extractParagraphBeginningMentions('hi @pro, what do you think?')).toEqual([]);
      expect(extractParagraphBeginningMentions('I think @pro should handle this.')).toEqual([]);
      expect(extractParagraphBeginningMentions('Please ask @pro about this.')).toEqual([]);
    });

    test('should handle complex multi-paragraph scenarios', () => {
      const complexMessage = `Welcome to the meeting everyone!

@alice, please start with your presentation.

Then we can discuss the project with @bob handling the technical details.
      
@charlie, you should be ready to present next.

Let me know if anyone needs help with @dave or @eve.`;

      const mentions = extractParagraphBeginningMentions(complexMessage);
      expect(mentions).toEqual(['alice', 'charlie']);
    });

    test('should handle edge cases from requirements', () => {
      // Multiple valid mentions should return all
      expect(extractParagraphBeginningMentions('@pro, hello\n@con, respond')).toEqual(['pro', 'con']);

      // Mixed valid/invalid mentions should return only valid
      expect(extractParagraphBeginningMentions('@alice start. Then ask @bob.\n@charlie finish.')).toEqual(['alice', 'charlie']);

      // Whitespace variations
      expect(extractParagraphBeginningMentions('Hello\n   @pro with spaces')).toEqual(['pro']);
      expect(extractParagraphBeginningMentions('Text\n\t@alice with tab')).toEqual(['alice']);
    });
  });

  describe('Backward compatibility with extractMentions', () => {
    test('should preserve existing behavior for auto-mention replies', () => {
      // Original function should still work for auto-mention logic
      expect(extractMentions('hello @alice and @bob')).toEqual(['alice']); // First mention only
      expect(extractMentions('@charlie, please help')).toEqual(['charlie']);
      expect(extractMentions('no mentions here')).toEqual([]);
    });

    test('should demonstrate the difference between functions', () => {
      const message = 'Please ask @alice about this.\n@bob, you should handle the response.';

      // Old function returns first mention regardless of position
      expect(extractMentions(message)).toEqual(['alice']);

      // New function only returns paragraph-beginning mentions
      expect(extractParagraphBeginningMentions(message)).toEqual(['bob']);
    });
  });

  describe('Agent response logic simulation', () => {
    // Simulate the logic from shouldAgentRespond function
    function simulateAgentResponse(content: string, agentId: string, senderType: string = 'human'): boolean {
      const paragraphMentions = extractParagraphBeginningMentions(content);
      const anyMentions = extractMentions(content);

      if (senderType === 'human') {
        if (paragraphMentions.length === 0) {
          // No paragraph-beginning mentions
          if (anyMentions.length > 0) {
            return false; // Has mentions but not at paragraph beginning
          }
          return true; // No mentions at all - public message
        }
        return paragraphMentions.includes(agentId.toLowerCase());
      }

      // For agent messages
      return paragraphMentions.includes(agentId.toLowerCase());
    }

    test('should correctly determine agent responses for requirement examples', () => {
      // Valid examples - agent should respond
      expect(simulateAgentResponse('@pro, what do you think about this?', 'pro')).toBe(true);
      expect(simulateAgentResponse('Hello everyone!\n@pro, please respond to this question.', 'pro')).toBe(true);
      expect(simulateAgentResponse('@pro\nPlease help with this task.', 'pro')).toBe(true);

      // Invalid examples - agent should NOT respond
      expect(simulateAgentResponse('hi @pro, what do you think?', 'pro')).toBe(false);
      expect(simulateAgentResponse('I think @pro should handle this.', 'pro')).toBe(false);
      expect(simulateAgentResponse('Please ask @pro about this.', 'pro')).toBe(false);

      // Public messages - agent should respond
      expect(simulateAgentResponse('Hello everyone!', 'pro')).toBe(true);
      expect(simulateAgentResponse('What does everyone think?', 'alice')).toBe(true);
    });

    test('should handle multiple agents correctly', () => {
      const message = '@alice, please start.\n@bob, you handle next.\nThen ask @charlie about details.';

      expect(simulateAgentResponse(message, 'alice')).toBe(true);  // Valid paragraph mention
      expect(simulateAgentResponse(message, 'bob')).toBe(true);    // Valid paragraph mention
      expect(simulateAgentResponse(message, 'charlie')).toBe(false); // Invalid mid-paragraph mention
      expect(simulateAgentResponse(message, 'dave')).toBe(false);  // Not mentioned
    });

    test('should preserve turn limit and other filtering (simulation)', () => {
      // This test simulates that turn limit and other logic still work
      // In real implementation, this would be tested with full agent objects

      const message = '@pro, please respond';
      expect(simulateAgentResponse(message, 'pro')).toBe(true);

      // Turn limit would be checked before this function call
      // Self-message filtering would prevent calling this function
      // This test just confirms the mention logic works correctly
    });
  });

  describe('Performance and edge cases', () => {
    test('should handle large messages efficiently', () => {
      const largeMessage = `
This is a very long message with lots of content.
${Array(100).fill('Some text here with @middle mentions that should be ignored.').join('\n')}

@alice, this should be detected at the paragraph beginning.

${Array(50).fill('More text with @scattered mentions throughout.').join(' ')}

@bob, this should also be detected.
      `.trim();

      const start = Date.now();
      const mentions = extractParagraphBeginningMentions(largeMessage);
      const end = Date.now();

      expect(mentions).toEqual(['alice', 'bob']);
      expect(end - start).toBeLessThan(100); // Should be fast
    });

    test('should handle malformed input gracefully', () => {
      expect(extractParagraphBeginningMentions('')).toEqual([]);
      expect(extractParagraphBeginningMentions(null as any)).toEqual([]);
      expect(extractParagraphBeginningMentions(undefined as any)).toEqual([]);
      expect(extractParagraphBeginningMentions('@')).toEqual([]);
      expect(extractParagraphBeginningMentions('@@@@')).toEqual([]);
    });
  });
});
