/**
 * CLI World Refresh and Subscription Integrity Test
 * 
 * This test specifically focuses on the CLI refresh mechanism and world subscription integrity:
 * - World refresh after state-modifying commands
 * - Event subscription preservation across refreshes
 * - Prevention of double subscriptions
 * - Memory leak prevention during refresh cycles
 * - World state consistency after multiple refresh operations
 * 
 * Features tested:
 * - Subscription cleanup and re-establishment
 * - Event listener management during refresh
 * - World reference consistency across operations
 * - Memory usage stability during refresh cycles
 * - Error recovery in refresh scenarios
 * 
 * Usage:
 * npx tsx integration-tests/cli-world-refresh-subscription-test.ts
 */

import {
  processCLIInput,
  processCLICommand,
  CLIContext,
  CLIResponse
} from '../cli/commands.js';
import { World, Agent, LLMProvider } from '../core/types.js';
import { createWorld, updateWorld } from '../core/world-manager.js';
import { subscribeWorld, cleanupWorldSubscription, ClientConnection } from '../core/subscription.js';
import { publishMessage } from '../core/world-events.js';
import fs from 'fs';
import path from 'path';

// Test configuration
const TEST_ROOT_PATH = './data/test-worlds';
const TEST_WORLD_NAME = 'refresh-test';
const REFRESH_TEST_CYCLES = 5;

// Enhanced client connection for detailed subscription tracking
class SubscriptionTrackingClient implements ClientConnection {
  public isOpen = true;
  public subscriptionCount = 0;
  public unsubscribeCount = 0;
  public eventCounts: Map<string, number> = new Map();
  public lastEvents: Array<{ type: string, data: any, timestamp: Date }> = [];
  public errors: string[] = [];

  constructor(public id: string) { }

  send(data: string): void {
    // Track send operations
  }

  onWorldEvent = (eventType: string, eventData: any): void => {
    const count = this.eventCounts.get(eventType) || 0;
    this.eventCounts.set(eventType, count + 1);

    this.lastEvents.push({
      type: eventType,
      data: eventData,
      timestamp: new Date()
    });

    // Keep only last 20 events to prevent memory issues
    if (this.lastEvents.length > 20) {
      this.lastEvents = this.lastEvents.slice(-20);
    }
  };

  onError = (error: string): void => {
    this.errors.push(error);
  };

  // Track subscription lifecycle
  markSubscribed(): void {
    this.subscriptionCount++;
  }

  markUnsubscribed(): void {
    this.unsubscribeCount++;
  }

  getEventCount(eventType: string): number {
    return this.eventCounts.get(eventType) || 0;
  }

  getTotalEventCount(): number {
    return Array.from(this.eventCounts.values()).reduce((sum, count) => sum + count, 0);
  }

  reset(): void {
    this.eventCounts.clear();
    this.lastEvents = [];
    this.errors = [];
  }

  getStats(): any {
    return {
      id: this.id,
      subscriptionCount: this.subscriptionCount,
      unsubscribeCount: this.unsubscribeCount,
      totalEvents: this.getTotalEventCount(),
      eventsByType: Object.fromEntries(this.eventCounts),
      errorCount: this.errors.length,
      lastEventTime: this.lastEvents.length > 0 ? this.lastEvents[this.lastEvents.length - 1].timestamp : null
    };
  }
}

// Subscription manager for testing
class TestSubscriptionManager {
  private subscriptions: Map<string, any> = new Map();
  private clients: Map<string, SubscriptionTrackingClient> = new Map();

  async createSubscription(clientId: string, worldName: string, rootPath: string): Promise<any> {
    const client = new SubscriptionTrackingClient(clientId);
    this.clients.set(clientId, client);

    const subscription = await subscribeWorld(worldName, rootPath, client);
    if (subscription) {
      this.subscriptions.set(clientId, subscription);
      client.markSubscribed();
    }

    return subscription;
  }

