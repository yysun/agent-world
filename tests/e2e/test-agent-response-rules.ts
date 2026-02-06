/**
 * E2E Test: Agent Response Rules with Real LLM Calls
 * 
 * This test validates agent response behavior rules using real LLM API calls:
 * 1. Broadcast: All agents respond to initial human message
 * 2. Direct Mention: Only mentioned agent responds
 * 3. Paragraph Mention: Only paragraph-mentioned agent responds
 * 4. Mid-Text Mention: Stored in memory, no immediate response
 * 5. Agents Ignore Each Other: No response without mentions
 * 6. Multi-Agent Collaboration: Coordinated hand-offs via mentions
 * 7. Turn Limit: Max 5 agent turns enforced
 * 
 * Test Setup:
 * - Automatically creates fresh 'e2e-test' world with Ollama agents (a1, a2, a3)
 * - Deletes existing 'e2e-test' world if present
 * - Uses Ollama provider for consistent local testing
 * - Default model: llama3.2:3b (override with TEST_MODEL env var)
 * - World is left intact after test for inspection
 * 
 * Requirements:
 * - Ollama installed and running locally
 * - Model specified by TEST_MODEL env var (default: llama3.2:3b)
 * 
 * Run with:
 *   npx tsx tests/e2e/test-agent-response-rules.ts
 *   npx tsx tests/e2e/test-agent-response-rules.ts -i  # Interactive mode
 *   TEST_MODEL=llama3.1 npx tsx tests/e2e/test-agent-response-rules.ts  # Custom model
 */

import { config } from 'dotenv';
import * as readline from 'readline';
import { subscribeWorld } from '../../core/subscription.js';
import { publishMessage, disableStreaming } from '../../core/events/index.js';
import { newChat, deleteChat, createWorld, createAgent, listWorlds, deleteWorld } from '../../core/index.js';
import type { WorldSubscription } from '../../core/subscription.js';
import type { World, Agent } from '../../core/types.js';

// Load environment variables
config();

// Parse command line arguments
const args = process.argv.slice(2);
const interactiveMode = args.includes('--interactive') || args.includes('-i');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: npx tsx tests/e2e/test-agent-response-rules.ts [options]

Options:
  -i, --interactive    Enable interactive mode (press Enter to continue at each step)
  -h, --help          Show this help message

Examples:
  npx tsx tests/e2e/test-agent-response-rules.ts                    # Run in auto mode
  npx tsx tests/e2e/test-agent-response-rules.ts -i                 # Interactive mode
