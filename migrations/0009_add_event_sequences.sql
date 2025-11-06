-- Migration: Add auto-incrementing sequence numbers to events
-- Version: 9
-- Date: 2025-11-06 (Updated)
--
-- This migration ensures that the seq column in events table auto-increments
-- within each world_id/chat_id context using MAX(seq) + 1 approach.
--
-- Approach:
-- - The seq column already exists in the events table (created in 0008)
-- - No separate sequence tracking table is needed
-- - Applications will use: COALESCE((SELECT MAX(seq) FROM events WHERE ...), 0) + 1
-- - Transaction isolation ensures no race conditions
--
-- Backfill Strategy:
-- - Assign sequence numbers to existing events based on creation time
-- - Uses ROW_NUMBER() partitioned by world_id and chat_id
-- - Orders by created_at to maintain chronological sequence

-- Backfill existing events with sequence numbers if they have NULL seq
-- This handles migration of existing data
-- Note: SQLite requires a CTE for window functions in UPDATE
WITH
  numbered_events
  AS
  (
    SELECT
      rowid,
      ROW_NUMBER() OVER (
      PARTITION BY world_id, 
                   CASE WHEN chat_id IS NULL THEN '' ELSE chat_id END
      ORDER BY created_at ASC
    ) as new_seq
    FROM events
    WHERE seq IS NULL
  )
UPDATE events 
SET seq = (SELECT new_seq
FROM numbered_events
WHERE numbered_events.rowid = events.rowid)
WHERE seq IS NULL;
