/**
 * Integration Test: Comprehensive Chat Session Management
 *
 * Features:
 * - Tests complete chat session lifecycle per test-chat.md specifications
 * - Validates world creation, deletion, and chat management
 * - Tests agent creation, messaging, and memory management with Ollama LLM
 * - Validates chat deletion with fallback behavior
 * - Uses ClientConnection interface for event handling
 *
 * Test Steps:
 * 1. Get/delete/create 'test-world'
 * 2. Verify initial 'New Chat' and store chat ID
 * 3. Test chat reuse logic (3 new chats should reuse same ID)
 * 4. Create agent 'a1' with Ollama provider and verify existence
 * 5. Send message to agent and verify processing
 * 6. Verify agent memory contains message with correct chat ID
 * 7. Delete chat and verify fallback to new 'New Chat'
 * 8. Verify agent memory cleanup for deleted chat
 *
 * Implementation:
 * - Uses public API from 'core' module
 * - Ollama LLM provider with llama3.2:3b model
 * - Event-driven message handling with ClientConnection
 * - Comprehensive assertions for each test step
 * - Automatic cleanup and exit handling
 */

import {
  subscribeWorld,
  publishMessage,
  ClientConnection,
  type World,
  type Agent,
  disableStreaming,
  newChat,
  listChats,
  deleteChat,
  createWorld,
  getWorld,
  deleteWorld,
  createAgent,
  getAgent,
  clearAgentMemory,
  LLMProvider,
} from '../core/index.js';
import { configureLLMProvider } from '../core/llm-config.js';
import { boldRed, boldGreen, boldYellow, red, green, yellow, cyan, log } from './utils.js';

const ROOT_PATH = '.';
const TEST_WORLD_ID = 'test-world';
const TEST_AGENT_ID = 'a1';
const TEST_MESSAGE = '@a1 Hello, world!';

// Helper function to wait for a specified duration
function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to verify assertions
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(green(`✓ ${message}`));
}

