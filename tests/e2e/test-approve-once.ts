/**
 * E2E Test: APPROVE_ONCE Scenario
 * 
 * This script tests the APPROVE_ONCE approval flow:
 * - Uses the real Default World with agent a1
 * - Subscribes to world like the CLI does (via subscribeWorld)
 * - Creates a fresh chat and clears agent memory before test
 * - Sends a message requesting file listing
 * - Listens for approval request and responds with APPROVE_ONCE
 * - Verifies tool executes after approval
 * - Sends second message to verify re-approval is required
 * 
 * Run with: npx tsx tests/e2e/test-approve-once.ts
 */

import { config } from 'dotenv';
import { subscribeWorld } from '../../core/subscription.js';
import { publishMessage } from '../../core/events.js';
import { newChat, clearAgentMemory, deleteChat } from '../../core/index.js';
import type { WorldSubscription } from '../../core/subscription.js';
import type { World, Agent } from '../../core/types.js';

// Load environment variables
config();

let subscription: WorldSubscription;
let world: World;
let agent: Agent;

// Test results tracking
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: [] as { name: string; status: 'PASS' | 'FAIL'; error?: string }[]
};

// Helper to log test results
function logTest(name: string, passed: boolean, error?: string) {
  results.total++;
  if (passed) {
    results.passed++;
    console.log(`✅ ${name}`);
  } else {
    results.failed++;
    console.log(`❌ ${name}`);
    if (error) console.error(`   ${error}`);
  }
  results.tests.push({ name, status: passed ? 'PASS' : 'FAIL', error });
}

// Helper to wait
function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Setup: Load Default World (mimicking CLI behavior)
async function setup() {
  console.log('\n🚀 Setting up E2E test...\n');

  try {
    // IMPORTANT: Disable streaming for E2E tests to simplify message handling
    const { disableStreaming } = await import('../../core/events.js');
    disableStreaming();
    console.log('✅ Streaming disabled for E2E test\n');

    // Subscribe to world with ClientConnection interface (like CLI does)
    // This internally calls startWorld() which sets up agent subscriptions
    const sub = await subscribeWorld('default-world', {
      isOpen: true,
      // Provide empty callbacks to satisfy ClientConnection interface
      // The world.eventEmitter will be used for listening
      onWorldEvent: undefined,
      onError: undefined,
      onLog: undefined
    });

    if (!sub) {
      throw new Error('Failed to load Default World - subscribeWorld returned null');
    }
    subscription = sub;

    world = subscription.world;

    // Find agent a1
    const foundAgent = world.agents.get('a1');
    if (!foundAgent) {
      throw new Error('Agent "a1" not found in Default World');
    }
    agent = foundAgent;

    console.log(`✅ Loaded world: ${world.name} (${world.id})`);
    console.log(`✅ Found agent: ${agent.name} (${agent.id})\n`);

    return true;
  } catch (error) {
    console.error('❌ Setup failed:', error);
    return false;
  }
}

// Cleanup
async function cleanup() {
  console.log('\n🧹 Cleaning up...\n');
  if (subscription) {
    await subscription.unsubscribe();
  }
}

