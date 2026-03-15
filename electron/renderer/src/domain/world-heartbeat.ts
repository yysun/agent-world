/**
 * World Heartbeat Domain Helpers
 * Purpose:
 * - Normalize selected-world heartbeat runtime state for sidebar presentation.
 *
 * Key Features:
 * - Merges persisted world heartbeat config with runtime job status.
 * - Computes stable display labels and run counts.
 * - Derives start/stop button availability and tooltips.
 *
 * Implementation Notes:
 * - Pure helpers only; no React or IPC dependencies.
 * - Renderer treats heartbeat as a world-level cron surface scoped to the selected chat.
 *
 * Recent Changes:
 * - 2026-03-15: Added next-run countdown derivation for running heartbeat jobs.
 * - 2026-03-14: Aligned start/stop button availability with the runtime running state.
 * - 2026-03-14: Added sidebar heartbeat summary/control derivation for the Electron world panel.
 */

export type WorldHeartbeatDisplayStatus = 'disabled' | 'running' | 'paused' | 'stopped';

type WorldHeartbeatLike = {
  heartbeatEnabled?: unknown;
  heartbeatInterval?: unknown;
  heartbeatPrompt?: unknown;
};

type HeartbeatJobLike = {
  status?: unknown;
  interval?: unknown;
  runCount?: unknown;
  nextRunAt?: unknown;
};

type HeartbeatControlInput = {
  configured: boolean;
  status: WorldHeartbeatDisplayStatus;
  selectedChatId?: unknown;
  isActionPending: boolean;
};

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function normalizeRunCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.floor(parsed));
}

function normalizeStatus(value: unknown): 'running' | 'paused' | 'stopped' {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'running' || normalized === 'paused') {
    return normalized;
  }
  return 'stopped';
}

function normalizeDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCountdownDuration(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  if (totalSeconds < 1) {
    return '<1s';
  }

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function deriveNextRunCountdownLabel(
  status: WorldHeartbeatDisplayStatus,
  nextRunAt: Date | null,
  now: Date,
): string | null {
  if (status !== 'running' || !nextRunAt) {
    return null;
  }

  return `Next: ${formatCountdownDuration(nextRunAt.getTime() - now.getTime())}`;
}

export function deriveWorldHeartbeatSummary(
  world: WorldHeartbeatLike | null | undefined,
  job: HeartbeatJobLike | null | undefined,
  now: Date = new Date(),
) {
  const interval = normalizeText(job?.interval) || normalizeText(world?.heartbeatInterval);
  const prompt = normalizeText(world?.heartbeatPrompt);
  const configured = world?.heartbeatEnabled === true && Boolean(interval) && Boolean(prompt);
  const runtimeStatus = normalizeStatus(job?.status);
  const status: WorldHeartbeatDisplayStatus = configured ? runtimeStatus : 'disabled';
  const heartbeatEnabled = status === 'running';
  const nextRunAt = normalizeDate(job?.nextRunAt);

  return {
    configured,
    interval,
    runCount: normalizeRunCount(job?.runCount),
    nextRunAt: nextRunAt?.toISOString() ?? null,
    nextRunCountdownLabel: deriveNextRunCountdownLabel(status, nextRunAt, now),
    status,
    heartbeatEnabled,
    heartbeatLabel: heartbeatEnabled ? 'on' : 'off',
    statusLabel: status.charAt(0).toUpperCase() + status.slice(1),
  };
}

export function deriveHeartbeatControlState(input: HeartbeatControlInput) {
  const selectedChatId = normalizeText(input.selectedChatId);
  const hasSelectedChat = Boolean(selectedChatId);
  const isRunning = input.status === 'running';
  const canStart = !input.isActionPending && input.configured && hasSelectedChat && !isRunning;
  const canStop = !input.isActionPending && input.configured && isRunning;

  return {
    canStart,
    canStop,
    startTitle: !input.configured
      ? 'Enable and configure heartbeat to start cron'
      : !hasSelectedChat
        ? 'Select a chat session to start cron'
        : isRunning
          ? 'Cron is already running'
          : 'Start cron on the selected chat session',
    stopTitle: isRunning
      ? 'Stop cron'
      : 'Cron is already stopped',
  };
}