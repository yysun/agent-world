/**
 * Queue Processor Tests
 * 
 * Tests for async message queue processing with WebSocket integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueueProcessor, createQueueProcessor } from '../../ws/queue-processor.js';
import type { QueueStorage, QueueMessage } from '../../core/storage/queue-storage.js';
import type { AgentWorldWSServer } from '../../ws/ws-server.js';
import type { World } from '../../core/types.js';
import { EventEmitter } from 'events';

describe('Queue Processor', () => {
  let mockQueueStorage: QueueStorage;
  let mockWSServer: AgentWorldWSServer;
  let mockWorld: World;
  let processor: QueueProcessor;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock QueueStorage
    mockQueueStorage = {
      enqueue: vi.fn(),
      dequeue: vi.fn(),
      updateHeartbeat: vi.fn(),
      markCompleted: vi.fn(),
      markFailed: vi.fn(),
      retryMessage: vi.fn(),
      getQueueDepth: vi.fn(),
      getQueueStats: vi.fn().mockResolvedValue([]),
      detectStuckMessages: vi.fn(),
      cleanup: vi.fn(),
      getMessage: vi.fn()
    } as any;

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
  });

  describe('Lifecycle', () => {
    it('should start and stop gracefully', async () => {
      processor = createQueueProcessor({
        queueStorage: mockQueueStorage,
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
        queueStorage: mockQueueStorage,
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
      const queueMessage: QueueMessage = {
        id: '1',
        worldId: 'test-world',
        messageId: 'msg-1',
        content: 'Hello',
        sender: 'human',
        chatId: null,
        priority: 0,
        status: 'pending',
        retryCount: 0,
        maxRetries: 3,
        timeoutSeconds: 300,
        createdAt: new Date(),
        scheduledAt: new Date(),
        processingStartedAt: null,
        lastHeartbeat: null,
        completedAt: undefined,
        failedAt: null,
        error: undefined
      };

      (mockQueueStorage.getQueueStats as any).mockResolvedValue([
        { worldId: 'test-world', pending: 1, processing: 0, completed: 0, failed: 0 }
      ]);
      (mockQueueStorage.dequeue as any).mockResolvedValueOnce(queueMessage).mockResolvedValue(null);

      processor = createQueueProcessor({
        queueStorage: mockQueueStorage,
        wsServer: mockWSServer,
        pollInterval: 100,
        worldsBasePath: './test-data'
      });

      processor.start();

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      await processor.stop();

      // Should have called dequeue
      expect(mockQueueStorage.dequeue).toHaveBeenCalledWith('test-world');
    });

    it('should broadcast processing status', async () => {
      const queueMessage: QueueMessage = {
        id: '1',
        worldId: 'test-world',
        messageId: 'msg-1',
        content: 'Hello',
        sender: 'human',
        chatId: null,
        priority: 0,
        status: 'pending',
        retryCount: 0,
        maxRetries: 3,
        timeoutSeconds: 300,
        createdAt: new Date(),
        scheduledAt: new Date(),
        processingStartedAt: null,
        lastHeartbeat: null,
        completedAt: undefined,
        failedAt: null,
        error: undefined
      };

      (mockQueueStorage.getQueueStats as any).mockResolvedValue([
        { worldId: 'test-world', pending: 1, processing: 0, completed: 0, failed: 0 }
      ]);
      (mockQueueStorage.dequeue as any).mockResolvedValueOnce(queueMessage).mockResolvedValue(null);

      processor = createQueueProcessor({
        queueStorage: mockQueueStorage,
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
      (mockQueueStorage.getQueueStats as any).mockResolvedValue([
        { worldId: 'world-1', pending: 1, processing: 0, completed: 0, failed: 0 },
        { worldId: 'world-2', pending: 1, processing: 0, completed: 0, failed: 0 },
        { worldId: 'world-3', pending: 1, processing: 0, completed: 0, failed: 0 },
        { worldId: 'world-4', pending: 1, processing: 0, completed: 0, failed: 0 },
        { worldId: 'world-5', pending: 1, processing: 0, completed: 0, failed: 0 },
        { worldId: 'world-6', pending: 1, processing: 0, completed: 0, failed: 0 }
      ]);

      processor = createQueueProcessor({
        queueStorage: mockQueueStorage,
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
    it('should mark message as failed on processing error', async () => {
      const queueMessage: QueueMessage = {
        id: '1',
        worldId: 'non-existent-world',
        messageId: 'msg-1',
        content: 'Hello',
        sender: 'human',
        chatId: null,
        priority: 0,
        status: 'pending',
        retryCount: 0,
        maxRetries: 3,
        timeoutSeconds: 300,
        createdAt: new Date(),
        scheduledAt: new Date(),
        processingStartedAt: null,
        lastHeartbeat: null,
        completedAt: undefined,
        failedAt: null,
        error: undefined
      };

      (mockQueueStorage.getQueueStats as any).mockResolvedValue([
        { worldId: 'non-existent-world', pending: 1, processing: 0, completed: 0, failed: 0 }
      ]);
      (mockQueueStorage.dequeue as any).mockResolvedValueOnce(queueMessage).mockResolvedValue(null);

      processor = createQueueProcessor({
        queueStorage: mockQueueStorage,
        wsServer: mockWSServer,
        pollInterval: 100,
        worldsBasePath: './test-data'
      });

      processor.start();

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 300));

      await processor.stop();

      // Should mark as failed
      expect(mockQueueStorage.markFailed).toHaveBeenCalled();
      expect(mockWSServer.broadcastStatus).toHaveBeenCalledWith(
        'non-existent-world',
        'msg-1',
        'failed',
        expect.any(String)
      );
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', () => {
      processor = createQueueProcessor({
        queueStorage: mockQueueStorage,
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
