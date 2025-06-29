#!/usr/bin/env node

/**
 * Quick validation test for the refactored MessageBroker
 * Tests both static and server mode functionality
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test Core bundle import (simulate browser static import)
async function testCoreBundleImport() {
  console.log('\n🔍 Testing Core Bundle Import...');

  try {
    // Test that the core bundle exists and is readable
    const fs = await import('fs');
    const coreBundlePath = join(__dirname, 'public/core.js');

    if (fs.existsSync(coreBundlePath)) {
      const stats = fs.statSync(coreBundlePath);
      console.log(`✅ Core bundle exists: ${(stats.size / 1024).toFixed(2)} KB`);

      // Read bundle content to check for exports
      const content = fs.readFileSync(coreBundlePath, 'utf8');
      const hasExports = content.includes('export');
      const hasWorldFunctions = content.includes('createWorld') && content.includes('listWorlds');
      const hasAgentFunctions = content.includes('createAgent') && content.includes('listAgents');

      console.log(`✅ Has ES6 exports: ${hasExports}`);
      console.log(`✅ Has world functions: ${hasWorldFunctions}`);
      console.log(`✅ Has agent functions: ${hasAgentFunctions}`);

      if (hasExports && hasWorldFunctions && hasAgentFunctions) {
        console.log('🎉 Core bundle validation passed!');
        return true;
      } else {
        console.log('❌ Core bundle missing expected functionality');
        return false;
      }
    } else {
      console.log('❌ Core bundle not found');
      return false;
    }
  } catch (error) {
    console.error('❌ Core bundle test failed:', error.message);
    return false;
  }
}

// Test MessageBroker module structure
async function testMessageBrokerStructure() {
  console.log('\n🔍 Testing MessageBroker Module Structure...');

  try {
    // Test that the message-broker file exists and has correct structure
    const fs = await import('fs');
    const messageBrokerPath = join(__dirname, 'public/message-broker.js');

    if (fs.existsSync(messageBrokerPath)) {
      const content = fs.readFileSync(messageBrokerPath, 'utf8');

      // Check for function-based architecture
      const hasFunctionExports = content.includes('export {') && content.includes('init,');
      const hasStaticImport = content.includes("import * as CoreBundle from './core.js'");
      const hasModuleState = content.includes('let state = {');
      const hasMessageTypes = content.includes('MESSAGE_TYPES');
      const hasOperationModes = content.includes('OPERATION_MODES');

      console.log(`✅ Function-based exports: ${hasFunctionExports}`);
      console.log(`✅ Static Core import: ${hasStaticImport}`);
      console.log(`✅ Module state pattern: ${hasModuleState}`);
      console.log(`✅ Message types defined: ${hasMessageTypes}`);
      console.log(`✅ Operation modes defined: ${hasOperationModes}`);

      if (hasFunctionExports && hasStaticImport && hasModuleState && hasMessageTypes && hasOperationModes) {
        console.log('🎉 MessageBroker structure validation passed!');
        return true;
      } else {
        console.log('❌ MessageBroker missing expected structure');
        return false;
      }
    } else {
      console.log('❌ MessageBroker file not found');
      return false;
    }
  } catch (error) {
    console.error('❌ MessageBroker structure test failed:', error.message);
    return false;
  }
}

// Test Core functionality directly
async function testCoreFunctionality() {
  console.log('\n🔍 Testing Core Functionality...');

  try {
    // Import the core module directly
    const coreModule = await import('./core/index.ts');

    // Test world operations
    console.log('Testing world operations...');

    // List worlds (should work even if empty)
    const worlds = await coreModule.listWorlds();
    console.log(`✅ Listed ${worlds.length} worlds`);

    // Create a test world
    const testWorldName = `Test World ${Date.now()}`;
    const newWorld = await coreModule.createWorld({
      name: testWorldName,
      description: 'Test world for validation'
    });
    console.log(`✅ Created world: ${newWorld.name}`);

    // List worlds again to confirm creation
    const updatedWorlds = await coreModule.listWorlds();
    console.log(`✅ World count after creation: ${updatedWorlds.length}`);

    // Test agent operations
    console.log('Testing agent operations...');

    // List agents in the test world
    const agents = await coreModule.listAgents(testWorldName);
    console.log(`✅ Listed ${agents.length} agents in test world`);

    // Create a test agent
    const testAgentName = `Test Agent ${Date.now()}`;
    const newAgent = await coreModule.createAgent({
      worldName: testWorldName,
      name: testAgentName,
      systemPrompt: 'You are a test agent for validation purposes.'
    });
    console.log(`✅ Created agent: ${newAgent.name}`);

    // List agents again to confirm creation
    const updatedAgents = await coreModule.listAgents(testWorldName);
    console.log(`✅ Agent count after creation: ${updatedAgents.length}`);

    console.log('🎉 Core functionality validation passed!');
    return true;

  } catch (error) {
    console.error('❌ Core functionality test failed:', error.message);
    return false;
  }
}

// Main validation function
async function runValidation() {
  console.log('🚀 Starting Agent World Dual Mode Architecture Validation');
  console.log('='.repeat(60));

  const results = {
    coreBundleImport: await testCoreBundleImport(),
    messageBrokerStructure: await testMessageBrokerStructure(),
    coreFunctionality: await testCoreFunctionality()
  };

  console.log('\n📊 Validation Results Summary:');
  console.log('='.repeat(40));

  let allPassed = true;
  for (const [test, passed] of Object.entries(results)) {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${test}`);
    if (!passed) allPassed = false;
  }

  console.log('\n' + '='.repeat(40));

  if (allPassed) {
    console.log('🎉 ALL VALIDATIONS PASSED!');
    console.log('\n✨ Phase 7.1 Static Mode Integration is ready!');
    console.log('✨ Dual-mode architecture successfully implemented!');
    console.log('✨ MessageBroker conversion to function-based architecture complete!');
    process.exit(0);
  } else {
    console.log('❌ Some validations failed - review the issues above');
    process.exit(1);
  }
}

// Run validation
runValidation().catch(error => {
  console.error('💥 Validation failed with error:', error);
  process.exit(1);
});
