/**
 * Shell Process Registry
 *
 * Purpose:
 * - Provide canonical lifecycle tracking and control for shell child-process executions.
 *
 * Key Features:
 * - Stable execution IDs with explicit lifecycle states.
 * - Active-process handle tracking for cancellation and chat-scoped stop operations.
 * - Query APIs for single execution and filtered execution history.
 * - Safe delete semantics that block deletion of active executions.
 * - Subscription API for status-change notifications.
 *
 * Implementation Notes:
 * - Registry uses in-memory maps and bounded history ordering.
 * - Lifecycle transitions are validated through a transition table.
 * - Cancel operations are idempotent and return explicit outcomes.
 *
 * Recent Changes:
 * - 2026-02-13: Initial implementation for shell child process monitor/cancel/delete lifecycle control.
 */

import type { ChildProcess } from 'child_process';
import { createCategoryLogger } from './logger.js';
import { generateId } from './utils.js';

const logger = createCategoryLogger('shell-process-registry');

export type ShellProcessStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'timed_out';

export interface ShellProcessExecutionRecord {
  executionId: string;
  command: string;
  parameters: string[];
  directory: string;
  worldId: string | null;
  chatId: string | null;
  status: ShellProcessStatus;
  cancelRequested: boolean;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  signal: string | null;
  stdoutLength: number;
  stderrLength: number;
  error: string | null;
  durationMs: number | null;
}

export interface ShellProcessStatusEvent {
  executionId: string;
  status: ShellProcessStatus;
  record: ShellProcessExecutionRecord;
}

export interface ListShellProcessExecutionsOptions {
  limit?: number;
  statuses?: ShellProcessStatus[];
  worldId?: string;
  chatId?: string;
  activeOnly?: boolean;
}

export type CancelShellProcessOutcome =
  | 'cancel_requested'
  | 'already_finished'
  | 'not_found'
  | 'not_cancellable';

export interface CancelShellProcessResult {
  executionId: string;
  outcome: CancelShellProcessOutcome;
}

export type DeleteShellProcessOutcome =
  | 'deleted'
  | 'not_found'
  | 'active_process_conflict';

export interface DeleteShellProcessResult {
  executionId: string;
  outcome: DeleteShellProcessOutcome;
}

const TERMINAL_STATUSES = new Set<ShellProcessStatus>(['completed', 'failed', 'canceled', 'timed_out']);

const VALID_TRANSITIONS = new Map<ShellProcessStatus, Set<ShellProcessStatus>>([
  ['queued', new Set(['starting', 'running', 'failed', 'canceled', 'timed_out'])],
  ['starting', new Set(['running', 'failed', 'canceled', 'timed_out'])],
  ['running', new Set(['completed', 'failed', 'canceled', 'timed_out'])],
  ['completed', new Set(['completed'])],
  ['failed', new Set(['failed'])],
  ['canceled', new Set(['canceled'])],
  ['timed_out', new Set(['timed_out'])]
]);

const executionsById = new Map<string, ShellProcessExecutionRecord>();
const executionOrder: string[] = [];
const activeProcessByExecutionId = new Map<string, ChildProcess>();
const activeExecutionIdsByChatKey = new Map<string, Set<string>>();
const statusListeners = new Set<(event: ShellProcessStatusEvent) => void>();

const MAX_EXECUTION_HISTORY_SIZE = 2000;

function toChatKey(worldId: string, chatId: string): string {
  return `${worldId}::${chatId}`;
}

