/**
 * Message Processing Control
 *
 * Purpose:
 * - Provide chat-scoped runtime controls for stopping active message processing.
 *
 * Features:
 * - Registers per-chat processing handles with abort signals.
 * - Cancels queued and active LLM calls by `worldId` and `chatId`.
 * - Stops active shell command executions for the same session scope.
 * - Returns deterministic stop results for IPC/UI feedback.
 *
 * Implementation Notes:
 * - Stop requests are idempotent for repeated calls on the same active operation.
 * - Abort signals are scoped to active processing handles and released on completion.
 * - Existing persisted output is preserved; only in-flight work is interrupted.
 *
 * Recent Changes:
 * - 2026-03-04: Added stale-handle self-healing in `hasActiveChatMessageProcessing()` to clear orphaned chat locks.
 * - 2026-02-13: Added chat-scoped processing handle registry with abort signals so stop requests also prevent follow-up continuation work.
 * - 2026-02-14: Added `hasActiveChatMessageProcessing()` for chat-scoped lock checks (e.g., message edit guards).
 */

import { cancelLLMCallsForChat } from './llm-manager.js';
import { stopShellCommandsForChat } from './shell-cmd-tool.js';
import { generateId } from './utils.js';

type ActiveProcessingHandle = {
  controller: AbortController;
  startedAtMs: number;
};

const DEFAULT_STALE_PROCESSING_TTL_MS = 10 * 60 * 1000;
const ACTIVE_PROCESSING_STALE_TTL_MS = (() => {
  const configured = Number.parseInt(String(process.env.AGENT_WORLD_ACTIVE_PROCESSING_TTL_MS || ''), 10);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_STALE_PROCESSING_TTL_MS;
  }
  return Math.max(configured, 1000);
})();

const activeProcessingByChat = new Map<string, Map<string, ActiveProcessingHandle>>();

function toChatKey(worldId: string, chatId: string): string {
  return `${worldId}::${chatId}`;
}

function toAbortError(message = 'Message processing canceled by user'): DOMException {
  return new DOMException(message, 'AbortError');
}

function getOrCreateChatProcessingMap(worldId: string, chatId: string): Map<string, ActiveProcessingHandle> {
  const key = toChatKey(worldId, chatId);
  const existing = activeProcessingByChat.get(key);
  if (existing) return existing;
  const created = new Map<string, ActiveProcessingHandle>();
  activeProcessingByChat.set(key, created);
  return created;
}

function unregisterProcessingHandle(worldId: string, chatId: string, operationId: string): void {
  const key = toChatKey(worldId, chatId);
  const operations = activeProcessingByChat.get(key);
  if (!operations) return;
  operations.delete(operationId);
  if (operations.size === 0) {
    activeProcessingByChat.delete(key);
  }
}

export interface ChatMessageProcessingHandle {
  worldId: string;
  chatId: string;
  operationId: string;
  signal: AbortSignal;
  isStopped: () => boolean;
  throwIfStopped: () => void;
  complete: () => void;
}

export function beginChatMessageProcessing(
  worldId: string,
  chatId: string
): ChatMessageProcessingHandle {
  const operationId = generateId();
  const controller = new AbortController();
  const operations = getOrCreateChatProcessingMap(worldId, chatId);
  operations.set(operationId, {
    controller,
    startedAtMs: Date.now(),
  });
  let completed = false;

  return {
    worldId,
    chatId,
    operationId,
    signal: controller.signal,
    isStopped: () => controller.signal.aborted,
    throwIfStopped: () => {
      if (controller.signal.aborted) {
        throw toAbortError();
      }
    },
    complete: () => {
      if (completed) return;
      completed = true;
      unregisterProcessingHandle(worldId, chatId, operationId);
    }
  };
}

export function hasActiveChatMessageProcessing(worldId: string, chatId: string): boolean {
  const chatKey = toChatKey(worldId, chatId);
  const operations = activeProcessingByChat.get(chatKey);
  if (!operations || operations.size === 0) {
    return false;
  }

  const nowMs = Date.now();
  for (const [operationId, handle] of operations.entries()) {
    const isStale = nowMs - handle.startedAtMs > ACTIVE_PROCESSING_STALE_TTL_MS;
    if (isStale && !handle.controller.signal.aborted) {
      handle.controller.abort();
    }
    if (handle.controller.signal.aborted || isStale) {
      operations.delete(operationId);
    }
  }

  if (operations.size === 0) {
    activeProcessingByChat.delete(chatKey);
    return false;
  }

  return true;
}

export function throwIfMessageProcessingStopped(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw toAbortError();
  }
}

export function isMessageProcessingCanceledError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes('abort') || normalized.includes('canceled');
}

export interface StopMessageProcessingResult {
  success: true;
  worldId: string;
  chatId: string;
  stopped: boolean;
  reason: 'stopped' | 'no-active-process';
  stoppedOperations: number;
  llm: {
    canceledPending: number;
    abortedActive: number;
  };
  shell: {
    killed: number;
  };
  processing: {
    abortedActive: number;
  };
}

export function stopMessageProcessing(
  worldId: string,
  chatId: string
): StopMessageProcessingResult {
  const chatKey = toChatKey(worldId, chatId);
  const processingOperations = activeProcessingByChat.get(chatKey);
  let abortedProcessing = 0;
  if (processingOperations && processingOperations.size > 0) {
    for (const handle of processingOperations.values()) {
      if (handle.controller.signal.aborted) continue;
      handle.controller.abort();
      abortedProcessing += 1;
    }
  }

  const llm = cancelLLMCallsForChat(worldId, chatId);
  const shell = stopShellCommandsForChat(worldId, chatId);
  const stoppedOperations = llm.canceledPending + llm.abortedActive + shell.killed + abortedProcessing;
  const stopped = stoppedOperations > 0;

  return {
    success: true,
    worldId,
    chatId,
    stopped,
    reason: stopped ? 'stopped' : 'no-active-process',
    stoppedOperations,
    llm,
    shell,
    processing: {
      abortedActive: abortedProcessing
    }
  };
}
