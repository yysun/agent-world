/**
 * SQLite Queue Storage Implementation
 * 
 * Purpose: Persistent message queue using SQLite for cross-process message handling
 * 
 * Features:
 * - Persistent queue survives process restarts
 * - Per-chat FIFO ordering with priority support
 * - Per-chat locking (one message processing at a time per chat)
 * - Transactional dequeue for atomicity
 * - Automatic retry on failure
 * - Heartbeat monitoring and stuck message recovery
 * - Statistics and monitoring
 * 
 * Queue Message Lifecycle:
 * 1. pending: Message enqueued, waiting in queue
 * 2. processing: Message dequeued and being processed
 * 3. completed: Processing finished successfully
 * 4. failed: Processing failed after max retries
 * 
 * Per-Chat Locking:
 * - Dequeue ensures only one message is processing per (worldId, chatId)
 * - Multiple chats in same world can process concurrently
 * - Uses transactional SELECT + UPDATE for atomicity
 * 
 * Changes:
 * - 2025-11-06: Initial SQLite queue storage implementation with per-chat locking
 */

import type { Database } from 'sqlite3';
import type {
  QueueStorage,
  QueueMessage,
  QueueStatus,
  EnqueueMessageInput,
  WorldQueueStats
} from './queue-storage.js';

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
function dbGet<T = any>(db: Database, sql: string, ...params: any[]): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T | undefined);
    });
  });
}

/**
 * Helper to promisify db.all
 */
function dbAll<T = any>(db: Database, sql: string, ...params: any[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve((rows as T[]) || []);
    });
  });
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
 * Convert DB row to QueueMessage
 */
function rowToMessage(row: any): QueueMessage {
  return {
    id: row.id,
    worldId: row.world_id,
    messageId: row.message_id,
    content: row.content,
    sender: row.sender,
    chatId: row.chat_id,
    status: row.status as QueueStatus,
    priority: row.priority,
    createdAt: new Date(row.created_at),
    processedAt: row.processed_at ? new Date(row.processed_at) : undefined,
    heartbeatAt: row.heartbeat_at ? new Date(row.heartbeat_at) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    error: row.error,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    timeoutSeconds: row.timeout_seconds
  };
}

interface SQLiteQueueStorageContext {
  db: Database;
  isInitialized: boolean;
}

/**
 * Ensure the message_queue table is created with proper schema
 */
async function ensureInitialized(ctx: SQLiteQueueStorageContext): Promise<void> {
  if (ctx.isInitialized) return;

  // Create message_queue table
  await dbRun(ctx.db, `
    CREATE TABLE IF NOT EXISTS message_queue (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
      chat_id TEXT,
      message_id TEXT NOT NULL,
      content TEXT NOT NULL,
      sender TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      priority INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      processed_at INTEGER,
      heartbeat_at INTEGER,
      completed_at INTEGER,
      error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      timeout_seconds INTEGER NOT NULL DEFAULT 300
    )
  `);

  // Create indexes for efficient queries
  await dbRun(ctx.db, `
    CREATE INDEX IF NOT EXISTS idx_queue_world_chat_status_priority_time
      ON message_queue(world_id, chat_id, status, priority DESC, created_at ASC)
  `);

  await dbRun(ctx.db, `
    CREATE INDEX IF NOT EXISTS idx_queue_world_chat_status
      ON message_queue(world_id, chat_id, status)
  `);

  await dbRun(ctx.db, `
    CREATE INDEX IF NOT EXISTS idx_queue_message_id
      ON message_queue(message_id)
  `);

  await dbRun(ctx.db, `
    CREATE INDEX IF NOT EXISTS idx_queue_status
      ON message_queue(status)
  `);

  ctx.isInitialized = true;
}

/**
 * Create SQLite queue storage
 */
export async function createSQLiteQueueStorage(db: Database): Promise<QueueStorage> {
  const ctx: SQLiteQueueStorageContext = {
    db,
    isInitialized: false
  };

  await ensureInitialized(ctx);

  return {
    enqueue: (message: EnqueueMessageInput) => enqueue(ctx, message),
    dequeue: (worldId: string, chatId?: string | null) => dequeue(ctx, worldId, chatId),
    updateHeartbeat: (messageId: string) => updateHeartbeat(ctx, messageId),
    markCompleted: (messageId: string) => markCompleted(ctx, messageId),
    markFailed: (messageId: string, error: string) => markFailed(ctx, messageId, error),
    retryMessage: (messageId: string) => retryMessage(ctx, messageId),
    getQueueDepth: (worldId: string, chatId?: string | null) => getQueueDepth(ctx, worldId, chatId),
    getQueueStats: (worldId?: string) => getQueueStats(ctx, worldId),
    detectStuckMessages: () => detectStuckMessages(ctx),
    cleanup: (olderThan: Date) => cleanup(ctx, olderThan),
    getMessage: (messageId: string) => getMessage(ctx, messageId)
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
      id, world_id, chat_id, message_id, content, sender,
      status, priority, created_at, retry_count, max_retries, timeout_seconds
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    message.worldId,
    message.chatId ?? null,
    message.messageId,
    message.content,
    message.sender,
    'pending',
    message.priority,
    now,
    0,
    message.maxRetries,
    message.timeoutSeconds
  );

  const row = await dbGet(ctx.db, 'SELECT * FROM message_queue WHERE id = ?', id);
  if (!row) {
    throw new Error('Failed to retrieve enqueued message');
  }

  return rowToMessage(row);
}