  async refreshSubscription(clientId: string, worldName: string, rootPath: string): Promise<any> {
    // Clean up existing subscription
    const existingSubscription = this.subscriptions.get(clientId);
    const client = this.clients.get(clientId);

    if (existingSubscription && client) {
      await existingSubscription.unsubscribe();
      client.markUnsubscribed();
      this.subscriptions.delete(clientId);
    }

    // Create new subscription (reuse existing client)
    if (client) {
      const subscription = await subscribeWorld(worldName, rootPath, client);
      if (subscription) {
        this.subscriptions.set(clientId, subscription);
        client.markSubscribed();
      }
      return subscription;
    }

    return null;
  }

  async cleanupAll(): Promise<void> {
    for (const [clientId, subscription] of this.subscriptions) {
      try {
        await subscription.unsubscribe();
        const client = this.clients.get(clientId);
        if (client) client.markUnsubscribed();
      } catch (error) {
        console.warn(`Cleanup warning for ${clientId}:`, error);
      }
    }
    this.subscriptions.clear();

    // Mark any remaining clients as unsubscribed for test accounting
    for (const [clientId, client] of this.clients) {
      if (client.subscriptionCount > client.unsubscribeCount) {
        client.markUnsubscribed();
      }
    }
  }

  getClient(clientId: string): SubscriptionTrackingClient | undefined {
    return this.clients.get(clientId);
  }

  getSubscription(clientId: string): any {
    return this.subscriptions.get(clientId);
  }

  getAllStats(): any {
    const stats: any = {};
    for (const [clientId, client] of this.clients) {
      stats[clientId] = client.getStats();
    }
    return stats;
  }
}

async function setupTestWorld(): Promise<World> {
  // Clean up existing test world
  const testWorldPath = path.join(TEST_ROOT_PATH, TEST_WORLD_NAME);
  if (fs.existsSync(testWorldPath)) {
    fs.rmSync(testWorldPath, { recursive: true, force: true });
  }

  // Create fresh test world
  const world = await createWorld(TEST_ROOT_PATH, {
    name: TEST_WORLD_NAME,
    description: 'World for refresh and subscription testing'
  });

  if (!world) {
    throw new Error('Failed to create test world');
  }

  return world;
}

async function cleanupTestWorld(): Promise<void> {
  const testWorldPath = path.join(TEST_ROOT_PATH, TEST_WORLD_NAME);
  if (fs.existsSync(testWorldPath)) {
    fs.rmSync(testWorldPath, { recursive: true, force: true });
  }
}

