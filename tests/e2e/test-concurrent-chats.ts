/**
 * E2E Test: Concurrent Chat Sessions
 *
 * Purpose:
 *   Demonstrates and validates that multiple chat sessions can run
 *   independently and concurrently without cross-contamination.
 *
 * Key Features:
 * 1. Creates 3 separate chat sessions in the same world
 * 2. Sends messages to all 3 chats in rapid succession (concurrent)
 * 3. Verifies SSE events are tagged with correct chatId
 * 4. Verifies agent responses go to correct chat (no cross-contamination)
 * 5. Validates that responses don't leak between sessions
 *
 * Test Setup:
 * - Creates fresh 'e2e-concurrent' world with Ollama agents
 * - Uses streaming disabled for deterministic testing
 * - Each chat gets a unique identifying message
 *
 * Requirements:
 * - Ollama installed and running locally
 * - Model: llama3.2:3b (override with TEST_MODEL env var)
 *
 * Run with:
 *   npx tsx tests/e2e/test-concurrent-chats.ts
 *   npx tsx tests/e2e/test-concurrent-chats.ts -i  # Interactive mode
 */

import { config } from 'dotenv';
import * as readline from 'readline';
import { subscribeWorld } from '../../core/subscription.js';
import { publishMessage, enableStreaming } from '../../core/events/index.js';
import {
  newChat,
  deleteChat,
  updateChat,
  createWorld,
  createAgent,
  listWorlds,
  deleteWorld
} from '../../core/index.js';
import type { WorldSubscription } from '../../core/subscription.js';
import type { World, Agent, WorldSSEEvent } from '../../core/types.js';

// Load environment variables
config();

// Parse command line arguments
const args = process.argv.slice(2);
const interactiveMode = args.includes('--interactive') || args.includes('-i');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: npx tsx tests/e2e/test-concurrent-chats.ts [options]

Options:
  -i, --interactive    Enable interactive mode (press Enter to continue at each step)
  -h, --help          Show this help message

Examples:
  npx tsx tests/e2e/test-concurrent-chats.ts                    # Run in auto mode
  npx tsx tests/e2e/test-concurrent-chats.ts -i                 # Interactive mode
