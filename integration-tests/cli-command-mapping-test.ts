/**
 * CLI Command Mapping Integration Test
 * 
 * This test verifies the CLI command mapping functionality:
 * - Direct command execution for inputs starting with /
 * - Direct message handling for non-command inputs
 * - Error handling for invalid commands
 * 
 * Usage:
 * npx tsx integration-tests/cli-command-mapping-test.ts
 */

import { processCLIInput } from '../cli/commands.js';
import { getWorld } from '../core/world-manager.js';
import fs from 'fs';
import path from 'path';

async function runTests() {
  console.log('🧪 CLI Command Mapping Integration Test');
  console.log('======================================');

  // Setup test world path
  const rootPath = './data/test-worlds';
  const worldName = 'test-world';

  // Ensure test directory exists
  if (!fs.existsSync(path.join(rootPath, worldName))) {
    console.log('❌ Test failed: Test world directory not found');
    process.exit(1);
  }

  console.log('🔍 Loading test world...');
  const world = await getWorld(worldName, rootPath);

  if (!world) {
    console.log('❌ Test failed: Unable to load test world');
    process.exit(1);
  }

  console.log('✅ Test world loaded successfully');

  // Test case 1: Command execution (help)
  console.log('\n📋 Test Case 1: Command execution - help command');
  const helpResult = await processCLIInput('/help', world, rootPath);

  if (helpResult.success) {
    console.log('✅ Help command executed successfully');
  } else {
    console.log('❌ Help command failed:', helpResult.message);
    process.exit(1);
  }

  // Test case 2: Invalid command
  console.log('\n📋 Test Case 2: Invalid command handling');
  const invalidResult = await processCLIInput('/invalidcommand', world, rootPath);

  if (!invalidResult.success && invalidResult.message.includes('Unknown command')) {
    console.log('✅ Invalid command properly rejected');
  } else {
    console.log('❌ Invalid command test failed');
    process.exit(1);
  }

  // Test case 3: Message handling
  console.log('\n📋 Test Case 3: Message handling');
  const messageResult = await processCLIInput('This is a test message', world, rootPath);

  if (messageResult.success && messageResult.message.includes('Message sent')) {
    console.log('✅ Message handling works correctly');
  } else {
    console.log('❌ Message handling test failed:', messageResult.message);
    process.exit(1);
  }

  // Test case 4: Command with parameters (world info)
  console.log('\n📋 Test Case 4: Command with parameters');
  const worldResult = await processCLIInput(`/world ${worldName}`, world, rootPath);

  if (worldResult.success) {
    console.log('✅ World command with parameters executed successfully');
  } else {
    console.log('❌ World command test failed:', worldResult.message);
    process.exit(1);
  }

  console.log('\n🎉 All tests passed successfully!');
}

// Run all tests
runTests().catch(error => {
  console.error('❌ Test failed with error:', error);
  process.exit(1);
});
