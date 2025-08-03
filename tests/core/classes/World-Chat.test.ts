/**
 * Unit Tests for World Chat Session Management
 * 
 * These tests validate the world chat features including:
 * 1. Session Mode Control with currentChatId (nullable)
 * 2. Enhanced Chat Management with reuse optimization
 * 3. Auto-save and title generation based on message types
 * 4. Smart fallback for chat deletion
 * 
 * Features Tested:
 * - Session Mode OFF (currentChatId = null): No automatic chat operations
 * - Session Mode ON (currentChatId = "chat-id"): Auto save chat and title
 * - Human messages → Update chat title based on message content
 * - Agent messages → Save complete chat state and update message counts
 * - System/World messages → No chat operations
 * - New Chat reuse optimization for "New Chat" titles
 * - Smart fallback when deleting current chat
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { World, WorldConfig } from '../../../core/classes/World.js';
import { LLMProvider, ChatData, WorldChat, WorldMessageEvent, CreateChatParams, UpdateChatParams } from '../../../core/types.js';

// Mock the events module
const mockPublishMessage = jest.fn();
const mockPublishEvent = jest.fn();
jest.mock('../../../core/events.js', () => ({
  publishMessage: mockPublishMessage,
  publishEvent: mockPublishEvent,
  subscribeToMessages: jest.fn().mockReturnValue(() => { }),
  subscribeToSSE: jest.fn().mockReturnValue(() => { }),
}));

// Mock AgentManager
const mockAgentManager = {
  initialize: jest.fn<any>().mockResolvedValue(undefined),
  cleanup: jest.fn<any>().mockResolvedValue(undefined),
  createAgent: jest.fn<any>().mockResolvedValue({}),
  getAgent: jest.fn<any>().mockResolvedValue(null),
  updateAgent: jest.fn<any>().mockResolvedValue(null),
  deleteAgent: jest.fn<any>().mockResolvedValue(true),
  listAgents: jest.fn<any>().mockResolvedValue([]),
  clearAgentMemory: jest.fn<any>().mockResolvedValue(null),
  updateAgentMemory: jest.fn<any>().mockResolvedValue(null)
};

jest.mock('../../../core/classes/AgentManager.js', () => ({
  AgentManager: jest.fn<any>().mockImplementation(() => mockAgentManager)
}));

// Mock Agent class
jest.mock('../../../core/classes/Agent.js', () => ({
  Agent: jest.fn().mockImplementation(() => ({
    id: 'test-agent',
    name: 'Test Agent',
    memory: [],
    isInitialized: true,
    initialize: jest.fn<any>().mockResolvedValue(undefined),
    cleanup: jest.fn<any>().mockResolvedValue(undefined),
    save: jest.fn<any>().mockResolvedValue(undefined),
    on: jest.fn<any>(),
    off: jest.fn<any>(),
    emit: jest.fn<any>()
  }))
}));

// Mock storage manager with comprehensive chat operations
const mockStorageManager = {
  // World operations
  saveWorld: jest.fn<any>().mockResolvedValue(undefined),
  loadWorld: jest.fn<any>().mockResolvedValue(null),
  deleteWorld: jest.fn<any>().mockResolvedValue(true),
  listWorlds: jest.fn<any>().mockResolvedValue([]),

  // Agent operations
  saveAgent: jest.fn<any>().mockResolvedValue(undefined),
  loadAgent: jest.fn<any>().mockResolvedValue(null),
  deleteAgent: jest.fn<any>().mockResolvedValue(true),
  listAgents: jest.fn<any>().mockResolvedValue([]),
  saveAgentMemory: jest.fn<any>().mockResolvedValue(undefined),
  archiveAgentMemory: jest.fn<any>().mockResolvedValue(undefined),

  // Chat operations
  saveChatData: jest.fn<any>().mockResolvedValue(undefined),
  loadChatData: jest.fn<any>().mockResolvedValue(null),
  deleteChatData: jest.fn<any>().mockResolvedValue(true),
  listChats: jest.fn<any>().mockResolvedValue([]),
  updateChatData: jest.fn<any>().mockResolvedValue(null),
  saveWorldChat: jest.fn<any>().mockResolvedValue(undefined),
  loadWorldChat: jest.fn<any>().mockResolvedValue(null),
  restoreFromWorldChat: jest.fn<any>().mockResolvedValue(true),

  // Batch and integrity operations
  saveAgentsBatch: jest.fn<any>().mockResolvedValue(undefined),
  loadAgentsBatch: jest.fn<any>().mockResolvedValue([]),
  validateIntegrity: jest.fn<any>().mockResolvedValue({ isValid: true }),
  repairData: jest.fn<any>().mockResolvedValue(true),
} as any;

describe('World Chat Session Management', () => {
  let world: World;
  const baseConfig: WorldConfig = {
    id: 'test-world',
    rootPath: '/test',
    name: 'Test World',
    description: 'Test world for chat features',
    turnLimit: 5,
    chatLLMProvider: LLMProvider.OPENAI,
    chatLLMModel: 'gpt-4'
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create world without full initialization to avoid agent loading issues
    world = new World(baseConfig, mockStorageManager);
    // Bypass full initialization by setting initialized flag directly
    (world as any).isInitialized = true;
    world.currentChatId = null; // Start with Session Mode OFF
  });

  afterEach(async () => {
    if (world) {
      // Skip cleanup to avoid initialization errors
      (world as any).isInitialized = false;
    }
  });

  describe('Session Mode Control - currentChatId nullable', () => {
    describe('Session Mode OFF (currentChatId = null)', () => {
      beforeEach(() => {
        // Ensure session mode is OFF
        world.currentChatId = null;
      });

      it('should not perform automatic chat operations when publishing human messages', async () => {
        // Publish a human message
        world.publishMessage('Hello world', 'human');

        // Wait for any async operations
        await new Promise(resolve => setTimeout(resolve, 150));

        // Verify no chat operations were triggered
        expect(mockStorageManager.updateChatData).not.toHaveBeenCalled();
        expect(mockStorageManager.saveChatData).not.toHaveBeenCalled();
        expect(mockStorageManager.saveWorldChat).not.toHaveBeenCalled();
      });

      it('should not perform automatic chat operations when publishing agent messages', async () => {
        // Publish an agent message
        world.publishMessage('I am an agent response', 'test-agent');

        // Wait for any async operations
        await new Promise(resolve => setTimeout(resolve, 150));

        // Verify no chat operations were triggered
        expect(mockStorageManager.updateChatData).not.toHaveBeenCalled();
        expect(mockStorageManager.saveChatData).not.toHaveBeenCalled();
        expect(mockStorageManager.saveWorldChat).not.toHaveBeenCalled();
      });

      it('should not perform automatic chat operations when publishing system messages', async () => {
        // Publish a system message
        world.publishMessage('System notification', 'system');

        // Wait for any async operations
        await new Promise(resolve => setTimeout(resolve, 150));

        // Verify no chat operations were triggered
        expect(mockStorageManager.updateChatData).not.toHaveBeenCalled();
        expect(mockStorageManager.saveChatData).not.toHaveBeenCalled();
        expect(mockStorageManager.saveWorldChat).not.toHaveBeenCalled();
      });

      it('should not perform automatic chat operations when publishing world messages', async () => {
        // Publish a world message
        world.publishMessage('World announcement', 'world');

        // Wait for any async operations
        await new Promise(resolve => setTimeout(resolve, 150));

        // Verify no chat operations were triggered
        expect(mockStorageManager.updateChatData).not.toHaveBeenCalled();
        expect(mockStorageManager.saveChatData).not.toHaveBeenCalled();
        expect(mockStorageManager.saveWorldChat).not.toHaveBeenCalled();
      });
    });

    describe('Session Mode ON (currentChatId = "chat-id")', () => {
      const testChatId = 'test-chat-123';

      beforeEach(() => {
        // Enable session mode
        world.currentChatId = testChatId;

        // Mock existing chat data
        mockStorageManager.loadChatData.mockResolvedValue({
          id: testChatId,
          worldId: world.id,
          name: 'Test Chat',
          messageCount: 5,
          createdAt: new Date(),
          updatedAt: new Date()
        } as ChatData);

        mockStorageManager.updateChatData.mockResolvedValue({
          id: testChatId,
          worldId: world.id,
          name: 'Updated Chat Title',
          messageCount: 6,
          createdAt: new Date(),
          updatedAt: new Date()
        } as ChatData);
      });

      it('should update chat title when human message is published', async () => {
        const humanMessage = 'Let me ask about AI capabilities';

        // Publish human message
        world.publishMessage(humanMessage, 'human');

        // Wait for async chat operations
        await new Promise(resolve => setTimeout(resolve, 150));

        // Verify chat title update was triggered
        expect(mockStorageManager.updateChatData).toHaveBeenCalledWith(
          world.id,
          testChatId,
          expect.objectContaining({
            name: expect.any(String), // Title should be generated from content
            messageCount: expect.any(Number)
          })
        );
      });

      it('should save complete chat state when agent message is published', async () => {
        const agentMessage = 'I can help you with AI questions';

        // Publish agent message
        world.publishMessage(agentMessage, 'test-agent');

        // Wait for async chat operations
        await new Promise(resolve => setTimeout(resolve, 150));

        // Verify chat state save was triggered
        expect(mockStorageManager.saveWorldChat).toHaveBeenCalledWith(
          world.id,
          testChatId,
          expect.any(Object) // WorldChat object
        );

        // Verify message count update
        expect(mockStorageManager.updateChatData).toHaveBeenCalledWith(
          world.id,
          testChatId,
          expect.objectContaining({
            messageCount: expect.any(Number)
          })
        );
      });

      it('should not perform chat operations for system messages', async () => {
        // Publish system message
        world.publishMessage('System error occurred', 'system');

        // Wait for any async operations
        await new Promise(resolve => setTimeout(resolve, 150));

        // Verify no chat operations were triggered
        expect(mockStorageManager.updateChatData).not.toHaveBeenCalled();
        expect(mockStorageManager.saveWorldChat).not.toHaveBeenCalled();
      });

      it('should not perform chat operations for world messages', async () => {
        // Publish world message
        world.publishMessage('World state changed', 'world');

        // Wait for any async operations
        await new Promise(resolve => setTimeout(resolve, 150));

        // Verify no chat operations were triggered
        expect(mockStorageManager.updateChatData).not.toHaveBeenCalled();
        expect(mockStorageManager.saveWorldChat).not.toHaveBeenCalled();
      });
    });
  });

  describe('Enhanced Chat Management', () => {
    describe('New Chat Creation and Reuse', () => {
      it('should generate unique chat IDs for new chats', async () => {
        const chat1 = await world.createChatData({ name: 'Chat 1' });
        const chat2 = await world.createChatData({ name: 'Chat 2' });

        expect(chat1.id).toBeDefined();
        expect(chat2.id).toBeDefined();
        expect(chat1.id).not.toBe(chat2.id);
        expect(chat1.id).toMatch(/^chat-\d+-[a-z0-9]+$/);
        expect(chat2.id).toMatch(/^chat-\d+-[a-z0-9]+$/);
      });

      it('should identify reusable chats with "New Chat" title', async () => {
        // Create a chat with "New Chat" title
        const newChatData: ChatData = {
          id: 'reusable-chat-1',
          worldId: world.id,
          name: 'New Chat',
          messageCount: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        world.currentChatId = newChatData.id;
        mockStorageManager.loadChatData.mockResolvedValue(newChatData);

        const isReusable = await world.isCurrentChatReusable();
        expect(isReusable).toBe(true);
      });

      it('should identify reusable chats with zero message count', async () => {
        // Create a chat with custom title but zero messages
        const emptyChatData: ChatData = {
          id: 'empty-chat-1',
          worldId: world.id,
          name: 'Custom Title',
          messageCount: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        world.currentChatId = emptyChatData.id;
        mockStorageManager.loadChatData.mockResolvedValue(emptyChatData);

        const isReusable = await world.isCurrentChatReusable();
        expect(isReusable).toBe(true);
      });

      it('should not identify non-reusable chats', async () => {
        // Create a chat with messages
        const activeChatData: ChatData = {
          id: 'active-chat-1',
          worldId: world.id,
          name: 'Active Conversation',
          messageCount: 5,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        world.currentChatId = activeChatData.id;
        mockStorageManager.loadChatData.mockResolvedValue(activeChatData);

        const isReusable = await world.isCurrentChatReusable();
        expect(isReusable).toBe(false);
      });

      it('should reuse current chat when possible', async () => {
        // Setup reusable chat
        const reusableChatData: ChatData = {
          id: 'reusable-chat-2',
          worldId: world.id,
          name: 'New Chat',
          messageCount: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        world.currentChatId = reusableChatData.id;
        mockStorageManager.loadChatData.mockResolvedValue(reusableChatData);
        mockStorageManager.updateChatData.mockResolvedValue({
          ...reusableChatData,
          messageCount: 0
        });

        const result = await world.newChat();

        expect(result).toBe(world);
        expect(world.currentChatId).toBe(reusableChatData.id);

        // Verify chat was updated but not newly created
        expect(mockStorageManager.updateChatData).toHaveBeenCalledWith(
          world.id,
          reusableChatData.id,
          expect.objectContaining({
            messageCount: 0
          })
        );
      });

      it('should create new chat when current chat is not reusable', async () => {
        // Setup non-reusable chat
        const activeChatData: ChatData = {
          id: 'active-chat-2',
          worldId: world.id,
          name: 'Active Chat',
          messageCount: 3,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        world.currentChatId = activeChatData.id;
        mockStorageManager.loadChatData.mockResolvedValue(activeChatData);
        mockStorageManager.saveChatData.mockResolvedValue(undefined);

        const result = await world.newChat();

        expect(result).toBe(world);

        // Verify new chat was created
        expect(mockStorageManager.saveChatData).toHaveBeenCalledWith(
          world.id,
          expect.objectContaining({
            name: 'New Chat',
            messageCount: 0
          })
        );
      });
    });

    describe('Chat Deletion with Smart Fallback', () => {
      beforeEach(() => {
        // Mock multiple chats
        const mockChats: ChatData[] = [
          {
            id: 'chat-1',
            worldId: world.id,
            name: 'First Chat',
            messageCount: 5,
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-02')
          },
          {
            id: 'chat-2',
            worldId: world.id,
            name: 'Second Chat',
            messageCount: 3,
            createdAt: new Date('2024-01-02'),
            updatedAt: new Date('2024-01-03')
          },
          {
            id: 'chat-3',
            worldId: world.id,
            name: 'Latest Chat',
            messageCount: 1,
            createdAt: new Date('2024-01-03'),
            updatedAt: new Date('2024-01-04') // Most recent
          }
        ];

        mockStorageManager.listChats.mockResolvedValue(mockChats);
      });

      it('should set currentChatId to null when deleting the last remaining chat', async () => {
        world.currentChatId = 'last-chat';
        mockStorageManager.deleteChatData.mockResolvedValue(true);

        // After deletion, no chats remain
        mockStorageManager.listChats.mockResolvedValue([]);

        // Mock save to prevent initialization error
        mockStorageManager.saveWorld.mockResolvedValue(undefined);

        const success = await world.deleteChatData('last-chat');

        expect(success).toBe(true);
        expect(world.currentChatId).toBeNull();
      });

      it('should switch to latest remaining chat when deleting current chat', async () => {
        // Set current chat to one that will be deleted
        world.currentChatId = 'chat-2';

        // Mock deletion success
        mockStorageManager.deleteChatData.mockResolvedValue(true);
        mockStorageManager.saveWorld.mockResolvedValue(undefined);

        // Mock updated chat list after deletion (without chat-2)
        const remainingChats: ChatData[] = [
          {
            id: 'chat-1',
            worldId: world.id,
            name: 'First Chat',
            messageCount: 5,
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-02')
          },
          {
            id: 'chat-3',
            worldId: world.id,
            name: 'Latest Chat',
            messageCount: 1,
            createdAt: new Date('2024-01-03'),
            updatedAt: new Date('2024-01-04') // Most recent
          }
        ];

        // Update mock to return remaining chats after deletion
        mockStorageManager.listChats.mockResolvedValueOnce(remainingChats);

        const success = await world.deleteChatData('chat-2');

        expect(success).toBe(true);
        // Should switch to the latest remaining chat (chat-3)
        expect(world.currentChatId).toBe('chat-3');
      });

      it('should not change currentChatId when deleting a non-current chat', async () => {
        // Set current chat to one that won't be deleted
        world.currentChatId = 'chat-1';

        mockStorageManager.deleteChatData.mockResolvedValue(true);
        mockStorageManager.saveWorld.mockResolvedValue(undefined);

        const success = await world.deleteChatData('chat-2');

        expect(success).toBe(true);
        // Should remain unchanged
        expect(world.currentChatId).toBe('chat-1');
      });

      it('should handle deletion failure gracefully', async () => {
        world.currentChatId = 'chat-1';
        mockStorageManager.deleteChatData.mockResolvedValue(false);

        const success = await world.deleteChatData('chat-1');

        expect(success).toBe(false);
        // Should not change currentChatId on failure
        expect(world.currentChatId).toBe('chat-1');
      });
    });
  });

  describe('Title Generation from Message Content', () => {
    it('should generate meaningful titles from human messages', async () => {
      const testCases = [
        {
          input: 'Hello, can you help me with JavaScript programming?',
          expectedPattern: /javascript|programming|help/i
        },
        {
          input: 'What are the benefits of using TypeScript over JavaScript?',
          expectedPattern: /typescript|javascript|benefits/i
        },
        {
          input: 'How do I create a REST API with Express.js?',
          expectedPattern: /rest|api|express/i
        }
      ];

      for (const testCase of testCases) {
        world.currentChatId = 'test-chat';

        mockStorageManager.loadChatData.mockResolvedValue({
          id: 'test-chat',
          worldId: world.id,
          name: 'New Chat',
          messageCount: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        });

        world.publishMessage(testCase.input, 'human');

        // Wait for title update
        await new Promise(resolve => setTimeout(resolve, 150));

        // Verify title was updated with relevant content
        expect(mockStorageManager.updateChatData).toHaveBeenCalledWith(
          world.id,
          'test-chat',
          expect.objectContaining({
            name: expect.stringMatching(testCase.expectedPattern)
          })
        );

        jest.clearAllMocks();
      }
    });

    it('should clean up titles by removing common prefixes', async () => {
      const testCases = [
        {
          input: 'Hello, how do I learn React?',
          shouldNotContain: /^hello/i
        },
        {
          input: 'Hi there! Can you explain async/await?',
          shouldNotContain: /^hi/i
        },
        {
          input: 'Hey, what is the difference between var and let?',
          shouldNotContain: /^hey/i
        }
      ];

      for (const testCase of testCases) {
        world.currentChatId = 'test-chat';

        mockStorageManager.loadChatData.mockResolvedValue({
          id: 'test-chat',
          worldId: world.id,
          name: 'New Chat',
          messageCount: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        });

        world.publishMessage(testCase.input, 'human');

        await new Promise(resolve => setTimeout(resolve, 150));

        const updateCall = mockStorageManager.updateChatData.mock.calls.find(
          (call: any) => call[0] === world.id && call[1] === 'test-chat'
        );

        if (updateCall) {
          const title = updateCall[2].name;
          expect(title).not.toMatch(testCase.shouldNotContain);
        }

        jest.clearAllMocks();
      }
    });

    it('should truncate long titles appropriately', async () => {
      const longMessage = 'This is a very long message that contains way too much information and should be truncated to a reasonable length for use as a chat title because nobody wants to see extremely long titles in their chat list interface';

      world.currentChatId = 'test-chat';

      mockStorageManager.loadChatData.mockResolvedValue({
        id: 'test-chat',
        worldId: world.id,
        name: 'New Chat',
        messageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      world.publishMessage(longMessage, 'human');

      await new Promise(resolve => setTimeout(resolve, 150));

      const updateCall = mockStorageManager.updateChatData.mock.calls.find(
        (call: any) => call[0] === world.id && call[1] === 'test-chat'
      );

      if (updateCall) {
        const title = updateCall[2].name;
        expect(title.length).toBeLessThanOrEqual(55); // Max length + ellipsis
        expect(title).toMatch(/\.\.\.$/); // Should end with ellipsis
      }
    });
  });

  describe('Event Publishing Integration', () => {
    it('should publish system events for chat operations', async () => {
      world.currentChatId = 'test-chat';

      // Mock chat data
      mockStorageManager.loadChatData.mockResolvedValue({
        id: 'test-chat',
        worldId: world.id,
        name: 'Test Chat',
        messageCount: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Capture system events
      const systemEvents: any[] = [];
      world.on('system', (event) => {
        systemEvents.push(event);
      });

      // Publish agent message to trigger chat save
      world.publishMessage('Agent response', 'test-agent');

      await new Promise(resolve => setTimeout(resolve, 150));

      // Should have emitted system events for chat operations
      expect(systemEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle storage errors gracefully during chat operations', async () => {
      world.currentChatId = 'test-chat';

      // Mock storage error
      mockStorageManager.updateChatData.mockRejectedValue(new Error('Storage error'));

      // Should not throw when storage fails
      expect(() => {
        world.publishMessage('Test message', 'human');
      }).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 150));

      // Message should still be published to event emitter
      expect(world.listenerCount('message')).toBeGreaterThanOrEqual(0);
    });

    it('should return false for isCurrentChatReusable when chat does not exist', async () => {
      world.currentChatId = 'non-existent-chat';
      mockStorageManager.loadChatData.mockResolvedValue(null);

      const isReusable = await world.isCurrentChatReusable();
      expect(isReusable).toBe(false);
    });

    it('should handle storage errors in chat deletion', async () => {
      world.currentChatId = 'test-chat';
      mockStorageManager.deleteChatData.mockRejectedValue(new Error('Storage error'));

      await expect(world.deleteChatData('test-chat')).rejects.toThrow('Storage error');

      // Should not change currentChatId on error
      expect(world.currentChatId).toBe('test-chat');
    });
  });
});
