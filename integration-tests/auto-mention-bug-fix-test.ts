/**
 * Integration test for auto-mention bug fix
 * Tests the shouldAutoMention function to ensure it works for all sender types
 */

import { shouldAutoMention, hasAnyMentionAtBeginning, addAutoMention } from '../core/events.js';

console.log('Testing auto-mention bug fix...');

// Test 1: Should auto-mention human senders (bug fix)
console.log('\n1. Testing human sender auto-mention:');
const humanResponse = "Hello, how are you?";
const humanSender = "alice";
const agentId = "bob";

const shouldMentionHuman = shouldAutoMention(humanResponse, humanSender, agentId);
console.log(`shouldAutoMention("${humanResponse}", "${humanSender}", "${agentId}") = ${shouldMentionHuman}`);
console.log(`Expected: true (should auto-mention human senders)`);

if (shouldMentionHuman) {
  const mentionedResponse = addAutoMention(humanResponse, humanSender);
  console.log(`Result: "${mentionedResponse}"`);
  console.log(`Expected: "@alice Hello, how are you?"`);
}

// Test 2: Should auto-mention agent senders
console.log('\n2. Testing agent sender auto-mention:');
const agentResponse = "I agree with your point.";
const agentSender = "charlie";

const shouldMentionAgent = shouldAutoMention(agentResponse, agentSender, agentId);
console.log(`shouldAutoMention("${agentResponse}", "${agentSender}", "${agentId}") = ${shouldMentionAgent}`);
console.log(`Expected: true (should auto-mention agent senders)`);

if (shouldMentionAgent) {
  const mentionedResponse = addAutoMention(agentResponse, agentSender);
  console.log(`Result: "${mentionedResponse}"`);
  console.log(`Expected: "@charlie I agree with your point."`);
}

// Test 3: Should NOT auto-mention if response already has mention at beginning
console.log('\n3. Testing skip auto-mention when mention exists at beginning:');
const responseWithMention = "@dave Thanks for the suggestion!";
const senderWithExistingMention = "eve";

const shouldSkipMention = shouldAutoMention(responseWithMention, senderWithExistingMention, agentId);
console.log(`shouldAutoMention("${responseWithMention}", "${senderWithExistingMention}", "${agentId}") = ${shouldSkipMention}`);
console.log(`Expected: false (should skip when mention exists at beginning)`);

// Test 4: Should NOT auto-mention self
console.log('\n4. Testing skip auto-mention for self:');
const selfResponse = "I think this is correct.";
const selfSender = "bob"; // Same as agentId

const shouldSkipSelf = shouldAutoMention(selfResponse, selfSender, agentId);
console.log(`shouldAutoMention("${selfResponse}", "${selfSender}", "${agentId}") = ${shouldSkipSelf}`);
console.log(`Expected: false (should not auto-mention self)`);

// Test 5: Should NOT auto-mention empty response
console.log('\n5. Testing skip auto-mention for empty response:');
const emptyResponse = "";
const normalSender = "frank";

const shouldSkipEmpty = shouldAutoMention(emptyResponse, normalSender, agentId);
console.log(`shouldAutoMention("${emptyResponse}", "${normalSender}", "${agentId}") = ${shouldSkipEmpty}`);
console.log(`Expected: false (should skip empty response)`);

// Test 6: Verify hasAnyMentionAtBeginning works correctly
console.log('\n6. Testing hasAnyMentionAtBeginning function:');
const tests = [
  { text: "@alice Hello", expected: true },
  { text: "Hello @alice", expected: false },
  { text: "@alice\nHello", expected: true },
  { text: "Hello\n@alice", expected: false },
  { text: "@alice @bob Hello", expected: true },
  { text: "", expected: false },
  { text: "   @alice Hello", expected: true },
];

tests.forEach(test => {
  const result = hasAnyMentionAtBeginning(test.text);
  console.log(`hasAnyMentionAtBeginning("${test.text}") = ${result}, expected: ${test.expected}`);
  if (result !== test.expected) {
    console.log(`❌ FAIL: Expected ${test.expected}, got ${result}`);
  } else {
    console.log(`✅ PASS`);
  }
});

console.log('\n✅ Auto-mention bug fix test completed!');
console.log('Bug fix summary:');
console.log('- Before: Only auto-mentioned when sender was an agent');
console.log('- After: Auto-mentions for all valid senders (human or agent)');
console.log('- This ensures humans get proper auto-mentions in agent responses');
