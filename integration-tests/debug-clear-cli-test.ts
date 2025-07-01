/**
 * Debug test for clear command CLI execution path
 * Tests the exact same flow as the CLI clear command to identify the issue
 */

import { getWorld } from '../core/world-manager';
import { clearCommand } from '../cli/commands/clear';
import { displayUnifiedMessage } from '../cli/ui/display';

// Mock display function to capture output
const mockDisplayMessages: any[] = [];

async function debugClearCliTest() {
  try {
    // Set up environment like CLI does
    if (!process.env.AGENT_WORLD_DATA_PATH) {
      process.env.AGENT_WORLD_DATA_PATH = './data/worlds';
    }

    const rootPath = './data/worlds';
    const worldId = 'default-world';

    console.log('Loading world (CLI style)...');
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

    console.log('\n--- Testing clearCommand for "a1" (CLI path) ---');
    mockDisplayMessages.length = 0; // Clear previous messages

    try {
      await clearCommand(['a1'], world);
      console.log('Clear command completed without throwing error');
    } catch (error) {
      console.log(`Error in clearCommand: ${error}`);
    }

    // Check the results by reloading the world and looking at agent memory
    console.log('\n--- Checking results by reloading world ---');
    const reloadedWorld = await getWorld(rootPath, worldId);
    const agent = reloadedWorld?.agents.get('a1');
    if (agent) {
      console.log(`Agent a1 memory after clear: ${agent.memory.length} items`);
    } else {
      console.log('Agent a1 not found after reload');
    }

    console.log('\n--- Testing clearCommand for "a2" (CLI path) ---');
    mockDisplayMessages.length = 0; // Clear previous messages

    try {
      await clearCommand(['a2'], world);
      console.log('Clear command completed without throwing error');
    } catch (error) {
      console.log(`Error in clearCommand: ${error}`);
    }

    // Check the results for a2
    const reloadedWorld2 = await getWorld(rootPath, worldId);
    const agent2 = reloadedWorld2?.agents.get('a2');
    if (agent2) {
      console.log(`Agent a2 memory after clear: ${agent2.memory.length} items`);
    } else {
      console.log('Agent a2 not found after reload');
    }

  } catch (error) {
    console.error('Error in test:', error);
  }
}

debugClearCliTest();
