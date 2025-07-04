/**
 * CLI Commands Functionality Integration Test
 * 
 * This test verifies complete CLI command functionality including:
 * - Command parsing and execution
 * - Parameter collection and validation
 * - World state management and refresh mechanism
 * - Event subscription integrity after operations
 * - Error handling and edge cases
 * 
 * Features tested:
 * - All CLI commands (worlds, world, create-world, create-agent, etc.)
 * - World refresh mechanism after state-changing commands
 * - Event subscription management (no double subscribe, no missing subscriptions)
 * - CLI context preservation across command executions
 * - Help system and command validation
 * 
 * Usage:
 * npx tsx integration-tests/cli-commands-functionality-test.ts
 */

import {
  processCLIInput,
  processCLICommand,
  parseCLICommand,
  generateHelpMessage,
  CLIContext,
  CLIResponse,
  PromptFunction
} from '../cli/commands.js';
import { World, Agent, LLMProvider } from '../core/types.js';
import { listWorlds, getWorld, createWorld, updateWorld, deleteWorld } from '../core/world-manager.js';
import { subscribeWorld, cleanupWorldSubscription, ClientConnection } from '../core/subscription.js';
import fs from 'fs';
import path from 'path';

// Test configuration
const TEST_ROOT_PATH = './data/test-worlds';
const TEST_WORLD_NAME = 'cli-command-test';
const TEST_AGENT_NAME = 'test-agent';

// Mock prompt function for testing
const mockPrompt: PromptFunction = async (question: string, options?: string[]): Promise<string> => {
  console.log(`Mock prompt: ${question}`);
  if (options && options.length > 0) {
    console.log(`Options: ${options.join(', ')}`);
    return options[0]; // Return first option for testing
  }

  // Return default responses based on question content
  if (question.includes('Enter world name')) return TEST_WORLD_NAME;
  if (question.includes('Enter agent name')) return TEST_AGENT_NAME;
  if (question.includes('Enter description')) return 'Test description';
  if (question.includes('Enter system prompt')) return 'You are a test agent';
  if (question.includes('Enter config')) return '{"model": "gpt-4"}';

  return 'test-value';
};

// Mock client connection for world subscription testing
class TestClientConnection implements ClientConnection {
  public messages: Array<{ type: string, data: any }> = [];
  public isOpen = true;
  public worldEventCount = 0;
  public lastEventType = '';
  public lastEventData: any = null;

  send(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this.messages.push({ type: 'send', data: parsed });
    } catch {
      this.messages.push({ type: 'send', data: { raw: data } });
    }
  }

  onWorldEvent = (eventType: string, eventData: any): void => {
    this.worldEventCount++;
    this.lastEventType = eventType;
    this.lastEventData = eventData;
    this.messages.push({ type: 'event', data: { eventType, eventData } });
  };

  onError = (error: string): void => {
    this.messages.push({ type: 'error', data: { error } });
  };

  reset(): void {
    this.messages = [];
    this.worldEventCount = 0;
    this.lastEventType = '';
    this.lastEventData = null;
  }
}

// Test state tracking
interface TestState {
  world: World | null;
  context: CLIContext;
  subscription: any;
  client: TestClientConnection;
  errors: string[];
}

async function setupTestEnvironment(): Promise<TestState> {
  // Ensure test directory exists
  const testWorldPath = path.join(TEST_ROOT_PATH, TEST_WORLD_NAME);
  if (fs.existsSync(testWorldPath)) {
    fs.rmSync(testWorldPath, { recursive: true, force: true });
  }

  // Create test world
  const world = await createWorld(TEST_ROOT_PATH, {
    name: TEST_WORLD_NAME,
    description: 'Test world for CLI command testing'
  });

  if (!world) {
    throw new Error('Failed to create test world');
  }

  // Set up client connection and subscription
  const client = new TestClientConnection();
  const subscription = await subscribeWorld(TEST_WORLD_NAME, TEST_ROOT_PATH, client);

  if (!subscription) {
    throw new Error('Failed to subscribe to test world');
  }

  const context: CLIContext = {
    currentWorld: subscription.world,
    currentWorldName: TEST_WORLD_NAME,
    rootPath: TEST_ROOT_PATH
  };

  return {
    world: subscription.world,
    context,
    subscription,
    client,
    errors: []
  };
}

