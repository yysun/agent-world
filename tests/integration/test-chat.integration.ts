/**
 * Integration Test: Chat Session Flow via Core Public API
 *
 * Features:
 * - Validates chat session management using public API from 'core'
 * - Covers: getFullWorld, chat creation, message sending, chat data retrieval
 * - Ensures function-based approach and updates comment block per instructions
 *
 * Implementation:
 * - Uses function-based API from 'core/index.ts'
 * - Follows steps from test-chat.md
 * - Designed as a standalone TypeScript program with npx tsx
 *
 * Changes:
 * - Converted from Jest test to standalone TypeScript program
 * - Modified step 7 to log full new chat data instead of full world
 */

import {
  getWorld,
  createChatData,
  getChatData,
  restoreWorldChat,
  publishMessage,
} from '../../core/index.js';

const TEST_WORLD_ID = 'test-world';
const TEST_MESSAGE = 'Hello, world!';

// Helper to log for test output
function log(label: string, value: any): void {
  console.log(`${label}:`, value);
}

async function runIntegrationTest(): Promise<void> {
  try {
    console.log('Starting Integration Test: Chat Session Flow');
    console.log('='.repeat(50));

    let world: any;
    let chatId: string;

    // Step 1: Get full world
    console.log('\n1. Getting full world...');
    world = await getWorld('.', TEST_WORLD_ID);
    if (!world) {
      throw new Error('World not found');
    }
    log('Initial world', world);

    // Step 2: Log current chat id
    console.log('\n2. Logging current chat id...');
    log('Current chat id', world.currentChatId);

    // Step 3: Create new chat
    console.log('\n3. Creating new chat...');
    const chat = await createChatData('.', TEST_WORLD_ID, {
      name: 'Integration Chat'
    });
    chatId = chat.id;
    world.currentChatId = chatId;
    log('New chat id', chatId);

    // Step 4: Log current chat id after new chat
    console.log('\n4. Logging current chat id after new chat...');
    log('Current chat id after new chat', world.currentChatId);

    // Step 5: Send message
    console.log('\n5. Sending message...');
    await publishMessage(world, TEST_MESSAGE, 'HUMAN');
    log('Sent message', TEST_MESSAGE);

    // Step 6: Get full world after message
    console.log('\n6. Getting full world after message...');
    const updatedWorld = await getWorld('.', TEST_WORLD_ID);
    if (!updatedWorld) {
      throw new Error('Updated world not found');
    }
    log('World after message', updatedWorld);

    // Step 7: Log full the new chat
    console.log('\n7. Logging full the new chat...');
    const newChat = await getChatData('.', TEST_WORLD_ID, chatId);
    log('Full new chat', newChat);

    console.log('\n' + '='.repeat(50));
    console.log('Integration test completed successfully!');

  } catch (error) {
    console.error('Integration test failed:', error);
    process.exit(1);
  }
}

// Run the test
runIntegrationTest();
