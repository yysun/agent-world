/**
 * Unified Managers Module - World, Agent, and Chat Management
 *
 * Provides complete lifecycle management for worlds, agents, and chat sessions with:
 * - EventEmitter integration for runtime world instances
 * - Memory management with archiving and restoration capabilities
 * - Chat session management with auto-save and title generation
 * - Automatic ID normalization to kebab-case for consistency
 * - Environment-aware storage operations through storage-factory
 * - Agent message management with automatic agentId assignment
 * - Message ID migration for user message edit feature
 * - User message editing with removal and resubmission
 * - Error logging for message edit operations
 *
 * API: World (create/get/update/delete/list), Agent (create/get/update/delete/list/updateMemory/clearMemory),
 * Chat (newChat/listChats/deleteChat/restoreChat), Migration (migrateMessageIds), 
 * MessageEdit (removeMessagesFrom/editUserMessage/logEditError/getEditErrors)
 *
 * Implementation Details:
 * - Ensures all agent messages include agentId for proper export functionality
 * - Compatible with both SQLite and memory storage backends
 * - Automatic agent identification for message source tracking
 * - Idempotent message ID migration supporting both file and SQL storage
 * - Comprehensive error tracking for partial failures
 * - Error log persistence with 100-entry retention policy
 *
 * Recent Changes:
 * - 2026-03-06: Moved chat-selection runtime control flow onto explicit/persisted chat helpers; manager logic no longer relies on `world.currentChatId` as live runtime state.
 * - 2026-03-06: Removed runtime `world.currentChatId` fallback from exported chat-memory helpers; callers now need explicit chat scope.
 * - 2026-03-05: Added chat-scoped per-second queue retry system-status emissions (elapsed/remaining seconds + attempts used/remaining) with cleanup on retry dispatch/error transitions.
 * - 2026-03-05: Switched queue retry/timeout constants to shared reliability config.
 * - 2026-03-04: Queue/chat flows now request chat-aware runtime selection via `getActiveSubscribedWorld(worldId, chatId)` to reduce stale-runtime dispatch.
 * - 2026-03-04: Queue and immediate dispatch now prioritize registry-selected active runtime worlds over caller-provided world objects.
 * - 2026-03-04: Added queue responder preflight with single refresh attempt.
 *   - Queue dispatch now checks responder availability before publish.
 *   - When no responders are available, queue attempts one runtime responder refresh from storage.
 *   - If still unavailable, queue dispatch transitions through bounded retry/error handling.
 * - 2026-03-04: Added queue dispatch agent-status snapshots to queue logs so no-responder failures include agent/listener/mention diagnostics.
 * - 2026-03-04: Hardened queue dispatch reliability.
 *   - Queue ingress now fails closed when required queue storage operations are unavailable.
 *   - Queue completion cleanup now removes only the tracked in-flight message row.
 *   - No-responder fallback now routes through retry/error transitions instead of deleting rows.
 *   - Queue fallback timeout is now configurable and defaults to 5 seconds.
 * - 2026-03-04: Added dedicated `message.queue` category logging for queue dispatch/retry/fallback lifecycle diagnostics.
 * - 2026-02-28: Added edit-resubmission title rollback so failed edits cannot leave previously titled chats stuck at `New Chat`.
 * - 2026-02-26: Consolidated `restoreChat` and restore auto-resume tracing under categorized core loggers (`chat.restore`, `chat.restore.resume`) with structured metadata (removed direct `console.log` traces).
 * - 2026-02-25: Added comprehensive restore/resume trace logging in `restoreChat` to verify chat-switch ordering, memory sync completion, and auto-resume trigger timing.
 * - 2026-02-25: `restoreChat` now refreshes runtime agent memory from storage before auto-resume checks so loaded-chat pending tool calls can resume reliably.
 * - 2026-02-25: Added last-message auto-resume during `restoreChat` so pending user-last messages are auto-submitted and pending assistant tool-call-last messages auto-resume tool execution.
 * - 2026-02-25: Added non-blocking pending tool-call resume trigger during `restoreChat` so unresolved persisted tool calls continue after chat load/switch.
 * - 2026-03-06: `activateChatWithSnapshot` now uses only `listPendingHitlPromptEventsFromMessages` as the authoritative HITL state source, removing the dual-source merge with the runtime pending map.
 * - 2026-02-24: Replays unresolved HITL prompts during `restoreChat` so blocked requests become visible again on chat load.
 * - 2026-02-20: Added `claimAgentCreationSlot` to allow `create_agent` tool to hold the TOCTOU slot before showing approval dialog, preventing duplicate-approval race conditions.
 * - 2026-02-20: Added `createAgent` option `allowWhileWorldProcessing` so approval-gated in-flight tool calls can create agents without disabling default processing guards.
 * - 2026-02-16: Added `branchChatFromMessage` to create a new chat branched from an assistant message and copy source-chat history up to the target message.
 * - 2026-02-14: Updated `editUserMessage` to be fully core-managed for clear+resend behavior without client-side subscription refresh logic.
 *   - Edit resubmission now prefers active subscribed world runtimes.
 *   - Removed current-session gating checks and always resubmits to the provided `chatId`.
 *   - Synchronizes runtime agent memory from storage after removal before resubmission.
 * - 2026-02-13: Added world-level `mainAgent` routing config and agent-level `autoReply` toggle support.
 * - 2026-02-13: Moved edit-resubmission title-regeneration reset into core `editUserMessage` so all clients share the same behavior.
 *   - Auto-generated chat titles are reset to `New Chat` before edit resubmission only when the latest persisted
 *     `chat-title-updated` payload title still matches the current chat name.
 * - 2026-02-13: Centralized default chat-title semantics via shared chat constants.
 *   - Uses a single `NEW_CHAT_TITLE` source for reusable chat detection and creation paths.
 * - 2026-02-12: Hardened `getMemory` to auto-migrate legacy messages missing `messageId` before returning memory payloads.
 *   - Detects missing IDs, runs idempotent `migrateMessageIds`, and re-reads memory.
 *   - Ensures message-list consumers receive canonical `messageId` values from core.
 * - 2026-02-11: Made `deleteWorld` side-effect-free by removing `getWorld` usage.
 *   - `deleteWorld` now avoids world runtime hydration/chat creation paths during deletion.
 *   - Cleanup hooks are invoked only if present on directly loaded world data.
 *
 * Changes:
 * - 2026-02-10: Added agent identifier resolution across manager APIs.
 *   - Agent operations now accept either stored agent ID or agent name.
 *   - Fallback lookup resolves renamed agents where `id` and `toKebabCase(name)` differ.
 * - 2026-02-10: Added world identifier resolution across manager APIs.
 *   - World operations now accept either stored world ID or world name.
 *   - Fallback lookup resolves renamed worlds where `id` and `toKebabCase(name)` differ.
 *   - List APIs return normalized world IDs for consistent client routing.
 * - 2025-10-26: Consolidated message publishing - removed resubmitMessageToWorld
 *   - Added chatId to WorldMessageEvent and publishMessage parameters
 *   - editUserMessage now calls publishMessage directly with validation
 *   - Simplified API by removing redundant resubmit wrapper function
 * - 2025-10-25: Fixed messageId bug in editUserMessage resubmission
 *   - Bug: Generated unused messageId instead of capturing actual from publishMessage
 *   - Fix: Use messageEvent.messageId from publishMessage return value
 *   - Impact: Prevents "undefined" string serialization in JSON responses
 * - 2025-10-21: Added message ID migration and user message edit feature (Phases 1 & 2)
 *   - migrateMessageIds: Auto-assign IDs to existing messages (idempotent)
 *   - removeMessagesFrom: Remove target + subsequent messages by timestamp
 *   - editUserMessage: Combined removal + resubmission operation
 *   - logEditError/getEditErrors: Error persistence in edit-errors.json
 *
 * Note: Export functionality has been moved to core/export.ts
 */
// Core module imports
import { createCategoryLogger, initializeLogger } from './logger.js';
import { EventEmitter } from 'events';
import { type StorageAPI, createStorageWithWrappers } from './storage/storage-factory.js'
import * as utils from './utils.js';
import { nanoid } from 'nanoid';
import * as fs from 'fs';
import * as path from 'path';
import { getWorldDir } from './storage/world-storage.js';
import { getDefaultRootPath } from './storage/storage-factory.js';
import { NEW_CHAT_TITLE, isDefaultChatTitle } from './chat-constants.js';
import { hasActiveChatMessageProcessing, stopMessageProcessing } from './message-processing-control.js';
import { replayPendingHitlRequests, listPendingHitlPromptEventsFromMessages, clearPendingHitlRequestsForChat } from './hitl.js';
import { clearChatSkillApprovals, reconstructSkillApprovalsFromMessages } from './load-skill-tool.js';
import { resumePendingToolCallsForChat } from './events/memory-manager.js';
import { RELIABILITY_CONFIG } from './reliability-config.js';
import { startChatScopedWaitStatusEmitter, type WaitStatusEmitterHandle } from './reliability-runtime.js';

// Type imports
import type {
  World, CreateWorldParams, UpdateWorldParams, Agent, CreateAgentParams, UpdateAgentParams,
  AgentMessage, Chat, CreateChatParams, UpdateChatParams, WorldChat, LLMProvider, RemovalResult, EditErrorLog,
  QueuedMessage
} from './types.js';

// Initialize logger and storage
const logger = createCategoryLogger('core.managers');
const loggerRestore = createCategoryLogger('chat.restore');
const loggerRestoreResume = createCategoryLogger('chat.restore.resume');
const loggerQueue = createCategoryLogger('message.queue');
let storageWrappers: StorageAPI | null = null;
let moduleInitialization: Promise<void> | null = null;

async function initializeModules() {
  if (storageWrappers) {
    return; // Already initialized
  }
  try {
    initializeLogger();
    storageWrappers = await createStorageWithWrappers();
    // Startup recovery: reset any 'sending' queue rows interrupted by an app crash/restart
    const recovered = await storageWrappers.recoverSendingMessages?.();
    if (recovered) {
      logger.info('Queue startup recovery: reset interrupted messages to queued', { count: recovered });
    }
  } catch (error) {
    // Log error but don't throw - allows tests to proceed with mocked storage
    logger.error('Failed to initialize storage', { error: error instanceof Error ? error.message : error });
    throw error;
  }
}

function ensureInitialization(): Promise<void> {
  if (!moduleInitialization) {
    moduleInitialization = initializeModules();
  }
  return moduleInitialization;
}
const NEW_CHAT_CONFIG = { REUSABLE_CHAT_TITLE: NEW_CHAT_TITLE } as const;
const inFlightToolResumeKeys = new Set<string>();
const inFlightUserResumeKeys = new Set<string>();

// ─── Queue management state ──────────────────────────────────────────────────
// keyed by `${worldId}:${chatId}`
const inFlightQueueResumeKeys = new Set<string>();
const pausedQueues = new Set<string>();
const queueListenerActive = new Set<string>();
const queueAdvanceListeners = new Map<string, (payload: any) => void>();
const queueResponderRefreshAttempted = new Set<string>();
const QUEUE_NO_RESPONSE_FALLBACK_MS = RELIABILITY_CONFIG.queue.noResponseFallbackMs;
const QUEUE_MAX_RETRY_ATTEMPTS = RELIABILITY_CONFIG.queue.maxRetryAttempts;
type QueueDispatchState = {
  messageId: string;
  responseStarted: boolean;
  dispatchedAt: number;
};
const queueDispatchStateByChat = new Map<string, QueueDispatchState>();
type QueueRetryStatusHandle = {
  emitter: WaitStatusEmitterHandle;
};
const queueRetryStatusHandles = new Map<string, QueueRetryStatusHandle>();
type QueueAgentStatusSnapshot = {
  queueChatId: string;
  totalAgents: number;
  activeAgents: number;
  autoReplyEnabledAgents: number;
  subscribedAgentCount: number;
  messageListenerCount: number;
  worldListenerCount: number;
  sseListenerCount: number;
  mainAgent: string | null;
  resolvedMainAgentId: string | null;
  paragraphMentions: string[];
  anyMentions: string[];
  effectiveMentions: string[];
  eligibleResponderAgentIds: string[];
  eligibleResponderCount: number;
  reasonHint: string | null;
};

type QueueStorageOperations = Required<Pick<
  StorageAPI,
  'getQueuedMessages' |
  'addQueuedMessage' |
  'updateMessageQueueStatus' |
  'incrementQueueMessageRetry' |
  'removeQueuedMessage'
>>;

