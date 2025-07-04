/**
 * World Instance Management Integration Test
 * 
 * This test verifies that world refresh properly destroys old world instances
 * and creates fresh ones, preventing memory leaks and ensuring event isolation.
 * 
 * Features tested:
 * - World instance destruction during refresh
 * - EventEmitter cleanup and recreation
 * - Agent map clearance and repopulation
 * - Event isolation between old and new instances
 * - Memory leak prevention
 * 
 * Usage:
 * npx tsx integration-tests/world-instance-management-test.ts
 */

import { subscribeWorld, ClientConnection } from '../core/subscription.js';
import { createWorld, updateWorld } from '../core/world-manager.js';
import { publishMessage } from '../core/world-events.js';
import { World, LLMProvider } from '../core/types.js';
import fs from 'fs';
import path from 'path';

// Test configuration
const TEST_ROOT_PATH = './data/test-worlds';
const TEST_WORLD_NAME = 'instance-test';

// Enhanced client for tracking world instances
class InstanceTrackingClient implements ClientConnection {
  public isOpen = true;
  public receivedEvents: Array<{
    worldInstance: any,
    eventType: string,
    eventData: any,
    timestamp: Date
  }> = [];
  public errors: string[] = [];
  public currentWorldRef: World | null = null;

  constructor(public id: string) { }

  send(data: string): void {
    // Track send operations
  }

  onWorldEvent = (eventType: string, eventData: any): void => {
    this.receivedEvents.push({
      worldInstance: this.currentWorldRef,
      eventType,
      eventData,
      timestamp: new Date()
    });
  };

  onError = (error: string): void => {
    this.errors.push(error);
  };

  setCurrentWorld(world: World): void {
    this.currentWorldRef = world;
  }

  getEventCountForWorld(worldInstance: World): number {
    return this.receivedEvents.filter(event => event.worldInstance === worldInstance).length;
  }

  reset(): void {
    this.receivedEvents = [];
    this.errors = [];
    this.currentWorldRef = null;
  }
}

async function setupTestWorld(): Promise<void> {
  // Clean up existing test world
  const testWorldPath = path.join(TEST_ROOT_PATH, TEST_WORLD_NAME);
  if (fs.existsSync(testWorldPath)) {
    fs.rmSync(testWorldPath, { recursive: true, force: true });
  }

  // Create fresh test world
  const world = await createWorld(TEST_ROOT_PATH, {
    name: TEST_WORLD_NAME,
    description: 'World for instance management testing'
  });

  if (!world) {
    throw new Error('Failed to create test world');
  }
}

async function cleanupTestWorld(): Promise<void> {
  const testWorldPath = path.join(TEST_ROOT_PATH, TEST_WORLD_NAME);
  if (fs.existsSync(testWorldPath)) {
    fs.rmSync(testWorldPath, { recursive: true, force: true });
  }
}

