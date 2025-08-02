/**
 * Integration test for new chat reus      deleteWorld: jest.fn().mockResolvedValue(true),
      listWorlds: jest.fn().mockResolvedValue([]),
      worldExists: jest.fn().mockImplementation(async (id) => {
        // Only return true if the world data exists in our mockStorage
        return mockStorage.has('world') && mockStorage.get('world').id === id;
      }),ptimization
 * Tests the complete workflow from detection to reuse/creation
 */

import type { CreateWorldParams, CreateAgentParams } from '../../core/types';

const rootPath: string = '/mock-root';

describe('New Chat Reuse Integration', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should demonstrate complete chat reuse workflow', async () => {
    jest.resetModules();

    // Setup: Create a simple in-memory storage for testing
    const mockStorage = new Map();
    const mockChats = new Map();

    // Don't pre-populate world data - let createWorld handle it

    const mockWrappers = {
      // World operations
      saveWorld: jest.fn().mockImplementation(async (data) => {
        mockStorage.set('world', data);
      }),
      loadWorld: jest.fn().mockImplementation(async (id) => mockStorage.get('world')),
      deleteWorld: jest.fn().mockResolvedValue(true),
      listWorlds: jest.fn().mockResolvedValue([]),
      worldExists: jest.fn().mockImplementation(async (id) => {
        // Only return true if the world data exists in our mockStorage
        return mockStorage.has('world') && mockStorage.get('world').id === id;
      }),

      // Agent operations
      saveAgent: jest.fn().mockResolvedValue(undefined),
      saveAgentConfig: jest.fn().mockResolvedValue(undefined),
      saveAgentMemory: jest.fn().mockResolvedValue(undefined),
      loadAgent: jest.fn().mockResolvedValue(null),
      loadAgentWithRetry: jest.fn().mockResolvedValue(null),
      deleteAgent: jest.fn().mockResolvedValue(true),
      listAgents: jest.fn().mockResolvedValue([]),
      agentExists: jest.fn().mockResolvedValue(false),

      // Batch operations
      saveAgentsBatch: jest.fn().mockResolvedValue(undefined),
      loadAgentsBatch: jest.fn().mockResolvedValue({ successful: [], failed: [] }),

      // Chat history operations
      saveChatData: jest.fn().mockImplementation(async (worldId, chat) => {
        mockChats.set(chat.id, chat);
      }),
      loadChatData: jest.fn().mockImplementation(async (worldId, chatId) => mockChats.get(chatId)),
      deleteChatData: jest.fn().mockResolvedValue(true),
      listChats: jest.fn().mockResolvedValue([]),
      updateChatData: jest.fn().mockImplementation(async (worldId, chatId, updates) => {
        const existing = mockChats.get(chatId);
        if (existing) {
          const updated = { ...existing, ...updates, updatedAt: new Date() };
          mockChats.set(chatId, updated);
          return updated;
        }
        return null;
      }),

      // Chat operations
      saveWorldChat: jest.fn().mockResolvedValue(undefined),
      loadWorldChat: jest.fn().mockResolvedValue(null),
      loadWorldChatFull: jest.fn().mockResolvedValue(null),
      restoreFromWorldChat: jest.fn().mockResolvedValue(true),

      // Integrity operations
      validateIntegrity: jest.fn().mockResolvedValue({ isValid: true }),
      repairData: jest.fn().mockResolvedValue(true),
      archiveMemory: jest.fn().mockResolvedValue(undefined),
    };

    const storageFactory = await import('../../core/storage-factory');
    jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(mockWrappers);

    const managers = await import('../../core/managers');

    // 1. Create a world
    const world = await managers.createWorld(rootPath, {
      name: 'Test World',
      description: 'A world for testing chat reuse',
      turnLimit: 10
    });

    expect(world).not.toBeNull();
    expect(world.currentChatId).toBeNull(); // No chat initially

    // 2. Create first chat - should create new since no current chat
    const firstNewChat = await world.newChat();
    expect(firstNewChat.currentChatId).not.toBeNull();
    expect(firstNewChat.currentChatId).toMatch(/^chat-\d+-[a-z0-9]+$/);

    const firstChatId = firstNewChat.currentChatId!;

    // 3. Verify that the chat was created and is reusable
    const currentChat = await world.getCurrentChat();
    expect(currentChat).not.toBeNull();
    expect(currentChat!.name).toBe('New Chat');
    expect(currentChat!.messageCount).toBe(0);

    // 4. Call newChat() again immediately - should REUSE the existing chat
    const secondNewChat = await world.newChat();
    expect(secondNewChat.currentChatId).toBe(firstChatId); // Same chat ID - reused!

    // 5. Verify that updateChatData was called (indicating reuse) instead of saveChatData
    expect(mockWrappers.updateChatData).toHaveBeenCalledWith(
      world.id,
      firstChatId,
      { messageCount: 0 }
    );

    console.log('✅ Chat reuse workflow completed successfully!');
    console.log(`   - First chat ID: ${firstChatId}`);
    console.log(`   - Second call reused same ID: ${secondNewChat.currentChatId}`);
    console.log(`   - updateChatData called: ${mockWrappers.updateChatData.mock.calls.length} times`);
  });

  it('should create new chat when current chat has content', async () => {
    jest.resetModules();

    const mockChats = new Map();

    // Create a chat with content (not reusable)
    const existingChatWithContent = {
      id: 'chat-with-content',
      worldId: 'test-world',
      name: 'Important Discussion', // Different name
      description: 'Has important content',
      createdAt: new Date(Date.now() - 1000),
      updatedAt: new Date(Date.now() - 1000),
      messageCount: 5 // Has messages - not reusable
    };
    mockChats.set('chat-with-content', existingChatWithContent);

    const mockWrappers = {
      // World operations
      saveWorld: jest.fn().mockResolvedValue(undefined),
      loadWorld: jest.fn().mockResolvedValue({
        id: 'test-world',
        name: 'Test World',
        description: 'A world for testing',
        turnLimit: 10,
        currentChatId: 'chat-with-content' // Current chat has content
      }),
      deleteWorld: jest.fn().mockResolvedValue(true),
      listWorlds: jest.fn().mockResolvedValue([]),
      worldExists: jest.fn().mockResolvedValue(true), // World exists for getWorld

      // Agent operations  
      saveAgent: jest.fn().mockResolvedValue(undefined),
      saveAgentConfig: jest.fn().mockResolvedValue(undefined),
      saveAgentMemory: jest.fn().mockResolvedValue(undefined),
      loadAgent: jest.fn().mockResolvedValue(null),
      loadAgentWithRetry: jest.fn().mockResolvedValue(null),
      deleteAgent: jest.fn().mockResolvedValue(true),
      listAgents: jest.fn().mockResolvedValue([]),
      agentExists: jest.fn().mockResolvedValue(false),

      // Batch operations
      saveAgentsBatch: jest.fn().mockResolvedValue(undefined),
      loadAgentsBatch: jest.fn().mockResolvedValue({ successful: [], failed: [] }),

      // Chat history operations
      saveChatData: jest.fn().mockImplementation(async (worldId, chat) => { mockChats.set(chat.id, chat); }),
      loadChatData: jest.fn().mockImplementation(async (worldId, chatId) => mockChats.get(chatId)),
      deleteChatData: jest.fn().mockResolvedValue(true),
      listChats: jest.fn().mockResolvedValue([]),
      updateChatData: jest.fn().mockResolvedValue(null),

      // Chat operations
      saveWorldChat: jest.fn().mockResolvedValue(undefined),
      loadWorldChat: jest.fn().mockResolvedValue(null),
      loadWorldChatFull: jest.fn().mockResolvedValue(null),
      restoreFromWorldChat: jest.fn().mockResolvedValue(true),

      // Integrity operations
      validateIntegrity: jest.fn().mockResolvedValue({ isValid: true }),
      repairData: jest.fn().mockResolvedValue(true),
      archiveMemory: jest.fn().mockResolvedValue(undefined),
    };

    const storageFactory = await import('../../core/storage-factory');
    jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(mockWrappers);

    const managers = await import('../../core/managers');

    // Load world with existing chat that has content
    const world = await managers.getWorld(rootPath, 'test-world');
    expect(world).not.toBeNull();
    expect(world!.currentChatId).toBe('chat-with-content');

    // Call newChat() - should create NEW chat because current one has content
    const newChatResult = await world!.newChat();

    // Should have created a new chat (different ID)
    expect(newChatResult.currentChatId).not.toBe('chat-with-content');
    expect(newChatResult.currentChatId).toMatch(/^chat-\d+-[a-z0-9]+$/);

    // Should have called saveChatData for new chat creation
    expect(mockWrappers.saveChatData).toHaveBeenCalled();

    // updateChatData may be called as part of saveCurrentState() - this is acceptable
    // The important thing is that we created a NEW chat instead of reusing the old one
    console.log(`   - updateChatData called: ${mockWrappers.updateChatData.mock.calls.length} times (from saveCurrentState)`);

    console.log('✅ New chat creation workflow completed successfully!');
    console.log(`   - Original chat ID: chat-with-content`);
    console.log(`   - New chat ID: ${newChatResult.currentChatId}`);
    console.log(`   - saveChatData called: ${mockWrappers.saveChatData.mock.calls.length} times`);
  });
});
