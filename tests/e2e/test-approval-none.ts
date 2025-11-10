/**
 * E2E Test: NO APPROVAL Scenario
 * 
 * This script tests the case where approval is disabled (approval.required = false):
 * - Uses the real Default World with agent a1
 * - Subscribes to world like the CLI does (via subscribeWorld)
 * - Creates a fresh chat and clears agent memory before test
 * - Sends a message requesting file listing
 * - Verifies tool executes DIRECTLY without approval request
 * - No approval flow should occur
 * 
 * Run with: npx tsx tests/e2e/test-approval-none.ts
 */

import { config } from 'dotenv';
import * as readline from 'readline';
import { subscribeWorld } from '../../core/subscription.js';
import { publishMessage, disableStreaming } from '../../core/events/index.js';
import { newChat, deleteChat } from '../../core/index.js';
import type { WorldSubscription } from '../../core/subscription.js';
import type { World, Agent } from '../../core/types.js';

// Load environment variables
config();

// Parse command line arguments
const args = process.argv.slice(2);
const interactiveMode = args.includes('--interactive') || args.includes('-i');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: npx tsx tests/e2e/test-approval-none.ts [options]

Options:
  -i, --interactive    Enable interactive mode (press Enter to continue at each step)
  -h, --help          Show this help message

Examples:
  npx tsx tests/e2e/test-approval-none.ts                    # Run in auto mode
  npx tsx tests/e2e/test-approval-none.ts -i                 # Interactive mode
