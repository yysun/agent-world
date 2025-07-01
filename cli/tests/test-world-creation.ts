#!/usr/bin/env npx tsx

/**
 * Test script to verify world creation with kebab-case conversion
 */

// Set the data path for testing
process.env.AGENT_WORLD_DATA_PATH = './test-data/worlds';

import { createWorld, getWorld, listWorlds } from '../../core/world-manager';
import { promises as fs } from 'fs';
import path from 'path';

async function testWorldCreation() {
  const testRoot = './test-data/worlds';

  try {
    // Clean up any existing test data
    await fs.rm(testRoot, { recursive: true, force: true });

    console.log('🧪 Testing world creation with kebab-case conversion...');

    // Test 1: Create world with spaces in name
    const testWorldName = 'My Test World';
    console.log(`Creating world: "${testWorldName}"`);

    const world = await createWorld(testRoot, { name: testWorldName });

    console.log(`✅ World created successfully:`);
    console.log(`   Name: ${world.name}`);
    console.log(`   ID: ${world.id}`);

    // Test 2: Verify directory structure
    const expectedDir = path.join(testRoot, 'my-test-world');
    const configPath = path.join(expectedDir, 'config.json');

    try {
      await fs.access(expectedDir);
      console.log(`✅ Directory created: ${expectedDir}`);

      const configContent = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configContent);

      console.log(`✅ Config file created with content:`);
      console.log(`   ID: ${config.id}`);
      console.log(`   Name: ${config.name}`);

      // Verify the ID is kebab-case but name is preserved
      if (config.id === 'my-test-world' && config.name === 'My Test World') {
        console.log('✅ Kebab-case conversion working correctly!');
      } else {
        console.log('❌ Kebab-case conversion failed');
        console.log(`   Expected ID: my-test-world, got: ${config.id}`);
        console.log(`   Expected Name: My Test World, got: ${config.name}`);
      }

    } catch (error) {
      console.log(`❌ Directory or config file not created: ${error}`);
    }

    // Test 3: Try to retrieve the world using kebab-case ID
    console.log('\n🔍 Testing world retrieval...');
    const retrievedWorld = await getWorld(testRoot, 'my-test-world');

    if (retrievedWorld && retrievedWorld.name === testWorldName) {
      console.log('✅ World retrieval working correctly!');
      console.log(`   Retrieved name: ${retrievedWorld.name}`);
      console.log(`   Retrieved ID: ${retrievedWorld.id}`);
    } else {
      console.log('❌ World retrieval failed');
    }

    // Test 4: List worlds
    console.log('\n📋 Testing world listing...');
    const worlds = await listWorlds(testRoot);
    console.log(`Found ${worlds.length} world(s):`);
    worlds.forEach(w => console.log(`   - ${w.name} (${w.id})`));

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Clean up test data
    await fs.rm(testRoot, { recursive: true, force: true });
    console.log('\n🧹 Test data cleaned up');
  }
}

testWorldCreation().then(() => {
  console.log('\n🎉 Test completed!');
}).catch(console.error);
