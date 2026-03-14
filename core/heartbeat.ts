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

const loggerHeartbeat = createCategoryLogger('heartbeat');

// keep node-cron as a direct import so test-time module mocking works

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

export function startHeartbeat(world: World, chatId: string): HeartbeatHandle | null {
  const enabled = world?.heartbeatEnabled === true;
  const interval = String(world?.heartbeatInterval || '').trim();
  const prompt = String(world?.heartbeatPrompt || '');
  const targetChatId = String(chatId || '').trim();

  if (!enabled || !prompt.trim() || !targetChatId) return null;
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

    void enqueueAndProcessUserTurn(world.id, targetChatId, prompt, 'world', world)
      .then((queuedMessage) => {
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