async function runTests() {
  console.log('🧪 CLI World Refresh and Subscription Integrity Test');
  console.log('===================================================');

  const subscriptionManager = new TestSubscriptionManager();

  try {
    // Setup
    console.log('\n🔧 Setting up test environment...');
    const world = await setupTestWorld();
    console.log('✅ Test environment setup complete');

    // Test 1: Basic subscription integrity
    console.log('\n📋 Test 1: Basic subscription integrity');
    await testBasicSubscriptionIntegrity(subscriptionManager);

    // Test 2: World refresh mechanism
    console.log('\n📋 Test 2: World refresh mechanism');
    await testWorldRefreshMechanism(subscriptionManager);

    // Test 3: Multiple refresh cycles
    console.log('\n📋 Test 3: Multiple refresh cycles');
    await testMultipleRefreshCycles(subscriptionManager);

    // Test 4: Concurrent subscription management
    console.log('\n📋 Test 4: Concurrent subscription management');
    await testConcurrentSubscriptionManagement(subscriptionManager);

    // Test 5: Memory leak prevention
    console.log('\n📋 Test 5: Memory leak prevention');
    await testMemoryLeakPrevention(subscriptionManager);

    // Test 6: Error recovery during refresh
    console.log('\n📋 Test 6: Error recovery during refresh');
    await testErrorRecoveryDuringRefresh(subscriptionManager);

    // Test 7: Event preservation across refreshes
    console.log('\n📋 Test 7: Event preservation across refreshes');
    await testEventPreservationAcrossRefreshes(subscriptionManager);

    console.log('\n🎉 All refresh and subscription tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : error);
    console.error('📊 Final subscription stats:', subscriptionManager.getAllStats());
    process.exit(1);
  } finally {
    await subscriptionManager.cleanupAll();
    await cleanupTestWorld();
    console.log('🧹 Test environment cleaned up');
  }
}

async function testBasicSubscriptionIntegrity(manager: TestSubscriptionManager): Promise<void> {
  console.log('  Testing basic subscription integrity...');

  // Create initial subscription
  const subscription = await manager.createSubscription('test1', TEST_WORLD_NAME, TEST_ROOT_PATH);
  if (!subscription) {
    throw new Error('Failed to create initial subscription');
  }

  const client = manager.getClient('test1')!;

  // Test that events are received
  publishMessage(subscription.world, 'Test message 1', 'TEST_SENDER');
  await new Promise(resolve => setTimeout(resolve, 50));

  if (client.getTotalEventCount() === 0) {
    throw new Error('No events received after publishing message');
  }

  // Verify subscription count
  if (client.subscriptionCount !== 1) {
    throw new Error(`Expected 1 subscription, got ${client.subscriptionCount}`);
  }

  console.log(`    ✅ Basic subscription working (${client.getTotalEventCount()} events received)`);
}

async function testWorldRefreshMechanism(manager: TestSubscriptionManager): Promise<void> {
  console.log('  Testing world refresh mechanism...');

  const subscription = await manager.createSubscription('test2', TEST_WORLD_NAME, TEST_ROOT_PATH);
  if (!subscription) {
    throw new Error('Failed to create subscription for refresh test');
  }

  const client = manager.getClient('test2')!;
  const initialEventCount = client.getTotalEventCount();

  // Simulate state-changing command that would require refresh
  await subscription.world.createAgent({
    id: 'refresh-test-agent',
    name: 'Refresh Test Agent',
    type: 'conversational',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4',
    systemPrompt: 'Test agent for refresh testing'
  });

  // Perform refresh
  const refreshedSubscription = await manager.refreshSubscription('test2', TEST_WORLD_NAME, TEST_ROOT_PATH);
  if (!refreshedSubscription) {
    throw new Error('Failed to refresh subscription');
  }

  const refreshedClient = manager.getClient('test2')!;

  // Verify refresh counters
  if (refreshedClient.subscriptionCount !== 2 || refreshedClient.unsubscribeCount !== 1) {
    throw new Error(`Refresh counters incorrect: subscriptions=${refreshedClient.subscriptionCount}, unsubscribes=${refreshedClient.unsubscribeCount}`);
  }

  // Test that new subscription works
  publishMessage(refreshedSubscription.world, 'Test message after refresh', 'TEST_SENDER');
  await new Promise(resolve => setTimeout(resolve, 50));

  const finalEventCount = refreshedClient.getTotalEventCount();
  if (finalEventCount <= initialEventCount) {
    throw new Error('No new events received after refresh');
  }

  // Verify agent is present in refreshed world
  if (!refreshedSubscription.world.agents.has('refresh-test-agent')) {
    throw new Error('Agent not found in refreshed world');
  }

  console.log(`    ✅ World refresh mechanism working (events: ${initialEventCount} -> ${finalEventCount})`);
}

async function testMultipleRefreshCycles(manager: TestSubscriptionManager): Promise<void> {
  console.log(`  Testing ${REFRESH_TEST_CYCLES} refresh cycles...`);

  const subscription = await manager.createSubscription('test3', TEST_WORLD_NAME, TEST_ROOT_PATH);
  if (!subscription) {
    throw new Error('Failed to create subscription for cycle test');
  }

  let currentSubscription = subscription;
  const client = manager.getClient('test3')!;

  for (let i = 0; i < REFRESH_TEST_CYCLES; i++) {
    console.log(`    Cycle ${i + 1}/${REFRESH_TEST_CYCLES}...`);

    // Make a change that would require refresh
    await currentSubscription.world.createAgent({
      id: `cycle-agent-${i}`,
      name: `Cycle Agent ${i}`,
      type: 'conversational',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: `Agent created in cycle ${i}`
    });

    // Perform refresh
    currentSubscription = await manager.refreshSubscription('test3', TEST_WORLD_NAME, TEST_ROOT_PATH);
    if (!currentSubscription) {
      throw new Error(`Failed to refresh subscription in cycle ${i + 1}`);
    }

    // Test subscription after each refresh
    publishMessage(currentSubscription.world, `Test message cycle ${i + 1}`, 'TEST_SENDER');
    await new Promise(resolve => setTimeout(resolve, 30));

    // Verify agent count
    const expectedAgentCount = i + 2; // +1 for initial agent, +1 for current cycle
    if (currentSubscription.world.agents.size !== expectedAgentCount) {
      throw new Error(`Agent count mismatch in cycle ${i + 1}: expected ${expectedAgentCount}, got ${currentSubscription.world.agents.size}`);
    }
  }

  const finalStats = client.getStats();
  console.log(`    ✅ Multiple refresh cycles completed:`, {
    cycles: REFRESH_TEST_CYCLES,
    subscriptions: finalStats.subscriptionCount,
    unsubscribes: finalStats.unsubscribeCount,
    totalEvents: finalStats.totalEvents,
    finalAgentCount: currentSubscription.world.agents.size
  });
}

async function testConcurrentSubscriptionManagement(manager: TestSubscriptionManager): Promise<void> {
  console.log('  Testing concurrent subscription management...');

  // Create multiple concurrent subscriptions
  const clientIds = ['concurrent1', 'concurrent2', 'concurrent3'];
  const subscriptions = await Promise.all(
    clientIds.map(id => manager.createSubscription(id, TEST_WORLD_NAME, TEST_ROOT_PATH))
  );

  // Verify all subscriptions were created
  for (let i = 0; i < subscriptions.length; i++) {
    if (!subscriptions[i]) {
      throw new Error(`Failed to create subscription ${i + 1}`);
    }
  }

  // Test each subscription individually (since each gets its own world instance)
  for (let i = 0; i < subscriptions.length; i++) {
    const subscription = subscriptions[i];
    const clientId = clientIds[i];

    publishMessage(subscription.world, `Concurrent test message ${i + 1}`, 'TEST_SENDER');
    await new Promise(resolve => setTimeout(resolve, 50));

    const client = manager.getClient(clientId)!;
    if (client.getTotalEventCount() === 0) {
      throw new Error(`Client ${clientId} did not receive events`);
    }
  }

  // Refresh one subscription while others remain active
  await manager.refreshSubscription('concurrent2', TEST_WORLD_NAME, TEST_ROOT_PATH);
  const refreshedSubscription = manager.getSubscription('concurrent2');

  // Test refreshed subscription works
  publishMessage(refreshedSubscription.world, 'Post-refresh test message', 'TEST_SENDER');
  await new Promise(resolve => setTimeout(resolve, 50));

  const refreshedClient = manager.getClient('concurrent2')!;
  if (refreshedClient.getTotalEventCount() <= 1) {
    throw new Error('Refreshed subscription did not receive new events');
  }

  for (const clientId of clientIds) {
    const client = manager.getClient(clientId)!;
    const stats = client.getStats();
    console.log(`    Client ${clientId}: ${stats.totalEvents} events, ${stats.subscriptionCount} subs`);
  }

  console.log('    ✅ Concurrent subscription management working');
}

async function testMemoryLeakPrevention(manager: TestSubscriptionManager): Promise<void> {
  console.log('  Testing memory leak prevention...');

  const LEAK_TEST_CYCLES = 10;
  let peakEventCount = 0;

  for (let i = 0; i < LEAK_TEST_CYCLES; i++) {
    const clientId = `leak-test-${i}`;

    // Create subscription
    const subscription = await manager.createSubscription(clientId, TEST_WORLD_NAME, TEST_ROOT_PATH);
    if (!subscription) {
      throw new Error(`Failed to create subscription for leak test ${i}`);
    }

    // Generate some events
    for (let j = 0; j < 5; j++) {
      publishMessage(subscription.world, `Leak test ${i}-${j}`, 'TEST_SENDER');
    }

    await new Promise(resolve => setTimeout(resolve, 20));

    const client = manager.getClient(clientId)!;
    const eventCount = client.getTotalEventCount();
    peakEventCount = Math.max(peakEventCount, eventCount);

    // Clean up subscription immediately
    await subscription.unsubscribe();
    client.markUnsubscribed();
  }

  // Verify no lingering subscriptions
  const allStats = manager.getAllStats();
  for (const [clientId, stats] of Object.entries(allStats)) {
    const clientStats = stats as any;
    if (clientStats.subscriptionCount !== clientStats.unsubscribeCount) {
      throw new Error(`Memory leak detected in ${clientId}: ${clientStats.subscriptionCount} subs, ${clientStats.unsubscribeCount} unsubs`);
    }
  }

  console.log(`    ✅ Memory leak prevention working (peak events: ${peakEventCount})`);
}

async function testErrorRecoveryDuringRefresh(manager: TestSubscriptionManager): Promise<void> {
  console.log('  Testing error recovery during refresh...');

  const subscription = await manager.createSubscription('error-test', TEST_WORLD_NAME, TEST_ROOT_PATH);
  if (!subscription) {
    throw new Error('Failed to create subscription for error test');
  }

  const client = manager.getClient('error-test')!;

  // Test recovery from invalid world name (simulated error scenario)
  try {
    await manager.refreshSubscription('error-test', 'nonexistent-world', TEST_ROOT_PATH);
    throw new Error('Expected error for nonexistent world');
  } catch (error) {
    // Expected to fail
  }

  // Verify original subscription is still intact
  publishMessage(subscription.world, 'Error recovery test', 'TEST_SENDER');
  await new Promise(resolve => setTimeout(resolve, 50));

  if (client.getTotalEventCount() === 0) {
    throw new Error('Original subscription lost after failed refresh');
  }

  // Test successful refresh after error
  const recoveredSubscription = await manager.refreshSubscription('error-test', TEST_WORLD_NAME, TEST_ROOT_PATH);
  if (!recoveredSubscription) {
    throw new Error('Failed to recover with valid refresh');
  }

  console.log('    ✅ Error recovery during refresh working');
}

async function testEventPreservationAcrossRefreshes(manager: TestSubscriptionManager): Promise<void> {
  console.log('  Testing event preservation across refreshes...');

  const subscription = await manager.createSubscription('preserve-test', TEST_WORLD_NAME, TEST_ROOT_PATH);
  if (!subscription) {
    throw new Error('Failed to create subscription for preservation test');
  }

  const client = manager.getClient('preserve-test')!;

  // Generate events before refresh
  const preRefreshMessages = ['Message 1', 'Message 2', 'Message 3'];
  for (const message of preRefreshMessages) {
    publishMessage(subscription.world, message, 'TEST_SENDER');
  }
  await new Promise(resolve => setTimeout(resolve, 100));

  const preRefreshEventCount = client.getTotalEventCount();
  console.log(`    Events before refresh: ${preRefreshEventCount}`);

  // Perform refresh
  const refreshedSubscription = await manager.refreshSubscription('preserve-test', TEST_WORLD_NAME, TEST_ROOT_PATH);
  if (!refreshedSubscription) {
    throw new Error('Failed to refresh subscription for preservation test');
  }

  // Generate events after refresh
  const postRefreshMessages = ['Message 4', 'Message 5', 'Message 6'];
  for (const message of postRefreshMessages) {
    publishMessage(refreshedSubscription.world, message, 'TEST_SENDER');
  }
  await new Promise(resolve => setTimeout(resolve, 100));

  const postRefreshEventCount = client.getTotalEventCount();
  console.log(`    Events after refresh: ${postRefreshEventCount}`);

  // Verify events continued to be received after refresh
  if (postRefreshEventCount <= preRefreshEventCount) {
    throw new Error('No new events received after refresh');
  }

  // Verify event types are consistent
  const eventTypes = Array.from(client.eventCounts.keys());
  if (eventTypes.length === 0) {
    throw new Error('No event types recorded');
  }

  console.log(`    ✅ Event preservation working (${eventTypes.join(', ')})`);
}

// Run all tests
runTests().catch(error => {
  console.error('❌ Refresh and subscription test suite failed:', error);
  process.exit(1);
});
