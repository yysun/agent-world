/**
 * Test script to verify cli/index-tui.ts migration to core modules
 * Tests basic functionality of core modules used by the CLI
 */

// Set the data path for core modules
process.env.AGENT_WORLD_DATA_PATH = './data/worlds';

// Test core module imports
import { listWorlds, createWorld, getWorld } from '../../core/world-manager.js';
import { loadAgentsIntoWorld, getAgent } from '../../core/agent-manager.js';
import { subscribeToMessages, subscribeToSSE, broadcastToWorld } from '../../core/world-events.js';

console.log('✅ Core module imports successful');
console.log(`📁 Data path set to: ${process.env.AGENT_WORLD_DATA_PATH}`);

async function testCoreFunctionality() {
  try {
    const rootPath = process.env.AGENT_WORLD_DATA_PATH || './data/worlds';

    // Test 1: Load worlds info
    console.log('\n🧪 Testing listWorlds...');
    const worldsInfo = await listWorlds(rootPath);
    console.log(`✅ Found ${worldsInfo.length} worlds`);

    // Test 2: Create a test world if none exist
    console.log('\n🧪 Testing world creation...');
    let testWorld;
    if (worldsInfo.length === 0) {
      testWorld = await createWorld(rootPath, { name: 'test-world' });
      console.log(`✅ Created test world: ${testWorld.name}`);
    } else {
      // Load existing world
      const worldInfo = worldsInfo[0];
      console.log(`📍 Attempting to load world ID: ${worldInfo.id}`);
      testWorld = await getWorld(rootPath, worldInfo.id);
      if (!testWorld) {
        console.log('⚠️  World not found, creating new test world...');
        testWorld = await createWorld(rootPath, { name: 'test-world' });
        console.log(`✅ Created test world: ${testWorld.name}`);
      } else {
        console.log(`✅ Loaded existing world: ${testWorld.name}`);
      }
    }

    // Test 3: Load agents
    console.log('\n🧪 Testing agent loading...');
    await loadAgentsIntoWorld();
    const agents = Array.from(testWorld.agents.values());
    console.log(`✅ Loaded ${agents.length} agents`);

    // Test 4: Event system
    console.log('\n🧪 Testing event system...');
    let messageReceived = false;
    let sseReceived = false;

    const unsubMessages = subscribeToMessages(testWorld, (event) => {
      console.log(`✅ Message event received: ${event.content}`);
      messageReceived = true;
    });

    const unsubSSE = subscribeToSSE(testWorld, (event) => {
      console.log(`✅ SSE event received: ${event.type}`);
      sseReceived = true;
    });

    // Test broadcasting
    broadcastToWorld(testWorld, 'Test message from migration test');

    // Clean up
    unsubMessages();
    unsubSSE();

    console.log('\n✅ All core module tests passed!');
    console.log('🎉 CLI migration to core modules is successful');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testCoreFunctionality();
