-- Migration: Create message queue for asynchronous world message processing
-- Version: 10 (next version after event_sequences)
-- Date: 2025-11-01
--
-- This migration creates the message_queue table to support asynchronous message
-- processing with per-world sequential execution, heartbeat monitoring, and retry logic.
--
-- Table Design:
-- - id: Unique queue entry identifier (UUID)
-- - worldId: World context for the message
-- - messageId: Reference to the message being processed (UUID)
-- - content: Message content
-- - sender: Message sender (human, agent name, system)
-- - chatId: Chat context (nullable for world-level messages)
-- - status: Processing status (pending, processing, completed, failed)
-- - priority: Priority for queue ordering (higher = processed first)
-- - createdAt: When message was enqueued
-- - processedAt: When processing started
-- - heartbeatAt: Last heartbeat timestamp (for stuck detection)
-- - completedAt: When processing finished
-- - error: Error message if failed
-- - retryCount: Number of retry attempts
-- - maxRetries: Maximum allowed retries (default 3)
-- - timeoutSeconds: Timeout for stuck message detection (default 300 = 5 minutes)
--
-- Indexes:
-- - Composite index on (worldId, status, priority, createdAt) for efficient dequeue
-- - Index on messageId for message tracking
-- - Index on (status, heartbeatAt) for stuck message detection
--
-- Per-World Sequential Processing:
-- - Only one message per worldId can be in 'processing' status at a time
-- - Dequeue operation uses SELECT FOR UPDATE to acquire lock
-- - Processing status prevents other workers from picking up messages
--
-- Heartbeat Monitoring:
-- - heartbeatAt updated periodically during long-running operations
-- - Stuck messages detected when heartbeatAt is stale (> timeoutSeconds)
-- - Stuck messages automatically reset to 'pending' for retry
--
-- Retry Logic:
-- - Failed messages can be retried up to maxRetries times
-- - retryCount incremented on each retry attempt
-- - Messages exceeding maxRetries remain in 'failed' status

-- Create message_queue table
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
  
  -- Foreign key constraints (optional - queue can outlive worlds)
  -- Uncomment if you want cascade delete when world is deleted
  -- FOREIGN KEY (worldId) REFERENCES worlds(id) ON DELETE CASCADE
  
  -- Status constraint
  CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Index for efficient dequeue operations (FIFO per world with priority)
CREATE INDEX IF NOT EXISTS idx_queue_dequeue 
  ON message_queue(worldId, status, priority DESC, createdAt ASC);

-- Index for message tracking
CREATE INDEX IF NOT EXISTS idx_queue_message 
  ON message_queue(messageId);

-- Index for stuck message detection
CREATE INDEX IF NOT EXISTS idx_queue_stuck 
  ON message_queue(status, heartbeatAt);

-- Index for worldId alone for status queries
CREATE INDEX IF NOT EXISTS idx_queue_world 
  ON message_queue(worldId);

-- Index for cleanup queries (completed/failed messages)
CREATE INDEX IF NOT EXISTS idx_queue_cleanup 
  ON message_queue(status, completedAt);
