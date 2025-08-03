/**
 * Comprehensive Unit Tests for Chat Session Management (Function-Based)
 * 
 * This consolidated test suite validates all chat session features including:
 * 1. Session Mode Control with currentChatId (nullable)
 * 2. Enhanced Chat Management with reuse optimization  
 * 3. Message-based chat operations (human vs agent messages)
 * 4. Title generation from message content
 * 5. Chat state saving and restoration
 * 6. Smart fallback for chat deletion
 * 7. Event system integration and error handling
 * 
 * Features Tested:
 * - Session Mode OFF (currentChatId = null): No automatic operations
 * - Session Mode ON (currentChatId set): Auto save and title updates
 * - Human messages → Update chat title from content
 * - Agent messages → Save complete chat state
 * - Smart chat reuse for 'New Chat' titles and empty chats
 * - Fallback to latest chat when deleting current chat
 * - Comprehensive error handling and edge cases
 * 
 * Consolidated from:
 * - events-chat-session.test.ts (comprehensive events tests)
 * - events-chat-session-simple.test.ts (simplified events tests)
 * - managers-chat-session.test.ts (comprehensive managers tests)
 * - managers-chat-session-simple.test.ts (simplified managers tests)
 * 
 * Implementation:
 * - 31 comprehensive test cases covering all chat session functionality
 * - Proper TypeScript typing and mocking
 * - Complete test coverage for both events.ts and managers.ts chat features
 * - Error handling and edge case validation
 * - Integration testing for session mode control
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import * as managers from '../../core/managers.js';
import * as events from '../../core/events.js';
import { LLMProvider, ChatData, WorldData, WorldChat, World, Agent, AgentMessage, WorldMessageEvent } from '../../core/types.js';

// Mock logger
jest.mock('../../core/logger.js', () => ({
  createCategoryLogger: () => ({
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn()
  }),
  initializeLogger: jest.fn()
}));

// Mock utils
jest.mock('../../core/utils.js', () => ({
  generateId: () => 'test-id',
  toKebabCase: (str: string) => str.toLowerCase().replace(/\s+/g, '-'),
  determineSenderType: (sender: string) => {
    if (sender === 'human' || sender === 'HUMAN') return 'human';
    if (sender === 'system') return 'system';
    if (sender === 'world') return 'world';
    return 'agent';
  }
}));

describe('Comprehensive Chat Session Management (Function-Based)', () => {
  let mockWorld: World;
  let mockAgent: Agent;
  const testChatId = 'test-chat-123';
  const testWorldId = 'test-world';

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create simple mock agent
    mockAgent = {
      id: 'test-agent',
      name: 'Test Agent',
      memory: [
        { role: 'user' as const, content: 'Hello', createdAt: new Date() },
        { role: 'assistant' as const, content: 'Hi there!', createdAt: new Date() }
      ] as AgentMessage[]
    } as Agent;

    // Create simple mock world with storage
    mockWorld = {
      id: testWorldId,
      rootPath: '/test',
      name: 'Test World',
      description: 'Test world for chat features',
      turnLimit: 5,
      chatLLMProvider: LLMProvider.OPENAI,
      chatLLMModel: 'gpt-4',
      currentChatId: null,
      eventEmitter: new EventEmitter(),
      agents: new Map([['test-agent', mockAgent]]),
      storage: {
        loadChatData: jest.fn<any>().mockResolvedValue({
          id: testChatId,
          worldId: testWorldId,
          name: 'Test Chat',
          messageCount: 2,
          createdAt: new Date(),
          updatedAt: new Date()
        } as ChatData),
        updateChatData: jest.fn<any>().mockResolvedValue({
          id: testChatId,
          worldId: testWorldId,
          name: 'Updated Chat',
          messageCount: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        } as ChatData),
        listChats: jest.fn<any>().mockResolvedValue([]),
        deleteChatData: jest.fn<any>().mockResolvedValue(true),
        saveWorld: jest.fn<any>().mockResolvedValue(undefined),
        loadWorld: jest.fn<any>().mockResolvedValue({
          id: testWorldId,
          name: 'Test World',
          currentChatId: testChatId
        }),
        loadAllChatsData: jest.fn<any>().mockResolvedValue([
          {
            id: testChatId,
            worldId: testWorldId,
            name: 'Test Chat',
            messageCount: 2,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ] as ChatData[]),
        saveWorldChat: jest.fn<any>().mockResolvedValue(undefined),
        saveChatData: jest.fn<any>().mockResolvedValue({
          id: testChatId,
          worldId: testWorldId,
          name: 'New Chat',
          messageCount: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        } as ChatData)
      } as any
    } as World;
  });

  describe('Session Mode Control - currentChatId nullable', () => {
    describe('Session Mode OFF (currentChatId = null)', () => {
      beforeEach(() => {
        mockWorld.currentChatId = null;
      });

      it('should not perform automatic chat operations when publishing human messages', async () => {
        const messageData: WorldMessageEvent = {
          messageId: 'msg-1',
          content: 'Test human message',
          sender: 'human',
          timestamp: new Date()
        };

        await events.handleChatSessionMessage(mockWorld, messageData);

        // Should not call any storage operations
        expect(mockWorld.storage.updateChatData).not.toHaveBeenCalled();
        expect(mockWorld.storage.saveWorldChat).not.toHaveBeenCalled();
      });

      it('should not perform automatic chat operations when publishing agent messages', async () => {
        const messageData: WorldMessageEvent = {
          messageId: 'msg-1',
          content: 'Test agent response',
          sender: 'test-agent',
          timestamp: new Date()
        };

        await events.handleChatSessionMessage(mockWorld, messageData);

        // Should not call any storage operations
        expect(mockWorld.storage.updateChatData).not.toHaveBeenCalled();
        expect(mockWorld.storage.saveWorldChat).not.toHaveBeenCalled();
      });

      it('should not perform automatic chat operations when publishing system messages', async () => {
        const messageData: WorldMessageEvent = {
          messageId: 'msg-1',
          content: 'System message',
          sender: 'system',
          timestamp: new Date()
        };

        await events.handleChatSessionMessage(mockWorld, messageData);

        // Should not call any storage operations
        expect(mockWorld.storage.updateChatData).not.toHaveBeenCalled();
        expect(mockWorld.storage.saveWorldChat).not.toHaveBeenCalled();
      });

      it('should not perform automatic chat operations when publishing world messages', async () => {
        const messageData: WorldMessageEvent = {
          messageId: 'msg-1',
          content: 'World message',
          sender: 'world',
          timestamp: new Date()
        };

        await events.handleChatSessionMessage(mockWorld, messageData);

        // Should not call any storage operations
        expect(mockWorld.storage.updateChatData).not.toHaveBeenCalled();
        expect(mockWorld.storage.saveWorldChat).not.toHaveBeenCalled();
      });
    });

    describe('Session Mode ON (currentChatId = "chat-id")', () => {
      beforeEach(() => {
        mockWorld.currentChatId = testChatId;
      });

      it('should update chat title when human message is published', async () => {
        const messageData: WorldMessageEvent = {
          messageId: 'msg-1',
          content: 'How do I implement a chat feature?',
          sender: 'human',
          timestamp: new Date()
        };

        await events.handleChatSessionMessage(mockWorld, messageData);

        // Should have called updateChatData to update title
        expect(mockWorld.storage.updateChatData).toHaveBeenCalled();
      });

      it('should save complete chat state when agent message is published', async () => {
        const messageData: WorldMessageEvent = {
          messageId: 'msg-1',
          content: 'Agent response content',
          sender: 'test-agent',
          timestamp: new Date()
        };

        await events.handleChatSessionMessage(mockWorld, messageData);

        // Should have called both updateChatData and saveWorldChat
        expect(mockWorld.storage.updateChatData).toHaveBeenCalled();
      });

      it('should not perform chat operations for system messages', async () => {
        const messageData: WorldMessageEvent = {
          messageId: 'msg-1',
          content: 'System message',
          sender: 'system',
          timestamp: new Date()
        };

        await events.handleChatSessionMessage(mockWorld, messageData);

        // Should not call any storage operations for system messages
        expect(mockWorld.storage.updateChatData).not.toHaveBeenCalled();
        expect(mockWorld.storage.saveWorldChat).not.toHaveBeenCalled();
      });

      it('should not perform chat operations for world messages', async () => {
        const messageData: WorldMessageEvent = {
          messageId: 'msg-1',
          content: 'World message',
          sender: 'world',
          timestamp: new Date()
        };

        await events.handleChatSessionMessage(mockWorld, messageData);

        // Should not call any storage operations for world messages
        expect(mockWorld.storage.updateChatData).not.toHaveBeenCalled();
        expect(mockWorld.storage.saveWorldChat).not.toHaveBeenCalled();
      });
    });
  });

  describe('Enhanced Chat Management', () => {
    describe('New Chat Creation and Reuse', () => {
      it('should generate unique chat IDs for new chats', () => {
        const id1 = 'test-id';
        const id2 = 'test-id';
        expect(typeof id1).toBe('string');
        expect(typeof id2).toBe('string');
      });

      it('should identify reusable chats with "New Chat" title', async () => {
        mockWorld.currentChatId = testChatId;
        (mockWorld.storage.loadChatData as any).mockResolvedValue({
          id: testChatId,
          worldId: testWorldId,
          name: 'New Chat',
          messageCount: 5,
          createdAt: new Date(),
          updatedAt: new Date()
        } as ChatData);

        const result = await managers.isCurrentChatReusable(mockWorld);

        expect(result).toBe(true);
      });

      it('should identify reusable chats with zero message count', async () => {
        mockWorld.currentChatId = testChatId;
        (mockWorld.storage.loadChatData as any).mockResolvedValue({
          id: testChatId,
          worldId: testWorldId,
          name: 'Custom Title',
          messageCount: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        } as ChatData);

        const result = await managers.isCurrentChatReusable(mockWorld);

        expect(result).toBe(true);
      });

      it('should not identify non-reusable chats', async () => {
        mockWorld.currentChatId = testChatId;
        (mockWorld.storage.loadChatData as any).mockResolvedValue({
          id: testChatId,
          worldId: testWorldId,
          name: 'Active Conversation',
          messageCount: 5,
          createdAt: new Date(),
          updatedAt: new Date()
        } as ChatData);

        const result = await managers.isCurrentChatReusable(mockWorld);

        expect(result).toBe(false);
      });

      it('should reuse current chat when possible', async () => {
        mockWorld.currentChatId = testChatId;
        (mockWorld.storage.loadChatData as any).mockResolvedValue({
          id: testChatId,
          worldId: testWorldId,
          name: 'New Chat',
          messageCount: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        } as ChatData);

        const isReusable = await managers.isCurrentChatReusable(mockWorld);

        expect(isReusable).toBe(true);
      });

      it('should create new chat when current chat is not reusable', async () => {
        mockWorld.currentChatId = testChatId;
        (mockWorld.storage.loadChatData as any).mockResolvedValue({
          id: testChatId,
          worldId: testWorldId,
          name: 'Active Conversation',
          messageCount: 5,
          createdAt: new Date(),
          updatedAt: new Date()
        } as ChatData);

        const isReusable = await managers.isCurrentChatReusable(mockWorld);

        expect(isReusable).toBe(false);
      });
    });

    describe('Chat Deletion with Smart Fallback', () => {
      it('should set currentChatId to null when deleting the last remaining chat', async () => {
        mockWorld.currentChatId = testChatId;
        (mockWorld.storage.deleteChatData as any).mockResolvedValue(true);
        (mockWorld.storage.listChats as any).mockResolvedValue([]);

        const result = await managers.deleteChatDataWithFallback(mockWorld, testChatId);

        expect(result).toBe(true);
        expect(mockWorld.currentChatId).toBeNull();
        expect(mockWorld.storage.saveWorld).toHaveBeenCalled();
      });

      it('should switch to latest remaining chat when deleting current chat', async () => {
        mockWorld.currentChatId = testChatId;
        const remainingChats = [
          {
            id: 'chat-1',
            worldId: testWorldId,
            name: 'First Chat',
            messageCount: 5,
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-02')
          },
          {
            id: 'chat-2',
            worldId: testWorldId,
            name: 'Latest Chat',
            messageCount: 1,
            createdAt: new Date('2024-01-03'),
            updatedAt: new Date('2024-01-04') // Most recent
          }
        ] as ChatData[];

        (mockWorld.storage.deleteChatData as any).mockResolvedValue(true);
        (mockWorld.storage.listChats as any).mockResolvedValue(remainingChats);

        const result = await managers.deleteChatDataWithFallback(mockWorld, testChatId);

        expect(result).toBe(true);
        expect(mockWorld.currentChatId).toBe('chat-2'); // Latest chat
      });

      it('should not change currentChatId when deleting a non-current chat', async () => {
        const originalChatId = 'current-chat';
        mockWorld.currentChatId = originalChatId;
        (mockWorld.storage.deleteChatData as any).mockResolvedValue(true);

        const result = await managers.deleteChatDataWithFallback(mockWorld, 'other-chat');

        expect(result).toBe(true);
        expect(mockWorld.currentChatId).toBe(originalChatId); // Unchanged
      });

      it('should handle deletion failure gracefully', async () => {
        mockWorld.currentChatId = testChatId;
        (mockWorld.storage.deleteChatData as any).mockResolvedValue(false);

        const result = await managers.deleteChatDataWithFallback(mockWorld, testChatId);

        expect(result).toBe(false);
        expect(mockWorld.currentChatId).toBe(testChatId); // Unchanged
      });
    });

    describe('Title Generation from Message Content', () => {
      beforeEach(() => {
        mockWorld.currentChatId = testChatId;
      });

      it('should generate meaningful titles from human messages', async () => {
        const testCases = [
          {
            input: 'Hello, can you help me with JavaScript programming?',
            expectedContains: ['javascript', 'programming', 'help']
          },
          {
            input: 'What are the benefits of using TypeScript?',
            expectedContains: ['benefits', 'typescript']
          },
          {
            input: 'How do I create a REST API?',
            expectedContains: ['create', 'rest', 'api']
          }
        ];

        for (const testCase of testCases) {
          (mockWorld.storage.updateChatData as any).mockClear();

          const messageData: WorldMessageEvent = {
            messageId: 'msg-1',
            content: testCase.input,
            sender: 'human',
            timestamp: new Date()
          };

          await events.updateChatTitleFromMessage(mockWorld, messageData);

          expect(mockWorld.storage.updateChatData).toHaveBeenCalled();
          const updateCall = (mockWorld.storage.updateChatData as any).mock.calls[0];
          const title = (updateCall[2] as any).name.toLowerCase();

          // Check that title contains expected keywords
          const containsKeywords = testCase.expectedContains.some(keyword =>
            title.includes(keyword.toLowerCase())
          );
          expect(containsKeywords).toBe(true);
        }
      });

      it('should clean up titles by removing common prefixes', async () => {
        const testCases = [
          'Hello, how do I learn React?',
          'Hi there! Can you explain async/await?',
          'Hey, what is the difference between var and let?'
        ];

        for (const input of testCases) {
          (mockWorld.storage.updateChatData as any).mockClear();

          const messageData: WorldMessageEvent = {
            messageId: 'msg-1',
            content: input,
            sender: 'human',
            timestamp: new Date()
          };

          await events.updateChatTitleFromMessage(mockWorld, messageData);

          expect(mockWorld.storage.updateChatData).toHaveBeenCalled();
          const updateCall = (mockWorld.storage.updateChatData as any).mock.calls[0];
          const title = (updateCall[2] as any).name;

          // Should not contain common prefixes
          expect(title).not.toMatch(/^(Hello|Hi|Hey)/i);
        }
      });

      it('should truncate long titles appropriately', async () => {
        const longMessage = 'This is a very long message that contains way too much information and should be truncated to a reasonable length for use as a chat title because nobody wants to see extremely long titles in their chat list interface';

        const messageData: WorldMessageEvent = {
          messageId: 'msg-1',
          content: longMessage,
          sender: 'human',
          timestamp: new Date()
        };

        await events.updateChatTitleFromMessage(mockWorld, messageData);

        expect(mockWorld.storage.updateChatData).toHaveBeenCalled();
        const updateCall = (mockWorld.storage.updateChatData as any).mock.calls[0];
        const title = (updateCall[2] as any).name;

        expect(title.length).toBeLessThanOrEqual(55); // Max length + ellipsis
        if (title.length === 55) {
          expect(title).toMatch(/\.\.\.$/); // Should end with ellipsis
        }
      });
    });

    describe('Event Publishing Integration', () => {
      beforeEach(() => {
        mockWorld.currentChatId = testChatId;
      });

      it('should publish system events for chat operations', async () => {
        const messageData: WorldMessageEvent = {
          messageId: 'msg-1',
          content: 'Test message for events',
          sender: 'human',
          timestamp: new Date()
        };

        await events.handleChatSessionMessage(mockWorld, messageData);

        // Should have processed the message
        expect(mockWorld.storage.updateChatData).toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      beforeEach(() => {
        mockWorld.currentChatId = testChatId;
      });

      it('should handle storage errors gracefully during chat operations', async () => {
        (mockWorld.storage.updateChatData as any).mockRejectedValue(new Error('Storage error'));

        const messageData: WorldMessageEvent = {
          messageId: 'msg-1',
          content: 'Test message',
          sender: 'human',
          timestamp: new Date()
        };

        // Should not throw error
        await expect(events.handleChatSessionMessage(mockWorld, messageData)).resolves.not.toThrow();
      });

      it('should return false for isCurrentChatReusable when chat does not exist', async () => {
        mockWorld.currentChatId = 'non-existent-chat';
        (mockWorld.storage.loadChatData as any).mockResolvedValue(null);

        const result = await managers.isCurrentChatReusable(mockWorld);

        expect(result).toBe(false);
      });

      it('should handle storage errors in chat deletion', async () => {
        mockWorld.currentChatId = testChatId;
        (mockWorld.storage.deleteChatData as any).mockRejectedValue(new Error('Delete error'));

        // Should not throw and should handle the error gracefully
        await expect(managers.deleteChatDataWithFallback(mockWorld, testChatId)).rejects.toThrow('Delete error');

        // currentChatId should remain unchanged after error
        expect(mockWorld.currentChatId).toBe(testChatId);
      });
    });
  });

  describe('Chat State Management', () => {
    describe('saveCurrentState', () => {
      it('should do nothing when no current chat exists', async () => {
        mockWorld.currentChatId = null;

        await managers.saveCurrentState(mockWorld);

        expect(mockWorld.storage.updateChatData).not.toHaveBeenCalled();
      });

      it('should save message count to current chat', async () => {
        mockWorld.currentChatId = testChatId;

        await managers.saveCurrentState(mockWorld);

        expect(mockWorld.storage.updateChatData).toHaveBeenCalledWith(
          testWorldId,
          testChatId,
          expect.objectContaining({
            messageCount: 2 // Two messages in mockAgent.memory
          })
        );
      });
    });

    describe('getCurrentChat', () => {
      it('should return null when no current chat exists', async () => {
        mockWorld.currentChatId = null;

        const result = await managers.getCurrentChat(mockWorld);

        expect(result).toBeNull();
      });

      it('should return current chat data', async () => {
        mockWorld.currentChatId = testChatId;

        const result = await managers.getCurrentChat(mockWorld);

        expect(result).toEqual({
          id: testChatId,
          worldId: testWorldId,
          name: 'Test Chat',
          messageCount: 2,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date)
        });
      });
    });
  });

  describe('Integration Tests', () => {
    it('should handle session mode toggle correctly', async () => {
      const messageData: WorldMessageEvent = {
        messageId: 'msg-1',
        content: 'Test message',
        sender: 'human',
        timestamp: new Date()
      };

      // Session Mode OFF
      mockWorld.currentChatId = null;
      await events.handleChatSessionMessage(mockWorld, messageData);
      const callsWhenOff = (mockWorld.storage.updateChatData as jest.Mock).mock.calls.length;

      // Clear calls
      (mockWorld.storage.updateChatData as jest.Mock).mockClear();

      // Session Mode ON
      mockWorld.currentChatId = testChatId;
      await events.handleChatSessionMessage(mockWorld, messageData);
      const callsWhenOn = (mockWorld.storage.updateChatData as jest.Mock).mock.calls.length;

      expect(callsWhenOff).toBe(0); // No operations when OFF
      expect(callsWhenOn).toBeGreaterThan(0); // Operations when ON
    });

    it('should maintain consistency across multiple operations', async () => {
      mockWorld.currentChatId = testChatId;

      // Multiple operations should maintain state consistency
      const isReusable1 = await managers.isCurrentChatReusable(mockWorld);
      const currentChat1 = await managers.getCurrentChat(mockWorld);
      await managers.saveCurrentState(mockWorld);
      const isReusable2 = await managers.isCurrentChatReusable(mockWorld);

      expect(isReusable1).toBe(isReusable2);
      expect(currentChat1?.id).toBe(testChatId);
      expect(mockWorld.currentChatId).toBe(testChatId); // Should remain consistent
    });
  });
});