type CreateAgentOptions = {
  allowWhileWorldProcessing?: boolean;
  /** Set to true when the creation slot was already claimed via claimAgentCreationSlot(). */
  slotAlreadyClaimed?: boolean;
};

export type ChatActivationSnapshot = {
  world: World;
  chatId: string;
  memory: AgentMessage[];
  hitlPrompts: Array<{ chatId: string | null; prompt: Record<string, unknown> }>;
};

/**
 * Attach a one-time 'world' event listener that fires when a specific chat's
 * processing completes (chat is no longer in activeChatIds). When fired, marks
 * the in-flight queued message as complete and triggers the next queue item.
 *
 * Only one listener is registered per (worldId, chatId) at a time.
 */
function getQueueKey(worldId: string, chatId: string): string {
  return `${worldId}:${chatId}`;
}

function getQueueMessageKey(worldId: string, chatId: string, messageId: string): string {
  return `${worldId}:${chatId}:${messageId}`;
}

function clearQueueRetryStatusEmitter(worldId: string, chatId: string, messageId: string): void {
  const retryStatusKey = getQueueMessageKey(worldId, chatId, messageId);
  const handle = queueRetryStatusHandles.get(retryStatusKey);
  if (!handle) return;
  handle.emitter.stop();
  queueRetryStatusHandles.delete(retryStatusKey);
}

function startQueueRetryStatusEmitter(
  world: World,
  chatId: string,
  messageId: string,
  retry: {
    reason: string;
    attempt: number;
    maxAttempts: number;
    delayMs: number;
  }
): void {
  const scopedChatId = String(chatId || '').trim();
  if (!scopedChatId) return;

  clearQueueRetryStatusEmitter(world.id, scopedChatId, messageId);

  const emitter = startChatScopedWaitStatusEmitter({
    world,
    chatId: scopedChatId,
    phase: 'queue_retry',
    reason: retry.reason,
    durationMs: retry.delayMs,
    attempt: retry.attempt,
    maxAttempts: retry.maxAttempts,
    contentBuilder: (snapshot) => {
      return `Queue retry scheduled (${retry.reason}): attempt ${snapshot.attempt}/${snapshot.maxAttempts}, remaining attempts ${snapshot.attemptsRemaining ?? 0}, elapsed ${snapshot.elapsedSeconds}s, next retry in ${snapshot.remainingSeconds ?? 0}s.`;
    },
  });

  queueRetryStatusHandles.set(getQueueMessageKey(world.id, scopedChatId, messageId), {
    emitter,
  });
}

function clearQueueResponderRefreshAttempt(worldId: string, chatId: string, messageId: string): void {
  queueResponderRefreshAttempted.delete(getQueueMessageKey(worldId, chatId, messageId));
}

function getQueueStorageOrThrow(caller: string): QueueStorageOperations {
  const missingMethods: string[] = [];
  if (!storageWrappers?.getQueuedMessages) missingMethods.push('getQueuedMessages');
  if (!storageWrappers?.addQueuedMessage) missingMethods.push('addQueuedMessage');
  if (!storageWrappers?.updateMessageQueueStatus) missingMethods.push('updateMessageQueueStatus');
  if (!storageWrappers?.incrementQueueMessageRetry) missingMethods.push('incrementQueueMessageRetry');
  if (!storageWrappers?.removeQueuedMessage) missingMethods.push('removeQueuedMessage');

  if (missingMethods.length > 0) {
    throw new Error(
      `${caller}: queue storage backend missing required operations (${missingMethods.join(', ')}).`
    );
  }

  return storageWrappers as QueueStorageOperations;
}

function detachQueueAdvanceListener(world: World, chatId: string): void {
  const listenerKey = getQueueKey(world.id, chatId);
  const listener = queueAdvanceListeners.get(listenerKey);
  if (!listener) return;
  world.eventEmitter.removeListener('world', listener);
  queueAdvanceListeners.delete(listenerKey);
  queueListenerActive.delete(listenerKey);
}

