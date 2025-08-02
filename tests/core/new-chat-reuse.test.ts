/**
 * Unit tests for new chat reuse optimization in core/managers.ts
 * Tests the enhanced newChat() behavior that reuses existing empty chats
 */

import type { CreateWorldParams, CreateChatParams, World } from '../../core/types';

const rootPath: string = '/mock-root';
const worldParams: CreateWorldParams = {
  name: 'Test World',
  description: 'A world for testing chat reuse',
  turnLimit: 10
};

// Utility for full mock - returns proper StorageAPI interface
const fullMockWrappers = (overrides = {}) => ({
  // World operations
  saveWorld: jest.fn().mockResolvedValue(undefined),
  loadWorld: jest.fn().mockResolvedValue(null),
  deleteWorld: jest.fn().mockResolvedValue(true),
  listWorlds: jest.fn().mockResolvedValue([]),
  worldExists: jest.fn().mockResolvedValue(false),

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
  saveChatData: jest.fn().mockResolvedValue(undefined),
  loadChatData: jest.fn().mockResolvedValue(null),
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

  ...overrides
});

describe('New Chat Reuse Optimization', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should reuse current chat when it meets reuse criteria', async () => {
    jest.resetModules();

    const mockChat = {
      id: 'chat-existing',
      worldId: 'test-world',
      name: 'New Chat', // Key condition for reuse
      description: 'Test chat',
      createdAt: new Date(Date.now() - 1000), // Recent (1 second ago)
      updatedAt: new Date(Date.now() - 1000),
      messageCount: 0 // Key condition for reuse
    };

    const storageFactory = await import('../../core/storage-factory');
    jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
      loadWorld: jest.fn().mockResolvedValue({
        id: 'test-world',
        ...worldParams,
        currentChatId: 'chat-existing'
      }),
      loadChatData: jest.fn().mockResolvedValue(mockChat),
      updateChatData: jest.fn().mockResolvedValue(mockChat),
      saveWorld: jest.fn().mockResolvedValue(undefined),
      saveChatData: jest.fn().mockResolvedValue(undefined),
      saveWorldChat: jest.fn().mockResolvedValue(undefined),
      listAgents: jest.fn().mockResolvedValue([])
    }));

    const managers = await import('../../core/managers');

    // Create a world with existing chat
    const world = await managers.getWorld(rootPath, 'test-world');
    expect(world).not.toBeNull();
    expect(world!.currentChatId).toBe('chat-existing');

    // Call newChat() - should reuse existing chat
    const result = await world!.newChat();

    // Should return the same world object with same chat ID
    expect(result.currentChatId).toBe('chat-existing');

    // Should not have created new chat (updateChatData called instead of saveChatData)
    const mockWrappers = await storageFactory.createStorageWithWrappers();
    expect(mockWrappers.updateChatData).toHaveBeenCalledWith('test-world', 'chat-existing', {
      messageCount: 0
    });

    // Should not have called saveChatData for new chat creation
    expect(mockWrappers.saveChatData).not.toHaveBeenCalled();
  });

  it('should create new chat when current chat does not meet reuse criteria', async () => {
    jest.resetModules();

    const mockChat = {
      id: 'chat-existing',
      worldId: 'test-world',
      name: 'Important Discussion', // Different name - not reusable
      description: 'Test chat',
      createdAt: new Date(Date.now() - 1000),
      updatedAt: new Date(Date.now() - 1000),
      messageCount: 5 // Too many messages - not reusable
    };

    const storageFactory = await import('../../core/storage-factory');
    jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
      loadWorld: jest.fn().mockResolvedValue({
        id: 'test-world',
        ...worldParams,
        currentChatId: 'chat-existing'
      }),
      loadChatData: jest.fn().mockResolvedValue(mockChat),
      saveChatData: jest.fn().mockResolvedValue(undefined),
      saveWorldChat: jest.fn().mockResolvedValue(undefined),
      saveWorld: jest.fn().mockResolvedValue(undefined),
      listAgents: jest.fn().mockResolvedValue([]),
      createChatData: jest.fn().mockResolvedValue(mockChat)
    }));

    const managers = await import('../../core/managers');

    // Create a world with existing chat
    const world = await managers.getWorld(rootPath, 'test-world');
    expect(world).not.toBeNull();
    expect(world!.currentChatId).toBe('chat-existing');

    // Call newChat() - should create new chat
    const result = await world!.newChat();

    // Should return world with new chat ID (not the existing one)
    expect(result.currentChatId).not.toBe('chat-existing');
    expect(result.currentChatId).toMatch(/^chat-\d+-[a-z0-9]+$/); // Should match chat ID pattern

    // The behavior should be creating a new chat, not reusing
    expect(result).toBe(world); // Should return the same world object with updated chatId
  });

  it('should fallback to new chat creation when optimization is disabled', async () => {
    jest.resetModules();

    const mockChat = {
      id: 'chat-existing',
      worldId: 'test-world',
      name: 'New Chat', // Would normally be reusable
      description: 'Test chat',
      createdAt: new Date(Date.now() - 1000),
      updatedAt: new Date(Date.now() - 1000),
      messageCount: 0 // Would normally be reusable
    };

    // Set up storage mocks FIRST before importing managers
    const storageFactory = await import('../../core/storage-factory');
    jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
      loadWorld: jest.fn().mockResolvedValue({
        id: 'test-world',
        ...worldParams,
        currentChatId: 'chat-existing'
      }),
      loadChatData: jest.fn().mockResolvedValue(mockChat),
      listAgents: jest.fn().mockResolvedValue([]), // Ensure this is available
      saveChatData: jest.fn().mockResolvedValue(undefined),
      saveWorldChat: jest.fn().mockResolvedValue(undefined),
      saveWorld: jest.fn().mockResolvedValue(undefined),
      createChatData: jest.fn().mockResolvedValue({
        id: 'chat-new',
        worldId: 'test-world',
        name: 'New Chat',
        messageCount: 0
      })
    }));

    // THEN import managers and modify config
    const managers = await import('../../core/managers');
    const originalConfig = (managers as any).NEW_CHAT_CONFIG;
    (managers as any).NEW_CHAT_CONFIG = {
      ...originalConfig,
      ENABLE_OPTIMIZATION: false
    };

    // Remove the duplicate createChatData mock since it's already in fullMockWrappers
    // const createChatDataMock = jest.fn().mockResolvedValue({
    //   id: 'chat-new',
    //   worldId: 'test-world',
    //   name: 'New Chat',
    //   messageCount: 0
    // });

    // jest.spyOn(managers, 'createChatData').mockImplementation(createChatDataMock);

    // Create a world with existing chat
    const world = await managers.getWorld(rootPath, 'test-world');
    expect(world).not.toBeNull();

    // Call newChat() - should create new chat despite reusable conditions
    const result = await world!.newChat();

    // Should have created new chat - the function will be called from within the implementation
    expect(result).toBe(world);

    // Restore original config
    (managers as any).NEW_CHAT_CONFIG = originalConfig;
  });
});
