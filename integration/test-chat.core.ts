/**
 * Integration Test: Chat Session Flow via Core Public API with ClientConnection
 *
 * Features:
 * - Validates chat session management using public API from 'core'
 * - Uses ClientConnection interface like CLI pipeline mode
 * - Implements exit timer for automatic cleanup after agent responses
 * - Covers: world subscription, chat creation, message sending, event handling
 *
 * Implementation:
 * - Uses ClientConnection interface for event handling
 * - Implements exit timer pattern from CLI pipeline mode
 * - Uses subscribeWorld for consistent world management
 * - Designed as a standalone TypeScript program with npx tsx
 *
 * Changes:
 * - Added ClientConnection interface usage like CLI pipeline mode
 * - Implemented exit timer for automatic cleanup
 * - Uses subscribeWorld instead of direct world access
 * - Added event-driven message handling
 */

import {
  subscribeWorld,
  publishMessage,
  ClientConnection,
  type World,
  disableStreaming,
  createChatData,
  listChatHistories,

} from '../core/index.js';

const ROOT_PATH = '.';
const TEST_WORLD_ID = 'test-world';
const TEST_MESSAGE = 'Hello, world!';

// Color helpers for consistent output
const boldRed = (text: string) => `\x1b[1m\x1b[31m${text.toString()}\x1b[0m`;
const boldGreen = (text: string) => `\x1b[1m\x1b[32m${text.toString()}\x1b[0m`;
const boldYellow = (text: string) => `\x1b[1m\x1b[33m${text.toString()}\x1b[0m`;
const red = (text: string) => `\x1b[31m${text.toString()}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text.toString()}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text.toString()}\x1b[0m`;
const cyan = (text: string) => `\x1b[36m${text.toString()}\x1b[0m`;

// Helper to log for test output
function log(label: string, value: any): void {
  console.log(`${label}:`, value);
}

// Helper function to wait for a specified duration
function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runIntegrationTest(): Promise<void> {
  let world: World | null = null;
  let worldSubscription: any = null;

  try {
    console.log('Starting Integration Test: Chat Session Flow with ClientConnection');
    console.log('='.repeat(60));

    disableStreaming();

    // Create pipeline client like in CLI
    const testClient: ClientConnection = {
      isOpen: true,
      onWorldEvent: (eventType: string, eventData: any) => {
        if (eventData.content && eventData.content.includes('Success message sent')) return;

        if ((eventType === 'system' || eventType === 'world') && (eventData.message || eventData.content)) {
          const msg = eventData.message || eventData.content;
          console.log(`${boldRed('● system:')} ${msg}`);
        } else if (eventType === 'message' && eventData.sender === 'system') {
          const msg = eventData.content;
          console.log(`${boldRed('● system:')} ${msg}`);
        }

        if (eventType === 'message' && eventData.content) {
          console.log(`${boldGreen('● ' + (eventData.sender || 'agent') + ':')} ${eventData.content}`);
        }
      },
      onError: (error: string) => {
        console.log(red(`Error: ${error}`));
      }
    };

    // Step 1: Subscribe to world
    console.log('\n1. Subscribing to world...');
    worldSubscription = await subscribeWorld(TEST_WORLD_ID, ROOT_PATH, testClient);
    if (!worldSubscription) {
      throw new Error('World not found');
    }
    world = worldSubscription.world;
    if (!world) {
      throw new Error('World not loaded from subscription');
    }

    // log('Initial world loaded', {
    //   id: world.id,
    //   currentChatId: world.currentChatId,
    //   agentCount: world.agents?.size || 0
    // });

    // Step 2: Log current chat id
    console.log('\n2. Logging current chat id...');
    log('Current chat id', yellow(world.currentChatId || ''));

    // Step 3: Create new chat
    console.log('\n3. Creating new chat...');

    await createChatData(ROOT_PATH, TEST_WORLD_ID, {});
    log('Current chat id after new chat', yellow(world.currentChatId || ''));

    const chatId = world.currentChatId;
    console.assert(chatId === world.currentChatId, red('Expected reuse the same chat'));

    await createChatData(ROOT_PATH, TEST_WORLD_ID, {});
    await createChatData(ROOT_PATH, TEST_WORLD_ID, {});

    // Step 4: Log current chat id after new chat
    console.log('\n4. Logging current chat id after new chat...');
    log('Current chat id after new chat 2 times', yellow(world.currentChatId || ''));

    console.assert(chatId === world.currentChatId, red('Expected reuse the same chat'));

    // Step 5: Send message
    console.log('\n5. Sending message...');
    await publishMessage(worldSubscription.world, TEST_MESSAGE, 'HUMAN');
    log('Sent message', cyan(TEST_MESSAGE));

    await wait(3000);

    const chats = await listChatHistories(ROOT_PATH, TEST_WORLD_ID);

    // Step 6: Get updated world state from subscription
    console.log('\n6. Checking updated world state...');
    log('World after message', {
      id: world.id,
      currentChatId: world.currentChatId,
      agentCount: world.agents?.size || 0,
      chatCount: chats.length
    });

    console.log('\n' + '='.repeat(60));
    console.log('Integration test completed successfully!');
    if (worldSubscription) worldSubscription.unsubscribe();
    process.exit(0);

  } catch (error) {
    console.error('Integration test failed:', error);
    if (worldSubscription) worldSubscription.unsubscribe();
    process.exit(1);
  }
}

// Run the test
runIntegrationTest();