function normalizeQueueMentionToken(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function resolveQueueMainAgentId(world: World): string | null {
  const rawMainAgent = String(world.mainAgent || '').trim();
  if (!rawMainAgent) return null;

  const normalizedMainAgent = normalizeQueueMentionToken(rawMainAgent);
  if (!normalizedMainAgent) return null;
  const agentMap = world?.agents instanceof Map ? world.agents : new Map<string, Agent>();
  if (agentMap.has(normalizedMainAgent)) return normalizedMainAgent;

  for (const agent of agentMap.values()) {
    const normalizedAgentId = normalizeQueueMentionToken(agent.id);
    const normalizedAgentName = normalizeQueueMentionToken(agent.name || '');
    if (normalizedAgentId === normalizedMainAgent || normalizedAgentName === normalizedMainAgent) {
      return agent.id;
    }
  }
  return null;
}

function collectQueueAgentStatus(
  world: World,
  chatId: string,
  content: string,
  sender: string,
): QueueAgentStatusSnapshot {
  const agentMap = world?.agents instanceof Map ? world.agents : new Map<string, Agent>();
  const agents = Array.from(agentMap.values());
  const totalAgents = agents.length;
  const activeAgents = agents.filter((agent) => agent.status === 'active').length;
  const autoReplyEnabledAgents = agents.filter((agent) => agent.autoReply !== false).length;
  const subscribedAgentCount = world?._agentUnsubscribers instanceof Map
    ? world._agentUnsubscribers.size
    : 0;
  const messageListenerCount = typeof world?.eventEmitter?.listenerCount === 'function'
    ? world.eventEmitter.listenerCount('message')
    : 0;
  const worldListenerCount = typeof world?.eventEmitter?.listenerCount === 'function'
    ? world.eventEmitter.listenerCount('world')
    : 0;
  const sseListenerCount = typeof world?.eventEmitter?.listenerCount === 'function'
    ? world.eventEmitter.listenerCount('sse')
    : 0;

  const paragraphMentions = utils.extractParagraphBeginningMentions(content || '');
  const anyMentions = utils.extractMentions(content || '');
  const isUserSender = isUserQueueSender(sender);
  const resolvedMainAgentId = resolveQueueMainAgentId(world);
  const effectiveMentions = paragraphMentions.length === 0 && isUserSender && resolvedMainAgentId
    ? [normalizeQueueMentionToken(resolvedMainAgentId)]
    : paragraphMentions.map((mention) => normalizeQueueMentionToken(mention));

  let eligibleResponderAgentIds: string[] = [];
  if (!isUserSender) {
    eligibleResponderAgentIds = agents
      .map((agent) => String(agent.id || '').trim())
      .filter((agentId) => agentId.length > 0);
  } else if (effectiveMentions.length === 0 && anyMentions.length > 0) {
    eligibleResponderAgentIds = [];
  } else if (effectiveMentions.length === 0) {
    eligibleResponderAgentIds = agents
      .map((agent) => String(agent.id || '').trim())
      .filter((agentId) => agentId.length > 0);
  } else {
    eligibleResponderAgentIds = agents
      .filter((agent) => {
        const normalizedAgentId = String(agent.id || '').toLowerCase().replace(/\s+/g, '-');
        return effectiveMentions.includes(normalizedAgentId);
      })
      .map((agent) => String(agent.id || '').trim())
      .filter((agentId) => agentId.length > 0);
  }

  let reasonHint: string | null = null;
  if (totalAgents === 0) {
    reasonHint = 'no-agents-loaded';
  } else if (messageListenerCount === 0) {
    reasonHint = 'no-message-listeners';
  } else if (subscribedAgentCount === 0) {
    reasonHint = 'no-agent-subscribers';
  } else if (eligibleResponderAgentIds.length === 0) {
    reasonHint = 'no-eligible-responders-for-message';
  }

  return {
    queueChatId: chatId,
    totalAgents,
    activeAgents,
    autoReplyEnabledAgents,
    subscribedAgentCount,
    messageListenerCount,
    worldListenerCount,
    sseListenerCount,
    mainAgent: String(world.mainAgent || '').trim() || null,
    resolvedMainAgentId,
    paragraphMentions,
    anyMentions,
    effectiveMentions,
    eligibleResponderAgentIds,
    eligibleResponderCount: eligibleResponderAgentIds.length,
    reasonHint,
  };
}

function hasQueueResponderAvailability(status: QueueAgentStatusSnapshot): boolean {
  return status.eligibleResponderCount > 0;
}

async function refreshQueueRespondersFromStorage(world: World): Promise<void> {
  if (!storageWrappers?.listAgents) {
    throw new Error('refreshQueueRespondersFromStorage: listAgents is unavailable.');
  }

  if (world?._agentUnsubscribers instanceof Map) {
    for (const unsubscribe of world._agentUnsubscribers.values()) {
      try {
        unsubscribe();
      } catch {
        // best effort cleanup
      }
    }
    world._agentUnsubscribers.clear();
  }

  const persistedAgents = await storageWrappers.listAgents(world.id);
  world.agents = new Map((persistedAgents || []).map((agent: Agent) => [agent.id, agent]));

  const { subscribeAgentToMessages, subscribeWorldToMessages } = await import('./events/index.js');
  for (const agent of world.agents.values()) {
    subscribeAgentToMessages(world, agent);
  }
  subscribeWorldToMessages(world);
}

async function runQueueResponderPreflight(
  world: World,
  chatId: string,
  queuedMessage: Pick<QueuedMessage, 'messageId' | 'content' | 'sender'>,
): Promise<{ ready: boolean; agentStatus: QueueAgentStatusSnapshot; refreshed: boolean }> {
  let agentStatus = collectQueueAgentStatus(world, chatId, queuedMessage.content, queuedMessage.sender);
  if (hasQueueResponderAvailability(agentStatus)) {
    return { ready: true, agentStatus, refreshed: false };
  }

  const messageKey = getQueueMessageKey(world.id, chatId, queuedMessage.messageId);
  if (queueResponderRefreshAttempted.has(messageKey)) {
    return { ready: false, agentStatus, refreshed: false };
  }
  queueResponderRefreshAttempted.add(messageKey);

  loggerQueue.warn('Queue responder preflight detected no eligible responders; attempting one runtime refresh', {
    worldId: world.id,
    chatId,
    messageId: queuedMessage.messageId,
    agentStatus,
  });

  try {
    await refreshQueueRespondersFromStorage(world);
  } catch (error) {
    loggerQueue.warn('Queue responder preflight refresh failed', {
      worldId: world.id,
      chatId,
      messageId: queuedMessage.messageId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  agentStatus = collectQueueAgentStatus(world, chatId, queuedMessage.content, queuedMessage.sender);
  if (hasQueueResponderAvailability(agentStatus)) {
    return { ready: true, agentStatus, refreshed: true };
  }

  return { ready: false, agentStatus, refreshed: true };
}

async function handleQueueDispatchFailure(
  world: World,
  chatId: string,
  messageId: string,
  reason: string,
  context?: { content?: string; sender?: string },
): Promise<void> {
  const queueKey = getQueueKey(world.id, chatId);
  clearQueueResponderRefreshAttempt(world.id, chatId, messageId);
  clearQueueRetryStatusEmitter(world.id, chatId, messageId);
  queueDispatchStateByChat.delete(queueKey);
  detachQueueAdvanceListener(world, chatId);
  const agentStatus = collectQueueAgentStatus(
    world,
    chatId,
    String(context?.content || ''),
    String(context?.sender || 'human'),
  );

  let queueStorage: QueueStorageOperations;
  try {
    queueStorage = getQueueStorageOrThrow('handleQueueDispatchFailure');
  } catch (error) {
    loggerQueue.error('Queue dispatch failure could not be recorded', {
      worldId: world.id,
      chatId,
      messageId,
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  try {
    const newRetryCount = await queueStorage.incrementQueueMessageRetry(messageId);
    if (newRetryCount < QUEUE_MAX_RETRY_ATTEMPTS) {
      await queueStorage.updateMessageQueueStatus(messageId, 'queued');
      // Re-add to queued cache: this message is waiting for retry dispatch
      if (!world._queuedChatIds) world._queuedChatIds = new Set();
      world._queuedChatIds.add(chatId);
      const delayMs = Math.pow(2, newRetryCount - 1) * RELIABILITY_CONFIG.queue.retryBaseDelayMs;
      startQueueRetryStatusEmitter(world, chatId, messageId, {
        reason,
        attempt: newRetryCount,
        maxAttempts: QUEUE_MAX_RETRY_ATTEMPTS,
        delayMs,
      });
      loggerQueue.warn('Queue dispatch failed; message re-queued for retry', {
        worldId: world.id,
        chatId,
        messageId,
        reason,
        retryCount: newRetryCount,
        nextAttemptInMs: delayMs,
        agentStatus,
      });
      setTimeout(() => {
        void (async () => {
          clearQueueRetryStatusEmitter(world.id, chatId, messageId);
          try {
            const { getActiveSubscribedWorld } = await import('./subscription.js');
            const runtimeWorld =
              getActiveSubscribedWorld(world.id, chatId) ||
              await getWorld(world.id);
            if (!runtimeWorld) {
              loggerQueue.warn('Queue retry skipped: world unavailable', {
                worldId: world.id,
                chatId,
                messageId,
                reason,
              });
              return;
            }
            triggerPendingQueueResume(runtimeWorld, chatId);
          } catch (resolveError) {
            loggerQueue.warn('Queue retry failed to resolve runtime world', {
              worldId: world.id,
              chatId,
              messageId,
              reason,
              error: resolveError instanceof Error ? resolveError.message : String(resolveError),
            });
          }
        })();
      }, delayMs);
      return;
    }

    await queueStorage.updateMessageQueueStatus(messageId, 'error');
    clearQueueRetryStatusEmitter(world.id, chatId, messageId);
    loggerQueue.warn('Queue message reached max retries, marked error', {
      worldId: world.id,
      chatId,
      messageId,
      reason,
      retryCount: newRetryCount,
      agentStatus,
    });
  } catch (retryErr) {
    clearQueueRetryStatusEmitter(world.id, chatId, messageId);
    loggerQueue.error('Failed to handle queue dispatch retry transition', {
      worldId: world.id,
      chatId,
      messageId,
      reason,
      error: String(retryErr),
    });
  }
}

function attachQueueAdvanceListener(world: World, chatId: string): void {
  const listenerKey = getQueueKey(world.id, chatId);
  if (queueListenerActive.has(listenerKey)) return;
  queueListenerActive.add(listenerKey);

  function onWorldActivity(payload: any): void {
    if (payload.chatId !== chatId) return;
    const queueDispatchState = queueDispatchStateByChat.get(listenerKey);
    if (payload.type === 'response-start') {
      if (queueDispatchState) {
        queueDispatchState.responseStarted = true;
      }
      return;
    }
    if (payload.type !== 'idle' && payload.type !== 'response-end') return;
    const activeChatIds: string[] = payload.activeChatIds || [];
    if (activeChatIds.includes(chatId)) return; // this chat is still processing

    // Chat processing just completed — clean up listener
    detachQueueAdvanceListener(world, chatId);

    void (async () => {
      const inFlightMessageId = queueDispatchStateByChat.get(listenerKey)?.messageId || null;
      queueDispatchStateByChat.delete(listenerKey);
      try {
        if (!inFlightMessageId) {
          loggerQueue.warn('Queue completion observed without tracked in-flight message', {
            worldId: world.id,
            chatId,
          });
          return;
        }

        const queueStorage = getQueueStorageOrThrow('attachQueueAdvanceListener');
        const messages = await queueStorage.getQueuedMessages(world.id, chatId);
        const sendingMsg = messages?.find((m: QueuedMessage) => m.messageId === inFlightMessageId && m.status === 'sending');
        if (sendingMsg) {
          // Successful completion — remove from queue (message now lives in agent_memory)
          await queueStorage.removeQueuedMessage(sendingMsg.messageId);
          clearQueueResponderRefreshAttempt(world.id, chatId, sendingMsg.messageId);
          // Safety: ensure chatId is not left in the queued cache
          world._queuedChatIds?.delete(chatId);
        } else {
          loggerQueue.warn('Queue completion observed but no matching sending row found', {
            worldId: world.id,
            chatId,
            messageId: inFlightMessageId,
          });
        }
      } catch (err) {
        loggerQueue.warn('Failed to mark queued message complete', {
          worldId: world.id,
          chatId,
          messageId: inFlightMessageId,
          error: String(err),
        });
      }
      // Chain: trigger the next queued message
      triggerPendingQueueResume(world, chatId);
    })();
  }

  world.eventEmitter.on('world', onWorldActivity);
}

/**
 * Guardrail for worlds/chats where a queued human message is published but no
 * responder starts processing. In that case no world idle/response-end event is
 * emitted, so we transition the queue row through retry/error handling.
 */
function scheduleQueueNoResponseFallback(world: World, chatId: string, messageId: string): void {
  setTimeout(() => {
    void (async () => {
      try {
        const queueStorage = getQueueStorageOrThrow('scheduleQueueNoResponseFallback');
        const queueKey = getQueueKey(world.id, chatId);
        const queueDispatchState = queueDispatchStateByChat.get(queueKey);
        if (!queueDispatchState || queueDispatchState.messageId !== messageId) return;
        if (queueDispatchState.responseStarted) {
          loggerQueue.debug('Queue fallback skipped because response-start was observed', {
            worldId: world.id,
            chatId,
            messageId,
            agentStatus: collectQueueAgentStatus(world, chatId, '', 'human'),
          });
          return;
        }
        if (hasActiveChatMessageProcessing(world.id, chatId)) return;

        const messages = await queueStorage.getQueuedMessages(world.id, chatId);
        const sendingMessage = messages?.find((m: QueuedMessage) => m.messageId === messageId && m.status === 'sending');
        if (!sendingMessage) return;

        await handleQueueDispatchFailure(world, chatId, messageId, 'no-response-timeout', {
          content: sendingMessage.content,
          sender: sendingMessage.sender,
        });
        loggerQueue.warn('Queue fallback escalated message to retry/error after no responder start', {
          worldId: world.id,
          chatId,
          messageId,
          agentStatus: collectQueueAgentStatus(
            world,
            chatId,
            sendingMessage.content,
            sendingMessage.sender,
          ),
        });
      } catch (err) {
        loggerQueue.warn('Queue fallback cleanup failed', {
          worldId: world.id,
          chatId,
          messageId,
          error: String(err),
        });
      }
    })();
  }, QUEUE_NO_RESPONSE_FALLBACK_MS);
}

/**
 * Core queue processing trigger. Finds the next 'queued' message for the chat,
 * marks it 'sending', and publishes it. Registers a world-activity listener to
 * chain to the next message after response completion.
 *
 * Guards: pause flag, active-processing check, per-chat dedup.
 */
function triggerPendingQueueResume(
  world: World,
  chatId: string,
  options?: {
    recoverStaleSending?: boolean;
  }
): void {
  if (!chatId) return;

  const queueKey = getQueueKey(world.id, chatId);

  if (pausedQueues.has(queueKey)) {
    loggerQueue.debug('Queue processing skipped: paused', { worldId: world.id, chatId });
    return;
  }

  if (hasActiveChatMessageProcessing(world.id, chatId)) {
    // An agent is actively processing — the advance listener will pick up when done
    return;
  }

  if (inFlightQueueResumeKeys.has(queueKey)) {
    return;
  }

  inFlightQueueResumeKeys.add(queueKey);

  void (async () => {
    let nextMessage: QueuedMessage | undefined;
    const recoverStaleSending = options?.recoverStaleSending === true;
    try {
      const queueStorage = getQueueStorageOrThrow('triggerPendingQueueResume');
      let messages = await queueStorage.getQueuedMessages(world.id, chatId);
      const staleSendingMessages = recoverStaleSending
        ? messages?.filter((m: QueuedMessage) => m.status === 'sending') ?? []
        : [];

      if (staleSendingMessages.length > 0) {
        loggerQueue.warn('Detected stale sending queue messages during resume; resetting to queued', {
          worldId: world.id,
          chatId,
          count: staleSendingMessages.length,
          messageIds: staleSendingMessages.map((m: QueuedMessage) => m.messageId),
        });

        for (const staleMessage of staleSendingMessages) {
          await queueStorage.updateMessageQueueStatus(staleMessage.messageId, 'queued');
        }

        messages = await queueStorage.getQueuedMessages(world.id, chatId);
      }

      nextMessage = messages?.find((m: QueuedMessage) => m.status === 'queued');

      if (!nextMessage) {
        loggerQueue.debug('No queued messages remaining', { worldId: world.id, chatId });
        return;
      }

      const preflight = await runQueueResponderPreflight(world, chatId, {
        messageId: nextMessage.messageId,
        content: nextMessage.content,
        sender: nextMessage.sender,
      });
      if (!preflight.ready) {
        await handleQueueDispatchFailure(world, chatId, nextMessage.messageId, 'no-responder-preflight', {
          content: nextMessage.content,
          sender: nextMessage.sender,
        });
        loggerQueue.warn('Queue dispatch blocked: no eligible responders after preflight refresh; moved to retry/error flow', {
          worldId: world.id,
          chatId,
          messageId: nextMessage.messageId,
          refreshed: preflight.refreshed,
          reason: 'no-responder-preflight',
          agentStatus: preflight.agentStatus,
        });
        clearQueueResponderRefreshAttempt(world.id, chatId, nextMessage.messageId);
        return;
      }

      await queueStorage.updateMessageQueueStatus(nextMessage.messageId, 'sending');
      // Remove from queued cache: this chat is now transitioning to active processing
      world._queuedChatIds?.delete(chatId);
      queueDispatchStateByChat.set(queueKey, {
        messageId: nextMessage.messageId,
        responseStarted: false,
        dispatchedAt: Date.now(),
      });

      const { publishMessageWithId } = await import('./events/index.js');

      // Register listener BEFORE publishing so the idle event is never missed
      attachQueueAdvanceListener(world, chatId);

      loggerQueue.debug('Publishing queued message', {
        worldId: world.id,
        chatId,
        messageId: nextMessage.messageId,
        agentStatus: preflight.agentStatus,
      });

      publishMessageWithId(world, nextMessage.content, nextMessage.sender, nextMessage.messageId, chatId);
      scheduleQueueNoResponseFallback(world, chatId, nextMessage.messageId);
    } catch (error) {
      if (nextMessage?.messageId) {
        void handleQueueDispatchFailure(
          world,
          chatId,
          nextMessage.messageId,
          error instanceof Error ? error.message : String(error),
          {
            content: nextMessage.content,
            sender: nextMessage.sender,
          },
        );
      }
      loggerQueue.warn('Failed to publish queued message', {
        worldId: world.id,
        chatId,
        messageId: nextMessage?.messageId ?? null,
        error: error instanceof Error ? error.message : String(error),
        agentStatus: nextMessage
          ? collectQueueAgentStatus(world, chatId, nextMessage.content, nextMessage.sender)
          : collectQueueAgentStatus(world, chatId, '', 'human'),
      });
    } finally {
      inFlightQueueResumeKeys.delete(queueKey);
    }
  })();
}

function triggerPendingToolCallResume(world: World, chatId: string, targetAssistantMessageId?: string): void {
  if (!chatId) {
    return;
  }

  if (hasActiveChatMessageProcessing(world.id, chatId)) {
    return;
  }

  const resumeKey = `${world.id}:${chatId}`;
  if (inFlightToolResumeKeys.has(resumeKey)) {
    return;
  }

  inFlightToolResumeKeys.add(resumeKey);
  void (async () => {
    try {
      const resumedCount = await resumePendingToolCallsForChat(world, chatId, targetAssistantMessageId);
      loggerRestoreResume.debug('Attempted pending tool-call resume after chat restore', {
        worldId: world.id,
        chatId,
        targetAssistantMessageId: targetAssistantMessageId || null,
        resumedCount,
      });
      if (resumedCount > 0) {
        loggerRestoreResume.debug('Resumed pending persisted tool calls after chat restore', {
          worldId: world.id,
          chatId,
          targetAssistantMessageId,
          resumedCount,
        });
      }
    } catch (error) {
      loggerRestoreResume.warn('Failed to resume pending persisted tool calls after chat restore', {
        worldId: world.id,
        chatId,
        targetAssistantMessageId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlightToolResumeKeys.delete(resumeKey);
    }
  })();
}

function hasPendingToolCallsOnLastAssistantMessage(lastMessage: AgentMessage, chatMemory: AgentMessage[]): boolean {
  if (lastMessage.role !== 'assistant' || !Array.isArray(lastMessage.tool_calls) || lastMessage.tool_calls.length === 0) {
    return false;
  }

  const completedToolCallIds = new Set<string>();
  for (const message of chatMemory) {
    if (message.role !== 'tool' || typeof message.tool_call_id !== 'string') {
      continue;
    }
    const toolCallId = message.tool_call_id.trim();
    if (toolCallId) {
      completedToolCallIds.add(toolCallId);
    }
  }

  for (const toolCall of lastMessage.tool_calls) {
    const toolCallId = String((toolCall as any)?.id || '').trim();
    if (!toolCallId) {
      continue;
    }
    if (!completedToolCallIds.has(toolCallId)) {
      return true;
    }
  }

  return false;
}

function triggerPendingUserMessageResume(world: World, chatId: string, userMessage: AgentMessage): void {
  if (!chatId || !userMessage.messageId) {
    return;
  }

  if (hasActiveChatMessageProcessing(world.id, chatId)) {
    return;
  }

  const content = typeof userMessage.content === 'string' ? userMessage.content.trim() : '';
  if (!content) {
    return;
  }

  const sender = typeof userMessage.sender === 'string' && userMessage.sender.trim()
    ? userMessage.sender
    : 'human';

  const resumeKey = `${world.id}:${chatId}:${userMessage.messageId}`;
  if (inFlightUserResumeKeys.has(resumeKey)) {
    return;
  }

  inFlightUserResumeKeys.add(resumeKey);

  void (async () => {
    try {
      const { publishMessageWithId } = await import('./events/index.js');
      loggerRestoreResume.debug('Submitting pending user-last message after chat restore', {
        worldId: world.id,
        chatId,
        messageId: userMessage.messageId,
      });
      publishMessageWithId(
        world,
        userMessage.content,
        sender,
        userMessage.messageId!,
        chatId,
        userMessage.replyToMessageId
      );

      loggerRestoreResume.debug('Auto-submitted pending user-last message after chat restore', {
        worldId: world.id,
        chatId,
        messageId: userMessage.messageId,
      });
    } catch (error) {
      loggerRestoreResume.warn('Failed to auto-submit pending user-last message after chat restore', {
        worldId: world.id,
        chatId,
        messageId: userMessage.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlightUserResumeKeys.delete(resumeKey);
    }
  })();
}

function triggerPendingLastMessageResume(world: World, chatId: string): void {
  if (!chatId) {
    return;
  }

  void (async () => {
    try {
      const chatMemory = await storageWrappers!.getMemory(world.id, chatId);
      if (!chatMemory || chatMemory.length === 0) {
        return;
      }

      const lastMessage = chatMemory[chatMemory.length - 1];
      if (lastMessage.role === 'user') {
        loggerRestoreResume.debug('Detected pending user-last message during chat-restore inspection', {
          worldId: world.id,
          chatId,
          messageId: lastMessage.messageId || null,
        });
        triggerPendingUserMessageResume(world, chatId, lastMessage);
        return;
      }

      if (hasPendingToolCallsOnLastAssistantMessage(lastMessage, chatMemory)) {
        loggerRestoreResume.debug('Detected pending tool-call-last message during chat-restore inspection', {
          worldId: world.id,
          chatId,
          messageId: lastMessage.messageId || null,
        });
        triggerPendingToolCallResume(world, chatId, lastMessage.messageId);
      }
    } catch (error) {
      loggerRestoreResume.warn('Failed to inspect last message for chat-restore auto-resume', {
        worldId: world.id,
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
}

// TOCTOU guard: prevents two concurrent createAgent calls from both passing the
// `agentExists` check before either write lands. Maps worldId → Set<agentId>.
const pendingAgentCreates = new Map<string, Set<string>>();

export type ClaimAgentCreationSlotResult =
  | { claimed: true; release: () => void }
  | { claimed: false; reason: 'already_pending' | 'already_exists'; name: string };

/**
 * Pre-claim an agent creation slot before showing an approval dialog.
 * Prevents race conditions where two concurrent create_agent tool calls both
 * pass approval before either calls createAgent.
 * Returns a release() function that MUST be called if createAgent is not called.
 * createAgent({ slotAlreadyClaimed: true }) also cleans up the slot itself,
 * so calling release() after createAgent is safe (idempotent).
 */
export async function claimAgentCreationSlot(
  worldId: string,
  agentName: string,
): Promise<ClaimAgentCreationSlotResult> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const agentId = utils.toKebabCase(agentName);

  const worldPending = pendingAgentCreates.get(resolvedWorldId) ?? new Set<string>();
  if (!pendingAgentCreates.has(resolvedWorldId)) {
    pendingAgentCreates.set(resolvedWorldId, worldPending);
  }

  if (worldPending.has(agentId)) {
    return { claimed: false, reason: 'already_pending', name: agentName };
  }

  const exists = await storageWrappers!.agentExists(resolvedWorldId, agentId);
  if (exists) {
    return { claimed: false, reason: 'already_exists', name: agentName };
  }

  worldPending.add(agentId);

  return {
    claimed: true,
    release: () => {
      worldPending.delete(agentId);
      if (worldPending.size === 0) {
        pendingAgentCreates.delete(resolvedWorldId);
      }
    },
  };
}

function extractGeneratedChatTitleFromSystemPayload(payload: any): string | null {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.eventType !== 'chat-title-updated') return null;
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  return title || null;
}

type EditResubmissionTitleResetResult =
  | { resetApplied: false; previousTitle: null }
  | { resetApplied: true; previousTitle: string };

async function resetAutoGeneratedChatTitleForEditResubmission(
  world: World,
  chatId: string
): Promise<EditResubmissionTitleResetResult> {
  const chat = world.chats.get(chatId) ?? await storageWrappers!.loadChatData(world.id, chatId);
  if (!chat) return { resetApplied: false, previousTitle: null };

  const currentTitle = String(chat.name || '').trim();
  if (!currentTitle || isDefaultChatTitle(currentTitle)) {
    return { resetApplied: false, previousTitle: null };
  }

  const eventStorage = world.eventStorage;
  if (!eventStorage) {
    return { resetApplied: false, previousTitle: null };
  }

  let latestGeneratedTitle: string | null = null;
  try {
    const systemEvents = await eventStorage.getEventsByWorldAndChat(world.id, chatId, {
      types: ['system'],
      order: 'desc',
      limit: 25
    });

    for (const event of systemEvents) {
      const generatedTitle = extractGeneratedChatTitleFromSystemPayload(event?.payload);
      if (generatedTitle) {
        latestGeneratedTitle = generatedTitle;
        break;
      }
    }
  } catch (error) {
    logger.debug('Skipping auto-title reset because system events could not be queried', {
      worldId: world.id,
      chatId,
      error: error instanceof Error ? error.message : String(error)
    });
    return { resetApplied: false, previousTitle: null };
  }

  if (!latestGeneratedTitle || latestGeneratedTitle !== currentTitle) {
    return { resetApplied: false, previousTitle: null };
  }

  let resetSucceeded = false;
  if (typeof storageWrappers!.updateChatNameIfCurrent === 'function') {
    resetSucceeded = await storageWrappers!.updateChatNameIfCurrent(
      world.id,
      chatId,
      currentTitle,
      NEW_CHAT_TITLE
    );
  } else {
    const updated = await storageWrappers!.updateChatData(world.id, chatId, { name: NEW_CHAT_TITLE });
    resetSucceeded = !!updated;
  }

  if (!resetSucceeded) {
    return { resetApplied: false, previousTitle: null };
  }

  const runtimeChat = world.chats.get(chatId);
  if (runtimeChat) {
    runtimeChat.name = NEW_CHAT_TITLE;
  }

  return { resetApplied: true, previousTitle: currentTitle };
}

async function rollbackAutoGeneratedChatTitleResetAfterFailedResubmission(
  world: World,
  chatId: string,
  previousTitle: string
): Promise<void> {
  const normalizedPreviousTitle = String(previousTitle || '').trim();
  if (!normalizedPreviousTitle || isDefaultChatTitle(normalizedPreviousTitle)) {
    return;
  }

  let restored = false;
  if (typeof storageWrappers!.updateChatNameIfCurrent === 'function') {
    restored = await storageWrappers!.updateChatNameIfCurrent(
      world.id,
      chatId,
      NEW_CHAT_TITLE,
      normalizedPreviousTitle
    );
  } else {
    const persistedChat = await storageWrappers!.loadChatData(world.id, chatId);
    if (persistedChat && isDefaultChatTitle(persistedChat.name)) {
      const updated = await storageWrappers!.updateChatData(world.id, chatId, { name: normalizedPreviousTitle });
      restored = !!updated;
    }
  }

  if (!restored) {
    return;
  }

  const runtimeChat = world.chats.get(chatId);
  if (runtimeChat && isDefaultChatTitle(runtimeChat.name)) {
    runtimeChat.name = normalizedPreviousTitle;
  }
}

async function syncRuntimeAgentMemoryFromStorage(world: World, worldId: string): Promise<void> {
  if (!world?.agents || world.agents.size === 0) return;
  if (typeof (storageWrappers as any)?.loadAgent !== 'function') return;

  for (const runtimeAgent of world.agents.values()) {
    const persistedAgent = await storageWrappers!.loadAgent(worldId, runtimeAgent.id);
    runtimeAgent.memory = Array.isArray(persistedAgent?.memory)
      ? [...persistedAgent!.memory]
      : [];
  }
}

/**
 * Resolve a world identifier to the persisted world ID.
 * Accepts either world ID or world name and supports historical rename drift.
 */
async function resolveWorldIdentifier(worldIdOrName: string): Promise<string | null> {
  const normalizedInput = utils.toKebabCase(worldIdOrName);
  if (!normalizedInput) return null;

  // Fast path: direct normalized ID lookup
  const directWorld = await storageWrappers!.loadWorld(normalizedInput);
  if (directWorld?.id) {
    return directWorld.id;
  }

  // Fallback: scan worlds and match by normalized ID or normalized name
  const worlds = await storageWrappers!.listWorlds();
  const matched = worlds.find((world: World) => {
    const storedId = String(world.id || '');
    const storedName = String(world.name || '');

    return (
      storedId === worldIdOrName ||
      storedName === worldIdOrName ||
      utils.toKebabCase(storedId) === normalizedInput ||
      utils.toKebabCase(storedName) === normalizedInput
    );
  });

  return matched?.id || null;
}

async function getResolvedWorldId(worldIdOrName: string): Promise<string> {
  const resolved = await resolveWorldIdentifier(worldIdOrName);
  return resolved || utils.toKebabCase(worldIdOrName);
}

/**
 * Resolve an agent identifier to the persisted agent ID within a world.
 * Accepts either agent ID or agent name and supports historical rename drift.
 */
async function resolveAgentIdentifier(worldIdOrName: string, agentIdOrName: string): Promise<string | null> {
  const resolvedWorldId = await getResolvedWorldId(worldIdOrName);
  const normalizedInput = utils.toKebabCase(agentIdOrName);
  if (!normalizedInput) return null;

  // Fast path: direct normalized ID lookup
  const directAgent = await storageWrappers!.loadAgent(resolvedWorldId, normalizedInput);
  if (directAgent?.id) {
    return directAgent.id;
  }

  // Fallback: scan agents and match by normalized ID or normalized name
  const agents = await storageWrappers!.listAgents(resolvedWorldId);
  const matched = agents.find((agent: Agent) => {
    const storedId = String(agent.id || '');
    const storedName = String(agent.name || '');

    return (
      storedId === agentIdOrName ||
      storedName === agentIdOrName ||
      utils.toKebabCase(storedId) === normalizedInput ||
      utils.toKebabCase(storedName) === normalizedInput
    );
  });

  return matched?.id || null;
}

async function getResolvedAgentId(worldIdOrName: string, agentIdOrName: string): Promise<string> {
  const resolved = await resolveAgentIdentifier(worldIdOrName, agentIdOrName);
  return resolved || utils.toKebabCase(agentIdOrName);
}

/**
 * Create new world with configuration and automatically create a new chat
 */
export async function createWorld(params: CreateWorldParams): Promise<World | null> {
  await ensureInitialization();

  const worldId = utils.toKebabCase(params.name);

  const exists = await storageWrappers!.worldExists(worldId);
  if (exists) {
    throw new Error(`World with name '${params.name}' already exists`);
  }

  const worldData: World = {
    id: worldId,
    name: params.name,
    description: params.description,
    turnLimit: params.turnLimit || 5,
    mainAgent: params.mainAgent ? String(params.mainAgent).trim() : null,
    chatLLMProvider: params.chatLLMProvider,
    chatLLMModel: params.chatLLMModel,
    mcpConfig: params.mcpConfig,
    variables: params.variables,
    heartbeatEnabled: params.heartbeatEnabled === true,
    heartbeatInterval: params.heartbeatInterval ? String(params.heartbeatInterval).trim() : null,
    heartbeatPrompt: params.heartbeatPrompt ? String(params.heartbeatPrompt) : null,
    createdAt: new Date(),
    lastUpdated: new Date(),
    totalAgents: 0,
    totalMessages: 0,
    eventEmitter: new EventEmitter(),
    agents: new Map<string, Agent>(),
    chats: new Map<string, Chat>(),
    eventStorage: (storageWrappers as any)?.eventStorage,
  };

  // Setup event persistence
  if (worldData.eventStorage) {
    const { setupEventPersistence, setupWorldActivityListener } = await import('./events/index.js');
    worldData._eventPersistenceCleanup = setupEventPersistence(worldData);
    worldData._activityListenerCleanup = setupWorldActivityListener(worldData);
  }

  await storageWrappers!.saveWorld(worldData);

  // Automatically create a new chat for the world
  const world = await getWorld(worldId);
  if (world) {
    await newChat(worldId);
    return await getWorld(worldId);
  }

  return world;
}

/**
 * Update world configuration
 */
export async function updateWorld(worldId: string, updates: UpdateWorldParams): Promise<World | null> {
  await ensureInitialization();

  const resolvedWorldId = await getResolvedWorldId(worldId);
  const existingData = await storageWrappers!.loadWorld(resolvedWorldId);

  if (!existingData) {
    return null;
  }

  const normalizedUpdates: UpdateWorldParams = {
    ...updates,
    ...(updates.mainAgent !== undefined ? { mainAgent: updates.mainAgent ? String(updates.mainAgent).trim() : null } : {})
  };

  const updatedData: World = {
    ...existingData,
    ...normalizedUpdates,
    lastUpdated: new Date()
  };

  await storageWrappers!.saveWorld(updatedData);
  return getWorld(resolvedWorldId);
}

async function getPersistedCurrentChatId(worldId: string): Promise<string | null> {
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const worldData = await storageWrappers!.loadWorld(resolvedWorldId);
  const chatId = String(worldData?.currentChatId || '').trim();
  return chatId || null;
}

async function setPersistedCurrentChatId(worldId: string, chatId: string | null): Promise<void> {
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const worldData = await storageWrappers!.loadWorld(resolvedWorldId);
  if (!worldData) {
    return;
  }

  const normalizedChatId = String(chatId || '').trim() || null;
  const existingChatId = String(worldData.currentChatId || '').trim() || null;
  if (existingChatId === normalizedChatId) {
    return;
  }

  await storageWrappers!.saveWorld({
    ...worldData,
    currentChatId: normalizedChatId,
    lastUpdated: new Date(),
  });
}

/**
 * Set the raw .env-style variables text for a world
 */
export async function setWorldVariablesText(worldId: string, variablesText: string): Promise<World | null> {
  await ensureInitialization();
  return updateWorld(worldId, { variables: variablesText });
}

/**
 * Get the raw .env-style variables text for a world
 */
export async function getWorldVariablesText(worldId: string): Promise<string> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const world = await storageWrappers!.loadWorld(resolvedWorldId);
  if (!world) {
    return '';
  }
  return typeof world.variables === 'string' ? world.variables : '';
}

/**
 * Get parsed environment map from world variables text
 */
export async function getWorldEnvMap(worldId: string): Promise<Record<string, string>> {
  await ensureInitialization();
  const variablesText = await getWorldVariablesText(worldId);
  return utils.parseEnvText(variablesText);
}

/**
 * Get a single env value from world variables text
 */
export async function getWorldEnvValue(worldId: string, key: string): Promise<string | undefined> {
  await ensureInitialization();
  if (!key) {
    return undefined;
  }
  const envMap = await getWorldEnvMap(worldId);
  return envMap[key];
}

/**
 * Delete world and all associated data
 */
export async function deleteWorld(worldId: string): Promise<boolean> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  // Side-effect-free cleanup path: avoid getWorld() because it can hydrate runtime state.
  const worldData = await storageWrappers!.loadWorld(resolvedWorldId);
  if (worldData?._eventPersistenceCleanup) {
    worldData._eventPersistenceCleanup();
  }
  if (worldData?._activityListenerCleanup) {
    worldData._activityListenerCleanup();
  }

  return await storageWrappers!.deleteWorld(resolvedWorldId);
}

/**
 * Get all world IDs and basic information
 */
export async function listWorlds(): Promise<World[]> {
  await ensureInitialization();

  const allWorldData = await storageWrappers!.listWorlds();

  const worldsWithAgentCount = await Promise.all(
    allWorldData.map(async (data: World) => {
      try {
        const normalizedId = utils.toKebabCase(data.id || data.name || '');
        const agents = await storageWrappers!.listAgents(data.id);
        return { ...data, id: normalizedId || data.id, agentCount: agents.length };
      } catch (error) {
        const normalizedId = utils.toKebabCase(data.id || data.name || '');
        return { ...data, id: normalizedId || data.id, agentCount: 0 };
      }
    })
  );

  return worldsWithAgentCount;
}

/**
 * Get world configuration and create runtime instance, creating a new chat if none exist
 */
export async function getWorld(worldId: string): Promise<World | null> {
  await ensureInitialization();

  const resolvedWorldId = await getResolvedWorldId(worldId);

  logger.debug('getWorldConfig called', {
    originalWorldId: worldId,
    resolvedWorldId
  });

  const worldData = await storageWrappers!.loadWorld(resolvedWorldId);

  logger.debug('loadWorld result', {
    worldFound: !!worldData,
    worldId: worldData?.id,
    worldName: worldData?.name
  });

  if (!worldData) {
    logger.debug('World not found, returning null');
    return null;
  }

  let agents = await storageWrappers!.listAgents(resolvedWorldId);
  let chats = await storageWrappers!.listChats(resolvedWorldId);

  // If there are no chats, create a new one
  if (chats.length === 0) {
    logger.debug('No chats found for world, creating new chat');
    await newChat(resolvedWorldId);
    chats = await storageWrappers!.listChats(resolvedWorldId);
  }

  const world: World = {
    ...worldData,
    eventEmitter: new EventEmitter(),
    agents: new Map(agents.map((agent: Agent) => [agent.id, agent])),
    chats: new Map(chats.map((chat: Chat) => [chat.id, chat])),
    eventStorage: (storageWrappers as any)?.eventStorage,
    _eventPersistenceCleanup: undefined, // Will be set by setupEventPersistence
    _activityListenerCleanup: undefined, // Will be set by setupWorldActivityListener
  };

  // Setup event persistence and activity listener
  if (world.eventStorage) {
    const { setupEventPersistence, setupWorldActivityListener } = await import('./events/index.js');
    world._eventPersistenceCleanup = setupEventPersistence(world);
    world._activityListenerCleanup = setupWorldActivityListener(world);
  }

  // Initialize queued chat set; per-chat seeding deferred to explicit queue operations
  world._queuedChatIds = new Set<string>();

  return world;
}

/**
 * Create new agent with configuration and system prompt
 */
export async function createAgent(
  worldId: string,
  params: CreateAgentParams,
  options: CreateAgentOptions = {},
): Promise<Agent> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  // Check if world is processing to prevent agent creation during concurrent chat sessions
  const { getActiveSubscribedWorld } = await import('./subscription.js');
  const activeSubscribedWorld = getActiveSubscribedWorld(resolvedWorldId);
  const world = activeSubscribedWorld || await getWorld(resolvedWorldId);
  if (world?.isProcessing && !options.allowWhileWorldProcessing) {
    throw new Error('Cannot create agent while world is processing');
  }

  const agentId = params.id || utils.toKebabCase(params.name);

  // Resolve the pending-creates Set (needed in finally regardless of who claimed it).
  const worldPending = pendingAgentCreates.get(resolvedWorldId) ?? new Set<string>();
  if (!pendingAgentCreates.has(resolvedWorldId)) {
    pendingAgentCreates.set(resolvedWorldId, worldPending);
  }

  if (!options.slotAlreadyClaimed) {
    // TOCTOU guard: claim the slot before the async agentExists check.
    // Skipped when the caller already claimed the slot via claimAgentCreationSlot().
    if (worldPending.has(agentId)) {
      throw new Error(`Agent '${agentId}' is already being created`);
    }
    worldPending.add(agentId);
  }

  try {
    const exists = await storageWrappers!.agentExists(resolvedWorldId, agentId);
    if (exists) {
      throw new Error(`Agent with ID '${agentId}' already exists`);
    }

    const now = new Date();
    const agent: Agent = {
      id: agentId,
      name: params.name,
      type: params.type,
      autoReply: params.autoReply ?? true,
      status: 'inactive',
      provider: params.provider,
      model: params.model,
      systemPrompt: params.systemPrompt,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      createdAt: now,
      lastActive: now,
      llmCallCount: 0,
      memory: [],
    };

    await storageWrappers!.saveAgent(resolvedWorldId, agent);

    if (world) {
      world.agents.set(agent.id, agent);
    }

    return agent;
  } finally {
    // Clean up the slot whether it was claimed here or via claimAgentCreationSlot().
    worldPending.delete(agentId);
    if (worldPending.size === 0) {
      pendingAgentCreates.delete(resolvedWorldId);
    }
  }
}

/**
 * Load agent by ID with full configuration and memory
 */
export async function getAgent(worldId: string, agentId: string): Promise<Agent | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const resolvedAgentId = await getResolvedAgentId(resolvedWorldId, agentId);

  const agentData = await storageWrappers!.loadAgent(resolvedWorldId, resolvedAgentId);
  if (!agentData) return null;

  return agentData;
}

/**
 * Update agent configuration and/or memory
 */
export async function updateAgent(worldId: string, agentId: string, updates: UpdateAgentParams): Promise<Agent | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const resolvedAgentId = await getResolvedAgentId(resolvedWorldId, agentId);

  // Check if world is processing to prevent agent modification during concurrent chat sessions
  const { getActiveSubscribedWorld } = await import('./subscription.js');
  const activeSubscribedWorld = getActiveSubscribedWorld(resolvedWorldId);
  const world = activeSubscribedWorld || await getWorld(resolvedWorldId);
  if (world?.isProcessing) {
    throw new Error('Cannot update agent while world is processing');
  }

  const existingAgentData = await storageWrappers!.loadAgent(resolvedWorldId, resolvedAgentId);

  if (!existingAgentData) {
    return null;
  }

  const updatedAgent: Agent = {
    ...existingAgentData,
    name: updates.name || existingAgentData.name,
    type: updates.type || existingAgentData.type,
    autoReply: updates.autoReply !== undefined ? updates.autoReply : (existingAgentData.autoReply ?? true),
    status: updates.status || existingAgentData.status,
    provider: updates.provider || existingAgentData.provider,
    model: updates.model || existingAgentData.model,
    systemPrompt: updates.systemPrompt !== undefined ? updates.systemPrompt : existingAgentData.systemPrompt,
    temperature: updates.temperature !== undefined ? updates.temperature : existingAgentData.temperature,
    maxTokens: updates.maxTokens !== undefined ? updates.maxTokens : existingAgentData.maxTokens,
    lastActive: new Date()
  };

  await storageWrappers!.saveAgent(resolvedWorldId, updatedAgent);

  if (world) {
    const runtimeAgent = world.agents.get(resolvedAgentId);
    if (runtimeAgent) {
      Object.assign(runtimeAgent, updatedAgent);
      world.agents.set(resolvedAgentId, runtimeAgent);
    } else {
      world.agents.set(resolvedAgentId, updatedAgent);
    }
  }

  return updatedAgent;
}

/**
 * Delete agent and all associated data
 */
export async function deleteAgent(worldId: string, agentId: string): Promise<boolean> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const resolvedAgentId = await getResolvedAgentId(resolvedWorldId, agentId);

  // Check if world is processing to prevent agent deletion during concurrent chat sessions
  const { getActiveSubscribedWorld } = await import('./subscription.js');
  const activeSubscribedWorld = getActiveSubscribedWorld(resolvedWorldId);
  const world = activeSubscribedWorld || await getWorld(resolvedWorldId);
  if (world?.isProcessing) {
    throw new Error('Cannot delete agent while world is processing');
  }

  const success = await storageWrappers!.deleteAgent(resolvedWorldId, resolvedAgentId);

  if (success && world) {
    // Remove the agent's message listener BEFORE removing from the agents map
    // to prevent the stale closure from continuing to process messages.
    const unsubscribe = world._agentUnsubscribers?.get(resolvedAgentId);
    if (unsubscribe) {
      unsubscribe();
      world._agentUnsubscribers!.delete(resolvedAgentId);
    }
    world.agents.delete(resolvedAgentId);
  }

  return success;
}

/**
 * Get all agent IDs and basic information
 */
export async function listAgents(worldId: string): Promise<Agent[]> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  return await storageWrappers!.listAgents(resolvedWorldId);
}

/**
 * Add messages to agent memory
 */
export async function updateAgentMemory(worldId: string, agentId: string, messages: AgentMessage[]): Promise<Agent | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const resolvedAgentId = await getResolvedAgentId(resolvedWorldId, agentId);

  // Check if world is processing to prevent memory modification during concurrent chat sessions
  const world = await getWorld(resolvedWorldId);
  if (world?.isProcessing) {
    throw new Error('Cannot update agent memory while world is processing');
  }

  const existingAgentData = await storageWrappers!.loadAgent(resolvedWorldId, resolvedAgentId);

  if (!existingAgentData) {
    return null;
  }

  // Ensure messages have the agentId set
  const messagesWithAgentId = messages.map(msg => ({
    ...msg,
    agentId: resolvedAgentId
  }));

  const updatedAgent: Agent = {
    ...existingAgentData,
    memory: [...existingAgentData.memory, ...messagesWithAgentId],
    lastActive: new Date()
  };

  await storageWrappers!.saveAgentMemory(resolvedWorldId, resolvedAgentId, updatedAgent.memory);
  await storageWrappers!.saveAgent(resolvedWorldId, updatedAgent);
  return updatedAgent;
}

/**
 * Clear agent memory and reset LLM call count
 */
export async function clearAgentMemory(worldId: string, agentId: string): Promise<Agent | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const resolvedAgentId = await getResolvedAgentId(resolvedWorldId, agentId);

  // Check if world is processing to prevent memory clearing during concurrent chat sessions
  const world = await getWorld(resolvedWorldId);
  if (world?.isProcessing) {
    throw new Error('Cannot clear agent memory while world is processing');
  }

  logger.debug('Core clearAgentMemory called', {
    worldId,
    resolvedWorldId,
    originalAgentId: agentId,
    resolvedAgentId
  });

  const existingAgentData = await storageWrappers!.loadAgent(resolvedWorldId, resolvedAgentId);

  logger.debug('loadAgent result', {
    agentFound: !!existingAgentData,
    agentName: existingAgentData?.name,
    memoryLength: existingAgentData?.memory?.length || 0,
    currentLLMCallCount: existingAgentData?.llmCallCount || 0
  });

  if (!existingAgentData) {
    logger.debug('Agent not found on disk, returning null');
    return null;
  }

  if (existingAgentData.memory && existingAgentData.memory.length > 0) {
    try {
      logger.debug('Archiving existing memory');
      await storageWrappers!.archiveMemory(resolvedWorldId, resolvedAgentId, existingAgentData.memory);
      logger.debug('Memory archived successfully');
    } catch (error) {
      logger.error('Failed to archive memory', { resolvedAgentId, error: error instanceof Error ? error.message : error });
    }
  }

  const updatedAgent: Agent = {
    ...existingAgentData,
    memory: [],
    llmCallCount: 0,
    lastActive: new Date()
  };

  logger.debug('Saving cleared memory to disk');

  await storageWrappers!.saveAgentMemory(resolvedWorldId, resolvedAgentId, []);
  await storageWrappers!.saveAgent(resolvedWorldId, updatedAgent);

  logger.debug('Memory and LLM call count cleared and saved successfully', {
    resolvedAgentId,
    newLLMCallCount: updatedAgent.llmCallCount
  });
  return updatedAgent;
}

/**
 * Create new chat data entry with optional world snapshot
 */
async function createChat(worldId: string, params: CreateChatParams): Promise<Chat> {
  await ensureInitialization();

  const chatId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();

  const chatData: Chat = {
    id: chatId,
    worldId,
    name: NEW_CHAT_CONFIG.REUSABLE_CHAT_TITLE,
    description: params.description,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  };

  await storageWrappers!.saveChatData(worldId, chatData);

  const world = await getWorld(worldId);
  if (world) {
    world.chats.set(chatData.id, chatData);
  }

  return chatData;
}

/**
 * Create a new chat and optionally set it as current for a world
 */
export async function newChat(worldId: string): Promise<World | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  const chats = await listChats(resolvedWorldId);
  const existingChat = chats.find(chat => isDefaultChatTitle(chat.name));

  // Only reuse existing "New Chat" if it's empty (has no messages)
  if (existingChat) {
    const messages = await storageWrappers!.getMemory(resolvedWorldId, existingChat.id);
    if (messages.length === 0) {
      await setPersistedCurrentChatId(resolvedWorldId, existingChat.id);
      return await getWorld(resolvedWorldId);
    }
    // If chat has messages, fall through to create a new one
  }

  const chatData = await createChat(resolvedWorldId, {
    name: NEW_CHAT_TITLE,
    captureChat: false
  });
  await setPersistedCurrentChatId(resolvedWorldId, chatData.id);
  return await getWorld(resolvedWorldId);
}

/**
 * Create a branched chat from a source chat up to (and including) the provided message.
 */
export async function branchChatFromMessage(
  worldId: string,
  sourceChatId: string,
  messageId: string
): Promise<{ world: World; newChatId: string; copiedMessageCount: number }> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const normalizedSourceChatId = String(sourceChatId || '').trim();
  const normalizedMessageId = String(messageId || '').trim();

  if (!normalizedSourceChatId) {
    throw new Error('Source chat ID is required.');
  }

  if (!normalizedMessageId) {
    throw new Error('Message ID is required.');
  }

  const sourceChat = await storageWrappers!.loadChatData(resolvedWorldId, normalizedSourceChatId);
  if (!sourceChat) {
    throw new Error(`Source chat not found: ${normalizedSourceChatId}`);
  }

  const sourceMessages = await storageWrappers!.getMemory(resolvedWorldId, normalizedSourceChatId);
  const targetIndex = sourceMessages.findIndex((entry) =>
    String(entry?.messageId || '') === normalizedMessageId &&
    String(entry?.chatId || '') === normalizedSourceChatId
  );

  if (targetIndex < 0) {
    throw new Error(`Message not found in source chat: ${normalizedMessageId}`);
  }

  const targetMessage = sourceMessages[targetIndex];
  const targetRole = String(targetMessage?.role || '').trim().toLowerCase();
  const targetSender = String(targetMessage?.sender || '').trim().toLowerCase();
  const targetContent = String(targetMessage?.content || '').trim().toLowerCase();
  const hasToolCalls = Array.isArray((targetMessage as any)?.tool_calls) && (targetMessage as any).tool_calls.length > 0;
  const hasToolCallId = Boolean((targetMessage as any)?.tool_call_id);
  const hasToolCallStatus = Boolean((targetMessage as any)?.toolCallStatus);
  const isSystemOrToolSender = targetSender === 'system' || targetSender === 'tool';
  const isErrorLikeAssistantMessage = targetContent.startsWith('[error]') || targetContent.startsWith('error:');

  if (
    targetRole !== 'assistant' ||
    isSystemOrToolSender ||
    hasToolCalls ||
    hasToolCallId ||
    hasToolCallStatus ||
    isErrorLikeAssistantMessage
  ) {
    throw new Error('Can only branch from assistant messages.');
  }

  const toEpochMillis = (value: unknown): number => {
    if (value instanceof Date) {
      return value.getTime();
    }
    if (value) {
      const parsed = new Date(String(value)).getTime();
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return Date.now();
  };

  const cutoffTimestamp = toEpochMillis(targetMessage?.createdAt);

  const updatedWorld = await newChat(resolvedWorldId);
  const newChatId = await getPersistedCurrentChatId(resolvedWorldId);
  if (!updatedWorld || !newChatId) {
    throw new Error('Failed to create branch chat.');
  }

  let copiedMessageCount = 0;
  const agents = await listAgents(resolvedWorldId);

  try {
    for (const agent of agents) {
      const loadedAgent = await storageWrappers!.loadAgent(resolvedWorldId, agent.id);
      if (!loadedAgent || !Array.isArray(loadedAgent.memory)) {
        continue;
      }

      const sourceAgentMessages = loadedAgent.memory.filter(
        (entry) => String(entry?.chatId || '') === normalizedSourceChatId
      );
      if (sourceAgentMessages.length === 0) {
        continue;
      }

      const branchMessages: AgentMessage[] = [];
      let reachedTarget = false;

      for (const sourceEntry of sourceAgentMessages) {
        branchMessages.push({
          ...sourceEntry,
          chatId: newChatId
        });
        if (String(sourceEntry?.messageId || '') === normalizedMessageId) {
          reachedTarget = true;
          break;
        }
      }

      const effectiveBranchMessages = reachedTarget
        ? branchMessages
        : sourceAgentMessages
          .filter((entry) => toEpochMillis(entry?.createdAt) <= cutoffTimestamp)
          .map((entry) => ({
            ...entry,
            chatId: newChatId
          }));

      if (effectiveBranchMessages.length === 0) {
        continue;
      }

      copiedMessageCount += effectiveBranchMessages.length;
      await storageWrappers!.saveAgentMemory(
        resolvedWorldId,
        loadedAgent.id,
        [...loadedAgent.memory, ...effectiveBranchMessages]
      );
    }
  } catch (error) {
    try {
      await deleteChat(resolvedWorldId, newChatId);
    } catch (rollbackError) {
      logger.error('Failed to rollback branched chat after copy error', {
        worldId: resolvedWorldId,
        newChatId,
        rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
      });
    }
    throw error;
  }

  return {
    world: updatedWorld,
    newChatId,
    copiedMessageCount
  };
}

export async function listChats(worldId: string): Promise<Chat[]> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  return await storageWrappers!.listChats(resolvedWorldId);
}

export async function updateChat(worldId: string, chatId: string, updates: UpdateChatParams): Promise<Chat | null> {
  await ensureInitialization();

  const resolvedWorldId = await getResolvedWorldId(worldId);
  const chat = await storageWrappers!.updateChatData(resolvedWorldId, chatId, updates);

  if (!chat) {
    return null;
  }

  // When a chat is updated we refresh the cached world representation
  const world = await getWorld(resolvedWorldId);
  if (world && world.chats.has(chatId)) {
    world.chats.set(chatId, {
      ...world.chats.get(chatId)!,
      ...chat
    });
  }

  return chat;
}

export async function deleteChat(worldId: string, chatId: string): Promise<boolean> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  // First, delete all agent memory items associated with this chat
  const deletedMemoryCount = await storageWrappers!.deleteMemoryByChatId(resolvedWorldId, chatId);
  logger.debug('Deleted memory items for chat', { worldId, resolvedWorldId, chatId, deletedMemoryCount });

  const persistedCurrentChatId = await getPersistedCurrentChatId(resolvedWorldId);
  // Get the world to update in-memory chat cache only
  const world = await getWorld(resolvedWorldId);
  const shouldSetNewCurrentChat = persistedCurrentChatId === chatId;

  // Then delete the chat itself
  const chatDeleted = await storageWrappers!.deleteChatData(resolvedWorldId, chatId);

  // Remove from world's in-memory chat map
  if (chatDeleted && world) {
    world.chats.delete(chatId);
  }

  // If this was the current chat, set a fallback current chat
  if (shouldSetNewCurrentChat && chatDeleted) {
    const remainingChats = await storageWrappers!.listChats(resolvedWorldId);
    if (remainingChats.length > 0) {
      // Set the most recently updated chat as current
      const latestChat = remainingChats.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0];
      await setPersistedCurrentChatId(resolvedWorldId, latestChat.id);
    } else {
      // No chats left, create a new one
      logger.debug('No chats remaining after deletion, creating new chat');
      await newChat(resolvedWorldId);
    }
  }

  return chatDeleted;
}

export async function restoreChat(worldId: string, chatId: string): Promise<World | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const restoreStartedAt = Date.now();
  const { getActiveSubscribedWorld } = await import('./subscription.js');

  loggerRestore.debug('Restore chat started', {
    worldId: resolvedWorldId,
    requestedChatId: chatId,
  });

  let world = await getWorld(resolvedWorldId);
  const persistedCurrentChatId = await getPersistedCurrentChatId(resolvedWorldId);
  if (!world) {
    loggerRestore.debug('Restore chat aborted: world missing', {
      worldId: resolvedWorldId,
      requestedChatId: chatId,
    });
    return null;
  }

  if (persistedCurrentChatId === chatId) {
    loggerRestore.debug('Restore chat detected already-current chat', {
      worldId: world.id,
      chatId,
      action: 'sync-memory+resume',
    });
    await syncRuntimeAgentMemoryFromStorage(world, resolvedWorldId);
    loggerRestore.debug('Restore chat memory sync complete', {
      worldId: world.id,
      chatId,
    });
    const memoryForApprovals = await storageWrappers!.getMemory(resolvedWorldId, chatId);
    clearChatSkillApprovals(resolvedWorldId, chatId);
    reconstructSkillApprovalsFromMessages(resolvedWorldId, chatId, Array.isArray(memoryForApprovals) ? memoryForApprovals : []);
    const runtimeWorld = getActiveSubscribedWorld(resolvedWorldId, chatId) || world;
    replayPendingHitlRequests(runtimeWorld, chatId);
    loggerRestore.debug('Restore chat pending HITL replay triggered', {
      worldId: world.id,
      chatId,
    });
    triggerPendingLastMessageResume(runtimeWorld, chatId);
    // Resume queue if it was paused (e.g., after returning to this chat)
    pausedQueues.delete(`${runtimeWorld.id}:${chatId}`);
    triggerPendingQueueResume(runtimeWorld, chatId, { recoverStaleSending: true });
    loggerRestore.debug('Restore chat resume inspection triggered', {
      worldId: world.id,
      chatId,
      elapsedMs: Date.now() - restoreStartedAt,
    });
    return world;
  }

  const runtimeChatExists = world.chats.has(chatId);
  const persistedChatExists = runtimeChatExists
    ? true
    : !!(await storageWrappers!.loadChatData(resolvedWorldId, chatId));

  if (!persistedChatExists) {
    loggerRestore.debug('Restore chat aborted: chat missing', {
      worldId: resolvedWorldId,
      requestedChatId: chatId,
      runtimeChatExists,
    });
    return null;
  }

  // Auto-pause the old chat's queue when switching away (FR-8 safety)
  const previousChatId = persistedCurrentChatId;
  if (previousChatId && previousChatId !== chatId) {
    pausedQueues.add(`${resolvedWorldId}:${previousChatId}`);
    loggerRestore.debug('Auto-paused queue for previous chat on switch', {
      worldId: resolvedWorldId,
      previousChatId,
      newChatId: chatId,
    });
  }

  loggerRestore.debug('Restore chat switching current chat', {
    worldId: resolvedWorldId,
    fromChatId: previousChatId,
    toChatId: chatId,
  });
  await setPersistedCurrentChatId(resolvedWorldId, chatId);
  world = await getWorld(resolvedWorldId);
  if (world) {
    await syncRuntimeAgentMemoryFromStorage(world, resolvedWorldId);
    loggerRestore.debug('Restore chat memory sync complete', {
      worldId: world.id,
      chatId,
    });
    const memoryForApprovals = await storageWrappers!.getMemory(resolvedWorldId, chatId);
    clearChatSkillApprovals(resolvedWorldId, chatId);
    reconstructSkillApprovalsFromMessages(resolvedWorldId, chatId, Array.isArray(memoryForApprovals) ? memoryForApprovals : []);
    const runtimeWorld = getActiveSubscribedWorld(resolvedWorldId, chatId) || world;
    replayPendingHitlRequests(runtimeWorld, chatId);
    loggerRestore.debug('Restore chat pending HITL replay triggered', {
      worldId: world.id,
      chatId,
    });
    triggerPendingLastMessageResume(runtimeWorld, chatId);
    // Clear any auto-pause on the new chat and trigger queue processing
    pausedQueues.delete(`${runtimeWorld.id}:${chatId}`);
    triggerPendingQueueResume(runtimeWorld, chatId, { recoverStaleSending: true });
    loggerRestore.debug('Restore chat resume inspection triggered', {
      worldId: world.id,
      chatId,
      elapsedMs: Date.now() - restoreStartedAt,
    });
  } else {
    loggerRestore.warn('Restore chat update-world returned null', {
      worldId: resolvedWorldId,
      requestedChatId: chatId,
      elapsedMs: Date.now() - restoreStartedAt,
    });
  }

  loggerRestore.debug('Restore chat completed', {
    worldId: resolvedWorldId,
    requestedChatId: chatId,
    restoredCurrentChatId: await getPersistedCurrentChatId(resolvedWorldId),
    elapsedMs: Date.now() - restoreStartedAt,
  });
  return world;
}

