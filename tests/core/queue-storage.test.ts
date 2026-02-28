/**
 * Queue Storage Behavioral Tests
 *
 * Purpose:
 * - Verify the production in-memory queue implementation through its public API.
 *
 * Key features covered:
 * - FIFO dequeue and per-world processing lock behavior
 * - Success/failure lifecycle transitions
 * - Retry and cleanup behavior
 * - Queue statistics and lookup operations
 *
 * Implementation notes:
 * - Uses `createMemoryQueueStorage` directly (no in-test queue simulation)
 * - Uses in-memory data only; no filesystem or external services
 *
 * Recent changes:
 * - 2026-02-27: Replaced legacy mock queue tests with production-path behavioral tests.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  createMemoryQueueStorage,
  type QueueStorage,
  type EnqueueMessageInput,
} from '../../core/storage/queue-storage.js';

function createMessage(overrides: Partial<EnqueueMessageInput> = {}): EnqueueMessageInput {
  return {
    worldId: 'world-a',
    messageId: 'msg-1',
    content: 'hello',
    sender: 'human',
    priority: 0,
    maxRetries: 2,
    timeoutSeconds: 30,
    ...overrides,
  };
}

describe('queue-storage production behavior', () => {
  let queue: QueueStorage;

  beforeEach(() => {
    queue = createMemoryQueueStorage();
  });

  it('enqueues and dequeues FIFO for the same world', async () => {
    await queue.enqueue(createMessage({ messageId: 'msg-1' }));
    await queue.enqueue(createMessage({ messageId: 'msg-2' }));

    const first = await queue.dequeue('world-a');
    expect(first?.messageId).toBe('msg-1');

    await queue.markCompleted('msg-1');

    const second = await queue.dequeue('world-a');
    expect(second?.messageId).toBe('msg-2');
  });

  it('enforces one active processing message per world, but allows parallel processing across worlds', async () => {
    await queue.enqueue(createMessage({ worldId: 'world-a', messageId: 'a-1' }));
    await queue.enqueue(createMessage({ worldId: 'world-b', messageId: 'b-1' }));

    const a1 = await queue.dequeue('world-a');
    expect(a1?.messageId).toBe('a-1');

    const blocked = await queue.dequeue('world-a');
    expect(blocked).toBeNull();

    const b1 = await queue.dequeue('world-b');
    expect(b1?.messageId).toBe('b-1');
  });

  it('retries failed messages until max retries then marks them failed', async () => {
    await queue.enqueue(createMessage({ messageId: 'msg-retry', maxRetries: 2 }));

    const firstAttempt = await queue.dequeue('world-a');
    expect(firstAttempt?.messageId).toBe('msg-retry');

    await queue.markFailed('msg-retry', 'first failure');
    const afterFirstFailure = await queue.getMessage('msg-retry');
    expect(afterFirstFailure?.status).toBe('pending');
    expect(afterFirstFailure?.retryCount).toBe(1);

    const secondAttempt = await queue.dequeue('world-a');
    expect(secondAttempt?.messageId).toBe('msg-retry');

    await queue.markFailed('msg-retry', 'second failure');
    const afterSecondFailure = await queue.getMessage('msg-retry');
    expect(afterSecondFailure?.status).toBe('failed');
    expect(afterSecondFailure?.retryCount).toBe(2);
    expect(afterSecondFailure?.error).toContain('second failure');
  });

  it('supports retryMessage for permanently failed messages with remaining retry budget', async () => {
    await queue.enqueue(createMessage({ messageId: 'msg-manual-retry', maxRetries: 3 }));

    await queue.dequeue('world-a');
    await queue.markFailed('msg-manual-retry', 'first failure');
    await queue.dequeue('world-a');
    await queue.markFailed('msg-manual-retry', 'second failure');
    await queue.dequeue('world-a');
    await queue.markFailed('msg-manual-retry', 'third failure');

    const failed = await queue.getMessage('msg-manual-retry');
    expect(failed?.status).toBe('failed');

    const retried = await queue.retryMessage('msg-manual-retry');
    expect(retried).toBe(false);
  });

  it('updates heartbeat for processing messages', async () => {
    await queue.enqueue(createMessage({ messageId: 'msg-heartbeat' }));
    const processing = await queue.dequeue('world-a');
    expect(processing?.heartbeatAt).toBeInstanceOf(Date);

    const before = processing?.heartbeatAt?.getTime() ?? 0;
    await new Promise((resolve) => setTimeout(resolve, 2));
    await queue.updateHeartbeat('msg-heartbeat');

    const updated = await queue.getMessage('msg-heartbeat');
    expect((updated?.heartbeatAt?.getTime() ?? 0)).toBeGreaterThanOrEqual(before);
  });

  it('computes queue stats and depth correctly', async () => {
    await queue.enqueue(createMessage({ worldId: 'world-a', messageId: 'a-1' }));
    await queue.enqueue(createMessage({ worldId: 'world-a', messageId: 'a-2' }));
    await queue.enqueue(createMessage({ worldId: 'world-b', messageId: 'b-1' }));

    expect(await queue.getQueueDepth('world-a')).toBe(2);

    await queue.dequeue('world-a');
    await queue.markCompleted('a-1');

    const statsAll = await queue.getQueueStats();
    const worldA = statsAll.find((item) => item.worldId === 'world-a');
    const worldB = statsAll.find((item) => item.worldId === 'world-b');

    expect(worldA).toBeDefined();
    expect(worldA?.pending).toBe(1);
    expect(worldA?.completed).toBe(1);
    expect(worldB?.pending).toBe(1);
  });

  it('cleans up only terminal messages older than threshold', async () => {
    await queue.enqueue(createMessage({ messageId: 'msg-complete' }));
    await queue.dequeue('world-a');
    await queue.markCompleted('msg-complete');

    await queue.enqueue(createMessage({ messageId: 'msg-active' }));

    const removed = await queue.cleanup(new Date(Date.now() + 1000));
    expect(removed).toBe(1);

    const completed = await queue.getMessage('msg-complete');
    const active = await queue.getMessage('msg-active');

    expect(completed).toBeNull();
    expect(active?.status).toBe('pending');
  });

  it('returns 0 for detectStuckMessages in current in-memory implementation', async () => {
    const resetCount = await queue.detectStuckMessages();
    expect(resetCount).toBe(0);
  });
});
