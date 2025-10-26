/**
 * Message Edit Feature Tests
 * 
 * Tests for message ID migration, edit workflows, and error handling.
 * 
 * Covers:
 * - migrateMessageIds function (ID assignment, preservation, error handling)
 * - editUserMessage function (edit flow, removeMessagesFrom integration, processing state validation)
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import type { Agent, AgentMessage, World, Chat } from '../../core/types.js';
import { LLMProvider } from '../../core/types.js';

// Mock nanoid to provide predictable IDs
jest.mock('nanoid', () => ({
  nanoid: jest.fn().mockReturnValue('test-message-id')
}));

// Initialize mock storage API before jest.mock
const mockStorageAPI: any = {
  getMemory: jest.fn(),
  loadAgent: jest.fn(),
  saveAgentMemory: jest.fn(),
  worldExists: jest.fn(),
  loadWorld: jest.fn(),
  saveWorld: jest.fn(),
  deleteWorld: jest.fn(),
  listWorlds: jest.fn(),
  saveAgent: jest.fn(),
  listAgents: jest.fn(),
  deleteAgent: jest.fn(),
  listChats: jest.fn(),
  saveChat: jest.fn(),
  loadChat: jest.fn(),
  deleteChat: jest.fn()
};

// Mock storage factory
jest.mock('../../core/storage/storage-factory.js', () => ({
  // @ts-expect-error - mockStorageAPI is defined before this mock
  createStorageWithWrappers: jest.fn().mockResolvedValue(mockStorageAPI),
  getDefaultRootPath: jest.fn().mockReturnValue('/test/data')
}));

// Import after mocks are set up
import {
  migrateMessageIds,
  editUserMessage,
  removeMessagesFrom
} from '../../core/index.js';

// Helper to create a mock world
function createMockWorld(overrides: Partial<World> = {}): World {
  return {
    id: 'test-world',
    name: 'Test World',
    currentChatId: 'chat-1',
    totalAgents: 1,
    totalMessages: 0,
    turnLimit: 5,
    isProcessing: false,
    createdAt: new Date(),
    lastUpdated: new Date(),
    agents: new Map(),
    chats: new Map(),
    ...overrides
  } as World;
}

// Helper to create a mock agent
function createMockAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    type: 'assistant',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4',
    systemPrompt: 'Test',
    memory: [],
    llmCallCount: 0,
    createdAt: new Date(),
    lastActive: new Date(),
    ...overrides
  };
}

describe('Message Edit Feature', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default return values for storage methods
    mockStorageAPI.listAgents.mockResolvedValue([]);
    mockStorageAPI.listChats.mockResolvedValue([{ id: 'default-chat', name: 'Chat' }]);
  });

  describe('migrateMessageIds', () => {
    test('should throw error for non-existent world', async () => {
      mockStorageAPI.loadWorld.mockResolvedValue(null);
      
      await expect(migrateMessageIds('nonexistent-world-xyz')).rejects.toThrow(/not found/);
    });

    test('validates world existence', async () => {
      mockStorageAPI.loadWorld.mockResolvedValue(null);
      
      const result = migrateMessageIds('invalid-world-id');
      await expect(result).rejects.toThrow();
    });

    test('should assign missing messageId values', async () => {
      const mockWorld = createMockWorld();
      const mockAgent = createMockAgent({
        id: 'agent-1',
        memory: []
      });
      const mockMemory: AgentMessage[] = [
        { role: 'user', content: 'msg1', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' } as AgentMessage,
        { role: 'assistant', content: 'msg2', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' } as AgentMessage
      ];

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent]);
      mockStorageAPI.listChats.mockResolvedValue([{ id: 'chat-1', name: 'Chat 1' }]);
      mockStorageAPI.getMemory.mockResolvedValue(mockMemory);
      mockStorageAPI.saveAgentMemory.mockResolvedValue();

      const result = await migrateMessageIds('test-world');

      // Should have migrated 2 messages
      expect(result).toBe(2);
      expect(mockStorageAPI.saveAgentMemory).toHaveBeenCalled();
      
      // Verify that saveAgentMemory was called with the correct parameters
      expect(mockStorageAPI.saveAgentMemory).toHaveBeenCalledWith(
        'test-world',
        'agent-1',
        expect.any(Array)
      );
      
      // The saved memory should have 2 messages (we can't easily verify the IDs with current mocking)
      const savedMemory = mockStorageAPI.saveAgentMemory.mock.calls[0][2];
      expect(savedMemory).toHaveLength(2);
    });

    test('should preserve existing messageId values', async () => {
      const mockWorld = createMockWorld();
      const mockAgent = createMockAgent({
        memory: [
          { role: 'user', content: 'msg1', messageId: 'existing-id-1', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' },
          { role: 'assistant', content: 'msg2', messageId: 'existing-id-2', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' }
        ]
      });
      const mockMemory: AgentMessage[] = [
        { role: 'user', content: 'msg1', messageId: 'existing-id-1', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' },
        { role: 'assistant', content: 'msg2', messageId: 'existing-id-2', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' }
      ];

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent]);
      mockStorageAPI.listChats.mockResolvedValue([{ id: 'chat-1', name: 'Chat 1' }]);
      mockStorageAPI.getMemory.mockResolvedValue(mockMemory);

      const result = await migrateMessageIds('test-world');

      // Should have migrated 0 messages (all already have IDs)
      expect(result).toBe(0);
      expect(mockStorageAPI.saveAgentMemory).not.toHaveBeenCalled();
    });

    test('should handle mix of messages with and without IDs', async () => {
      const mockWorld = createMockWorld();
      const mockAgent = createMockAgent({
        memory: [
          { role: 'user', content: 'msg1', messageId: 'existing-id-1', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' },
          { role: 'assistant', content: 'msg2', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' } as AgentMessage, // No messageId
          { role: 'user', content: 'msg3', messageId: 'existing-id-3', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' }
        ]
      });
      const mockMemory: AgentMessage[] = [
        { role: 'user', content: 'msg1', messageId: 'existing-id-1', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' },
        { role: 'assistant', content: 'msg2', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' } as AgentMessage,
        { role: 'user', content: 'msg3', messageId: 'existing-id-3', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' }
      ];

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent]);
      mockStorageAPI.listChats.mockResolvedValue([{ id: 'chat-1', name: 'Chat 1' }]);
      mockStorageAPI.getMemory.mockResolvedValue(mockMemory);
      mockStorageAPI.saveAgentMemory.mockResolvedValue();

      const result = await migrateMessageIds('test-world');

      // Should have migrated 1 message
      expect(result).toBe(1);
      expect(mockStorageAPI.saveAgentMemory).toHaveBeenCalled();
      
      // Verify that existing IDs are preserved
      const savedMemory = mockStorageAPI.saveAgentMemory.mock.calls[0][2];
      expect(savedMemory[0].messageId).toBe('existing-id-1');
      expect(savedMemory[1]).toHaveProperty('messageId');
      expect(savedMemory[1].messageId).not.toBe('existing-id-1'); // New ID
      expect(savedMemory[2].messageId).toBe('existing-id-3');
    });
  });

  describe('Error handling', () => {
    test('provides meaningful error messages for missing worlds', async () => {
      mockStorageAPI.loadWorld.mockResolvedValue(null);
      
      try {
        await migrateMessageIds('does-not-exist');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeTruthy();
        expect(String(error)).toMatch(/not found/i);
      }
    });
  });

  describe('editUserMessage', () => {
    test('should throw error when world not found', async () => {
      mockStorageAPI.loadWorld.mockResolvedValue(null);

      await expect(
        editUserMessage('nonexistent-world', 'msg-1', 'new content', 'chat-1')
      ).rejects.toThrow(/not found/);
    });

    test('should throw error when world.isProcessing is true', async () => {
      const mockWorld = createMockWorld({ isProcessing: true });

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([]);

      await expect(
        editUserMessage('test-world', 'msg-1', 'new content', 'chat-1')
      ).rejects.toThrow(/Cannot edit message while world is processing/);
    });

    test('should call removeMessagesFrom and resolve when successful', async () => {
      const mockWorld = createMockWorld({ isProcessing: false, currentChatId: 'chat-1' });
      const mockAgent = createMockAgent({
        memory: [
          { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' },
          { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' }
        ]
      });
      const mockMemory: AgentMessage[] = mockAgent.memory;

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent]);
      mockStorageAPI.getMemory.mockResolvedValue(mockMemory);
      mockStorageAPI.loadAgent.mockResolvedValue(mockAgent);
      mockStorageAPI.saveAgentMemory.mockResolvedValue();

      // Mock publishMessage to avoid actual message publishing
      jest.mock('../../core/events.js', () => ({
        publishMessage: jest.fn().mockReturnValue({ messageId: 'new-msg-id' })
      }));

      const result = await editUserMessage('test-world', 'msg-1', 'new content', 'chat-1');

      // Verify removeMessagesFrom was called (through the edit flow)
      expect(mockStorageAPI.saveAgentMemory).toHaveBeenCalled();
      
      // Verify result structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('messageId', 'msg-1');
      expect(result).toHaveProperty('resubmissionStatus');
    });

    test('should skip resubmission when session mode is OFF', async () => {
      const mockWorld = createMockWorld({ isProcessing: false, currentChatId: null });
      const mockAgent = createMockAgent({
        memory: [
          { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' }
        ]
      });
      const mockMemory: AgentMessage[] = mockAgent.memory;

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent]);
      mockStorageAPI.getMemory.mockResolvedValue(mockMemory);
      mockStorageAPI.loadAgent.mockResolvedValue(mockAgent);
      mockStorageAPI.saveAgentMemory.mockResolvedValue();

      const result = await editUserMessage('test-world', 'msg-1', 'new content', 'chat-1');

      // Verify resubmission was skipped
      expect(result.resubmissionStatus).toBe('skipped');
      expect(result).toHaveProperty('resubmissionError');
      expect(result.resubmissionError).toMatch(/Session mode is OFF/);
    });

    test('should fail resubmission when chat does not match current chat', async () => {
      const mockWorld = createMockWorld({ isProcessing: false, currentChatId: 'chat-2' }); // Different chat
      const mockAgent = createMockAgent({
        memory: [
          { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' }
        ]
      });
      const mockMemory: AgentMessage[] = mockAgent.memory;

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent]);
      mockStorageAPI.getMemory.mockResolvedValue(mockMemory);
      mockStorageAPI.loadAgent.mockResolvedValue(mockAgent);
      mockStorageAPI.saveAgentMemory.mockResolvedValue();

      const result = await editUserMessage('test-world', 'msg-1', 'new content', 'chat-1');

      // Verify resubmission failed with appropriate error
      expect(result.resubmissionStatus).toBe('failed');
      expect(result).toHaveProperty('resubmissionError');
      expect(result.resubmissionError).toMatch(/Cannot resubmit.*current chat/);
    });
  });
});