export async function activateChatWithSnapshot(worldId: string, chatId: string): Promise<ChatActivationSnapshot | null> {
  const world = await restoreChat(worldId, chatId);
  if (!world) {
    return null;
  }

  const resolvedChatId = String(chatId || '').trim();
  if (!resolvedChatId) {
    return null;
  }

  const memory = await storageWrappers!.getMemory(world.id, resolvedChatId);
  const safeMemory = Array.isArray(memory) ? memory : [];

  // Message-authoritative: pending HITL state is derived from persisted messages only.
  // Runtime pending map serves transport/notification purposes; the snapshot always uses
  // messages as the single source of truth (AD-1, AD-4).
  const hitlPrompts = listPendingHitlPromptEventsFromMessages(safeMemory, resolvedChatId);

  loggerRestore.debug('Activate chat snapshot assembled', {
    worldId: world.id,
    chatId: resolvedChatId,
    memoryCount: safeMemory.length,
    hitlPromptCount: hitlPrompts.length,
  });

  return {
    world,
    chatId: resolvedChatId,
    memory: safeMemory,
    hitlPrompts,
  };
}

export async function getMemory(worldId: string, chatId: string): Promise<AgentMessage[] | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  let world = await getWorld(resolvedWorldId);
  if (!world) {
    return null;
  }

  const resolvedChatId = String(chatId || '').trim();
  if (!resolvedChatId) {
    throw new Error('getMemory: chatId is required.');
  }
  const memory = await storageWrappers!.getMemory(resolvedWorldId, resolvedChatId);

  // Auto-repair legacy memories so downstream clients can rely on messageId without UI fallbacks.
  if (memory.some(message => !message.messageId)) {
    logger.warn('Detected messages without messageId in getMemory; running migration', {
      worldId: resolvedWorldId,
      chatId: resolvedChatId
    });

    await migrateMessageIds(resolvedWorldId);
    return await storageWrappers!.getMemory(resolvedWorldId, resolvedChatId);
  }

  return memory;
}

