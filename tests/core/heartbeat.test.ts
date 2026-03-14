/**
 * Core Heartbeat Scheduler Tests
 *
 * Purpose:
 * - Verify heartbeat scheduling guardrails and publish behavior.
 *
 * Key Features:
 * - Strict 5-field cron validation coverage.
 * - Start guard behavior for disabled/invalid configs.
 * - Tick publishes canonical world-sender message on active chat.
 * - Queue guard: heartbeat skips when _queuedChatIds or isChatProcessing blocks.
 *
 * Implementation Notes:
 * - Uses mocked node-cron schedule callback for deterministic tick execution.
 *
 * Recent Changes:
 * - 2026-03-14: Heartbeat ticks now emit env-controlled `heartbeat` logger events instead of direct console logs.
 * - 2026-03-06: Heartbeat start now requires explicit `chatId`; scheduler no longer reads `world.currentChatId`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const scheduleMock = vi.fn();
const validateMock = vi.fn();
const enqueueAndProcessUserTurnMock = vi.fn();
const heartbeatLogger = {
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
  level: 'debug',
};
const createCategoryLoggerMock = vi.fn(() => heartbeatLogger);

vi.mock('node-cron', () => ({
  default: {
    schedule: scheduleMock,
    validate: validateMock,
  }
}));

vi.mock('../../core/queue-manager.js', () => ({
  enqueueAndProcessUserTurn: enqueueAndProcessUserTurnMock,
}));

vi.mock('../../core/logger.js', () => ({
  createCategoryLogger: createCategoryLoggerMock,
}));

describe('core heartbeat', () => {
  afterEach(() => {
    enqueueAndProcessUserTurnMock.mockReset();
    scheduleMock.mockReset();
    validateMock.mockReset();
    createCategoryLoggerMock.mockClear();
    heartbeatLogger.trace.mockReset();
    heartbeatLogger.debug.mockReset();
    heartbeatLogger.info.mockReset();
    heartbeatLogger.warn.mockReset();
    heartbeatLogger.error.mockReset();
    heartbeatLogger.child.mockReset();
  });

  it('validates strict 5-field cron expressions', async () => {
    validateMock.mockReturnValue(true);
    const { isValidCronExpression } = await import('../../core/heartbeat.js');

    expect(isValidCronExpression('*/5 * * * *')).toBe(true);
    expect(isValidCronExpression('*/5 * * * * *')).toBe(false);
    expect(isValidCronExpression('')).toBe(false);
  });

  it('does not start heartbeat when world config is disabled or invalid', async () => {
    validateMock.mockReturnValue(false);
    const { startHeartbeat } = await import('../../core/heartbeat.js');

    const world: any = {
      id: 'world-1',
      heartbeatEnabled: true,
      heartbeatInterval: 'invalid',
      heartbeatPrompt: 'tick',
    };

    const handle = startHeartbeat(world, '');
    expect(handle).toBeNull();
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('enqueues world heartbeat message on tick and writes heartbeat logger diagnostics', async () => {
    validateMock.mockReturnValue(true);
    enqueueAndProcessUserTurnMock.mockResolvedValue({ messageId: 'hb-msg-1', status: 'queued' });

    let tickHandler: (() => void) | null = null;
    const task = {
      stop: vi.fn(),
      destroy: vi.fn(),
      start: vi.fn(),
    };

    scheduleMock.mockImplementation((_expr: string, callback: () => void) => {
      tickHandler = callback;
      return task;
    });

    const { startHeartbeat, stopHeartbeat } = await import('../../core/heartbeat.js');

    const world: any = {
      id: 'world-1',
      isProcessing: false,
      heartbeatEnabled: true,
      heartbeatInterval: '*/5 * * * *',
      heartbeatPrompt: 'heartbeat prompt',
    };

    const handle = startHeartbeat(world, 'chat-1');
    expect(handle).not.toBeNull();
    expect(typeof tickHandler).toBe('function');

    tickHandler?.();
    await Promise.resolve();

    expect(enqueueAndProcessUserTurnMock).toHaveBeenCalledWith(
      'world-1',
      'chat-1',
      'heartbeat prompt',
      'world',
      world,
    );
    expect(heartbeatLogger.debug).toHaveBeenCalledWith('Heartbeat cron tick', expect.objectContaining({
      worldId: 'world-1',
      chatId: 'chat-1',
    }));
    expect(heartbeatLogger.debug).toHaveBeenCalledWith('Heartbeat cron tick enqueued', expect.objectContaining({
      worldId: 'world-1',
      chatId: 'chat-1',
      messageId: 'hb-msg-1',
      status: 'queued',
    }));

    stopHeartbeat(handle);
    expect(task.stop).toHaveBeenCalledTimes(1);
    expect(task.destroy).toHaveBeenCalledTimes(1);
  });

  it('skips tick when _queuedChatIds contains currentChatId', async () => {
    validateMock.mockReturnValue(true);

    let tickHandler: (() => void) | null = null;
    const task = { stop: vi.fn(), destroy: vi.fn(), start: vi.fn() };
    scheduleMock.mockImplementation((_expr: string, callback: () => void) => {
      tickHandler = callback;
      return task;
    });

    const { startHeartbeat } = await import('../../core/heartbeat.js');

    const world: any = {
      id: 'world-1',
      isProcessing: false,
      heartbeatEnabled: true,
      heartbeatInterval: '*/5 * * * *',
      heartbeatPrompt: 'tick',
      _queuedChatIds: new Set(['chat-1']),
    };

    startHeartbeat(world, 'chat-1');
    tickHandler?.();
    expect(enqueueAndProcessUserTurnMock).not.toHaveBeenCalled();
    expect(heartbeatLogger.debug).toHaveBeenCalledWith('Heartbeat tick skipped: chat busy or queued', expect.objectContaining({
      worldId: 'world-1',
      chatId: 'chat-1',
    }));
  });

  it('logs enqueue failures through the heartbeat logger', async () => {
    validateMock.mockReturnValue(true);
    enqueueAndProcessUserTurnMock.mockRejectedValue(new Error('queue down'));

    let tickHandler: (() => void) | null = null;
    scheduleMock.mockImplementation((_expr: string, callback: () => void) => {
      tickHandler = callback;
      return { stop: vi.fn(), destroy: vi.fn(), start: vi.fn() };
    });

    const { startHeartbeat } = await import('../../core/heartbeat.js');

    const world: any = {
      id: 'world-1',
      isProcessing: false,
      heartbeatEnabled: true,
      heartbeatInterval: '*/5 * * * *',
      heartbeatPrompt: 'heartbeat prompt',
    };

    startHeartbeat(world, 'chat-1');
    tickHandler?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(heartbeatLogger.error).toHaveBeenCalledWith('Heartbeat cron tick failed to enqueue', expect.objectContaining({
      worldId: 'world-1',
      chatId: 'chat-1',
      error: 'queue down',
    }));
  });

  it('does not start heartbeat when explicit chatId is missing', async () => {
    validateMock.mockReturnValue(true);
    const { startHeartbeat } = await import('../../core/heartbeat.js');

    const world: any = {
      id: 'world-1',
      heartbeatEnabled: true,
      heartbeatInterval: '*/5 * * * *',
      heartbeatPrompt: 'tick',
    };

    const handle = startHeartbeat(world, '');
    expect(handle).toBeNull();
    expect(scheduleMock).not.toHaveBeenCalled();
  });
});