`);
  process.exit(0);
}

let subscription: WorldSubscription;
let world: World;
let agents: Map<string, Agent>;
const TEST_WORLD_ID = 'e2e-test';

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

// Setup: Create fresh e2e-test world with Ollama agents
async function setup() {
  console.log('\n🚀 Setting up E2E test...\n');
  console.log(`   Mode: ${interactiveMode ? 'Interactive' : 'Auto'}\n`);

  try {
    // Disable streaming for E2E tests
    disableStreaming();
    console.log('✅ Streaming disabled for E2E test\n');

    // Ensure PI agent flag is set for this E2E run and print it
    process.env.USE_PI_AGENT = process.env.USE_PI_AGENT ?? 'true';
    console.log(`USE_PI_AGENT=${process.env.USE_PI_AGENT}\n`);

    // Disable agent tools for E2E tests (we only want to test response rules)
    process.env.DISABLE_AGENT_TOOLS = 'true';
    console.log('✅ Agent tools disabled for E2E test\n');

    // Step 1: Check if e2e-test world exists
    console.log(`Checking for existing world: ${TEST_WORLD_ID}...`);
    const allWorlds = await listWorlds();
    const existingWorld = allWorlds.find(w => w.id === TEST_WORLD_ID);

    // Step 2: Delete if exists
    if (existingWorld) {
      console.log(`✅ Found existing world: ${TEST_WORLD_ID}`);
      console.log(`   Deleting...`);
      await deleteWorld(TEST_WORLD_ID);
      console.log(`✅ Deleted world: ${TEST_WORLD_ID}\n`);
    } else {
      console.log(`   No existing world found\n`);
    }

    // Step 3: Create new e2e-test world
    console.log(`Creating fresh test world: ${TEST_WORLD_ID}...`);
    const testWorld = await createWorld({
      name: TEST_WORLD_ID,
      turnLimit: 5
    });

    if (!testWorld) {
      throw new Error('Failed to create test world');
    }

    console.log(`✅ Created test world: ${testWorld.id}\n`);

    // Step 4: Create 3 agents using Ollama
    console.log('Creating 3 agents with Ollama...');
    const model = process.env.TEST_MODEL || 'llama3.2:3b';

    await createAgent(testWorld.id, {
      id: 'a1',
      name: 'Agent 1',
      type: 'assistant',
      provider: 'ollama' as any,
      model
    });

    await createAgent(testWorld.id, {
      id: 'a2',
      name: 'Agent 2',
      type: 'assistant',
      provider: 'ollama' as any,
      model
    });

    await createAgent(testWorld.id, {
      id: 'a3',
      name: 'Agent 3',
      type: 'assistant',
      provider: 'ollama' as any,
      model
    });

    console.log(`✅ Created 3 agents using ollama/${model}\n`);

    // Step 5: Subscribe to the world
    const sub = await subscribeWorld(testWorld.id, {
      isOpen: true,
      onWorldEvent: undefined,
      onError: undefined,
      onLog: undefined
    });

    if (!sub) {
      throw new Error('Failed to subscribe to test world');
    }
    subscription = sub;

    world = subscription.world;
    agents = world.agents;

    // Verify we have all 3 agents
    if (!agents.has('a1') || !agents.has('a2') || !agents.has('a3')) {
      throw new Error('World must have agents a1, a2, and a3');
    }

    console.log(`✅ Loaded world: ${world.name} (${world.id})`);
    console.log(`✅ Found ${agents.size} agents: ${Array.from(agents.keys()).join(', ')}\n`);

    // Set up event listeners for LLM response logging (in gray)
    setupResponseLogging();

    return true;
  } catch (error) {
    console.error('❌ Setup failed:', error);
    return false;
  }
}

// Setup response logging
function setupResponseLogging() {
  // ANSI color codes
  const GRAY = '\x1b[90m';
  const RESET = '\x1b[0m';
  const BOLD = '\x1b[1m';

  // Track streaming messages
  const streamBuffers = new Map<string, string>();

  // Listen for SSE streaming events
  world.eventEmitter.on('sse', (event: any) => {
    if (event.type === 'start') {
      // Start of a new message
      streamBuffers.set(event.messageId, '');
      process.stdout.write(`\n${GRAY}${BOLD}[${event.agentName}]${RESET}${GRAY} `);
    } else if (event.type === 'chunk' && event.content) {
      // Streaming chunk
      const buffer = streamBuffers.get(event.messageId) || '';
      streamBuffers.set(event.messageId, buffer + event.content);
      process.stdout.write(`${GRAY}${event.content}${RESET}`);
    } else if (event.type === 'end') {
      // End of message
      streamBuffers.delete(event.messageId);
      process.stdout.write(`${RESET}\n`);
    }
  });

  // Listen for complete messages (when streaming is disabled)
  world.eventEmitter.on('message', (event: any) => {
    if (event.sender !== 'human' && event.content && !streamBuffers.has(event.messageId)) {
      // Complete message received (non-streaming mode)
      console.log(`${GRAY}${BOLD}[${event.sender}]${RESET}${GRAY} ${event.content}${RESET}`);
    }
  });
}

// Cleanup
async function cleanup() {
  console.log('\n🧹 Cleaning up...\n');
  if (subscription) {
    await subscription.unsubscribe();
  }
  // Note: We keep the e2e-test world for inspection after test
  console.log(`Test world ${TEST_WORLD_ID} left for inspection\n`);
}

// Helper to wait for agent responses
function waitForResponses(
  chatId: string,
  expectedAgentIds: string[],
  timeoutMs: number = 30000
): Promise<{ respondedAgents: string[]; timedOut: boolean }> {
  return new Promise((resolve) => {
    const respondedAgents = new Set<string>();
    let resolved = false;

    const messageHandler = (event: any) => {
      // Agent messages have sender as agent ID (not 'human')
      if (event.chatId === chatId && event.sender && event.sender !== 'human') {
        respondedAgents.add(event.sender);

        // Check if we have all expected responses
        const hasAllExpected = expectedAgentIds.every(id => respondedAgents.has(id));

        if (hasAllExpected) {
          cleanup();
          resolve({ respondedAgents: Array.from(respondedAgents), timedOut: false });
        }
      }
    };

    world.eventEmitter.on('message', messageHandler);

    // Set timeout
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve({ respondedAgents: Array.from(respondedAgents), timedOut: true });
    }, timeoutMs);

    function cleanup() {
      if (resolved) return; // Guard against double cleanup
      resolved = true;
      world.eventEmitter.off('message', messageHandler);
      clearTimeout(timeoutId);
    }
  });
}

// Helper to count agent responses in memory
function countAgentResponses(chatId: string, agentIds: string[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const agentId of agentIds) {
    const agent = agents.get(agentId);
    if (!agent) continue;

    const responses = agent.memory.filter(m =>
      m.chatId === chatId &&
      m.role === 'assistant' &&
      !(m as any).tool_calls // Exclude tool call messages, count only final responses
    );

    counts.set(agentId, responses.length);
  }

  return counts;
}

// Test 1: Broadcast - All agents respond to initial human message
async function testBroadcast() {
  console.log('\n' + '═'.repeat(70));
  console.log('📋 Test 1: Broadcast - All Agents Respond to Human Message');
  console.log('═'.repeat(70));

  await waitForEnter('🔷 STEP 1: Create new chat');

  const updatedWorld = await newChat(world.id);
  if (!updatedWorld || !updatedWorld.currentChatId) {
    throw new Error('Failed to create new chat');
  }

  const chatId = updatedWorld.currentChatId;
  world.currentChatId = chatId;
  console.log(`✅ Created chat: ${chatId}\n`);

  await waitForEnter('🔷 STEP 2: Send broadcast message "Hello team!"');

  publishMessage(world, 'Hello team!', 'human', chatId);
  console.log('✅ Message published\n');
  console.log('⏳ Waiting for all agents to respond (30s timeout)...\n');

  const { respondedAgents, timedOut } = await waitForResponses(
    chatId,
    ['a1', 'a2', 'a3'],
    30000
  );

  await waitForEnter('🔷 STEP 3: Verify all agents responded');

  // Give a moment for memory to update
  await new Promise(resolve => setTimeout(resolve, 1000));

  const counts = countAgentResponses(chatId, ['a1', 'a2', 'a3']);

  console.log('\n📊 Agent Responses:');
  counts.forEach((count, agentId) => {
    console.log(`   ${agentId}: ${count} response(s)`);
  });

  const allResponded = respondedAgents.length === 3 &&
    respondedAgents.includes('a1') &&
    respondedAgents.includes('a2') &&
    respondedAgents.includes('a3');

  logTest('Broadcast: All 3 agents responded', allResponded,
    timedOut ? 'Timeout waiting for responses' : undefined);

  await deleteChat(world.id, chatId);
  console.log(`\n✅ Test 1 complete - chat deleted\n`);
}

// Test 2: Direct Mention - Only mentioned agent responds
async function testDirectMention() {
  console.log('\n' + '═'.repeat(70));
  console.log('📋 Test 2: Direct Mention - Only @a1 Should Respond');
  console.log('═'.repeat(70));

  await waitForEnter('🔷 STEP 1: Create new chat');

  const updatedWorld = await newChat(world.id);
  if (!updatedWorld || !updatedWorld.currentChatId) {
    throw new Error('Failed to create new chat');
  }

  const chatId = updatedWorld.currentChatId;
  world.currentChatId = chatId;
  console.log(`✅ Created chat: ${chatId}\n`);

  await waitForEnter('🔷 STEP 2: Send direct mention "@a1 Please summarize our objectives."');

  publishMessage(world, '@a1 Please summarize our objectives.', 'human', chatId);
  console.log('✅ Message published\n');
  console.log('⏳ Waiting for agent response (15s)...\n');

  // Wait for response with timeout
  await new Promise(resolve => setTimeout(resolve, 15000));

  await waitForEnter('🔷 STEP 3: Verify only a1 responded');

  const counts = countAgentResponses(chatId, ['a1', 'a2', 'a3']);

  console.log('\n📊 Agent Responses:');
  counts.forEach((count, agentId) => {
    console.log(`   ${agentId}: ${count} response(s)`);
  });

  const onlyA1Responded = (counts.get('a1') || 0) >= 1 &&
    (counts.get('a2') || 0) === 0 &&
    (counts.get('a3') || 0) === 0;

  logTest('Direct Mention: Only a1 responded', onlyA1Responded,
    !onlyA1Responded ? `a1=${counts.get('a1')}, a2=${counts.get('a2')}, a3=${counts.get('a3')}` : undefined);

  await deleteChat(world.id, chatId);
  console.log(`\n✅ Test 2 complete - chat deleted\n`);
}

// Test 3: Paragraph Mention - Only paragraph-mentioned agent responds
async function testParagraphMention() {
  console.log('\n' + '═'.repeat(70));
  console.log('📋 Test 3: Paragraph Mention - Only @a2 Should Respond');
  console.log('═'.repeat(70));

  await waitForEnter('🔷 STEP 1: Create new chat');

  const updatedWorld = await newChat(world.id);
  if (!updatedWorld || !updatedWorld.currentChatId) {
    throw new Error('Failed to create new chat');
  }

  const chatId = updatedWorld.currentChatId;
  world.currentChatId = chatId;
  console.log(`✅ Created chat: ${chatId}\n`);

  await waitForEnter('🔷 STEP 2: Send paragraph mention with @a2 on new line');

  const message = 'Here is the latest status update.\n@a2 Please provide a short reaction.';
  publishMessage(world, message, 'human', chatId);
  console.log('✅ Message published\n');
  console.log('⏳ Waiting for agent response (15s)...\n');

  await new Promise(resolve => setTimeout(resolve, 15000));

  await waitForEnter('🔷 STEP 3: Verify only a2 responded');

  const counts = countAgentResponses(chatId, ['a1', 'a2', 'a3']);

  console.log('\n📊 Agent Responses:');
  counts.forEach((count, agentId) => {
    console.log(`   ${agentId}: ${count} response(s)`);
  });

  const onlyA2Responded = (counts.get('a2') || 0) >= 1 &&
    (counts.get('a1') || 0) === 0 &&
    (counts.get('a3') || 0) === 0;

  logTest('Paragraph Mention: Only a2 responded', onlyA2Responded,
    !onlyA2Responded ? `a1=${counts.get('a1')}, a2=${counts.get('a2')}, a3=${counts.get('a3')}` : undefined);

  await deleteChat(world.id, chatId);
  console.log(`\n✅ Test 3 complete - chat deleted\n`);
}

// Test 4: Mid-Text Mention - No immediate response
async function testMidTextMention() {
  console.log('\n' + '═'.repeat(70));
  console.log('📋 Test 4: Mid-Text Mention - Should Be Stored, No Response');
  console.log('═'.repeat(70));

  await waitForEnter('🔷 STEP 1: Create new chat');

  const updatedWorld = await newChat(world.id);
  if (!updatedWorld || !updatedWorld.currentChatId) {
    throw new Error('Failed to create new chat');
  }

  const chatId = updatedWorld.currentChatId;
  world.currentChatId = chatId;
  console.log(`✅ Created chat: ${chatId}\n`);

  await waitForEnter('🔷 STEP 2: Send mid-text mention "Great work—let\'s loop in @a3 later."');

  publishMessage(world, "Great work so far—let's loop in @a3 later.", 'human', chatId);
  console.log('✅ Message published\n');
  console.log('⏳ Waiting to confirm no responses (10s)...\n');

  await new Promise(resolve => setTimeout(resolve, 10000));

  await waitForEnter('🔷 STEP 3: Verify no agents responded');

  const counts = countAgentResponses(chatId, ['a1', 'a2', 'a3']);

  console.log('\n📊 Agent Responses:');
  counts.forEach((count, agentId) => {
    console.log(`   ${agentId}: ${count} response(s)`);
  });

  const noResponses = (counts.get('a1') || 0) === 0 &&
    (counts.get('a2') || 0) === 0 &&
    (counts.get('a3') || 0) === 0;

  logTest('Mid-Text Mention: No agent responded', noResponses,
    !noResponses ? `Unexpected responses: a1=${counts.get('a1')}, a2=${counts.get('a2')}, a3=${counts.get('a3')}` : undefined);

  await deleteChat(world.id, chatId);
  console.log(`\n✅ Test 4 complete - chat deleted\n`);
}

// Test 5: Turn Limit - Max 5 agent turns enforced
async function testTurnLimit() {
  console.log('\n' + '═'.repeat(70));
  console.log('📋 Test 5: Turn Limit - Maximum 5 Agent Turns');
  console.log('═'.repeat(70));

  await waitForEnter('🔷 STEP 1: Create new chat');

  const updatedWorld = await newChat(world.id);
  if (!updatedWorld || !updatedWorld.currentChatId) {
    throw new Error('Failed to create new chat');
  }

  const chatId = updatedWorld.currentChatId;
  world.currentChatId = chatId;
  console.log(`✅ Created chat: ${chatId}\n`);
  console.log(`   World turn limit: ${world.turnLimit}\n`);

  await waitForEnter('🔷 STEP 2: Send message asking for consecutive updates');

  publishMessage(world, 'Team, give me consecutive one-line status updates until you are forced to stop.', 'human', chatId);
  console.log('✅ Message published\n');
  console.log('⏳ Waiting for turn limit to be reached (45s)...\n');

  // Wait longer for multiple turns
  await new Promise(resolve => setTimeout(resolve, 45000));

  await waitForEnter('🔷 STEP 3: Count total agent turns');

  // Count all assistant messages (including tool calls)
  let totalTurns = 0;
  const agentTurns = new Map<string, number>();

  for (const [agentId, agent] of agents) {
    const turns = agent.memory.filter(m =>
      m.chatId === chatId &&
      m.role === 'assistant'
    ).length;

    agentTurns.set(agentId, turns);
    totalTurns += turns;
  }

  console.log('\n📊 Agent Turns:');
  agentTurns.forEach((turns, agentId) => {
    console.log(`   ${agentId}: ${turns} turn(s)`);
  });
  console.log(`   Total: ${totalTurns} turn(s)`);

  // Turn limit should be enforced (allowing some margin for in-flight messages)
  const turnLimitRespected = totalTurns <= (world.turnLimit + 2); // +2 margin for race conditions

  logTest(`Turn Limit: Stopped at ${totalTurns} turns (limit: ${world.turnLimit})`, turnLimitRespected,
    !turnLimitRespected ? `Expected <= ${world.turnLimit + 2}, got ${totalTurns}` : undefined);

  await deleteChat(world.id, chatId);
  console.log(`\n✅ Test 5 complete - chat deleted\n`);
}

// Main test runner
async function main() {
  console.log('═'.repeat(70));
  console.log('  E2E Test: Agent Response Rules with Real LLM Calls');
  console.log('═'.repeat(70));
  console.log(`  Mode: ${interactiveMode ? 'Interactive' : 'Auto'}`);
  console.log(`  World: ${TEST_WORLD_ID} (Fresh Ollama Agents)`);
  console.log('═'.repeat(70));

  const setupSuccess = await setup();
  if (!setupSuccess) {
    process.exit(1);
  }

  try {
    // Run all tests
    await testBroadcast();
    await testDirectMention();
    await testParagraphMention();
    await testMidTextMention();
    await testTurnLimit();

  } catch (error) {
    console.error('❌ Test execution failed:', error);
  } finally {
    await cleanup();
  }

  // Print summary
  console.log('\n' + '═'.repeat(70));
  console.log('  Test Results Summary');
  console.log('═'.repeat(70));
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

  console.log('═'.repeat(70));
  console.log(results.failed === 0 ? '  ✅ All tests passed!' : `  ❌ ${results.failed} test(s) failed`);
  console.log('═'.repeat(70));
  console.log('');

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