/**
 * Migrate messages to include messageId for user message edit feature
 * Automatically detects storage type and handles both file and SQL storage
 * Idempotent - safe to run multiple times
 * 
 * @param worldId - World ID to migrate messages for
 * @returns Number of messages migrated
 */
export async function migrateMessageIds(worldId: string): Promise<number> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  let totalMigrated = 0;
  const world = await getWorld(resolvedWorldId);

  if (!world) {
    throw new Error(`World '${worldId}' not found`);
  }

  // Get all agents in the world
  const agents = await listAgents(resolvedWorldId);

  // Get all chats for the world
  const chats = await storageWrappers!.listChats(resolvedWorldId);

  // Migrate messages for each chat
  for (const chat of chats) {
    const chatId = chat.id;

    // Get all memory for this chat
    const memory = await storageWrappers!.getMemory(resolvedWorldId, chatId);

    if (!memory || memory.length === 0) {
      continue;
    }

    // Check which messages need messageId
    let needsMigration = false;
    const updatedMemory: AgentMessage[] = [];

    for (const message of memory) {
      if (!message.messageId) {
        needsMigration = true;
        updatedMemory.push({
          ...message,
          messageId: nanoid(10)
        });
        totalMigrated++;
      } else {
        updatedMemory.push(message);
      }
    }

    // If any messages were updated, save the entire memory back
    if (needsMigration) {
      // For each agent, update their memory with the migrated messages
      for (const agent of agents) {
        const agentMessages = updatedMemory.filter(m => m.agentId === agent.id);
        if (agentMessages.length > 0) {
          await storageWrappers!.saveAgentMemory(resolvedWorldId, agent.id, agentMessages);
        }
      }
    }
  }

  logger.info(`Migrated ${totalMigrated} messages with messageId for world '${resolvedWorldId}'`);
  return totalMigrated;
}

