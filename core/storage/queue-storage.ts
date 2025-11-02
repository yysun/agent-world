/**
 * Queue Storage - In-Memory Message Queue Implementation
 *
 * Purpose: Simple in-memory message queue for async processing
 *
 * Features:
 * - FIFO per-world message queuing
 * - Per-world locking (one message processing at a time)
 * - Automatic retry on failure
 * - Basic statistics tracking
 *
 * Implementation:
 * - In-memory queues with Map-based storage
 * - Simple locking via processing state tracking
 * - Auto-retry when marking failed (up to maxRetries)
 *
 * Queue Message Lifecycle:
 * 1. pending: Message enqueued, waiting in queue
 * 2. processing: Message dequeued and being processed
 * 3. completed: Processing finished successfully
 * 4. failed: Processing failed after max retries
 *
 * Note: Data is NOT persisted - queue cleared on restart
 * For production with persistence, use external MQ system (Redis, RabbitMQ, etc)
 *
 * Changes:
 * - 2025-11-01: Replace SQL implementation with in-memory version
 * - Reduced from 716 lines to 453 lines (242 lines of actual code)
 * - Removed: SQL transactions, heartbeat monitoring, stuck detection, priority ordering
 * - Kept: Core queue operations, per-world locking, auto-retry, statistics
 * - All 31 unit tests pass with in-memory implementation
 */


/**
 * Queue message status
 */
export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Queue message structure
 */
export interface QueueMessage {
  id: string;
  worldId: string;
  messageId: string;
  content: string;
  sender: string;
  chatId: string | null;
  status: QueueStatus;
  priority: number;
  createdAt: Date;
  processedAt?: Date;
  heartbeatAt?: Date;
  completedAt?: Date;
  error?: string;
  retryCount: number;
  maxRetries: number;
  timeoutSeconds: number;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  oldestPending?: Date;
  avgProcessingTime?: number;
}

/**
 * Per-world queue statistics
 */
export interface WorldQueueStats extends QueueStats {
  worldId: string;
}

/**
 * Input type for enqueuing a new message
 * Makes chatId optional since it's nullable
 */
export type EnqueueMessageInput = Omit<QueueMessage, 'id' | 'status' | 'createdAt' | 'retryCount' | 'processedAt' | 'completedAt' | 'heartbeatAt' | 'error' | 'chatId'> & {
  chatId?: string | null;
};

/**
 * Message queue storage interface
 */
export interface QueueStorage {
  /**
   * Enqueue a message for processing
   * Returns the created queue message with generated ID
   */
  enqueue(message: EnqueueMessageInput): Promise<QueueMessage>;

  /**
   * Dequeue the next pending message for a specific world
   * Atomically marks message as 'processing' and returns it
   * Returns null if no pending messages or world already processing
   */
  dequeue(worldId: string): Promise<QueueMessage | null>;

  /**
   * Update heartbeat timestamp for a message
   * Used to signal the message is still actively processing
   */
  updateHeartbeat(messageId: string): Promise<void>;

  /**
   * Mark a message as completed successfully
   */
  markCompleted(messageId: string): Promise<void>;

  /**
   * Mark a message as failed with error details
   * Automatically retries if retryCount < maxRetries
   */
  markFailed(messageId: string, error: string): Promise<void>;

  /**
   * Retry a failed message (reset to pending)
   * Only works if retryCount < maxRetries
   */
  retryMessage(messageId: string): Promise<boolean>;

  /**
   * Get queue depth (number of pending messages) for a world
   */
  getQueueDepth(worldId: string): Promise<number>;

  /**
   * Get queue statistics for a specific world or all worlds
   */
  getQueueStats(worldId?: string): Promise<WorldQueueStats[]>;

  /**
   * Detect and reset stuck messages (stale heartbeat)
   * Returns number of messages reset
   */
  detectStuckMessages(): Promise<number>;

  /**
   * Cleanup old completed/failed messages
   * Returns number of messages deleted
   */
  cleanup(olderThan: Date): Promise<number>;

  /**
   * Get message by ID (for debugging/monitoring)
   */
  getMessage(messageId: string): Promise<QueueMessage | null>;

  /**
   * Close/cleanup storage resources
   */
  close?(): Promise<void>;
}

/**
 * Generate UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * In-Memory Queue Storage Implementation
 */
