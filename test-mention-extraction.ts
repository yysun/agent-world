// Test the regex pattern directly
function testExtractParagraphBeginningMentions(content: string): string[] {
  if (!content) return [];

  // Pattern to match @mentions at paragraph beginning:
  // (?:^|\n\s*) - Start of string OR newline followed by optional whitespace
  // @ - Literal @ symbol
  // (\w+(?:[-_]\w+)*) - Capture group for mention name (word chars, hyphens, underscores)
  const paragraphMentionRegex = /(?:^|\n\s*)@(\w+(?:[-_]\w+)*)/g;
  const validMentions: string[] = [];
  let match;

  while ((match = paragraphMentionRegex.exec(content)) !== null) {
    const mention = match[1];
    if (mention && mention.length > 0) {
      const lowerMention = mention.toLowerCase();
      validMentions.push(lowerMention);
    }
  }

  return validMentions;
}

// Test cases to debug mention extraction
const testCases = [
  "@human\n hi",
  "@human hi",
  "hello @human",
  "@human\n\nhello",
  "  @human after spaces",
  "\n@human after newline",
  "text\n@human in middle",
  "@human1 @human2 multiple",
  "@human\n  @agent second line"
];

console.log('Testing mention extraction:');
testCases.forEach((test, index) => {
  const mentions = testExtractParagraphBeginningMentions(test);
  console.log(`Test ${index + 1}: "${test.replace(/\n/g, '\\n')}" -> [${mentions.join(', ')}]`);
});
