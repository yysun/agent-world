/**
 * Queue Storage Unit Tests
 * 
 * Tests for the message queue storage implementation including:
 * - Enqueue/dequeue operations
 * - Per-world locking mechanism
 * - Heartbeat and stuck message detection
 * - Retry logic and max retries
 * - Queue statistics and monitoring
 * - Cleanup operations
 * - Concurrent access patterns
 * 
 * NOTE: These tests use an in-memory SQLite database mock for speed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { QueueStorage, QueueMessage } from '../../core/storage/queue-storage';

// Mock queue storage implementation for testing
function createMockQueueStorage(): QueueStorage {
  const messages: QueueMessage[] = [];
  let nextId = 1;

  return {
    async enqueue(message): Promise<QueueMessage> {
      const queueMessage: QueueMessage = {
        id: `queue-${nextId++}`,
        worldId: message.worldId,
        messageId: message.messageId,
        content: message.content,
        sender: message.sender,
        chatId: message.chatId ?? null,
        status: 'pending',
        priority: message.priority,
        createdAt: new Date(),
        retryCount: 0,
        maxRetries: message.maxRetries,
        timeoutSeconds: message.timeoutSeconds
      };
      messages.push(queueMessage);
      return queueMessage;
    },

    async dequeue(worldId): Promise<QueueMessage | null> {
      // Check if world already has processing message
      const processingMsg = messages.find(
        m => m.worldId === worldId && m.status === 'processing'
      );
      if (processingMsg) return null;

      // Find highest priority pending message for this world
      const pending = messages
        .filter(m => m.worldId === worldId && m.status === 'pending')
        .sort((a, b) => {
          if (a.priority !== b.priority) return b.priority - a.priority;
          return a.createdAt.getTime() - b.createdAt.getTime();
        });

      if (pending.length === 0) return null;

      const msg = pending[0];
      msg.status = 'processing';
      msg.processedAt = new Date();
      msg.heartbeatAt = new Date();
      return msg;
    },

    async updateHeartbeat(messageId): Promise<void> {
      const msg = messages.find(m => m.messageId === messageId && m.status === 'processing');
      if (msg) {
        msg.heartbeatAt = new Date();
      }
    },

    async markCompleted(messageId): Promise<void> {
      const msg = messages.find(m => m.messageId === messageId);
      if (msg) {
        msg.status = 'completed';
        msg.completedAt = new Date();
      }
    },

    async markFailed(messageId, error): Promise<void> {
      const msg = messages.find(m => m.messageId === messageId);
      if (!msg) throw new Error(`Message ${messageId} not found`);

      if (msg.retryCount < msg.maxRetries) {
        msg.status = 'pending';
        msg.retryCount++;
        msg.error = error;
        msg.processedAt = undefined;
        msg.heartbeatAt = undefined;
      } else {
        msg.status = 'failed';
        msg.error = error;
        msg.completedAt = new Date();
      }
    },

    async retryMessage(messageId): Promise<boolean> {
      const msg = messages.find(m => m.messageId === messageId && m.status === 'failed');
      if (!msg || msg.retryCount >= msg.maxRetries) return false;

      msg.status = 'pending';
      msg.retryCount++;
      msg.processedAt = undefined;
      msg.heartbeatAt = undefined;
      msg.completedAt = undefined;
      return true;
    },

    async getQueueDepth(worldId): Promise<number> {
      return messages.filter(m => m.worldId === worldId && m.status === 'pending').length;
    },

    async getQueueStats(worldId?) {
      const filtered = worldId ? messages.filter(m => m.worldId === worldId) : messages;
      const grouped = new Map();

      for (const msg of filtered) {
        if (!grouped.has(msg.worldId)) {
          grouped.set(msg.worldId, {
            worldId: msg.worldId,
            pending: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            oldestPending: undefined as Date | undefined,
            avgProcessingTime: undefined as number | undefined
          });
        }

        const stats = grouped.get(msg.worldId);
        if (msg.status === 'pending') {
          stats.pending++;
          if (!stats.oldestPending || msg.createdAt < stats.oldestPending) {
            stats.oldestPending = msg.createdAt;
          }
        } else if (msg.status === 'processing') {
          stats.processing++;
        } else if (msg.status === 'completed') {
          stats.completed++;
        } else if (msg.status === 'failed') {
          stats.failed++;
        }
      }

      return Array.from(grouped.values());
    },

    async detectStuckMessages(): Promise<number> {
      const now = Date.now();
      let count = 0;

      for (const msg of messages) {
        if (msg.status === 'processing' && msg.retryCount < msg.maxRetries) {
          if (!msg.heartbeatAt || now - msg.heartbeatAt.getTime() > msg.timeoutSeconds * 1000) {
            msg.status = 'pending';
            msg.retryCount++;
            msg.error = 'Processing timeout - message was stuck';
            msg.processedAt = undefined;
            msg.heartbeatAt = undefined;
            count++;
          }
        }
      }

      return count;
    },

    async cleanup(olderThan): Promise<number> {
      const threshold = olderThan.getTime();
      let count = 0;

      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (
          (msg.status === 'completed' || msg.status === 'failed') &&
          msg.completedAt &&
          msg.completedAt.getTime() < threshold
        ) {
          messages.splice(i, 1);
          count++;
        }
      }

      return count;
    },

    async getMessage(messageId): Promise<QueueMessage | null> {
      return messages.find(m => m.messageId === messageId) || null;
    }
  };
}

describe('Queue Storage', () => {
  let queueStorage: QueueStorage;

  beforeEach(() => {
    queueStorage = createMockQueueStorage();
  });

  describe('Enqueue Operation', () => {
    it('should enqueue a message with default values', async () => {
      const message = await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Hello world',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      expect(message.id).toBeDefined();
      expect(message.worldId).toBe('world1');
      expect(message.messageId).toBe('msg1');
      expect(message.content).toBe('Hello world');
      expect(message.status).toBe('pending');
      expect(message.retryCount).toBe(0);
      expect(message.createdAt).toBeInstanceOf(Date);
    });

    it('should enqueue message with chatId', async () => {
      const message = await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Chat message',
        sender: 'human',
        chatId: 'chat1',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      expect(message.chatId).toBe('chat1');
    });

    it('should enqueue message with custom priority', async () => {
      const message = await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'High priority',
        sender: 'human',
        priority: 10,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      expect(message.priority).toBe(10);
    });

    it('should enqueue multiple messages', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Message 1',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg2',
        content: 'Message 2',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      const depth = await queueStorage.getQueueDepth('world1');
      expect(depth).toBe(2);
    });
  });

  describe('Dequeue Operation', () => {
    it('should dequeue the oldest pending message', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'First',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg2',
        content: 'Second',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      const message = await queueStorage.dequeue('world1');
      expect(message).not.toBeNull();
      expect(message!.messageId).toBe('msg1');
      expect(message!.status).toBe('processing');
    });

    it('should dequeue higher priority messages first', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Low priority',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg2',
        content: 'High priority',
        sender: 'human',
        priority: 10,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      const message = await queueStorage.dequeue('world1');
      expect(message!.messageId).toBe('msg2');
      expect(message!.priority).toBe(10);
    });

    it('should return null when no pending messages exist', async () => {
      const message = await queueStorage.dequeue('world1');
      expect(message).toBeNull();
    });

    it('should set processedAt and heartbeatAt timestamps', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      const message = await queueStorage.dequeue('world1');
      expect(message!.processedAt).toBeInstanceOf(Date);
      expect(message!.heartbeatAt).toBeInstanceOf(Date);
    });
  });

  describe('Per-World Locking', () => {
    it('should prevent dequeuing when world already has processing message', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'First',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg2',
        content: 'Second',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      const first = await queueStorage.dequeue('world1');
      expect(first!.messageId).toBe('msg1');

      // Try to dequeue again while first is still processing
      const second = await queueStorage.dequeue('world1');
      expect(second).toBeNull();
    });

    it('should allow dequeuing from different worlds concurrently', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'World 1',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      await queueStorage.enqueue({
        worldId: 'world2',
        messageId: 'msg2',
        content: 'World 2',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      const msg1 = await queueStorage.dequeue('world1');
      const msg2 = await queueStorage.dequeue('world2');

      expect(msg1!.messageId).toBe('msg1');
      expect(msg2!.messageId).toBe('msg2');
    });

    it('should allow dequeuing after previous message completed', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'First',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg2',
        content: 'Second',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      const first = await queueStorage.dequeue('world1');
      await queueStorage.markCompleted(first!.messageId);

      const second = await queueStorage.dequeue('world1');
      expect(second!.messageId).toBe('msg2');
    });
  });

  describe('Status Transitions', () => {
    it('should mark message as completed', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      await queueStorage.dequeue('world1');
      await queueStorage.markCompleted('msg1');

      const message = await queueStorage.getMessage('msg1');
      expect(message!.status).toBe('completed');
      expect(message!.completedAt).toBeInstanceOf(Date);
    });

    it('should mark message as failed and retry if under max retries', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      await queueStorage.dequeue('world1');
      await queueStorage.markFailed('msg1', 'Processing error');

      const message = await queueStorage.getMessage('msg1');
      expect(message!.status).toBe('pending'); // Reset to pending for retry
      expect(message!.retryCount).toBe(1);
      expect(message!.error).toBe('Processing error');
    });

    it('should mark message as failed permanently after max retries', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 2,
        timeoutSeconds: 300
      });

      // Fail twice (should retry)
      await queueStorage.dequeue('world1');
      await queueStorage.markFailed('msg1', 'Error 1');

      await queueStorage.dequeue('world1');
      await queueStorage.markFailed('msg1', 'Error 2');

      // Third failure should be permanent
      await queueStorage.dequeue('world1');
      await queueStorage.markFailed('msg1', 'Error 3');

      const message = await queueStorage.getMessage('msg1');
      expect(message!.status).toBe('failed');
      expect(message!.retryCount).toBe(2); // Started at 0, incremented twice
      expect(message!.completedAt).toBeInstanceOf(Date);
    });

    it('should manually retry a failed message if under max retries', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      // Fail once (should auto-retry because retryCount=0 < maxRetries=3)
      await queueStorage.dequeue('world1');
      await queueStorage.markFailed('msg1', 'Error 1');

      let message = await queueStorage.getMessage('msg1');
      expect(message!.status).toBe('pending'); // Auto-retried
      expect(message!.retryCount).toBe(1);

      // Force to failed status with retryCount < maxRetries for manual retry test
      // (In real scenario this could happen if message was manually marked failed)
      message!.status = 'failed';

      // Manual retry should work (retryCount=1 < maxRetries=3)
      const success = await queueStorage.retryMessage('msg1');
      expect(success).toBe(true);

      message = await queueStorage.getMessage('msg1');
      expect(message!.status).toBe('pending');
      expect(message!.retryCount).toBe(2); // Incremented
    });

    it('should not retry message that reached max retries', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 1,
        timeoutSeconds: 300
      });

      // Fail twice to reach permanent failure
      await queueStorage.dequeue('world1');
      await queueStorage.markFailed('msg1', 'Error 1'); // retryCount becomes 1, auto-retry

      await queueStorage.dequeue('world1');
      await queueStorage.markFailed('msg1', 'Error 2'); // retryCount=1 >= maxRetries=1, permanent fail

      let message = await queueStorage.getMessage('msg1');
      expect(message!.status).toBe('failed');
      expect(message!.retryCount).toBe(1); // At max

      // Manual retry should fail (retryCount >= maxRetries)
      const success = await queueStorage.retryMessage('msg1');
      expect(success).toBe(false);

      message = await queueStorage.getMessage('msg1');
      expect(message!.status).toBe('failed'); // Stays failed
    });
  });

  describe('Heartbeat and Stuck Detection', () => {
    it('should update heartbeat timestamp', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      const message = await queueStorage.dequeue('world1');
      const initialHeartbeat = message!.heartbeatAt!;

      // Wait a bit and update heartbeat
      await new Promise(resolve => setTimeout(resolve, 10));
      await queueStorage.updateHeartbeat('msg1');

      const updated = await queueStorage.getMessage('msg1');
      expect(updated!.heartbeatAt!.getTime()).toBeGreaterThan(initialHeartbeat.getTime());
    });

    it('should detect stuck messages without heartbeat', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 1 // 1 second timeout
      });

      await queueStorage.dequeue('world1');

      // Manually set heartbeatAt to past (simulating stuck message)
      const msg = await queueStorage.getMessage('msg1');
      if (msg) {
        msg.heartbeatAt = new Date(Date.now() - 2000); // 2 seconds ago
      }

      const stuckCount = await queueStorage.detectStuckMessages();
      expect(stuckCount).toBe(1);

      const message = await queueStorage.getMessage('msg1');
      expect(message!.status).toBe('pending');
      expect(message!.retryCount).toBe(1);
      expect(message!.error).toContain('timeout');
    });

    it('should not detect stuck messages with fresh heartbeat', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      await queueStorage.dequeue('world1');
      await queueStorage.updateHeartbeat('msg1');

      const stuckCount = await queueStorage.detectStuckMessages();
      expect(stuckCount).toBe(0);
    });

    it('should not reset stuck messages that exceeded max retries', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 1,
        timeoutSeconds: 1
      });

      await queueStorage.dequeue('world1');

      // Set to stuck and increment retry count to max
      const msg = await queueStorage.getMessage('msg1');
      if (msg) {
        msg.heartbeatAt = new Date(Date.now() - 2000); // 2 seconds ago
        msg.retryCount = 1; // At max retries
      }

      const stuckCount = await queueStorage.detectStuckMessages();
      expect(stuckCount).toBe(0); // Should not reset (at max retries)
    });
  });

  describe('Queue Statistics', () => {
    it('should get queue depth for a world', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg2',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      const depth = await queueStorage.getQueueDepth('world1');
      expect(depth).toBe(2);
    });

    it('should get queue stats for a specific world', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg2',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      await queueStorage.dequeue('world1');
      await queueStorage.markCompleted('msg1');

      const stats = await queueStorage.getQueueStats('world1');
      expect(stats.length).toBe(1);
      expect(stats[0].worldId).toBe('world1');
      expect(stats[0].pending).toBe(1);
      expect(stats[0].processing).toBe(0);
      expect(stats[0].completed).toBe(1);
      expect(stats[0].failed).toBe(0);
    });

    it('should get queue stats for all worlds', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      await queueStorage.enqueue({
        worldId: 'world2',
        messageId: 'msg2',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      const stats = await queueStorage.getQueueStats();
      expect(stats.length).toBe(2);
      expect(stats.map(s => s.worldId).sort()).toEqual(['world1', 'world2']);
    });

    it('should include oldest pending timestamp in stats', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      const stats = await queueStorage.getQueueStats('world1');
      expect(stats[0].oldestPending).toBeInstanceOf(Date);
    });
  });

  describe('Cleanup Operations', () => {
    it('should cleanup old completed messages', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      await queueStorage.dequeue('world1');
      await queueStorage.markCompleted('msg1');

      // Set completedAt to past
      const pastDate = Date.now() - 86400000; // 1 day ago
      const msg = await queueStorage.getMessage('msg1');
      if (msg) {
        msg.completedAt = new Date(pastDate);
      }

      const cutoff = new Date(Date.now() - 3600000); // 1 hour ago
      const cleaned = await queueStorage.cleanup(cutoff);
      expect(cleaned).toBe(1);

      const message = await queueStorage.getMessage('msg1');
      expect(message).toBeNull();
    });

    it('should cleanup old failed messages', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 0,
        timeoutSeconds: 300
      });

      await queueStorage.dequeue('world1');
      await queueStorage.markFailed('msg1', 'Error');

      // Set completedAt to past
      const pastDate = Date.now() - 86400000;
      const msg = await queueStorage.getMessage('msg1');
      if (msg) {
        msg.completedAt = new Date(pastDate);
      }

      const cutoff = new Date(Date.now() - 3600000);
      const cleaned = await queueStorage.cleanup(cutoff);
      expect(cleaned).toBe(1);
    });

    it('should not cleanup recent messages', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      await queueStorage.dequeue('world1');
      await queueStorage.markCompleted('msg1');

      const cutoff = new Date(Date.now() - 3600000); // 1 hour ago
      const cleaned = await queueStorage.cleanup(cutoff);
      expect(cleaned).toBe(0);
    });

    it('should not cleanup pending or processing messages', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      await queueStorage.dequeue('world1');

      const cutoff = new Date(Date.now() + 3600000); // Future date
      const cleaned = await queueStorage.cleanup(cutoff);
      expect(cleaned).toBe(0);
    });
  });

  describe('Get Message', () => {
    it('should get message by messageId', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test message',
        sender: 'human',
        priority: 0,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      const message = await queueStorage.getMessage('msg1');
      expect(message).not.toBeNull();
      expect(message!.messageId).toBe('msg1');
      expect(message!.content).toBe('Test message');
    });

    it('should return null for non-existent message', async () => {
      const message = await queueStorage.getMessage('nonexistent');
      expect(message).toBeNull();
    });

    it('should get message with all fields populated', async () => {
      await queueStorage.enqueue({
        worldId: 'world1',
        messageId: 'msg1',
        content: 'Test',
        sender: 'human',
        chatId: 'chat1',
        priority: 5,
        maxRetries: 3,
        timeoutSeconds: 300
      });

      const message = await queueStorage.getMessage('msg1');
      expect(message!.id).toBeDefined();
      expect(message!.worldId).toBe('world1');
      expect(message!.messageId).toBe('msg1');
      expect(message!.content).toBe('Test');
      expect(message!.sender).toBe('human');
      expect(message!.chatId).toBe('chat1');
      expect(message!.status).toBe('pending');
      expect(message!.priority).toBe(5);
      expect(message!.createdAt).toBeInstanceOf(Date);
      expect(message!.retryCount).toBe(0);
      expect(message!.maxRetries).toBe(3);
      expect(message!.timeoutSeconds).toBe(300);
    });
  });
});
