/**
 * Shell Process Management Tests
 *
 * Purpose:
 * - Verify lifecycle tracking and control semantics for shell child processes.
 *
 * Features Tested:
 * - Execution record creation and terminal status transitions.
 * - Cancel behavior and idempotent outcomes.
 * - Safe delete semantics for active vs terminal records.
 * - Chat-scoped stop isolation across concurrent executions.
 *
 * Implementation Notes:
 * - Uses in-memory process registry state and real local shell commands.
 * - Keeps command durations short to reduce test runtime.
 *
 * Recent Changes:
 * - 2026-02-13: Added lifecycle/control coverage for shell process monitor/cancel/delete APIs.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  executeShellCommand,
  getProcessExecution,
  listProcessExecutions,
  cancelProcessExecution,
  deleteProcessExecution,
  stopShellCommandsForChat,
  clearProcessExecutionStateForTests
} from '../../core/shell-cmd-tool.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 2000,
  pollMs = 25
): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (predicate()) return true;
    await delay(pollMs);
  }
  return false;
}

afterEach(() => {
  clearProcessExecutionStateForTests();
});

describe('shell process lifecycle management', () => {
  it('creates an execution record and transitions to completed', async () => {
    const result = await executeShellCommand('echo', ['lifecycle-ok'], './', {
      worldId: 'world-lifecycle',
      chatId: 'chat-lifecycle'
    });

    expect(result.executionId).toBeTruthy();

    const record = getProcessExecution(result.executionId);
    expect(record).toBeTruthy();
    expect(record?.status).toBe('completed');
    expect(record?.worldId).toBe('world-lifecycle');
    expect(record?.chatId).toBe('chat-lifecycle');
    expect(record?.command).toBe('echo');
  });

  it('supports cancel by execution id and idempotent repeated cancellation', async () => {
    let executionId = '';

    const commandPromise = executeShellCommand('sh', ['-c', 'sleep 1; echo should-not-finish'], './', {
      worldId: 'world-cancel',
      chatId: 'chat-cancel',
      onStatusChange: (event) => {
        executionId = executionId || event.executionId;
      }
    });

    const captured = await waitForCondition(() => executionId.length > 0);
    expect(captured).toBe(true);

    const firstCancel = cancelProcessExecution(executionId);
    expect(firstCancel.outcome === 'cancel_requested' || firstCancel.outcome === 'not_cancellable').toBe(true);

    const result = await commandPromise;
    expect(Boolean(result.canceled || result.error?.toLowerCase().includes('canceled'))).toBe(true);

    const secondCancel = cancelProcessExecution(executionId);
    expect(secondCancel.outcome).toBe('already_finished');
  });

  it('blocks delete for active execution and allows delete after terminal state', async () => {
    let executionId = '';

    const commandPromise = executeShellCommand('sh', ['-c', 'sleep 1; echo delete-test'], './', {
      worldId: 'world-delete',
      chatId: 'chat-delete',
      onStatusChange: (event) => {
        executionId = executionId || event.executionId;
      }
    });

    const captured = await waitForCondition(() => executionId.length > 0);
    expect(captured).toBe(true);

    const activeDelete = deleteProcessExecution(executionId);
    expect(activeDelete.outcome).toBe('active_process_conflict');

    cancelProcessExecution(executionId);
    await commandPromise;

    const terminalDelete = deleteProcessExecution(executionId);
    expect(terminalDelete.outcome).toBe('deleted');

    const record = getProcessExecution(executionId);
    expect(record).toBeNull();
  });

  it('stops processes only within requested chat scope', async () => {
    const worldId = 'world-scope';
    const chatA = 'chat-a';
    const chatB = 'chat-b';

    const promiseA = executeShellCommand('sh', ['-c', 'sleep 1; echo chat-a'], './', {
      worldId,
      chatId: chatA
    });

    const promiseB = executeShellCommand('sh', ['-c', 'sleep 1; echo chat-b'], './', {
      worldId,
      chatId: chatB
    });

    const activeReady = await waitForCondition(() => {
      const active = listProcessExecutions({ activeOnly: true, worldId });
      return active.length >= 2;
    });
    expect(activeReady).toBe(true);

    const stopResult = stopShellCommandsForChat(worldId, chatA);
    expect(stopResult.killed).toBeGreaterThanOrEqual(1);

    const resultA = await promiseA;
    const resultB = await promiseB;

    expect(Boolean(resultA.canceled || resultA.error?.toLowerCase().includes('canceled'))).toBe(true);
    expect(resultB.exitCode).toBe(0);
    expect(resultB.canceled).not.toBe(true);
  });
});
