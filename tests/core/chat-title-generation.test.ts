/**
 * Unit tests for new chat title generation logic in core/managers.ts
 * Tests the updated behavior where titles are "New Chat" on creation
 * and updated when human messages are published
 */

import type { CreateWorldParams, CreateChatParams, AgentMessage, World } from '../../core/types';

const rootPath: string = '/mock-root';
const worldParams: CreateWorldParams = {
  name: 'Test World',
  description: 'A world for testing',
  turnLimit: 10
};

// Mock LLM manager
const mockLLMManager = {
  generateAgentResponse: jest.fn()
};

// Utility for full mock - returns proper StorageAPI interface
const fullMockWrappers = (overrides = {}) => ({
  // World operations
  saveWorld: jest.fn(),
  loadWorld: jest.fn(),
  deleteWorld: jest.fn(),
  listWorlds: jest.fn(),
  worldExists: jest.fn().mockResolvedValue(false),

  // Agent operations
  saveAgent: jest.fn(),
  saveAgentConfig: jest.fn(),
  saveAgentMemory: jest.fn(),
  loadAgent: jest.fn(),
  loadAgentWithRetry: jest.fn(),
  deleteAgent: jest.fn(),
  listAgents: jest.fn().mockResolvedValue([]),
  agentExists: jest.fn().mockResolvedValue(false),

  // Batch operations
  saveAgentsBatch: jest.fn(),
  loadAgentsBatch: jest.fn(),

  // Chat history operations
  saveChatData: jest.fn(),
  loadChatData: jest.fn(),
  deleteChatData: jest.fn(),
  listChatHistories: jest.fn().mockResolvedValue([]),
  listChats: jest.fn().mockResolvedValue([]),
  updateChatData: jest.fn(),

  // Chat operations
  saveWorldChat: jest.fn(),
  loadWorldChat: jest.fn(),
  loadWorldChatFull: jest.fn(),
  restoreFromWorldChat: jest.fn(),

  // Integrity operations
  validateIntegrity: jest.fn().mockResolvedValue({ isValid: true }),
  repairData: jest.fn(),
  archiveMemory: jest.fn(),

  ...overrides
});

describe('Chat Title Generation', () => {
  beforeEach(() => {
    jest.resetModules();
    mockLLMManager.generateAgentResponse.mockClear();
  });

  it('should always use "New Chat" as initial title when creating new chat', async () => {
    jest.resetModules();

    const storageFactory = await import('../../core/storage-factory');
    jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
      loadWorld: jest.fn().mockResolvedValue({
        id: 'test-world',
        ...worldParams,
        chatLLMProvider: 'openai',
        chatLLMModel: 'gpt-3.5-turbo'
      }),
      saveChatData: jest.fn(),
      saveWorldChat: jest.fn()
    }));

    // Mock LLM manager (should not be called during creation)
    const llmManager = await import('../../core/llm-manager');
    jest.spyOn(llmManager, 'generateAgentResponse').mockResolvedValue('AI Generated Title');

    const managers = await import('../../core/managers');

    const chatParams: CreateChatParams = {
      name: 'Custom Chat Name',
      description: 'A chat for testing',
      captureChat: true
    };

    const result = await managers.createChatData(rootPath, 'test-world', chatParams);

    // Should NOT call LLM during chat creation
    expect(llmManager.generateAgentResponse).not.toHaveBeenCalled();
    // Should use provided name or default to "New Chat"
    expect(result.name).toBe('Custom Chat Name');
  });

  it('should use "New Chat" as default when no name is provided', async () => {
    jest.resetModules();

    const storageFactory = await import('../../core/storage-factory');
    jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
      loadWorld: jest.fn().mockResolvedValue({
        id: 'test-world',
        ...worldParams,
        // No chatLLMProvider or chatLLMModel configured
      }),
      saveChatData: jest.fn(),
      saveWorldChat: jest.fn()
    }));

    const managers = await import('../../core/managers');

    const chatParams: CreateChatParams = {
      description: 'A chat for testing',
      captureChat: true
      // No name provided
    };

    const result = await managers.createChatData(rootPath, 'test-world', chatParams);

    // Should not have called LLM since titles are generated on message publish
    expect(mockLLMManager.generateAgentResponse).not.toHaveBeenCalled();
    expect(result.name).toBe('New Chat');
  });

  it('should not modify title during chat creation even with snapshot data', async () => {
    jest.resetModules();

    const storageFactory = await import('../../core/storage-factory');
    jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
      loadWorld: jest.fn().mockResolvedValue({
        id: 'test-world',
        ...worldParams,
        chatLLMProvider: 'openai',
        chatLLMModel: 'gpt-3.5-turbo'
      }),
      saveChatData: jest.fn(),
      saveWorldChat: jest.fn(),
      listAgents: jest.fn().mockResolvedValue([
        {
          id: 'test-agent',
          memory: [
            { role: 'user', content: 'Hello, can you help me?', createdAt: new Date() },
            { role: 'assistant', content: 'Of course! What do you need?', createdAt: new Date() }
          ]
        }
      ])
    }));

    // Mock LLM manager (should not be called)
    const llmManager = await import('../../core/llm-manager');
    jest.spyOn(llmManager, 'generateAgentResponse').mockRejectedValue(new Error('LLM Error'));

    const managers = await import('../../core/managers');

    const chatParams: CreateChatParams = {
      name: 'Initial Chat Name',
      description: 'A chat for testing',
      captureChat: true
    };

    const result = await managers.createChatData(rootPath, 'test-world', chatParams);

    // Should NOT attempt LLM call during creation even with snapshot data
    expect(llmManager.generateAgentResponse).not.toHaveBeenCalled();
    expect(result.name).toBe('Initial Chat Name');
  });
});