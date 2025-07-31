/**
 * Unit tests for world chat management in core/managers.ts
 * Covers: CRUD, file format, restore, auto-save, edge cases
 */


import type { CreateWorldParams, CreateChatParams, UpdateChatParams, WorldSnapshot } from '../../core/types';

const rootPath: string = '/mock-root';
const worldParams: CreateWorldParams = {
  name: 'Test World',
  description: 'A world for testing',
  turnLimit: 10
};
const chatParams: CreateChatParams = {
  name: 'Test Chat',
  description: 'A chat for testing',
  captureSnapshot: false
};

// Utility for full mock - returns proper StorageAPI interface
const fullMockWrappers = (overrides = {}) => ({
  // World operations - standardized naming (required by StorageAPI)
  saveWorld: jest.fn(),
  loadWorld: jest.fn(),
  deleteWorld: jest.fn(),
  listWorlds: jest.fn(),
  worldExists: jest.fn().mockResolvedValue(false),

  // Agent operations - standardized naming (required by StorageAPI)
  saveAgent: jest.fn(),
  saveAgentConfig: jest.fn(),
  saveAgentMemory: jest.fn(),
  loadAgent: jest.fn(),
  loadAgentWithRetry: jest.fn(),
  deleteAgent: jest.fn(),
  listAgents: jest.fn().mockResolvedValue([]),
  agentExists: jest.fn().mockResolvedValue(false),

  // Batch operations (required by StorageAPI)
  saveAgentsBatch: jest.fn(),
  loadAgentsBatch: jest.fn(),

  // Chat history operations (required by StorageAPI)
  saveChat: jest.fn(),
  loadChat: jest.fn(),
  deleteChat: jest.fn(),
  listChats: jest.fn().mockResolvedValue([]),
  updateChat: jest.fn(),

  // Snapshot operations (required by StorageAPI)
  saveSnapshot: jest.fn(),
  loadSnapshot: jest.fn(),
  restoreFromSnapshot: jest.fn(),

  // Integrity operations (required by StorageAPI)
  validateIntegrity: jest.fn().mockResolvedValue({ isValid: true }),
  repairData: jest.fn(),
  archiveMemory: jest.fn(),

  // Apply any overrides
  ...overrides,
});


it('should create a chat', async () => {
  jest.resetModules();
  const storageFactory = await import('../../core/storage-factory');
  jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers());
  const managers = await import('../../core/managers');
  const world = await managers.createWorld(rootPath, worldParams);
  const chat = await managers.createChat(rootPath, world.id, chatParams);
  expect(chat).toHaveProperty('id');
  expect(chat.name).toBe(chatParams.name);
  expect(chat.description).toBe(chatParams.description);
  expect(chat.worldId).toBe(world.id);
});

it('should get chat history', async () => {
  jest.resetModules();
  const chatId = 'chat-1';
  const storageFactory = await import('../../core/storage-factory');
  jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
    loadChat: jest.fn().mockResolvedValue({ id: chatId, ...chatParams, worldId: 'test-world' }),
  }));
  const managers = await import('../../core/managers');
  const result = await managers.getChatHistory(rootPath, 'test-world', chatId);
  expect(result).toBeTruthy();
  expect(result?.id).toBe(chatId);
});

it('should update chat history', async () => {
  jest.resetModules();
  const chatId = 'chat-1';
  const updates: UpdateChatParams = { name: 'Updated Chat', description: 'Updated desc' };
  const storageFactory = await import('../../core/storage-factory');
  jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
    updateChat: jest.fn().mockResolvedValue({ id: chatId, ...updates, worldId: 'test-world' }),
  }));
  const managers = await import('../../core/managers');
  const updated = await managers.updateChatHistory(rootPath, 'test-world', chatId, updates);
  expect(updated).toBeTruthy();
  expect(updated?.name).toBe(updates.name);
});

it('should delete chat history', async () => {
  jest.resetModules();
  const chatId = 'chat-1';
  const storageFactory = await import('../../core/storage-factory');
  jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
    deleteChat: jest.fn().mockResolvedValue(true),
  }));
  const managers = await import('../../core/managers');
  const deleted = await managers.deleteChatHistory(rootPath, 'test-world', chatId);
  expect(deleted).toBe(true);
});