/**
 * Dequeue the next pending message for a specific world/chat
 * Uses transactional locking to ensure only one message per (worldId, chatId) is processing
 * 
 * If chatId is provided, dequeues for that specific chat.
 * If chatId is null/undefined, dequeues world-level messages (chatId IS NULL).
 */
async function dequeue(
  ctx: SQLiteQueueStorageContext,
  worldId: string,
  chatId?: string | null
): Promise<QueueMessage | null> {
  await ensureInitialized(ctx);

  // Start immediate transaction
  await dbRun(ctx.db, 'BEGIN IMMEDIATE');

  try {
    // Check if there's already a processing message for this (worldId, chatId)
    const chatCondition = chatId === null || chatId === undefined
      ? 'chat_id IS NULL'
      : 'chat_id = ?';
    
    const checkParams = chatId === null || chatId === undefined
      ? [worldId]
      : [worldId, chatId];

    const processingCount = await dbGet<{ count: number }>(
      ctx.db,
      `SELECT COUNT(*) as count FROM message_queue 
       WHERE world_id = ? AND ${chatCondition} AND status = 'processing'`,
      ...checkParams
    );

    if (processingCount && processingCount.count > 0) {
      // Already processing a message for this chat
      await dbRun(ctx.db, 'COMMIT');
      return null;
    }

    // Find the highest priority pending message for this (worldId, chatId)
    const pendingParams = chatId === null || chatId === undefined
      ? [worldId]
      : [worldId, chatId];

    const row = await dbGet(
      ctx.db,
      `SELECT * FROM message_queue 
       WHERE world_id = ? AND ${chatCondition} AND status = 'pending'
       ORDER BY priority DESC, created_at ASC
       LIMIT 1`,
      ...pendingParams
    );

    if (!row) {
      // No pending messages
      await dbRun(ctx.db, 'COMMIT');
      return null;
    }

    // Update message to processing
    const now = Date.now();
    await dbRun(
      ctx.db,
      `UPDATE message_queue 
       SET status = 'processing', processed_at = ?, heartbeat_at = ?
       WHERE id = ?`,
      now,
      now,
      row.id
    );

    await dbRun(ctx.db, 'COMMIT');

    // Fetch updated row
    const updatedRow = await dbGet(ctx.db, 'SELECT * FROM message_queue WHERE id = ?', row.id);
    if (!updatedRow) {
      throw new Error('Failed to retrieve updated message');
    }

    return rowToMessage(updatedRow);
  } catch (error) {
    await dbRun(ctx.db, 'ROLLBACK');
    throw error;
  }
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
    'UPDATE message_queue SET heartbeat_at = ? WHERE id = ? AND status = \'processing\'',
    now,
    messageId
  );
}

/**
 * Mark a message as completed
 */
