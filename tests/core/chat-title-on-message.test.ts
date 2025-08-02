/**
 * Unit tests for chat title generation on human message publishing
 * Tests the new behavior where titles are updated when human messages are published
 */

import type { CreateWorldParams, CreateChatParams, World, Agent } from '../../core/types';
import { SenderType } from '../../core/types';

const rootPath: string = '/mock-root';
const worldParams: CreateWorldParams = {
  name: 'Test World',
  description: 'A world for testing',
  turnLimit: 10
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

describe('Chat Title Generation on Human Message', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should update chat title when human message is published', async () => {
    jest.resetModules();

    const mockUpdateChatData = jest.fn();

    const storageFactory = await import('../../core/storage-factory');
    jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
      loadWorld: jest.fn().mockResolvedValue({
        id: 'test-world',
        ...worldParams,
        chatLLMProvider: 'openai',
        chatLLMModel: 'gpt-3.5-turbo'
      }),
      updateChatData: mockUpdateChatData
    }));

    // Mock LLM manager to return a title
    const llmManager = await import('../../core/llm-manager');
    jest.spyOn(llmManager, 'generateAgentResponse').mockResolvedValue('Generated Chat Title');

    // Mock utils.determineSenderType to return human sender
    const utils = await import('../../core/utils');
    jest.spyOn(utils, 'determineSenderType').mockReturnValue(SenderType.HUMAN);

    // Mock events.publishMessage to avoid actual event handling
    const events = await import('../../core/events');
    jest.spyOn(events, 'publishMessage').mockImplementation(() => { });

    const managers = await import('../../core/managers');

    // Create a mock world with currentChatId and agents with human messages
    const mockWorld: Partial<World> = {
      id: 'test-world',
      name: 'Test World',
      currentChatId: 'chat-123',
      chatLLMProvider: 'openai' as any,
      chatLLMModel: 'gpt-3.5-turbo',
      agents: new Map([
        ['agent-1', {
          id: 'agent-1',
          memory: [
            { role: 'user', content: 'Hello world', createdAt: new Date() },
            { role: 'assistant', content: 'Hi there!', createdAt: new Date() }
          ]
        } as Agent]
      ]),
      // Mock saveCurrentState method
      saveCurrentState: jest.fn().mockResolvedValue(undefined)
    };

    // Test publishMessageWithAutoSave with human sender
    await managers.publishMessageWithAutoSave(
      mockWorld as World,
      'This is a human message',
      'human-user'
    );

    // Should have called updateChatData to update the title
    // Note: We use a timeout to allow async title update to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockUpdateChatData).toHaveBeenCalledWith('test-world', 'chat-123', {
      name: 'Generated Chat Title' // LLM call succeeds and returns the mocked title
    });
  });

  it('should not update chat title when agent message is published', async () => {
    jest.resetModules();

    const mockUpdateChatData = jest.fn();

    const storageFactory = await import('../../core/storage-factory');
    jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
      updateChatData: mockUpdateChatData
    }));

    // Mock utils.determineSenderType to return agent sender
    const utils = await import('../../core/utils');
    jest.spyOn(utils, 'determineSenderType').mockReturnValue(SenderType.AGENT);

    // Mock events.publishMessage to avoid actual event handling
    const events = await import('../../core/events');
    jest.spyOn(events, 'publishMessage').mockImplementation(() => { });

    const managers = await import('../../core/managers');

    // Create a mock world with currentChatId
    const mockWorld: Partial<World> = {
      id: 'test-world',
      name: 'Test World',
      currentChatId: 'chat-123',
      agents: new Map(),
      // Mock saveCurrentState method
      saveCurrentState: jest.fn().mockResolvedValue(undefined)
    };

    // Test publishMessageWithAutoSave with agent sender
    await managers.publishMessageWithAutoSave(
      mockWorld as World,
      'This is an agent message',
      'agent-1'
    );

    // Should NOT have called updateChatData since it's not a human message
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockUpdateChatData).not.toHaveBeenCalled();
  });

  it('should not update chat title when no current chat exists', async () => {
    jest.resetModules();

    const mockUpdateChatData = jest.fn();

    const storageFactory = await import('../../core/storage-factory');
    jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
      updateChatData: mockUpdateChatData
    }));

    // Mock utils.determineSenderType to return human sender
    const utils = await import('../../core/utils');
    jest.spyOn(utils, 'determineSenderType').mockReturnValue(SenderType.HUMAN);

    // Mock events.publishMessage to avoid actual event handling
    const events = await import('../../core/events');
    jest.spyOn(events, 'publishMessage').mockImplementation(() => { });

    const managers = await import('../../core/managers');

    // Create a mock world WITHOUT currentChatId
    const mockWorld: Partial<World> = {
      id: 'test-world',
      name: 'Test World',
      currentChatId: null, // No current chat
      agents: new Map(),
      // Mock saveCurrentState method
      saveCurrentState: jest.fn().mockResolvedValue(undefined)
    };

    // Test publishMessageWithAutoSave with human sender
    await managers.publishMessageWithAutoSave(
      mockWorld as World,
      'This is a human message',
      'human-user'
    );

    // Should NOT have called updateChatData since no current chat exists
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockUpdateChatData).not.toHaveBeenCalled();
  });
});
