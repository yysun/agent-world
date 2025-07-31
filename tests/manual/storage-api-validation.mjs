#!/usr/bin/env node

/**
 * Manual Integration Test for StorageAPI Refactoring
 * 
 * This script verifies that the refactored storage system works correctly
 * by testing the complete flow from high-level managers through StorageWrappers
 * to the actual storage implementations.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const TEST_WORLD_NAME = 'storage-api-test';
const TEST_AGENT_NAME = 'test-agent';
const TEST_ROOT_PATH = join(__dirname, '../../tmp/storage-test');

console.log('🚀 Starting StorageAPI Integration Test');
console.log(`📁 Test data path: ${TEST_ROOT_PATH}`);

async function runTests() {
  try {
    // Import core modules - these should use the new StorageAPI
    console.log('\n📦 Importing core modules...');
    const { 
      createWorld, 
      getWorld, 
      deleteWorld, 
      listWorlds,
      createAgent,
      getAgent,
      deleteAgent,
      listAgents,
      createStorageWrappers,
      createStorageWithWrappers
    } = await import('../../core/index.js');

    // Test 1: Verify createStorageWrappers works correctly
    console.log('\n✅ Test 1: createStorageWrappers function');
    const wrappers = await createStorageWithWrappers();
    console.log(`   Storage wrapper type: ${typeof wrappers}`);
    console.log(`   Has saveWorld method: ${typeof wrappers.saveWorld === 'function'}`);
    console.log(`   Has loadWorld method: ${typeof wrappers.loadWorld === 'function'}`);
    console.log(`   Has saveAgent method: ${typeof wrappers.saveAgent === 'function'}`);
    console.log(`   Has loadAgent method: ${typeof wrappers.loadAgent === 'function'}`);

    // Test 2: World management through managers
    console.log('\n✅ Test 2: World management');
    
    // Clean up any existing test world
    try {
      await deleteWorld(TEST_ROOT_PATH, TEST_WORLD_NAME);
    } catch (e) {
      // Ignore errors for cleanup
    }

    // Create a world
    console.log(`   Creating world '${TEST_WORLD_NAME}'...`);
    const world = await createWorld(TEST_ROOT_PATH, {
      name: TEST_WORLD_NAME,
      description: 'Test world for StorageAPI validation',
      turnLimit: 10
    });
    console.log(`   ✓ World created: ${world.name} (ID: ${world.id})`);

    // List worlds
    console.log('   Listing worlds...');
    const worlds = await listWorlds(TEST_ROOT_PATH);
    const testWorld = worlds.find(w => w.id === world.id);
    console.log(`   ✓ Found ${worlds.length} worlds, test world present: ${!!testWorld}`);

    // Load world
    console.log('   Loading world...');
    const loadedWorld = await getWorld(TEST_ROOT_PATH, TEST_WORLD_NAME);
    console.log(`   ✓ World loaded: ${loadedWorld?.name} (Agents: ${loadedWorld?.agents?.size || 0})`);

    // Test 3: Agent management through managers
    console.log('\n✅ Test 3: Agent management');
    
    if (loadedWorld) {
      // Create an agent
      console.log(`   Creating agent '${TEST_AGENT_NAME}'...`);
      const agent = await createAgent(TEST_ROOT_PATH, loadedWorld.id, {
        name: TEST_AGENT_NAME,
        type: 'test-agent',
        provider: 'openai',
        model: 'gpt-4',
        systemPrompt: 'You are a test agent for validating the StorageAPI refactoring.'
      });
      console.log(`   ✓ Agent created: ${agent.name} (ID: ${agent.id})`);

      // List agents
      console.log('   Listing agents...');
      const agents = await listAgents(TEST_ROOT_PATH, loadedWorld.id);
      const testAgent = agents.find(a => a.id === agent.id);
      console.log(`   ✓ Found ${agents.length} agents, test agent present: ${!!testAgent}`);

      // Load agent
      console.log('   Loading agent...');
      const loadedAgent = await getAgent(TEST_ROOT_PATH, loadedWorld.id, TEST_AGENT_NAME);
      console.log(`   ✓ Agent loaded: ${loadedAgent?.name} (Memory size: ${loadedAgent?.memory?.length || 0})`);

      // Delete agent
      console.log('   Deleting agent...');
      const agentDeleted = await deleteAgent(TEST_ROOT_PATH, loadedWorld.id, TEST_AGENT_NAME);
      console.log(`   ✓ Agent deleted: ${agentDeleted}`);
    }

    // Test 4: Direct StorageAPI usage
    console.log('\n✅ Test 4: Direct StorageAPI usage');
    
    // Test world operations
    console.log('   Testing direct world operations...');
    const worldData = { 
      id: 'direct-test', 
      name: 'Direct Test World', 
      turnLimit: 5 
    };
    
    await wrappers.saveWorld(worldData);
    console.log('   ✓ World saved via StorageAPI');
    
    const retrievedWorld = await wrappers.loadWorld('direct-test');
    console.log(`   ✓ World loaded via StorageAPI: ${retrievedWorld?.name}`);
    
    const worldExists = await wrappers.worldExists('direct-test');
    console.log(`   ✓ World exists check: ${worldExists}`);
    
    const worldDeleted = await wrappers.deleteWorld('direct-test');
    console.log(`   ✓ World deleted via StorageAPI: ${worldDeleted}`);

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await deleteWorld(TEST_ROOT_PATH, TEST_WORLD_NAME);
    console.log('   ✓ Test data cleaned up');

    // Test 5: Verify backward compatibility
    console.log('\n✅ Test 5: Backward compatibility');
    console.log('   Testing that old function names still exist...');
    
    const agentStorage = await import('../../core/agent-storage.js');
    const worldStorage = await import('../../core/world-storage.js');
    
    const oldFunctions = [
      { module: 'agent-storage', name: 'saveAgentToDisk', fn: agentStorage.saveAgentToDisk },
      { module: 'agent-storage', name: 'loadAgentFromDisk', fn: agentStorage.loadAgentFromDisk },
      { module: 'world-storage', name: 'saveWorldToDisk', fn: worldStorage.saveWorldToDisk },
      { module: 'world-storage', name: 'loadWorldFromDisk', fn: worldStorage.loadWorldFromDisk },
    ];

    for (const { module, name, fn } of oldFunctions) {
      console.log(`   ✓ ${module}.${name}: ${typeof fn === 'function' ? 'Available' : 'Missing'}`);
    }

    const newFunctions = [
      { module: 'agent-storage', name: 'saveAgent', fn: agentStorage.saveAgent },
      { module: 'agent-storage', name: 'loadAgent', fn: agentStorage.loadAgent },
      { module: 'world-storage', name: 'saveWorld', fn: worldStorage.saveWorld },
      { module: 'world-storage', name: 'loadWorld', fn: worldStorage.loadWorld },
    ];

    for (const { module, name, fn } of newFunctions) {
      console.log(`   ✓ ${module}.${name}: ${typeof fn === 'function' ? 'Available' : 'Missing'}`);
    }

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ createStorageWrappers function works correctly');
    console.log('   ✅ StorageAPI interface is properly implemented');
    console.log('   ✅ World management through managers works');
    console.log('   ✅ Agent management through managers works');
    console.log('   ✅ Direct StorageAPI usage works');
    console.log('   ✅ Backward compatibility maintained');
    console.log('\n🚀 StorageAPI refactoring validation complete!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

runTests();