async function runIntegrationTest(): Promise<void> {
  let world: World | null = null;
  let worldSubscription: any = null;
  let originalChatId: string | null = null;
  let agentProcessedMessage = false;
  let agentAttemptedProcessing = false; // Track if agent attempted to process (even if LLM failed)

  try {
    console.log('Starting Integration Test: Comprehensive Chat Session Management');
    console.log('='.repeat(70));

    disableStreaming();

    // Create pipeline client like in CLI
    const testClient: ClientConnection = {
      isOpen: true,
      onWorldEvent: (eventType: string, eventData: any) => {
        if (eventData.content && typeof eventData.content === 'string' && eventData.content.includes('Success message sent')) return;

        if ((eventType === 'system' || eventType === 'world') && (eventData.message || eventData.content)) {
          const msg = eventData.message || eventData.content;
          console.log(`${boldRed('● system:')} ${msg}`);

          // Check if this is an LLM error for our test agent - indicates agent attempted processing
          if (typeof msg === 'string' && (msg.includes('LLM queue error') || msg.includes('Ollama') || msg.includes('connection')) && msg.includes(TEST_AGENT_ID)) {
            agentAttemptedProcessing = true;
            console.log(`${yellow('  ↳ Agent attempted to process message (Ollama connection issue expected)')}`);
          }
        } else if (eventType === 'message' && eventData.sender === 'system') {
          const msg = eventData.content;
          console.log(`${boldRed('● system:')} ${msg}`);
        }

        if (eventType === 'message' && eventData.content && eventData.sender === TEST_AGENT_ID) {
          console.log(`${boldGreen('● ' + eventData.sender + ':')} ${eventData.content}`);
          agentProcessedMessage = true;
        }
      },
      onError: (error: string) => {
        console.log(red(`Error: ${error}`));
      }
    };

    // Step 1: Get 'test-world', if exists delete it, then create it
    console.log('\n1. Setting up test world...');

    const existingWorld = await getWorld(TEST_WORLD_ID);
    if (existingWorld) {
      console.log('  - Deleting existing test world');
      await deleteWorld(TEST_WORLD_ID);
    }

    console.log('  - Creating new test world');
    world = await createWorld({ name: TEST_WORLD_ID });
    assert(world !== null, 'World created successfully');
    assert(world!.id === TEST_WORLD_ID, 'World has correct ID');

    // Step 2: Subscribe to world and verify initial state
    console.log('\n2. Subscribing to world and verifying initial state...');
    worldSubscription = await subscribeWorld(TEST_WORLD_ID, testClient);
    assert(worldSubscription !== null, 'World subscription successful');

    world = worldSubscription.world;
    assert(world !== null, 'World loaded from subscription');

    // Verify world has current chat as 'New Chat'
    const chats = await listChats(TEST_WORLD_ID);
    assert(chats.length === 1, 'World has exactly one chat');
    assert(chats[0].name === 'New Chat', 'Initial chat has name "New Chat"');
    assert(world!.currentChatId !== null, 'World has current chat ID set');

    // Store the new chat ID
    originalChatId = world!.currentChatId || null;
    console.log(`  - Original chat ID: ${originalChatId}`);

    // Step 3: Create new chat 3 times and verify reuse logic
    console.log('\n3. Testing chat reuse logic...');

    await newChat(TEST_WORLD_ID);
    await newChat(TEST_WORLD_ID);
    await newChat(TEST_WORLD_ID);

    const chatsAfterNewChat = await listChats(TEST_WORLD_ID);
    assert(chatsAfterNewChat.length === 1, 'World still has only one chat after multiple new chat calls');
    assert(chatsAfterNewChat[0].name === 'New Chat', 'Chat still has name "New Chat"');
    assert(world!.currentChatId === originalChatId, 'Current chat ID remains the same (reuse logic)');

    // Step 4: Create agent 'a1' and verify existence
    console.log('\n4. Creating and verifying agent...');

    // Configure LLM provider for testing (using default Ollama)
    console.log('  - Configuring Ollama provider...');
    configureLLMProvider(LLMProvider.OLLAMA, {
      baseUrl: 'http://localhost:11434/api'
    });

    const agent = await createAgent(TEST_WORLD_ID, {
      name: TEST_AGENT_ID,
      type: 'assistant',
      provider: LLMProvider.OLLAMA,
      model: 'llama3.2:3b',
      systemPrompt: 'You are a helpful assistant for testing.'
    });
    assert(agent !== null, 'Agent created successfully');
    assert(agent.id === TEST_AGENT_ID, 'Agent has correct ID');

    const retrievedAgent = await getAgent(TEST_WORLD_ID, TEST_AGENT_ID);
    assert(retrievedAgent !== null, 'Agent exists and can be retrieved');
    assert(retrievedAgent!.id === TEST_AGENT_ID, 'Retrieved agent has correct ID');

    // Unsubscribe and resubscribe to world to ensure new agent is included
    console.log('  - Unsubscribing from world...');
    await worldSubscription.unsubscribe();

    console.log('  - Resubscribing to world to include new agent...');
    worldSubscription = await subscribeWorld(TEST_WORLD_ID, testClient);
    assert(worldSubscription !== null, 'World resubscription successful');
    world = worldSubscription.world;

    // Step 5: Send message to world and wait for agent processing
    console.log('\n5. Sending message to agent...');

    await publishMessage(world!, TEST_MESSAGE, 'HUMAN');
    console.log(`  - Sent message: ${cyan(TEST_MESSAGE)}`);

    // Wait for agent to process the message
    console.log('  - Waiting for agent to process message...');
    let waitTime = 0;
    const maxWaitTime = 10000; // 10 seconds
    while (!agentProcessedMessage && waitTime < maxWaitTime) {
      await wait(1000);
      waitTime += 1000;
      console.log(`    Waiting... (${waitTime / 1000}s)`);
    }

    assert(agentProcessedMessage, 'Agent processed the message within timeout');

    // Step 6: Verify agent memory contains the message with correct chat ID
    console.log('\n6. Verifying agent memory...');

    const agentAfterMessage = await getAgent(TEST_WORLD_ID, TEST_AGENT_ID);
    assert(agentAfterMessage !== null, 'Agent retrieved after message processing');
    assert(agentAfterMessage!.memory.length > 0, 'Agent memory contains messages');

    // Check that memory messages have the correct chat ID
    const memoryMessages = agentAfterMessage!.memory;
    const humanMessage = memoryMessages.find(msg => msg.role === 'user');
    assert(humanMessage !== undefined, 'Agent memory contains human message');
    assert(humanMessage!.chatId === originalChatId, 'Human message has correct chat ID');

    console.log(`  - Agent memory contains ${memoryMessages.length} messages`);
    console.log(`  - Human message chat ID: ${humanMessage!.chatId}`);

    // Step 7: Delete the chat and verify fallback behavior
    console.log('\n7. Deleting chat and verifying fallback...');

    const chatDeleted = await deleteChat(TEST_WORLD_ID, originalChatId!);
    assert(chatDeleted, 'Chat deleted successfully');

    // Verify world has another 'New Chat' with new chat ID
    const chatsAfterDeletion = await listChats(TEST_WORLD_ID);
    assert(chatsAfterDeletion.length === 1, 'World has exactly one chat after deletion');
    assert(chatsAfterDeletion[0].name === 'New Chat', 'New chat has name "New Chat"');
    assert(chatsAfterDeletion[0].id !== originalChatId, 'New chat has different ID');

    // Verify world's current chat is the new chat ID
    const worldAfterDeletion = await getWorld(TEST_WORLD_ID);
    assert(worldAfterDeletion !== null, 'World retrieved after chat deletion');
    assert(worldAfterDeletion!.currentChatId === chatsAfterDeletion[0].id, 'Current chat ID updated to new chat');

    console.log(`  - New chat ID: ${chatsAfterDeletion[0].id}`);

    // Step 8: Verify agent memory cleanup for deleted chat
    console.log('\n8. Verifying agent memory cleanup...');

    const agentAfterDeletion = await getAgent(TEST_WORLD_ID, TEST_AGENT_ID);
    assert(agentAfterDeletion !== null, 'Agent retrieved after chat deletion');

    // Check that memory messages of the old chat ID are gone
    const remainingMessages = agentAfterDeletion!.memory.filter(msg => msg.chatId === originalChatId);
    assert(remainingMessages.length === 0, 'Agent memory messages of deleted chat are gone');

    console.log(`  - Agent memory after cleanup: ${agentAfterDeletion!.memory.length} messages`);

    console.log('\n' + '='.repeat(70));
    console.log(boldGreen('✅ All integration tests passed successfully!'));

    if (worldSubscription) worldSubscription.unsubscribe();
    process.exit(0);

  } catch (error) {
    console.error(boldRed('❌ Integration test failed:'), error);
    if (worldSubscription) worldSubscription.unsubscribe();
    process.exit(1);
  }
}

// Run the test
runIntegrationTest();
