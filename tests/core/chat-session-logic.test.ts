/**
 * Chat Session Logic Tests
 * 
 * Tests the new chat session logic implementation:
 * 1. No auto-create chat on new message when currentChatId is null
 * 2. currentChatId nullable behavior - session mode on/off
 * 3. Human messages update chat title in session mode
 * 4. Agent messages save chat in session mode
 * 5. Chat-created and chat-updated system messages are published
 */

import { publishMessage } from '../../core/index.js';
import * as events from '../../core/events.js';
import { World, WorldSSEEvent, StorageManager, MessageProcessor } from '../../core/types.js';
import { EventEmitter } from 'events';

// Mock storage manager
const createMockStorageManager = (): StorageManager => ({
  saveWorld: jest.fn(),
  loadWorld: jest.fn(),
  deleteWorld: jest.fn(),
  listWorlds: jest.fn(),
  saveAgent: jest.fn(),
  loadAgent: jest.fn(),
  deleteAgent: jest.fn(),
  listAgents: jest.fn(),
  saveAgentsBatch: jest.fn(),
  loadAgentsBatch: jest.fn(),
  saveChatData: jest.fn(),
  loadChatData: jest.fn(),
  deleteChatData: jest.fn(),
  listChats: jest.fn(),
  updateChatData: jest.fn().mockResolvedValue({
    id: 'test-chat',
    name: 'Updated Title',
    worldId: 'test-world',
    messageCount: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  }),
  saveWorldChat: jest.fn(),
  loadWorldChat: jest.fn(),
  loadWorldChatFull: jest.fn(),
  restoreFromWorldChat: jest.fn(),
  validateIntegrity: jest.fn(),
  repairData: jest.fn()
});

// Mock message processor
const createMockMessageProcessor = (): MessageProcessor => ({
  extractMentions: jest.fn(),
  extractParagraphBeginningMentions: jest.fn(),
  determineSenderType: jest.fn(),
  shouldAutoMention: jest.fn(),
  addAutoMention: jest.fn(),
  removeSelfMentions: jest.fn()
});

// Create mock world
const createMockWorld = (currentChatId: string | null = null): World => ({
  id: 'test-world',
  rootPath: '/tmp/test',
  name: 'Test World',
  description: 'Test world for chat session logic',
  turnLimit: 5,
  currentChatId,
  eventEmitter: new EventEmitter(),
  agents: new Map(),
  storage: createMockStorageManager(),
  messageProcessor: createMockMessageProcessor(),

  // World methods (mocked)
  createAgent: jest.fn(),
  getAgent: jest.fn(),
  updateAgent: jest.fn(),
  deleteAgent: jest.fn(),
  clearAgentMemory: jest.fn(),
  listAgents: jest.fn(),
  updateAgentMemory: jest.fn(),
  saveAgentConfig: jest.fn(),
  createChatData: jest.fn(),
  loadChatData: jest.fn(),
  loadChat: jest.fn(),
  loadChatFull: jest.fn(),
  updateChatData: jest.fn(),
  deleteChatData: jest.fn(),
  listChats: jest.fn(),
  createWorldChat: jest.fn().mockResolvedValue({
    world: { id: 'test-world', name: 'Test World' },
    agents: [],
    messages: [],
    metadata: {
      capturedAt: new Date(),
      version: '1.0.0',
      totalMessages: 0,
      activeAgents: 0
    }
  }),
  restoreFromWorldChat: jest.fn(),
  newChat: jest.fn(),
  loadChatById: jest.fn(),
  getCurrentChat: jest.fn(),
  saveCurrentState: jest.fn(),
  isCurrentChatReusable: jest.fn(),
  reuseCurrentChat: jest.fn(),
  createNewChat: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
  reload: jest.fn(),
  getTurnLimit: jest.fn(),
  getCurrentTurnCount: jest.fn(),
  hasReachedTurnLimit: jest.fn(),
  resetTurnCount: jest.fn(),
  publishMessage: jest.fn(),
  subscribeToMessages: jest.fn(),
  publishSSE: jest.fn(),
  subscribeToSSE: jest.fn(),
  subscribeAgent: jest.fn(),
  unsubscribeAgent: jest.fn(),
  getSubscribedAgents: jest.fn(),
  isAgentSubscribed: jest.fn()
});

