#!/usr/bin/env npx tsx

/**
 * Test script to verify agent ID/name handling consistency
 */

// Set the data path for testing
process.env.AGENT_WORLD_DATA_PATH = './test-data/worlds';

import { createWorld } from '../../core/world-manager';
import { LLMProvider } from '../../core/types';
import { promises as fs } from 'fs';
import { toKebabCase } from '../../core/utils';

async function testAgentHandling() {
  const testRoot = './test-data/worlds';

  try {
    // Clean up any existing test data
    await fs.rm(testRoot, { recursive: true, force: true });

    console.log('🧪 Testing agent ID/name handling consistency...');

    // Create a test world
    const world = await createWorld(testRoot, { name: 'Test World' });
    console.log(`✅ World created: ${world.name}`);

    // Test 1: Create agent with spaces in name
    const agentName = 'My Test Agent';
    const expectedId = toKebabCase(agentName); // 'my-test-agent'

    console.log(`\nCreating agent: "${agentName}"`);
    console.log(`Expected ID: "${expectedId}"`);

    const agent = await world.createAgent({
      id: expectedId,
      name: agentName,
      type: 'assistant',
      provider: LLMProvider.OLLAMA,
      model: 'llama3.2:3b',
      systemPrompt: 'You are a test agent.',
      temperature: 0.7,
      maxTokens: 1000
    });

    console.log(`✅ Agent created with ID: ${agent.id}, Name: ${agent.name}`);

    // Test 2: Retrieve agent using original name (should be converted to kebab-case)
    console.log(`\n🔍 Testing agent retrieval with original name: "${agentName}"`);
    const retrievedAgent1 = await world.getAgent(agentName);

    if (retrievedAgent1 && retrievedAgent1.id === expectedId && retrievedAgent1.name === agentName) {
      console.log('✅ Agent retrieval by name working correctly!');
      console.log(`   Retrieved ID: ${retrievedAgent1.id}`);
      console.log(`   Retrieved Name: ${retrievedAgent1.name}`);
    } else {
      console.log('❌ Agent retrieval by name failed');
    }

    // Test 3: Retrieve agent using kebab-case ID
    console.log(`\n🔍 Testing agent retrieval with kebab-case ID: "${expectedId}"`);
    const retrievedAgent2 = await world.getAgent(expectedId);

    if (retrievedAgent2 && retrievedAgent2.id === expectedId && retrievedAgent2.name === agentName) {
      console.log('✅ Agent retrieval by ID working correctly!');
    } else {
      console.log('❌ Agent retrieval by ID failed');
    }

    // Test 4: Update agent using original name
    console.log(`\n🔧 Testing agent update with original name: "${agentName}"`);
    const updatedAgent = await world.updateAgent(agentName, {
      systemPrompt: 'Updated system prompt for test agent.'
    });

    if (updatedAgent && updatedAgent.systemPrompt === 'Updated system prompt for test agent.') {
      console.log('✅ Agent update by name working correctly!');
    } else {
      console.log('❌ Agent update by name failed');
    }

    // Test 5: List agents
    console.log('\n📋 Testing agent listing...');
    const agents = await world.listAgents();
    console.log(`Found ${agents.length} agent(s):`);
    agents.forEach(a => console.log(`   - ${a.name} (ID: ${a.id})`));

    if (agents.length === 1 && agents[0].name === agentName && agents[0].id === expectedId) {
      console.log('✅ Agent listing shows correct ID/name mapping!');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Clean up test data
    await fs.rm(testRoot, { recursive: true, force: true });
    console.log('\n🧹 Test data cleaned up');
  }
}

testAgentHandling().then(() => {
  console.log('\n🎉 Agent ID/name handling test completed!');
}).catch(console.error);