function isTerminalStatus(status: ShellProcessStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

function cloneExecutionRecord(record: ShellProcessExecutionRecord): ShellProcessExecutionRecord {
  return {
    ...record,
    parameters: [...record.parameters]
  };
}

function notifyStatusListeners(record: ShellProcessExecutionRecord): void {
  const event: ShellProcessStatusEvent = {
    executionId: record.executionId,
    status: record.status,
    record: cloneExecutionRecord(record)
  };

  for (const listener of statusListeners) {
    try {
      listener(event);
    } catch (error) {
      logger.warn('Shell process status listener failed', {
        executionId: record.executionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

function canTransition(fromStatus: ShellProcessStatus, toStatus: ShellProcessStatus): boolean {
  const allowed = VALID_TRANSITIONS.get(fromStatus);
  return Boolean(allowed?.has(toStatus));
}

function applyHistoryLimit(): void {
  if (executionOrder.length <= MAX_EXECUTION_HISTORY_SIZE) {
    return;
  }

  const overflowCount = executionOrder.length - MAX_EXECUTION_HISTORY_SIZE;
  const removeIds = executionOrder.splice(0, overflowCount);
  for (const executionId of removeIds) {
    const record = executionsById.get(executionId);
    if (!record) continue;
    if (!isTerminalStatus(record.status)) continue;
    if (activeProcessByExecutionId.has(executionId)) continue;
    executionsById.delete(executionId);
  }
}

function registerExecutionInChatScope(record: ShellProcessExecutionRecord): void {
  if (!record.worldId || !record.chatId) return;
  const chatKey = toChatKey(record.worldId, record.chatId);
  const ids = activeExecutionIdsByChatKey.get(chatKey) ?? new Set<string>();
  ids.add(record.executionId);
  activeExecutionIdsByChatKey.set(chatKey, ids);
}

function unregisterExecutionFromChatScope(record: ShellProcessExecutionRecord): void {
  if (!record.worldId || !record.chatId) return;
  const chatKey = toChatKey(record.worldId, record.chatId);
  const ids = activeExecutionIdsByChatKey.get(chatKey);
  if (!ids) return;
  ids.delete(record.executionId);
  if (ids.size === 0) {
    activeExecutionIdsByChatKey.delete(chatKey);
  }
}

export function createShellProcessExecution(input: {
  command: string;
  parameters: string[];
  directory: string;
  worldId?: string;
  chatId?: string;
}): ShellProcessExecutionRecord {
  const nowIso = new Date().toISOString();
  const record: ShellProcessExecutionRecord = {
    executionId: generateId(),
    command: String(input.command || ''),
    parameters: Array.isArray(input.parameters) ? [...input.parameters] : [],
    directory: String(input.directory || ''),
    worldId: input.worldId ? String(input.worldId) : null,
    chatId: input.chatId ? String(input.chatId) : null,
    status: 'queued',
    cancelRequested: false,
    queuedAt: nowIso,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    signal: null,
    stdoutLength: 0,
    stderrLength: 0,
    error: null,
    durationMs: null
  };

  executionsById.set(record.executionId, record);
  executionOrder.push(record.executionId);
  notifyStatusListeners(record);
  applyHistoryLimit();
  return cloneExecutionRecord(record);
}

export function attachShellProcessHandle(executionId: string, process: ChildProcess): boolean {
  const record = executionsById.get(executionId);
  if (!record) return false;

  activeProcessByExecutionId.set(executionId, process);
  registerExecutionInChatScope(record);
  return true;
}

export function detachShellProcessHandle(executionId: string): boolean {
  const record = executionsById.get(executionId);
  if (!record) return false;
  activeProcessByExecutionId.delete(executionId);
  unregisterExecutionFromChatScope(record);
  return true;
}

export function transitionShellProcessExecution(
  executionId: string,
  status: ShellProcessStatus,
  patch: Partial<
    Pick<
      ShellProcessExecutionRecord,
      'startedAt' | 'finishedAt' | 'exitCode' | 'signal' | 'stdoutLength' | 'stderrLength' | 'error' | 'durationMs'
    >
  > = {}
): ShellProcessExecutionRecord | null {
  const record = executionsById.get(executionId);
  if (!record) return null;

  if (!canTransition(record.status, status)) {
    logger.warn('Rejected invalid shell process transition', {
      executionId,
      from: record.status,
      to: status
    });
    return cloneExecutionRecord(record);
  }

  record.status = status;
  if (typeof patch.startedAt !== 'undefined') record.startedAt = patch.startedAt;
  if (typeof patch.finishedAt !== 'undefined') record.finishedAt = patch.finishedAt;
  if (typeof patch.exitCode !== 'undefined') record.exitCode = patch.exitCode;
  if (typeof patch.signal !== 'undefined') record.signal = patch.signal;
  if (typeof patch.stdoutLength !== 'undefined') record.stdoutLength = patch.stdoutLength;
  if (typeof patch.stderrLength !== 'undefined') record.stderrLength = patch.stderrLength;
  if (typeof patch.error !== 'undefined') record.error = patch.error;
  if (typeof patch.durationMs !== 'undefined') record.durationMs = patch.durationMs;

  if (isTerminalStatus(status)) {
    detachShellProcessHandle(executionId);
  }

  notifyStatusListeners(record);
  return cloneExecutionRecord(record);
}

export function markShellProcessCancelRequested(executionId: string): ShellProcessExecutionRecord | null {
  const record = executionsById.get(executionId);
  if (!record) return null;
  if (!record.cancelRequested) {
    record.cancelRequested = true;
    notifyStatusListeners(record);
  }
  return cloneExecutionRecord(record);
}

export function getShellProcessExecution(executionId: string): ShellProcessExecutionRecord | null {
  const record = executionsById.get(executionId);
  if (!record) return null;
  return cloneExecutionRecord(record);
}

export function listShellProcessExecutions(
  options: ListShellProcessExecutionsOptions = {}
): ShellProcessExecutionRecord[] {
  const {
    limit = 100,
    statuses,
    worldId,
    chatId,
    activeOnly = false
  } = options;

  const validLimit = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : 100;
  if (validLimit === 0) return [];

  const statusSet = Array.isArray(statuses) && statuses.length > 0 ? new Set(statuses) : null;
  const worldFilter = worldId ? String(worldId) : null;
  const chatFilter = chatId ? String(chatId) : null;

  const results: ShellProcessExecutionRecord[] = [];
  for (let index = executionOrder.length - 1; index >= 0; index -= 1) {
    const executionId = executionOrder[index];
    const record = executionsById.get(executionId);
    if (!record) continue;

    if (activeOnly && isTerminalStatus(record.status)) continue;
    if (statusSet && !statusSet.has(record.status)) continue;
    if (worldFilter && record.worldId !== worldFilter) continue;
    if (chatFilter && record.chatId !== chatFilter) continue;

    results.push(cloneExecutionRecord(record));
    if (results.length >= validLimit) break;
  }

  return results;
}

export function cancelShellProcessExecution(executionId: string): CancelShellProcessResult {
  const record = executionsById.get(executionId);
  if (!record) {
    return { executionId, outcome: 'not_found' };
  }

  if (isTerminalStatus(record.status)) {
    return { executionId, outcome: 'already_finished' };
  }

  const process = activeProcessByExecutionId.get(executionId);
  if (!process) {
    markShellProcessCancelRequested(executionId);
    return { executionId, outcome: 'not_cancellable' };
  }

  try {
    markShellProcessCancelRequested(executionId);
    process.kill('SIGTERM');
    return { executionId, outcome: 'cancel_requested' };
  } catch (error) {
    logger.warn('Failed to cancel shell process execution', {
      executionId,
      error: error instanceof Error ? error.message : String(error)
    });
    return { executionId, outcome: 'not_cancellable' };
  }
}

export function stopShellProcessesForChatScope(worldId: string, chatId: string): { killed: number } {
  const chatKey = toChatKey(worldId, chatId);
  const executionIds = activeExecutionIdsByChatKey.get(chatKey);
  if (!executionIds || executionIds.size === 0) {
    return { killed: 0 };
  }

  let killed = 0;
  for (const executionId of executionIds) {
    const result = cancelShellProcessExecution(executionId);
    if (result.outcome === 'cancel_requested') {
      killed += 1;
    }
  }

  return { killed };
}

export function deleteShellProcessExecution(executionId: string): DeleteShellProcessResult {
  const record = executionsById.get(executionId);
  if (!record) {
    return { executionId, outcome: 'not_found' };
  }

  if (!isTerminalStatus(record.status) || activeProcessByExecutionId.has(executionId)) {
    return { executionId, outcome: 'active_process_conflict' };
  }

  detachShellProcessHandle(executionId);
  executionsById.delete(executionId);

  const orderIndex = executionOrder.indexOf(executionId);
  if (orderIndex >= 0) {
    executionOrder.splice(orderIndex, 1);
  }

  return { executionId, outcome: 'deleted' };
}

export function subscribeShellProcessStatus(
  listener: (event: ShellProcessStatusEvent) => void
): () => void {
  if (typeof listener !== 'function') {
    return () => { };
  }

  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export function clearShellProcessRegistryForTests(): {
  executionCount: number;
  activeCount: number;
} {
  const executionCount = executionsById.size;
  const activeCount = activeProcessByExecutionId.size;

  executionsById.clear();
  executionOrder.length = 0;
  activeProcessByExecutionId.clear();
  activeExecutionIdsByChatKey.clear();

  return { executionCount, activeCount };
}
