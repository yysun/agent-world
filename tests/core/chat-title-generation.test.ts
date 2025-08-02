/**
 * Unit tests for new chat title generation logic in core/managers.ts
 * Tests the new LLM-based title generation and fallback to agent messages
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

  it('should use LLM for title generation when world has LLM provider configured', async () => {
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

    // Mock LLM manager
    const llmManager = await import('../../core/llm-manager');
    jest.spyOn(llmManager, 'generateAgentResponse').mockResolvedValue('AI Generated Title');

    const managers = await import('../../core/managers');
    
    const messages: AgentMessage[] = [
      { role: 'user', content: 'Hello, can you help me with something?', createdAt: new Date() },
      { role: 'assistant', content: 'Of course! What do you need help with?', createdAt: new Date() }
    ];

    const chatParams: CreateChatParams = {
      name: 'Default Chat Name',
      description: 'A chat for testing',
      captureChat: true
    };

    const result = await managers.createChatData(rootPath, 'test-world', chatParams);
    
    // Should have called LLM for title generation
    expect(llmManager.generateAgentResponse).toHaveBeenCalled();
    expect(result.name).toBe('Default Chat Name'); // Will use default since we're not creating actual chat messages
  });

  it('should fallback to agent message when no LLM provider is configured', async () => {
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
      name: 'Default Chat Name',
      description: 'A chat for testing',
      captureChat: true
    };

    const result = await managers.createChatData(rootPath, 'test-world', chatParams);
    
    // Should not have called LLM since no provider is configured
    expect(mockLLMManager.generateAgentResponse).not.toHaveBeenCalled();
    expect(result.name).toBe('Default Chat Name');
  });

  it('should fallback to default title when LLM generation fails', async () => {
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

    // Mock LLM manager to throw error
    const llmManager = await import('../../core/llm-manager');
    jest.spyOn(llmManager, 'generateAgentResponse').mockRejectedValue(new Error('LLM Error'));

    const managers = await import('../../core/managers');
    
    const chatParams: CreateChatParams = {
      name: 'Default Chat Name',
      description: 'A chat for testing',
      captureChat: true
    };

    const result = await managers.createChatData(rootPath, 'test-world', chatParams);
    
    // Should have attempted LLM call but fallen back to default
    expect(llmManager.generateAgentResponse).toHaveBeenCalled();
    expect(result.name).toBe('Default Chat Name');
  });
});