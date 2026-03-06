/**
 * Electron Heartbeat Manager Tests
 *
 * Purpose:
 * - Verify explicit chat-scoped heartbeat job lifecycle behavior in the main process.
 *
 * Key Features:
 * - Requires `chatId` to start or restart a heartbeat job.
 * - Persists explicit chat scope across pause/resume cycles.
 *
 * Implementation Notes:
 * - Uses injected scheduler fakes only; no timers or Electron runtime needed.
 */

import { describe, expect, it, vi } from 'vitest';
import { createHeartbeatManager } from '../../../electron/main-process/heartbeat-manager';

describe('electron heartbeat manager', () => {
  it('does not start a job when explicit chatId is missing', () => {
    const startHeartbeat = vi.fn(() => ({ task: { stop: vi.fn(), start: vi.fn(), destroy: vi.fn() } }));
    const manager = createHeartbeatManager({
      isValidCronExpression: vi.fn(() => true),
      startHeartbeat,
      stopHeartbeat: vi.fn(),
    });

    manager.startJob({
      id: 'world-1',
      name: 'World 1',
      heartbeatEnabled: true,
      heartbeatInterval: '*/5 * * * *',
      heartbeatPrompt: 'tick',
    }, '');

    expect(startHeartbeat).not.toHaveBeenCalled();
    expect(manager.listJobs()).toEqual([
      expect.objectContaining({
        worldId: 'world-1',
        status: 'stopped',
      }),
    ]);
  });

  it('restarts a paused job with the same explicit chatId', () => {
    const task = { stop: vi.fn(), start: vi.fn(), destroy: vi.fn() };
    const startHeartbeat = vi.fn(() => ({ task }));
    const manager = createHeartbeatManager({
      isValidCronExpression: vi.fn(() => true),
      startHeartbeat,
      stopHeartbeat: vi.fn(),
    });

    const world = {
      id: 'world-1',
      name: 'World 1',
      heartbeatEnabled: true,
      heartbeatInterval: '*/5 * * * *',
      heartbeatPrompt: 'tick',
    };

    manager.startJob(world, 'chat-7');
    manager.pauseJob('world-1');
    manager.resumeJob('world-1');

    expect(task.start).toHaveBeenCalledTimes(1);
    expect(startHeartbeat).toHaveBeenCalledWith(world, 'chat-7');
    expect(manager.listJobs()).toEqual([
      expect.objectContaining({
        worldId: 'world-1',
        status: 'running',
      }),
    ]);
  });
});
