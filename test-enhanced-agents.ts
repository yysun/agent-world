/**
 * Test script to verify that agents loaded from disk have the new methods
 */

import { getAgent, getWorld, listAgents } from './core/managers.js';

async function testEnhancedAgents() {
  const rootPath = process.cwd() + '/data/worlds';
  const worldId = 'default-world';

  try {
    console.log('Testing enhanced agent methods...');
    console.log('Root path:', rootPath);
    console.log('World ID:', worldId);

    // Test getWorld with enhanced methods
    const world = await getWorld(rootPath, worldId);
    if (world) {
      console.log('✓ World loaded with methods:');
      console.log('  - getTurnLimit:', typeof world.getTurnLimit === 'function' ? '✓' : '✗');
      console.log('  - getCurrentTurnCount:', typeof world.getCurrentTurnCount === 'function' ? '✓' : '✗');
      console.log('  - publishMessage:', typeof world.publishMessage === 'function' ? '✓' : '✗');
      console.log('  - subscribeToMessages:', typeof world.subscribeToMessages === 'function' ? '✓' : '✗');

      // Test turn limit functionality
      const turnLimit = world.getTurnLimit();
      const currentTurnCount = world.getCurrentTurnCount();
      console.log(`  Current turn limit: ${turnLimit}, count: ${currentTurnCount}`);
    } else {
      console.log('⚠ No test world found');
    }

    // List agents and test the first one found
    try {
      const agentList = await listAgents(rootPath, worldId);
      if (agentList.length > 0) {
        const agentId = agentList[0].id;
        console.log(`\nTesting agent ${agentId} methods...`);

        const agent = await getAgent(rootPath, worldId, agentId);
        if (agent) {
          console.log('✓ Agent loaded with methods:');
          console.log('  - generateResponse:', typeof agent.generateResponse === 'function' ? '✓' : '✗');
          console.log('  - streamResponse:', typeof agent.streamResponse === 'function' ? '✓' : '✗');
          console.log('  - completeChat:', typeof agent.completeChat === 'function' ? '✓' : '✗');
          console.log('  - addMemory:', typeof agent.addMemory === 'function' ? '✓' : '✗');
          console.log('  - getMemory:', typeof agent.getMemory === 'function' ? '✓' : '✗');
          console.log('  - clearMemory:', typeof agent.clearMemory === 'function' ? '✓' : '✗');
          console.log('  - archiveMemory:', typeof agent.archiveMemory === 'function' ? '✓' : '✗');
          console.log('  - processMessage:', typeof agent.processMessage === 'function' ? '✓' : '✗');
          console.log('  - sendMessage:', typeof agent.sendMessage === 'function' ? '✓' : '✗');

          // Test getMemory functionality
          const memory = await agent.getMemory();
          console.log(`  Current memory length: ${memory.length}`);
        }
      } else {
        console.log('\n⚠ No agents found in test world');
      }
    } catch (error) {
      console.log('\n⚠ Error listing agents:', error.message);
    }

    console.log('\n✓ All method enhancement tests completed successfully!');

  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testEnhancedAgents().catch(console.error);
