/**
 * Integration test for getValidMentions and shouldAutoMention fix
 * Tests the specific case where agent self-mentions in middle but should still auto-mention sender
 */

import { shouldAutoMention, getValidMentions } from '../core/events.js';

console.log('Testing getValidMentions and shouldAutoMention with self-mention in middle...');

// Test case: a1 replied to a2, self-mentioned in middle, should auto-mention a2
const response = `I'll choose the first option. Here's the updated conversation:

@a1 It seems l`;
const sender = 'a2';
const agentId = 'a1';

console.log('\n=== Test Case: Self-mention in middle, should auto-mention sender ===');
console.log(`Response: "${response}"`);
console.log(`Sender: ${sender}`);
console.log(`Agent ID: ${agentId}`);

// Test getValidMentions
const validMentions = getValidMentions(response, agentId);
console.log(`\ngetValidMentions result: ${JSON.stringify(validMentions)}`);
console.log(`Expected: [] (empty array because @a1 is self-mention and should be excluded)`);

// Test shouldAutoMention
const shouldMention = shouldAutoMention(response, sender, agentId);
console.log(`\nshouldAutoMention result: ${shouldMention}`);
console.log(`Expected: true (should auto-mention a2 because no valid mentions at paragraph beginnings)`);

// Additional test cases
console.log('\n=== Additional Test Cases ===');

// Test case 1: Response has valid mention at beginning
const responseWithValidMention = `@a3 I'll choose the first option.

@a1 It seems l`;
const validMentions1 = getValidMentions(responseWithValidMention, agentId);
const shouldMention1 = shouldAutoMention(responseWithValidMention, sender, agentId);
console.log(`\nTest 1 - Response with valid mention at beginning:`);
console.log(`Valid mentions: ${JSON.stringify(validMentions1)}`);
console.log(`Should auto-mention: ${shouldMention1}`);
console.log(`Expected: validMentions=['a3'], shouldMention=false`);

// Test case 2: Response has only self-mentions at beginning
const responseWithSelfMention = `@a1 I'll choose the first option.

Some other text here.`;
const validMentions2 = getValidMentions(responseWithSelfMention, agentId);
const shouldMention2 = shouldAutoMention(responseWithSelfMention, sender, agentId);
console.log(`\nTest 2 - Response with only self-mentions at beginning:`);
console.log(`Valid mentions: ${JSON.stringify(validMentions2)}`);
console.log(`Should auto-mention: ${shouldMention2}`);
console.log(`Expected: validMentions=[], shouldMention=true`);

// Test case 3: Response has mentions but not at paragraph beginnings
const responseWithMentionsNotAtBeginning = `I'll choose the first option.

Here's what @a3 said about it.`;
const validMentions3 = getValidMentions(responseWithMentionsNotAtBeginning, agentId);
const shouldMention3 = shouldAutoMention(responseWithMentionsNotAtBeginning, sender, agentId);
console.log(`\nTest 3 - Response with mentions not at paragraph beginnings:`);
console.log(`Valid mentions: ${JSON.stringify(validMentions3)}`);
console.log(`Should auto-mention: ${shouldMention3}`);
console.log(`Expected: validMentions=[], shouldMention=true`);

// Test case 4: Multiple paragraphs with mixed mentions
const responseWithMixedMentions = `@a3 I'll choose the first option.

Here's what someone said.

@a1 It seems like we agree.

@a4 What do you think?`;
const validMentions4 = getValidMentions(responseWithMixedMentions, agentId);
const shouldMention4 = shouldAutoMention(responseWithMixedMentions, sender, agentId);
console.log(`\nTest 4 - Multiple paragraphs with mixed mentions:`);
console.log(`Valid mentions: ${JSON.stringify(validMentions4)}`);
console.log(`Should auto-mention: ${shouldMention4}`);
console.log(`Expected: validMentions=['a3', 'a4'], shouldMention=false`);

console.log('\n✅ getValidMentions and shouldAutoMention test completed!');
console.log('\nKey behavior:');
console.log('- getValidMentions extracts mentions at paragraph beginnings, excluding self-mentions');
console.log('- shouldAutoMention only adds auto-mention if NO valid mentions exist');
console.log('- Self-mentions in middle of response do not prevent auto-mention');
