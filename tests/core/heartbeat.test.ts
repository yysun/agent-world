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
 * - 2026-03-06: Heartbeat start now requires explicit `chatId`; scheduler no longer reads `world.currentChatId`.
 */

import { describe, expect, it, vi } from 'vitest';

const scheduleMock = vi.fn();
const validateMock = vi.fn();
const publishMessageMock = vi.fn();

vi.mock('node-cron', () => ({
  default: {
    schedule: scheduleMock,
    validate: validateMock,
  }
}));

vi.mock('../../core/events/publishers.js', () => ({
  publishMessage: publishMessageMock,
}));

describe('core heartbeat', () => {
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

  it('publishes world heartbeat message on tick when chat is active', async () => {
    validateMock.mockReturnValue(true);

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

    expect(publishMessageMock).toHaveBeenCalledWith(world, 'heartbeat prompt', 'world', 'chat-1');

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

    expect(publishMessageMock).not.toHaveBeenCalled();
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
