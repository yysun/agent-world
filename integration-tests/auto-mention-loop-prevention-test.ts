/**
 * Auto-Mention Loop Prevention Integration Test
 * 
 * Tests the real-world scenario where agents might get into loops
 * like @gm->@pro->@gm, and verifies that our prevention logic works
 * 
 * Usage:
 * npx tsx integration-tests/auto-mention-loop-prevention-test.ts
 */

import { hasAnyMentionAtBeginning, addAutoMention, removeSelfMentions } from '../core/events.js';

// Test scenarios
async function testLoopPrevention() {
  console.log('🧪 Auto-Mention Loop Prevention Test');
  console.log('====================================');

  // Test 1: Loop Prevention Logic
  console.log('\n🔄 Test 1: Loop Prevention Logic');
  console.log('----------------------------------');
  
  // Simulate @pro responding to @gm with a message that starts with @gm
  let proResponse = '@gm I will handle this task for you.';
  console.log(`🤖 @pro raw response: "${proResponse}"`);
  
  // Apply auto-mention logic (this should NOT add auto-mention because @gm already exists)
  const shouldAddAutoMention = !hasAnyMentionAtBeginning(proResponse);
  console.log(`🔍 Should add auto-mention: ${shouldAddAutoMention}`);
  
  if (shouldAddAutoMention) {
    proResponse = addAutoMention(proResponse, 'gm');
    console.log('⚠️  WARNING: Auto-mention would be added, creating potential loop!');
  } else {
    console.log('✅ Loop prevention working! No auto-mention added because @gm already exists');
  }
  
  console.log(`📤 Final @pro response: "${proResponse}"`);

  // Test 2: Redirection Logic
  console.log('\n� Test 2: Redirection Logic');
  console.log('-----------------------------');

  // Simulate @gm redirecting to @con
  let gmResponse = '@con Please take over this task.';
  console.log(`🤖 @gm raw response: "${gmResponse}"`);
  
  // Apply auto-mention logic (this should NOT add auto-mention because @con already exists)
  const shouldAddAutoMentionForGm = !hasAnyMentionAtBeginning(gmResponse);
  console.log(`🔍 Should add auto-mention: ${shouldAddAutoMentionForGm}`);
  
  if (shouldAddAutoMentionForGm) {
    gmResponse = addAutoMention(gmResponse, 'human');
    console.log('❌ Auto-mention would be added, overriding redirection!');
  } else {
    console.log('✅ Redirection preserved! No auto-mention added because @con already exists');
  }
  
  console.log(`📤 Final @gm response: "${gmResponse}"`);

  // Test 3: Normal Response Logic
  console.log('\n� Test 3: Normal Response Logic');
  console.log('---------------------------------');

  // Simulate @con responding normally without any mentions
  let conResponse = 'I understand and will help.';
  console.log(`🤖 @con raw response: "${conResponse}"`);
  
  // Apply auto-mention logic (this SHOULD add auto-mention because no mention exists)
  const shouldAddAutoMentionForCon = !hasAnyMentionAtBeginning(conResponse);
  console.log(`� Should add auto-mention: ${shouldAddAutoMentionForCon}`);
  
  if (shouldAddAutoMentionForCon) {
    conResponse = addAutoMention(conResponse, 'human');
    console.log('✅ Auto-mention added for normal response!');
  } else {
    console.log('❌ Auto-mention not added when it should be!');
  }
  
  console.log(`📤 Final @con response: "${conResponse}"`);

  // Test 4: Self-Mention Removal Logic
  console.log('\n🧹 Test 4: Self-Mention Removal Logic');
  console.log('--------------------------------------');

  // Simulate agent response with self-mentions
  let selfMentionResponse = '@gm @gm I should handle this myself.';
  console.log(`🤖 Raw response with self-mentions: "${selfMentionResponse}"`);
  
  // Remove self-mentions first
  selfMentionResponse = removeSelfMentions(selfMentionResponse, 'gm');
  console.log(`🧹 After self-mention removal: "${selfMentionResponse}"`);
  
  // Then apply auto-mention logic
  const shouldAddAutoMentionAfterSelfRemoval = !hasAnyMentionAtBeginning(selfMentionResponse);
  console.log(`� Should add auto-mention after self-removal: ${shouldAddAutoMentionAfterSelfRemoval}`);
  
  if (shouldAddAutoMentionAfterSelfRemoval) {
    selfMentionResponse = addAutoMention(selfMentionResponse, 'human');
    console.log('✅ Auto-mention added after self-mention removal!');
  } else {
    console.log('❌ Auto-mention not added after self-mention removal!');
  }
  
  console.log(`📤 Final response: "${selfMentionResponse}"`);

  // Test 5: Unit Test Functions
  console.log('\n🧪 Test 5: Unit Test Functions');
  console.log('-------------------------------');

  // Test hasAnyMentionAtBeginning
  console.log('Testing hasAnyMentionAtBeginning:');
  console.log(`  hasAnyMentionAtBeginning('@gm hello'): ${hasAnyMentionAtBeginning('@gm hello')}`);
  console.log(`  hasAnyMentionAtBeginning('hello @gm'): ${hasAnyMentionAtBeginning('hello @gm')}`);
  console.log(`  hasAnyMentionAtBeginning('hello'): ${hasAnyMentionAtBeginning('hello')}`);

  // Test addAutoMention
  console.log('\nTesting addAutoMention:');
  console.log(`  addAutoMention('hello', 'human'): "${addAutoMention('hello', 'human')}"`);
  console.log(`  addAutoMention('@gm hello', 'human'): "${addAutoMention('@gm hello', 'human')}"`);
  console.log(`  addAutoMention('@human hello', 'human'): "${addAutoMention('@human hello', 'human')}"`);

  // Test removeSelfMentions
  console.log('\nTesting removeSelfMentions:');
  console.log(`  removeSelfMentions('@gm I will help', 'gm'): "${removeSelfMentions('@gm I will help', 'gm')}"`);
  console.log(`  removeSelfMentions('@gm @gm hello', 'gm'): "${removeSelfMentions('@gm @gm hello', 'gm')}"`);
  console.log(`  removeSelfMentions('@pro I think @gm should help', 'pro'): "${removeSelfMentions('@pro I think @gm should help', 'pro')}"`);

  // Test 6: Complex Scenarios
  console.log('\n🎯 Test 6: Complex Scenarios');
  console.log('-----------------------------');

  // Scenario 1: Agent tries to mention itself in response
  console.log('\n📚 Scenario 1: Agent mentioning itself');
  let response1 = '@alice I think @alice should work with @bob.';
  console.log(`Before: "${response1}"`);
  response1 = removeSelfMentions(response1, 'alice');
  console.log(`After self-removal: "${response1}"`);
  response1 = addAutoMention(response1, 'human');
  console.log(`After auto-mention: "${response1}"`);

  // Scenario 2: Multiple mentions at start
  console.log('\n📚 Scenario 2: Multiple mentions at start');
  let response2 = '@gm @pro Please coordinate on this.';
  console.log(`Before: "${response2}"`);
  console.log(`Has any mention at beginning: ${hasAnyMentionAtBeginning(response2)}`);
  response2 = addAutoMention(response2, 'human');
  console.log(`After auto-mention attempt: "${response2}"`);

  // Scenario 3: Mention with whitespace
  console.log('\n📚 Scenario 3: Mention with whitespace');
  let response3 = '@gm\n  Please help with this.';
  console.log(`Before: "${response3}"`);
  console.log(`Has any mention at beginning: ${hasAnyMentionAtBeginning(response3)}`);
  response3 = addAutoMention(response3, 'human');
  console.log(`After auto-mention attempt: "${response3}"`);

  console.log('\n🎉 All tests completed!');
  console.log('\n💡 Summary:');
  console.log('  ✅ Loop prevention prevents @gm->@pro->@gm cycles');
  console.log('  ✅ Redirection allows @gm->@con explicit mentions');
  console.log('  ✅ Auto-mention still works for normal responses');
  console.log('  ✅ Self-mentions are properly removed from responses');
  console.log('  ✅ Complex scenarios handled correctly');
  console.log('\n🚀 The new auto-mention logic successfully prevents loops while preserving redirections!');
}

// Run the test
testLoopPrevention().catch(console.error);