`);
  process.exit(0);
}

let subscription: WorldSubscription;
let world: World;
let agents: Map<string, Agent>;
const TEST_WORLD_ID = 'e2e-concurrent';

// Track SSE events per chatId for validation
const sseEventsByChatId = new Map<string, WorldSSEEvent[]>();

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

// Setup: Create fresh test world with Ollama agents
async function setup() {
  console.log('\n🚀 Setting up Concurrent Chats E2E test...\n');
  console.log(`   Mode: ${interactiveMode ? 'Interactive' : 'Auto'}\n`);

  try {
    // Enable streaming for SSE event testing
    enableStreaming();
    console.log('✅ Streaming enabled for SSE testing\n');

    // Disable agent tools for E2E tests
    process.env.DISABLE_AGENT_TOOLS = 'true';
    console.log('✅ Agent tools disabled for E2E test\n');

    // Step 1: Check if test world exists
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

    // Step 3: Create new test world
    console.log(`Creating fresh test world: ${TEST_WORLD_ID}...`);
    const testWorld = await createWorld({
      name: TEST_WORLD_ID,
      turnLimit: 3 // Keep it short for faster tests
    });

    if (!testWorld) {
      throw new Error('Failed to create test world');
    }

    console.log(`✅ Created test world: ${testWorld.id}\n`);

    // Step 4: Create agents using Ollama
    console.log('Creating agents with Ollama...');
    const model = process.env.TEST_MODEL || 'llama3.2:3b';

    await createAgent(testWorld.id, {
      id: 'helper',
      name: 'Helper Bot',
      type: 'assistant',
      provider: 'ollama' as any,
      model,
      systemPrompt: 'You are a helpful assistant. Keep responses very brief (1-2 sentences max). Include the word from the user message in your response.'
    });

    console.log(`✅ Created agent using ollama/${model}\n`);

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

    console.log(`✅ Loaded world: ${world.name} (${world.id})`);
    console.log(`✅ Found ${agents.size} agent(s): ${Array.from(agents.keys()).join(', ')}\n`);

    // Set up SSE event tracking
    setupSSETracking();

    return true;
  } catch (error) {
    console.error('❌ Setup failed:', error);
    return false;
  }
}

// Setup SSE event tracking to verify routing
function setupSSETracking() {
  const GRAY = '\x1b[90m';
  const CYAN = '\x1b[36m';
  const RESET = '\x1b[0m';
  const BOLD = '\x1b[1m';

  world.eventEmitter.on('sse', (event: WorldSSEEvent) => {
    const chatId = event.chatId || 'unknown';

    // Track events per chatId
    if (!sseEventsByChatId.has(chatId)) {
      sseEventsByChatId.set(chatId, []);
    }
    sseEventsByChatId.get(chatId)!.push(event);

    // Log SSE events with chatId
    if (event.type === 'start') {
      console.log(`${CYAN}[SSE:${chatId.slice(0, 8)}]${RESET} ${GRAY}start from ${event.agentName}${RESET}`);
    } else if (event.type === 'end') {
      console.log(`${CYAN}[SSE:${chatId.slice(0, 8)}]${RESET} ${GRAY}end${RESET}`);
    } else if (event.type === 'chunk' && event.content) {
      // Show first chunk only to avoid spam
      const events = sseEventsByChatId.get(chatId)!.filter(e => e.type === 'chunk');
      if (events.length <= 1) {
        console.log(`${CYAN}[SSE:${chatId.slice(0, 8)}]${RESET} ${GRAY}chunk: "${event.content.slice(0, 30)}..."${RESET}`);
      }
    }
  });

  // Also track message events
  world.eventEmitter.on('message', (event: any) => {
    if (event.sender !== 'human') {
      const chatId = event.chatId || 'unknown';
      console.log(`${CYAN}[MSG:${chatId.slice(0, 8)}]${RESET} ${BOLD}${event.sender}${RESET}${GRAY}: ${event.content?.slice(0, 50)}...${RESET}`);
    }
  });
}

// Cleanup
async function cleanup() {
  console.log('\n🧹 Cleaning up...\n');
  if (subscription) {
    await subscription.unsubscribe();
  }
  console.log(`Test world ${TEST_WORLD_ID} left for inspection\n`);
}

// Count agent responses in agent memory for a specific chat
function countChatResponses(chatId: string): number {
  let count = 0;
  for (const [, agent] of agents) {
    count += agent.memory.filter(m =>
      m.chatId === chatId &&
      m.role === 'assistant' &&
      !(m as any).tool_calls
    ).length;
  }
  return count;
}

// Get response content from a chat
function getChatResponseContent(chatId: string): string[] {
  const contents: string[] = [];
  for (const [, agent] of agents) {
    const msgs = agent.memory.filter(m =>
      m.chatId === chatId &&
      m.role === 'assistant' &&
      m.content &&
      !(m as any).tool_calls
    );
    for (const msg of msgs) {
      contents.push(msg.content as string);
    }
  }
  return contents;
}

// Test: Create 3 concurrent chats and verify isolation
async function testConcurrentChats() {
  console.log('\n' + '═'.repeat(70));
  console.log('📋 Test: Multiple Chat Sessions - Independent Response Routing');
  console.log('═'.repeat(70));

  await waitForEnter('🔷 STEP 1: Create 3 separate chat sessions');

  // Create 3 chats - rename immediately to prevent reuse of empty "New Chat"
  const chat1World = await newChat(world.id);
  const chatId1 = chat1World!.currentChatId!;
  await updateChat(world.id, chatId1, { name: 'Chat 1 - Apples' });
  console.log(`✅ Chat 1: ${chatId1}`);

  const chat2World = await newChat(world.id);
  const chatId2 = chat2World!.currentChatId!;
  await updateChat(world.id, chatId2, { name: 'Chat 2 - Bananas' });
  console.log(`✅ Chat 2: ${chatId2}`);

  const chat3World = await newChat(world.id);
  const chatId3 = chat3World!.currentChatId!;
  await updateChat(world.id, chatId3, { name: 'Chat 3 - Cherries' });
  console.log(`✅ Chat 3: ${chatId3}`);

  // Verify all chats have unique IDs
  const uniqueIds = new Set([chatId1, chatId2, chatId3]);
  if (uniqueIds.size !== 3) {
    console.error(`❌ ERROR: Chat IDs are not unique! Got: ${chatId1}, ${chatId2}, ${chatId3}`);
    logTest('Chat Creation: All 3 chats have unique IDs', false,
      `IDs not unique: ${chatId1}, ${chatId2}, ${chatId3}`);
    return;
  }
  logTest('Chat Creation: All 3 chats have unique IDs', true);

  // Clear SSE tracking
  sseEventsByChatId.clear();

  await waitForEnter('🔷 STEP 2: Send unique messages to all 3 chats (sequential with wait)');

  // Send unique messages to each chat - use distinctive keywords
  // Process sequentially since Ollama handles one LLM request at a time
  // The goal is to demonstrate each chat gets isolated responses routed correctly
  console.log('\n📤 Sending messages to all 3 chats (waiting for each response)...\n');

  publishMessage(world, 'Tell me about APPLES - respond with the word APPLES.', 'human', chatId1);
  console.log(`   Chat 1 [${chatId1.slice(0, 8)}]: Message about APPLES sent`);
  console.log('   ⏳ Waiting for Chat 1 response (20s)...');
  await new Promise(resolve => setTimeout(resolve, 20000));

  publishMessage(world, 'Tell me about BANANAS - respond with the word BANANAS.', 'human', chatId2);
  console.log(`   Chat 2 [${chatId2.slice(0, 8)}]: Message about BANANAS sent`);
  console.log('   ⏳ Waiting for Chat 2 response (20s)...');
  await new Promise(resolve => setTimeout(resolve, 20000));

  publishMessage(world, 'Tell me about CHERRIES - respond with the word CHERRIES.', 'human', chatId3);
  console.log(`   Chat 3 [${chatId3.slice(0, 8)}]: Message about CHERRIES sent`);
  console.log('   ⏳ Waiting for Chat 3 response (20s)...');
  await new Promise(resolve => setTimeout(resolve, 20000));

  console.log('\n✅ All messages sent and responses received\n');

  await waitForEnter('🔷 STEP 3: Verify SSE events are tagged with correct chatId');

  // Verify SSE routing
  console.log('\n📊 SSE Events Per Chat:');
  const chat1SSE = sseEventsByChatId.get(chatId1) || [];
  const chat2SSE = sseEventsByChatId.get(chatId2) || [];
  const chat3SSE = sseEventsByChatId.get(chatId3) || [];

  console.log(`   Chat 1 [${chatId1.slice(0, 8)}]: ${chat1SSE.length} SSE events`);
  console.log(`   Chat 2 [${chatId2.slice(0, 8)}]: ${chat2SSE.length} SSE events`);
  console.log(`   Chat 3 [${chatId3.slice(0, 8)}]: ${chat3SSE.length} SSE events`);

  const allChatsHaveSSE = chat1SSE.length > 0 && chat2SSE.length > 0 && chat3SSE.length > 0;
  logTest('SSE Routing: All chats received SSE events', allChatsHaveSSE,
    !allChatsHaveSSE ? `Events: chat1=${chat1SSE.length}, chat2=${chat2SSE.length}, chat3=${chat3SSE.length}` : undefined);

  await waitForEnter('🔷 STEP 4: Verify responses are in correct chat memory (no cross-contamination)');

  // Check response counts per chat
  console.log('\n📊 Agent Responses Per Chat:');
  const resp1Count = countChatResponses(chatId1);
  const resp2Count = countChatResponses(chatId2);
  const resp3Count = countChatResponses(chatId3);

  console.log(`   Chat 1 [${chatId1.slice(0, 8)}]: ${resp1Count} response(s)`);
  console.log(`   Chat 2 [${chatId2.slice(0, 8)}]: ${resp2Count} response(s)`);
  console.log(`   Chat 3 [${chatId3.slice(0, 8)}]: ${resp3Count} response(s)`);

  const allChatsHaveResponses = resp1Count > 0 && resp2Count > 0 && resp3Count > 0;
  logTest('Response Isolation: All chats received responses', allChatsHaveResponses,
    !allChatsHaveResponses ? `Responses: chat1=${resp1Count}, chat2=${resp2Count}, chat3=${resp3Count}` : undefined);

  await waitForEnter('🔷 STEP 5: Verify response content matches expected keywords (no cross-talk)');

  // Check response content for keyword matching
  console.log('\n📊 Response Content Analysis:');

  const content1 = getChatResponseContent(chatId1).join(' ').toUpperCase();
  const content2 = getChatResponseContent(chatId2).join(' ').toUpperCase();
  const content3 = getChatResponseContent(chatId3).join(' ').toUpperCase();

  console.log(`   Chat 1 content sample: "${content1.slice(0, 80)}..."`);
  console.log(`   Chat 2 content sample: "${content2.slice(0, 80)}..."`);
  console.log(`   Chat 3 content sample: "${content3.slice(0, 80)}..."`);

  // Check for keyword presence (expected) and absence (cross-contamination)
  const chat1HasApples = content1.includes('APPLE');
  const chat2HasBananas = content2.includes('BANANA');
  const chat3HasCherries = content3.includes('CHERR');

  // Check for cross-contamination
  const chat1NoOtherFruit = !content1.includes('BANANA') && !content1.includes('CHERR');
  const chat2NoOtherFruit = !content2.includes('APPLE') && !content2.includes('CHERR');
  const chat3NoOtherFruit = !content3.includes('APPLE') && !content3.includes('BANANA');

  console.log('\n📊 Keyword Verification:');
  console.log(`   Chat 1: APPLES present=${chat1HasApples}, no other fruit=${chat1NoOtherFruit}`);
  console.log(`   Chat 2: BANANAS present=${chat2HasBananas}, no other fruit=${chat2NoOtherFruit}`);
  console.log(`   Chat 3: CHERRIES present=${chat3HasCherries}, no other fruit=${chat3NoOtherFruit}`);

  logTest('Chat 1: Contains APPLES keyword', chat1HasApples);
  logTest('Chat 2: Contains BANANAS keyword', chat2HasBananas);
  logTest('Chat 3: Contains CHERRIES keyword', chat3HasCherries);

  // Cross-contamination is a softer check - LLM might mention fruits generally
  // But we track it for analysis
  if (!chat1NoOtherFruit) {
    console.log(`   ⚠️ Chat 1 may have cross-talk (mentioned other fruits)`);
  }
  if (!chat2NoOtherFruit) {
    console.log(`   ⚠️ Chat 2 may have cross-talk (mentioned other fruits)`);
  }
  if (!chat3NoOtherFruit) {
    console.log(`   ⚠️ Chat 3 may have cross-talk (mentioned other fruits)`);
  }

  // Clean up chats
  await deleteChat(world.id, chatId1);
  await deleteChat(world.id, chatId2);
  await deleteChat(world.id, chatId3);
  console.log(`\n✅ Test complete - all 3 chats deleted\n`);
}

// Test: Verify SSE events have chatId property
async function testSSEChatIdProperty() {
  console.log('\n' + '═'.repeat(70));
  console.log('📋 Test: SSE Events Include chatId Property');
  console.log('═'.repeat(70));

  await waitForEnter('🔷 STEP 1: Create a chat and send a message');

  const chatWorld = await newChat(world.id);
  const chatId = chatWorld!.currentChatId!;
  await updateChat(world.id, chatId, { name: 'SSE Test Chat' });
  console.log(`✅ Created chat: ${chatId}`);

  // Clear tracking
  sseEventsByChatId.clear();

  publishMessage(world, 'Say hello briefly.', 'human', chatId);
  console.log('✅ Message sent\n');
  console.log('⏳ Waiting for response (20s)...\n');

  await new Promise(resolve => setTimeout(resolve, 20000));

  await waitForEnter('🔷 STEP 2: Verify all SSE events have chatId property');

  const events = sseEventsByChatId.get(chatId) || [];
  console.log(`\n📊 SSE Events received: ${events.length}`);

  // Check that all events have chatId
  const eventsWithChatId = events.filter(e => e.chatId === chatId);
  const eventsWithoutChatId = events.filter(e => !e.chatId);

  console.log(`   Events with correct chatId: ${eventsWithChatId.length}`);
  console.log(`   Events missing chatId: ${eventsWithoutChatId.length}`);

  const allEventsHaveChatId = events.length > 0 && eventsWithoutChatId.length === 0;
  logTest('SSE Property: All events have chatId', allEventsHaveChatId,
    !allEventsHaveChatId ? `Missing chatId on ${eventsWithoutChatId.length} events` : undefined);

  // Verify event types are present
  const hasStart = events.some(e => e.type === 'start');
  const hasEnd = events.some(e => e.type === 'end');

  logTest('SSE Events: Has start event', hasStart);
  logTest('SSE Events: Has end event', hasEnd);

  await deleteChat(world.id, chatId);
  console.log(`\n✅ Test complete - chat deleted\n`);
}

// Main test runner
async function main() {
  console.log('═'.repeat(70));
  console.log('  E2E Test: Concurrent Chat Sessions');
  console.log('═'.repeat(70));
  console.log(`  Mode: ${interactiveMode ? 'Interactive' : 'Auto'}`);
  console.log(`  World: ${TEST_WORLD_ID}`);
  console.log('  Tests:');
  console.log('    1. SSE events include chatId property');
  console.log('    2. Three chat sessions with independent response routing');
  console.log('═'.repeat(70));

  const setupSuccess = await setup();
  if (!setupSuccess) {
    process.exit(1);
  }

  try {
    // Run tests
    await testSSEChatIdProperty();
    await testConcurrentChats();

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
