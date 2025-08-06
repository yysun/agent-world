/**
 * Integration Test: WorldClass Chat CRUD Operations
 *
 * Features:
 * - Tests WorldClass chat management methods using OOP interface
 * - Covers: chat creation, listing, restoration, deletion
 * - Validates WorldClass wrapper consistency with core functions
 * - Tests chat session management through class methods
 *
 * Implementation:
 * - Uses WorldClass instead of direct core function calls
 * - Tests comprehensive chat operations including session state
 * - Validates chat lifecycle and currentChatId management
 * - Designed as standalone TypeScript program with npx tsx
 *
 * Changes:
 * - Focused on WorldClass chat CRUD operations
 * - Tests chat session management through class interface
 * - Validates chat state consistency and currentChatId handling
 * - Uses consistent test patterns from existing integration tests
 */

import {
  createWorld,
  disableStreaming,
} from '../core/index.js';
import { WorldClass } from '../core/world-class.js';
import type { CreateWorldParams } from '../core/types.js';
import { boldRed, boldGreen, boldYellow, red, green, yellow, cyan, log, assert } from './utils.js';

const ROOT_PATH = '.';

async function runWorldClassChatTest(): Promise<void> {
  let worldClass: WorldClass | null = null;

  try {
    console.log('Starting Integration Test: WorldClass Chat CRUD Operations');
    console.log('='.repeat(70));

    disableStreaming();

    // Step 1: Create test world using core function
    console.log('\n1. Creating test world for chat operations...');
    const createWorldParams: CreateWorldParams = {
      name: 'Test World Class Chats',
      description: 'A test world for WorldClass chat integration testing',
      turnLimit: 15
    };

    const createdWorld = await createWorld(ROOT_PATH, createWorldParams);
    assert(createdWorld !== null, 'World should be created successfully');
    log('Created world', {
      id: createdWorld!.id,
      name: createdWorld!.name,
      currentChatId: createdWorld!.currentChatId
    });

    // Step 2: Initialize WorldClass instance
    console.log('\n2. Initializing WorldClass instance...');
    worldClass = new WorldClass(ROOT_PATH, createdWorld!.id);
    log('WorldClass initialized for world', worldClass.id);

    // Step 3: Test initial chat list (should be empty)
    console.log('\n3. Testing initial WorldClass listChats method...');
    const initialChats = await worldClass.listChats();
    assert(Array.isArray(initialChats), 'List chats should return array');
    log('Initial chat list', {
      count: initialChats.length,
      chats: initialChats.map(c => ({ id: c.id, name: c.name }))
    });

    // Step 4: Test creating first chat
    console.log('\n4. Testing WorldClass newChat method...');
    const firstChatWorld = await worldClass.newChat(true);
    assert(firstChatWorld !== null, 'New chat should return updated world');
    assert(firstChatWorld!.currentChatId !== null, 'World should have current chat ID set');
    log('First chat created', {
      currentChatId: firstChatWorld!.currentChatId,
      worldId: firstChatWorld!.id
    });

    const firstChatId = firstChatWorld!.currentChatId!;

    // Step 5: Test listing chats after creation
    console.log('\n5. Testing listChats after first chat creation...');
    const chatsAfterFirst = await worldClass.listChats();
    assert(chatsAfterFirst.length === 1, 'Should have exactly one chat');
    assert(chatsAfterFirst[0].id === firstChatId, 'Chat ID should match current chat ID');
    log('Chats after first creation', {
      count: chatsAfterFirst.length,
      chats: chatsAfterFirst.map(c => ({ id: c.id, name: c.name, messageCount: c.messageCount }))
    });

    // Step 6: Test creating second chat
    console.log('\n6. Testing creation of second chat...');
    const secondChatWorld = await worldClass.newChat(true);
    assert(secondChatWorld !== null, 'Second chat should return updated world');
    assert(secondChatWorld!.currentChatId !== firstChatId, 'Should have new current chat ID');
    log('Second chat created', {
      currentChatId: secondChatWorld!.currentChatId,
      previousChatId: firstChatId
    });

    const secondChatId = secondChatWorld!.currentChatId!;

    // Step 7: Test listing multiple chats
    console.log('\n7. Testing listChats with multiple chats...');
    const multipleChats = await worldClass.listChats();
    assert(multipleChats.length === 2, 'Should have exactly two chats');
    const chatIds = multipleChats.map(c => c.id);
    assert(chatIds.includes(firstChatId), 'Should include first chat ID');
    assert(chatIds.includes(secondChatId), 'Should include second chat ID');
    log('Multiple chats list', {
      count: multipleChats.length,
      chats: multipleChats.map(c => ({ id: c.id, name: c.name, createdAt: c.createdAt }))
    });

    // Step 8: Test restoring first chat
    console.log('\n8. Testing WorldClass restoreChat method...');
    const restoredWorld = await worldClass.restoreChat(firstChatId, true);
    assert(restoredWorld !== null, 'Restore chat should return updated world');
    assert(restoredWorld!.currentChatId === firstChatId, 'Current chat ID should be restored chat');
    log('Chat restored', {
      currentChatId: restoredWorld!.currentChatId,
      targetChatId: firstChatId
    });

    // Step 9: Test restoring chat without setting as current
    console.log('\n9. Testing restoreChat without setting as current...');
    const restoredWorldNoSet = await worldClass.restoreChat(secondChatId, false);
    assert(restoredWorldNoSet !== null, 'Restore chat should succeed');
    assert(restoredWorldNoSet!.currentChatId === firstChatId, 'Current chat should remain unchanged');
    log('Chat restored without setting current', {
      currentChatId: restoredWorldNoSet!.currentChatId,
      shouldRemain: firstChatId
    });

    // Step 10: Test creating chat without setting as current
    console.log('\n10. Testing newChat without setting as current...');
    const newChatNoSet = await worldClass.newChat(false);
    assert(newChatNoSet !== null, 'New chat should be created');
    assert(newChatNoSet!.currentChatId === firstChatId, 'Current chat should remain unchanged');
    log('New chat created without setting current', {
      currentChatId: newChatNoSet!.currentChatId,
      shouldRemain: firstChatId
    });

    // Step 11: Verify we now have three chats
    console.log('\n11. Verifying three chats exist...');
    const threeChats = await worldClass.listChats();
    assert(threeChats.length === 3, 'Should have exactly three chats');
    log('Three chats confirmed', {
      count: threeChats.length,
      chats: threeChats.map(c => ({ id: c.id, name: c.name }))
    });

    // Step 12: Test deleting a chat
    console.log('\n12. Testing WorldClass deleteChat method...');
    const deleteResult = await worldClass.deleteChat(secondChatId);
    assert(deleteResult === true, 'Chat deletion should return true');
    log('Chat deleted successfully', {
      deletedChatId: secondChatId,
      result: deleteResult
    });

    // Step 13: Verify chat deletion
    console.log('\n13. Verifying chat deletion...');
    const chatsAfterDelete = await worldClass.listChats();
    assert(chatsAfterDelete.length === 2, 'Should have two chats after deletion');
    const remainingIds = chatsAfterDelete.map(c => c.id);
    assert(!remainingIds.includes(secondChatId), 'Deleted chat should not be in list');
    assert(remainingIds.includes(firstChatId), 'First chat should still be in list');
    log('Chats after deletion', {
      count: chatsAfterDelete.length,
      remaining: chatsAfterDelete.map(c => ({ id: c.id, name: c.name }))
    });

    // Step 14: Test deleting non-existent chat
    console.log('\n14. Testing deleteChat with non-existent chat...');
    const nonExistentDelete = await worldClass.deleteChat('non-existent-chat-id');
    assert(nonExistentDelete === false, 'Deleting non-existent chat should return false');
    console.log(green('✅ Non-existent chat deletion correctly returns false'));

    // Step 15: Test restoring non-existent chat
    console.log('\n15. Testing restoreChat with non-existent chat...');
    const nonExistentRestore = await worldClass.restoreChat('non-existent-chat-id', true);
    assert(nonExistentRestore === null, 'Restoring non-existent chat should return null');
    console.log(green('✅ Non-existent chat restoration correctly returns null'));

    // Step 16: Test final world state consistency
    console.log('\n16. Verifying final world state consistency...');
    const finalWorld = await worldClass.reload();
    assert(finalWorld !== null, 'Final world reload should succeed');
    assert(finalWorld!.currentChatId === firstChatId, 'Current chat should remain first chat');

    const finalChats = await worldClass.listChats();
    assert(finalChats.length === 2, 'Final chat count should be two');
    log('Final world state', {
      currentChatId: finalWorld!.currentChatId,
      chatCount: finalChats.length,
      chats: finalChats.map(c => ({ id: c.id, name: c.name }))
    });

    console.log('\n' + '='.repeat(70));
    console.log(boldGreen('Integration test completed successfully!'));
    console.log(green('All WorldClass chat CRUD operations working correctly.'));

  } catch (error) {
    console.error(boldRed('Integration test failed:'), error);

    // Cleanup on error
    if (worldClass) {
      try {
        await worldClass.delete();
        console.log(yellow('Cleanup: Test world deleted'));
      } catch (cleanupError) {
        console.log(red('Cleanup failed:'), cleanupError);
      }
    }

    process.exit(1);
  } finally {
    // Cleanup test world
    if (worldClass) {
      try {
        await worldClass.delete();
        console.log(cyan('Cleanup: Test world deleted successfully'));
      } catch (cleanupError) {
        console.log(red('Final cleanup failed:'), cleanupError);
      }
    }
  }
}

// Run the test
runWorldClassChatTest();
