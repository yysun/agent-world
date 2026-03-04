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
 * - Tick publishing uses canonical message flow via `publishMessage`.
 *
 * Recent Changes:
 * - 2026-03-04: Added initial world heartbeat scheduler helpers.
 */

import nodeCron, { type ScheduledTask } from 'node-cron';
import type { World } from './types.js';
import { publishMessage } from './events/publishers.js';

export interface HeartbeatHandle {
  task: ScheduledTask;
}

export function isValidCronExpression(expr: string): boolean {
  const normalized = String(expr || '').trim();
  if (!normalized) return false;
  // Product contract: strict 5-field cron only.
  if (normalized.split(/\s+/).length !== 5) return false;
  return nodeCron.validate(normalized);
}

export function startHeartbeat(world: World): HeartbeatHandle | null {
  const enabled = world?.heartbeatEnabled === true;
  const interval = String(world?.heartbeatInterval || '').trim();
  const prompt = String(world?.heartbeatPrompt || '');

  if (!enabled || !prompt.trim() || !isValidCronExpression(interval)) {
    return null;
  }

  const task = nodeCron.schedule(interval, () => {
    const currentChatId = String(world?.currentChatId || '').trim();
    if (world?.isProcessing) return;
    if (!currentChatId) return;
    publishMessage(world, prompt, 'world', currentChatId);
  });

  return { task };
}

export function stopHeartbeat(handle: HeartbeatHandle | null | undefined): void {
  if (!handle?.task) return;
  handle.task.stop();
  if (typeof handle.task.destroy === 'function') {
    handle.task.destroy();
  }
}