async function markCompleted(
  ctx: SQLiteQueueStorageContext,
  messageId: string
): Promise<void> {
  await ensureInitialized(ctx);

  const now = Date.now();
  await dbRun(
    ctx.db,
    'UPDATE message_queue SET status = \'completed\', completed_at = ? WHERE id = ?',
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

  const row = await dbGet(
    ctx.db,
    'SELECT retry_count, max_retries FROM message_queue WHERE id = ?',
    messageId
  );

  if (!row) {
    throw new Error(`Message ${messageId} not found`);
  }

  const newRetryCount = row.retry_count + 1;

  if (newRetryCount < row.max_retries) {
    // Retry: reset to pending
    await dbRun(
      ctx.db,
      `UPDATE message_queue 
       SET status = 'pending', retry_count = ?, error = ?,
           processed_at = NULL, heartbeat_at = NULL
       WHERE id = ?`,
      newRetryCount,
      error,
      messageId
    );
  } else {
    // Max retries reached: mark as failed permanently
    const now = Date.now();
    await dbRun(
      ctx.db,
      `UPDATE message_queue 
       SET status = 'failed', retry_count = ?, error = ?, completed_at = ?
       WHERE id = ?`,
      newRetryCount,
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

  const row = await dbGet(
    ctx.db,
    'SELECT retry_count, max_retries FROM message_queue WHERE message_id = ? AND status = \'failed\'',
    messageId
  );

  if (!row || row.retry_count >= row.max_retries) {
    return false;
  }

  const newRetryCount = row.retry_count + 1;
  await dbRun(
    ctx.db,
    `UPDATE message_queue 
     SET status = 'pending', retry_count = ?, 
         processed_at = NULL, heartbeat_at = NULL, completed_at = NULL
     WHERE message_id = ?`,
    newRetryCount,
    messageId
  );

  return true;
}

/**
 * Get queue depth (number of pending messages) for a world/chat
 */
async function getQueueDepth(
  ctx: SQLiteQueueStorageContext,
  worldId: string,
  chatId?: string | null
): Promise<number> {
  await ensureInitialized(ctx);

  const chatCondition = chatId === null || chatId === undefined
    ? 'chat_id IS NULL'
    : 'chat_id = ?';
  
  const params = chatId === null || chatId === undefined
    ? [worldId]
    : [worldId, chatId];

  const result = await dbGet<{ count: number }>(
    ctx.db,
    `SELECT COUNT(*) as count FROM message_queue 
     WHERE world_id = ? AND ${chatCondition} AND status = 'pending'`,
    ...params
  );

  return result?.count || 0;
}

/**
 * Get queue statistics
 */
async function getQueueStats(
  ctx: SQLiteQueueStorageContext,
  worldId?: string
): Promise<WorldQueueStats[]> {
  await ensureInitialized(ctx);

  const whereClause = worldId ? 'WHERE world_id = ?' : '';
  const params = worldId ? [worldId] : [];

  const rows = await dbAll<any>(
    ctx.db,
    `SELECT 
      world_id,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
      COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
      MIN(CASE WHEN status = 'pending' THEN created_at END) as oldest_pending,
      AVG(CASE WHEN status = 'completed' AND processed_at IS NOT NULL AND completed_at IS NOT NULL 
        THEN completed_at - processed_at END) as avg_processing_time
     FROM message_queue
     ${whereClause}
     GROUP BY world_id`,
    ...params
  );

  return rows.map(row => ({
    worldId: row.world_id,
    pending: row.pending,
    processing: row.processing,
    completed: row.completed,
    failed: row.failed,
    oldestPending: row.oldest_pending ? new Date(row.oldest_pending) : undefined,
    avgProcessingTime: row.avg_processing_time || undefined
  }));
}

/**
 * Detect and reset stuck messages (stale heartbeat)
 * Returns number of messages reset
 */
async function detectStuckMessages(
  ctx: SQLiteQueueStorageContext
): Promise<number> {
  await ensureInitialized(ctx);

  const now = Date.now();
  
  // Find stuck messages: processing status with heartbeat older than timeout
  const stuckRows = await dbAll<any>(
    ctx.db,
    `SELECT id, timeout_seconds, retry_count, max_retries, heartbeat_at
     FROM message_queue
     WHERE status = 'processing'
       AND heartbeat_at IS NOT NULL
       AND ? - heartbeat_at > timeout_seconds * 1000`,
    now
  );

  let resetCount = 0;

  for (const row of stuckRows) {
    if (row.retry_count < row.max_retries) {
      // Reset to pending for retry
      await dbRun(
        ctx.db,
        `UPDATE message_queue 
         SET status = 'pending', retry_count = retry_count + 1,
             processed_at = NULL, heartbeat_at = NULL,
             error = 'Stuck message detected - heartbeat timeout'
         WHERE id = ?`,
        row.id
      );
      resetCount++;
    } else {
      // Max retries reached: mark as failed
      await dbRun(
        ctx.db,
        `UPDATE message_queue 
         SET status = 'failed', completed_at = ?,
             error = 'Stuck message detected - max retries exceeded'
         WHERE id = ?`,
        now,
        row.id
      );
    }
  }

  return resetCount;
}

/**
 * Cleanup old completed/failed messages
 * Returns number of messages deleted
 */
async function cleanup(
  ctx: SQLiteQueueStorageContext,
  olderThan: Date
): Promise<number> {
  await ensureInitialized(ctx);

  const threshold = olderThan.getTime();

  const result = await dbRun(
    ctx.db,
    `DELETE FROM message_queue 
     WHERE (status = 'completed' OR status = 'failed')
       AND completed_at IS NOT NULL
       AND completed_at < ?`,
    threshold
  );

  return (result as any).changes || 0;
}

/**
 * Get message by ID (for debugging/monitoring)
 */
async function getMessage(
  ctx: SQLiteQueueStorageContext,
  messageId: string
): Promise<QueueMessage | null> {
  await ensureInitialized(ctx);

  const row = await dbGet(
    ctx.db,
    'SELECT * FROM message_queue WHERE message_id = ?',
    messageId
  );

  return row ? rowToMessage(row) : null;
}
