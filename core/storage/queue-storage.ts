/**
 * Queue Storage - Message Queue Implementation
 *
 * Purpose: Persistent message queue for async processing
 *
 * Features:
 * - Atomic enqueue/dequeue operations with per-world locking
 * - Status tracking: pending → processing → completed/failed
 * - Heartbeat monitoring for stuck message detection
 * - Automatic retry logic with configurable max retries
 * - Priority-based message ordering
 * - Queue depth and statistics monitoring
 * - Cleanup utilities for old messages
 *
 * Implementation:
 * - SQLite-backed queue storage with transaction safety
 * - Per-world sequential processing (only one message per world at a time)
 * - Atomic dequeue with SELECT FOR UPDATE pattern
 * - Heartbeat timeout detection (default 5 minutes)
 * - Retry on failure up to maxRetries (default 3)
 * - Indexes for efficient dequeue and stuck detection
 *
 * Queue Message Lifecycle:
 * 1. pending: Message enqueued, waiting to be processed
 * 2. processing: Message picked up by worker, actively processing
 * 3. completed: Processing finished successfully
 * 4. failed: Processing failed after max retries
 *
 * Heartbeat Pattern:
 * - Worker calls updateHeartbeat() periodically during long operations
 * - detectStuckMessages() finds messages with stale heartbeats
 * - Stuck messages automatically reset to 'pending' for retry
 *
 * Changes:
 * - 2025-01-XX: Initial implementation for async world processing
 * - Added comprehensive queue lifecycle management
 * - Implemented per-world locking mechanism
 * - Added heartbeat monitoring and stuck detection
 */

import type { Database } from 'sqlite3';

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
 * Queue storage configuration
 */
export interface QueueStorageConfig {
  db: Database;
}

/**
 * Helper to promisify db.run
 */