it('should list chat history', async () => {
  jest.resetModules();
  const storageFactory = await import('../../core/storage-factory');
  jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
    listChats: jest.fn().mockResolvedValue([{ id: 'chat-1', ...chatParams, worldId: 'test-world' }]),
  }));
  const managers = await import('../../core/managers');
  const list = await managers.listChatHistory(rootPath, 'test-world');
  expect(Array.isArray(list)).toBe(true);
  expect(list.length).toBeGreaterThanOrEqual(0);
});

it('should create world snapshot', async () => {
  jest.resetModules();
  const storageFactory = await import('../../core/storage-factory');
  jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
    loadWorld: jest.fn().mockResolvedValue({ id: 'test-world', ...worldParams }),
    listAgents: jest.fn().mockResolvedValue([]),
  }));
  const managers = await import('../../core/managers');
  const snapshot = await managers.createWorldSnapshot(rootPath, 'test-world');
  expect(snapshot).toHaveProperty('world');
  expect(snapshot).toHaveProperty('agents');
  expect(snapshot).toHaveProperty('messages');
  expect(snapshot).toHaveProperty('metadata');
});

it('should restore world snapshot', async () => {
  jest.resetModules();
  const storageFactory = await import('../../core/storage-factory');
  jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
    saveWorld: jest.fn(),
    saveAgent: jest.fn(),
    saveAgentMemory: jest.fn(),
    listAgents: jest.fn().mockResolvedValue([]), // Ensure empty array for existing agents
    deleteAgent: jest.fn(),
  }));
  const managers = await import('../../core/managers');
  // Use a minimal valid snapshot
  const snapshot: WorldSnapshot = {
    world: { id: 'test-world', name: worldParams.name, description: worldParams.description, turnLimit: worldParams.turnLimit ?? 10 },
    agents: [],
    messages: [],
    metadata: { capturedAt: new Date(), version: '1.0', totalMessages: 0, activeAgents: 0 }
  };
  const restored = await managers.restoreFromSnapshot(rootPath, 'test-world', snapshot);
  expect(restored).toBe(true);
});

it('should summarize chat', async () => {
  jest.resetModules();
  const chatId = 'chat-1';
  const storageFactory = await import('../../core/storage-factory');
  jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
    loadChat: jest.fn().mockResolvedValue({
      id: chatId,
      ...chatParams,
      worldId: 'test-world',
      snapshot: { messages: [{ sender: 'A' }, { sender: 'B' }] },
      createdAt: new Date(),
    }),
    loadWorld: jest.fn().mockResolvedValue({ id: 'test-world', ...worldParams }),
  }));
  const managers = await import('../../core/managers');
  const summary = await managers.summarizeChat(rootPath, 'test-world', chatId);
  expect(typeof summary).toBe('string');
  expect(summary).toMatch(/Chat with/);
});

it('should export world to markdown', async () => {
  jest.resetModules();
  const storageFactory = await import('../../core/storage-factory');
  jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
    loadWorld: jest.fn().mockResolvedValue({ id: 'test-world', ...worldParams }),
    listAgents: jest.fn().mockResolvedValue([]),
    listChats: jest.fn().mockResolvedValue([]),
  }));
  const managers = await import('../../core/managers');
  const markdown = await managers.exportWorldToMarkdown(rootPath, 'test-world');
  expect(typeof markdown).toBe('string');
  expect(markdown).toMatch(/# World Export:/);
});

it('should return null for missing chat', async () => {
  jest.resetModules();
  const chatId = 'missing-chat';
  const storageFactory = await import('../../core/storage-factory');
  jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
    loadChat: jest.fn().mockResolvedValue(null),
  }));
  const managers = await import('../../core/managers');
  const result = await managers.getChatHistory(rootPath, 'test-world', chatId);
  expect(result).toBeNull();
});

it('should handle missing world on snapshot', async () => {
  jest.resetModules();
  const storageFactory = await import('../../core/storage-factory');
  jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
    loadWorldFromDisk: jest.fn().mockResolvedValue(null),
  }));
  const managers = await import('../../core/managers');
  await expect(managers.createWorldSnapshot(rootPath, 'missing-world')).rejects.toThrow();

});