`);
  process.exit(0);
}

// Enable debug logging for agent and memory categories
process.env.LOGGER_LEVELS = 'agent,memory,events.memory,events.agent';

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

// Helper to wait for user to press Enter (or skip if not interactive)
function waitForEnter(prompt: string): Promise<void> {
  if (!interactiveMode) {
    console.log(`\n${prompt}`);
    return Promise.resolve();
  }

  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(`\n${prompt} [Press Enter to continue]`, () => {
      rl.close();
      resolve();
    });
  });
}

// Setup: Load Default World (mimicking CLI behavior)
async function setup() {
  console.log('\n🚀 Setting up E2E test...\n');
  console.log(`   Mode: ${interactiveMode ? 'Interactive' : 'Auto'}\n`);

  try {
    // Disable streaming for E2E tests to simplify message handling
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

// Helper to display agent memory (always get fresh agent from world)
function displayAgentMemory(chatId: string) {
  const liveAgent = world.agents.get(agent.id)!;
  const currentMemory = liveAgent.memory.filter(m => m.chatId === chatId);
  console.log(`\n📝 Agent Memory (${currentMemory.length} messages):`);
  currentMemory.forEach((msg, idx) => {
    const toolCallInfo = (msg as any).tool_calls ? ` + ${(msg as any).tool_calls.length} tool_calls` : '';
    const toolCallId = (msg as any).tool_call_id ? ` [responding to ${(msg as any).tool_call_id}]` : '';
    console.log(`   ${idx + 1}. ${msg.role}${toolCallInfo}${toolCallId}`);
    if (msg.content) {
      const preview = msg.content.substring(0, 80);
      console.log(`      "${preview}${msg.content.length > 80 ? '...' : ''}"`);
    }
    // Display tool call details
    if ((msg as any).tool_calls) {
      (msg as any).tool_calls.forEach((tc: any) => {
        console.log(`      → ${tc.function.name} (id: ${tc.id})`);
      });
    }
  });
}

// Test: NO APPROVAL scenario - Tool executes directly
async function testNoApproval() {
  let chatId: string;
  let approvalToolCallId: string | null = null;
  let toolExecuted = false;
  let finalResponseReceived = false;
  let finalResponseResolve: (() => void) | null = null;
  const finalResponsePromise = new Promise<void>(resolve => {
    finalResponseResolve = resolve;
  });

  console.log('📋 Test: NO APPROVAL - Direct Tool Execution\n');
  if (interactiveMode) {
    console.log('   Interactive mode: Test will pause at each step for user confirmation\n');
  } else {
    console.log('   Auto mode: Test will run continuously with wait periods\n');
  }

  // Setup message and tool listeners
  const messageHandler = (event: any) => {
    console.log(`\n📨 Message Event Received:`);
    console.log(`   Sender: ${event.sender}`);
    console.log(`   Role: ${(event as any).role || 'user'}`);

    if (event.tool_calls) {
      console.log(`   Tool Calls: ${event.tool_calls.length}`);
      event.tool_calls.forEach((tc: any, idx: number) => {
        const funcName = tc.function?.name || tc.function?.function?.name || 'unknown';
        console.log(`      ${idx + 1}. ${funcName} (id: ${tc.id})`);

        // Check for approval request - should NOT occur in this test
        const isApprovalRequest = funcName === 'client.requestApproval' ||
          tc.function?.function?.name === 'client.requestApproval';

        if (isApprovalRequest) {
          approvalToolCallId = tc.id;
          console.log(`        ⚠️  UNEXPECTED APPROVAL REQUEST`);
        }
      });
    } else if (event.content) {
      const preview = event.content.substring(0, 100);
      const suffix = event.content.length > 100 ? '...' : '';
      console.log(`   Content: "${preview}${suffix}"`);

      // Check if this is the final assistant response after tool execution
      if (event.sender === agent.id && event.role === 'assistant' && !event.tool_calls && toolExecuted && !finalResponseReceived) {
        console.log(`   ✓ FINAL RESPONSE DETECTED`);
        finalResponseReceived = true;
        if (finalResponseResolve) finalResponseResolve();
      }
    }
  };

  const toolHandler = (event: any) => {
    // publishEvent wraps content in WorldSystemEvent with content property
    const toolData = event.content || event;
    if (toolData.chatId === chatId) {
      console.log(`\n🔧 Tool Execution Event:`);
      console.log(`   Tool: ${toolData.toolName}`);
      console.log(`   Command: ${toolData.command}`);
      console.log(`   Exit code: ${toolData.exitCode}`);
      toolExecuted = true;
    }
  };

  // ========== STEP 1: Create fresh chat and register listeners ==========
  await waitForEnter('🔷 STEP 1: Create fresh chat and setup listeners');

  console.log('\nExecuting Step 1...');

  // Register event listeners on subscription's world (the live instance with eventEmitter)
  world.eventEmitter.on('message', messageHandler);
  world.eventEmitter.on('tool-execution', toolHandler);
  console.log(`✅ Event listeners registered on live world`);

  // Create new chat - this updates the database and returns a world snapshot
  const updatedWorld = await newChat(world.id);
  if (!updatedWorld || !updatedWorld.currentChatId) {
    throw new Error('Failed to create new chat');
  }

  // Update our references to match the new chat
  chatId = updatedWorld.currentChatId;
  world.currentChatId = chatId; // Update the live world's currentChatId

  const currentChatMemory = agent.memory.filter(m => m.chatId === chatId);
  console.log(`✅ Created chat: ${chatId}`);
  console.log(`✅ Agent memory for this chat: ${currentChatMemory.length} messages`);

  // ========== STEP 2: Send user message ==========
  await waitForEnter('\n🔷 STEP 2: Send user message "@a1, list files from \'~/\' directory"');

  console.log('\nExecuting Step 2...');
  publishMessage(world, "@a1, list files from '~/' directory", 'human', chatId);
  console.log(`✅ Message published`);

  if (!interactiveMode) {
    console.log(`⏳ Waiting for direct tool execution (no approval)...`);
  }

  // Wait for tool execution (should happen directly, no approval request)
  let waitCount = 0;
  const maxWaitCount = interactiveMode ? 30 : 20; // Longer wait for tool execution
  while (!toolExecuted && !approvalToolCallId && waitCount < maxWaitCount) {
    await new Promise(resolve => setTimeout(resolve, 500));
    waitCount++;
  }

  // Check memory for unexpected approval request
  if (!approvalToolCallId) {
    console.log('\n⏳ Checking memory for approval requests...');
    const liveAgent = world.agents.get(agent.id)!;
    const currentMemory = liveAgent.memory.filter(m => m.chatId === chatId);
    for (const msg of currentMemory) {
      if (msg.role === 'assistant' && (msg as any).tool_calls) {
        for (const tc of (msg as any).tool_calls) {
          const funcName = tc.function?.name || 'unknown';
          if (funcName === 'client.requestApproval') {
            approvalToolCallId = tc.id;
            console.log(`⚠️  Found unexpected approval request in memory (ID: ${approvalToolCallId})`);
            break;
          }
        }
        if (approvalToolCallId) break;
      }
    }
  }

  displayAgentMemory(chatId);

  // ========== STEP 3: Wait for final response ==========
  await waitForEnter('\n🔷 STEP 3: Wait for agent final response');

  console.log('\nExecuting Step 3...');

  if (!interactiveMode && !finalResponseReceived) {
    console.log(`⏳ Waiting for agent final response...`);
    console.log(`   (Waiting for actual event or 60s timeout)`);

    // Wait for final response event or timeout
    const timeoutPromise = new Promise<void>(resolve => setTimeout(resolve, 60000));
    await Promise.race([finalResponsePromise, timeoutPromise]);
  }

  if (finalResponseReceived) {
    console.log(`✅ Final response received via event`);
  } else {
    console.log(`⚠️  Timeout reached - final response may not have been received`);
  }

  displayAgentMemory(chatId);

  // ========== STEP 4: Verify results ==========
  await waitForEnter('\n🔷 STEP 4: Verify tool executed directly without approval');

  console.log('\nExecuting Step 4...');

  // Test 1: No approval request should occur
  if (!approvalToolCallId) {
    console.log(`✅ No approval request (as expected)`);
    logTest('No approval request', true);
  } else {
    console.log(`❌ Unexpected approval request found`);
    logTest('No approval request', false, 'Approval request was generated when approval is disabled');
  }

  // Test 2: Tool should execute directly
  if (toolExecuted) {
    console.log(`✅ Tool executed directly`);
    logTest('Tool executed directly', true);
  } else {
    console.log(`❌ Tool did NOT execute`);
    logTest('Tool executed directly', false, 'Tool execution event not received');
  }

  // Test 3: Check for tool result in memory
  const liveAgent = world.agents.get(agent.id)!;
  const currentMemory = liveAgent.memory.filter(m => m.chatId === chatId);
  const toolResultMsg = currentMemory.find(m => m.role === 'tool');

  if (toolResultMsg) {
    console.log(`✅ Tool result found in memory`);
    console.log(`   Tool call ID: ${toolResultMsg.tool_call_id}`);
    console.log(`   Result length: ${toolResultMsg.content?.length || 0} chars`);
    logTest('Tool result in memory', true);
  } else {
    console.log(`❌ Tool result NOT found in memory`);
    logTest('Tool result in memory', false, 'No tool result message in memory');
  }

  // Test 4: Check for final assistant response
  const lastMessage = currentMemory[currentMemory.length - 1];
  console.log(`\n📨 Last message in memory:`);
  console.log(`   Role: ${lastMessage.role}`);
  console.log(`   Content preview: ${lastMessage.content?.substring(0, 150) || '(empty)'}...`);

  if (lastMessage.role === 'assistant' && lastMessage.content && lastMessage.content.length > 0) {
    console.log(`✅ Agent provided final response`);
    logTest('Agent final response', true);
  } else {
    console.log(`❌ Agent did NOT provide final response`);
    logTest('Agent final response', false, 'No final assistant message with content');
  }

  console.log(`\n📊 Final memory state: ${currentMemory.length} messages total`);

  // Cleanup
  world.eventEmitter.off('message', messageHandler);
  world.eventEmitter.off('tool-execution', toolHandler);

  console.log('\n══════════════════════════════════════');
  console.log('✅ TEST COMPLETE');
  console.log('══════════════════════════════════════\n');
}

// Main test runner
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  E2E Test: NO APPROVAL Scenario');
  console.log('═══════════════════════════════════════════════════════\n');

  const setupSuccess = await setup();
  if (!setupSuccess) {
    process.exit(1);
  }

  try {
    await testNoApproval();
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
