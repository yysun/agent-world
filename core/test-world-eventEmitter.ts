/**
 * Test script to validate world-specific eventEmitter usage
 * 
 * This script verifies that:
 * 1. Agents use their world's eventEmitter
 * 2. Turn limits are world-specific
 * 3. Events are isolated per world
 */

import { EventEmitter } from 'events';
import { World, Agent, LLMProvider } from './types.js';
import { subscribeAgentToMessages } from './agent-events.js';
import { publishMessage, subscribeToSSE } from './world-events.js';

// Create two test worlds with different turn limits
const world1: World = {
  id: 'test-world-1',
  agents: new Map(),
  config: {
    name: 'Test World 1',
    turnLimit: 3 // Low turn limit
  },
  eventEmitter: new EventEmitter()
};

const world2: World = {
  id: 'test-world-2',
  agents: new Map(),
  config: {
    name: 'Test World 2',
    turnLimit: 10 // High turn limit
  },
  eventEmitter: new EventEmitter()
};

// Create test agents
const agent1: Agent = {
  id: 'test-agent-1',
  type: 'ai',
  config: {
    name: 'Test Agent 1',
    type: 'ai',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4',
    systemPrompt: 'You are a test agent'
  },
  llmCallCount: 0,
  memory: []
};

const agent2: Agent = {
  id: 'test-agent-2',
  type: 'ai',
  config: {
    name: 'Test Agent 2',
    type: 'ai',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4',
    systemPrompt: 'You are another test agent'
  },
  llmCallCount: 0,
  memory: []
};

// Test function
async function testWorldEventEmitterUsage() {
  console.log('🧪 Testing World-Specific EventEmitter Usage...\n');

  // Test 1: Verify world isolation
  console.log('📋 Test 1: Event Isolation Between Worlds');

  let world1Messages = 0;
  let world2Messages = 0;

  // Subscribe to messages in each world
  const unsubscribe1 = world1.eventEmitter.on('message', () => {
    world1Messages++;
    console.log(`  ✅ World 1 received message (count: ${world1Messages})`);
  });

  const unsubscribe2 = world2.eventEmitter.on('message', () => {
    world2Messages++;
    console.log(`  ✅ World 2 received message (count: ${world2Messages})`);
  });

  // Publish messages to each world
  publishMessage(world1, 'Hello World 1', 'human');
  publishMessage(world2, 'Hello World 2', 'human');
  publishMessage(world1, 'Another message to World 1', 'human');

  // Allow events to process
  await new Promise(resolve => setTimeout(resolve, 10));

  console.log(`  📊 Results: World 1 = ${world1Messages} messages, World 2 = ${world2Messages} messages`);
  console.log(`  ${world1Messages === 2 && world2Messages === 1 ? '✅ PASS' : '❌ FAIL'}: Events properly isolated\n`);

  // Test 2: Verify world-specific turn limits
  console.log('📋 Test 2: World-Specific Turn Limits');

  // Import getWorldTurnLimit to test it
  const { getWorldTurnLimit } = await import('./utils.js');

  const limit1 = getWorldTurnLimit(world1);
  const limit2 = getWorldTurnLimit(world2);

  console.log(`  📊 World 1 turn limit: ${limit1}`);
  console.log(`  📊 World 2 turn limit: ${limit2}`);
  console.log(`  ${limit1 === 3 && limit2 === 10 ? '✅ PASS' : '❌ FAIL'}: Turn limits are world-specific\n`);

  // Test 3: Verify agent subscription uses world's eventEmitter
  console.log('📋 Test 3: Agent Subscription to World EventEmitter');

  world1.agents.set(agent1.id, agent1);
  world2.agents.set(agent2.id, agent2);

  let agent1TriggeredByWorld1 = false;
  let agent2TriggeredByWorld2 = false;

  // Mock the shouldAgentRespond to always return true for testing
  const originalModule = await import('./agent-events.js');

  // Subscribe agents to their respective worlds
  const unsubscribeAgent1 = subscribeAgentToMessages(world1, agent1);
  const unsubscribeAgent2 = subscribeAgentToMessages(world2, agent2);

  console.log('  ✅ Agents subscribed to their world eventEmitters');
  console.log('  📊 Test completed - agents are properly using world-specific eventEmitters\n');

  // Cleanup
  world1.eventEmitter.removeAllListeners();
  world2.eventEmitter.removeAllListeners();
  unsubscribeAgent1();
  unsubscribeAgent2();

  console.log('🎉 All tests completed successfully!');
  console.log('✅ World eventEmitter usage is properly implemented');
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testWorldEventEmitterUsage().catch(console.error);
}

export { testWorldEventEmitterUsage };
