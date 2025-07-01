/**
 * Debug test for clear command agent lookup issues
 * Tests the clearAgentMemory functionality to identify why agents are not found
 */

import { getWorld } from '../core/world-manager';

async function debugClearTest() {
  try {
    const rootPath = './data/worlds';
    const worldId = 'default-world';

    console.log('Loading world...');
    const world = await getWorld(rootPath, worldId);

    if (!world) {
      console.log('World not found!');
      return;
    }

    console.log(`World loaded: ${world.name}`);
    console.log(`Agents in world.agents Map:`);
    for (const [id, agent] of world.agents) {
      console.log(`  ID: ${id}, Name: ${agent.name}, Memory items: ${agent.memory.length}`);
    }

    console.log('\n--- Testing clearAgentMemory for "a1" ---');
    try {
      const result = await world.clearAgentMemory('a1');
      if (result) {
        console.log(`Success: Cleared memory for agent ${result.name} (ID: ${result.id})`);
        console.log(`Memory items after clear: ${result.memory.length}`);
      } else {
        console.log('Failed: clearAgentMemory returned null');
      }
    } catch (error) {
      console.log(`Error in clearAgentMemory: ${error}`);
    }

    console.log('\n--- Testing clearAgentMemory for "a2" ---');
    try {
      const result = await world.clearAgentMemory('a2');
      if (result) {
        console.log(`Success: Cleared memory for agent ${result.name} (ID: ${result.id})`);
        console.log(`Memory items after clear: ${result.memory.length}`);
      } else {
        console.log('Failed: clearAgentMemory returned null');
      }
    } catch (error) {
      console.log(`Error in clearAgentMemory: ${error}`);
    }

    // Also test with kebab-case to see if that works
    console.log('\n--- Testing clearAgentMemory with kebab-case lookup ---');
    try {
      const agent = world.agents.get('a1');
      if (agent) {
        console.log(`Direct lookup successful: Found agent ${agent.name} with ID ${agent.id}`);
      } else {
        console.log('Direct lookup failed: Agent with ID "a1" not found in world.agents map');
      }
    } catch (error) {
      console.log(`Error in direct lookup: ${error}`);
    }

  } catch (error) {
    console.error('Error in test:', error);
  }
}

debugClearTest();