/**
 * Remove a message and all subsequent messages from all agents in a world
 * Used for user message editing feature
 * 
 * @param worldId - World ID
 * @param messageId - ID of the message to remove (and all after it)
 * @param chatId - Chat ID to filter messages
 * @returns RemovalResult with per-agent removal details
 */
export async function removeMessagesFrom(
  worldId: string,
  messageId: string,
  chatId: string
): Promise<RemovalResult> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  const world = await getWorld(resolvedWorldId);
  if (!world) {
    throw new Error(`World '${worldId}' not found`);
  }

  // Get all agents
  const agents = await listAgents(resolvedWorldId);

  // Track results per agent
  const processedAgents: string[] = [];
  const failedAgents: Array<{ agentId: string; error: string }> = [];
  let messagesRemovedTotal = 0;
  let foundTargetInAnyAgent = false;
  let targetTimestampValue: number | null = null;
  const loadedAgentsById = new Map<string, Agent>();

  const toTimestamp = (value: unknown): number => {
    if (value instanceof Date) {
      return value.getTime();
    }

    if (value) {
      const parsed = new Date(value as string).getTime();
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return Date.now();
  };

  // First pass: load each agent and discover the deletion cutoff timestamp
  for (const agent of agents) {
    try {
      const fullAgent = await storageWrappers!.loadAgent(resolvedWorldId, agent.id);
      if (!fullAgent || !fullAgent.memory || fullAgent.memory.length === 0) {
        continue;
      }

      loadedAgentsById.set(agent.id, fullAgent);

      // Find the target message in this chat for global cutoff derivation
      const targetMsg = fullAgent.memory.find(m => m.messageId === messageId && m.chatId === chatId);

      if (targetMsg) {
        foundTargetInAnyAgent = true;
        const candidateTimestamp = toTimestamp(targetMsg.createdAt);
        if (targetTimestampValue === null || candidateTimestamp < targetTimestampValue) {
          targetTimestampValue = candidateTimestamp;
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      failedAgents.push({
        agentId: agent.id,
        error: errorMsg
      });
    }
  }

  if (!foundTargetInAnyAgent || targetTimestampValue === null) {
    const notFoundFailures = agents.length > 0
      ? [
        ...failedAgents,
        { agentId: 'all', error: `Message with ID '${messageId}' not found in chat '${chatId}'` }
      ]
      : failedAgents;

    return {
      success: false,
      messageId,
      totalAgents: agents.length,
      processedAgents,
      failedAgents: notFoundFailures,
      messagesRemovedTotal,
      requiresRetry: false,
      resubmissionStatus: 'skipped',
      newMessageId: undefined
    };
  }

  // Second pass: apply cutoff to all agents in the target chat
  for (const agent of agents) {
    if (failedAgents.some(entry => entry.agentId === agent.id)) {
      continue;
    }

    const fullAgent = loadedAgentsById.get(agent.id);
    if (!fullAgent || !Array.isArray(fullAgent.memory) || fullAgent.memory.length === 0) {
      processedAgents.push(agent.id);
      continue;
    }

    try {
      const messagesToKeep = fullAgent.memory.filter(m => {
        if (m.chatId !== chatId) {
          return true;
        }

        const msgTimestamp = toTimestamp(m.createdAt);
        return msgTimestamp < targetTimestampValue;
      });

      const removedCount = fullAgent.memory.length - messagesToKeep.length;

      if (removedCount === 0) {
        processedAgents.push(agent.id);
        continue;
      }

      await storageWrappers!.saveAgentMemory(resolvedWorldId, agent.id, messagesToKeep);

      messagesRemovedTotal += removedCount;
      processedAgents.push(agent.id);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      failedAgents.push({
        agentId: agent.id,
        error: errorMsg
      });
    }
  }

  logger.info('Message removal completed', {
    messageId,
    success: failedAgents.length === 0,
    totalAgents: agents.length,
    processedAgents: processedAgents.length,
    failedAgents: failedAgents.length,
    messagesRemovedTotal
  });

  return {
    success: failedAgents.length === 0,
    messageId,
    totalAgents: agents.length,
    processedAgents,
    failedAgents,
    messagesRemovedTotal,
    requiresRetry: failedAgents.length > 0,
    resubmissionStatus: 'skipped', // Will be updated by editUserMessage
    newMessageId: undefined
  };
}

/**
 * Edit a user message by removing it and all subsequent messages, then resubmitting with new content
 * Combines removal and resubmission in a single operation with comprehensive error tracking
 * 
 * @param worldId - World ID
 * @param messageId - ID of the message to edit
 * @param newContent - New message content
 * @param chatId - Chat ID for the message
 * @returns RemovalResult with removal and resubmission details
 */
export async function editUserMessage(
  worldId: string,
  messageId: string,
  newContent: string,
  chatId: string,
  targetWorld?: World
): Promise<RemovalResult> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  const { getActiveSubscribedWorld } = await import('./subscription.js');
  const activeSubscribedWorld = getActiveSubscribedWorld(resolvedWorldId, chatId) || targetWorld || null;
  const world = activeSubscribedWorld || await getWorld(resolvedWorldId);
  if (!world) {
    throw new Error(`World '${worldId}' not found`);
  }

  // Always cancel any in-flight or queued LLM work for this chat before
  // resubmitting an edited message. This covers both registered agent
  // processing handles (stopMessageProcessing aborts those) AND title
  // generation calls that go through the global llmQueue without
  // registering in activeProcessingByChat (so hasActiveChatMessageProcessing
  // returns false even when title gen is the active queue item). Leaving the
  // guard would cause the agent's resubmission LLM call to queue behind an
  // active title gen call, producing "no response" until title gen finishes.
  stopMessageProcessing(resolvedWorldId, chatId);

  // Clear cached skill approvals and orphaned HITL requests so the
  // resubmitted message triggers fresh HITL prompts instead of silently
  // reusing stale session-level approvals from the previous processing run.
  clearChatSkillApprovals(resolvedWorldId, chatId);
  clearPendingHitlRequestsForChat(resolvedWorldId, chatId);

  // Step 1: Remove the message and all subsequent messages
  const removalResult = await removeMessagesFrom(resolvedWorldId, messageId, chatId);

  if (!removalResult.success) {
    return removalResult;
  }

  await syncRuntimeAgentMemoryFromStorage(activeSubscribedWorld || world, resolvedWorldId);

  // Step 2: Reset auto-generated chat title so post-resubmission title generation can run again.
  const titleResetResult = await resetAutoGeneratedChatTitleForEditResubmission(world, chatId);

  const worldForResubmission = activeSubscribedWorld || world;

  if (!activeSubscribedWorld) {
    const { subscribeAgentToMessages, subscribeWorldToMessages } = await import('./events/index.js');
    for (const agent of worldForResubmission.agents.values()) {
      subscribeAgentToMessages(worldForResubmission, agent);
    }
    subscribeWorldToMessages(worldForResubmission);
  }

  // Step 3: Attempt resubmission using publishMessage directly
  try {
    const { publishMessage } = await import('./events/index.js');
    const messageEvent = publishMessage(worldForResubmission, newContent, 'human', chatId);

    logger.info(`Resubmitted edited message to world '${resolvedWorldId}' with new messageId '${messageEvent.messageId}'`);

    return {
      ...removalResult,
      resubmissionStatus: 'success',
      newMessageId: messageEvent.messageId
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (titleResetResult.resetApplied) {
      try {
        await rollbackAutoGeneratedChatTitleResetAfterFailedResubmission(
          worldForResubmission,
          chatId,
          titleResetResult.previousTitle
        );
      } catch (rollbackError) {
        logger.warn('Failed to rollback auto-generated title reset after edit resubmission failure', {
          worldId: resolvedWorldId,
          chatId,
          rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
        });
      }
    }
    logger.error(`Failed to resubmit message to world '${resolvedWorldId}': ${errorMsg}`);
    return {
      ...removalResult,
      resubmissionStatus: 'failed',
      resubmissionError: errorMsg
    };
  }
}

/**
 * Log an error from a message edit operation for troubleshooting and retry
 * Stores errors in data/worlds/{worldName}/edit-errors.json
 * Keeps only the last 100 errors
 * 
 * @param worldId - World ID
 * @param errorLog - EditErrorLog to persist
 */
export async function logEditError(worldId: string, errorLog: EditErrorLog): Promise<void> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  const rootPath = getDefaultRootPath();
  const worldDir = getWorldDir(rootPath, resolvedWorldId);
  const errorsFile = path.join(worldDir, 'edit-errors.json');

  try {
    // Read existing errors
    let errors: EditErrorLog[] = [];
    if (fs.existsSync(errorsFile)) {
      const data = fs.readFileSync(errorsFile, 'utf-8');
      errors = JSON.parse(data);
    }

    // Add new error
    errors.push(errorLog);

    // Keep only last 100 errors
    if (errors.length > 100) {
      errors = errors.slice(-100);
    }

    // Write back to file
    fs.writeFileSync(errorsFile, JSON.stringify(errors, null, 2), 'utf-8');
    logger.debug(`Logged edit error for world '${resolvedWorldId}'`);
  } catch (error) {
    logger.error(`Failed to log edit error for world '${resolvedWorldId}': ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Get edit error logs for a world
 * 
 * @param worldId - World ID
 * @returns Array of EditErrorLog entries
 */
export async function getEditErrors(worldId: string): Promise<EditErrorLog[]> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  const rootPath = getDefaultRootPath();
  const worldDir = getWorldDir(rootPath, resolvedWorldId);
  const errorsFile = path.join(worldDir, 'edit-errors.json');

  try {
    if (!fs.existsSync(errorsFile)) {
      return [];
    }

    const data = fs.readFileSync(errorsFile, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    logger.error(`Failed to read edit errors for world '${resolvedWorldId}': ${error instanceof Error ? error.message : error}`);
    return [];
  }
}

// ─── Queue Management Public API ─────────────────────────────────────────────

/**
 * Add a message to the queue for a chat. Returns the created QueuedMessage or null.
 */
export async function addToQueue(
  worldId: string,
  chatId: string,
  content: string,
  sender: string,
  options?: {
    triggerProcessing?: boolean;
    targetWorld?: World | null;
    source?: 'direct' | 'queue' | 'retry';
    preassignedMessageId?: string;
  }
): Promise<QueuedMessage | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const queueStorage = getQueueStorageOrThrow('addToQueue');

  const messageId = String(options?.preassignedMessageId || '').trim() || `msg-${Date.now()}-${nanoid(6)}`;
  await queueStorage.addQueuedMessage(resolvedWorldId, chatId, messageId, content.trim(), sender || 'human');

  const messages = await queueStorage.getQueuedMessages(resolvedWorldId, chatId);
  const queuedMessage = messages?.find((m: QueuedMessage) => m.messageId === messageId) ?? null;
  if (!queuedMessage) {
    throw new Error(`addToQueue: failed to persist queue row for message '${messageId}'.`);
  }

  // Always look up the runtime world so we can update the _queuedChatIds cache
  const { getActiveSubscribedWorld } = await import('./subscription.js');
  const runtimeWorld =
    getActiveSubscribedWorld(resolvedWorldId, chatId) ||
    options?.targetWorld ||
    await getWorld(resolvedWorldId);
  if (runtimeWorld) {
    if (!runtimeWorld._queuedChatIds) runtimeWorld._queuedChatIds = new Set();
    runtimeWorld._queuedChatIds.add(chatId);
    if (options?.triggerProcessing ?? true) {
      triggerPendingQueueResume(runtimeWorld, chatId);
    }
  }

  return queuedMessage;
}

/**
 * Runtime-start recovery hook.
 * Resets interrupted `sending` queue rows back to `queued`.
 */
export async function recoverQueueSendingMessages(): Promise<number> {
  await ensureInitialization();
  return await storageWrappers?.recoverSendingMessages?.() ?? 0;
}

function isUserQueueSender(sender: string): boolean {
  const normalized = String(sender || '').trim().toLowerCase();
  return normalized === 'human' || normalized.startsWith('user');
}

/**
 * External user-send ingress helper.
 * Keeps queue-backed dispatch semantics for user messages while preserving
 * immediate internal publish behavior for assistant/tool/system paths.
 */
export async function enqueueAndProcessUserMessage(
  worldId: string,
  chatId: string,
  content: string,
  sender: string,
  targetWorld?: World | null,
  options?: {
    source?: 'direct' | 'queue' | 'retry';
    preassignedMessageId?: string;
  }
): Promise<QueuedMessage | null> {
  const targetChatId = String(chatId || '').trim();
  if (!targetChatId) {
    throw new Error('enqueueAndProcessUserMessage: chatId is required for user message dispatch.');
  }

  if (!isUserQueueSender(sender)) {
    const resolvedWorldId = await getResolvedWorldId(worldId);
    const { getActiveSubscribedWorld } = await import('./subscription.js');
    const runtimeWorld =
      getActiveSubscribedWorld(resolvedWorldId, targetChatId) ||
      targetWorld ||
      await getWorld(resolvedWorldId);
    if (!runtimeWorld) {
      throw new Error(`enqueueAndProcessUserMessage: world not found for immediate dispatch (${resolvedWorldId}).`);
    }
    const { publishMessage, publishMessageWithId } = await import('./events/index.js');
    const forcedMessageId = String(options?.preassignedMessageId || '').trim();
    if (forcedMessageId) {
      publishMessageWithId(runtimeWorld, content, sender, forcedMessageId, targetChatId);
    } else {
      publishMessage(runtimeWorld, content, sender, targetChatId);
    }
    return null;
  }

  return addToQueue(worldId, targetChatId, content, sender, {
    triggerProcessing: true,
    targetWorld,
    source: options?.source,
    preassignedMessageId: options?.preassignedMessageId,
  });
}

/**
 * Return all queue messages (queued, sending, error) for a chat.
 */
export async function getQueueMessages(worldId: string, chatId: string): Promise<QueuedMessage[]> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  if (!storageWrappers?.getQueuedMessages) return [];
  return storageWrappers.getQueuedMessages(resolvedWorldId, chatId);
}

/**
 * Remove a specific message from the queue by messageId.
 */
export async function removeFromQueue(worldId: string, messageId: string): Promise<void> {
  await ensureInitialization();
  await storageWrappers?.removeQueuedMessage?.(messageId);
}

/**
 * Pause queue processing for a chat. Current in-flight message completes normally.
 */
export async function pauseChatQueue(worldId: string, chatId: string): Promise<void> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  pausedQueues.add(`${resolvedWorldId}:${chatId}`);
  loggerQueue.debug('Queue paused by user', { worldId: resolvedWorldId, chatId });
}

/**
 * Resume queue processing for a chat. Clears the pause flag and triggers the next item.
 */
export async function resumeChatQueue(worldId: string, chatId: string): Promise<void> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  pausedQueues.delete(`${resolvedWorldId}:${chatId}`);

  const { getActiveSubscribedWorld } = await import('./subscription.js');
  const world = getActiveSubscribedWorld(resolvedWorldId, chatId) || await getWorld(resolvedWorldId);
  if (world) {
    triggerPendingQueueResume(world, chatId, { recoverStaleSending: true });
  }
  loggerQueue.debug('Queue resumed by user', { worldId: resolvedWorldId, chatId });
}

/**
 * Stop queue processing: cancel remaining queued messages and set pause flag.
 * The current in-flight message completes normally.
 */
export async function stopChatQueue(worldId: string, chatId: string): Promise<void> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  // Cancel all remaining 'queued' rows
  await storageWrappers?.cancelQueuedMessages?.(resolvedWorldId, chatId);

  // Prevent any follow-up trigger
  pausedQueues.add(`${resolvedWorldId}:${chatId}`);

  // Update queued chat ID cache
  const { getActiveSubscribedWorld: getWorldForStop } = await import('./subscription.js');
  getWorldForStop(resolvedWorldId, chatId)?._queuedChatIds?.delete(chatId);

  loggerQueue.debug('Queue stopped by user', { worldId: resolvedWorldId, chatId });
}

/**
 * Clear the entire queue for a chat (removes all queue rows including cancelled/error).
 */
export async function clearChatQueue(worldId: string, chatId: string): Promise<void> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  await storageWrappers?.deleteQueueForChat?.(resolvedWorldId, chatId);
  pausedQueues.delete(`${resolvedWorldId}:${chatId}`);

  // Update queued chat ID cache
  const { getActiveSubscribedWorld: getWorldForClear } = await import('./subscription.js');
  getWorldForClear(resolvedWorldId, chatId)?._queuedChatIds?.delete(chatId);
}

/**
 * Reset a failed queue message (status='error') back to 'queued' with retry_count=0,
 * then trigger queue processing. Allows the user to manually retry after automatic
 * retries have been exhausted.
 */
export async function retryQueueMessage(worldId: string, messageId: string, chatId: string): Promise<void> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  if (!storageWrappers?.resetQueueMessageForRetry) return;
  // Reset status to 'queued' and retry_count to 0 so automatic retry logic applies fresh
  await storageWrappers.resetQueueMessageForRetry(messageId);
  const { getActiveSubscribedWorld } = await import('./subscription.js');
  const world = getActiveSubscribedWorld(resolvedWorldId, chatId) || await getWorld(resolvedWorldId);
  if (!world) return;
  triggerPendingQueueResume(world, chatId);
}
