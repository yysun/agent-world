// Debug script to test agent lookup
import { getWorld } from '../../core/world-manager.js';
import { toKebabCase } from '../../core/utils.js';

console.log('=== DEBUG: Agent Lookup Test ===');

// Set data path like CLI does
process.env.AGENT_WORLD_DATA_PATH = './data/worlds';

async function testAgentLookup() {
  try {
    // Load world like CLI does
    const worldName = "Default World";
    const worldId = toKebabCase(worldName);
    console.log(`Loading world: "${worldName}" -> ID: "${worldId}"`);

    const world = await getWorld(worldId);
    if (!world) {
      console.log('❌ World not found!');
      return;
    }

    console.log(`✅ World loaded: ID="${world.id}", Name="${world.config.name}"`);
    console.log(`Agents in runtime map: ${world.agents.size}`);

    // List agents in the runtime map
    for (const [id, agent] of world.agents.entries()) {
      console.log(`  - Runtime Agent: ID="${id}", Name="${agent.config.name}"`);
    }

    // Test agent lookup
    const testNames = ['a1', 'a2', 'test-agent'];

    for (const agentName of testNames) {
      console.log(`\nTesting agent lookup: "${agentName}"`);
      try {
        const agent = await world.getAgent(agentName);
        if (agent) {
          console.log(`  ✅ Found: ID="${agent.id}", Name="${agent.config.name}"`);
        } else {
          console.log(`  ❌ Not found`);
        }
      } catch (error) {
        console.log(`  ❌ Error: ${error}`);
      }
    }

  } catch (error) {
    console.error('Debug error:', error);
  }
}

testAgentLookup();