describe('Chat Session Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('No Auto-Create Chat on New Message', () => {
    test('should NOT create chat when currentChatId is null (session mode off)', async () => {
      const world = createMockWorld(null); // currentChatId is null = session mode off

      // Publish an agent message
      publishMessage(world, 'Hello, this is an agent message!', 'test-agent');

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify no chat operations were triggered
      expect(world.storage.saveChatData).not.toHaveBeenCalled();
      expect(world.storage.saveWorldChat).not.toHaveBeenCalled();
      expect(world.storage.updateChatData).not.toHaveBeenCalled();
    });

    test('should NOT create chat for human messages when currentChatId is null', async () => {
      const world = createMockWorld(null); // currentChatId is null = session mode off

      // Publish a human message
      publishMessage(world, 'Hello from human!', 'HUMAN');

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify no chat operations were triggered
      expect(world.storage.saveChatData).not.toHaveBeenCalled();
      expect(world.storage.saveWorldChat).not.toHaveBeenCalled();
      expect(world.storage.updateChatData).not.toHaveBeenCalled();
    });
  });

  describe('Chat Session Mode Behavior', () => {
    test('should handle human message title updates when currentChatId is set', async () => {
      const world = createMockWorld('test-chat-123'); // currentChatId is set = session mode on

      // Spy on the world's eventEmitter
      const eventEmitterSpy = jest.spyOn(world.eventEmitter, 'emit');

      // Publish a human message
      publishMessage(world, 'This should update the chat title', 'HUMAN');

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify updateChatData was called for title update
      expect(world.storage.updateChatData).toHaveBeenCalledWith(
        'test-world',
        'test-chat-123',
        expect.objectContaining({
          name: expect.any(String),
          messageCount: expect.any(Number)
        })
      );

      // Verify system message was emitted through eventEmitter
      expect(eventEmitterSpy).toHaveBeenCalledWith(
        'message',
        expect.objectContaining({
          sender: 'system',
          content: expect.stringMatching(/"type":"chat-updated"/),
          messageId: expect.any(String),
          timestamp: expect.any(Date)
        })
      );
    });

    test('should handle agent message chat saves when currentChatId is set', async () => {
      const world = createMockWorld('test-chat-456'); // currentChatId is set = session mode on

      // Spy on the world's eventEmitter
      const eventEmitterSpy = jest.spyOn(world.eventEmitter, 'emit');

      // Publish an agent message
      publishMessage(world, 'This should save the chat state', 'test-agent');

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify saveWorldChat was called for state save
      expect(world.storage.saveWorldChat).toHaveBeenCalledWith(
        'test-world',
        'test-chat-456',
        expect.any(Object)
      );

      // Verify updateChatData was called for message count update
      expect(world.storage.updateChatData).toHaveBeenCalledWith(
        'test-world',
        'test-chat-456',
        expect.objectContaining({
          messageCount: expect.any(Number)
        })
      );

      // Verify system message was emitted through eventEmitter
      expect(eventEmitterSpy).toHaveBeenCalledWith(
        'message',
        expect.objectContaining({
          sender: 'system',
          content: expect.stringMatching(/"type":"chat-updated"/),
          messageId: expect.any(String),
          timestamp: expect.any(Date)
        })
      );
    });
  });

  describe('Session Mode On/Off Behavior', () => {
    test('should handle null currentChatId correctly (session mode off)', async () => {
      const world = createMockWorld(null); // Session mode OFF

      // Publish various types of messages
      publishMessage(world, 'Human message', 'HUMAN');
      publishMessage(world, 'Agent message', 'test-agent');
      publishMessage(world, 'System message', 'system');

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify no chat operations were triggered
      expect(world.storage.saveChatData).not.toHaveBeenCalled();
      expect(world.storage.saveWorldChat).not.toHaveBeenCalled();
      expect(world.storage.updateChatData).not.toHaveBeenCalled();
    });

    test('should handle non-null currentChatId correctly (session mode on)', async () => {
      const world = createMockWorld('active-chat-789'); // Session mode ON

      // Spy on the world's eventEmitter
      const eventEmitterSpy = jest.spyOn(world.eventEmitter, 'emit');

      // Publish messages - should trigger chat operations
      publishMessage(world, 'Human message', 'HUMAN');
      publishMessage(world, 'Agent message', 'test-agent');

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify chat operations were triggered
      expect(world.storage.updateChatData).toHaveBeenCalled(); // For human message title update
      expect(world.storage.saveWorldChat).toHaveBeenCalled(); // For agent message state save

      // Verify system messages were emitted through eventEmitter
      expect(eventEmitterSpy).toHaveBeenCalledWith(
        'message',
        expect.objectContaining({
          sender: 'system',
          content: expect.stringMatching(/"type":"chat-updated"/)
        })
      );
    });
  });

  describe('Message Type Handling', () => {
    test('should only handle human and agent messages in session mode', async () => {
      const world = createMockWorld('test-chat'); // Session mode ON

      // Publish system and world messages - should NOT trigger chat operations
      publishMessage(world, 'System message', 'system');
      publishMessage(world, 'World message', 'world');

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify no chat operations were triggered for system/world messages
      expect(world.storage.updateChatData).not.toHaveBeenCalled();
      expect(world.storage.saveWorldChat).not.toHaveBeenCalled();
    });
  });
});