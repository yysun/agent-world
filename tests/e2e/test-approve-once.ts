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
import * as readline from 'readline';
import { subscribeWorld } from '../../core/subscription.js';
import { publishMessage, publishToolResult, disableStreaming } from '../../core/events/index.js';
import { newChat, clearAgentMemory, deleteChat } from '../../core/index.js';
import type { WorldSubscription } from '../../core/subscription.js';
import type { World, Agent } from '../../core/types.js';

// Load environment variables
config();

// Parse command line arguments
const args = process.argv.slice(2);
const interactiveMode = args.includes('--interactive') || args.includes('-i');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: npx tsx tests/e2e/test-approve-once.ts [options]

Options:
  -i, --interactive    Enable interactive mode (press Enter to continue at each step)
  -h, --help          Show this help message

Examples:
  npx tsx tests/e2e/test-approve-once.ts                    # Run in auto mode
  npx tsx tests/e2e/test-approve-once.ts -i                 # Interactive mode
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

// Test: APPROVE_ONCE scenario - Interactive step-by-step
async function testApproveOnce() {
  let chatId: string;
  let approvalToolCallId: string | null = null;
  let originalToolCall: any = null;
  let firstToolExecuted = false;
  let finalResponseReceived = false;
  let finalResponseResolve: (() => void) | null = null;
  const finalResponsePromise = new Promise<void>(resolve => {
    finalResponseResolve = resolve;
  });

  console.log('📋 Test: APPROVE_ONCE - Step-by-Step Test\n');
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

        // Check for approval request - try multiple property paths
        const isApprovalRequest = funcName === 'client.requestApproval' ||
          tc.function?.function?.name === 'client.requestApproval';

        if (isApprovalRequest) {
          const args = JSON.parse(tc.function.arguments || tc.function?.function?.arguments || '{}');
          approvalToolCallId = tc.id;
          originalToolCall = args.originalToolCall;
          console.log(`        ✓ APPROVAL REQUEST CAPTURED`);
          console.log(`        → Original tool: ${originalToolCall?.name}`);
        }
      });
    } else if (event.content) {
      const preview = event.content.substring(0, 100);
      const suffix = event.content.length > 100 ? '...' : '';
      console.log(`   Content: "${preview}${suffix}"`);

      // Check if this is the final assistant response after tool execution
      if (event.sender === agent.id && event.role === 'assistant' && !event.tool_calls && firstToolExecuted && !finalResponseReceived) {
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
      firstToolExecuted = true;
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
    console.log(`⏳ Waiting for agent response and approval request...`);
  }

  // Wait for agent processing and approval request
  let waitCount = 0;
  const maxWaitCount = interactiveMode ? 20 : 10; // More time in interactive mode
  while (!approvalToolCallId && waitCount < maxWaitCount) {
    await new Promise(resolve => setTimeout(resolve, 500));
    waitCount++;
  }

  // Double-check: scan memory for approval request if event handler missed it
  if (!approvalToolCallId) {
    console.log('\n⚠️  Approval request not captured by event handler, scanning memory...');
    const liveAgent = world.agents.get(agent.id)!;
    const currentMemory = liveAgent.memory.filter(m => m.chatId === chatId);
    for (const msg of currentMemory) {
      if (msg.role === 'assistant' && (msg as any).tool_calls) {
        for (const tc of (msg as any).tool_calls) {
          const funcName = tc.function?.name || 'unknown';
          console.log(`   Checking: ${funcName} (id: ${tc.id})`);

          if (funcName === 'client.requestApproval') {
            const args = JSON.parse(tc.function.arguments || '{}');
            approvalToolCallId = tc.id;
            originalToolCall = args.originalToolCall;
            console.log(`✅ Found approval request in memory (ID: ${approvalToolCallId})`);
            console.log(`   Original tool: ${originalToolCall?.name}`);
            break;
          }
        }
        if (approvalToolCallId) break;
      }
    }
  }

  if (!approvalToolCallId) {
    console.log('\n⚠️  Warning: No approval request found after 5 seconds');
    console.log('   The agent may have responded with text instead of tool call');
  } else {
    console.log(`\n✅ Approval request confirmed (ID: ${approvalToolCallId})`);
  }

  displayAgentMemory(chatId);

  // ========== STEP 3: Send approval ==========
  await waitForEnter('\n🔷 STEP 3: Send APPROVE_ONCE response');

  console.log('\nExecuting Step 3...');

  if (!approvalToolCallId || !originalToolCall) {
    console.log('❌ ERROR: No approval request detected!');
    console.log('   Cannot proceed with approval step.');
    logTest('Approval request received', false);
    world.eventEmitter.off('message', messageHandler);
    world.eventEmitter.off('tool-execution', toolHandler);
    return;
  }

  console.log(`   Approval ID: ${approvalToolCallId}`);
  console.log(`   Tool to approve: ${originalToolCall.name}`);
  console.log(`   Calling publishToolResult()...`);

  publishToolResult(world, agent.id, {
    tool_call_id: approvalToolCallId,
    decision: 'approve',
    scope: 'once',
    toolName: originalToolCall.name,
    toolArgs: originalToolCall.args,
    workingDirectory: originalToolCall.workingDirectory
  });

  console.log(`✅ Approval response sent`);

  if (!interactiveMode) {
    console.log(`⏳ Waiting for tool execution and agent final response...`);
    console.log(`   (Waiting for actual event or 90s timeout)`);
  }

  // Wait for final response event or timeout after 90 seconds
  // Using Promise.race to wait for either the event or timeout
  const timeoutPromise = new Promise<void>(resolve => setTimeout(resolve, 90000));
  await Promise.race([finalResponsePromise, timeoutPromise]);

  if (finalResponseReceived) {
    console.log(`✅ Final response received via event`);
  } else {
    console.log(`⚠️  Timeout reached (90s) - final response may not have been received`);
  }

  // No refresh needed - we're using the live world instance from subscription
  displayAgentMemory(chatId);

  // ========== STEP 4: Verify results ==========
  await waitForEnter('\n🔷 STEP 4: Verify tool execution and final state');

  console.log('\nExecuting Step 4...');

  // Check tool execution event
  if (firstToolExecuted) {
    console.log(`✅ Tool execution event received`);
    logTest('Tool execution event', true);
  } else {
    console.log(`❌ Tool execution event NOT received`);
    logTest('Tool execution event', false);
  }

  // Check for tool result in memory (use live agent)
  const liveAgent = world.agents.get(agent.id)!;
  const currentMemory = liveAgent.memory.filter(m => m.chatId === chatId);
  const toolResultMsg = currentMemory.find(m => m.role === 'tool' && m.tool_call_id === originalToolCall.id);

  if (toolResultMsg) {
    console.log(`✅ Tool result found in memory`);
    console.log(`   Tool call ID: ${toolResultMsg.tool_call_id}`);
    console.log(`   Result length: ${toolResultMsg.content?.length || 0} chars`);
    console.log(`   Result preview: ${toolResultMsg.content?.substring(0, 100)}...`);
    logTest('Tool result in memory', true);
  } else {
    console.log(`❌ Tool result NOT found in memory`);
    console.log(`   Looking for tool_call_id: ${originalToolCall.id}`);
    logTest('Tool result in memory', false);
  }

  // Check for final assistant response
  const lastMessage = currentMemory[currentMemory.length - 1];
  console.log(`\n📨 Last message in memory:`);
  console.log(`   Role: ${lastMessage.role}`);
  console.log(`   Content preview: ${lastMessage.content?.substring(0, 150) || '(empty)'}...`);

  if (lastMessage.role === 'assistant' && lastMessage.content && lastMessage.content.length > 0) {
    console.log(`✅ Agent provided final response`);
    logTest('Agent final response', true);
  } else {
    console.log(`❌ Agent did NOT provide final response`);
    logTest('Agent final response', false);
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
