/**
 * Mention Parsing Utility Tests
 *
 * Purpose:
 * - Verify paragraph-beginning mention extraction for agent routing.
 *
 * Key features:
 * - Supports canonical id mentions (e.g. @maestro-composer).
 * - Supports display-name mentions with spaces (e.g. @Madame Pedagogue).
 * - Keeps extraction constrained to paragraph-beginning addressing.
 */

import { describe, expect, it } from 'vitest';
import { extractParagraphBeginningMentions } from '../../core/utils.js';

describe('extractParagraphBeginningMentions', () => {
  it('extracts canonical id mentions', () => {
    expect(extractParagraphBeginningMentions('@maestro-composer Please continue')).toEqual(['maestro-composer']);
  });

  it('normalizes display-name mentions with spaces', () => {
    expect(extractParagraphBeginningMentions('@Madame Pedagogue')).toEqual(['madame-pedagogue']);
    expect(extractParagraphBeginningMentions('@Madame Pedagogue Please review this etude')).toEqual(['madame-pedagogue']);
  });

  it('supports greeting-prefix style mentions', () => {
    expect(extractParagraphBeginningMentions('Hello @Madame Pedagogue')).toEqual(['madame-pedagogue']);
  });

  it('ignores non-leading mentions', () => {
    expect(extractParagraphBeginningMentions('The handoff goes to @Madame Pedagogue next.')).toEqual([]);
  });

  it('does not extend lowercase id mentions with following words', () => {
    // Regression: "@a2 Hi — @a1 says hello!" was incorrectly parsed as "a2-hi"
    expect(extractParagraphBeginningMentions('@a2 Hi — @a1 says hello!')).toEqual(['a2']);
    expect(extractParagraphBeginningMentions('@a1 Hello there')).toEqual(['a1']);
    expect(extractParagraphBeginningMentions('@bot1 Please respond')).toEqual(['bot1']);
  });
});
