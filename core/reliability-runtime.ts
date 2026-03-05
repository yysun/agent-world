/**
 * Reliability Runtime Helpers
 *
 * Purpose:
 * - Provide shared timeout/retry policy contracts and chat-scoped wait-status emission helpers.
 *
 * Key features:
 * - Canonical reliability policy/error-category types.
 * - Chat-scoped per-second system status emitter with immediate first emission.
 * - Automatic elapsed/remaining second computation for bounded waits.
 * - No-op behavior when world/chat context is unavailable.
 *
 * Implementation notes:
 * - Keep helpers dependency-light so runtime boundaries (MCP/queue/LLM/etc.) can reuse them.
 * - Emitter lifecycle is explicit; caller must call `stop()` on completion/error/abort paths.
 *
 * Recent changes:
 * - 2026-03-05: Initial shared reliability contract + wait-status emitter implementation.
 */

import type { World } from './types.js';

export type ReliabilityErrorCategory = 'timeout' | 'retry_exhausted' | 'transport_error';

export type RetryDelayStrategy = (attempt: number) => number;

export interface ReliabilityPolicy {
  timeoutMs?: number;
  maxAttempts: number;
  retryDelayMs: RetryDelayStrategy;
  terminalErrorCategory: ReliabilityErrorCategory;
}

export interface WaitStatusSnapshot {
  phase: string;
  reason?: string;
  elapsedSeconds: number;
  remainingSeconds: number | null;
  attempt?: number;
  maxAttempts?: number;
  attemptsRemaining?: number;
}

type WaitStatusEmitterOptions = {
  world?: World | null;
  chatId?: string | null;
  phase: string;
  reason?: string;
  durationMs?: number | null;
  attempt?: number;
  maxAttempts?: number;
  contentBuilder?: (snapshot: WaitStatusSnapshot) => string;
};

export type WaitStatusEmitterHandle = {
  stop: () => void;
  emitNow: () => void;
};

function buildStatusMessageId(): string {
  return `status-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultContentBuilder(snapshot: WaitStatusSnapshot): string {
  const phaseLabel = snapshot.phase || 'wait';
  const reasonLabel = snapshot.reason ? ` (${snapshot.reason})` : '';
  const attemptLabel = typeof snapshot.attempt === 'number' && typeof snapshot.maxAttempts === 'number'
    ? ` attempt ${snapshot.attempt}/${snapshot.maxAttempts}, remaining attempts ${snapshot.attemptsRemaining ?? 0},`
    : '';
  const remainingLabel = snapshot.remainingSeconds == null
    ? 'remaining unknown'
    : `remaining ${snapshot.remainingSeconds}s`;
  return `${phaseLabel}${reasonLabel}:` +
    `${attemptLabel} elapsed ${snapshot.elapsedSeconds}s, ${remainingLabel}.`;
}

export function startChatScopedWaitStatusEmitter(options: WaitStatusEmitterOptions): WaitStatusEmitterHandle {
  const world = options.world ?? null;
  const scopedChatId = typeof options.chatId === 'string' ? options.chatId.trim() : '';

  if (!world || !scopedChatId) {
    return {
      stop: () => { },
      emitNow: () => { },
    };
  }

  const startedAt = Date.now();
  const totalMs = typeof options.durationMs === 'number' && options.durationMs >= 0
    ? options.durationMs
    : null;
  const maxAttempts = typeof options.maxAttempts === 'number' ? options.maxAttempts : undefined;
  const attempt = typeof options.attempt === 'number' ? options.attempt : undefined;
  const attemptsRemaining = typeof maxAttempts === 'number' && typeof attempt === 'number'
    ? Math.max(0, maxAttempts - attempt)
    : undefined;

  let intervalId: NodeJS.Timeout | null = null;
  let stopped = false;
  const contentBuilder = options.contentBuilder || defaultContentBuilder;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const emitNow = () => {
    if (stopped) return;
    const elapsedMs = Math.max(0, Date.now() - startedAt);
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const remainingSeconds = totalMs == null ? null : Math.max(0, Math.ceil((totalMs - elapsedMs) / 1000));

    world.eventEmitter.emit('system', {
      content: contentBuilder({
        phase: options.phase,
        reason: options.reason,
        elapsedSeconds,
        remainingSeconds,
        attempt,
        maxAttempts,
        attemptsRemaining,
      }),
      timestamp: new Date(),
      messageId: buildStatusMessageId(),
      chatId: scopedChatId,
    });

    if (remainingSeconds != null && remainingSeconds <= 0) {
      stop();
    }
  };

  intervalId = setInterval(emitNow, 1000);
  emitNow();

  return { stop, emitNow };
}
