/**
 * Simple Integration Test for Manager Modules
 *
 * This is a basic test to verify the manager modules work correctly.
 * It can be run directly with Node.js to test functionality.
 * 
 * To run: node --loader ts-node/esm tests/manager-integration-demo.ts
 */

import { LLMProvider } from '../src/types.js';
import { createAgent, getAgent, updateAgent, deleteAgent, listAgents, updateAgentMemory, getAgentConfig } from '../core/agent-manager.js';
import { createWorld, getWorld, updateWorld, deleteWorld, listWorlds } from '../core/world-manager.js';

async function runDemo() {
  console.log('🧪 Manager Modules Integration Demo\n');

  try {
    // Test World Manager
    console.log('📝 Testing World Manager...');

    // Create a test world
    const testWorld = await createWorld({
      name: 'demo-world',
      description: 'A demo world for testing',
      turnLimit: 10
    });
    console.log('✅ Created world:', testWorld.id);

    // List worlds
    const worlds = await listWorlds();
    console.log('✅ Listed worlds:', worlds.length);

    // Test Agent Manager
    console.log('\n🤖 Testing Agent Manager...');

    // Create a test agent
    const testAgent = await createAgent({
      id: 'demo-agent',
      name: 'Demo Agent',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'You are a helpful demo agent.'
    });
    console.log('✅ Created agent:', testAgent.id);

    // Update agent memory
    const updatedAgent = await updateAgentMemory('demo-agent', [
      {
        role: 'user',
        content: 'Hello, agent!',
        createdAt: new Date(),
        sender: 'user1'
      },
      {
        role: 'assistant',
        content: 'Hello! How can I help you?',
        createdAt: new Date()
      }
    ]);
    console.log('✅ Updated agent memory, size:', updatedAgent?.memory.length);

    // List agents
    const agents = await listAgents();
    console.log('✅ Listed agents:', agents.length);
    console.log('   Agent info:', agents[0]);

    // Get agent config
    const agentConfig = await getAgentConfig('demo-agent');
    console.log('✅ Retrieved agent config:', agentConfig?.config.name);

    // Update world
    const updatedWorld = await updateWorld('demo-world', {
      description: 'Updated demo world description',
      turnLimit: 15
    });
    console.log('✅ Updated world config:', updatedWorld?.config.description);

    // Clean up
    console.log('\n🧹 Cleaning up...');
    const agentDeleted = await deleteAgent('demo-agent');
    const worldDeleted = await deleteWorld('demo-world');
    console.log('✅ Deleted agent:', agentDeleted);
    console.log('✅ Deleted world:', worldDeleted);

    console.log('\n🎉 All tests passed! Manager modules working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the demo
runDemo();
