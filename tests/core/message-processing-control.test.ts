/**
 * Unit Tests for message-processing-control
 *
 * Purpose:
 * - Validate chat-scoped processing-handle lifecycle and stale-lock self-healing behavior.
 *
 * Key Features Tested:
 * - Active processing handles remain visible before the stale TTL expires.
 * - Stale processing handles are automatically pruned and aborted by lock checks.
 *
 * Implementation Notes:
 * - Uses fake timers and module re-imports so TTL configuration from env is deterministic.
 * - Tests only public exports from `core/message-processing-control.ts`.
 *
 * Recent Changes:
 * - 2026-03-04: Added stale-handle cleanup coverage to prevent indefinite queue stalls from orphaned chat locks.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('message-processing-control stale lock cleanup', () => {
  const originalTtl = process.env.AGENT_WORLD_ACTIVE_PROCESSING_TTL_MS;

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    if (originalTtl === undefined) {
      delete process.env.AGENT_WORLD_ACTIVE_PROCESSING_TTL_MS;
    } else {
      process.env.AGENT_WORLD_ACTIVE_PROCESSING_TTL_MS = originalTtl;
    }
  });

  it('keeps active chat processing lock before stale TTL expires', async () => {
    process.env.AGENT_WORLD_ACTIVE_PROCESSING_TTL_MS = '5000';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T10:00:00.000Z'));

    const processingControl = await import('../../core/message-processing-control.js');
    const handle = processingControl.beginChatMessageProcessing('world-1', 'chat-1');

    vi.advanceTimersByTime(1000);
    expect(processingControl.hasActiveChatMessageProcessing('world-1', 'chat-1')).toBe(true);

    handle.complete();
    expect(processingControl.hasActiveChatMessageProcessing('world-1', 'chat-1')).toBe(false);
  });

  it('aborts and removes stale processing locks after configured TTL', async () => {
    process.env.AGENT_WORLD_ACTIVE_PROCESSING_TTL_MS = '1000';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T10:00:00.000Z'));

    const processingControl = await import('../../core/message-processing-control.js');
    const handle = processingControl.beginChatMessageProcessing('world-1', 'chat-1');

    vi.advanceTimersByTime(1001);
    expect(processingControl.hasActiveChatMessageProcessing('world-1', 'chat-1')).toBe(false);
    expect(handle.isStopped()).toBe(true);
  });
});