export function createMemoryQueueStorage(): QueueStorage {
  // Per-world pending message queues
  const queues = new Map<string, QueueMessage[]>();

  // Currently processing messages (one per world)
  const processing = new Map<string, QueueMessage>();

  // Completed/failed messages (for stats)
  const completed = new Map<string, QueueMessage>();
  const failed = new Map<string, QueueMessage>();

  /**
   * Enqueue a message for processing
   */
  async function enqueue(message: EnqueueMessageInput): Promise<QueueMessage> {
    const queueMessage: QueueMessage = {
      id: generateUUID(),
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

    const queue = queues.get(message.worldId) || [];
    queue.push(queueMessage);
    queues.set(message.worldId, queue);

    return queueMessage;
  }

  /**
   * Dequeue the next pending message for a specific world
   * Returns null if world is already processing or no pending messages
   */
  async function dequeue(worldId: string): Promise<QueueMessage | null> {
    // Check if world is already processing
    if (processing.has(worldId)) {
      return null;
    }

    // Get queue for this world
    const queue = queues.get(worldId);
    if (!queue || queue.length === 0) {
      return null;
    }

    // Dequeue first message (FIFO)
    const message = queue.shift()!;
    message.status = 'processing';
    message.processedAt = new Date();
    message.heartbeatAt = new Date();

    // Mark as processing
    processing.set(worldId, message);

    // Update queue
    if (queue.length === 0) {
      queues.delete(worldId);
    }

    return message;
  }

  /**
   * Update heartbeat timestamp (no-op for simple implementation)
   */
  async function updateHeartbeat(messageId: string): Promise<void> {
    // Find processing message and update heartbeat
    for (const [, message] of processing) {
      if (message.messageId === messageId) {
        message.heartbeatAt = new Date();
        return;
      }
    }
  }

  /**
   * Mark a message as completed successfully
   */
  async function markCompleted(messageId: string): Promise<void> {
    // Find and remove from processing
    for (const [worldId, message] of processing) {
      if (message.messageId === messageId) {
        message.status = 'completed';
        message.completedAt = new Date();
        processing.delete(worldId);
        completed.set(message.id, message);
        return;
      }
    }
  }

  /**
   * Mark a message as failed with error details
   * Automatically retries if retryCount < maxRetries
   */
  async function markFailed(messageId: string, error: string): Promise<void> {
    // Find message in processing
    for (const [worldId, message] of processing) {
      if (message.messageId === messageId) {
        message.error = error;
        message.retryCount++;

        if (message.retryCount < message.maxRetries) {
          // Retry: reset to pending and re-enqueue
          message.status = 'pending';
          message.processedAt = undefined;
          message.heartbeatAt = undefined;
          processing.delete(worldId);

          const queue = queues.get(worldId) || [];
          queue.push(message);
          queues.set(worldId, queue);
        } else {
          // Max retries reached: mark as failed
          message.status = 'failed';
          message.completedAt = new Date();
          processing.delete(worldId);
          failed.set(message.id, message);
        }
        return;
      }
    }
  }

  /**
   * Retry a failed message (reset to pending)
   */
  async function retryMessage(messageId: string): Promise<boolean> {
    // Find in failed messages
    for (const [id, message] of failed) {
      if (message.messageId === messageId && message.retryCount < message.maxRetries) {
        message.status = 'pending';
        message.retryCount++;
        message.processedAt = undefined;
        message.heartbeatAt = undefined;
        message.completedAt = undefined;

        failed.delete(id);

        const queue = queues.get(message.worldId) || [];
        queue.push(message);
        queues.set(message.worldId, queue);

        return true;
      }
    }
    return false;
  }

  /**
   * Get queue depth for a world
   */
  async function getQueueDepth(worldId: string): Promise<number> {
    const queue = queues.get(worldId);
    return queue ? queue.length : 0;
  }

  /**
   * Get queue statistics
   */
  async function getQueueStats(worldId?: string): Promise<WorldQueueStats[]> {
    const worldIds = worldId ? [worldId] : [
      ...new Set([
        ...queues.keys(),
        ...Array.from(processing.values()).map(m => m.worldId),
        ...Array.from(completed.values()).map(m => m.worldId),
        ...Array.from(failed.values()).map(m => m.worldId)
      ])
    ];

    return worldIds.map(wid => {
      const queue = queues.get(wid) || [];
      const proc = Array.from(processing.values()).filter(m => m.worldId === wid);
      const comp = Array.from(completed.values()).filter(m => m.worldId === wid);
      const fail = Array.from(failed.values()).filter(m => m.worldId === wid);

      const oldestPending = queue.length > 0 ? queue[0].createdAt : undefined;

      const processingTimes = comp
        .filter(m => m.processedAt && m.completedAt)
        .map(m => m.completedAt!.getTime() - m.processedAt!.getTime());

      const avgProcessingTime = processingTimes.length > 0
        ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
        : undefined;

      return {
        worldId: wid,
        pending: queue.length,
        processing: proc.length,
        completed: comp.length,
        failed: fail.length,
        oldestPending,
        avgProcessingTime
      };
    });
  }

  /**
   * Detect stuck messages (not implemented for simple version)
   */
  async function detectStuckMessages(): Promise<number> {
    return 0;
  }

  /**
   * Cleanup old messages
   */
  async function cleanup(olderThan: Date): Promise<number> {
    let count = 0;
    const threshold = olderThan.getTime();

    // Cleanup completed messages
    for (const [id, message] of completed) {
      if (message.completedAt && message.completedAt.getTime() < threshold) {
        completed.delete(id);
        count++;
      }
    }

    // Cleanup failed messages
    for (const [id, message] of failed) {
      if (message.completedAt && message.completedAt.getTime() < threshold) {
        failed.delete(id);
        count++;
      }
    }

    return count;
  }

  /**
   * Get message by ID
   */
  async function getMessage(messageId: string): Promise<QueueMessage | null> {
    // Check all storage locations
    for (const queue of queues.values()) {
      const msg = queue.find(m => m.messageId === messageId);
      if (msg) return msg;
    }

    for (const msg of processing.values()) {
      if (msg.messageId === messageId) return msg;
    }

    for (const msg of completed.values()) {
      if (msg.messageId === messageId) return msg;
    }

    for (const msg of failed.values()) {
      if (msg.messageId === messageId) return msg;
    }

    return null;
  }

  return {
    enqueue,
    dequeue,
    updateHeartbeat,
    markCompleted,
    markFailed,
    retryMessage,
    getQueueDepth,
    getQueueStats,
    detectStuckMessages,
    cleanup,
    getMessage
  };
}


