#!/usr/bin/env node

/**
 * SQLite Storage Example
 * 
 * This example demonstrates how to use the SQLite storage backend
 * with the agent-world system, including enhanced archive features.
 */

import { createWorld, getStorageInfo, setStorageConfiguration } from '../core/managers.js';

async function sqliteExample() {
  console.log('🚀 SQLite Storage Example\n');

  try {
    // Configure SQLite storage
    console.log('📊 Configuring SQLite storage...');
    await setStorageConfiguration({
      type: 'sqlite',
      rootPath: './example-data',
      sqlite: {
        database: './example-data/agent-world.db',
        enableWAL: true,
        busyTimeout: 30000,
        cacheSize: -64000,
        enableForeignKeys: true
      }
    });

    // Check storage info
    const info = await getStorageInfo();
    console.log(`✅ Storage configured: ${info.type}`);
    console.log(`📋 Features available: ${info.supportedFeatures.join(', ')}\n`);

    // Create a world
    console.log('🌍 Creating example world...');
    const world = await createWorld('./example-data', {
      name: 'SQLite Demo World',
      description: 'A demonstration of SQLite storage features',
      turnLimit: 10
    });
    console.log(`✅ Created world: ${world.name}\n`);

    // Create agents
    console.log('🤖 Creating example agents...');
    const agent1 = await world.createAgent({
      name: 'Alice',
      type: 'assistant',
      provider: 'openai',
      model: 'gpt-4',
      systemPrompt: 'You are Alice, a helpful assistant.',
      temperature: 0.7
    });

    const agent2 = await world.createAgent({
      name: 'Bob',
      type: 'assistant', 
      provider: 'anthropic',
      model: 'claude-3-sonnet',
      systemPrompt: 'You are Bob, a creative thinker.',
      temperature: 0.8
    });

    console.log(`✅ Created agents: ${agent1.name}, ${agent2.name}\n`);

    // Add some conversation history
    console.log('💬 Adding conversation history...');
    await agent1.addMemory({
      role: 'user',
      content: 'Hello Alice, how are you today?',
      sender: 'user',
      createdAt: new Date()
    });

    await agent1.addMemory({
      role: 'assistant',
      content: 'Hello! I\'m doing well, thank you for asking. How can I help you today?',
      sender: 'alice',
      createdAt: new Date()
    });

    await agent2.addMemory({
      role: 'user',
      content: 'Bob, what do you think about creative writing?',
      sender: 'user',
      createdAt: new Date()
    });

    await agent2.addMemory({
      role: 'assistant',
      content: 'Creative writing is fascinating! It\'s a wonderful way to express imagination and explore new ideas.',
      sender: 'bob',
      createdAt: new Date()
    });

    console.log('✅ Added conversation history\n');

    // Demonstrate archiving (if SQLite storage is available)
    if (info.supportedFeatures.includes('enhanced-archives')) {
      console.log('📚 Demonstrating enhanced archive features...');
      
      // Archive Alice's conversation
      await agent1.archiveMemory();
      console.log('✅ Archived Alice\'s conversation');

      // If using SQLite storage directly, we could add rich metadata:
      // await sqliteStorage.archiveAgentMemory(world.id, agent2.id, agent2.memory, {
      //   sessionName: 'Creative Writing Discussion',
      //   archiveReason: 'End of session',
      //   tags: ['creativity', 'writing'],
      //   summary: 'Discussion about creative writing and imagination'
      // });

      console.log('✅ Enhanced archiving completed\n');
    }

    // List agents
    const agents = await world.listAgents();
    console.log(`📋 World has ${agents.length} agents:`);
    agents.forEach(agent => {
      console.log(`  - ${agent.name} (${agent.type}, ${agent.memorySize} messages)`);
    });

    console.log('\n🎉 SQLite storage example completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('  - Set AGENT_WORLD_STORAGE_TYPE=sqlite in your environment');
    console.log('  - Use the migration tools to move from file storage');
    console.log('  - Explore the archive search and analytics features');

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    console.log('\n💡 This might be expected if SQLite3 is not installed.');
    console.log('   Install with: npm install sqlite3');
    console.log('   Or use file storage for simpler setups.');
  }
}

// Run the example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  sqliteExample().catch(console.error);
}

export { sqliteExample };