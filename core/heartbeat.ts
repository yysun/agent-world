/**
 * World Heartbeat Scheduler
 *
 * Purpose:
 * - Provide reusable heartbeat scheduling helpers for worlds.
 *
 * Key Features:
 * - Cron validation with strict 5-field contract.
 * - Start/stop helpers that publish world heartbeat messages.
 * - Guards for disabled/invalid/missing heartbeat config.
 *
 * Implementation Notes:
 * - Scheduling is opt-in; this module does not self-register jobs.
 * - Tick publishing uses canonical queued world-message flow.
 *
 * Recent Changes:
 * - 2026-03-14: Added runtime heartbeat prompt datetime placeholder expansion for single-brace
 *   formats such as `{yyyy-mm-dd hh:mm:ss}`.
 * - 2026-03-14: Replaced direct heartbeat `console` traces with categorized structured logger
 *   events (`heartbeat`) so cron diagnostics can be enabled via env (for example `LOG_HEARTBEAT=debug`).
 * - 2026-03-06: Removed `world.currentChatId` fallback from heartbeat dispatch; scheduled jobs now require explicit `chatId`.
 * - 2026-03-04: Added initial world heartbeat scheduler helpers.
 */

import nodeCron, { type ScheduledTask } from 'node-cron';
import type { World } from './types.js';
import { createCategoryLogger } from './logger.js';
import { enqueueAndProcessUserTurn } from './queue-manager.js';
import { isChatProcessing } from './activity-tracker.js';

export interface HeartbeatHandle {
  task: ScheduledTask;
}

export interface HeartbeatCallbacks {
  onRun?: () => void;
}

const loggerHeartbeat = createCategoryLogger('heartbeat');
const HEARTBEAT_DATETIME_PLACEHOLDER_PATTERN = /(?<!\{)\{([^{}]+)\}(?!\})/g;

// keep node-cron as a direct import so test-time module mocking works

function padDateTimePart(value: number): string {
  return String(value).padStart(2, '0');
}

function resolveDateTimeToken(token: string, pattern: string, offset: number, now: Date): string {
  switch (token) {
    case 'yyyy':
      return String(now.getFullYear());
    case 'MM':
      return padDateTimePart(now.getMonth() + 1);
    case 'dd':
      return padDateTimePart(now.getDate());
    case 'HH':
    case 'hh':
      return padDateTimePart(now.getHours());
    case 'ss':
      return padDateTimePart(now.getSeconds());
    case 'mm': {
      const previousChar = pattern[offset - 1] ?? '';
      const nextChar = pattern[offset + token.length] ?? '';
      const shouldUseMinutes = previousChar === ':' || nextChar === ':';
      return padDateTimePart(shouldUseMinutes ? now.getMinutes() : now.getMonth() + 1);
    }
    default:
      return token;
  }
}

function formatDateTimePattern(pattern: string, now: Date): string {
  return pattern.replace(/yyyy|MM|dd|HH|hh|mm|ss/g, (token, offset) => (
    resolveDateTimeToken(token, pattern, offset, now)
  ));
}

function formatHeartbeatPrompt(prompt: string, now: Date = new Date()): string {
  const normalized = String(prompt || '');
  if (!normalized) return '';

  return normalized.replace(HEARTBEAT_DATETIME_PLACEHOLDER_PATTERN, (match, pattern: string) => {
    if (!/^(?:yyyy|MM|dd|HH|hh|mm|ss|[-/: T])+$/.test(pattern)) {
      return match;
    }
    return formatDateTimePattern(pattern, now);
  });
}

export function isValidCronExpression(expr: string): boolean {
  const normalized = String(expr || '').trim();
  if (!normalized) return false;
  // Product contract: strict 5-field cron only.
  if (normalized.split(/\s+/).length !== 5) return false;
  const cron: any = (nodeCron && (nodeCron as any).default) ? (nodeCron as any).default : nodeCron;
  if (!cron || typeof cron.validate !== 'function') return false;
  try {
    return Boolean(cron.validate(normalized));
  } catch (err) {
    return false;
  }
}

export function startHeartbeat(world: World, chatId: string, callbacks: HeartbeatCallbacks = {}): HeartbeatHandle | null {
  const enabled = world?.heartbeatEnabled === true;
  const interval = String(world?.heartbeatInterval || '').trim();
  const promptTemplate = String(world?.heartbeatPrompt || '');
  const targetChatId = String(chatId || '').trim();

  if (!enabled || !promptTemplate.trim() || !targetChatId) return null;
  const cron: any = (nodeCron && (nodeCron as any).default) ? (nodeCron as any).default : nodeCron;
  if (!cron || typeof cron.schedule !== 'function') return null;
  if (!isValidCronExpression(interval)) return null;

  const task = cron.schedule(interval, () => {
    loggerHeartbeat.debug('Heartbeat cron tick', {
      worldId: world?.id ?? null,
      chatId: targetChatId,
      sender: 'world',
    });

    if (world?.isProcessing) {
      loggerHeartbeat.debug('Heartbeat tick skipped: world processing active', {
        worldId: world?.id ?? null,
        chatId: targetChatId,
      });
      return;
    }

    if (isChatProcessing(world, targetChatId) || world._queuedChatIds?.has(targetChatId)) {
      loggerHeartbeat.debug('Heartbeat tick skipped: chat busy or queued', {
        worldId: world?.id ?? null,
        chatId: targetChatId,
      });
      return;
    }

    const prompt = formatHeartbeatPrompt(promptTemplate);

    void enqueueAndProcessUserTurn(world.id, targetChatId, prompt, 'world', world)
      .then((queuedMessage) => {
        callbacks.onRun?.();
        loggerHeartbeat.debug('Heartbeat cron tick enqueued', {
          worldId: world.id,
          chatId: targetChatId,
          messageId: queuedMessage?.messageId ?? null,
          status: queuedMessage?.status ?? null,
        });
      })
      .catch((error) => {
        loggerHeartbeat.error('Heartbeat cron tick failed to enqueue', {
          worldId: world.id,
          chatId: targetChatId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  });

  return { task };
}

export function stopHeartbeat(handle: HeartbeatHandle | null | undefined): void {
  if (!handle?.task) return;
  try {
    handle.task.stop();
    if (typeof handle.task.destroy === 'function') {
      handle.task.destroy();
    }
  } catch (err) {
    // ignore failures when stopping/destroying scheduled task
  }
}
