/**
 * Simple Auto-Mention Utility Functions Test
 * Tests the core utility functions directly without mocking LLM
 * Updated to test the new ANY mention logic that prevents loops
 *
 * Usage:
 * npx tsx integration-tests/auto-mention-utility-test.ts
 */

import { extractParagraphBeginningMentions } from '../core/utils.js';
import { hasAnyMentionAtBeginning, addAutoMention, removeSelfMentions } from '../core/events.js';

/**
 * Simple Auto-Mention Utility Functions Test
 * Tests the core utility functions directly without mocking LLM
 * Updated to test the new ANY mention logic that prevents loops
 *
 * Usage:
 * npx tsx integration-tests/auto-mention-utility-test.ts
 */

import { extractParagraphBeginningMentions } from '../core/utils.js';
import { hasAnyMentionAtBeginning, addAutoMention, removeSelfMentions } from '../core/events.js';

// Test result tracking
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const testResults: TestResult[] = [];

// Helper function to run individual tests
async function runTest(name: string, testFn: () => void): Promise<void> {
  try {
    testFn();
    testResults.push({ name, passed: true });
    console.log(`  ✅ ${name}`);
  } catch (error) {
    testResults.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error)
    });
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function runUtilityTests() {
  console.log('🧪 Auto-Mention Utility Functions Test (Updated for ANY Mention Logic)');
  console.log('==================================================================');

  try {
    console.log('✅ Using exported utility functions from events module');

    // Test extractParagraphBeginningMentions first
    console.log('\n📋 Testing extractParagraphBeginningMentions...');
    await runTest('extractParagraphBeginningMentions: @human at start', () => {
      const result = extractParagraphBeginningMentions('@human hello');
      if (!result.includes('human')) {
        throw new Error(`Expected mentions to include 'human', got: ${JSON.stringify(result)}`);
      }
    });

    await runTest('extractParagraphBeginningMentions: @human in middle', () => {
      const result = extractParagraphBeginningMentions('hello @human');
      if (result.includes('human')) {
        throw new Error(`Expected mentions to NOT include 'human', got: ${JSON.stringify(result)}`);
      }
    });

    await runTest('extractParagraphBeginningMentions: @human with newline', () => {
      const result = extractParagraphBeginningMentions('@human\n hi');
      if (!result.includes('human')) {
        throw new Error(`Expected mentions to include 'human', got: ${JSON.stringify(result)}`);
      }
    });

    await runTest('extractParagraphBeginningMentions: @human with tab', () => {
      const result = extractParagraphBeginningMentions('@human\t hi');
      if (!result.includes('human')) {
        throw new Error(`Expected mentions to include 'human', got: ${JSON.stringify(result)}`);
      }
    });

    await runTest('extractParagraphBeginningMentions: multiple whitespace after mention', () => {
      const result = extractParagraphBeginningMentions('@human   \n\t   hello');
      if (!result.includes('human')) {
        throw new Error(`Expected mentions to include 'human', got: ${JSON.stringify(result)}`);
      }
    });

    // Test hasAnyMentionAtBeginning (NEW FUNCTION)
    console.log('\n📋 Testing hasAnyMentionAtBeginning...');
    await runTest('hasAnyMentionAtBeginning: @human at start', () => {
      const result = hasAnyMentionAtBeginning('@human hello');
      if (!result) {
        throw new Error('Expected true for mention at beginning');
      }
    });

    await runTest('hasAnyMentionAtBeginning: @gm at start', () => {
      const result = hasAnyMentionAtBeginning('@gm hello');
      if (!result) {
        throw new Error('Expected true for any mention at beginning');
      }
    });

    await runTest('hasAnyMentionAtBeginning: @human in middle', () => {
      const result = hasAnyMentionAtBeginning('hello @human');
      if (result) {
        throw new Error('Expected false for mention in middle');
      }
    });

    await runTest('hasAnyMentionAtBeginning: @human with newline', () => {
      const result = hasAnyMentionAtBeginning('@human\n hi');
      if (!result) {
        throw new Error('Expected true for mention with newline');
      }
    });

    await runTest('hasAnyMentionAtBeginning: @human with mixed whitespace', () => {
      const result = hasAnyMentionAtBeginning('@human \t\n hello');
      if (!result) {
        throw new Error('Expected true for mention with mixed whitespace');
      }
    });

    await runTest('hasAnyMentionAtBeginning: empty string', () => {
      const result = hasAnyMentionAtBeginning('');
      if (result) {
        throw new Error('Expected false for empty string');
      }
    });

    // Test addAutoMention (UPDATED LOGIC)
    console.log('\n📋 Testing addAutoMention (Updated Logic)...');
    await runTest('addAutoMention: basic addition', () => {
      const result = addAutoMention('Hello there!', 'human');
      const expected = '@human Hello there!';
      if (result !== expected) {
        throw new Error(`Expected: "${expected}", Got: "${result}"`);
      }
    });

    await runTest('addAutoMention: already has ANY mention (should not add)', () => {
      const result = addAutoMention('@gm Hello there!', 'human');
      const expected = '@gm Hello there!';
      if (result !== expected) {
        throw new Error(`Expected: "${expected}", Got: "${result}"`);
      }
    });

    await runTest('addAutoMention: already has sender mention (should not add)', () => {
      const result = addAutoMention('@human Hello there!', 'human');
      const expected = '@human Hello there!';
      if (result !== expected) {
        throw new Error(`Expected: "${expected}", Got: "${result}"`);
      }
    });

    await runTest('addAutoMention: already has different mention (should not add)', () => {
      const result = addAutoMention('@pro Let me redirect to @con', 'gm');
      const expected = '@pro Let me redirect to @con';
      if (result !== expected) {
        throw new Error(`Expected: "${expected}", Got: "${result}"`);
      }
    });

    await runTest('addAutoMention: with trimming', () => {
      const result = addAutoMention('  Hello there!  ', 'human');
      const expected = '@human Hello there!';
      if (result !== expected) {
        throw new Error(`Expected: "${expected}", Got: "${result}"`);
      }
    });

    await runTest('addAutoMention: already has mention with newline (should not add)', () => {
      const result = addAutoMention('@human\n Hello there!', 'gm');
      const expected = '@human\n Hello there!';
      if (result !== expected) {
        throw new Error(`Expected: "${expected}", Got: "${result}"`);
      }
    });

    await runTest('addAutoMention: empty string', () => {
      const result = addAutoMention('', 'human');
      const expected = '';
      if (result !== expected) {
        throw new Error(`Expected: "${expected}", Got: "${result}"`);
      }
    });

    // Test removeSelfMentions (UNCHANGED)
    console.log('\n📋 Testing removeSelfMentions...');
    await runTest('removeSelfMentions: single self-mention', () => {
      const result = removeSelfMentions('@alice I should handle this.', 'alice');
      const expected = 'I should handle this.';
      if (result !== expected) {
        throw new Error(`Expected: "${expected}", Got: "${result}"`);
      }
    });

    await runTest('removeSelfMentions: multiple self-mentions', () => {
      const result = removeSelfMentions('@alice @alice @alice I should handle this.', 'alice');
      const expected = 'I should handle this.';
      if (result !== expected) {
        throw new Error(`Expected: "${expected}", Got: "${result}"`);
      }
    });

    await runTest('removeSelfMentions: mixed case', () => {
      const result = removeSelfMentions('@Alice @ALICE @alice I can help.', 'alice');
      const expected = 'I can help.';
      if (result !== expected) {
        throw new Error(`Expected: "${expected}", Got: "${result}"`);
      }
    });

    await runTest('removeSelfMentions: preserve middle mentions', () => {
      const result = removeSelfMentions('@alice I think @alice should work with @bob.', 'alice');
      const expected = 'I think @alice should work with @bob.';
      if (result !== expected) {
        throw new Error(`Expected: "${expected}", Got: "${result}"`);
      }
    });

    // Test Loop Prevention Scenarios
    console.log('\n📋 Testing Loop Prevention Scenarios...');
    await runTest('Loop Prevention: @gm->@pro response should not add @gm', () => {
      let response = '@gm I will work on this task.';

      // Step 1: Remove self-mentions (pro removes @pro mentions)
      response = removeSelfMentions(response, 'pro');
      let afterSelfRemoval = '@gm I will work on this task.';
      if (response !== afterSelfRemoval) {
        throw new Error(`Step 1 failed. Expected: "${afterSelfRemoval}", Got: "${response}"`);
      }

      // Step 2: Add auto-mention (should NOT add @gm because @gm already exists)
      response = addAutoMention(response, 'gm');
      let expected = '@gm I will work on this task.';
      if (response !== expected) {
        throw new Error(`Step 2 failed. Expected: "${expected}", Got: "${response}"`);
      }
    });

    await runTest('Redirection: @gm can redirect to @con', () => {
      let response = '@con Please handle this request.';

      // Step 1: Remove self-mentions (gm removes @gm mentions)
      response = removeSelfMentions(response, 'gm');
      let afterSelfRemoval = '@con Please handle this request.';
      if (response !== afterSelfRemoval) {
        throw new Error(`Step 1 failed. Expected: "${afterSelfRemoval}", Got: "${response}"`);
      }

      // Step 2: Add auto-mention (should NOT add auto-mention because @con already exists)
      response = addAutoMention(response, 'human');
      let expected = '@con Please handle this request.';
      if (response !== expected) {
        throw new Error(`Step 2 failed. Expected: "${expected}", Got: "${response}"`);
      }
    });

    await runTest('Normal Response: should add auto-mention when no mention exists', () => {
      let response = 'I understand your request.';

      // Step 1: Remove self-mentions
      response = removeSelfMentions(response, 'gm');
      let afterSelfRemoval = 'I understand your request.';
      if (response !== afterSelfRemoval) {
        throw new Error(`Step 1 failed. Expected: "${afterSelfRemoval}", Got: "${response}"`);
      }

      // Step 2: Add auto-mention (should add because no mention exists)
      response = addAutoMention(response, 'human');
      let expected = '@human I understand your request.';
      if (response !== expected) {
        throw new Error(`Step 2 failed. Expected: "${expected}", Got: "${response}"`);
      }
    });

    // Print results
    console.log('\n📊 Test Results Summary:');
    console.log('========================');

    const passed = testResults.filter(r => r.passed).length;
    const failed = testResults.filter(r => !r.passed).length;

    testResults.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.name}`);
      if (!result.passed && result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    console.log(`\n🎯 Results: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
      console.log('\n❌ Some utility function tests failed. The implementation needs review.');
      process.exit(1);
    } else {
      console.log('\n🎉 All utility function tests passed! The loop prevention logic is working correctly.');
      console.log('\n💡 Key improvements:');
      console.log('  - Prevents @gm->@pro->@gm loops by checking for ANY mention at beginning');
      console.log('  - Allows @gm->@con redirections by preserving explicit mentions');
      console.log('  - Self-mentions are still properly removed');
    }

  } catch (error) {
    console.error('❌ Test setup failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run the tests
runUtilityTests().catch(console.error);
