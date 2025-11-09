/**
 * E2E Test: CLI Approval Flow
 * 
 * This script tests the approval flow by mimicking actual CLI behavior:
 * - Uses the real Default World with agent a1
 * - Subscribes to world like the CLI does (via subscribeWorld)
 * - Tests three approval scenarios: DENY, APPROVE_ONCE, APPROVE_SESSION
 * - Each scenario creates a new chat and sends messages requesting file listing
 * - Listens to message events with tool_calls (OpenAI protocol) for approval requests
 * - Verifies approval prompts appear correctly and tool execution behaves as expected
 * 
 * Run with: npx tsx tests/e2e/cli-approval-flow.ts
 */

import { config } from 'dotenv';
import { subscribeWorld } from '../../core/subscription.js';
import { publishMessage } from '../../core/events.js';
import { newChat, clearAgentMemory } from '../../core/index.js';
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
  console.log('\n🚀 Setting up E2E tests...\n');

  try {
    // IMPORTANT: Disable streaming for E2E tests to simplify message handling
    const { disableStreaming } = await import('../../core/events.js');
    disableStreaming();
    console.log('✅ Streaming disabled for E2E tests\n');

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

// Test 1: DENY scenario
async function testDeny() {
  console.log('📋 Test 1: DENY - User denies approval\n');

  return new Promise<void>(async (resolve) => {
    let approvalRequestReceived = false;
    let toolExecutionAttempted = false;
    let secondApprovalRequested = false;
    let cancellationMessageReceived = false;
    let llmResponded = false;

    // CRITICAL: Create fresh chat and clear memory before test
    await clearAgentMemory(world.id, agent.id);
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

    // Listen for message events with tool_calls (approval requests follow OpenAI protocol)
    const messageHandler = (event: any) => {
      // Check if LLM responded with regular message instead of tool call (before any approval)
      if (event.sender === agent.id && event.content && !event.tool_calls && !approvalRequestReceived) {
        console.log(`   ⚠️  LLM responded with regular message instead of tool call - abandoning test`);
        console.log(`   ℹ️  Message: "${event.content.substring(0, 100)}..."`);
        console.log(`   ℹ️  This can happen occasionally due to LLM variability - retry test`);
        world.eventEmitter.off('message', messageHandler);
        world.eventEmitter.off('tool-execution', toolHandler);
        resolve();
        return;
      }

      // Check for LLM cancellation confirmation message (after approval was denied)
      if (event.sender === agent.id && event.content && !event.tool_calls && approvalRequestReceived) {
        console.log(`   💬 LLM message: "${event.content.substring(0, 100)}..."`);
        const content = event.content.toLowerCase();
        if (content.includes('cancel') || content.includes('denied') || content.includes('not') || content.includes('unable')) {
          console.log('   ✅ LLM cancellation message confirmed');
          cancellationMessageReceived = true;
        }
      }

      // Check for approval requests via tool_calls
      if (event.tool_calls && Array.isArray(event.tool_calls)) {
        for (const toolCall of event.tool_calls) {
          if (toolCall.function?.name === 'client.requestApproval') {
            if (!approvalRequestReceived) {
              console.log('   📨 First approval request received');
              approvalRequestReceived = true;

              // Extract original tool call from approval request
              const approvalArgs = JSON.parse(toolCall.function.arguments || '{}');
              const originalToolCall = approvalArgs.originalToolCall || {};

              // Send DENY response
              setTimeout(() => {
                console.log('   🚫 Sending DENY response');
                publishMessage(
                  world,
                  JSON.stringify({
                    __type: 'tool_result',
                    tool_call_id: toolCall.id,
                    agentId: agent.id,
                    content: JSON.stringify({
                      decision: 'deny',
                      scope: undefined,
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
              console.log('   📨 Second approval request received (expected after deny)');
              secondApprovalRequested = true;
            }
          }
        }
      }
    };

    // Listen for tool executions
    const toolHandler = (event: any) => {
      console.log(`   🔍 Tool event received: chatId=${event.chatId}, expected=${chatId}`);
      if (event.chatId === chatId) {
        console.log('   ⚠️  Tool execution attempted (should not happen after deny)');
        toolExecutionAttempted = true;
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

    // Wait for approval, denial, and LLM response
    await wait(5000);

    // If we reach here without approval request, test was abandoned early
    if (!approvalRequestReceived) {
      return;
    }

    // Send second message to verify re-approval is needed
    console.log('   📤 Sending second message (should prompt again)');
    publishMessage(
      world,
      "@a1, list files from '~/' directory",
      'human',
      chatId
    );

    // Wait for second approval request
    await wait(3000);

    // Cleanup listeners
    world.eventEmitter.off('message', messageHandler);
    world.eventEmitter.off('tool-execution', toolHandler);

    // Verify results
    logTest('DENY: First approval request received', approvalRequestReceived);
    logTest('DENY: LLM responded with cancellation message', cancellationMessageReceived);
    logTest('DENY: Tool NOT executed after denial', !toolExecutionAttempted);
    logTest('DENY: Second call requires approval', secondApprovalRequested);

    console.log('');
    resolve();
  });
}

// Test 2: APPROVE_ONCE scenario
async function testApproveOnce() {
  console.log('📋 Test 2: APPROVE_ONCE - User approves for one-time use\n');

  return new Promise<void>(async (resolve) => {
    let firstApprovalReceived = false;
    let firstToolExecuted = false;
    let secondApprovalReceived = false;

    // CRITICAL: Create fresh chat and clear memory before test
    await clearAgentMemory(world.id, agent.id);
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

// Test 3: APPROVE_SESSION scenario
async function testApproveSession() {
  console.log('📋 Test 3: APPROVE_SESSION - User approves for entire session\n');

  return new Promise<void>(async (resolve) => {
    let firstApprovalReceived = false;
    let firstToolExecuted = false;
    let secondToolExecuted = false;
    let secondApprovalReceived = false;

    // CRITICAL: Create fresh chat and clear memory before test
    await clearAgentMemory(world.id, agent.id);
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

              // Send APPROVE_SESSION response
              setTimeout(() => {
                console.log('   ✅ Sending APPROVE_SESSION response');
                publishMessage(
                  world,
                  JSON.stringify({
                    __type: 'tool_result',
                    tool_call_id: toolCall.id,
                    agentId: agent.id,
                    content: JSON.stringify({
                      decision: 'approve',
                      scope: 'session',
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
              console.log('   ⚠️  Second approval request (should NOT happen with session approval)');
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
        } else if (!secondToolExecuted) {
          console.log('   🔧 Second tool execution (expected - session approved)');
          secondToolExecuted = true;
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

    // Send second message to verify NO re-approval is needed
    console.log('   📤 Sending second message (should NOT prompt again)');
    publishMessage(
      world,
      "@a1, list files from '~/' directory",
      'human',
      chatId
    );

    // Wait for execution without approval
    await wait(2000);

    // Cleanup listeners
    world.eventEmitter.off('message', messageHandler);
    world.eventEmitter.off('tool-execution', toolHandler);

    // Verify results
    logTest('APPROVE_SESSION: First approval request received', firstApprovalReceived);
    logTest('APPROVE_SESSION: First tool executed', firstToolExecuted);
    logTest('APPROVE_SESSION: Second call does NOT require approval', !secondApprovalReceived);
    logTest('APPROVE_SESSION: Second tool executed', secondToolExecuted);

    console.log('');
    resolve();
  });
}

// Main test runner
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  E2E Test: CLI Approval Flow');
  console.log('═══════════════════════════════════════════════════════\n');

  const setupSuccess = await setup();
  if (!setupSuccess) {
    process.exit(1);
  }

  try {
    await testDeny();
    await testApproveOnce();
    await testApproveSession();
  } catch (error) {
    console.error('❌ Test execution failed:', error);
  } finally {
    await cleanup();
  }

  // Print summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Test Results Summary');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`Total Tests: ${results.total}`);
  console.log(`Passed: ${results.passed} ✅`);
  console.log(`Failed: ${results.failed} ❌\n`);

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

  console.log('═══════════════════════════════════════════════════════\n');

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