function dbRun(db: Database, sql: string, ...params: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

/**
 * Helper to promisify db.get
 */
function dbGet(db: Database, sql: string, ...params: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Helper to promisify db.all
 */
function dbAll(db: Database, sql: string, ...params: any[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * SQLite queue storage context
 */
interface SQLiteQueueStorageContext {
  db: Database;
  isInitialized: boolean;
}

/**
 * Ensure the message_queue table exists
 */
async function ensureInitialized(ctx: SQLiteQueueStorageContext): Promise<void> {
  if (ctx.isInitialized) return;

  // Check if message_queue table exists
  const tableCheck = await dbGet(
    ctx.db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='message_queue'"
  );

  if (!tableCheck) {
    // Table doesn't exist, create it (fallback - normally migration creates this)
    await dbRun(ctx.db, `
      CREATE TABLE IF NOT EXISTS message_queue (
        id TEXT PRIMARY KEY,
        worldId TEXT NOT NULL,
        messageId TEXT NOT NULL,
        content TEXT NOT NULL,
        sender TEXT NOT NULL DEFAULT 'human',
        chatId TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        priority INTEGER DEFAULT 0,
        createdAt INTEGER NOT NULL,
        processedAt INTEGER,
        heartbeatAt INTEGER,
        completedAt INTEGER,
        error TEXT,
        retryCount INTEGER DEFAULT 0,
        maxRetries INTEGER DEFAULT 3,
        timeoutSeconds INTEGER DEFAULT 300,
        CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
      )
    `);

    // Create indexes
    await dbRun(ctx.db, `
      CREATE INDEX IF NOT EXISTS idx_queue_dequeue 
        ON message_queue(worldId, status, priority DESC, createdAt ASC)
    `);

    await dbRun(ctx.db, `
      CREATE INDEX IF NOT EXISTS idx_queue_message 
        ON message_queue(messageId)
    `);

    await dbRun(ctx.db, `
      CREATE INDEX IF NOT EXISTS idx_queue_stuck 
        ON message_queue(status, heartbeatAt)
    `);

    await dbRun(ctx.db, `
      CREATE INDEX IF NOT EXISTS idx_queue_world 
        ON message_queue(worldId)
    `);

    await dbRun(ctx.db, `
      CREATE INDEX IF NOT EXISTS idx_queue_cleanup 
        ON message_queue(status, completedAt)
    `);
  }

  ctx.isInitialized = true;
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
 * Convert database row to QueueMessage
 */
function rowToQueueMessage(row: any): QueueMessage {
  return {
    id: row.id,
    worldId: row.worldId,
    messageId: row.messageId,
    content: row.content,
    sender: row.sender,
    chatId: row.chatId,
    status: row.status as QueueStatus,
    priority: row.priority,
    createdAt: new Date(row.createdAt),
    processedAt: row.processedAt ? new Date(row.processedAt) : undefined,
    heartbeatAt: row.heartbeatAt ? new Date(row.heartbeatAt) : undefined,
    completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
    error: row.error,
    retryCount: row.retryCount,
    maxRetries: row.maxRetries,
    timeoutSeconds: row.timeoutSeconds
  };
}

/**
 * Enqueue a message for processing
 */
async function enqueue(
  ctx: SQLiteQueueStorageContext,
  message: EnqueueMessageInput
): Promise<QueueMessage> {
  await ensureInitialized(ctx);

  const id = generateUUID();
  const now = Date.now();

  await dbRun(
    ctx.db,
    `INSERT INTO message_queue (
      id, worldId, messageId, content, sender, chatId, status, priority, 
      createdAt, retryCount, maxRetries, timeoutSeconds
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, 0, ?, ?)`,
    id,
    message.worldId,
    message.messageId,
    message.content,
    message.sender,
    message.chatId,
    message.priority,
    now,
    message.maxRetries,
    message.timeoutSeconds
  );

  return {
    id,
    worldId: message.worldId,
    messageId: message.messageId,
    content: message.content,
    sender: message.sender,
    chatId: message.chatId ?? null,
    status: 'pending',
    priority: message.priority,
    createdAt: new Date(now),
    retryCount: 0,
    maxRetries: message.maxRetries,
    timeoutSeconds: message.timeoutSeconds
  };
}

/**
 * Dequeue the next pending message for a specific world
 * Uses transaction with SELECT FOR UPDATE to ensure only one worker gets the message
 */
async function dequeue(
  ctx: SQLiteQueueStorageContext,
  worldId: string
): Promise<QueueMessage | null> {
  await ensureInitialized(ctx);

  // Use transaction for atomic lock acquisition
  return new Promise((resolve, reject) => {
    ctx.db.serialize(() => {
      ctx.db.run('BEGIN IMMEDIATE TRANSACTION', (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Check if world already has a processing message
        ctx.db.get(
          `SELECT COUNT(*) as count FROM message_queue 
           WHERE worldId = ? AND status = 'processing'`,
          [worldId],
          (err, row: any) => {
            if (err) {
              ctx.db.run('ROLLBACK');
              reject(err);
              return;
            }

            if (row.count > 0) {
              // World is already processing a message
              ctx.db.run('ROLLBACK');
              resolve(null);
              return;
            }

            // Get next pending message with highest priority
            ctx.db.get(
              `SELECT * FROM message_queue 
               WHERE worldId = ? AND status = 'pending'
               ORDER BY priority DESC, createdAt ASC
               LIMIT 1`,
              [worldId],
              (err, row: any) => {
                if (err) {
                  ctx.db.run('ROLLBACK');
                  reject(err);
                  return;
                }

                if (!row) {
                  // No pending messages
                  ctx.db.run('ROLLBACK');
                  resolve(null);
                  return;
                }

                // Mark as processing
                const now = Date.now();
                ctx.db.run(
                  `UPDATE message_queue 
                   SET status = 'processing', processedAt = ?, heartbeatAt = ?
                   WHERE id = ?`,
                  [now, now, row.id],
                  (err) => {
                    if (err) {
                      ctx.db.run('ROLLBACK');
                      reject(err);
                      return;
                    }

                    ctx.db.run('COMMIT', (err) => {
                      if (err) {
                        reject(err);
                        return;
                      }

                      resolve(rowToQueueMessage(row));
                    });
                  }
                );
              }
            );
          }
        );
      });
    });
  });
}

/**
 * Update heartbeat timestamp for a message
 */
async function updateHeartbeat(
  ctx: SQLiteQueueStorageContext,
  messageId: string
): Promise<void> {
  await ensureInitialized(ctx);

  const now = Date.now();
  await dbRun(
    ctx.db,
    `UPDATE message_queue SET heartbeatAt = ? WHERE messageId = ? AND status = 'processing'`,
    now,
    messageId
  );
}

/**
 * Mark a message as completed successfully
 */
async function markCompleted(
  ctx: SQLiteQueueStorageContext,
  messageId: string
): Promise<void> {
  await ensureInitialized(ctx);

  const now = Date.now();
  await dbRun(
    ctx.db,
    `UPDATE message_queue SET status = 'completed', completedAt = ? WHERE messageId = ?`,
    now,
    messageId
  );
}

/**
 * Mark a message as failed with error details
 * Automatically retries if retryCount < maxRetries
 */
async function markFailed(
  ctx: SQLiteQueueStorageContext,
  messageId: string,
  error: string
): Promise<void> {
  await ensureInitialized(ctx);

  // Get current message to check retry count
  const row = await dbGet(
    ctx.db,
    `SELECT retryCount, maxRetries FROM message_queue WHERE messageId = ?`,
    messageId
  );

  if (!row) {
    throw new Error(`Message ${messageId} not found in queue`);
  }

  const now = Date.now();

  if (row.retryCount < row.maxRetries) {
    // Retry: reset to pending and increment retry count
    await dbRun(
      ctx.db,
      `UPDATE message_queue 
       SET status = 'pending', error = ?, retryCount = retryCount + 1, 
           processedAt = NULL, heartbeatAt = NULL
       WHERE messageId = ?`,
      error,
      messageId
    );
  } else {
    // Max retries reached: mark as failed
    await dbRun(
      ctx.db,
      `UPDATE message_queue 
       SET status = 'failed', error = ?, completedAt = ?
       WHERE messageId = ?`,
      error,
      now,
      messageId
    );
  }
}

/**
 * Retry a failed message (reset to pending)
 */
async function retryMessage(
  ctx: SQLiteQueueStorageContext,
  messageId: string
): Promise<boolean> {
  await ensureInitialized(ctx);

  const result = await dbRun(
    ctx.db,
    `UPDATE message_queue 
     SET status = 'pending', retryCount = retryCount + 1, 
         processedAt = NULL, heartbeatAt = NULL, completedAt = NULL
     WHERE messageId = ? AND status = 'failed' AND retryCount < maxRetries`,
    messageId
  );

  return (result as any).changes > 0;
}

/**
 * Get queue depth for a world
 */
async function getQueueDepth(
  ctx: SQLiteQueueStorageContext,
  worldId: string
): Promise<number> {
  await ensureInitialized(ctx);

  const row = await dbGet(
    ctx.db,
    `SELECT COUNT(*) as count FROM message_queue WHERE worldId = ? AND status = 'pending'`,
    worldId
  );

  return row.count;
}

/**
 * Get queue statistics
 */
async function getQueueStats(
  ctx: SQLiteQueueStorageContext,
  worldId?: string
): Promise<WorldQueueStats[]> {
  await ensureInitialized(ctx);

  const whereClause = worldId ? 'WHERE worldId = ?' : '';
  const params = worldId ? [worldId] : [];

  const rows = await dbAll(
    ctx.db,
    `SELECT 
      worldId,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      MIN(CASE WHEN status = 'pending' THEN createdAt END) as oldestPending,
      AVG(CASE WHEN status = 'completed' AND processedAt IS NOT NULL AND completedAt IS NOT NULL 
          THEN completedAt - processedAt END) as avgProcessingTime
     FROM message_queue
     ${whereClause}
     GROUP BY worldId`,
    ...params
  );

  return rows.map((row: any) => ({
    worldId: row.worldId,
    pending: row.pending,
    processing: row.processing,
    completed: row.completed,
    failed: row.failed,
    oldestPending: row.oldestPending ? new Date(row.oldestPending) : undefined,
    avgProcessingTime: row.avgProcessingTime || undefined
  }));
}

/**
 * Detect and reset stuck messages
 */
async function detectStuckMessages(
  ctx: SQLiteQueueStorageContext
): Promise<number> {
  await ensureInitialized(ctx);

  const now = Date.now();

  // Find stuck messages: processing status with stale heartbeat or no heartbeat
  const result = await dbRun(
    ctx.db,
    `UPDATE message_queue 
     SET status = 'pending', retryCount = retryCount + 1, 
         processedAt = NULL, heartbeatAt = NULL,
         error = 'Processing timeout - message was stuck'
     WHERE status = 'processing' 
       AND retryCount < maxRetries
       AND (
         heartbeatAt IS NULL 
         OR heartbeatAt < (? - timeoutSeconds * 1000)
       )`,
    now
  );

  return (result as any).changes || 0;
}

/**
 * Cleanup old completed/failed messages
 */
async function cleanup(
  ctx: SQLiteQueueStorageContext,
  olderThan: Date
): Promise<number> {
  await ensureInitialized(ctx);

  const timestamp = olderThan.getTime();

  const result = await dbRun(
    ctx.db,
    `DELETE FROM message_queue 
     WHERE status IN ('completed', 'failed') 
       AND completedAt < ?`,
    timestamp
  );

  return (result as any).changes || 0;
}

/**
 * Get message by ID
 */
async function getMessage(
  ctx: SQLiteQueueStorageContext,
  messageId: string
): Promise<QueueMessage | null> {
  await ensureInitialized(ctx);

  const row = await dbGet(
    ctx.db,
    `SELECT * FROM message_queue WHERE messageId = ?`,
    messageId
  );

  return row ? rowToQueueMessage(row) : null;
}

/**
 * Create SQLite queue storage instance
 */
export function createSQLiteQueueStorage(config: QueueStorageConfig): QueueStorage {
  const ctx: SQLiteQueueStorageContext = {
    db: config.db,
    isInitialized: false
  };

  return {
    enqueue: (message) => enqueue(ctx, message),
    dequeue: (worldId) => dequeue(ctx, worldId),
    updateHeartbeat: (messageId) => updateHeartbeat(ctx, messageId),
    markCompleted: (messageId) => markCompleted(ctx, messageId),
    markFailed: (messageId, error) => markFailed(ctx, messageId, error),
    retryMessage: (messageId) => retryMessage(ctx, messageId),
    getQueueDepth: (worldId) => getQueueDepth(ctx, worldId),
    getQueueStats: (worldId) => getQueueStats(ctx, worldId),
    detectStuckMessages: () => detectStuckMessages(ctx),
    cleanup: (olderThan) => cleanup(ctx, olderThan),
    getMessage: (messageId) => getMessage(ctx, messageId)
  };
}

