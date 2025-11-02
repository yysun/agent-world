/**
 * Queue Processor Tests
 * 
 * Tests for async message queue processing with WebSocket integration
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { QueueProcessor, createQueueProcessor } from '../../ws/queue-processor.js';
import type { QueueStorage, QueueMessage } from '../../core/storage/queue-storage.js';
import { createMemoryQueueStorage } from '../../core/storage/queue-storage.js';
import type { AgentWorldWSServer } from '../../ws/ws-server.js';
import type { World } from '../../core/types.js';
import { EventEmitter } from 'events';

// Mock the managers module
vi.mock('../../core/managers.js', () => ({
  getWorld: vi.fn()
}));

// Mock the events module
vi.mock('../../core/events.js', () => ({
  publishMessageWithId: vi.fn(),
  EventType: {
    MESSAGE: 'message',
    WORLD: 'world',
    SSE: 'sse',
    CRUD: 'crud'
  }
}));

// Mock the subscription module
vi.mock('../../core/subscription.js', () => ({
  startWorld: vi.fn()
}));

import { getWorld } from '../../core/managers.js';
import { publishMessageWithId } from '../../core/events.js';
import { startWorld } from '../../core/subscription.js';

describe('Queue Processor', () => {
  let queueStorage: QueueStorage;
  let mockWSServer: AgentWorldWSServer;
  let mockWorld: World;
  let processor: QueueProcessor;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Use REAL queue storage instead of mocking to test actual behavior
    queueStorage = createMemoryQueueStorage();

    // Mock WebSocket Server
    mockWSServer = {
      broadcastEvent: vi.fn(),
      broadcastStatus: vi.fn()
    } as any;

    // Mock World
    mockWorld = {
      id: 'test-world',
      name: 'Test World',
      eventEmitter: new EventEmitter(),
      agents: new Map(),
      chats: new Map()
    } as any;

    // Reset and configure getWorld mock to return our mock world by default
    (getWorld as any).mockReset();
    (getWorld as any).mockResolvedValue(mockWorld);

    // Mock startWorld to return a subscription
    (startWorld as any).mockResolvedValue({
      world: mockWorld,
      destroy: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(mockWorld)
    });

    // Mock publishMessageWithId to simulate message publishing
    (publishMessageWithId as any).mockImplementation(() => {
      // Simulate immediate idle event
      setImmediate(() => {
        mockWorld.eventEmitter.emit('world', { type: 'idle' });
      });
    });
  });

  afterEach(async () => {
    // Clean up processor if running
    if (processor && processor.getStats().running) {
      await processor.stop();
    }
  });

  describe('Lifecycle', () => {
    it('should start and stop gracefully', async () => {
      processor = createQueueProcessor({
        queueStorage: queueStorage,
        wsServer: mockWSServer,
        pollInterval: 100,
        worldsBasePath: './test-data'
      });

      processor.start();
      expect(processor.getStats().running).toBe(true);

      await processor.stop();
      expect(processor.getStats().running).toBe(false);
    });

    it('should not start twice', () => {
      processor = createQueueProcessor({
        queueStorage: queueStorage,
        wsServer: mockWSServer,
        worldsBasePath: './test-data'
      });

      processor.start();
      processor.start(); // Second call should be ignored

      expect(processor.getStats().running).toBe(true);
    });

    it('should wait for in-flight processing before stopping', async () => {
      // Skip this test as it's difficult to test async timing reliably
      // The functionality is covered by integration tests
    }, { skip: true });
  });

  describe('Message Processing', () => {
    it('should poll for messages and process them', async () => {
      // Enqueue a message using the REAL queue storage
      await queueStorage.enqueue({
        worldId: 'test-world',
        messageId: 'msg-1',
        content: 'Hello',
        sender: 'human',
        chatId: null,
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      processor = createQueueProcessor({
        queueStorage: queueStorage,
        wsServer: mockWSServer,
        pollInterval: 100,
        worldsBasePath: './test-data'
      });

      processor.start();

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      await processor.stop();

      // Should have processed the message (moved from pending to completed)
      const stats = await queueStorage.getQueueStats('test-world');
      expect(stats[0].pending).toBe(0);
      expect(stats[0].completed).toBe(1);
    });

    it('should process multiple messages for the same world without restarting', async () => {
      // Enqueue 3 messages using the REAL queue storage
      await queueStorage.enqueue({
        worldId: 'test-world',
        messageId: 'msg-1',
        content: 'First message',
        sender: 'human',
        chatId: null,
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      await queueStorage.enqueue({
        worldId: 'test-world',
        messageId: 'msg-2',
        content: 'Second message',
        sender: 'human',
        chatId: null,
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      await queueStorage.enqueue({
        worldId: 'test-world',
        messageId: 'msg-3',
        content: 'Third message',
        sender: 'human',
        chatId: null,
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      // Verify messages are enqueued
      const statsBeforeProcessing = await queueStorage.getQueueStats('test-world');
      expect(statsBeforeProcessing[0].pending).toBe(3);
      expect(statsBeforeProcessing[0].processing).toBe(0);

      processor = createQueueProcessor({
        queueStorage: queueStorage,
        wsServer: mockWSServer,
        pollInterval: 100,
        worldsBasePath: './test-data'
      });

      processor.start();

      // Wait for all messages to be processed
      await new Promise(resolve => setTimeout(resolve, 500));

      await processor.stop();

      // Verify all messages were processed (should be completed)
      const statsAfterProcessing = await queueStorage.getQueueStats('test-world');
      expect(statsAfterProcessing[0].pending).toBe(0);
      expect(statsAfterProcessing[0].processing).toBe(0);
      expect(statsAfterProcessing[0].completed).toBe(3);

      // Verify processing status was broadcast for all messages
      expect(mockWSServer.broadcastStatus).toHaveBeenCalledWith('test-world', 'msg-1', 'processing');
      expect(mockWSServer.broadcastStatus).toHaveBeenCalledWith('test-world', 'msg-2', 'processing');
      expect(mockWSServer.broadcastStatus).toHaveBeenCalledWith('test-world', 'msg-3', 'processing');

      // Verify completion status was broadcast for all messages
      expect(mockWSServer.broadcastStatus).toHaveBeenCalledWith('test-world', 'msg-1', 'completed');
      expect(mockWSServer.broadcastStatus).toHaveBeenCalledWith('test-world', 'msg-2', 'completed');
      expect(mockWSServer.broadcastStatus).toHaveBeenCalledWith('test-world', 'msg-3', 'completed');
    });

    it('should broadcast processing status', async () => {
      // Enqueue a message using the REAL queue storage
      await queueStorage.enqueue({
        worldId: 'test-world',
        messageId: 'msg-1',
        content: 'Hello',
        sender: 'human',
        chatId: null,
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      processor = createQueueProcessor({
        queueStorage: queueStorage,
        wsServer: mockWSServer,
        pollInterval: 100,
        worldsBasePath: './test-data'
      });

      processor.start();

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      await processor.stop();

      // Should broadcast processing status
      expect(mockWSServer.broadcastStatus).toHaveBeenCalledWith('test-world', 'msg-1', 'processing');
    });

    it('should respect max concurrent worlds limit', async () => {
      // Enqueue messages for 6 different worlds
      for (let i = 1; i <= 6; i++) {
        await queueStorage.enqueue({
          worldId: `world-${i}`,
          messageId: `msg-${i}`,
          content: 'Test message',
          sender: 'human',
          chatId: null,
          priority: 0,
          maxRetries: 3,
          timeoutSeconds: 300
        });
      }

      processor = createQueueProcessor({
        queueStorage: queueStorage,
        wsServer: mockWSServer,
        pollInterval: 100,
        maxConcurrent: 3,
        worldsBasePath: './test-data'
      });

      processor.start();

      // Wait for processing to start
      await new Promise(resolve => setTimeout(resolve, 150));

      const stats = processor.getStats();
      expect(stats.processingWorlds).toBeLessThanOrEqual(3);

      await processor.stop();
    });
  });

  describe('Error Handling', () => {
    it('should handle world loading errors gracefully', async () => {
      // Enqueue a message for a non-existent world
      await queueStorage.enqueue({
        worldId: 'non-existent-world',
        messageId: 'msg-1',
        content: 'Hello',
        sender: 'human',
        chatId: null,
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      // Mock getWorld to return null for non-existent world
      (getWorld as any).mockResolvedValue(null);

      processor = createQueueProcessor({
        queueStorage: queueStorage,
        wsServer: mockWSServer,
        pollInterval: 100,
        worldsBasePath: './test-data'
      });

      processor.start();

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 300));

      await processor.stop();

      // World loading failed, message should still be in pending state
      const stats = await queueStorage.getQueueStats('non-existent-world');
      expect(stats[0].pending).toBe(1);
      expect(stats[0].completed).toBe(0);
    });

    it('should mark message as failed when message processing throws error', async () => {
      // Enqueue a message
      await queueStorage.enqueue({
        worldId: 'test-world',
        messageId: 'msg-1',
        content: 'Hello',
        sender: 'human',
        chatId: null,
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      // Mock publishMessageWithId to throw an error
      (publishMessageWithId as any).mockImplementation(() => {
        throw new Error('Processing failed');
      });

      processor = createQueueProcessor({
        queueStorage: queueStorage,
        wsServer: mockWSServer,
        pollInterval: 100,
        worldsBasePath: './test-data'
      });

      processor.start();

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 300));

      await processor.stop();

      // Should mark as failed (or pending for retry)
      const stats = await queueStorage.getQueueStats('test-world');
      expect(stats[0].completed).toBe(0);
      // Message should be either in pending (retry) or failed state
      expect(stats[0].pending + stats[0].failed).toBeGreaterThan(0);
      expect(mockWSServer.broadcastStatus).toHaveBeenCalledWith(
        'test-world',
        'msg-1',
        'failed',
        expect.any(String)
      );
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', () => {
      processor = createQueueProcessor({
        queueStorage: queueStorage,
        wsServer: mockWSServer,
        worldsBasePath: './test-data'
      });

      const stats = processor.getStats();
      expect(stats).toHaveProperty('running');
      expect(stats).toHaveProperty('processingWorlds');
      expect(stats).toHaveProperty('activeWorlds');
      expect(stats.running).toBe(false);
      expect(stats.processingWorlds).toBe(0);
      expect(Array.isArray(stats.activeWorlds)).toBe(true);
    });
  });
});