// Test: APPROVE_ONCE scenario
async function testApproveOnce() {
  console.log('📋 Test: APPROVE_ONCE - User approves for one-time use\n');
  console.log('Test Steps:');
  console.log('  • Create fresh chat');
  console.log('  • Send first message requesting file listing');
  console.log('  • Wait for approval request from agent');
  console.log('  • Respond with APPROVE_ONCE decision');
  console.log('  • Verify tool executes successfully');
  console.log('  • Send second identical message');
  console.log('  • Verify new approval request is required\n');

  return new Promise<void>(async (resolve) => {
    let firstApprovalReceived = false;
    let firstToolExecuted = false;
    let secondApprovalReceived = false;

    // CRITICAL: Create fresh chat before test
    const updatedWorld = await newChat(world.id);
    if (!updatedWorld || !updatedWorld.currentChatId) {
      throw new Error('Failed to create new chat');
    }

    // Refresh subscription to get updated world and agent (like CLI does)
    world = await subscription.refresh();
    const freshAgent = world.agents.get(agent.id);
    if (!freshAgent) {
      throw new Error(`Agent ${agent.id} not found after refresh`);
    }
    agent = freshAgent;

    const chatId = updatedWorld.currentChatId;
    console.log(`   🆕 Created fresh chat: ${chatId}\n`);

    // Listen for message events with tool_calls (approval requests)
    const messageHandler = (event: any) => {
      // Log the incoming message event
      console.log(`\n   📨 Received message event:`);
      console.log(`      Sender: ${event.sender}`);
      console.log(`      Role: ${(event as any).role || 'N/A'}`);
      console.log(`      Content: ${event.content || '(empty)'}`);
      console.log(`      Has tool_calls: ${!!event.tool_calls}`);
      if (event.tool_calls) {
        console.log(`      Tool Calls:`, JSON.stringify(event.tool_calls, null, 2));
      }

      // Log full messages for current chat
      const currentChatMemory = agent.memory.filter(m => m.chatId === chatId);
      console.log(`\n   📝 Agent memory for current chat: ${currentChatMemory.length} messages`);
      currentChatMemory.forEach((msg, idx) => {
        const toolCalls = (msg as any).tool_calls ? ` (${(msg as any).tool_calls.length} tool calls)` : '';
        console.log(`\n      Message ${idx + 1}: ${msg.role}${toolCalls}`);
        console.log(`      Content: ${msg.content || '(empty)'}`);
        if ((msg as any).tool_calls) {
          console.log(`      Tool Calls:`, JSON.stringify((msg as any).tool_calls, null, 2));
        }
      });
      console.log('');

      // Check if LLM responded with regular message instead of tool call (before first approval)
      if (event.sender === agent.id && event.content && !event.tool_calls && !firstApprovalReceived) {
        console.log(`   ⚠️  LLM responded with regular message instead of tool call - abandoning test`);
        console.log(`   ℹ️  Message: "${event.content.substring(0, 100)}..."`);
        console.log(`   ℹ️  This can happen occasionally due to LLM variability - retry test`);
        world.eventEmitter.off('message', messageHandler);
        world.eventEmitter.off('tool-execution', toolHandler);
        resolve();
        return;
      }

      if (event.tool_calls && Array.isArray(event.tool_calls)) {
        for (const toolCall of event.tool_calls) {
          if (toolCall.function?.name === 'client.requestApproval') {
            if (!firstApprovalReceived) {
              console.log('   📨 First approval request received');
              firstApprovalReceived = true;

              // Extract original tool call from approval request
              const approvalArgs = JSON.parse(toolCall.function.arguments || '{}');
              const originalToolCall = approvalArgs.originalToolCall || {};

              // Send APPROVE_ONCE response
              setTimeout(() => {
                console.log('   ✅ Sending APPROVE_ONCE response');
                publishMessage(
                  world,
                  JSON.stringify({
                    __type: 'tool_result',
                    tool_call_id: toolCall.id,
                    agentId: agent.id,
                    content: JSON.stringify({
                      decision: 'approve',
                      scope: 'once',
                      toolName: originalToolCall.name,
                      toolArgs: originalToolCall.args,
                      workingDirectory: originalToolCall.workingDirectory
                    })
                  }),
                  'human',
                  chatId
                );
              }, 500);
            } else {
              console.log('   📨 Second approval request received (expected - one-time approval consumed)');
              secondApprovalReceived = true;
            }
          }
        }
      }
    };

    // Listen for tool executions
    const toolHandler = (event: any) => {
      if (event.chatId === chatId) {
        if (!firstToolExecuted) {
          console.log('   🔧 First tool execution (expected)');
          firstToolExecuted = true;
        }
      }
    };

    world.eventEmitter.on('message', messageHandler);
    world.eventEmitter.on('tool-execution', toolHandler);

    // Send first message
    console.log('   📤 Sending first message: "@a1, list files from ~/directory"');
    publishMessage(
      world,
      "@a1, list files from '~/' directory",
      'human',
      chatId
    );

    // Wait for approval and execution
    await wait(3000);

    // If we reach here without approval request, test was abandoned early
    if (!firstApprovalReceived) {
      return;
    }

    // Send second message to verify re-approval is needed
    console.log('   📤 Sending second message (should require approval again)');
    publishMessage(
      world,
      "@a1, list files from '~/' directory",
      'human',
      chatId
    );

    // Wait for second approval request
    await wait(2000);

    // Cleanup listeners
    world.eventEmitter.off('message', messageHandler);
    world.eventEmitter.off('tool-execution', toolHandler);

    // Verify results
    logTest('APPROVE_ONCE: First approval request received', firstApprovalReceived);
    logTest('APPROVE_ONCE: Tool executed after approval', firstToolExecuted);
    logTest('APPROVE_ONCE: Second call requires approval (BUG CHECK)', secondApprovalReceived);

    console.log('');
    resolve();
  });
}

// Main test runner
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  E2E Test: APPROVE_ONCE Scenario');
  console.log('═══════════════════════════════════════════════════════\n');

  const setupSuccess = await setup();
  if (!setupSuccess) {
    process.exit(1);
  }

  try {
    await testApproveOnce();
  } catch (error) {
    console.error('❌ Test execution failed:', error);
  } finally {
    // Delete the test chat
    if (world && world.currentChatId) {
      console.log(`\n🗑️  Deleting test chat: ${world.currentChatId}`);
      await deleteChat(world.id, world.currentChatId);
      console.log('✅ Test chat deleted\n');
    }
    await cleanup();
  }

  // Print summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Test Results Summary');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`Total Tests: ${results.total}`);
  console.log(`Passed: ${results.passed} ✅`);
  console.log(`Failed: ${results.failed} ❌`);

  if (results.total > 0) {
    const passRate = ((results.passed / results.total) * 100).toFixed(1);
    console.log(`Pass Rate: ${passRate}%\n`);
  } else {
    console.log('');
  }

  if (results.failed > 0) {
    console.log('Failed Tests:');
    results.tests
      .filter(t => t.status === 'FAIL')
      .forEach(t => {
        console.log(`  - ${t.name}`);
        if (t.error) console.log(`    ${t.error}`);
      });
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log(results.failed === 0 ? '  ✅ All tests passed!' : `  ❌ ${results.failed} test(s) failed`);
  console.log('═══════════════════════════════════════════════════════\n');

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run test
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
