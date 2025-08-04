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
 * - Implemented as Jest test with proper assertions
 *
 * Changes:
 * - Converted from standalone TypeScript program to Jest test
 * - Modified step 7 to log full new chat data instead of full world
 * - Added assertion to check message count equals 2
 */

import {
  getWorld,
  createWorld,
  createChatData,
  getChatData,
  restoreWorldChat,
  publishMessage,
} from '../../core/index.js';
import type { CreateWorldParams } from '../../core/types.js';

const TEST_WORLD_ID = 'test-world';
const TEST_MESSAGE = 'Hello, world!';
const ROOT_PATH = '';

// Helper to log for test output
function log(label: string, value: any): void {
  console.log(`${label}:`, value);
}

describe('Integration Test: Chat Session Flow', () => {
  it('should manage chat session flow via core public API', async () => {
    let world: any;
    let chatId: string;

    // Step 0: Create test world first (required for integration test)
    console.log('\n0. Creating test world...');
    const worldParams: CreateWorldParams = {
      name: TEST_WORLD_ID,
      description: 'Test world for integration testing',
      turnLimit: 10
    };

    try {
      // Try to get world first, create if it doesn't exist
      world = await getWorld(ROOT_PATH, TEST_WORLD_ID);
      if (!world) {
        world = await createWorld(ROOT_PATH, worldParams);
        console.log('Created new test world');
      } else {
        console.log('Using existing test world');
      }
    } catch (error) {
      // If getWorld fails, create the world
      world = await createWorld(ROOT_PATH, worldParams);
      console.log('Created test world after getWorld failed');
    }

    expect(world).toBeTruthy();
    log('Test world', world);

    // Step 1: Get full world
    console.log('\n1. Getting full world...');
    world = await getWorld(ROOT_PATH, TEST_WORLD_ID);
    expect(world).toBeTruthy();
    log('Initial world', world);    // Step 2: Log current chat id
    console.log('\n2. Logging current chat id...');
    log('Current chat id', world.currentChatId);

    // Step 3: Create new chat
    console.log('\n3. Creating new chat...');
    const chat = await createChatData(ROOT_PATH, TEST_WORLD_ID, {
      name: 'Integration Chat'
    });
    chatId = chat.id;
    world.currentChatId = chatId;
    expect(chatId).toBeTruthy();
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
    const updatedWorld = await getWorld(ROOT_PATH, TEST_WORLD_ID);
    expect(updatedWorld).toBeTruthy();
    log('World after message', updatedWorld);

    // Step 7: Log full the new chat
    console.log('\n7. Logging full the new chat...');
    const newChat = await getChatData(ROOT_PATH, TEST_WORLD_ID, chatId);
    expect(newChat).toBeTruthy();
    log('Full new chat', newChat);

    // Check message count should be 2
    console.log('\n8. Checking message count...');
    if (newChat && 'messages' in newChat) {
      expect((newChat as any).messages).toBeTruthy();
      expect((newChat as any).messages.length).toBe(2);
      log('Message count', (newChat as any).messages.length);
    } else {
      // If messages property doesn't exist directly, check if it's in a different structure
      const chatWithMessages = newChat as any;
      expect(chatWithMessages).toHaveProperty('messages');
      expect(chatWithMessages.messages.length).toBe(2);
      log('Message count', chatWithMessages.messages.length);
    }
  });
});