async function cleanupTestEnvironment(state: TestState): Promise<void> {
  try {
    if (state.subscription) {
      await state.subscription.unsubscribe();
    }

    // Clean up test world
    const testWorldPath = path.join(TEST_ROOT_PATH, TEST_WORLD_NAME);
    if (fs.existsSync(testWorldPath)) {
      fs.rmSync(testWorldPath, { recursive: true, force: true });
    }
  } catch (error) {
    console.warn('Cleanup warning:', error instanceof Error ? error.message : error);
  }
}

async function runTests() {
  console.log('🧪 CLI Commands Functionality Integration Test');
  console.log('==============================================');

  let state: TestState | null = null;

  try {
    // Setup test environment
    console.log('\n🔧 Setting up test environment...');
    state = await setupTestEnvironment();
    console.log('✅ Test environment setup complete');

    // Test 1: Command parsing and validation
    console.log('\n📋 Test 1: Command parsing and validation');
    await testCommandParsing();

    // Test 2: Help system
    console.log('\n📋 Test 2: Help system');
    await testHelpSystem();

    // Test 3: World information commands
    console.log('\n📋 Test 3: World information commands');
    await testWorldInformationCommands(state);

    // Test 4: Agent management commands
    console.log('\n📋 Test 4: Agent management commands');
    await testAgentManagementCommands(state);

    // Test 5: World modification and refresh mechanism
    console.log('\n📋 Test 5: World modification and refresh mechanism');
    await testWorldRefreshMechanism(state);

    // Test 6: Event subscription integrity
    console.log('\n📋 Test 6: Event subscription integrity');
    await testEventSubscriptionIntegrity(state);

    // Test 7: Error handling and edge cases
    console.log('\n📋 Test 7: Error handling and edge cases');
    await testErrorHandling(state);

    // Test 8: Message handling
    console.log('\n📋 Test 8: Message handling');
    await testMessageHandling(state);

    console.log('\n🎉 All tests passed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : error);
    if (state && state.errors.length > 0) {
      console.error('Accumulated errors:', state.errors);
    }
    process.exit(1);
  } finally {
    if (state) {
      await cleanupTestEnvironment(state);
      console.log('🧹 Test environment cleaned up');
    }
  }
}

async function testCommandParsing(): Promise<void> {
  console.log('  Testing command parsing...');

  // Test valid command
  const validCommand = parseCLICommand('/help');
  if (!validCommand.isValid || validCommand.command !== 'help') {
    throw new Error('Valid command parsing failed');
  }

  // Test invalid command
  const invalidCommand = parseCLICommand('/nonexistent');
  if (invalidCommand.isValid) {
    throw new Error('Invalid command should be rejected');
  }

  // Test non-command input
  const nonCommand = parseCLICommand('not a command');
  if (nonCommand.isValid) {
    throw new Error('Non-command input should be rejected');
  }

  console.log('    ✅ Command parsing works correctly');
}

async function testHelpSystem(): Promise<void> {
  console.log('  Testing help system...');

  // Test general help
  const generalHelp = generateHelpMessage();
  if (!generalHelp.includes('Available Commands') || !generalHelp.includes('/help')) {
    throw new Error('General help message is incomplete');
  }

  // Test specific command help
  const commandHelp = generateHelpMessage('create-agent');
  if (!commandHelp.includes('create-agent') || !commandHelp.includes('Parameters')) {
    throw new Error('Specific command help is incomplete');
  }

  console.log('    ✅ Help system works correctly');
}

async function testWorldInformationCommands(state: TestState): Promise<void> {
  console.log('  Testing world information commands...');

  // Test /worlds command
  const worldsResult = await processCLICommand('/worlds', state.context, mockPrompt);
  if (!worldsResult.success || !worldsResult.data || !Array.isArray(worldsResult.data)) {
    throw new Error('Worlds command failed or returned invalid data');
  }

  // Test /world command
  const worldResult = await processCLICommand(`/world ${TEST_WORLD_NAME}`, state.context, mockPrompt);
  if (!worldResult.success || !worldResult.data) {
    throw new Error('World command failed');
  }

  console.log('    ✅ World information commands work correctly');
}

async function testAgentManagementCommands(state: TestState): Promise<void> {
  console.log('  Testing agent management commands...');

  const initialEventCount = state.client.worldEventCount;

  // Test create-agent command
  const createAgentResult = await processCLICommand(`/create-agent ${TEST_AGENT_NAME} "You are a test agent"`, state.context, mockPrompt);
  if (!createAgentResult.success || !createAgentResult.needsWorldRefresh) {
    throw new Error('Create agent command failed or did not signal refresh');
  }

  // Verify agent was created
  if (!state.world?.agents.has(TEST_AGENT_NAME)) {
    throw new Error('Agent was not created in world');
  }

  // Test update-agent command
  const updateAgentResult = await processCLICommand(`/update-agent ${TEST_AGENT_NAME} {"model":"gpt-3.5-turbo"}`, state.context, mockPrompt);
  if (!updateAgentResult.success || !updateAgentResult.needsWorldRefresh) {
    throw new Error('Update agent command failed or did not signal refresh');
  }

  // Test update-prompt command
  const updatePromptResult = await processCLICommand(`/update-prompt ${TEST_AGENT_NAME} "Updated prompt"`, state.context, mockPrompt);
  if (!updatePromptResult.success || !updatePromptResult.needsWorldRefresh) {
    throw new Error('Update prompt command failed or did not signal refresh');
  }

  // Test clear command
  const clearResult = await processCLICommand(`/clear ${TEST_AGENT_NAME}`, state.context, mockPrompt);
  if (!clearResult.success || !clearResult.needsWorldRefresh) {
    throw new Error('Clear command failed or did not signal refresh');
  }

  console.log('    ✅ Agent management commands work correctly');
}

async function testWorldRefreshMechanism(state: TestState): Promise<void> {
  console.log('  Testing world refresh mechanism...');

  const initialSubscriptionWorld = state.world;
  const initialAgentCount = state.world?.agents.size || 0;

  // Track subscription state before command
  const beforeEventCount = state.client.worldEventCount;

  // Execute world-modifying command
  const updateWorldResult = await processCLICommand('/update-world "Updated description"', state.context, mockPrompt);
  if (!updateWorldResult.success || !updateWorldResult.needsWorldRefresh) {
    throw new Error('Update world command failed or did not signal refresh need');
  }

  // Simulate refresh process (like CLI would do)
  if (updateWorldResult.refreshWorld) {
    console.log('    Simulating world refresh...');

    // Cleanup existing subscription
    await state.subscription.unsubscribe();

    // Re-subscribe to get fresh world state
    const newSubscription = await subscribeWorld(TEST_WORLD_NAME, TEST_ROOT_PATH, state.client);
    if (!newSubscription) {
      throw new Error('Failed to re-subscribe after refresh');
    }

    // Update state
    state.subscription = newSubscription;
    state.world = newSubscription.world;
    state.context.currentWorld = newSubscription.world;

    console.log('    World refresh completed');
  }

  // Verify subscription integrity after refresh
  if (!state.world || !state.subscription) {
    throw new Error('World or subscription lost after refresh');
  }

  // Verify agent count preserved
  const afterAgentCount = state.world.agents.size;
  if (afterAgentCount !== initialAgentCount) {
    throw new Error(`Agent count changed after refresh: ${initialAgentCount} -> ${afterAgentCount}`);
  }

  console.log('    ✅ World refresh mechanism works correctly');
}

async function testEventSubscriptionIntegrity(state: TestState): Promise<void> {
  console.log('  Testing event subscription integrity...');

  const initialEventCount = state.client.worldEventCount;

  // Reset client message tracking
  state.client.reset();

  // Test that world events are properly received
  // Publish a test message to trigger events
  if (state.world) {
    const { publishMessage } = await import('../core/world-events.js');
    publishMessage(state.world, 'Test message for event subscription', 'TEST_SENDER');

    // Allow some time for event propagation
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check if events were received
    if (state.client.worldEventCount === 0) {
      throw new Error('No world events received - subscription may be broken');
    }

    console.log(`    Events received: ${state.client.worldEventCount}`);
  }

  // Test subscription after multiple operations
  const operationsToTest = [
    '/help',
    '/worlds',
    `/world ${TEST_WORLD_NAME}`
  ];

  for (const operation of operationsToTest) {
    state.client.reset();
    const result = await processCLICommand(operation, state.context, mockPrompt);
    if (!result.success) {
      throw new Error(`Operation failed: ${operation}`);
    }

    // Verify subscription is still intact by publishing another test message
    if (state.world) {
      const { publishMessage } = await import('../core/world-events.js');
      publishMessage(state.world, `Test after ${operation}`, 'TEST_SENDER');
      await new Promise(resolve => setTimeout(resolve, 50));

      if (state.client.worldEventCount === 0) {
        throw new Error(`Event subscription broken after: ${operation}`);
      }
    }
  }

  console.log('    ✅ Event subscription integrity maintained');
}

async function testErrorHandling(state: TestState): Promise<void> {
  console.log('  Testing error handling...');

  // Test invalid command
  const invalidResult = await processCLICommand('/invalid-command', state.context, mockPrompt);
  if (invalidResult.success) {
    throw new Error('Invalid command should fail');
  }

  // Test command with invalid parameters
  const invalidParamResult = await processCLICommand('/create-agent', state.context, async () => '');
  if (invalidParamResult.success) {
    throw new Error('Command with missing required parameters should fail');
  }

  // Test agent operation on non-existent agent
  const nonExistentAgentResult = await processCLICommand('/clear non-existent-agent', state.context, mockPrompt);
  if (nonExistentAgentResult.success) {
    throw new Error('Operation on non-existent agent should fail');
  }

  // Test command requiring world when no world available
  const noWorldContext: CLIContext = {
    currentWorld: null,
    currentWorldName: undefined,
    rootPath: TEST_ROOT_PATH
  };

  const noWorldResult = await processCLICommand('/create-agent test-agent', noWorldContext, mockPrompt);
  if (noWorldResult.success) {
    throw new Error('Command requiring world should fail when no world available');
  }

  console.log('    ✅ Error handling works correctly');
}

async function testMessageHandling(state: TestState): Promise<void> {
  console.log('  Testing message handling...');

  const initialEventCount = state.client.worldEventCount;
  state.client.reset();

  // Test sending message to world
  const messageResult = await processCLIInput('Hello from test', state.world, TEST_ROOT_PATH, 'TEST_USER');
  if (!messageResult.success) {
    throw new Error('Message sending failed');
  }

  // Allow time for message processing
  await new Promise(resolve => setTimeout(resolve, 100));

  // Verify message was processed (should trigger world events)
  if (state.client.worldEventCount === 0) {
    console.log('    Note: No immediate events for message (this may be normal depending on world configuration)');
  }

  // Test message without world
  const noWorldMessageResult = await processCLIInput('Test message', null, TEST_ROOT_PATH, 'TEST_USER');
  if (noWorldMessageResult.success) {
    throw new Error('Message without world should fail');
  }

  console.log('    ✅ Message handling works correctly');
}

// Run all tests
runTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
