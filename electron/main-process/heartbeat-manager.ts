/**
 * Electron Heartbeat Manager
 *
 * Purpose:
 * - Manage per-world heartbeat scheduler jobs in Electron main runtime.
 *
 * Key Features:
 * - Start/restart/pause/resume/stop lifecycle operations.
 * - World-scoped job registry with deterministic state.
 * - Tracks runtime heartbeat run counts for renderer status display.
 * - Safe no-op behavior for invalid/missing heartbeat config.
 *
 * Implementation Notes:
 * - Scheduler primitives are injected from core heartbeat module.
 * - This module does not persist world config changes.
 *
 * Recent Changes:
 * - 2026-03-06: Heartbeat jobs now require explicit chat scope; jobs no longer infer session routing from world state.
 * - 2026-03-04: Added initial world heartbeat job manager.
 */

type ScheduledTaskLike = {
  stop: () => void;
  start?: () => void;
  destroy?: () => void;
};

type HeartbeatHandle = {
  task: ScheduledTaskLike;
};

type WorldLike = {
  id?: string;
  name?: string;
  heartbeatEnabled?: boolean;
  heartbeatInterval?: string | null;
  heartbeatPrompt?: string | null;
};

export type HeartbeatJobStatus = 'running' | 'paused' | 'stopped';

export interface HeartbeatJobView {
  worldId: string;
  worldName: string;
  interval: string;
  status: HeartbeatJobStatus;
  runCount: number;
}

interface HeartbeatJobEntry {
  worldId: string;
  worldName: string;
  interval: string;
  status: HeartbeatJobStatus;
  runCount: number;
  world: WorldLike;
  chatId: string | null;
  handle: HeartbeatHandle | null;
}

interface HeartbeatManagerDeps {
  isValidCronExpression: (expr: string) => boolean;
  startHeartbeat: (world: WorldLike, chatId: string, callbacks?: { onRun?: () => void }) => HeartbeatHandle | null;
  stopHeartbeat: (handle: HeartbeatHandle | null | undefined) => void;
}

export interface HeartbeatManager {
  startJob: (world: WorldLike, chatId: string) => void;
  restartJob: (world: WorldLike, chatId: string) => void;
  pauseJob: (worldId: string) => void;
  resumeJob: (worldId: string) => void;
  stopJob: (worldId: string) => void;
  stopAll: () => void;
  listJobs: () => HeartbeatJobView[];
}

function toInterval(world: WorldLike): string {
  return String(world?.heartbeatInterval || '').trim();
}

function toPrompt(world: WorldLike): string {
  return String(world?.heartbeatPrompt || '').trim();
}

function isStartableWorld(world: WorldLike, deps: HeartbeatManagerDeps): boolean {
  if (world?.heartbeatEnabled !== true) return false;
  const interval = toInterval(world);
  if (!interval || !deps.isValidCronExpression(interval)) return false;
  if (!toPrompt(world)) return false;
  return true;
}

function normalizeChatId(chatId: string | null | undefined): string | null {
  const normalized = String(chatId || '').trim();
  return normalized || null;
}

export function createHeartbeatManager(deps: HeartbeatManagerDeps): HeartbeatManager {
  const jobs = new Map<string, HeartbeatJobEntry>();

  function stopHandle(entry: HeartbeatJobEntry) {
    deps.stopHeartbeat(entry.handle);
    entry.handle = null;
  }

  function startJob(world: WorldLike, chatId: string): void {
    const worldId = String(world?.id || '').trim();
    if (!worldId) return;
    const targetChatId = normalizeChatId(chatId);

    const existing = jobs.get(worldId);
    const preservedRunCount = existing?.runCount ?? 0;
    if (existing) {
      stopHandle(existing);
    }

    const nextEntry: HeartbeatJobEntry = {
      worldId,
      worldName: String(world?.name || worldId),
      interval: toInterval(world),
      status: 'stopped',
      runCount: preservedRunCount,
      world,
      chatId: targetChatId,
      handle: null,
    };

    jobs.set(worldId, nextEntry);

    if (!isStartableWorld(world, deps) || !targetChatId) {
      return;
    }

    const handle = deps.startHeartbeat(world, targetChatId, {
      onRun: () => {
        nextEntry.runCount += 1;
      }
    });
    if (!handle) {
      return;
    }

    nextEntry.status = 'running';
    nextEntry.handle = handle;
  }

  function restartJob(world: WorldLike, chatId: string): void {
    startJob(world, chatId);
  }

  function pauseJob(worldId: string): void {
    const id = String(worldId || '').trim();
    if (!id) return;
    const entry = jobs.get(id);
    if (!entry?.handle?.task) return;
    entry.handle.task.stop();
    entry.status = 'paused';
  }

  function resumeJob(worldId: string): void {
    const id = String(worldId || '').trim();
    if (!id) return;
    const entry = jobs.get(id);
    if (!entry) return;

    if (entry.handle?.task && entry.status === 'paused') {
      if (typeof entry.handle.task.start === 'function') {
        entry.handle.task.start();
      }
      entry.status = 'running';
      return;
    }

    // Resume from stopped by re-evaluating latest world config snapshot.
    if (!entry.chatId) {
      entry.status = 'stopped';
      return;
    }
    startJob(entry.world, entry.chatId);
  }

  function stopJob(worldId: string): void {
    const id = String(worldId || '').trim();
    if (!id) return;
    const entry = jobs.get(id);
    if (!entry) return;
    stopHandle(entry);
    entry.status = 'stopped';
  }

  function stopAll(): void {
    for (const entry of jobs.values()) {
      stopHandle(entry);
      entry.status = 'stopped';
    }
  }

  function listJobs(): HeartbeatJobView[] {
    return Array.from(jobs.values())
      .map((entry) => ({
        worldId: entry.worldId,
        worldName: entry.worldName,
        interval: entry.interval,
        status: entry.status,
        runCount: entry.runCount,
      }))
      .sort((a, b) => a.worldName.localeCompare(b.worldName));
  }

  return {
    startJob,
    restartJob,
    pauseJob,
    resumeJob,
    stopJob,
    stopAll,
    listJobs,
  };
}
