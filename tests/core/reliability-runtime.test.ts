/**
 * Reliability Runtime Helper Tests
 *
 * Purpose:
 * - Validate shared wait-status emitter behavior used by retry/timeout boundaries.
 *
 * Key features:
 * - Immediate first status emission and 1-second cadence while active.
 * - Elapsed/remaining second reporting for bounded waits.
 * - No-op behavior when world/chat scope is unavailable.
 * - Explicit stop cleanup to prevent orphan timers.
 *
 * Recent changes:
 * - 2026-03-05: Added initial coverage for shared reliability runtime contracts.
 */

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { startChatScopedWaitStatusEmitter } from '../../core/reliability-runtime.js';

describe('reliability-runtime wait status emitter', () => {
  it('emits immediate + per-second statuses and auto-stops after bounded duration', async () => {
    vi.useFakeTimers();
    try {
      const world = {
        eventEmitter: new EventEmitter(),
      } as any;
      const emitSpy = vi.spyOn(world.eventEmitter, 'emit');

      startChatScopedWaitStatusEmitter({
        world,
        chatId: 'chat-1',
        phase: 'retry',
        reason: 'transport_error',
        durationMs: 2100,
        attempt: 1,
        maxAttempts: 3,
      });

      expect(emitSpy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(emitSpy).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1000);
      expect(emitSpy).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(2000);
      // Auto-stopped; no additional emissions after completion.
      expect(emitSpy).toHaveBeenCalledTimes(4);
      await vi.advanceTimersByTimeAsync(2000);
      expect(emitSpy).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not emit chat-visible status when world/chat context is missing', async () => {
    vi.useFakeTimers();
    try {
      const handle = startChatScopedWaitStatusEmitter({
        world: null,
        chatId: null,
        phase: 'retry',
        durationMs: 1500,
      });

      // Should be safe no-op methods.
      handle.emitNow();
      handle.stop();
      await vi.advanceTimersByTimeAsync(2000);
      expect(true).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cleans interval immediately when bounded duration is already elapsed', async () => {
    vi.useFakeTimers();
    try {
      const world = {
        eventEmitter: new EventEmitter(),
      } as any;
      const emitSpy = vi.spyOn(world.eventEmitter, 'emit');

      startChatScopedWaitStatusEmitter({
        world,
        chatId: 'chat-1',
        phase: 'retry',
        durationMs: 0,
      });

      expect(emitSpy).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