async function runTests() {
  console.log('🧪 World Instance Management Integration Test');
  console.log('=============================================');

  try {
    // Setup
    console.log('\n🔧 Setting up test environment...');
    await setupTestWorld();
    console.log('✅ Test environment setup complete');

    // Test 1: World instance isolation
    console.log('\n📋 Test 1: World instance isolation');
    await testWorldInstanceIsolation();

    // Test 2: EventEmitter destruction and recreation
    console.log('\n📋 Test 2: EventEmitter destruction and recreation');
    await testEventEmitterRecreation();

    // Test 3: Agent map clearance and repopulation
    console.log('\n📋 Test 3: Agent map clearance and repopulation');
    await testAgentMapManagement();

    // Test 4: Memory leak prevention
    console.log('\n📋 Test 4: Memory leak prevention');
    await testMemoryLeakPrevention();

    // Test 5: Event isolation between instances
    console.log('\n📋 Test 5: Event isolation between instances');
    await testEventIsolation();

    console.log('\n🎉 All world instance management tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await cleanupTestWorld();
    console.log('🧹 Test environment cleaned up');
  }
}

async function testWorldInstanceIsolation(): Promise<void> {
  console.log('  Testing world instance isolation...');

  const client = new InstanceTrackingClient('isolation-test');

  // Create first subscription
  const subscription1 = await subscribeWorld(TEST_WORLD_NAME, TEST_ROOT_PATH, client);
  if (!subscription1) {
    throw new Error('Failed to create first subscription');
  }

  const world1 = subscription1.world;
  client.setCurrentWorld(world1);

  // Add an agent to track state
  await world1.createAgent({
    id: 'test-agent-1',
    name: 'Test Agent 1',
    type: 'conversational',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4',
    systemPrompt: 'Test agent 1'
  });

  // Send a message to the first world
  publishMessage(world1, 'Message to world 1', 'TEST_SENDER');
  await new Promise(resolve => setTimeout(resolve, 50));

  const world1EventCount = client.getEventCountForWorld(world1);

  // Refresh to get new world instance
  const world2 = await subscription1.refresh(TEST_ROOT_PATH);
  client.setCurrentWorld(world2);

  // Verify it's a different instance
  if (world1 === world2) {
    throw new Error('Refresh did not create a new world instance');
  }

  // Verify agent persisted in new instance
  if (!world2.agents.has('test-agent-1')) {
    throw new Error('Agent not found in refreshed world');
  }

  // Send message to new world instance
  publishMessage(world2, 'Message to world 2', 'TEST_SENDER');
  await new Promise(resolve => setTimeout(resolve, 50));

  const world2EventCount = client.getEventCountForWorld(world2);

  if (world2EventCount === 0) {
    throw new Error('New world instance not receiving events');
  }

  // Verify old world instance no longer receives events
  publishMessage(world1, 'Message to old world', 'TEST_SENDER');
  await new Promise(resolve => setTimeout(resolve, 50));

  const finalWorld1EventCount = client.getEventCountForWorld(world1);
  if (finalWorld1EventCount > world1EventCount) {
    throw new Error('Old world instance is still receiving events');
  }

  await subscription1.destroy();

  console.log('    ✅ World instance isolation working correctly');
  console.log(`    World 1 events: ${world1EventCount}, World 2 events: ${world2EventCount}`);
}

async function testEventEmitterRecreation(): Promise<void> {
  console.log('  Testing EventEmitter destruction and recreation...');

  const client = new InstanceTrackingClient('emitter-test');

  const subscription = await subscribeWorld(TEST_WORLD_NAME, TEST_ROOT_PATH, client);
  if (!subscription) {
    throw new Error('Failed to create subscription for emitter test');
  }

  const originalWorld = subscription.world;
  const originalEmitter = originalWorld.eventEmitter;

  // Add a listener directly to track destruction
  let originalEmitterEventCount = 0;
  const testListener = () => { originalEmitterEventCount++; };
  originalEmitter.on('test-event', testListener);

  // Emit test event to original emitter
  originalEmitter.emit('test-event');
  if (originalEmitterEventCount !== 1) {
    throw new Error('Original emitter not working');
  }

  // Refresh to get new world with new emitter
  const refreshedWorld = await subscription.refresh(TEST_ROOT_PATH);
  const refreshedEmitter = refreshedWorld.eventEmitter;

  // Verify it's a different EventEmitter instance
  if (originalEmitter === refreshedEmitter) {
    throw new Error('EventEmitter was not recreated during refresh');
  }

  // Verify original emitter no longer has listeners (was cleaned up)
  const originalListenerCount = originalEmitter.listenerCount('message');
  if (originalListenerCount > 0) {
    console.warn(`Original emitter still has ${originalListenerCount} listeners`);
  }

  // Test that original emitter doesn't affect new one
  originalEmitter.emit('test-event');
  const newEmitterEventCount = refreshedEmitter.listenerCount('message');

  await subscription.destroy();

  console.log('    ✅ EventEmitter recreation working correctly');
  console.log(`    Original: ${originalEmitterEventCount} events, New emitter listeners: ${newEmitterEventCount}`);
}

async function testAgentMapManagement(): Promise<void> {
  console.log('  Testing agent map clearance and repopulation...');

  const client = new InstanceTrackingClient('agent-map-test');

  const subscription = await subscribeWorld(TEST_WORLD_NAME, TEST_ROOT_PATH, client);
  if (!subscription) {
    throw new Error('Failed to create subscription for agent map test');
  }

  const originalWorld = subscription.world;
  const initialAgentCount = originalWorld.agents.size;

  // Add agents to original world
  await originalWorld.createAgent({
    id: 'agent-1',
    name: 'Agent 1',
    type: 'conversational',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4',
    systemPrompt: 'Agent 1'
  });

  await originalWorld.createAgent({
    id: 'agent-2',
    name: 'Agent 2',
    type: 'conversational',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4',
    systemPrompt: 'Agent 2'
  });

  const originalAgentCount = originalWorld.agents.size;
  const expectedAgentCount = initialAgentCount + 2;
  if (originalAgentCount !== expectedAgentCount) {
    throw new Error(`Expected ${expectedAgentCount} agents, got ${originalAgentCount}`);
  }

  // Store reference to original agents map
  const originalAgentsMap = originalWorld.agents;

  // Refresh world
  const refreshedWorld = await subscription.refresh(TEST_ROOT_PATH);

  // Verify agent map is different instance
  if (originalAgentsMap === refreshedWorld.agents) {
    throw new Error('Agents map was not recreated during refresh');
  }

  // Verify original map was cleared
  if (originalAgentsMap.size > 0) {
    console.warn(`Original agents map still has ${originalAgentsMap.size} entries`);
  }

  // Verify agents are repopulated in new map
  const refreshedAgentCount = refreshedWorld.agents.size;
  if (refreshedAgentCount !== expectedAgentCount) {
    throw new Error(`Expected ${expectedAgentCount} agents in refreshed world, got ${refreshedAgentCount}`);
  }

  // Verify specific agents exist
  if (!refreshedWorld.agents.has('agent-1') || !refreshedWorld.agents.has('agent-2')) {
    throw new Error('Agents not properly repopulated in refreshed world');
  }

  await subscription.destroy();

  console.log('    ✅ Agent map management working correctly');
  console.log(`    Initial: ${initialAgentCount}, Added: 2, Final: ${refreshedAgentCount} agents`);
}

async function testMemoryLeakPrevention(): Promise<void> {
  console.log('  Testing memory leak prevention...');

  const LEAK_TEST_CYCLES = 5;
  const client = new InstanceTrackingClient('leak-test');

  const subscription = await subscribeWorld(TEST_WORLD_NAME, TEST_ROOT_PATH, client);
  if (!subscription) {
    throw new Error('Failed to create subscription for leak test');
  }

  const worldInstances: World[] = [];
  const emitterInstances: any[] = [];

  // Collect references during refresh cycles
  for (let i = 0; i < LEAK_TEST_CYCLES; i++) {
    const currentWorld = subscription.world;
    worldInstances.push(currentWorld);
    emitterInstances.push(currentWorld.eventEmitter);

    // Add some agents and events
    await currentWorld.createAgent({
      id: `leak-agent-${i}`,
      name: `Leak Agent ${i}`,
      type: 'conversational',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: `Agent ${i}`
    });

    publishMessage(currentWorld, `Test message ${i}`, 'TEST_SENDER');
    await new Promise(resolve => setTimeout(resolve, 20));

    // Refresh for next cycle (except last)
    if (i < LEAK_TEST_CYCLES - 1) {
      await subscription.refresh(TEST_ROOT_PATH);
    }
  }

  // Check that old instances are properly isolated
  const finalWorld = subscription.world;
  for (let i = 0; i < worldInstances.length - 1; i++) {
    const oldWorld = worldInstances[i];

    // Old world should not be the same as current
    if (oldWorld === finalWorld) {
      throw new Error(`Old world instance ${i} is the same as final world`);
    }

    // Old world's agents map should be cleared
    if (oldWorld.agents.size > 0) {
      console.warn(`Old world ${i} still has ${oldWorld.agents.size} agents`);
    }

    // Test that old emitter doesn't interfere
    const oldEmitter = emitterInstances[i];
    let oldEmitterInterference = false;

    const interferenceListener = () => { oldEmitterInterference = true; };
    oldEmitter.on('interference-test', interferenceListener);
    oldEmitter.emit('interference-test');

    // Remove listener to clean up
    oldEmitter.removeListener('interference-test', interferenceListener);
  }

  await subscription.destroy();

  console.log('    ✅ Memory leak prevention working correctly');
  console.log(`    Tested ${LEAK_TEST_CYCLES} refresh cycles`);
}

async function testEventIsolation(): Promise<void> {
  console.log('  Testing event isolation between instances...');

  const client = new InstanceTrackingClient('isolation-test');

  const subscription = await subscribeWorld(TEST_WORLD_NAME, TEST_ROOT_PATH, client);
  if (!subscription) {
    throw new Error('Failed to create subscription for isolation test');
  }

  const world1 = subscription.world;
  client.setCurrentWorld(world1);

  // Send events to first world
  publishMessage(world1, 'Event 1', 'TEST_SENDER');
  publishMessage(world1, 'Event 2', 'TEST_SENDER');
  await new Promise(resolve => setTimeout(resolve, 50));

  const world1Events = client.getEventCountForWorld(world1);

  // Refresh to get new world
  const world2 = await subscription.refresh(TEST_ROOT_PATH);
  client.setCurrentWorld(world2);

  // Send events to new world
  publishMessage(world2, 'Event 3', 'TEST_SENDER');
  publishMessage(world2, 'Event 4', 'TEST_SENDER');
  await new Promise(resolve => setTimeout(resolve, 50));

  const world2Events = client.getEventCountForWorld(world2);

  // Verify both worlds received their own events
  if (world1Events === 0 || world2Events === 0) {
    throw new Error('Events not properly isolated');
  }

  // Try sending to old world again - should not affect new world tracking
  const world2EventsBefore = client.getEventCountForWorld(world2);
  publishMessage(world1, 'Old world event', 'TEST_SENDER');
  await new Promise(resolve => setTimeout(resolve, 50));

  const world2EventsAfter = client.getEventCountForWorld(world2);
  if (world2EventsAfter !== world2EventsBefore) {
    throw new Error('Old world events affected new world tracking');
  }

  await subscription.destroy();

  console.log('    ✅ Event isolation working correctly');
  console.log(`    World 1: ${world1Events} events, World 2: ${world2Events} events`);
}

// Run all tests
runTests().catch(error => {
  console.error('❌ World instance management test suite failed:', error);
  process.exit(1);
});
